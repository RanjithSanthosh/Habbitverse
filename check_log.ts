import mongoose from "mongoose";
import MessageLog from "./src/models/MessageLog";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config({ path: ".env.local" });

async function checkLastLog() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const log = await MessageLog.findOne().sort({ createdAt: -1 });
  fs.writeFileSync("log_debug.json", JSON.stringify(log, null, 2));
  await mongoose.disconnect();
}
checkLastLog();
