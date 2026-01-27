/**
 * ============================================================
 * REMINDER SYSTEM - ONE-TIME EXECUTION MODEL
 * ============================================================
 *
 * HOW IT WORKS:
 * 1. Users create reminders with a phone number, message, time, and follow-up
 * 2. Each reminder executes EXACTLY ONCE when its scheduled time is reached
 * 3. After sending, the reminder is automatically deactivated (isActive = false)
 * 4. Users can create MULTIPLE reminders - each is independent
 *
 * REPLY TRACKING:
 * - System watches for replies between reminder time and follow-up time
 * - If user replies before follow-up time, the follow-up is cancelled
 * - Status is updated to "replied" or "completed" in ReminderExecution
 *
 * FOLLOW-UP LOGIC:
 * - Follow-ups only send if:
 *   a) Status is still "sent" (user hasn't replied)
 *   b) FollowUpStatus is "pending" (not cancelled)
 *   c) Current time >= follow-up time
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import MessageLog from "@/models/MessageLog";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getISTDate, getISTTime } from "@/lib/dateUtils";

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
  const todayDateStr = getISTDate();
  const nowMinutes = getMinutesFromMidnight(nowTimeStr);

  console.log(`\n========================================`);
  console.log(
    `[Cron] STARTED at IST: ${todayDateStr} ${nowTimeStr} (${nowMinutes}m)`
  );
  console.log(`========================================\n`);

  const results = [];

  // --- 1. Process REMINDERS (Send initial message) ---
  const activeReminders = await Reminder.find({ isActive: true });
  console.log(`[Cron] Found ${activeReminders.length} active reminder configs`);

  for (const reminder of activeReminders) {
    try {
      // ============================================================
      // ONE-TIME EXECUTION CHECK:
      // Check if this reminder has EVER been executed (not just today)
      // ============================================================
      const anyExecution = await ReminderExecution.findOne({
        reminderId: reminder._id,
      });

      if (anyExecution) {
        // This reminder was already sent before - it's a ONE-TIME reminder
        // Deactivate it so it doesn't appear in future cron runs
        if (reminder.isActive) {
          reminder.isActive = false;
          await reminder.save();
          console.log(
            `[Cron] ⚡ Deactivated reminder ${reminder._id} (already executed once)`
          );
        }
        continue;
      }

      const reminderMinutes = getMinutesFromMidnight(reminder.reminderTime);

      // Check if it's time to send
      if (nowMinutes >= reminderMinutes) {
        console.log(
          `[Cron] 📨 Sending ONE-TIME Reminder: ${reminder.title} to ${reminder.phone}`
        );

        const res = await sendWhatsAppMessage(
          reminder.phone,
          reminder.message,
          [{ id: "completed_habit", title: "Completed" }]
        );

        // Log the attempt
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
          // Create the execution record
          await ReminderExecution.create({
            reminderId: reminder._id,
            phone: reminder.phone,
            date: todayDateStr,
            status: "sent",
            sentAt: new Date(),
            followUpStatus: "pending",
          });

          // ============================================================
          // ONE-TIME EXECUTION: Deactivate after sending
          // This prevents it from being sent again tomorrow
          // ============================================================
          reminder.lastSentAt = new Date();
          reminder.dailyStatus = "sent";
          reminder.isActive = false; // ⚡ KEY CHANGE: Deactivate after first send
          await reminder.save();

          console.log(
            `[Cron] ✓ Reminder sent and DEACTIVATED (one-time execution)`
          );
          console.log(
            `[Cron] ✓ Created execution record for ${reminder.phone}`
          );

          results.push({
            id: reminder._id,
            type: "reminder",
            status: "sent",
            phone: reminder.phone,
            message: "One-time reminder sent and deactivated",
          });
        } else {
          console.error(
            `[Cron] ✗ Failed to send to ${reminder.phone}:`,
            res.error
          );
          results.push({
            id: reminder._id,
            type: "reminder",
            status: "failed",
            error: res.error,
          });
        }
      }
    } catch (err: any) {
      console.error(`[Cron] Error processing reminder ${reminder._id}:`, err);
      results.push({
        id: reminder._id,
        type: "reminder",
        status: "error",
        error: err.message,
      });
    }
  }

  // --- 2. Process FOLLOW-UPS ---
  console.log(`\n[Cron] >>> FOLLOW-UP CHECK <<<`);
  console.log(`[Cron] Looking for executions with:`);
  console.log(`[Cron]   - date: ${todayDateStr}`);
  console.log(`[Cron]   - status: "sent"`);
  console.log(`[Cron]   - followUpStatus: "pending"`);

  const pendingFollowUps = await ReminderExecution.find({
    date: todayDateStr,
    status: "sent",
    followUpStatus: "pending",
  }).populate("reminderId");

  console.log(
    `[Cron] Found ${pendingFollowUps.length} candidates for follow-up check\n`
  );

  for (const executionItem of pendingFollowUps) {
    try {
      console.log(`\n[Cron] --- Processing Execution ${executionItem._id} ---`);
      console.log(`[Cron] Phone: ${executionItem.phone}`);
      console.log(`[Cron] Sent At: ${executionItem.sentAt}`);
      console.log(`[Cron] Current Status: ${executionItem.status}`);
      console.log(`[Cron] Current FollowUp: ${executionItem.followUpStatus}`);

      // CRITICAL: Re-fetch to get LATEST state
      const execution = await ReminderExecution.findById(
        executionItem._id
      ).populate("reminderId");

      if (!execution) {
        console.log(`[Cron] ✗ Execution not found (deleted?)`);
        continue;
      }

      console.log(
        `[Cron] After re-fetch - Status: ${execution.status}, FollowUp: ${execution.followUpStatus}`
      );

      // STRICT CHECK 1: Status must be "sent"
      if (execution.status !== "sent") {
        console.log(
          `[Cron] ✓ SKIP - Status is "${execution.status}" (not "sent")`
        );
        continue;
      }

      // STRICT CHECK 2: FollowUpStatus must be "pending"
      if (execution.followUpStatus !== "pending") {
        console.log(
          `[Cron] ✓ SKIP - FollowUpStatus is "${execution.followUpStatus}" (not "pending")`
        );
        continue;
      }

      const config = execution.reminderId as any;

      if (!config || !config.isActive) {
        console.log(`[Cron] ✓ SKIP - Config deleted or inactive`);
        continue;
      }

      // FAILSAFE: Check Message Logs
      console.log(`[Cron] Checking message logs for replies...`);
      const lastSentTime = execution.sentAt;
      if (lastSentTime) {
        const execPhoneDigits = execution.phone.replace(/\D/g, "");
        const execLast10 = execPhoneDigits.slice(-10);

        const recentLogs = await MessageLog.find({
          direction: "inbound",
          createdAt: { $gt: lastSentTime },
        });

        console.log(
          `[Cron] Found ${recentLogs.length} inbound messages since reminder sent`
        );

        const matchedLog = recentLogs.find((log) => {
          const logPhoneDigits = log.phone.replace(/\D/g, "");
          const logLast10 = logPhoneDigits.slice(-10);
          return logLast10 === execLast10;
        });

        if (matchedLog) {
          console.log(`[Cron] ⚠️  FOUND REPLY IN LOGS!`);
          console.log(`[Cron] Content: "${matchedLog.content}"`);

          const lowerContent = (matchedLog.content || "").toLowerCase();
          let detectedStatus: "completed" | "replied" = "replied";

          if (
            lowerContent.includes("complete") ||
            lowerContent === "completed_habit" ||
            lowerContent.includes("done")
          ) {
            detectedStatus = "completed";
          }

          console.log(`[Cron] Auto-healing status to: ${detectedStatus}`);

          execution.status = detectedStatus;
          execution.followUpStatus = "cancelled_by_user";
          execution.replyReceivedAt = matchedLog.createdAt;
          await execution.save();

          console.log(`[Cron] ✓ SKIP - Auto-healed and cancelled follow-up`);
          continue;
        } else {
          console.log(`[Cron] No matching reply found in logs`);
        }
      }

      if (!config.followUpTime) {
        console.log(`[Cron] ✓ SKIP - No follow-up time configured`);
        execution.followUpStatus = "skipped";
        await execution.save();
        continue;
      }

      const followUpMinutes = getMinutesFromMidnight(config.followUpTime);

      console.log(
        `[Cron] Follow-up scheduled for: ${config.followUpTime} (${followUpMinutes}m)`
      );
      console.log(`[Cron] Current time: ${nowTimeStr} (${nowMinutes}m)`);

      // Check if follow-up time is reached
      if (nowMinutes >= followUpMinutes) {
        // Sanity check
        const reminderMinutes = getMinutesFromMidnight(config.reminderTime);
        if (followUpMinutes <= reminderMinutes) {
          console.warn(
            `[Cron] ✗ CONFIG ERROR: Follow-up time ${config.followUpTime} is <= Reminder time ${config.reminderTime}`
          );
          continue;
        }

        console.log(`[Cron] >>> SENDING FOLLOW-UP <<<`);
        console.log(`[Cron] To: ${execution.phone}`);
        console.log(`[Cron] Message: ${config.followUpMessage}`);

        const res = await sendWhatsAppMessage(
          execution.phone,
          config.followUpMessage || "Did you complete your habit?"
        );

        await MessageLog.create({
          reminderId: config._id,
          phone: execution.phone,
          direction: "outbound",
          messageType: "followup",
          content: config.followUpMessage,
          status: res.success ? "sent" : "failed",
          rawResponse: res.data || res.error,
        });

        if (res.success) {
          execution.followUpStatus = "sent";
          execution.followUpSentAt = new Date();
          await execution.save();

          console.log(`[Cron] ✓ Follow-up SENT successfully`);

          results.push({
            id: execution._id,
            type: "followup",
            status: "sent",
            phone: execution.phone,
          });
        } else {
          console.log(`[Cron] ✗ Follow-up FAILED:`, res.error);
          results.push({
            id: execution._id,
            type: "followup",
            status: "failed",
            error: res.error,
          });
        }
      } else {
        console.log(
          `[Cron] ✓ SKIP - Not time yet (need ${
            followUpMinutes - nowMinutes
          } more minutes)`
        );
      }
    } catch (err: any) {
      console.error(
        `[Cron] ✗ Error processing follow-up ${executionItem._id}:`,
        err
      );
      results.push({
        id: executionItem._id,
        type: "followup",
        status: "error",
        error: err.message,
      });
    }
  }

  console.log(`\n========================================`);
  console.log(`[Cron] COMPLETED - Processed ${results.length} actions`);
  console.log(`========================================\n`);

  return NextResponse.json({
    success: true,
    processedCount: results.length,
    results: results,
    serverTimeIST: `${todayDateStr} ${nowTimeStr}`,
  });
}
