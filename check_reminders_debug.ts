import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

const ReminderSchema = new mongoose.Schema(
  {
    phone: String,
    message: String,
    reminderTime: String,
    isActive: Boolean,
    lastSentAt: Date,
    followUpSent: Boolean,
    dailyStatus: String,
  },
  { strict: false }
);

const Reminder =
  mongoose.models.Reminder || mongoose.model("Reminder", ReminderSchema);

async function main() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(MONGODB_URI);

    const nowIST = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });
    console.log(`Current Server/Local IST Time: ${nowIST}`);

    const reminders = await Reminder.find({});
    console.log(`Found ${reminders.length} reminders.`);

    reminders.forEach((r) => {
      console.log("------------------------------------------------");
      console.log(`ID: ${r._id}`);
      console.log(`Phone: ${r.phone}`);
      console.log(
        `Request Time: ${r.reminderTime} (Type: ${typeof r.reminderTime})`
      );
      console.log(`Is Active: ${r.isActive}`);
      console.log(`Last Sent: ${r.lastSentAt}`);

      // Simulation Logic
      if (!r.isActive) {
        console.log(`[SKIP] Inactive`);
        return;
      }

      if (r.lastSentAt) {
        const istNowDate = new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        });
        const lastSentDate = new Date(r.lastSentAt).toLocaleDateString(
          "en-CA",
          { timeZone: "Asia/Kolkata" }
        );
        if (istNowDate === lastSentDate) {
          console.log(`[SKIP] Already sent today (${lastSentDate})`);
          return;
        }
      }

      if (nowIST >= r.reminderTime) {
        console.log(`[MATCH] Condition met! (${nowIST} >= ${r.reminderTime})`);
      } else {
        console.log(`[WAIT] Not time yet (${nowIST} < ${r.reminderTime})`);
      }
    });
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

main();
