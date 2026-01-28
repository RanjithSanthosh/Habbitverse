import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import ReminderExecution from "@/models/ReminderExecution";
import Reminder from "@/models/Reminder";
import { getISTDate } from "@/lib/dateUtils";

/**
 * DEBUG ENDPOINT
 * GET /api/debug-reply?phone=919876543210
 * 
 * This manually simulates a user reply to test if the database updates work
 */
export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json({
        error: "Phone parameter required. Example: /api/debug-reply?phone=919876543210"
      }, { status: 400 });
    }

    const todayStr = getISTDate();
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneLast10 = phoneDigits.slice(-10);

    console.log(`[Debug] Checking phone: ${phone}`);
    console.log(`[Debug] Looking for date: ${todayStr}`);
    console.log(`[Debug] Phone last 10 digits: ${phoneLast10}`);

    // Find all executions for today
    const executions = await ReminderExecution.find({ date: todayStr });
    console.log(`[Debug] Found ${executions.length} total executions`);

    const matched = [];
    for (const exec of executions) {
      const execDigits = exec.phone.replace(/\D/g, "");
      const execLast10 = execDigits.slice(-10);
      
      if (execLast10 === phoneLast10) {
        matched.push({
          id: exec._id,
          phone: exec.phone,
          status: exec.status,
          followUpStatus: exec.followUpStatus,
          sentAt: exec.sentAt,
          replyReceivedAt: exec.replyReceivedAt,
        });
      }
    }

    if (matched.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No executions found for this phone number today",
        phone: phone,
        date: todayStr,
        totalExecutions: executions.length,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Found ${matched.length} execution(s)`,
      phone: phone,
      date: todayStr,
      executions: matched,
    });

  } catch (error) {
    console.error("[Debug] Error:", error);
    return NextResponse.json({
      error: "Failed to check status",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/debug-reply
 * Body: { "phone": "919876543210" }
 * 
 * Manually mark an execution as replied (for testing)
 */
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const body = await req.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json({
        error: "Phone number required in request body"
      }, { status: 400 });
    }

    const todayStr = getISTDate();
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneLast10 = phoneDigits.slice(-10);

    console.log(`[Debug] Manually marking as replied: ${phone}`);

    const executions = await ReminderExecution.find({ date: todayStr });
    let updated = 0;

    for (const exec of executions) {
      const execDigits = exec.phone.replace(/\D/g, "");
      const execLast10 = execDigits.slice(-10);
      
      if (execLast10 === phoneLast10) {
        console.log(`[Debug] Updating execution ${exec._id}`);
        console.log`[Debug] Before: status=${exec.status}, followUp=${exec.followUpStatus}`);

        exec.status = "replied";
        exec.followUpStatus = "cancelled_by_user";
        exec.replyReceivedAt = new Date();
        await exec.save();

        // Verify
        const verified = await ReminderExecution.findById(exec._id);
        console.log(`[Debug] After: status=${verified?.status}, followUp=${verified?.followUpStatus}`);

        if (verified?.followUpStatus === "cancelled_by_user") {
          updated++;

          // Also deactivate reminder
          const reminder = await Reminder.findById(exec.reminderId);
          if (reminder) {
            reminder.isActive = false;
            reminder.dailyStatus = "replied";
            reminder.lastRepliedAt = new Date();
            await reminder.save();
            console.log(`[Debug] Deactivated reminder ${reminder._id}`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${updated} execution(s)`,
      phone: phone,
      date: todayStr,
      updated: updated,
    });

  } catch (error) {
    console.error("[Debug] Error:", error);
    return NextResponse.json({
      error: "Failed to update",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
