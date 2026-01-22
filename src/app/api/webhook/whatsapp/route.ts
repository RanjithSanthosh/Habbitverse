import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import MessageLog from "@/models/MessageLog";

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

        // Find the matching reminder
        // We look for a reminder with this phone number that was sent today
        // We assume phone number format matches (e.g. strict string match)
        // Note: WhatsApp numbers usually have country code without +. User input might vary.
        // For MVP we assume Admin enters exact WhatsApp ID format or we handle basic stripping.
        // We act on the *latest* active reminder sent today.

        // Helper: Check valid window (sent today)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Flexible phone matching strategy:
        // WhatsApp API sends full format (e.g., 919876543210 or 15551234567)
        // Admin might have saved as 9876543210 or +919876543210.
        // We try to match the last 10 digits to be safe for India/USA common cases.
        // For production "Strict" matching, we should enforce E.164 on input.
        // Here we do a "best effort" match.

        const last10Digits = from.slice(-10);

        // Find reminders sent today where the phone ends with these digits
        const reminders = await Reminder.find({
          isActive: true,
          lastSentAt: { $gte: startOfDay },
        });

        const reminder = reminders.find((r) =>
          r.phone.replace(/\D/g, "").endsWith(last10Digits)
        );

        if (reminder) {
          console.log(
            `[Webhook] Reply received for ${reminder.title} from ${from}: ${text}`
          );

          reminder.dailyStatus = "replied";
          reminder.replyText = text;
          reminder.lastRepliedAt = new Date();
          // IMPORTANT: If they replied, we should NOT send the follow-up
          // The cron job checks for dailyStatus === 'sent' && followUpSent === false.
          // By setting dailyStatus to 'replied', the cron loop will implicitly skip it.
          // We can also explicitly force followUpSent to true to be double safe, or just rely on status.
          // Let's rely on status 'replied' which is semantic.

          await reminder.save();
        } else {
          console.log(
            `[Webhook] No active reminder found for ${from} (Last 10: ${last10Digits})`
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
