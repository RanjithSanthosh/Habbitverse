# ✅ TESTING CHECKLIST

Use this checklist to verify all fixes are working correctly.

---

## Pre-Deployment Checks

- [ ] All code changes saved
- [ ] `vercel.json` has cron configuration
- [ ] Environment variables set in Vercel:
  - [ ] `MONGODB_URI`
  - [ ] `CRON_SECRET`
  - [ ] `WHATSAPP_VERIFY_TOKEN`
  - [ ] `WHATSAPP_API_URL`
  - [ ] `WHATSAPP_ACCESS_TOKEN`
  - [ ] `WHATSAPP_PHONE_NUMBER_ID`

---

## Deployment

- [ ] Code committed to Git
- [ ] Pushed to main branch
- [ ] Vercel auto-deployed successfully
- [ ] Build completed without errors
- [ ] All environment variables copied to new deployment

---

## Post-Deployment Verification

### **1. Verify Cron is Running**

- [ ] Go to Vercel Dashboard → Functions
- [ ] Look for `/api/cron` endpoint
- [ ] Check it's running every minute
- [ ] Review logs for `[Cron] STARTED at IST:`
- [ ] Confirm no errors in cron execution

**Command to check logs:**

```bash
vercel logs --follow
```

**What to look for:**

```
[Cron] STARTED at IST: 2026-01-28 20:51 (1251m)
[Cron] Found X active reminder configs
[Cron] COMPLETED - Processed X actions
```

---

### **2. Verify Webhook is Responding**

- [ ] Send any message to your WhatsApp bot
- [ ] Check logs for webhook activity
- [ ] Confirm message logged in database

**What to look for in logs:**

```
[Webhook] >>> MESSAGE RECEIVED <<<
[Webhook] From: 919876543210
[Webhook] Text: "test"
```

**Verify in database:**

```bash
npm run verify-db
```

Should show the message in "Recent Message Logs"

---

## Test Scenario 1: User Replies (Main Test)

### **Setup**

- [ ] Create a new reminder
  - [ ] Phone: Your WhatsApp number
  - [ ] Time: Current time + 2 minutes
  - [ ] Follow-up: Current time + 5 minutes
  - [ ] Message: "Test reminder - please reply"

### **Execution**

**At T+0 (Creation):**

- [ ] Reminder created successfully
- [ ] Shows in admin panel
- [ ] `isActive = true` in database

**At T+2 (Initial Send Time):**

- [ ] WhatsApp message received on your phone
- [ ] Contains "Completed" button
- [ ] Message logged in database

**Check logs:**

```
[Cron] 📨 Sending ONE-TIME Reminder
[Cron] ✓ Initial reminder sent - keeping active for follow-up
[Cron] ✓ Created execution record
```

**Verify database:**

```bash
npm run verify-db
```

Should show:

- Execution with `status: "sent"`
- Execution with `followUpStatus: "pending"`
- Reminder still `isActive: true`

**At T+3 (Reply):**

- [ ] Reply to WhatsApp message with "done"
- [ ] OR Click the "Completed" button

**Check logs immediately:**

```
[Webhook] >>> MESSAGE RECEIVED <<<
[Webhook] ✓ MATCHED execution ID: ...
[Webhook] ⚡ EXECUTION SAVED TO DATABASE
[Webhook] ✓ VERIFIED - Status: replied, FollowUpStatus: cancelled_by_user
[Webhook] ⚡ Reminder deactivated - isActive: false
[Webhook] ✅ COMPLETE - Reply processed and follow-up cancelled
```

**Verify database:**

```bash
npm run verify-db
```

Should show:

- Execution `status: "replied"` or `"completed"`
- Execution `followUpStatus: "cancelled_by_user"`
- Execution has `replyReceivedAt` timestamp
- Reminder `isActive: false`
- Reminder `dailyStatus: "replied"` or `"completed"`

**At T+5 (Follow-up Time):**

- [ ] Wait until follow-up time
- [ ] Check you DON'T receive a follow-up message
- [ ] Check logs

**Expected logs:**

```
[Cron] >>> FOLLOW-UP CHECK <<<
[Cron] Looking for executions with:
[Cron]   - status: "sent"
[Cron]   - followUpStatus: "pending"
[Cron] Found 0 candidates for follow-up check
```

### **Success Criteria:**

- ✅ Initial message sent at T+2
- ✅ Reply processed instantly at T+3
- ✅ Database updated within 1 second
- ✅ NO follow-up sent at T+5
- ✅ All verification logs present

---

## Test Scenario 2: No Reply (Follow-up Sends)

### **Setup**

- [ ] Create a new reminder
  - [ ] Time: Current time + 2 minutes
  - [ ] Follow-up: Current time + 5 minutes

### **Execution**

**At T+2:**

- [ ] WhatsApp message received
- [ ] Check logs for successful send
- [ ] Database shows `followUpStatus: "pending"`

**At T+3-4:**

- [ ] DO NOT REPLY
- [ ] Let it sit with no response

**At T+5 (Follow-up Time):**

- [ ] Receive follow-up message on WhatsApp
- [ ] Check logs

**Expected logs:**

```
[Cron] >>> FOLLOW-UP CHECK <<<
[Cron] Found 1 candidates for follow-up check
[Cron] >>> SENDING FOLLOW-UP <<<
[Cron] ✓ Follow-up SENT successfully
[Cron] ⚡ Reminder DEACTIVATED (flow complete)
```

