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

        const rawBody = JSON.stringify(body, null, 2);
        console.log("[Webhook] Received Body:", rawBody);

        // NORMALIZE PHONES
        // 1. Incoming: Strip non-digits
        // Safe access because we are inside the 'if' block checking structure
        const incomingDigits = from.replace(/\D/g, "");
        const incomingLast10 = incomingDigits.slice(-10);

        console.log(
          `[Webhook] Processing Reply from: ${from} (Digits: ${incomingDigits}, Last10: ${incomingLast10})`
        );

        // 2. Fetch ALL active reminders (optimization: could filter by date here, but let's do in memory for complex matching)
        // We only care about reminders sent recently (e.g. last 24h) to avoid reviving old ones
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const potentialReminders = await Reminder.find({
          isActive: true,
          lastSentAt: { $gte: yesterday },
        });

        console.log(
          `[Webhook] Found ${potentialReminders.length} potential active reminders since yesterday.`
        );

        // 3. Find Match
        // We look for any reminder where the stored phone *ends with* the incoming last 10
        // OR the incoming phone *ends with* the stored phone (if stored is short)
        const matchedReminder = potentialReminders.find((r) => {
          const dbDigits = r.phone.replace(/\D/g, "");
          const isMatch =
            dbDigits.endsWith(incomingLast10) ||
            incomingDigits.endsWith(dbDigits);

          if (isMatch) {
            console.log(`   -> MATCH FOUND: ${r.title} (DB Phone: ${r.phone})`);
          }
          return isMatch;
        });

        if (matchedReminder) {
          console.log(
            `[Webhook] UPDATE STATUS: ${matchedReminder._id} -> replied`
          );

          matchedReminder.dailyStatus = "replied";
          matchedReminder.replyText = text;
          matchedReminder.lastRepliedAt = new Date();

          await matchedReminder.save();
          console.log(`[Webhook] Saved successfully.`);
        } else {
          console.log(
            `[Webhook] NO MATCH found for ${from}. Verified ${potentialReminders.length} candidates.`
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
