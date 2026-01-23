import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import MessageLog from "@/models/MessageLog";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// Helper: Get Today's Date in IST (YYYY-MM-DD)
const getISTDate = () => {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
};

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
        const from = message.from; // Phone number

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

        // Log the incoming message
        await MessageLog.create({
          phone: from,
          direction: "inbound",
          messageType: "reply",
          content: text,
          status: "received",
          rawResponse: body,
        });

        // NORMALIZE PHONES
        const incomingDigits = from.replace(/\D/g, "");
        const incomingLast10 = incomingDigits.slice(-10);

        console.log(`[Webhook] Processing Reply from: ${from} (Text: ${text})`);

        // 2. Find Active Executions for TODAY
        const todayStr = getISTDate();

        const pendingExecutions = await ReminderExecution.find({
          date: todayStr,
          status: "sent",
        }).sort({ sentAt: -1 }); // Newest first

        // 3. Find Match using Last 10 Digits logic
        const matchedExecution = pendingExecutions.find((exec) => {
          const dbDigits = exec.phone.replace(/\D/g, "");

          if (incomingDigits.length < 10 || dbDigits.length < 10) {
            return incomingDigits === dbDigits;
          }

          const dbLast10 = dbDigits.slice(-10);
          return dbLast10 === incomingLast10;
        });

        if (matchedExecution) {
          console.log(
            `[Webhook] UPDATE STATUS: ${matchedExecution._id} -> replied`
          );

          matchedExecution.status = "replied";
          matchedExecution.replyReceivedAt = new Date();
          await matchedExecution.save();

          // --- LEGACY / SYNC SUPPORT ---
          try {
            await Reminder.findByIdAndUpdate(matchedExecution.reminderId, {
              dailyStatus: "replied",
              replyText: text, // "completed_habit" or user text
              lastRepliedAt: new Date(),
            });
          } catch (err) {
            console.error("Error updating legacy Reminder doc", err);
          }

          // --- AUTO-REPLY LOGIC ---
          if (isButtonReply && text === "completed_habit") {
            console.log("[Webhook] Sending Congratulations Message...");
            await sendWhatsAppMessage(
              from,
              "Congratulations! 🎉 Keep up the great streak!"
            );
          }

          console.log(`[Webhook] Saved successfully.`);
        } else {
          console.log(
            `[Webhook] NO MATCH found for ${from}. Verified ${pendingExecutions.length} candidates.`
          );
        }
      }
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    } else {
      return new NextResponse("Not Found", { status: 404 });
    }
  } catch (error) {
    console.error("Webhook Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
