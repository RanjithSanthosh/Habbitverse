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

// Helper: Convert "HH:MM" to minutes from midnight
const getMinutesFromMidnight = (timeStr: string) => {
  if (!timeStr) return -1;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await dbConnect();

  const nowTimeStr = getISTTime();
  const nowMinutes = getMinutesFromMidnight(nowTimeStr);

  console.log(`[Cron] Running at IST: ${nowTimeStr} (${nowMinutes}m)`);

  // --- 1. Process REMINDERS ---
  const activeReminders = await Reminder.find({ isActive: true });
  const results = [];

  for (const reminder of activeReminders) {
    try {
      if (isTodayIST(reminder.lastSentAt)) {
        results.push({
          id: reminder._id,
          status: "skipped",
          reason: "already_sent_today",
          lastSentAt: reminder.lastSentAt,
        });
        continue;
      }

      const reminderMinutes = getMinutesFromMidnight(reminder.reminderTime);

      // ROBUST CHECK: Integers instead of strings
      if (nowMinutes >= reminderMinutes) {
        const res = await sendWhatsAppMessage(reminder.phone, reminder.message);

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
    } catch (err: any) {
      console.error(`[Cron] Error processing reminder ${reminder._id}:`, err);
      results.push({
        id: reminder._id,
        status: "error_processing_reminder",
        error: err.message || err,
      });
    }
  }

  // --- 2. Process FOLLOW-UPS ---
  // Queries only reminders that are ALREADY 'sent' today.
  const activeFollowUps = await Reminder.find({
    isActive: true,
    dailyStatus: "sent",
    followUpSent: false,
  });

  if (activeFollowUps.length > 0) {
    console.log(
      `[Cron] Found ${activeFollowUps.length} candidates for follow-up.`
    );
  }

  for (const reminder of activeFollowUps) {
    try {
      if (!isTodayIST(reminder.lastSentAt)) {
        continue; // Stale data from yesterday
      }

      if (!reminder.followUpTime) {
        results.push({
          id: reminder._id,
          status: "skipped_followup",
          reason: "no_followup_time_set",
        });
        continue;
      }

      const followUpMinutes = getMinutesFromMidnight(reminder.followUpTime);

      if (nowMinutes >= followUpMinutes) {
        // 🚨 CRITICAL: RE-FETCH from DB to ensure 'replied' is still false
        // This prevents race conditions where user replied 1 second ago
        const FRESH_REMINDER = await Reminder.findById(reminder._id);

        if (!FRESH_REMINDER) continue; // Deleted?

        // If user has REPLIED, we MUST NOT send the follow-up
        if (
          FRESH_REMINDER.dailyStatus === "replied" ||
          FRESH_REMINDER.dailyStatus === "missed"
        ) {
          results.push({
            id: reminder._id,
            status: "cancelled_followup",
            reason: "user_already_replied_or_handled",
            currentStatus: FRESH_REMINDER.dailyStatus,
          });
          continue;
        }

        // Also check idempotency again on fresh object
        if (FRESH_REMINDER.followUpSent) {
          continue;
        }

        // EXTRA SAFETY: Ensure follow-up time is actually AFTER reminder time
        const reminderMinutes = getMinutesFromMidnight(reminder.reminderTime);
        if (followUpMinutes <= reminderMinutes) {
          results.push({
            id: reminder._id,
            status: "skipped_followup",
            reason: "config_error_followup_too_early",
            warning: "Follow-up time must be AFTER reminder time",
          });
          continue;
        }

        const res = await sendWhatsAppMessage(
          reminder.phone,
          reminder.followUpMessage || "Did you complete your habit?"
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
          followUpTime: reminder.followUpTime,
          now: nowTimeStr,
        });
      }
    } catch (err: any) {
      console.error(`[Cron] Error processing follow-up ${reminder._id}:`, err);
      results.push({
        id: reminder._id,
        status: "error_processing_followup",
        error: err.message,
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
