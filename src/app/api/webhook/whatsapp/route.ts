import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import MessageLog from "@/models/MessageLog";
import { getISTDate } from "@/lib/dateUtils";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// Helper to normalize phone for comparison (last 10 digits)
function getPhoneLast10(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

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
    console.log("[Webhook] Payload Received:", JSON.stringify(body, null, 2));

    await dbConnect();

    // Check if it's a message
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // Sender's phone number

      let text = "";
      let messageType = message.type;

      // Extract text based on message type
      if (messageType === "text") {
        text = message.text.body;
      } else if (messageType === "interactive") {
        const interactive = message.interactive;
        if (interactive.type === "button_reply") {
          text = interactive.button_reply.id;
          messageType = "button_reply"; // normalize type for our logs
        } else if (interactive.type === "list_reply") {
          text = interactive.list_reply.id;
          messageType = "list_reply";
        }
      }

      console.log(`[Webhook] Processing Message from ${from}: "${text}"`);

      // 1. Log Inbound Message
      try {
        await MessageLog.create({
          phone: from,
          direction: "inbound",
          messageType: messageType,
          content: text || "[No Content]",
          status: "received",
          rawResponse: message,
        });
        console.log(`[Webhook] ✓ Logged to MessageLog`);
      } catch (logErr) {
        console.error(`[Webhook] ❌ Logging failed:`, logErr);
      }

      // 2. Detect Completion Intent
      const normalizedText = (text || "").trim().toLowerCase();
      const isCompletion =
        normalizedText === "completed_habit" ||
        normalizedText === "completed" ||
        normalizedText === "complete" ||
        normalizedText === "done" ||
        normalizedText.startsWith("yes") ||
        normalizedText.startsWith("yep") ||
        normalizedText.includes("complete") ||
        normalizedText.includes("done");

      console.log(`[Webhook] Is Completion? ${isCompletion}`);

      // 3. CORE LOGIC: Find Active Reminders & UPSERT Executions
      const todayStr = getISTDate();
      const phoneLast10 = getPhoneLast10(from);

      console.log(
        `[Webhook] 🔍 Processing reply for phone ...${phoneLast10} on ${todayStr}`
      );

      // STEP A: Find the Configuration (Reminder) first
      // This is the anchor. We need the reminderId to create/update the execution correctly.
      const activeReminders = await Reminder.find({
        isActive: true,
        phone: { $regex: `${phoneLast10}$` }, // Match last 10 digits
      });

      console.log(
        `[Webhook] Found ${activeReminders.length} active reminders for this phone.`
      );

      let processedCount = 0;

      if (activeReminders.length === 0) {
        // Edge case: Message received but no active reminder found.
        // It could be a reply to an old/completed reminder.
        console.log(
          `[Webhook] ⚠️ No active reminders found. Reply ignored for flow logic.`
        );
      } else {
        // STEP B: For every active reminder, UPSERT the execution
        for (const reminder of activeReminders) {
          console.log(
            `[Webhook] 👉 Processing Reminder: ${reminder.title} (${reminder._id})`
          );

          // Determine statuses
          const newStatus = isCompletion ? "completed" : "replied";
          const newFollowUp = "cancelled_by_user";

          // UPSERT: Create or Update the Daily Record
          // This is the CRITICAL FIX. We guarantee an execution record exists.
          try {
            const execution = await ReminderExecution.findOneAndUpdate(
              {
                reminderId: reminder._id,
                date: todayStr,
              },
              {
                $set: {
                  phone: reminder.phone, // Ensure phone is set on create
                  status: newStatus,
                  followUpStatus: newFollowUp,
                  replyReceivedAt: new Date(),
                },
                $setOnInsert: {
                  sentAt: new Date(), // If created now, set a dummy sentAt so it looks valid
                },
              },
              { upsert: true, new: true }
            );

            console.log(`[Webhook]    ✓ Execution upserted: ${execution._id}`);
            console.log(
              `[Webhook]    ✓ Status: ${execution.status}, FollowUp: ${execution.followUpStatus}`
            );

            // STEP C: Update the Configuration (Reminder)
            // If completed or valid reply, we deactivate the reminder config
            reminder.isActive = false;
            reminder.dailyStatus = newStatus;
            reminder.lastRepliedAt = new Date();
            if (isCompletion) {
              reminder.replyText = "Completed via WhatsApp";
            }
            await reminder.save();
            console.log(`[Webhook]    ✓ Reminder deactivated`);

            processedCount++;
          } catch (upsertError) {
            console.error(
              `[Webhook] ❌ Error updating execution/reminder:`,
              upsertError
            );
          }
        }

        // Send confirmation to user
        if (processedCount > 0 && isCompletion) {
          try {
            await sendWhatsAppMessage(from, "✅ Awesome! Marked as completed.");
          } catch (msgErr) {
            console.error(`[Webhook] Failed to send confirmation msg:`, msgErr);
          }
        }
      }

      return NextResponse.json({ success: true, processed: processedCount });
    } else if (body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]) {
      // HANDLE STATUS UPDATES (Sent, Delivered, Read, Failed)
      const statusObj = body.entry[0].changes[0].value.statuses[0];
      const status = statusObj.status; // sent, delivered, read, failed
      const phone = statusObj.recipient_id;

      console.log(
        `[Webhook] 📩 Status Update: ${status.toUpperCase()} for ${phone}`
      );

      // Log to Database for visibility
      try {
        await MessageLog.create({
          phone: phone,
          direction: "inbound", // Technical inbound event
          messageType: "status_update",
          content: `Status: ${status}`,
          status: status,
          rawResponse: statusObj,
        });
        console.log(`[Webhook] ✓ Status logged to DB`);
      } catch (err) {
        console.error(`[Webhook] Failed to log status:`, err);
      }

      return NextResponse.json({
        success: true,
        type: "status_update",
        status,
      });
    }

    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    console.error("[Webhook] ❌ Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
