import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { Ticket } from "./models.js";
import { predict, findIncidents, mlHealth } from "./ml.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: (process.env.CORS_ORIGIN || "").split(",") }));
app.use(express.json({ limit: "20kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120 }));
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res
      .status(500)
      .json({ error: "Something went wrong on our side. Try again." });
  });
const validId = (id) => mongoose.isValidObjectId(id);
let mlClasses = [];
const getCats = async () => {
  if (!mlClasses.length) {
    try {
      mlClasses = (await mlHealth()).classes || [];
    } catch {}
  }
  return mlClasses.length
    ? mlClasses
    : (await Ticket.distinct("category")).filter(Boolean).sort();
};
app.get(
  "/api/categories",
  wrap(async (_q, res) => res.json({ categories: await getCats() })),
);

app.get(
  "/api/health",
  wrap(async (_q, res) => {
    let ml = "down";
    try {
      await mlHealth();
      ml = "ok";
    } catch {}
    res.json({
      api: "ok",
      db: mongoose.connection.readyState === 1 ? "ok" : "down",
      ml,
    });
  }),
);

app.post(
  "/api/tickets",
  wrap(async (req, res) => {
    const { subject, description, priority } = req.body || {};
    if (
      typeof subject !== "string" ||
      subject.trim().length < 3 ||
      subject.length > 200
    )
      return res
        .status(400)
        .json({ error: "Subject must be 3–200 characters." });
    if (
      typeof description !== "string" ||
      description.trim().length < 10 ||
      description.length > 3000
    )
      return res
        .status(400)
        .json({ error: "Description must be 10–3000 characters." });
    const ticket = new Ticket({
      subject,
      description,
      priority: ["low", "medium", "high"].includes(priority)
        ? priority
        : "medium",
    });
    try {
      const p = await predict(`${subject}. ${description}`);
      ticket.prediction = p;
      ticket.category = p.category;
      if (!["low", "medium", "high"].includes(priority) && p.priority) {
        ticket.priority = p.priority;
        ticket.prioritySource = "model";
      }
    } catch (e) {
      // degrade gracefully: ticket is still saved and lands in the review queue
      console.error("ML unavailable:", e.message);
      ticket.prediction = { needsReview: true, modelAvailable: false };
    }
    await ticket.save();
    res.status(201).json(ticket);
  }),
);

app.get(
  "/api/tickets",
  wrap(async (req, res) => {
    const { q, category, status, review, priority } = req.query;
    const f = {};
    if (["low", "medium", "high"].includes(priority)) f.priority = priority;
    if (q)
      f.subject = {
        $regex: String(q)
          .slice(0, 80)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    if (typeof category === "string" && category) f.category = category;
    if (["open", "in_progress", "resolved"].includes(status)) f.status = status;
    if (review === "true") {
      f["prediction.needsReview"] = true;
      f.reviewed = false;
    }
    res.json(await Ticket.find(f).sort({ createdAt: -1 }).limit(200));
  }),
);

app.get(
  "/api/tickets/:id",
  wrap(async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid ticket id." });
    const t = await Ticket.findById(req.params.id);
    t ? res.json(t) : res.status(404).json({ error: "Ticket not found." });
  }),
);

app.patch(
  "/api/tickets/:id",
  wrap(async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ error: "Invalid ticket id." });
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found." });
    const { status, category, priority, confirm } = req.body || {};
    if (status) {
      if (!["open", "in_progress", "resolved"].includes(status))
        return res.status(400).json({ error: "Invalid status." });
      t.status = status;
    }
    if (priority) {
      if (!["low", "medium", "high"].includes(priority))
        return res.status(400).json({ error: "Invalid priority." });
      t.priority = priority;
      t.prioritySource = "user";
    }
    if (category) {
      if (!(await getCats()).includes(category))
        return res.status(400).json({ error: "Unknown category." });
      if (category !== t.category)
        t.correction = { from: t.category, to: category, at: new Date() };
      t.category = category;
      t.reviewed = true;
    }
    if (confirm) t.reviewed = true;
    await t.save();
    res.json(t);
  }),
);

app.get(
  "/api/analytics",
  wrap(async (_q, res) => {
    const [total, open, byCat, byPri, byStatus, review, corrected, recent] =
      await Promise.all([
        Ticket.countDocuments(),
        Ticket.countDocuments({ status: { $ne: "resolved" } }),
        Ticket.aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ]),
        Ticket.aggregate([
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
        Ticket.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        Ticket.countDocuments({
          "prediction.needsReview": true,
          reviewed: false,
        }),
        Ticket.countDocuments({ correction: { $exists: true, $ne: null } }),
        Ticket.find().sort({ createdAt: -1 }).limit(5),
      ]);
    const m = (a) =>
      a.map((x) => ({ name: x._id || "uncategorized", count: x.count }));
    res.json({
      total,
      open,
      reviewQueue: review,
      corrections: corrected,
      byCategory: m(byCat),
      byPriority: m(byPri),
      byStatus: m(byStatus),
      recent,
    });
  }),
);

// Incident Radar: candidate shared incidents = similar tickets, enough volume, within a time window. Agent validates; no root-cause claim.
app.get(
  "/api/incidents",
  wrap(async (_q, res) => {
    const hrs = Number(process.env.INCIDENT_WINDOW_HOURS || 24),
      min = Number(process.env.INCIDENT_MIN_TICKETS || 3);
    const since = new Date(Date.now() - hrs * 3600_000);
    const ts = await Ticket.find({
      createdAt: { $gte: since },
      status: { $ne: "resolved" },
    })
      .sort({ createdAt: 1 })
      .limit(300);
    if (ts.length < min)
      return res.json({ windowHours: hrs, minTickets: min, incidents: [] });
    let r;
    try {
      r = await findIncidents(
        ts.map((t) => ({
          id: String(t._id),
          text: `${t.subject}. ${t.description}`,
          createdAt: t.createdAt.toISOString(),
        })),
      );
    } catch {
      return res.status(503).json({
        error:
          "Incident detection is unavailable because the ML service did not respond.",
      });
    }
    const byId = Object.fromEntries(ts.map((t) => [String(t._id), t]));
    const incidents = r.clusters
      .filter((c) => c.size >= min)
      .map((c) => {
        const span = Math.max(
          (new Date(c.lastReport) - new Date(c.firstReport)) / 60000,
          1,
        );
        return {
          ...c,
          minutesSpan: Math.round(span),
          ratePerHour: +(c.size / (span / 60)).toFixed(1),
          tickets: c.ticketIds.map((id) => ({
            id,
            subject: byId[id].subject,
            createdAt: byId[id].createdAt,
            category: byId[id].category,
          })),
        };
      });
    res.json({ windowHours: hrs, minTickets: min, incidents });
  }),
);

// Verified corrections -> JSON for `python train.py --feedback feedback.json`
app.get(
  "/api/feedback",
  wrap(async (_q, res) => {
    const ts = await Ticket.find({ "correction.to": { $exists: true } });
    res.json(
      ts.map((t) => ({
        text: `${t.subject}. ${t.description}`,
        category: t.correction.to,
      })),
    );
  }),
);

const port = process.env.PORT || 4000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => app.listen(port, () => console.log("MongoDb Connected. API running on PORT", port)))
  .catch((e) => {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  });
