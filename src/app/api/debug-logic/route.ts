import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import ReminderExecution from "@/models/ReminderExecution";
import Reminder from "@/models/Reminder";

// Copy exact helper from webhook
const getISTDate = () => {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
};

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const todayStr = getISTDate();
    const now = new Date();

    // 1. Create a dummy test reminder if not exists
    const testPhone = "919999999999";

    let reminder = await Reminder.findOne({ phone: testPhone });
    if (!reminder) {
      reminder = await Reminder.create({
        phone: testPhone,
        title: "Test Debug Habit",
        message: "Test Message",
        reminderTime: "10:00",
        followUpTime: "11:00",
        isActive: true,
      });
    }

    // 2. Create a dummy execution for TODAY
    await ReminderExecution.deleteMany({ phone: testPhone, date: todayStr });
    const execution = await ReminderExecution.create({
      reminderId: reminder._id,
      phone: testPhone,
      date: todayStr,
      status: "sent",
      followUpStatus: "pending",
      sentAt: now,
    });

    // 3. SIMULATE WEBHOOK LOGIC
    // Input: Phone number as it comes from WhatsApp (often no +)
    const incomingFrom = "919999999999";

    // NORMALIZE PHONES
    const incomingDigits = incomingFrom.replace(/\D/g, "");
    const incomingLast10 = incomingDigits.slice(-10);

    // 2. Find Active Executions for TODAY
    // Find ALL executions for today (don't filter by status 'sent', looking for ANY match)
    const todaysExecutions = await ReminderExecution.find({
      date: todayStr,
    }).sort({ sentAt: -1 });

    // 3. Find Match using Last 10 Digits logic
    const matchedExecution = todaysExecutions.find((exec) => {
      const dbDigits = exec.phone.replace(/\D/g, "");
      // Strict match if lengths are small (unlikely), else suffix match
      if (dbDigits.length < 10 || incomingDigits.length < 10) {
        return dbDigits === incomingDigits;
      }
      return dbDigits.slice(-10) === incomingLast10;
    });

    let resultLog = [];
    resultLog.push(`Server Time: ${now.toString()}`);
    resultLog.push(`IST Date Generated: ${todayStr}`);
    resultLog.push(`Test Phone: ${testPhone}`);
    resultLog.push(`Incoming From: ${incomingFrom}`);
    resultLog.push(`Found ${todaysExecutions.length} executions for today.`);

    if (matchedExecution) {
      resultLog.push(`MATCH FOUND! ID: ${matchedExecution._id}`);

      // Simulate Update
      matchedExecution.status = "completed";
      matchedExecution.followUpStatus = "cancelled_by_user";
      await matchedExecution.save();

      // Verify Update
      const verified = await ReminderExecution.findById(matchedExecution._id);
      resultLog.push(`Post-Update Status: ${verified?.status}`);
      resultLog.push(`Post-Update FollowUp: ${verified?.followUpStatus}`);

      if (
        verified?.status === "completed" &&
        verified?.followUpStatus === "cancelled_by_user"
      ) {
        resultLog.push("SUCCESS: Logic works correctly for this test case.");
      } else {
        resultLog.push("FAILURE: Did not save correctly.");
      }
    } else {
      resultLog.push("FAILURE: No match found.");
      todaysExecutions.forEach((e) => {
        resultLog.push(`Candidate: ${e.phone} (ID: ${e._id})`);
      });
    }

    return NextResponse.json({ logs: resultLog });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack });
  }
}
