import { useState } from "react";
import { Link } from "react-router-dom";
import { api, CATS, pct } from "../api.js";
import Tilt from "../components/Tilt.jsx";
export default function CreateTicket() {
  const [f, setF] = useState({
      subject: "",
      description: "",
      priority: "auto",
    }),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [res, setRes] = useState(null);
  const submit = async () => {
    setErr("");
    setRes(null);
    setBusy(true);
    try {
      setRes(await api.create(f));
      setF({ subject: "", description: "", priority: "auto" });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const p = res?.prediction;
  return (
    <div className="main wide scroll">
      <div className="grid-two">
        <Tilt max={3}>
          <h1 className="lift">New ticket</h1>
          <label className="form-label" htmlFor="s">
            Subject
          </label>
          <input
            id="s"
            className="form-control"
            maxLength={200}
            value={f.subject}
            onChange={(e) => setF({ ...f, subject: e.target.value })}
          />
          <label className="form-label mt-3" htmlFor="d">
            What’s happening?
          </label>
          <textarea
            id="d"
            className="form-control"
            rows={6}
            maxLength={3000}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
          <label className="form-label mt-3" htmlFor="p">
            Priority
          </label>
          <select
            id="p"
            className="form-select"
            value={f.priority}
            onChange={(e) => setF({ ...f, priority: e.target.value })}
          >
            <option value="auto">Let the model decide</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {err && (
            <div className="err mt-3" role="alert">
              {err}
            </div>
          )}
          <button
            className="btn-glow mt-4"
            onClick={submit}
            disabled={
              busy ||
              f.subject.trim().length < 3 ||
              f.description.trim().length < 10
            }
          >
            {busy ? "Predicting category…" : "Create ticket"}
          </button>
        </Tilt>
        <Tilt max={5} className="result">
          <h2 className="lift">Prediction</h2>
          {!res && !busy && (
            <p className="muted">
              Create a ticket to see the predicted category and how confident
              the model is.
            </p>
          )}
          {busy && <p className="muted">Calling the model…</p>}
          {res &&
            (p?.modelAvailable === false ? (
              <p className="err">
                Ticket saved, but the prediction service didn’t respond. It was
                added to the review queue.
              </p>
            ) : (
              <div className="lift2">
                <div className="big">{CATS[p.category]}</div>
                <div
                  className="meter"
                  role="img"
                  aria-label={`Confidence ${pct(p.confidence)}`}
                >
                  <div style={{ width: pct(p.confidence) }} />
                </div>
                <p>Confidence {pct(p.confidence)}</p>
                {res.priority && (
                  <p>
                    Priority: <b>{res.priority}</b>{" "}
                    {res.prioritySource === "model"
                      ? `(predicted by the model, ${pct(p.priorityConfidence)} confident)`
                      : "(set by you)"}
                  </p>
                )}
                {p.needsReview && (
                  <p className="warn">
                    {p.outOfDistribution
                      ? "This ticket looks unlike the training data, so an agent should check it."
                      : "Confidence is below the review threshold, so an agent should check it."}
                  </p>
                )}
                <p className="muted small">
                  Other candidates:{" "}
                  {p.alternatives
                    .slice(1)
                    .map((a) => `${CATS[a.category]} ${pct(a.confidence)}`)
                    .join(", ")}
                </p>
                <Link to="/tickets">View all tickets</Link>
              </div>
            ))}
        </Tilt>
      </div>
    </div>
  );
}
