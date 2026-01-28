# 🐛 DEBUGGING: Follow-up Still Sending After Reply

## The Problem

**Symptom:** Even when a user replies "completed" to a reminder, the follow-up message is still being sent.

## Root Cause Analysis

This can happen for 3 reasons:

### 1. **Webhook Not Being Called**

- WhatsApp is not sending messages to your webhook
- Webhook URL is incorrect
- Webhook verification failing

### 2. **Database Not Updating**

- Webhook receives the message but fails to save to database
- Database connection issues
- Save operation fails silently

### 3. **Cron Reading Old Data**

- Database updates successfully
- But cron checks before the update completes (race condition)
- Or cron is querying incorrectly

---

## Step-by-Step Debugging

### **STEP 1: Verify Webhook is Receiving Messages**

1. Check your Vercel logs after sending a WhatsApp message:

   ```bash
   vercel logs --follow
   ```

2. Look for these logs:
   ```
   [Webhook] >>> MESSAGE RECEIVED <<<
   [Webhook] From: 919876543210
   [Webhook] Text: "completed"
   ```

**If you DON'T see these logs:**

- ❌ Webhook is not being called
- Check WhatsApp webhook configuration
- Verify webhook URL in Meta Developer Console
- Check `WHATSAPP_VERIFY_TOKEN` is set correctly

**If you DO see these logs:**

- ✅ Webhook is working
- Proceed to Step 2

---

### **STEP 2: Check if Database is Updating**

After replying to a reminder, check the logs for:

```
[Webhook] ✓ MATCH FOUND - Blocking execution ABC123
[Webhook] Before: status=sent, followUp=pending
[Webhook] After: status=replied, followUp=cancelled_by_user
[Webhook] ✓ Execution ABC123 successfully blocked
[Webhook] ⚡ Reminder XYZ deactivated - isActive: false
```

**If you see an error:**

```
[Webhook] ❌ Failed to block execution ABC123
```

- ❌ Database save is failing
- Check MongoDB connection
- Check database permissions
- See "Database Troubleshooting" below

**If you see:**

```
[Webhook] ⚠️ WARNING: No executions were blocked!
```

- ❌ Phone number mismatch
- See "Phone Number Issues" below

---

### **STEP 3: Use Debug Endpoint**

We've created a special debug endpoint to manually check and update the database.

**Check Current Status:**

```bash
curl "https://your-domain.vercel.app/api/debug-reply?phone=919876543210"
```

This will show you:

- All executions for this phone number today
- Their current status
- followUpStatus

**Expected Response:**

```json
{
  "success": true,
  "executions": [
    {
      "id": "abc123",
      "phone": "919876543210",
      "status": "sent",
      "followUpStatus": "pending", // ❌ Should be "cancelled_by_user" after reply
      "sentAt": "2026-01-28T...",
      "replyReceivedAt": null // ❌ Should have a timestamp
    }
  ]
}
```

**If followUpStatus is still "pending" after you replied:**

- ❌ The webhook did NOT update the database
- The save operation failed
- Proceed to Step 4

---

### **STEP 4: Manually Update (Testing Only)**

To manually mark as replied and test if the cron respects it:

```bash
curl -X POST "https://your-domain.vercel.app/api/debug-reply" \
  -H "Content-Type: application/json" \
  -d '{"phone": "919876543210"}'
```

This will:

- Find the execution for this phone
- Mark it as `status: "replied"`
- Set `followUpStatus: "cancelled_by_user"`
- Deactivate the reminder

**Expected Response:**

```json
{
  "success": true,
  "message": "Updated 1 execution(s)",
  "updated": 1
}
```

**Now check the debug endpoint again:**

```bash
curl "https://your-domain.vercel.app/api/debug-reply?phone=919876543210"
```

Should show:

```json
{
  "followUpStatus": "cancelled_by_user", // ✅ Updated!
  "replyReceivedAt": "2026-01-28T..." // ✅ Has timestamp
}
```

---

### **STEP 5: Verify Cron Respects the Status**

After manually updating (or after a real reply), check the cron logs:

```
[Cron] >>> FOLLOW-UP CHECK <<<
[Cron] Looking for executions with:
[Cron]   - status: "sent"
[Cron]   - followUpStatus: "pending"
[Cron] Found 0 candidates for follow-up check
```

**If it says "Found 0 candidates":**

- ✅ Cron is working correctly
- It's not finding any executions to send follow-ups for
- The issue was with the database update

**If it says "Found 1 candidate" and sends follow-up:**

- ❌ The database was NOT updated
- The execution still has `followUpStatus: "pending"`
- Go back to Step 2

---

## Common Issues & Solutions

### **Issue 1: Phone Number Mismatch**

**Symptom:**

```
[Webhook] Found 5 total executions for today
[Webhook] ⚠️ WARNING: No executions were blocked!
```

**Cause:** Phone number format doesn't match

**Solution:**

