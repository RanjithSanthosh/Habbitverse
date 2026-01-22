import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import MessageLog from "@/models/MessageLog";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// Helper: Get Current Time in IST (HH:MM)
const getISTTime = () => {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
};

// Helper: Check if a date occurred Today (IST)
const isTodayIST = (paramsDate?: Date) => {
  if (!paramsDate) return false;

  // Convert both to IST strings for date comparison YYYY-MM-DD
  const istNow = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }); // YYYY-MM-DD
  const istParam = new Date(paramsDate).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  return istNow === istParam;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await dbConnect();

  // We get current time in IST
  const nowTimeStr = getISTTime();

  console.log(`[Cron] Running at IST: ${nowTimeStr}`);

  // --- 1. Process REMINDERS ---
  // We fetch ALL active reminders to check if they are due (Catch-up logic)
  const activeReminders = await Reminder.find({ isActive: true });

  const results = [];

  for (const reminder of activeReminders) {
    // IDEMPOTENCY CHECK:
    if (isTodayIST(reminder.lastSentAt)) {
      results.push({
        id: reminder._id,
        status: "skipped",
        reason: "already_sent_today",
        lastSentAt: reminder.lastSentAt,
      });
      continue;
    }

    // CATCH-UP LOGIC:
    if (nowTimeStr >= reminder.reminderTime) {
      // Send Message
      const res = await sendWhatsAppMessage(reminder.phone, reminder.message);

      // Log It
      await MessageLog.create({
        reminderId: reminder._id,
        phone: reminder.phone,
        direction: "outbound",
        messageType: "reminder",
        content: reminder.message,
        status: res.success ? "sent" : "failed",
        rawResponse: res.data || res.error,
      });

      if (res.success) {
        // Mark as Sent
        reminder.lastSentAt = new Date();
        reminder.followUpSent = false;
        reminder.dailyStatus = "sent";
        reminder.replyText = undefined;
        reminder.lastRepliedAt = undefined;
        await reminder.save();

        results.push({
          id: reminder._id,
          status: "sent_reminder",
          phone: reminder.phone,
        });
      } else {
        results.push({
          id: reminder._id,
          status: "failed_sending_reminder",
          error: res.error,
          phone: reminder.phone,
        });
      }
    } else {
      results.push({
        id: reminder._id,
        status: "skipped",
        reason: "time_not_reached",
        reminderTime: reminder.reminderTime,
        now: nowTimeStr,
      });
    }
  }

  // --- 2. Process FOLLOW-UPS ---
  const activeFollowUps = await Reminder.find({
    isActive: true,
    dailyStatus: "sent",
    followUpSent: false,
  });

  for (const reminder of activeFollowUps) {
    if (!isTodayIST(reminder.lastSentAt)) {
      continue; // Stale
    }

    if (reminder.followUpTime && nowTimeStr >= reminder.followUpTime) {
      const res = await sendWhatsAppMessage(
        reminder.phone,
        reminder.followUpMessage
      );

      await MessageLog.create({
        reminderId: reminder._id,
        phone: reminder.phone,
        direction: "outbound",
        messageType: "followup",
        content: reminder.followUpMessage,
        status: res.success ? "sent" : "failed",
        rawResponse: res.data || res.error,
      });

      if (res.success) {
        reminder.followUpSent = true;
        reminder.dailyStatus = "missed";
        await reminder.save();
        results.push({
          id: reminder._id,
          status: "sent_followup",
          phone: reminder.phone,
        });
      } else {
        results.push({
          id: reminder._id,
          status: "failed_followup",
          error: res.error,
        });
      }
    } else {
      results.push({
        id: reminder._id,
        status: "skipped_followup",
        reason: "time_not_reached",
      });
    }
  }

  return NextResponse.json({
    success: true,
    processedCount: results.length,
    results: results,
    serverTimeIST: nowTimeStr,
  });
}
