import mongoose from "mongoose";
import Reminder from "./src/models/Reminder";
import ReminderExecution from "./src/models/ReminderExecution";
import MessageLog from "./src/models/MessageLog";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: ".env.local" });

// Helper: Get Current Time in IST (HH:MM)
const getISTTime = () => {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
};

// Helper: Get Today's Date in IST (YYYY-MM-DD)
const getISTDate = () => {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
};

// Helper: Convert "HH:MM" to minutes from midnight
const getMinutesFromMidnight = (timeStr: string) => {
  if (!timeStr) return -1;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

async function debugCron() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("No MONGODB_URI found");
    return;
  }

  console.log("Connecting to DB...");
  await mongoose.connect(uri);

  const nowTimeStr = getISTTime();
  const todayDateStr = getISTDate();
  const nowMinutes = getMinutesFromMidnight(nowTimeStr);

  console.log(`Debug Run: ${todayDateStr} ${nowTimeStr} (${nowMinutes}m)`);

  const allExecutions = await ReminderExecution.find({ date: todayDateStr });
  const recentLogs = await MessageLog.find().sort({ createdAt: -1 }).limit(5);

  const output: any = {
    meta: {
      nowTimeStr,
      todayDateStr,
      nowMinutes,
    },
    executions: allExecutions.map((e) => ({
      id: e._id,
      reminderId: e.reminderId,
      status: e.status,
      phone: e.phone,
      sentAt: e.sentAt,
      followUpStatus: e.followUpStatus,
    })),
    recentLogs: recentLogs.map((l) => ({
      id: l._id,
      phone: l.phone,
      type: l.messageType,
      status: l.status,
      createdAt: l.createdAt,
      error: l.rawResponse,
    })),
    remindersCheck: [],
    followUps: [],
  };

  try {
    const activeReminders = await Reminder.find({ isActive: true });

    for (const reminder of activeReminders) {
      const check: any = {
        id: reminder._id,
        title: reminder.title,
        phone: reminder.phone,
        reminderTime: reminder.reminderTime,
      };

      const existingExecution = await ReminderExecution.findOne({
        reminderId: reminder._id,
        date: todayDateStr,
      });

      if (existingExecution) {
        check.result = "SKIP - Execution Exists";
        check.existingStatus = existingExecution.status;
        check.executionId = existingExecution._id;
      } else {
        const reminderMinutes = getMinutesFromMidnight(reminder.reminderTime);
        check.reminderMinutes = reminderMinutes;
        check.nowMinutes = nowMinutes;

        if (nowMinutes >= reminderMinutes) {
          check.result = "SEND - Condition Met";
        } else {
          check.result = "WAIT - Too Early";
        }
      }
      output.remindersCheck.push(check);
    }

    const pendingFollowUps = await ReminderExecution.find({
      date: todayDateStr,
      status: "sent",
      followUpStatus: "pending",
    }).populate("reminderId");

    output.followUps = pendingFollowUps.map((e) => {
      const config = e.reminderId as any;
      if (!config) return { id: e._id, error: "Missing Config" };

      const followUpMinutes = getMinutesFromMidnight(config.followUpTime);
      return {
        id: e._id,
        phone: e.phone,
        followUpTime: config.followUpTime,
        followUpMinutes,
        nowMinutes,
        condition: nowMinutes >= followUpMinutes ? "SEND" : "WAIT",
      };
    });

    fs.writeFileSync("debug_result.json", JSON.stringify(output, null, 2));
    console.log("Wrote result to debug_result.json");
  } catch (err) {
    console.error("Debug Error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

debugCron();
