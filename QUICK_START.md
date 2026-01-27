# 🚀 Quick Start Guide - One-Time Reminder System

## ⚡ What Changed?

### BEFORE (Problem):

- ❌ Reminders sent EVERY DAY at the same time
- ❌ Yesterday's reminder → Today's message (unwanted)
- ❌ No way to make it stop without deletion

### AFTER (Solution):

- ✅ Reminders execute ONCE, then auto-deactivate
- ✅ Create multiple reminders independently
- ✅ Smart reply tracking cancels follow-ups
- ✅ Clear visual status in dashboard

---

## 📋 How to Use

### 1. Create a New Reminder

```
Click "New Reminder" button
Fill in:
  - Title: "Morning Exercise"
  - Phone: 9876543210
  - Message: "Time for your morning workout!"
  - Reminder Time: 08:00
  - Follow-up: "Did you complete it?"
  - Follow-up Time: 09:00

Click "✨ Create One-Time Reminder"
```

### 2. What Happens Next

**At 08:00:**

- 📨 WhatsApp message sent to user
- ⚡ Reminder automatically deactivated
- 📊 Status changes to "sent"
- 🔍 System watches for reply

**If user replies before 09:00:**

- ✅ Status updates to "replied" or "completed"
- 🚫 Follow-up at 09:00 is CANCELLED
- 🎉 Done!

**If user doesn't reply by 09:00:**

- ⏰ Follow-up message sent
- 📊 Status shows follow-up sent
- 🎉 Done!

**Tomorrow (Day 2):**

- ⛔ NO message sent (reminder is deactivated)
- ✅ System working as expected!

---

## 🧪 Testing Checklist

### Test 1: Basic One-Time Execution

- [ ] Create reminder for [now + 2 minutes]
- [ ] Wait for send
- [ ] Check status changes to "sent"
- [ ] Check "Executed" badge appears
- [ ] Wait until tomorrow
- [ ] Confirm: No duplicate message

### Test 2: Reply Tracking

- [ ] Create reminder with 1-hour follow-up gap
- [ ] Reminder sends
- [ ] Reply via WhatsApp before follow-up time
- [ ] Confirm: Status becomes "replied"
- [ ] Confirm: Follow-up is cancelled

### Test 3: Multiple Reminders

- [ ] Create 3 different reminders
- [ ] Different times, different phones
- [ ] All send independently
- [ ] All deactivate after sending
- [ ] No interference between them

---

## 🔧 Key Files Modified

| File                              | What Changed                                   |
| --------------------------------- | ---------------------------------------------- |
| `src/app/api/cron/route.ts`       | ⚡ One-time execution logic, auto-deactivation |
| `src/app/dashboard/page.tsx`      | 🎨 UI updates, "One-Time" messaging            |
| `src/models/Reminder.ts`          | 📊 No changes (uses isActive flag)             |
| `src/models/ReminderExecution.ts` | 📊 No changes (tracks individual sends)        |

---

## 📞 WhatsApp Integration

### Reminder Message Format

```
[Your Custom Message]

Button: "Completed" → Cancels follow-up
```

### Reply Detection

System detects:

- Button click: "completed_habit"
- Text: "complete", "completed", "done"
- Any other reply → Marked as "replied"

---

## 💾 Database Structure

### Creating a Reminder

```typescript
POST /api/reminders
{
  "phone": "9876543210",
  "title": "Morning Yoga",
  "message": "Time to stretch!",
  "reminderTime": "08:00",
  "followUpMessage": "Did you do it?",
  "followUpTime": "09:00"
}

Creates:
- Reminder record with isActive = true
```

### After Sending

```typescript
Reminder {
  isActive: false  // ⚡ Auto-deactivated
  lastSentAt: 2026-01-27T08:00:00Z
  dailyStatus: "sent"
}

ReminderExecution {
  reminderId: [Reminder._id]
  date: "2026-01-27"
  status: "sent"
  sentAt: 2026-01-27T08:00:00Z
  followUpStatus: "pending"
}
```

### After User Replies

```typescript
ReminderExecution {
  status: "replied"  // or "completed"
  followUpStatus: "cancelled_by_user"
  replyReceivedAt: 2026-01-27T08:15:00Z
}
```

---

## 🎯 Success Criteria

Your system is working correctly if:

1. ✅ Each reminder sends EXACTLY ONCE
2. ✅ No duplicate messages on subsequent days
3. ✅ Reply tracking works (follow-up cancelled)
4. ✅ Multiple reminders work independently
5. ✅ Status clearly shown in dashboard
6. ✅ "Executed" badge appears after send
7. ✅ Can create unlimited new reminders

---

## 🐛 Troubleshooting

### Issue: Reminder not sending

**Check:**

- Is `isActive = true`?
- Is current time >= reminderTime?
- Check cron job logs: `[Cron] STARTED at IST...`

### Issue: Follow-up not cancelled after reply

**Check:**

- Webhook logs: `[Webhook] Regular reply received`
- ReminderExecution.followUpStatus should be "cancelled_by_user"
- Check MessageLog for inbound messages

### Issue: Duplicate messages on Day 2

**Check:**

- After first send, is `isActive = false`?
- Check cron logs: `[Cron] ⚡ Deactivated reminder...`
- Verify ReminderExecution record exists

---

## 📚 Additional Resources

- Full Documentation: `REMINDER_SYSTEM.md`
- Flow Diagram: See generated image above
- API Routes: `src/app/api/`
- Models: `src/models/`

---

## 🎉 Summary

**Before:** Daily recurring reminders (unwanted repetition)
**After:** One-time execution with smart follow-up

**Result:** Clean, predictable, professional reminder system! 🚀