1. Check the exact phone format in the webhook log:

   ```
   [Webhook] From: 919876543210
   [Webhook] Phone last 10: 9876543210
   ```

2. Check the phone format in the database:

   ```bash
   curl "https://your-domain.vercel.app/api/debug-reply?phone=919876543210"
   ```

3. If formats don't match, the reminder was created with a different format
4. Delete and recreate the reminder with the correct phone number

---

### **Issue 2: Database Connection Fails**

**Symptom:**

```
[Webhook] ❌ Error blocking follow-up: MongoError: ...
```

**Solutions:**

1. Check `MONGODB_URI` is set in Vercel environment variables
   2.Verify MongoDB Atlas allows connections from Vercel IPs
2. Check MongoDB user has read/write permissions
3. Try reconnecting:
   ```bash
   npm run verify-db
   ```

---

### **Issue 3: Race Condition**

**Symptom:** Webhook logs show successful update, but cron still sends follow-up

**Cause:** Cron checks the database BEFORE the webhook finishes updating

**Solution:** This should NOT happen because:

1. Webhook updates are synchronous (`await exec.save()`)
2. Webhook verifies the save before proceeding
3. Cron runs every minute, giving webhook time to complete

If this still happens:

- Check system time sync
- Verify webhook is completing quickly (< 2 seconds)
- Add more logging to see exact timing

---

### **Issue 4: Save Succeeds But Doesn't Persist**

**Symptom:**

```
[Webhook] After: status=replied, followUp=cancelled_by_user
[Cron] Found 1 candidates for follow-up  // ❌ Should be 0
```

**Cause:** Database transaction not committed, or reading from replica lag

**Solutions:**

1. Add retry logic (already implemented)
2. Use MongoDB write concern:
   ```typescript
   await exec.save({ writeConcern: { w: "majority" } });
   ```
3. Add a small delay before cron checks (not recommended)

---

## Quick Diagnostic Commands

**Check today's executions:**

```bash
npm run verify-db
```

**Check specific phone:**

```bash
curl "https://your-domain.vercel.app/api/debug-reply?phone=YOUR_PHONE"
```

**Manually mark as replied:**

```bash
curl -X POST "https://your-domain.vercel.app/api/debug-reply" \
  -H "Content-Type: application/json" \
  -d '{"phone": "YOUR_PHONE"}'
```

**Check Vercel logs:**

```bash
vercel logs --follow
```

**Check cron-job.org execution:**

- Go to https://console.cron-job.org/
- View execution history
- Check for 200 OK status

---

## Testing the Full Flow

1. **Create a test reminder:**

   - Time: Current time + 2 minutes
   - Follow-up: Current time + 5 minutes
   - Phone: Your number

2. **At T+2 (Initial send):**

   - Receive WhatsApp message
   - Check logs for successful send
   - Use debug endpoint to verify execution created:
     ```bash
     curl "https://your-domain.vercel.app/api/debug-reply?phone=YOUR_PHONE"
     ```
   - Should show `followUpStatus: "pending"`

3. **At T+3 (Reply):**

   - Click "Completed" button
   - **Immediately** check Vercel logs:
     ```
     [Webhook] ✓ MATCH FOUND
     [Webhook] After: followUp=cancelled_by_user
     ```
   - **Immediately** check debug endpoint:
     ```bash
     curl "https://your-domain.vercel.app/api/debug-reply?phone=YOUR_PHONE"
     ```
   - Should show `followUpStatus: "cancelled_by_user"`

4. **At T+5 (Follow-up time):**

   - Check logs:
     ```
     [Cron] Found 0 candidates for follow-up
     ```
   - **NO WhatsApp message** should be received

5. **If follow-up IS sent:**
   - Check debug endpoint again
   - If still `"pending"`, webhook failed to update
   - Check webhook logs for errors
   - Try manual update and see if that blocks future follow-ups

---

## What We Fixed

1. ✅ Replaced internal API call with direct database update
2. ✅ Added comprehensive logging at every step
3. ✅ Added verification after every save operation
4. ✅ Added retry logic for failed saves
5. ✅ Added debug endpoint for manual testing
6. ✅ UI now refreshes every 10 seconds

---

## If None of This Works

If you've followed all steps and follow-ups are STILL sending:

1. **Capture a full log sequence:**

   - Create a test reminder
   - Reply to it
   - Wait for follow-up time
   - Save ALL logs from webhook and cron

2. **Check database directly:**

   ```bash
   npm run verify-db
   ```

   - Look for inconsistencies

3. **Share the logs with details:**
   - Webhook logs when you reply
   - Cron logs when follow-up sends
   - Database state from debug endpoint
   - Database verification output

---

## Success Criteria

✅ Webhook receives message and logs "MATCH FOUND"
✅ Database shows `followUpStatus: "cancelled_by_user"`  
✅ Cron logs show "Found 0 candidates"  
✅ No follow-up message sent  
✅ UI shows "replied" or "completed" status

**All of these must be true for the system to work correctly!**
