import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import MessageLog from "@/models/MessageLog";
import { getISTDate } from "@/lib/dateUtils";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[Webhook] Received payload:", JSON.stringify(body, null, 2));

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

        // 1. Log the incoming message FIRST
        await MessageLog.create({
          phone: from,
          direction: "inbound",
          messageType: "reply",
          content: text,
          status: "received",
          rawResponse: body,
        });

        console.log(`[Webhook] >>> Incoming Reply <<<`);
        console.log(`[Webhook] From: ${from}`);
        console.log(`[Webhook] Text: ${text}`);
        console.log(`[Webhook] Button Reply: ${isButtonReply}`);

        // 2. Get TODAY in IST
        const todayStr = getISTDate();
        console.log(`[Webhook] Today (IST): ${todayStr}`);

        // 3. Normalize phone for matching
        const incomingDigits = from.replace(/\D/g, "");
        const incomingLast10 = incomingDigits.slice(-10);
        console.log(
          `[Webhook] Phone digits: ${incomingDigits}, Last 10: ${incomingLast10}`
        );

        // 4. Find ALL executions for TODAY (no status filter)
        const todaysExecutions = await ReminderExecution.find({
          date: todayStr,
        }).sort({ sentAt: -1 });

        console.log(
          `[Webhook] Found ${todaysExecutions.length} executions for today`
        );

        // 5. Match by phone number (last 10 digits)
        let matchedExecution = null;
        for (const exec of todaysExecutions) {
          const dbDigits = exec.phone.replace(/\D/g, "");
          const dbLast10 = dbDigits.slice(-10);

          console.log(
            `[Webhook] Checking exec ${exec._id}: phone=${exec.phone}, digits=${dbDigits}, last10=${dbLast10}`
          );

          if (dbLast10 === incomingLast10) {
            matchedExecution = exec;
            console.log(`[Webhook] ✓ MATCH FOUND by last 10 digits!`);
            break;
          }

          // Fallback: exact match
          if (dbDigits === incomingDigits) {
            matchedExecution = exec;
            console.log(`[Webhook] ✓ MATCH FOUND by exact digits!`);
            break;
          }
        }

        if (matchedExecution) {
          console.log(`[Webhook] >>> PROCESSING MATCH <<<`);
          console.log(`[Webhook] Execution ID: ${matchedExecution._id}`);
          console.log(`[Webhook] Current Status: ${matchedExecution.status}`);
          console.log(
            `[Webhook] Current FollowUp: ${matchedExecution.followUpStatus}`
          );

          // 6. Determine if this is a completion
          let newStatus: "replied" | "completed" = "replied";

          if (
            text === "completed_habit" ||
            text.toLowerCase().includes("complete") ||
            text.toLowerCase().includes("done")
          ) {
            newStatus = "completed";
            console.log(`[Webhook] Detected COMPLETION keyword`);
          }

          // 7. Update the execution
          matchedExecution.status = newStatus;
          matchedExecution.replyReceivedAt = new Date();

          // 8. CRITICAL: Cancel the follow-up
          if (matchedExecution.followUpStatus === "pending") {
            matchedExecution.followUpStatus = "cancelled_by_user";
            console.log(`[Webhook] ⚠️  CANCELLING PENDING FOLLOW-UP`);
          }

          // 9. Save to database
          await matchedExecution.save();
          console.log(
            `[Webhook] ✓ Saved status=${newStatus}, followUpStatus=${matchedExecution.followUpStatus}`
          );

          // 10. Verify the save worked
          const verified = await ReminderExecution.findById(
            matchedExecution._id
          );
          console.log(
            `[Webhook] Verification - DB status: ${verified?.status}, followUp: ${verified?.followUpStatus}`
          );

          // 11. Send confirmation to user
          if (newStatus === "completed") {
            try {
              console.log(`[Webhook] Sending confirmation message...`);
              await sendWhatsAppMessage(
                from,
                "Great job! ✅ Response recorded. Follow-up cancelled."
              );
            } catch (e) {
              console.error("[Webhook] Failed to send confirmation:", e);
            }
          }

          // 12. Update legacy Reminder model (optional sync)
          try {
            await Reminder.findByIdAndUpdate(matchedExecution.reminderId, {
              dailyStatus: newStatus,
              replyText: text,
              lastRepliedAt: new Date(),
            });
            console.log(`[Webhook] ✓ Updated legacy Reminder model`);
          } catch (err) {
            console.error("[Webhook] Failed to update Reminder:", err);
          }

          console.log(`[Webhook] >>> SUCCESS - Processing complete <<<`);
        } else {
          console.log(`[Webhook] ✗ NO MATCH FOUND`);
          console.log(
            `[Webhook] Searched for phone ending in: ${incomingLast10}`
          );
          console.log(`[Webhook] Date searched: ${todayStr}`);
          console.log(
            `[Webhook] Available executions:`,
            todaysExecutions.map((e) => ({
              id: e._id,
              phone: e.phone,
              date: e.date,
              status: e.status,
            }))
          );
        }
      }
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    }
  } catch (error) {
    console.error("[Webhook] ✗ ERROR:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
