# 🐛 Reply Tracking Debug Guide

## Issue Reported

> "The reply status is not tracking. Even though the user replied 'completed', the follow-up message is still sending."

## 🔍 Diagnosis Steps

### Step 1: Check if Webhook is Receiving Messages

**Look for these logs when user replies:**

```
[Webhook] >>> MESSAGE RECEIVED <<<
[Webhook] From: 919876543210
[Webhook] Text: completed (or user's message)
[Webhook] Button: true/false
```

**If you DON'T see these logs:**

- ❌ Webhook is NOT receiving messages from WhatsApp
- Check WhatsApp webhook configuration
- Verify WHATSAPP_VERIFY_TOKEN is correct
- Check webhook URL is publicly accessible

**If you DO see these logs:** ✅ Proceed to Step 2

---

### Step 2: Check Completion Detection

**For "Completed" button clicks, look for:**

```
[Webhook] ⚠️  COMPLETION DETECTED - BLOCKING FOLLOW-UP
[Webhook] Block result: {...}
[Webhook] ✓ FOLLOW-UP BLOCKED - X executions updated
```

**For text replies (not button), look for:**

```
[Webhook] Regular reply received
[Webhook] Looking for execution - Date: YYYY-MM-DD, Phone last 10: XXXXXXXXXX
[Webhook] Found X total executions for today
[Webhook] Comparing phone numbers...
[Webhook] ✓ MATCHED execution ID: ...
[Webhook] Before update - Status: sent, FollowUpStatus: pending
[Webhook] After update - Status: replied, FollowUpStatus: cancelled_by_user
[Webhook] ⚡ DATABASE SAVED
[Webhook] ⚡ Reminder deactivated (user replied)
```

**If you see "NO MATCHING execution found":**

- ❌ Phone number mismatch or no execution exists
- Check phone number format in database vs webhook
- Debug: Print `executions` array and compare phone numbers

---

### Step 3: Verify Database Update

**After user replies, check the database:**

```javascript
// MongoDB query
db.reminderexecutions.findOne({
  date: "2026-01-27", // Today's date
  phone: { $regex: "9876543210" } // Last 10 digits of phone
})

// Expected result AFTER user replied:
{
  status: "replied" or "completed",
  followUpStatus: "cancelled_by_user",
  replyReceivedAt: ISODate("2026-01-27T..."),
  ...
}

// If it still shows:
{
  status: "sent",
  followUpStatus: "pending",
  ...
}
// ❌ Database not updating - webhook not saving properly
```

---

### Step 4: Check Cron Behavior

**When cron runs at follow-up time:**

```
[Cron] STARTED at IST: 2026-01-27 09:00 (540m)
[Cron] >>> FOLLOW-UP CHECK <<<
[Cron] Looking for executions with:
[Cron]   - date: 2026-01-27
[Cron]   - status: "sent"
[Cron]   - followUpStatus: "pending"
```

**If user replied, execution should NOT be in this list:**

```
[Cron] Found 0 candidates for follow-up check
```

**If it still finds the execution:**

```
[Cron] Found 1 candidates for follow-up check
[Cron] --- Processing Execution XXX ---
```

- ❌ Database wasn't updated by webhook
- The execution still has `status: "sent"` and `followUpStatus: "pending"`
- Go back to Step 3

---

## 🧪 Complete Test Scenario

### **Test: User Replies Before Follow-Up**

```bash
# 1. Create reminder
Time: 23:17 (current + 1 min)
Follow-up: 23:20 (current + 4 min)

# 2. At 23:17 - Initial message sent
Check logs:
[Cron] ✓ Initial reminder sent - keeping active for follow-up

Check database:
db.reminderexecutions.findOne({date: "2026-01-27"})
// Should show: status: "sent", followUpStatus: "pending"

# 3. At 23:18 - User replies "Done" via WhatsApp
Check webhook logs:
[Webhook] >>> MESSAGE RECEIVED <<<
[Webhook] From: 919876543210
[Webhook] Text: done
[Webhook] Regular reply received
[Webhook] ✓ MATCHED execution ID: XXX
[Webhook] After update - Status: replied, FollowUpStatus: cancelled_by_user
[Webhook] ⚡ DATABASE SAVED

Check database:
db.reminderexecutions.findOne({date: "2026-01-27"})
// Should NOW show: status: "replied", followUpStatus: "cancelled_by_user"

# 4. At 23:20 - Follow-up time arrives
Check cron logs:
[Cron] >>> FOLLOW-UP CHECK <<<
[Cron] Found 0 candidates for follow-up check

Expected: ✅ NO FOLLOW-UP SENT

If follow-up WAS sent:
❌ Database was not updated properly in step 3
```

---

## 🔧 Common Issues & Fixes

### Issue 1: Phone Number Mismatch

**Symptom:** Webhook says "NO MATCHING execution found"

