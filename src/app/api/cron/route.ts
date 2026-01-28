/**
 * ============================================================
 * REMINDER SYSTEM - ONE-TIME EXECUTION MODEL
 * ============================================================
 *
 * HOW IT WORKS:
 * 1. Users create reminders with a phone number, message, time, and follow-up
 * 2. Each reminder executes EXACTLY ONCE when its scheduled time is reached
 * 3. Reminder stays ACTIVE until the follow-up is processed
 * 4. After follow-up is sent OR cancelled by user reply, isActive = false
 * 5. Users can create MULTIPLE reminders - each is independent
 *
 * REPLY TRACKING:
 * - System watches for replies between reminder time and follow-up time
 * - If user replies before follow-up time, the follow-up is cancelled
 * - Status is updated to "replied" or "completed" in ReminderExecution
 * - Reminder is deactivated immediately when user replies
 *
 * FOLLOW-UP LOGIC:
 * - Follow-ups only send if:
 *   a) Status is still "sent" (user hasn't replied)
 *   b) FollowUpStatus is "pending" (not cancelled)
 *   c) Current time >= follow-up time
 *   d) Reminder is still active (isActive = true)
 *
 * DEACTIVATION TRIGGERS:
 * - Follow-up sent successfully → isActive = false
 * - User replied (follow-up cancelled) → isActive = false
 * - No follow-up configured → isActive = false after initial send
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
      // Check if this reminder has been executed AND flow is complete
      // ============================================================
      const anyExecution = await ReminderExecution.findOne({
        reminderId: reminder._id,
      });

      if (anyExecution) {
        // Check if the flow is COMPLETE (follow-up done or cancelled)
        const flowComplete =
          anyExecution.followUpStatus === "sent" ||
          anyExecution.followUpStatus === "cancelled_by_user" ||
          anyExecution.followUpStatus === "replied_before_followup" ||
          anyExecution.followUpStatus === "skipped";

        if (flowComplete) {
          // Flow is complete - deactivate the reminder
          if (reminder.isActive) {
            reminder.isActive = false;
            await reminder.save();
            console.log(
              `[Cron] ⚡ Deactivated reminder ${reminder._id} (flow complete: ${anyExecution.followUpStatus})`
            );
          }
          continue;
        } else {
          // Execution exists but flow NOT complete (waiting for follow-up)
          console.log(
            `[Cron] ℹ️  Reminder ${reminder._id} already sent, waiting for follow-up (status: ${anyExecution.followUpStatus})`
          );
          continue; // Skip sending again, but keep active for follow-up
        }
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
          // NOTE: We keep isActive=true here so follow-up can process
          // The reminder will be deactivated after follow-up is sent/cancelled
          // ============================================================
          reminder.lastSentAt = new Date();
          reminder.dailyStatus = "sent";
          await reminder.save();

          // Verify the reminder was updated
          const verifiedReminder = await Reminder.findById(reminder._id);
          console.log(
            `[Cron] ✓ Reminder state verified - isActive: ${verifiedReminder?.isActive}, dailyStatus: ${verifiedReminder?.dailyStatus}`
          );

          console.log(
            `[Cron] ✓ Initial reminder sent - keeping active for follow-up`
          );
          console.log(
            `[Cron] ✓ Created execution record for ${reminder.phone}`
          );

          results.push({
            id: reminder._id,
            type: "reminder",
            status: "sent",
            phone: reminder.phone,
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

      if (!config) {
        console.log(`[Cron] ✓ SKIP - Config deleted`);
        continue;
      }

      // NOTE: We do NOT check config.isActive here because:
      // - ReminderExecution status is the source of truth
      // - execution.status and execution.followUpStatus tell us everything
      // - Checking config.isActive can block valid follow-ups

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

          const normalizedContent = (matchedLog.content || "")
            .trim()
            .toLowerCase();
          console.log(`[Cron] Normalized Content: "${normalizedContent}"`);

          let detectedStatus: "completed" | "replied" = "replied";

          if (
            normalizedContent === "completed" ||
            normalizedContent === "complete" ||
            normalizedContent === "done" ||
            normalizedContent === "completed_habit" ||
            normalizedContent.includes("complete") ||
            normalizedContent.includes("done")
          ) {
            detectedStatus = "completed";
          }

          console.log(`[Cron] Auto-healing status to: ${detectedStatus}`);

          execution.status = detectedStatus;
          execution.followUpStatus = "cancelled_by_user";
          execution.replyReceivedAt = matchedLog.createdAt;
          await execution.save();

          // Verify the save worked
          const verifiedExecution = await ReminderExecution.findById(
            execution._id
          );
          console.log(
            `[Cron] ✓ Verified execution - followUpStatus: ${verifiedExecution?.followUpStatus}`
          );

          // Deactivate the reminder - user replied, flow complete
          if (config) {
            config.isActive = false;
            config.dailyStatus = detectedStatus;
            await config.save();

            // Verify
            const verifiedConfig = await Reminder.findById(config._id);
            console.log(
              `[Cron] ⚡ Reminder deactivated (auto-heal) - isActive: ${verifiedConfig?.isActive}`
            );
          }

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

        // Verify
        const verifiedExecution = await ReminderExecution.findById(
          execution._id
        );
        console.log(
          `[Cron] ✓ Verified execution - followUpStatus: ${verifiedExecution?.followUpStatus}`
        );

        // Deactivate the reminder - no follow-up, flow complete
        config.isActive = false;
        config.dailyStatus = "completed";
        await config.save();

        // Verify
        const verifiedConfig = await Reminder.findById(config._id);
        console.log(
          `[Cron] ⚡ Reminder deactivated (no follow-up) - isActive: ${verifiedConfig?.isActive}`
        );

        continue;
      }

      const followUpMinutes = getMinutesFromMidnight(config.followUpTime);

      console.log(
        `[Cron] Follow-up scheduled for: ${config.followUpTime} (${followUpMinutes}m)`
      );
      console.log(`[Cron] Current time: ${nowTimeStr} (${nowMinutes}m)`);

      // Check if follow-up time is reached
      if (nowMinutes >= followUpMinutes) {
        // Sanity check 1: Follow-up must be AFTER reminder time
        const reminderMinutes = getMinutesFromMidnight(config.reminderTime);
        if (followUpMinutes <= reminderMinutes) {
          console.warn(
            `[Cron] ✗ CONFIG ERROR: Follow-up time ${config.followUpTime} is <= Reminder time ${config.reminderTime}`
          );
          continue;
        }

        // Sanity check 2: Ensure initial message was sent at least 2 minutes ago
        // This prevents follow-up from being sent immediately after initial send
        const now = new Date();
        const timeSinceSent = execution.sentAt
          ? (now.getTime() - new Date(execution.sentAt).getTime()) / 1000 / 60
          : 0;

        const MIN_DELAY_MINUTES = 2;
        if (timeSinceSent < MIN_DELAY_MINUTES) {
          console.log(
            `[Cron] ⏳ Waiting for minimum delay - ${timeSinceSent.toFixed(
              1
            )}min since sent (need ${MIN_DELAY_MINUTES}min)`
          );
          console.log(`[Cron] Will check again in next cron run`);
          continue;
        }

        console.log(
          `[Cron] ✓ Time check passed - ${timeSinceSent.toFixed(
            1
          )}min since initial send`
        );

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

          // ============================================================
          // ONE-TIME EXECUTION: Deactivate after follow-up sent
          // The complete flow is now finished
          // ============================================================
          config.isActive = false;
          config.dailyStatus = "completed";
          await config.save();

          // Verify deactivation
          const verifiedConfig = await Reminder.findById(config._id);
          console.log(
            `[Cron] ✓ Verified - isActive: ${verifiedConfig?.isActive}, dailyStatus: ${verifiedConfig?.dailyStatus}`
          );

          console.log(`[Cron] ✓ Follow-up SENT successfully`);
          console.log(`[Cron] ⚡ Reminder DEACTIVATED (flow complete)`);

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
