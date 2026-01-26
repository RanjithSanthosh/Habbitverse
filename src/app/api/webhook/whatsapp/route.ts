import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import MessageLog from "@/models/MessageLog";
import { getISTDate } from "@/lib/dateUtils";

// GET request for Webhook Verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return new NextResponse(challenge, { status: 200 });
    } else {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }
  return new NextResponse("Bad Request", { status: 400 });
}

// POST request for Incoming Messages
// POST request for Incoming Messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if this is a message from WhatsApp
    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from; // Phone number e.g. "919876543210"

        let text = "";
        let isButtonReply = false;

        if (message.type === "text") {
          text = message.text.body;
        } else if (message.type === "interactive") {
          const interactive = message.interactive;
          if (interactive.type === "button_reply") {
            text = interactive.button_reply.id; // e.g. "completed_habit"
            isButtonReply = true;
          }
        }

        await dbConnect();

        // 1. Log the incoming message
        await MessageLog.create({
          phone: from,
          direction: "inbound",
          messageType: "reply",
          content: text,
          status: "received",
          rawResponse: body,
        });

        console.log(`[Webhook] Reply from: ${from} | Text: ${text}`);

        // 2. Normalize Phone Numbers for Matching
        // Standardize: Remove all non-digits. We match based on the last 10 digits to be safe.
        const incomingDigits = from.replace(/\D/g, "");
        const incomingLast10 = incomingDigits.slice(-10);

        // 3. Find Active Executions for TODAY
        const todayStr = getISTDate();

        // Find ALL executions for today (don't filter by status 'sent', looking for ANY match)
        const todaysExecutions = await ReminderExecution.find({
          date: todayStr,
        }).sort({ sentAt: -1 });

        // 4. Find the specific execution for this phone number
        const matchedExecution = todaysExecutions.find((exec) => {
          const dbDigits = exec.phone.replace(/\D/g, "");
          // Strict match if lengths are small (unlikely), else suffix match
          if (dbDigits.length < 10 || incomingDigits.length < 10) {
            return dbDigits === incomingDigits;
          }
          return dbDigits.slice(-10) === incomingLast10;
        });

        if (matchedExecution) {
          console.log(
            `[Webhook] MATCH FOUND: ${matchedExecution._id} (Current Status: ${matchedExecution.status})`
          );

          // 5. Determine New Status & Update
          let newStatus: "replied" | "completed" = "replied";

          if (
            text === "completed_habit" ||
            text.toLowerCase().includes("complete") ||
            text.toLowerCase().includes("done")
          ) {
            newStatus = "completed";
          }

          // Update Status
          matchedExecution.status = newStatus;
          matchedExecution.replyReceivedAt = new Date();

          // CRITICAL: Cancel Follow-up if it hasn't been sent yet
          // If status is 'completed' or 'replied', we generally want to stop the pestering.
          if (matchedExecution.followUpStatus === "pending") {
            console.log(
              `[Webhook] Cancelling pending follow-up for ${matchedExecution._id}`
            );
            matchedExecution.followUpStatus = "cancelled_by_user";
          }

          await matchedExecution.save();

          // --- AUTO-CONFIRMATION MESSAGE ---
          // User requested: "auto completed message will be reseved to us"
          if (newStatus === "completed") {
            try {
              await import("@/lib/whatsapp").then((mod) =>
                mod.sendWhatsAppMessage(
                  from,
                  "Great job! ✅ Response recorded."
                )
              );
            } catch (e) {
              console.error("Failed to send auto-reply confirmation", e);
            }
          }

          // --- LEGACY SYNC (Optional but good for fallback) ---
          try {
            await Reminder.findByIdAndUpdate(matchedExecution.reminderId, {
              dailyStatus: newStatus,
              replyText: text,
              lastRepliedAt: new Date(),
            });
          } catch (err) {
            // Ignore legacy update errors
          }

          console.log(`[Webhook] Successfully updated status to ${newStatus}`);
        } else {
          console.log(
            `[Webhook] NO MATCH for ${from} on ${todayStr}. Candidates: ${todaysExecutions.length}`
          );
        }
      }
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
