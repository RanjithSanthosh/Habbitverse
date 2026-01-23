import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import ReminderExecution from "@/models/ReminderExecution";
import { verifyAuth, unauthorized } from "@/lib/auth";

// Helper: Get Today's Date in IST
const getISTDate = () => {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
};

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

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

      const isCompleted = r.replyText === "completed_habit" || r.replyText === "Completed";
      
      doc.dailyStatus =
        exec.status === "replied"
          ? (isCompleted ? "completed" : "replied")
          : exec.status === "sent" && exec.followUpStatus === "sent"
          ? "missed"
          : exec.status === "sent"
          ? "sent"
          : "failed";

       if (isCompleted) {
           doc.replyText = "Marked as Completed via Button";
       }
    } else {
      // No execution today -> It's Pending or Skipped
      doc.dailyStatus = "pending";
      doc.lastSentAt = undefined; // Don't show yesterday's time as today's
      doc.followUpSent = false;
      doc.replyText = undefined;
    }
    return doc;
  });

  return NextResponse.json(mergedData);
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
