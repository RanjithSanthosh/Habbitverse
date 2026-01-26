import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import { verifyAuth, unauthorized } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  try {
    const body = await req.json();
    await dbConnect();

    const reminder = await Reminder.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    // CRITICAL FIX: Sync with ReminderExecution
    // If the user manually updates status to "completed" via UI, we must
    // update the Execution record so the Cron job doesn't send a follow-up.
    if (body.dailyStatus) {
      // Get Today's Date in IST (YYYY-MM-DD)
      const todayDateStr = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });

      const ReminderExecutionModule = await import(
        "@/models/ReminderExecution"
      );
      const ReminderExecution = ReminderExecutionModule.default;

      const execution = await ReminderExecution.findOne({
        reminderId: id,
        date: todayDateStr,
      });

      if (execution) {
        if (
          body.dailyStatus === "completed" ||
          body.dailyStatus === "replied"
        ) {
          execution.status = body.dailyStatus;

          // Cancel follow-up if not sent yet
          if (execution.followUpStatus === "pending") {
            execution.followUpStatus = "cancelled_by_user";
          }
          await execution.save();
        }
      }
    }

    return NextResponse.json(reminder);
  } catch (error) {
    console.error("Error updating reminder:", error);
    return NextResponse.json(
      { error: "Failed to update reminder" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  try {
    await dbConnect();
    await Reminder.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete reminder" },
      { status: 500 }
    );
  }
}
