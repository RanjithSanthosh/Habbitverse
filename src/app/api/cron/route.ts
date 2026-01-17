import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import MessageLog from "@/models/MessageLog";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// Helper to check if date is today
const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

export async function GET(req: NextRequest) {
  await dbConnect();

  const { searchParams } = new URL(req.url);
  const mockTime = searchParams.get("time");

  const now = new Date();
  // Format current time as HH:MM
  let timeString = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

  const force = searchParams.get("force") === "true";

  if (mockTime) {
    console.log(`[Testing] Using mock time: ${mockTime}`);
    timeString = mockTime;
  }

  console.log(
    `[Cron] Checking reminders for time: ${timeString} (Force: ${force})`
  );

  // 1. Process New Reminders
  const query: any = { isActive: true };
  if (!force) {
    query.reminderTime = timeString;
  }

  const remindersDue = await Reminder.find(query);

  const results = [];

  for (const reminder of remindersDue) {
    // Check if already sent today - SKIP CHECK IF FORCED
    if (
      !force &&
      reminder.lastSentAt &&
      isToday(new Date(reminder.lastSentAt))
    ) {
      continue;
    }

    // Send Reminder
    const res = await sendWhatsAppMessage(reminder.phone, reminder.message);

    // Log
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
      // Update Reminder State
      // Resetting daily state for the new cycle
      reminder.lastSentAt = new Date();
      reminder.followUpSent = false;
      reminder.dailyStatus = "sent";
      reminder.replyText = "";
      reminder.lastRepliedAt = undefined;
      await reminder.save();
      results.push({ id: reminder._id, status: "sent_reminder" });
    } else {
      results.push({
        id: reminder._id,
        status: "failed_sending_reminder",
        error: res.error,
      });
    }
  }

  // 2. Process Follow-ups
  // Find reminders that are 'sent', NO reply, No follow-up sent yet
  const pendingFollowups = await Reminder.find({
    isActive: true,
    dailyStatus: "sent",
    followUpSent: false,
  });

  for (const reminder of pendingFollowups) {
    if (!reminder.lastSentAt) continue;

    if (!isToday(new Date(reminder.lastSentAt))) {
      // This is a stale state from potential previous failure or weird state.
      // If it wasn't reset, ignore or reset?
      // For safe MVP, ignore.
      continue;
    }

    const sentTime = new Date(reminder.lastSentAt).getTime();
    const currentTime = now.getTime();
    const diffMinutes = (currentTime - sentTime) / (1000 * 60);

    if (diffMinutes >= reminder.followUpDelay) {
      // Send Follow-up
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
        reminder.dailyStatus = "missed"; // Marking as missed/pending reply? Prompt says "Missed (no reply)".
        // If they reply later, we update to 'replied'.
        // So 'missed' effectively means "reached follow-up stage without reply"
        await reminder.save();
        results.push({ id: reminder._id, status: "sent_followup" });
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed: results,
    time: timeString,
  });
}
