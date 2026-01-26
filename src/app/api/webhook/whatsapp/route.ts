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
    console.log("[Webhook] Received message");

    if (body.object) {
      if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;

        let text = "";
        let isButtonReply = false;

        if (message.type === "text") {
          text = message.text.body;
        } else if (message.type === "interactive") {
          const interactive = message.interactive;
          if (interactive.type === "button_reply") {
            text = interactive.button_reply.id;
            isButtonReply = true;
          }
        }

        await dbConnect();

        // Log the message
        await MessageLog.create({
          phone: from,
          direction: "inbound",
          messageType: "reply",
          content: text,
          status: "received",
          rawResponse: body,
        });

        console.log(`[Webhook] >>> MESSAGE RECEIVED <<<`);
        console.log(`[Webhook] From: ${from}`);
        console.log(`[Webhook] Text: ${text}`);
        console.log(`[Webhook] Button: ${isButtonReply}`);

        // ================================================================
        // IMMEDIATE BLOCKING FUNCTION
        // When user clicks "Completed", we DIRECTLY block the follow-up
        // ================================================================
        const isCompletion =
          text === "completed_habit" ||
          text.toLowerCase().includes("complete") ||
          text.toLowerCase().includes("done");

        if (isCompletion) {
          console.log(`[Webhook] ⚠️  COMPLETION DETECTED - BLOCKING FOLLOW-UP`);

          try {
            // Call the dedicated blocking endpoint
            const blockResponse = await fetch(
              `${
                process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
              }/api/block-followup`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: from }),
              }
            );

            const blockResult = await blockResponse.json();

            console.log(`[Webhook] Block result:`, blockResult);

            if (blockResult.success) {
              console.log(
                `[Webhook] ✓ FOLLOW-UP BLOCKED - ${blockResult.blocked} executions updated`
              );

              // Send confirmation
              await sendWhatsAppMessage(
                from,
                "✅ Completed! Great job. Follow-up cancelled."
              );
            } else {
              console.error(`[Webhook] ✗ Block failed:`, blockResult.error);

              // Fallback: Try direct database update
              console.log(`[Webhook] Attempting direct database update...`);
              await directBlockFollowup(from);
            }
          } catch (error) {
            console.error(`[Webhook] ✗ Error calling block endpoint:`, error);

            // Fallback: Direct database update
            console.log(`[Webhook] Attempting direct database update...`);
            await directBlockFollowup(from);
          }
        } else {
          // Regular reply (not completion)
          console.log(`[Webhook] Regular reply received`);

          const todayStr = getISTDate();
          const phoneDigits = from.replace(/\D/g, "");
          const phoneLast10 = phoneDigits.slice(-10);

          const executions = await ReminderExecution.find({ date: todayStr });

          const matched = executions.find((exec) => {
            const execDigits = exec.phone.replace(/\D/g, "");
            return execDigits.slice(-10) === phoneLast10;
          });

          if (matched) {
            matched.status = "replied";
            matched.followUpStatus = "cancelled_by_user";
            matched.replyReceivedAt = new Date();
            await matched.save();

            console.log(`[Webhook] ✓ Marked as replied - follow-up cancelled`);
          }
        }
      }
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    }
  } catch (error) {
    console.error("[Webhook] ✗ ERROR:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// Fallback function for direct blocking
async function directBlockFollowup(phone: string) {
  try {
    const todayStr = getISTDate();
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneLast10 = phoneDigits.slice(-10);

    const executions = await ReminderExecution.find({ date: todayStr });

    let blocked = 0;
    for (const exec of executions) {
      const execDigits = exec.phone.replace(/\D/g, "");
      if (execDigits.slice(-10) === phoneLast10) {
        console.log(`[Webhook] Direct blocking execution ${exec._id}`);

        exec.status = "completed";
        exec.followUpStatus = "cancelled_by_user";
        exec.replyReceivedAt = new Date();
        await exec.save();

        blocked++;
      }
    }

    console.log(`[Webhook] ✓ Direct block completed - ${blocked} executions`);

    if (blocked > 0) {
      await sendWhatsAppMessage(
        phone,
        "✅ Completed! Great job. Follow-up cancelled."
      );
    }
  } catch (error) {
    console.error(`[Webhook] Direct block failed:`, error);
  }
}
