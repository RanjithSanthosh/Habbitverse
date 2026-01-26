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

  console.log(
    `[Cron] Running at IST: ${todayDateStr} ${nowTimeStr} (${nowMinutes}m)`
  );

  const results = [];

  // --- 1. Process REMINDERS (Send initial message) ---
  // Get all active reminder configurations
  const activeReminders = await Reminder.find({ isActive: true });

  for (const reminder of activeReminders) {
    try {
      // Check if we already executed this reminder TODAY
      const existingExecution = await ReminderExecution.findOne({
        reminderId: reminder._id,
        date: todayDateStr,
      });

      if (existingExecution) {
        // Already processed for today
        continue;
      }

      const reminderMinutes = getMinutesFromMidnight(reminder.reminderTime);

      // Check if it's time to send
      if (nowMinutes >= reminderMinutes) {
        console.log(
          `[Cron] Sending Initial Reminder: ${reminder.title} to ${reminder.phone}`
        );

        const res = await sendWhatsAppMessage(
          reminder.phone,
          reminder.message,
          [{ id: "completed_habit", title: "Completed" }]
        );

        // Log the attempt (raw log)
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
            status: "sent", // Initial status
            sentAt: new Date(),
            followUpStatus: "pending",
          });

          // Legacy support: Update the Reminder model too for now
          reminder.lastSentAt = new Date();
          reminder.dailyStatus = "sent";
          await reminder.save();

          results.push({
            id: reminder._id,
            type: "reminder",
            status: "sent",
            phone: reminder.phone,
          });
        } else {
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
  // Iterate through TODAY'S executions that are still pending follow-up
  // AND where the user has NOT replied yet.
  const pendingFollowUps = await ReminderExecution.find({
    date: todayDateStr,
    status: "sent", // Means NO reply received yet (otherwise it would be 'replied')
    followUpStatus: "pending",
  }).populate("reminderId"); // We need the config to get followUpTime and message

  if (pendingFollowUps.length > 0) {
    console.log(
      `[Cron] Found ${pendingFollowUps.length} candidates for follow-up.`
    );
  }

  for (const executionItem of pendingFollowUps) {
    try {
      // CRITICAL: Re-fetch the execution to ensure we have the LATEST status.
      // The user might have replied milliseconds ago, or while the loop was running.
      const execution = await ReminderExecution.findById(
        executionItem._id
      ).populate("reminderId");

      if (!execution) continue; // Should not happen

      // strict status check
      if (execution.status === "completed" || execution.status === "replied") {
        console.log(
          `[Cron] Skipping follow-up for ${execution._id}: User already replied/completed.`
        );
        continue;
      }

      if (execution.followUpStatus !== "pending") {
        console.log(
          `[Cron] Skipping follow-up for ${execution._id}: Status is ${execution.followUpStatus}`
        );
        continue;
      }

      const config = execution.reminderId as any; // Type assertion

      if (!config || !config.isActive) {
        continue; // Config deleted or disabled
      }

      if (!config.followUpTime) {
        // No follow-up configured, mark skipped
        execution.followUpStatus = "skipped";
        await execution.save();
        continue;
      }

      const followUpMinutes = getMinutesFromMidnight(config.followUpTime);

      // Check if follow-up time is reached
      if (nowMinutes >= followUpMinutes) {
        // Double check strict timing (Safety)
        const reminderMinutes = getMinutesFromMidnight(config.reminderTime);
        if (followUpMinutes <= reminderMinutes) {
          console.warn(
            `[Cron] Config Error: Follow-up time ${config.followUpTime} is <= Reminder time ${config.reminderTime}`
          );
          continue;
        }

        console.log(
          `[Cron] Sending Follow-up: ${config.title} to ${execution.phone}`
        );

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

          results.push({
            id: execution._id,
            type: "followup",
            status: "sent",
            phone: execution.phone,
          });
        } else {
          results.push({
            id: execution._id,
            type: "followup",
            status: "failed",
            error: res.error,
          });
        }
      }
    } catch (err: any) {
      console.error(
        `[Cron] Error processing follow-up execution ${executionItem._id}:`,
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

  return NextResponse.json({
    success: true,
    processedCount: results.length,
    results: results,
    serverTimeIST: `${todayDateStr} ${nowTimeStr}`,
  });
}
