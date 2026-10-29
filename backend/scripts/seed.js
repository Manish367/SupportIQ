// Posts demo tickets through the API so predictions are real. Usage: API=http://localhost:4000 npm run seed
const API = process.env.API || "http://localhost:4000";
const demo = [
  [
    "Orders not syncing",
    "New orders are not syncing to the scheduling system since this morning.",
  ],
  [
    "Route planner missing jobs",
    "The route planner is missing new jobs we created in the last hour.",
  ],
  [
    "Work orders not arriving",
    "Work orders are not reaching the dispatcher, nothing shows up.",
  ],
  [
    "Charged twice",
    "I was charged twice for my subscription this month, please refund.",
  ],
  [
    "Cannot log in",
    "I cannot log in to my account and the password reset email never arrives.",
  ],
  [
    "Dark mode",
    "Would love dark mode support in the dashboard, please consider it.",
  ],
  [
    "Export crashes",
    "The page crashes when I click export on the reports screen.",
  ],
];
for (const [subject, description] of demo) {
  const r = await fetch(API + "/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, description }),
  });
  console.log(r.status, subject);
}