**Cause:** Phone numbers don't match

- Execution has: `919876543210`
- Webhook receives: `9876543210` (no country code)
- Or vice versa

**Fix:** Phone matching uses last 10 digits, so this SHOULD work. If not:

- Check the actual phone numbers in logs
- Verify the comparison logic

**Debug:**

```typescript
// In webhook, add:
console.log(`[Webhook] Full phone from message: ${from}`);
console.log(`[Webhook] Last 10 digits: ${phoneLast10}`);

// For each execution:
console.log(`[Webhook] Execution phone: ${exec.phone}`);
console.log(`[Webhook] Execution last 10: ${execLast10}`);
```

---

### Issue 2: Webhook Not Called

**Symptom:** No webhook logs appear when user replies

**Possible causes:**

1. WhatsApp webhook configuration incorrect
2. Server not accessible from WhatsApp
3. Webhook verification failed

**Fix:**

- Check WhatsApp Business API settings
- Verify webhook URL is correct and accessible
- Check `WHATSAPP_VERIFY_TOKEN` environment variable

---

### Issue 3: Database Not Saving

**Symptom:** Logs show "DATABASE SAVED" but database unchanged

**Possible causes:**

1. Database connection issue
2. Transaction not committed
3. Wrong execution object (not fresh from DB)

**Fix:** Added explicit logging:

```typescript
console.log(`Before update - Status: ${matched.status}`);
await matched.save();
console.log(`After update - Status: ${matched.status}`);
```

**Verify by re-fetching:**

```typescript
const verified = await ReminderExecution.findById(matched._id);
console.log(`Verified from DB: ${verified.status}`);
```

---

### Issue 4: Race Condition

**Symptom:** Sometimes works, sometimes doesn't

**Cause:** Cron runs BEFORE webhook finishes saving

**Timeline:**

```
09:00:00.500 - User replies
09:00:00.800 - Webhook processing (not saved yet)
09:00:01.000 - Cron runs and checks (still pending!)
09:00:01.200 - Webhook saves (too late)
09:00:01.500 - Cron sends follow-up (shouldn't have)
```

**Fix:** Cron has "auto-healing" logic that checks MessageLogs

- This should catch replies that webhook missed
- But it only runs DURING follow-up processing
- If follow-up already sent, too late!

**Better fix:** Ensure webhook processes QUICKLY

- Current implementation should be fast enough
- Database save is synchronous (awaited)

---

## 📊 Logs to Watch

### Successful Reply Tracking:

```
# When user replies:
[Webhook] >>> MESSAGE RECEIVED <<<
[Webhook] Regular reply received
[Webhook] ✓ MATCHED execution ID: 65b8f9...
[Webhook] Before update - Status: sent, FollowUpStatus: pending
[Webhook] After update - Status: replied, FollowUpStatus: cancelled_by_user
[Webhook] ⚡ DATABASE SAVED
[Webhook] ⚡ Reminder deactivated (user replied)

# When cron runs at follow-up time:
[Cron] >>> FOLLOW-UP CHECK <<<
[Cron] Looking for executions with:
[Cron]   - status: "sent"
[Cron]   - followUpStatus: "pending"
[Cron] Found 0 candidates for follow-up check
[Cron] COMPLETED - Processed 0 actions

✅ SUCCESS: No follow-up sent!
```

### Failed Reply Tracking (Bug):

```
# When user replies:
[Webhook] >>> MESSAGE RECEIVED <<<
[Webhook] Regular reply received
[Webhook] ✗ NO MATCHING execution found for phone: 919876543210

# When cron runs at follow-up time:
[Cron] Found 1 candidates for follow-up check
[Cron] --- Processing Execution XXX ---
[Cron] >>> SENDING FOLLOW-UP <<<
[Cron] ✓ Follow-up SENT successfully

❌ BUG: Follow-up sent even though user replied!
```

---

## 🎯 Action Items

1. **Add Logging** - Already done! Watch for:

   - `[Webhook] ✓ MATCHED execution ID:`
   - `[Webhook] ⚡ DATABASE SAVED`
   - `[Webhook] ⚡ Reminder deactivated`

2. **Test Manually**:

   - Set reminder for +1 minute
   - Reply after it sends
   - Check if follow-up is blocked

3. **Check Database Directly**:

   - After replying, query `ReminderExecution`
   - Verify `followUpStatus = "cancelled_by_user"`

4. **Monitor Logs**:
   - Server logs for webhook calls
   - Cron logs for follow-up processing

---

## 📝 Summary

The system SHOULD work with the current code. If it doesn't:

1. ✅ **Webhook receiving messages?** → Check WhatsApp config
2. ✅ **Finding execution?** → Check phone number matching
3. ✅ **Database updating?** → Check save operation
4. ✅ **Cron respecting status?** → Should only query `status: "sent"`

With the added logging, you can now trace exactly where the failure occurs!