**Verify database:**

- Execution `followUpStatus: "sent"`
- Execution has `followUpSentAt` timestamp
- Reminder `isActive: false`

### **Success Criteria:**

- ✅ Initial message at T+2
- ✅ Follow-up sent at T+5
- ✅ Reminder deactivated after follow-up
- ✅ All verification logs present

---

## Test Scenario 3: "Completed" Button

### **Setup**

- [ ] Create reminder (T+2, follow-up T+5)

### **Execution**

**At T+2:**

- [ ] Receive initial message

**At T+3:**

- [ ] Click "Completed" button (not text reply)

**Check logs:**

```
[Webhook] ⚠️ COMPLETION DETECTED - BLOCKING FOLLOW-UP
[Webhook] ✓ FOLLOW-UP BLOCKED - 1 executions updated
```

**At T+5:**

- [ ] NO follow-up received
- [ ] Logs show 0 candidates

### **Success Criteria:**

- ✅ Button click processed
- ✅ Execution cancelled
- ✅ Follow-up blocked
- ✅ Confirmation message received

---

## Test Scenario 4: Multiple Reminders

### **Setup**

- [ ] Create 3 reminders for different times
  - [ ] Reminder A: T+2, follow-up T+5
  - [ ] Reminder B: T+3, follow-up T+6
  - [ ] Reminder C: T+4, follow-up T+7

### **Execution**

- [ ] Reply to Reminder A
- [ ] Don't reply to Reminder B
- [ ] Click "Completed" for Reminder C

**Verify:**

- [ ] Only Reminder B sends follow-up
- [ ] A and C don't send follow-ups
- [ ] All tracked correctly in database

### **Success Criteria:**

- ✅ Each reminder tracked independently
- ✅ Reply to one doesn't affect others
- ✅ Only unanswered reminder sends follow-up

---

## Database Consistency Check

Run after ALL tests:

```bash
npm run verify-db
```

**Look for:**

- [ ] No consistency issues reported
- [ ] All replied executions have `followUpStatus: "cancelled_by_user"`
- [ ] All active reminders have valid pending executions
- [ ] No executions with `replyReceivedAt` but `status: "sent"`

**If issues found:**

- Review the logs from the test
- Check for any error messages
- Verify network connectivity
- Check MongoDB connection

---

## Edge Cases to Test

### **Test: Reply Before Initial Send**

- [ ] Create reminder for T+5
- [ ] Send message NOW (before T+5)
- [ ] Verify: Message doesn't interfere with reminder

### **Test: Multiple Replies**

- [ ] Create reminder
- [ ] Reply multiple times
- [ ] Verify: Only counts first reply, no errors

### **Test: Invalid Phone Number**

- [ ] Create reminder with invalid phone
- [ ] Verify: Error logged, doesn't crash system

### **Test: WhatsApp Webhook Delay**

- [ ] Reply immediately after receiving message
- [ ] Verify: Cron waits for webhook to process
- [ ] Verify: No race condition

---

## Performance Check

- [ ] Cron completes in < 5 seconds
- [ ] Webhook responds in < 2 seconds
- [ ] Database queries optimized
- [ ] No memory leaks in logs
- [ ] No duplicate messages sent

---

## Production Monitoring

### **Daily Checks:**

- [ ] Review Vercel logs for errors
- [ ] Check database for consistency
- [ ] Verify cron is running every minute
- [ ] Monitor WhatsApp API quota

### **Weekly Checks:**

- [ ] Run `npm run verify-db` to check consistency
- [ ] Review all active reminders
- [ ] Clean up old message logs (optional)
- [ ] Check for any failed messages

---

## Troubleshooting Guide

### **Problem: Follow-up still sent after reply**

**Debug steps:**

1. [ ] Check webhook logs - was it called?
2. [ ] Check "MATCHED execution" in logs
3. [ ] Check "VERIFIED" in logs
4. [ ] Run `npm run verify-db` to see actual DB state
5. [ ] Check cron query logs

### **Problem: Database not updating**

**Debug steps:**

1. [ ] Check MongoDB connection
2. [ ] Look for "CRITICAL: Database save FAILED" in logs
3. [ ] Check for retry attempts
4. [ ] Verify MongoDB is accessible
5. [ ] Check environment variables

### **Problem: Cron not running**

**Debug steps:**

1. [ ] Check `vercel.json` has cron config
2. [ ] Verify it's in production deployment
3. [ ] Check Vercel dashboard Functions tab
4. [ ] Look for cron execution logs
5. [ ] Verify `CRON_SECRET` is set

---

## Sign-Off Checklist

Before marking as COMPLETE:

- [ ] All test scenarios passed
- [ ] No errors in logs
- [ ] Database consistency check passed
- [ ] Cron running every minute
- [ ] Webhook responding correctly
- [ ] No follow-ups sent when user replies
- [ ] Follow-ups sent when user doesn't reply
- [ ] "Completed" button works
- [ ] Multiple reminders work independently
- [ ] Documentation reviewed
- [ ] Team trained on new system

---

## Notes

**Date Tested:** ******\_******

**Tested By:** ******\_******

**Issues Found:** ******\_******

**Resolution:** ******\_******

**Sign-off:** ******\_******

---

✅ **When all items are checked, your system is PRODUCTION-READY!**
