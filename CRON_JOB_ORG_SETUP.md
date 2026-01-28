# ⚙️ CRON-JOB.ORG SETUP GUIDE

Since you're using **cron-job.org** (external cron service) instead of Vercel's built-in cron, here's the correct setup:

---

## 🔧 Current Cron-Job.org Configuration

### **1. Get Your Cron Endpoint URL**

Your cron endpoint should be:

```
https://YOUR-DOMAIN.vercel.app/api/cron
```

Or if using a custom domain:

```
https://your-custom-domain.com/api/cron
```

---

### **2. Configure on cron-job.org**

Go to https://console.cron-job.org/ and set up:

#### **Basic Settings:**

```
Title: HabbitVerse Reminder Cron
URL: https://YOUR-DOMAIN.vercel.app/api/cron
Schedule: Every 1 minute (*/1 * * * *)
```

#### **Advanced Settings:**

**Request Method:**

```
GET
```

**Headers (CRITICAL):**

```
Authorization: Bearer YOUR_CRON_SECRET
```

⚠️ **IMPORTANT:** You MUST add the Authorization header with your CRON_SECRET!

**Timeout:**

```
60 seconds
```

**Retries:**

```
0 (no retries - each cron should run once)
```

---

## 🔐 Setting Up CRON_SECRET

### **1. Generate a Secret**

```bash
# Option 1: Use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Use OpenSSL
openssl rand -hex 32

# Option 3: Use this online tool
# https://randomkeygen.com/
```

Copy the generated value (e.g., `a1b2c3d4e5f6...`)

### **2. Add to Vercel Environment Variables**

1. Go to: https://vercel.com/YOUR-ORG/habbit-verse/settings/environment-variables
2. Add new variable:
   - **Name:** `CRON_SECRET`
   - **Value:** `a1b2c3d4e5f6...` (paste your generated secret)
   - **Environment:** Production, Preview, Development
3. Click "Save"
4. **Redeploy** your application

### **3. Add to cron-job.org**

1. Go to your cron job settings
2. Add header:
   - **Key:** `Authorization`
   - **Value:** `Bearer a1b2c3d4e5f6...` (your CRON_SECRET)
3. Save the cron job

---

## ✅ How to Verify It's Working

### **Test the Endpoint Manually**

Using curl:

