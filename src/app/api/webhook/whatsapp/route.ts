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
      const messageId = message.id;

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
        normalizedText.includes("complete") ||
        normalizedText.includes("done");

      console.log(`[Webhook] Is Completion? ${isCompletion}`);

      // 3. Find and Update Executions
      const todayStr = getISTDate();
      const phoneLast10 = getPhoneLast10(from);

      console.log(
        `[Webhook] Searching executions for date=${todayStr}, phone=...${phoneLast10}`
      );

      // Find all executions for today that match this phone number
      const executions = await ReminderExecution.find({
        date: todayStr,
        phone: { $regex: `${phoneLast10}$` },
      });

      console.log(`[Webhook] Found ${executions.length} matching executions.`);

      let processedCount = 0;

      if (executions.length > 0) {
        for (const exec of executions) {
          console.log(
            `[Webhook] Updating Execution ${exec._id} (Current: ${exec.status})`
          );

          // Determine new status
          const newStatus = isCompletion ? "completed" : "replied";
          const newFollowUp = "cancelled_by_user"; // Stop follow-ups regardless of content

          // Update Execution
          exec.status = newStatus;
          exec.followUpStatus = newFollowUp;
          exec.replyReceivedAt = new Date();
          await exec.save();

          // Verify Execution Update
          const verifiedExec = await ReminderExecution.findById(exec._id);
          if (verifiedExec?.followUpStatus !== newFollowUp) {
            console.error(
              `[Webhook] ❌ Save verification failed for execution ${exec._id}, retrying...`
            );
            verifiedExec!.followUpStatus = newFollowUp;
            await verifiedExec!.save();
          }

          console.log(
            `[Webhook] ✓ Execution ${exec._id} updated to ${newStatus}`
          );

          // Update Parent Reminder
          const reminder = await Reminder.findById(exec.reminderId);
          if (reminder) {
            reminder.isActive = false; // Stop the flow for today
            reminder.dailyStatus = newStatus;
            reminder.lastRepliedAt = new Date();
            if (isCompletion) {
              reminder.replyText = "Completed via WhatsApp";
            }
            await reminder.save();
            console.log(
              `[Webhook] ✓ Reminder ${reminder._id} deactivated and marked ${newStatus}`
            );
          }
          processedCount++;
        }

        // Send confirmation only if we actually updated something
        if (processedCount > 0) {
          // Confirm to user
          try {
            if (isCompletion) {
              await sendWhatsAppMessage(
                from,
                "✅ Awesome! Marked as completed."
              );
            }
          } catch (msgErr) {
            console.error(`[Webhook] Failed to send confirmation msg:`, msgErr);
          }
        }
      } else {
        console.log(
          `[Webhook] ⚠️ No executions found. Checking strictly active reminders as fallback...`
        );

        // Fallback: Check for ANY active reminder with this phone number
        const activeReminders = await Reminder.find({
          isActive: true,
          phone: { $regex: `${phoneLast10}$` },
        });

        console.log(
          `[Webhook] Found ${activeReminders.length} active reminders as fallback.`
        );

        if (activeReminders.length > 0) {
          for (const r of activeReminders) {
            const newStatus = isCompletion ? "completed" : "replied";
            r.isActive = false;
            r.dailyStatus = newStatus;
            r.lastRepliedAt = new Date();
            await r.save();
            console.log(
              `[Webhook] ✓ Fallback: Reminder ${r._id} updated to ${newStatus}`
            );
            processedCount++;
          }
        } else {
          // Check if maybe it was already completed?
          console.log(
            `[Webhook] No active work found. User might be replying late or incorrectly.`
          );
        }
      }

      return NextResponse.json({ success: true, processed: processedCount });
    } else if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      // Handle status updates (delivered, read, etc) - just log/ignore
      return NextResponse.json({ success: true, type: "status_update" });
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
