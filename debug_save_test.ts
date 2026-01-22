import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Reminder from "./src/models/Reminder";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

async function main() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(MONGODB_URI);

    console.log("Fetching one active reminder...");
    const reminder = await Reminder.findOne({ isActive: true });

    if (!reminder) {
      console.log("No active reminder found to test.");
      return;
    }

    console.log(`Found reminder: ${reminder._id}`);
    console.log("Current Data:", JSON.stringify(reminder, null, 2));

    console.log("Attempting to update and save...");

    // Simulate the update logic in cron
    reminder.lastSentAt = new Date();
    reminder.followUpSent = false;
    reminder.dailyStatus = "sent";
    // reminder.replyText = undefined; // Mongoose might prefer null or delete
    // reminder.lastRepliedAt = undefined;

    // Try setting undefined explicitly if that was the code
    reminder.set("replyText", undefined);
    reminder.set("lastRepliedAt", undefined);

    await reminder.save();
    console.log("Save successful!");
  } catch (error) {
    console.error("SAVE PROMISE REJECTED!");
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

main();
