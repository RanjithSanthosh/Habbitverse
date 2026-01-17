import mongoose from "mongoose";
import Reminder from "./src/models/Reminder";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function checkSpecificReminder() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const r = await Reminder.findById("696bc25454d2b47b8f0bfee8");
  console.log("Reminder Phone:", r?.phone);
  await mongoose.disconnect();
}
checkSpecificReminder();
