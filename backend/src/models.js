import mongoose from "mongoose";
export const CATEGORIES = [
  "billing",
  "account_access",
  "integration_sync",
  "bug_report",
  "feature_request",
];
const ticketSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, maxlength: 200, trim: true },
    description: { type: String, required: true, maxlength: 3000, trim: true },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    }, // user-set; no reliable labels to predict it yet
    prediction: {
      category: String,
      confidence: Number,
      needsReview: Boolean,
      outOfDistribution: Boolean,
      alternatives: Array,
      priority: String,
      priorityConfidence: Number,
      priority: String,
      priorityConfidence: Number,
      modelAvailable: { type: Boolean, default: true },
    },
    category: { type: String, default: null, index: true }, // final category (prediction unless corrected)
    correction: { from: String, to: String, at: Date }, // verified human correction, feeds retraining
    reviewed: { type: Boolean, default: false },
    prioritySource: { type: String, enum: ["user", "model"], default: "user" },
  },
  { timestamps: true },
);

ticketSchema.index({ subject: "text", description: "text" });
export const Ticket = mongoose.model("Ticket", ticketSchema);
