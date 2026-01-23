import mongoose from "mongoose";
import Reminder from "./src/models/Reminder";
import ReminderExecution from "./src/models/ReminderExecution";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const TEST_PHONE = "918888888888";

async function runTests() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("No MONGODB_URI found");
    return;
  }

  console.log("Connecting to DB...");
  await mongoose.connect(uri);

  try {
    // 1. CLEANUP
    console.log("Cleaning up test data...");
    await Reminder.deleteMany({ phone: TEST_PHONE });
    await ReminderExecution.deleteMany({ phone: TEST_PHONE });

    // 2. SETUP REMINDER
    console.log("Creating Test Reminder...");
    const reminder = await Reminder.create({
      phone: TEST_PHONE,
      title: "Test Case",
      message: "Hello",
      reminderTime: "10:00",
      followUpMessage: "Follow up?",
      followUpTime: "11:00",
      isActive: true,
    });
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    // --- CASE 1: PENDING (No execution) ---
    console.log("\n--- TEST CASE 1: PENDING ---");
    // API Logic Simulation
    let exec = await ReminderExecution.findOne({
      reminderId: reminder._id,
      date: todayStr,
    });
    let status = exec ? exec.status : "pending";
    console.log(`Expected: pending, Actual: ${status}`);
    if (status !== "pending") throw new Error("Case 1 Failed");

    // --- CASE 2: SENT (Waiting for Reply) ---
    console.log("\n--- TEST CASE 2: SENT ---");
    await ReminderExecution.create({
      reminderId: reminder._id,
      phone: TEST_PHONE,
      date: todayStr,
      status: "sent",
      sentAt: new Date(),
      followUpStatus: "pending",
    });
    exec = await ReminderExecution.findOne({
      reminderId: reminder._id,
      date: todayStr,
    });
    console.log(`Expected: sent, Actual: ${exec?.status}`);
    if (exec?.status !== "sent") throw new Error("Case 2 Failed");

    // --- CASE 3: COMPLETED (Button Click) ---
    console.log("\n--- TEST CASE 3: COMPLETED ---");
    // Simulate Webhook update
    exec!.status = "replied";
    exec!.replyReceivedAt = new Date();
    await exec!.save();

    // Simulate legacy update with button payload text
    reminder.dailyStatus = "replied";
    reminder.replyText = "completed_habit"; // This matches the button ID
    await reminder.save();

    // Verify API Logic:
    const isCompleted = reminder.replyText === "completed_habit";
    const finalStatus =
      exec!.status === "replied"
        ? isCompleted
          ? "completed"
          : "replied"
        : "failed";

    console.log(`Reply Text: ${reminder.replyText}`);
    console.log(`Expected: completed, Actual: ${finalStatus}`);

    if (finalStatus !== "completed") throw new Error("Case 3 Failed");

    // --- CASE 4: MISSED (Follow-up sent) ---
    console.log("\n--- TEST CASE 4: MISSED ---");
    // Reset
    await ReminderExecution.deleteOne({ _id: exec!._id });
    await ReminderExecution.create({
      reminderId: reminder._id,
      phone: TEST_PHONE,
      date: todayStr,
      status: "sent",
      sentAt: new Date(),
      followUpStatus: "sent",
      followUpSentAt: new Date(),
    });
    exec = await ReminderExecution.findOne({
      reminderId: reminder._id,
      date: todayStr,
    });
    // API Logic for Missed: status=sent AND followUpStatus=sent
    const missedStatus =
      exec!.status === "sent" && exec!.followUpStatus === "sent"
        ? "missed"
        : "other";
    console.log(`Expected: missed, Actual: ${missedStatus}`);
    if (missedStatus !== "missed") throw new Error("Case 4 Failed");

    console.log("\nALL TESTS PASSED SUCCESSFULLY ✅");
  } catch (err) {
    console.error("Test Failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
