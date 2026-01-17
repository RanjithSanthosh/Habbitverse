import mongoose from "mongoose";
import MessageLog from "./src/models/MessageLog";
import Reminder from "./src/models/Reminder";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

async function checkLogs() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fs.writeFileSync("debug_result.json", JSON.stringify({ error: "No URI" }));
    return;
  }

  await mongoose.connect(uri);

  const logs = await MessageLog.find().sort({ createdAt: -1 }).limit(5);
  const notifications = await Reminder.find({ isActive: true });

  const output = {
    logs,
    notifications,
  };

  fs.writeFileSync("debug_result.json", JSON.stringify(output, null, 2));

  await mongoose.disconnect();
}

checkLogs();
