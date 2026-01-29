# 🏗️ HabbitVerse: Project Architecture & File Guide

This document defines the core files that make your reminder system work, explaining the **Purpose** (Why it exists) and **Concept** (How it works) for each.

---

## 1. ⚙️ Core Automation Engine (The Brains)

These files run automatically on the server to make things happen.

### 📄 `src/app/api/cron/route.ts`

- **Role:** The **Heartbeat** of the system.
- **Concept:** This file is triggered every minute by `cron-job.org`. It is the active force that checks "Is it time to do something?".
- **Key Responsibilities:**
  1.  **Send Initial Reminders:** Checks if `reminderTime` has passed for any active habit.
  2.  **Send Follow-ups:** Checks if `followUpTime` has passed for any sent reminder that hasn't received a reply yet.
  3.  **Safety Checks:** Prevents double-sending by ensuring at least 2 minutes have passed since the last message.

### 📄 `src/app/api/webhook/whatsapp/route.ts`

- **Role:** The **Listener** (The Ears).
- **Concept:** This file sits and waits for Facebook/WhatsApp to "push" data to it. It does not run on a schedule; it runs only when an event happens (incoming message, read receipt).
- **Key Responsibilities:**
  1.  **Receive Replies:** Captures logic when a user texts back or clicks "Completed".
  2.  **Update Status:** Immediately updates the database (`ReminderExecution` and `Reminder`) to stop follow-up messages.
  3.  **Log Activity:** Records every incoming signal (even "Read" receipts) so you know the system is connected.

---

## 2. 💽 Data Layer (The Memory)

These files define how data is structured in MongoDB.

### 📄 `src/models/Reminder.ts`

- **Role:** The **Configuration**.
- **Concept:** Stores the "template" for a habit.
- **Analogy:** Like setting an alarm clock. It stays there day after day until you delete it.
- **Key Fields:** `reminderTime`, `followUpTime`, `message`, `phone`, `isActive`.

### 📄 `src/models/ReminderExecution.ts`

- **Role:** The **Daily Log**.
- **Concept:** Tracks what happened _today_ for a specific reminder.
- **Why it's important:** If you have a reminder for 9 AM every day, `Reminder` is just the setting. `ReminderExecution` is the specific record for "January 29th". It stores: "Did we send it?", "Did they reply?", "Did we skip the follow-up?".
- **Key Fields:** `date`, `status` (sent/replied/completed), `followUpStatus` (pending/sent/cancelled).

### 📄 `src/models/MessageLog.ts`

- **Role:** The **Black Box / Audit Trail**.
- **Concept:** A raw log of every single message sent or received.
- **Why it's important:** If something goes wrong, this is the truth. It shows exactly what WhatsApp told us and exactly what we sent them.

---

## 3. 🖥️ User Interface (The Frontend)

What you see in the browser.

### 📄 `src/app/dashboard/page.tsx`

- **Role:** The **Control Center**.
- **Concept:** A React component that fetches data and displays it visually.
- **Key Features:**
  - Auto-refreshes every 10 seconds to show live status.
  - Merges data from the "Plan" (`Reminder`) and "Today's Reality" (`ReminderExecution`) to show you if a user is "Pending", "Sent", or "Completed".

### 📄 `src/app/api/reminders/route.ts`

- **Role:** The **Data Bridge**.
- **Concept:** The frontend cannot talk to the database directly (security risk). This API endpoint fetches data from MongoDB, processes it (merging the config with today's status), and sends a clean JSON list to the frontend.

---

## 4. 🛠️ Utilities & Debugging (The Toolbox)

Helpers that make development and testing easier.

### 📄 `src/lib/whatsapp.ts`

- **Role:** The **Messenger**.
- **Concept:** A reusable function that handles the complex HTTP requests required to talk to the Facebook Graph API. You just call `sendWhatsAppMessage(phone, text)` and it handles the authentication and API details.

### 📄 `src/lib/dateUtils.ts`

- **Role:** The **Timekeeper**.
- **Concept:** Servers often run on UTC (Greenwich Mean Time). This helper ensures all our logic works in **IST (Indian Standard Time)** so 9:00 AM means 9:00 AM in India, not 3:30 AM.

### 📄 `debug_db_inspector.js`

- **Role:** The **X-Ray Machine**.
- **Concept:** A manual script you can run from the terminal (`node debug_db_inspector.js`) to see the raw contents of your database without using a GUI. Critical for debugging "why didn't this update?".

---

## 5. ⚙️ Configuration (The Settings)

### 📄 `vercel.json`

- **Role:** The **Deployment Config**.
- **Concept:** Tells Vercel how to run your code. Crucially, it sets the `maxDuration` for your API routes, ensuring the Cron job doesn't time out if it takes a few seconds to process.

### 📄 `.env.local`

- **Role:** The **Vault**.
- **Concept:** Stores secret keys (`MONGODB_URI`, `WHATSAPP_TOKEN`) that should never be shared or committed to GitHub.

---

## 🚀 How Data Flows Through These Files

1.  **Setup:** You create a habit in **Dashboard** → saved manually to **Reminder** collection.
2.  **Trigger:** **Cron** wakes up → reads **Reminder** → checks time → Sends via **WhatsApp Lib** → Creates **ReminderExecution**.
3.  **User Action:** User replies on WhatsApp → **Webhook** catches it → Updates **ReminderExecution** (sets to replied) AND **Reminder** (sets to inactive).
4.  **Verification:** **Dashboard** polls **API/Reminders** → sees the updated status → turns the card Green/Orange.
