# HabbitVerse Admin

A production-ready WhatsApp Habit Reminder System built with Next.js, MongoDB, and WhatsApp Business Cloud API.

## Features

- **Admin Dashboard**: Create and manage scheduled reminders.
- **Automated Scheduler**: Runs every minute (via Vercel Cron) to send reminders.
- **WhatsApp Integration**: Sends messages and handles replies via Webhooks.
- **Follow-up System**: Automatically sends a follow-up message if no reply is received within a set time.
- **State Tracking**: Tracks daily status (Pending, Sent, Replied, Missed).

## Setup Instructions

### 1. Prerequisites

- Node.js & npm
- MongoDB Atlas Account (Cluster URL)
- Meta Business Account (WhatsApp Cloud API)
- Vercel Account (for Cron support)

### 2. Installation

```bash
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root with the following:

```env
# Database
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/habbitverse?retryWrites=true&w=majority

# Security
JWT_SECRET_KEY=super-secret-key-change-this

# WhatsApp API
# Get these from Meta Developers Console -> WhatsApp -> API Setup
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_VERIFY_TOKEN=my-custom-verify-token
```

### 4. Database Setup

The application uses Mongoose. When you first log in, it will check if any admin exists.

1. Go to `/login`.
2. Enter any username/password.
3. If no admin exists in the DB, it will auto-create one with these credentials.

### 5. WhatsApp Webhook Configuration

1. Deploy the app to Vercel (or expose localhost via ngrok).
2. Go to Meta Developers Console -> WhatsApp -> Configuration.
3. Edit "Callback URL": `https://your-domain.vercel.app/api/webhook/whatsapp`
4. Enter "Verify Token": Matches `WHATSAPP_VERIFY_TOKEN`.
5. Subscribe to `messages` field.

### 6. Scheduler Setup (Vercel)

The project includes `vercel.json` configured for Cron Jobs.

1. Deploy to Vercel.
2. Vercel will automatically detect the Cron Job.
3. It hits `/api/cron` every minute.

_Note: On Hobby plan, Cron jobs might be limited to once per day. You need Pro for 1-minute, or use a customized external trigger (GitHub Actions / Mergent) to hit the endpoint._

### 7. Running Locally

```bash
npm run dev
```

To test the scheduler locally, manually visit: `http://localhost:3000/api/cron`

## Database Schema

- **Reminders**: Stores schedule, message, and daily state.
- **MessageLogs**: clear audit trail of all outbound/inbound messages.
- **Admins**: Auth credentials.

## License

Private.