```bash
curl -X GET https://YOUR-DOMAIN.vercel.app/api/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:

```json
{
  "success": true,
  "processedCount": X,
  "results": [...],
  "serverTimeIST": "2026-01-28 21:05"
}
```

If you get `401 Unauthorized`:

- ❌ CRON_SECRET is wrong or missing

If you get `200 OK`:

- ✅ Endpoint is working correctly

---

## 📊 Monitoring on cron-job.org

### **Check Execution History**

1. Go to https://console.cron-job.org/
2. Click on your cron job
3. Go to "History" tab

**What to look for:**

- ✅ Status: `200 OK` (Success)
- ✅ Execution time: < 10 seconds
- ❌ Status: `401` (Check Authorization header)
- ❌ Status: `500` (Check server logs)
- ❌ Status: `Timeout` (Increase timeout to 60s)

### **Enable Notifications**

In cron-job.org settings:

1. Enable email notifications
2. Set to notify on:
   - ✅ Failures only (recommended)
   - ⚠️ Or every execution (for testing)

---

## 🔍 Troubleshooting

### **Problem: 401 Unauthorized**

**Symptoms:**

```
Status: 401 Unauthorized
```

**Solutions:**

1. Check CRON_SECRET is set in Vercel environment variables
2. Check Authorization header in cron-job.org:
   - Format: `Authorization: Bearer YOUR_SECRET`
   - NOT: `Authorization: YOUR_SECRET` (missing "Bearer")
3. Verify secret matches between Vercel and cron-job.org
4. Redeploy after adding/changing CRON_SECRET

---

### **Problem: 500 Internal Server Error**

**Symptoms:**

```
Status: 500 Internal Server Error
```

**Solutions:**

1. Check Vercel function logs:
   ```bash
   vercel logs --follow
   ```
2. Look for errors in cron execution
3. Check MongoDB connection (MONGODB_URI)
4. Verify all environment variables are set

---

### **Problem: Timeout**

**Symptoms:**

```
Status: Timeout (after 30s)
```

**Solutions:**

1. Increase timeout in cron-job.org to **60 seconds**
2. Check if database queries are slow
3. Optimize the cron job if processing too many reminders
4. Check `vercel.json` has `maxDuration: 60` (already added)

---

### **Problem: Not Running Every Minute**

**Symptoms:**

- Cron runs but at wrong intervals
- Reminders sent late

**Solutions:**

1. Check cron-job.org schedule: `*/1 * * * *`
2. Make sure cron job is **enabled**
3. Check you have enough credits/quota on cron-job.org
4. Verify timezone is set correctly (UTC recommended)

---

## 🎯 Current Schedule Breakdown

Your cron expression: `*/1 * * * *`

```
┌───────────── minute (0 - 59)     → */1 = every minute
│ ┌───────────── hour (0 - 23)     → * = every hour
│ │ ┌───────────── day of month    → * = every day
│ │ │ ┌───────────── month         → * = every month
│ │ │ │ ┌───────────── day of week → * = every day of week
│ │ │ │ │
* * * * *
```

**This means:** Run EVERY MINUTE of EVERY DAY

**Example execution times:**

```
21:00:00
21:01:00
21:02:00
21:03:00
...
```

---

## 🔒 Security Best Practices

### **1. Protect Your CRON_SECRET**

✅ DO:

- Use a strong, random secret (32+ characters)
- Store in Vercel environment variables only
- Never commit to Git
- Rotate periodically (monthly/quarterly)

❌ DON'T:

- Use simple passwords like "password123"
- Store in code
- Share in public channels
- Reuse from other projects

### **2. Rate Limiting**

The cron endpoint is protected by:

- Authorization header requirement
- Runs max once per minute
- No public access without secret

---

## 📈 Expected Behavior

### **Normal Operation:**

**Every minute, cron-job.org will:**

1. Send GET request to `/api/cron`
2. Include Authorization header
3. Server checks CRON_SECRET
4. If valid:
   - Processes pending reminders
   - Sends due messages
   - Checks for follow-ups
   - Returns success response
5. cron-job.org logs result

### **Example Timeline:**

```
21:00:00 - Cron runs → 2 reminders sent
21:01:00 - Cron runs → 0 actions (nothing due)
21:02:00 - Cron runs → 0 actions
21:03:00 - Cron runs → 1 follow-up sent
21:04:00 - Cron runs → 0 actions
...
```

---

## 🧪 Testing Your Setup

### **Step-by-Step Test:**

1. **Create a test reminder:**

   - Time: Current time + 2 minutes
   - Follow-up: Current time + 5 minutes

2. **Watch cron-job.org execution history**

3. **At T+2 (Initial send time):**

   - ✅ Cron execution shows `200 OK`
   - ✅ WhatsApp message received
   - ✅ Check Vercel logs for:
     ```
     [Cron] 📨 Sending ONE-TIME Reminder
     [Cron] ✓ Initial reminder sent
     ```

4. **Reply to the message** (at T+3)

5. **At T+5 (Follow-up time):**
   - ✅ Cron execution shows `200 OK`
   - ✅ NO WhatsApp message (follow-up blocked)
   - ✅ Check Vercel logs for:
     ```
     [Cron] Found 0 candidates for follow-up
     ```

---

## 📱 Quick Reference

### **Your Cron Job Configuration:**

| Setting  | Value                                     |
| -------- | ----------------------------------------- |
| Service  | cron-job.org                              |
| URL      | `https://YOUR-DOMAIN.vercel.app/api/cron` |
| Method   | GET                                       |
| Schedule | `*/1 * * * *` (every minute)              |
| Header   | `Authorization: Bearer YOUR_CRON_SECRET`  |
| Timeout  | 60 seconds                                |
| Timezone | UTC (or your preference)                  |

### **Environment Variables (Vercel):**

| Variable                   | Purpose                             |
| -------------------------- | ----------------------------------- |
| `CRON_SECRET`              | Authenticates cron-job.org requests |
| `MONGODB_URI`              | Database connection                 |
| `WHATSAPP_ACCESS_TOKEN`    | WhatsApp API authentication         |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender number              |
| `WHATSAPP_VERIFY_TOKEN`    | Webhook verification                |

---

## ✅ Checklist: Is Your Cron Setup Correct?

- [ ] cron-job.org account created
- [ ] Cron job created with correct URL
- [ ] Schedule set to `*/1 * * * *`
- [ ] Authorization header added: `Authorization: Bearer YOUR_SECRET`
- [ ] CRON_SECRET set in Vercel environment variables
- [ ] Secret matches between cron-job.org and Vercel
- [ ] Timeout set to 60 seconds
- [ ] Cron job is **ENABLED**
- [ ] Test request returns `200 OK`
- [ ] Vercel logs show cron executions
- [ ] Email notifications configured (optional)

---

## 🎉 You're All Set!

With cron-job.org configured correctly:

- ✅ Your endpoint is triggered every minute
- ✅ Reminders are sent on time
- ✅ Follow-ups are processed correctly
- ✅ Reply tracking works as expected
- ✅ Database updates are verified

**Your system is now fully operational with external cron triggering!** 🚀

---

## 📞 Support

If you need help:

1. Check cron-job.org execution history
2. Check Vercel function logs: `vercel logs --follow`
3. Run database verification: `npm run verify-db`
4. Review `COMPREHENSIVE_FIX_REPLY_TRACKING.md`
5. Check `TESTING_CHECKLIST.md`
