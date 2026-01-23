import mongoose from "mongoose";
import ReminderExecution, {
  IReminderExecution,
} from "./src/models/ReminderExecution";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testCronSuppression() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return console.error("No Mongo URI");

  await mongoose.connect(uri);

  try {
    const todayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const fakeId = new mongoose.Types.ObjectId();

    // 1. Setup Initial State (Sent, Pending Followup)
    console.log("Creating Mock Execution...");
    const exec = await ReminderExecution.create({
      reminderId: fakeId,
      phone: "919999999999",
      date: todayStr,
      status: "sent",
      sentAt: new Date(),
      followUpStatus: "pending",
    });

    // 2. Simulate logic of Cron (Should finding it)
    let candidates = await ReminderExecution.find({
      date: todayStr,
      status: "sent",
      followUpStatus: "pending",
    });
    console.log(
      `[Before Reply] Cron candidates found: ${candidates.length} (Expected >= 1)`
    );
    if (!candidates.find((c) => c._id.toString() === exec._id.toString())) {
      throw new Error("Setup failed: Cron didn't find the pending execution");
    }

    // 3. Simulate Webhook (User clicks "Complete")
    console.log("Simulating Webhook 'Complete' Click...");

    // -- Logic copied from route.ts --
    exec.status = "replied";
    if (exec.followUpStatus === "pending") {
      exec.followUpStatus = "replied_before_followup"; // The new line I added
    }
    await exec.save();
    // ----------------------------

    // 4. Simulate logic of Cron AGAIN
    candidates = await ReminderExecution.find({
      date: todayStr,
      status: "sent",
      followUpStatus: "pending",
    });
    console.log(`[After Reply] Cron candidates found: ${candidates.length}`);

    const stillFound = candidates.find(
      (c) => c._id.toString() === exec._id.toString()
    );

    if (stillFound) {
      console.error(
        "❌ FAILED: The execution is still being picked up by Cron!"
      );
    } else {
      console.log("✅ SUCCESS: The execution is NO LONGER picked up by Cron.");
      console.log("   Status in DB:", exec.status);
      console.log("   FollowUpStatus in DB:", exec.followUpStatus);
    }

    // Cleanup
    await ReminderExecution.deleteOne({ _id: exec._id });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

testCronSuppression();
