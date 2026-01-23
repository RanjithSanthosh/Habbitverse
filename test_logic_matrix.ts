interface Reminder {
  _id: string;
  replyText?: string;
}

interface Execution {
  reminderId: string;
  status: "sent" | "replied" | "failed";
  followUpStatus: "pending" | "sent" | "skipped" | "replied_before_followup";
  sentAt: Date;
}

// THE LOGIC FROM THE ROUTE (Fixed Version)
function calculateDailyStatus(r: Reminder, exec: Execution | undefined | null) {
  if (exec) {
    const isCompleted =
      r.replyText === "completed_habit" || r.replyText === "Completed";

    return exec.status === "replied"
      ? isCompleted
        ? "completed"
        : "replied"
      : exec.status === "sent" && exec.followUpStatus === "sent"
      ? "missed"
      : exec.status === "sent"
      ? "sent"
      : "failed";
  } else {
    // No execution today -> It's Pending or Skipped
    return "pending";
  }
}

function runTests() {
  console.log("Running Comprehensive Logic Tests...\n");
  let passed = 0;
  let failed = 0;

  const assert = (name: string, actual: string, expected: string) => {
    if (actual === expected) {
      console.log(`✅ [PASS] ${name}: ${actual}`);
      passed++;
    } else {
      console.error(
        `❌ [FAIL] ${name}: Expected '${expected}', got '${actual}'`
      );
      failed++;
    }
  };

  const rBase: Reminder = { _id: "1" };

  // 1. PENDING (No Execution)
  assert(
    "No Exec (Pending)",
    calculateDailyStatus({ ...rBase }, null),
    "pending"
  );

  // 2. SENT (Not Replied)
  const sentExec: Execution = {
    reminderId: "1",
    status: "sent",
    followUpStatus: "pending",
    sentAt: new Date(),
  };
  assert(
    "Sent, No Reply",
    calculateDailyStatus({ ...rBase }, sentExec),
    "sent"
  );

  // 3. REPLIED (Generic)
  const repliedExec: Execution = {
    reminderId: "1",
    status: "replied",
    followUpStatus: "pending", // irrelevant usually
    sentAt: new Date(),
  };
  assert(
    "Replied (Generic)",
    calculateDailyStatus({ ...rBase, replyText: "Hello" }, repliedExec),
    "replied"
  );

  // 4. COMPLETED (Replied with keyword)
  assert(
    "Completed (completed_habit)",
    calculateDailyStatus(
      { ...rBase, replyText: "completed_habit" },
      repliedExec
    ),
    "completed"
  );
  assert(
    "Completed (Completed)",
    calculateDailyStatus({ ...rBase, replyText: "Completed" }, repliedExec),
    "completed"
  );

  // 5. MISSED (Sent + FollowUp Sent)
  const missedExec: Execution = {
    reminderId: "1",
    status: "sent",
    followUpStatus: "sent",
    sentAt: new Date(),
  };
  assert("Missed", calculateDailyStatus({ ...rBase }, missedExec), "missed");

  // 6. FAILED
  const failedExec: Execution = {
    reminderId: "1",
    status: "failed",
    followUpStatus: "pending",
    sentAt: new Date(),
  };
  assert("Failed", calculateDailyStatus({ ...rBase }, failedExec), "failed");

  // 7. CROSS-DAY CONTAMINATION CHECK
  // Scenario: User completed YESTERDAY (replyText is "Completed"), but TODAY has no execution yet.
  // Result should be "pending" for today, NOT "completed".
  assert(
    "Yesterday Completed, Today Pending",
    calculateDailyStatus({ ...rBase, replyText: "Completed" }, null),
    "pending"
  );

  // Scenario: User completed YESTERDAY, Today is just "Sent".
  // Result should be "sent".
  assert(
    "Yesterday Completed, Today Sent",
    calculateDailyStatus({ ...rBase, replyText: "Completed" }, sentExec),
    "sent"
  );
  // WAIT! If relyText is "Completed" (from yesterday) and today status is "sent",
  // the logic uses exec.status ("sent").
  // Code: exec.status === "replied" ? ... : exec.status === "sent" ... -> returns "sent".
  // So this logic successfully ignores the stale "Completed" text because status is not "replied".

  // Scenario: User completed YESTERDAY. Today user replies "Busy".
  // Result should be "replied", NOT "completed".
  // PROBLEM: If they reply "Busy", r.replyText acts as "Busy".
  // But what if the webhook API hasn't updated r.replyText yet?
  // We assume r.replyText IS the latest.
  assert(
    "Today Replied 'Busy' (overwrite)",
    calculateDailyStatus({ ...rBase, replyText: "Busy" }, repliedExec),
    "replied"
  );

  console.log(`\nSummary: ${passed} Passed, ${failed} Failed.`);
}

runTests();
