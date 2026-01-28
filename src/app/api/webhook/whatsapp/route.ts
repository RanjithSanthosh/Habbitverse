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
        console.log(`[Webhook] Text: "${text}"`);
        console.log(`[Webhook] Text Length: ${text.length}`);
        console.log(`[Webhook] Button: ${isButtonReply}`);

        // ================================================================
        // IMMEDIATE BLOCKING FUNCTION
        // When user clicks "Completed", we DIRECTLY block the follow-up
        // ================================================================

        // Normalize text: trim whitespace and convert to lowercase
        const normalizedText = text.trim().toLowerCase();
        console.log(`[Webhook] Normalized Text: "${normalizedText}"`);

        const isCompletion =
          text === "completed_habit" || // Button ID (exact match)
          normalizedText === "completed" ||
          normalizedText === "complete" ||
          normalizedText === "done" ||
          normalizedText.includes("complete") ||
          normalizedText.includes("done");

        console.log(`[Webhook] isCompletion: ${isCompletion}`);

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

          console.log(
            `[Webhook] Looking for execution - Date: ${todayStr}, Phone last 10: ${phoneLast10}`
          );

          const executions = await ReminderExecution.find({ date: todayStr });
          console.log(
            `[Webhook] Found ${executions.length} total executions for today`
          );

          const matched = executions.find((exec) => {
            const execDigits = exec.phone.replace(/\D/g, "");
            const execLast10 = execDigits.slice(-10);
            console.log(
              `[Webhook] Comparing ${execLast10} with ${phoneLast10}`
            );
            return execLast10 === phoneLast10;
          });

          if (matched) {
            console.log(`[Webhook] ✓ MATCHED execution ID: ${matched._id}`);
            console.log(
              `[Webhook] Before update - Status: ${matched.status}, FollowUpStatus: ${matched.followUpStatus}`
            );

            // Update execution fields
            matched.status = "replied";
            matched.followUpStatus = "cancelled_by_user";
            matched.replyReceivedAt = new Date();

            // Save with error handling
            try {
              await matched.save();
              console.log(`[Webhook] ⚡ EXECUTION SAVED TO DATABASE`);

              // CRITICAL: Verify the save actually worked
              const verified = await ReminderExecution.findById(matched._id);
              if (verified) {
                console.log(
                  `[Webhook] ✓ VERIFIED - Status: ${verified.status}, FollowUpStatus: ${verified.followUpStatus}`
                );

                if (verified.followUpStatus !== "cancelled_by_user") {
                  console.error(
                    `[Webhook] ❌ CRITICAL: Database save FAILED - followUpStatus not updated!`
                  );
                  // Retry the save
                  verified.status = "replied";
                  verified.followUpStatus = "cancelled_by_user";
                  verified.replyReceivedAt = new Date();
                  await verified.save();
                  console.log(`[Webhook] 🔄 RETRIED save operation`);
                }
              } else {
                console.error(
                  `[Webhook] ❌ CRITICAL: Could not verify execution save!`
                );
              }
            } catch (saveError) {
              console.error(`[Webhook] ❌ Error saving execution:`, saveError);
              throw saveError; // Re-throw to trigger outer error handler
            }

            // Deactivate the reminder - user replied, flow complete
            try {
              const reminder = await Reminder.findById(matched.reminderId);
              if (reminder && reminder.isActive) {
                reminder.isActive = false;
                reminder.dailyStatus = "replied";
                reminder.lastRepliedAt = new Date();
                await reminder.save();

                // Verify reminder deactivation
                const verifiedReminder = await Reminder.findById(
                  matched.reminderId
                );
                console.log(
                  `[Webhook] ⚡ Reminder deactivated - isActive: ${verifiedReminder?.isActive}`
                );

                if (verifiedReminder?.isActive) {
                  console.error(
                    `[Webhook] ❌ CRITICAL: Reminder deactivation FAILED!`
                  );
                  // Retry
                  verifiedReminder.isActive = false;
                  verifiedReminder.dailyStatus = "replied";
                  await verifiedReminder.save();
                  console.log(`[Webhook] 🔄 RETRIED reminder deactivation`);
                }
              }
            } catch (reminderError) {
              console.error(
                `[Webhook] ❌ Error deactivating reminder:`,
                reminderError
              );
              // Don't throw - execution update is more critical
            }

            console.log(
              `[Webhook] ✅ COMPLETE - Reply processed and follow-up cancelled`
            );
          } else {
            console.log(
              `[Webhook] ✗ NO MATCHING execution found for phone: ${from}`
            );
            console.log(`[Webhook] Phone last 10 digits: ${phoneLast10}`);
            console.log(`[Webhook] Executions checked: ${executions.length}`);
            if (executions.length > 0) {
              console.log(`[Webhook] Sample execution phones:`);
              executions.slice(0, 3).forEach((exec) => {
                const execDigits = exec.phone.replace(/\D/g, "");
                console.log(
                  `[Webhook]   - ${exec.phone} (last 10: ${execDigits.slice(
                    -10
                  )})`
                );
              });
            }
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

    console.log(
      `[Webhook] Direct block - Looking for executions on ${todayStr}`
    );
    const executions = await ReminderExecution.find({ date: todayStr });
    console.log(
      `[Webhook] Direct block - Found ${executions.length} executions`
    );

    let blocked = 0;
    for (const exec of executions) {
      const execDigits = exec.phone.replace(/\D/g, "");
      if (execDigits.slice(-10) === phoneLast10) {
        console.log(`[Webhook] Direct blocking execution ${exec._id}`);
        console.log(
          `[Webhook] Before: status=${exec.status}, followUp=${exec.followUpStatus}`
        );

        exec.status = "completed";
        exec.followUpStatus = "cancelled_by_user";
        exec.replyReceivedAt = new Date();
        await exec.save();

        // Verify the save
        const verified = await ReminderExecution.findById(exec._id);
        console.log(
          `[Webhook] After: status=${verified?.status}, followUp=${verified?.followUpStatus}`
        );

        if (verified?.followUpStatus === "cancelled_by_user") {
          blocked++;
          console.log(`[Webhook] ✓ Execution ${exec._id} successfully blocked`);
        } else {
          console.error(`[Webhook] ❌ Failed to block execution ${exec._id}`);
        }
      }
    }

    console.log(`[Webhook] ✓ Direct block completed - ${blocked} executions`);

    if (blocked > 0) {
      // Deactivate all matching reminders
      for (const exec of executions) {
        const execDigits = exec.phone.replace(/\D/g, "");
        if (execDigits.slice(-10) === phoneLast10) {
          const reminder = await Reminder.findById(exec.reminderId);
          if (reminder && reminder.isActive) {
            console.log(`[Webhook] Deactivating reminder ${reminder._id}`);
            reminder.isActive = false;
            reminder.dailyStatus = "completed";
            reminder.lastRepliedAt = new Date();
            await reminder.save();

            // Verify
            const verifiedReminder = await Reminder.findById(reminder._id);
            console.log(
              `[Webhook] ⚡ Reminder ${reminder._id} deactivated - isActive: ${verifiedReminder?.isActive}`
            );
          }
        }
      }

      await sendWhatsAppMessage(
        phone,
        "✅ Completed! Great job. Follow-up cancelled."
      );
    } else {
      console.error(`[Webhook] ❌ No executions were blocked!`);
    }
  } catch (error) {
    console.error(`[Webhook] Direct block failed:`, error);
    throw error; // Re-throw to notify caller
  }
}
