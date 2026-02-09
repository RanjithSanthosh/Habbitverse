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
// Allow Vercel Function to run for up to 60 seconds (prevents DB timeouts)
export const maxDuration = 60;

// POST request for Incoming Messages
export async function POST(req: NextRequest) {
  try {
    console.log("🔥 WEBHOOK HIT SUCCESSFULLY 🔥");
    const body = await req.json();
    console.log("[Webhook] Payload:", JSON.stringify(body, null, 2));

    if (!body.object) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // A. Handle Messages (Replies) - ONLY connect to DB for this
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      try {
        await dbConnect();
      } catch (dbErr) {
        console.error("[Webhook] DB Connection Failed:", dbErr);
        // Still return 200 to Meta so they don't disable webhook
        return new NextResponse("EVENT_RECEIVED", { status: 200 });
      }

      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from;
      let text = "";
      let messageType = message.type;

      if (messageType === "text") {
        text = message.text.body;
      } else if (messageType === "interactive") {
        const interactive = message.interactive;
        if (interactive.type === "button_reply") {
          text = interactive.button_reply.id;
          messageType = "button_reply";
        } else if (interactive.type === "list_reply") {
          text = interactive.list_reply.id;
          messageType = "list_reply";
        }
      }

      console.log(`[Webhook] Processing Message from ${from}: "${text}"`);

      // Log Inbound
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

      // Detect Completion
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

      // Process Reminders
      const todayStr = getISTDate();
      const phoneLast10 = getPhoneLast10(from);

      const activeReminders = await Reminder.find({
        isActive: true,
        phone: { $regex: `${phoneLast10}$` },
      });

      console.log(
        `[Webhook] Found ${activeReminders.length} active reminders for phone.`,
      );

      for (const reminder of activeReminders) {
        // --- STRICT TIME & DATE CHECK ---
        const now = new Date();
        const currentISTTime = now.toLocaleTimeString("en-US", {
          timeZone: "Asia/Kolkata",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        });

        // Date Check (YYYY-MM-DD comparison)
        const createdDate = reminder.createdAt || new Date();
        const reminderDateStr = new Date(createdDate).toLocaleDateString(
          "en-CA",
          { timeZone: "Asia/Kolkata" },
        );
        const isNextDay = todayStr > reminderDateStr;

        // Time Check
        const isLateTime =
          reminder.followUpTime && currentISTTime > reminder.followUpTime;

        if (isNextDay || isLateTime) {
          console.log(
            `[Webhook] ⚠️ Reply received LATE. Date: ${isNextDay ? "Next Day" : "Same Day"}, Time: ${currentISTTime} > ${reminder.followUpTime}`,
          );

          // Mark as MISSED and Deactivate
          reminder.isActive = false;
          reminder.dailyStatus = "missed";
          await reminder.save();

          // Notify user they are late
          if (isCompletion) {
            await sendWhatsAppMessage(
              from,
              `⏳ Too late! The time limit for this habit has passed. Marked as Missed.`,
            );
          }
          continue; // Skip further processing
        }

        const newStatus = isCompletion ? "completed" : "replied";

        const execution = await ReminderExecution.findOneAndUpdate(
          { reminderId: reminder._id, date: todayStr },
          {
            $set: {
              phone: reminder.phone,
              status: newStatus,
              followUpStatus: "cancelled_by_user",
              replyReceivedAt: new Date(),
            },
            $setOnInsert: { sentAt: new Date() },
          },
          { upsert: true, new: true },
        );
        console.log(`[Webhook]    ✓ Execution upserted: ${execution._id}`);

        // Deactivate Reminder Config
        reminder.isActive = false;
        reminder.dailyStatus = newStatus;
        reminder.lastRepliedAt = new Date();
        if (isCompletion) reminder.replyText = "Completed via WhatsApp";
        await reminder.save();
        console.log(`[Webhook]    ✓ Reminder deactivated`);
      }

      // Send Confirmation
      if (activeReminders.length > 0 && isCompletion) {
        await sendWhatsAppMessage(
          from,
          "✅ Awesome! I've marked your habit as complete for today. See you tomorrow!",
        );
      }
    }
    // B. Handle Status Updates (Skip DB for speed)
    else if (body.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]) {
      // Just log to console, skip DB to prevent timeouts
      const statusObj = body.entry[0].changes[0].value.statuses[0];
      // console.log(`[Webhook] Status Update: ${statusObj.status}`);
    }

    // Always 200 OK string
    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("[Webhook] ❌ Process Error:", error);
    // Return 200 to prevent Meta retry loops on logic bugs
    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  }
}
