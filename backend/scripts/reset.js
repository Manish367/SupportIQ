// Deletes ALL tickets (demo data). Usage: node scripts/reset.js
import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGODB_URI);
const r = await mongoose.connection.collection("tickets").deleteMany({});
console.log("Deleted", r.deletedCount, "tickets");
process.exit(0);
