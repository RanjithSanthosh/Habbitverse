# HabbitVerse - One-Time Reminder System

## Overview

The HabbitVerse system has been updated to implement **ONE-TIME EXECUTION** for reminders. This means each reminder will execute exactly once when its scheduled time is reached, then automatically deactivate.

## Key Changes

### 1. **One-Time Execution Model**

- **Before**: Reminders would send every day at the scheduled time (recurring)
- **After**: Each reminder sends ONCE, then is automatically deactivated
- **Result**: No duplicate messages sent on subsequent days

### 2. **How It Works**

#### Creation Flow:

1. User creates a reminder with:

   - Phone number
   - Title and message
   - Reminder time (e.g., 08:00)
   - Follow-up message and time (e.g., 09:00)

2. Reminder is saved with `isActive = true`

#### Execution Flow:

1. **Cron job runs** (every minute or as configured)
2. **Checks for active reminders** where:

   - `isActive = true`
   - Current time >= Reminder time
   - No execution record exists (never sent before)

3. **Sends the reminder** via WhatsApp

4. **Creates ReminderExecution** record with:

   - `date`: Today's date (YYYY-MM-DD)
   - `status`: "sent"
   - `followUpStatus`: "pending"
   - `sentAt`: Current timestamp

5. **Deactivates the reminder** by setting `isActive = false`
   - This prevents it from being sent again tomorrow

#### Reply Tracking:

1. **Webhook monitors** for incoming WhatsApp messages
2. **If user replies** between reminder and follow-up time:

   - Updates `status` to "replied" or "completed"
   - Sets `followUpStatus` to "cancelled_by_user"
   - Stores `replyReceivedAt` timestamp

3. **Follow-up is cancelled** if user replied

#### Follow-Up Flow:

1. **Cron job checks** for pending follow-ups
2. **Only sends follow-up** if:

   - `status` = "sent" (user hasn't replied)
   - `followUpStatus` = "pending" (not cancelled)
   - Current time >= Follow-up time

3. **If follow-up is sent**:
   - Updates `followUpStatus` to "sent"
   - Stores `followUpSentAt` timestamp

## Database Models

### Reminder (Configuration)

```typescript
{
  _id: ObjectId,
  phone: string,              // User's phone number
  title: string,              // e.g., "Morning Yoga"
  message: string,            // Initial reminder message
  reminderTime: string,       // "08:00" (HH:MM)
  followUpMessage: string,    // Follow-up message
  followUpTime: string,       // "09:00" (HH:MM)
  isActive: boolean,          // false after first execution ⚡
  lastSentAt: Date,
  dailyStatus: string,        // Legacy field
  createdAt: Date,
  updatedAt: Date
}
```

### ReminderExecution (Execution Record)

```typescript
{
  _id: ObjectId,
  reminderId: ObjectId,       // Reference to Reminder
  phone: string,
  date: string,               // "2026-01-27" (YYYY-MM-DD)
  status: "sent" | "replied" | "failed" | "completed",
  sentAt: Date,
  replyReceivedAt: Date,      // When user replied
  followUpStatus: "pending" | "sent" | "skipped" | "replied_before_followup" | "cancelled_by_user",
  followUpSentAt: Date,       // When follow-up was sent
  createdAt: Date,
  updatedAt: Date
}
```

## File Changes

### 1. `/src/app/api/cron/route.ts`

**Changes:**

- Added comprehensive header documentation
- Changed execution check from "already sent TODAY" to "EVER sent"
- Sets `isActive = false` immediately after sending reminder
- Deactivates stale reminders that were already executed

**Before:**

```typescript
const existingExecution = await ReminderExecution.findOne({
  reminderId: reminder._id,
  date: todayDateStr, // ❌ Only checked today
});
```

**After:**

```typescript
const anyExecution = await ReminderExecution.findOne({
  reminderId: reminder._id, // ✅ Checks if EVER executed
});

if (anyExecution) {
  reminder.isActive = false; // ⚡ Deactivate
  await reminder.save();
  continue;
}
```

### 2. `/src/app/dashboard/page.tsx`

**Changes:**

- Updated all UI text to emphasize "One-Time" execution
- Added "Executed" badge for completed reminders
- Added explanatory text in the creation modal
- Changed button text to "Create One-Time Reminder"

## User Experience

### Creating Multiple Reminders

✅ **Users can create multiple reminders** - each is independent:

- Reminder 1: "Morning Yoga" @ 08:00 for User A
- Reminder 2: "Evening Walk" @ 18:00 for User B
- Reminder 3: "Study Session" @ 14:00 for User C

Each executes once and deactivates independently.

### What Happens After Execution

1. **Reminder card shows "Executed" badge**
2. **Toggle switch is disabled** (shown as inactive)
3. **Status shows the final state**: "completed", "replied", or "sent"
4. **Can be deleted** but cannot be reactivated

### Creating New Reminders

- To send the same reminder again, create a **new reminder** with the same details
- System treats each reminder as a unique, one-time request

## Testing

### Test Case 1: One-Time Execution

1. Create a reminder for [current time + 2 minutes]
2. Wait for the reminder to send
3. Check that `isActive` becomes `false`
4. Wait until tomorrow
5. ✅ Verify: No message is sent on Day 2

### Test Case 2: Reply Cancels Follow-Up

1. Create a reminder with follow-up in 1 hour
2. Reminder sends at scheduled time
3. User replies within the hour
4. ✅ Verify: Follow-up is NOT sent
5. ✅ Verify: Status updates to "replied" or "completed"

### Test Case 3: Multiple Independent Reminders

1. Create Reminder A for User 1
2. Create Reminder B for User 2
3. ✅ Verify: Both send independently
4. ✅ Verify: Both deactivate after sending
5. ✅ Verify: No cross-interference

## Migration Notes

### Existing Reminders

If you have existing reminders that were created before this update:

- They will be automatically deactivated after their first execution
- The cron job includes logic to detect and deactivate already-executed reminders

### No Data Loss

- All `ReminderExecution` records are preserved
- All `MessageLog` records are preserved
- Historical data remains intact

## Summary

The system now operates with these core principles:

1. ⚡ **One-Time Execution**: Each reminder sends exactly once
2. 📊 **Multiple Reminders**: Create as many as needed, each is independent
3. 🔍 **Reply Tracking**: System watches for replies between reminder and follow-up
4. 🚫 **Smart Cancellation**: Follow-up cancelled if user replies
5. ✅ **Clear Status**: UI shows execution state clearly

This ensures users won't receive duplicate messages and the system behaves predictably and transparently.
