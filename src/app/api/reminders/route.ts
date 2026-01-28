import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import { verifyAuth, unauthorized } from "@/lib/auth";
import { getISTDate } from "@/lib/dateUtils";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  try {
    await dbConnect();

    // 1. Fetch all configurations
    const reminders = await Reminder.find().sort({ createdAt: -1 });

    // 2. Fetch today's executions
    const todayStr = getISTDate();
    const todaysExecutions = await ReminderExecution.find({ date: todayStr });

    // 3. Map executions to a lookup object by reminderId
    const executionMap: Record<string, any> = {};
    todaysExecutions.forEach((exec) => {
      executionMap[exec.reminderId.toString()] = exec;
    });

    // 4. Merge Data for UI
    const mergedData = reminders.map((r) => {
      const exec = executionMap[r._id.toString()];
      const doc = r.toObject();

      if (exec) {
        // Source of Truth: The Execution Record
        // If execution status is explicitly 'completed', use it.
        // Otherwise fallback to 'replied' if status is replied.

        let status = exec.status;

        // Handle Follow-up states if still just 'sent'
        if (status === "sent") {
          if (exec.followUpStatus === "sent") {
            status = "missed"; // or 'sent_followup' depending on UI needs, treating as risk of missing
          } else if (exec.followUpStatus === "skipped") {
            status = "sent";
          }
        }

        doc.dailyStatus = status;

        doc.lastSentAt = exec.sentAt;
        doc.followUpSent = exec.followUpStatus === "sent";

        if (status === "completed") {
          doc.replyText = "Completed via WhatsApp";
        } else if (status === "replied") {
          // If we have legacy text store, show it, otherwise generic
          doc.replyText = r.replyText || "Replied";
        }
      } else {
        // No execution today
        // fallback: If Reminder says completed/replied today, respect it
        // This handles cases where execution might be missing due to race conditions or manual updates
        if (doc.dailyStatus === "completed" || doc.dailyStatus === "replied") {
          // keep existing status as it's terminal
          // ensure we don't show it as pending
        } else {
          doc.dailyStatus = "pending";
          doc.lastSentAt = undefined;
          doc.followUpSent = false;
          doc.replyText = undefined;
        }
      }
      return doc;
    });

    return NextResponse.json(mergedData);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch reminders" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  try {
    const body = await req.json();
    await dbConnect();

    // Basic Validation
    if (
      !body.phone ||
      !body.title ||
      !body.message ||
      !body.reminderTime ||
      !body.followUpTime
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Format Phone: Ensure it has 91 prefix for India if 10 digits
    let phone = body.phone.trim().replace(/\D/g, ""); // Remove non-digits
    if (phone.length === 10) {
      phone = "91" + phone;
    }

    const reminder = await Reminder.create({ ...body, phone });
    return NextResponse.json(reminder);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create reminder" },
      { status: 500 }
    );
  }
}
