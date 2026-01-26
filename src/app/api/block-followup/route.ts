import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import ReminderExecution from "@/models/ReminderExecution";
import Reminder from "@/models/Reminder";
import { getISTDate } from "@/lib/dateUtils";

/**
 * DIRECT BLOCKING ENDPOINT
 * This endpoint is called to immediately block a follow-up for a given phone number
 * It's designed to be fast and reliable with minimal logic
 */
export async function POST(req: NextRequest) {
  try {
    const { phone, reminderId } = await req.json();

    await dbConnect();

    const todayStr = getISTDate();

    console.log(`[Block] >>> DIRECT BLOCK REQUEST <<<`);
    console.log(`[Block] Phone: ${phone}`);
    console.log(`[Block] ReminderId: ${reminderId || "ANY"}`);
    console.log(`[Block] Date: ${todayStr}`);

    // Normalize phone
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneLast10 = phoneDigits.slice(-10);

    // Find ALL executions for today
    const executions = await ReminderExecution.find({
      date: todayStr,
    });

    console.log(
      `[Block] Found ${executions.length} total executions for today`
    );

    // Find matching execution by phone
    let matched = [];
    for (const exec of executions) {
      const execDigits = exec.phone.replace(/\D/g, "");
      const execLast10 = execDigits.slice(-10);

      if (execLast10 === phoneLast10) {
        // If reminderId specified, also match that
        if (reminderId) {
          if (exec.reminderId.toString() === reminderId) {
            matched.push(exec);
          }
        } else {
          matched.push(exec);
        }
      }
    }

    console.log(`[Block] Matched ${matched.length} executions`);

    if (matched.length === 0) {
      console.log(`[Block] ✗ NO MATCH FOUND`);
      return NextResponse.json(
        {
          success: false,
          error: "No execution found for this phone today",
        },
        { status: 404 }
      );
    }

    // Update ALL matched executions (usually just 1, but be thorough)
    const updated = [];
    for (const exec of matched) {
      console.log(`[Block] Updating execution ${exec._id}`);
      console.log(
        `[Block] Before: status=${exec.status}, followUp=${exec.followUpStatus}`
      );

      exec.status = "completed";
      exec.followUpStatus = "cancelled_by_user";
      exec.replyReceivedAt = new Date();

      await exec.save();

      // VERIFY
      const verified = await ReminderExecution.findById(exec._id);
      console.log(
        `[Block] After: status=${verified?.status}, followUp=${verified?.followUpStatus}`
      );

      updated.push({
        id: exec._id.toString(),
        status: verified?.status,
        followUpStatus: verified?.followUpStatus,
      });

      // Also update Reminder model
      if (exec.reminderId) {
        await Reminder.findByIdAndUpdate(exec.reminderId, {
          dailyStatus: "completed",
          lastRepliedAt: new Date(),
        });
      }
    }

    console.log(`[Block] ✓ SUCCESS - Blocked ${updated.length} executions`);

    return NextResponse.json({
      success: true,
      blocked: updated.length,
      executions: updated,
    });
  } catch (error: any) {
    console.error("[Block] ✗ ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
