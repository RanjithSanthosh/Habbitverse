import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import MessageLog from "@/models/MessageLog";

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
        const text = message.text ? message.text.body : "";

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

        const rawBody = JSON.stringify(body, null, 2);
        // console.log("[Webhook] Received Body:", rawBody);

        // NORMALIZE PHONES
        // 1. Incoming: Strip non-digits
        const incomingDigits = from.replace(/\D/g, "");
        const incomingLast10 = incomingDigits.slice(-10);

        console.log(
          `[Webhook] Processing Reply from: ${from} (Digits: ${incomingDigits}, Last10: ${incomingLast10})`
        );

        // 2. Find Active Executions for TODAY
        const todayStr = getISTDate();

        // We look for executions that are 'sent' (waiting for reply)
        // Optimization: Regex match on phone could work, but let's fetch all 'sent' today and filter in JS for robustness
        const pendingExecutions = await ReminderExecution.find({
          date: todayStr,
          status: "sent",
        }).sort({ sentAt: -1 }); // Newest first

        console.log(
          `[Webhook] Found ${pendingExecutions.length} pending executions for today (${todayStr}).`
        );

        // 3. Find Match using Last 10 Digits logic
        const matchedExecution = pendingExecutions.find((exec) => {
          // Normalize DB phone: remove non-digits
          const dbDigits = exec.phone.replace(/\D/g, "");

          // Safety: If either is too short, do strict equality check
          if (incomingDigits.length < 10 || dbDigits.length < 10) {
            return incomingDigits === dbDigits;
          }

          // Otherwise use 10-digit suffix matching (robust for +91 vs 91 vs 0)
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
          // Also update the main Reminder document to reflect the latest status
          // This ensures the UI or other parts of the system see "replied"
          try {
            await Reminder.findByIdAndUpdate(matchedExecution.reminderId, {
              dailyStatus: "replied",
              replyText: text,
              lastRepliedAt: new Date(),
            });
          } catch (err) {
            console.error("Error updating legacy Reminder doc", err);
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
