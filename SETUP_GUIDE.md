# HabbitVerse Setup Guide

This guide will teach you how to get the necessary credentials and run the project locally.

## 1. Configure Environment Variables

1.  In the project root, locate the file named `EXAMPLE_ENV`.
2.  Rename it to `.env.local`.
    - _Note: `.env.local` is where Next.js looks for secrets, and it is ignored by git to keep your secrets safe._
3.  Now you need to fill in the values. Follow the steps below.

---

## 2. Get MongoDB Credentials (Database)
    
1.  Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up/login.
2.  **Create a Cluster**: Use the free tier (Shared -> M0 Sandbox).
3.  **Create a User**:
    - Go to **Database Access** (sidebar).
    - Add New Database User -> Password Authentication.
    - Enter a username (e.g., `admin`) and a password (make it strong). **Remember these!**
    - Click "Add User".
4.  **Network Access**:
    - Go to **Network Access** (sidebar).
    - Add IP Address -> "Allow Access from Anywhere" (0.0.0.0/0) for development ease. Confirm.
5.  **Get Connection String**:
    - Go to **Database** (sidebar) -> Click **Connect** on your cluster.
    - Choose **Drivers** -> Node.js (Version 5.5 or later).
    - Copy the string. It looks like:
      `mongodb+srv://admin:<password>@cluster0.abcd.mongodb.net/?retryWrites=true&w=majority`
6.  **Update .env.local**:
    - Paste the string into `MONGODB_URI`.
    - Replace `<password>` with the user password you created in step 3.
    - You can change the database name (the part after `.net/`) to `habbitverse`.

---

## 3. Get WhatsApp API Credentials

1.  Go to [Meta for Developers](https://developers.facebook.com/) and login.
2.  **Create App**:
    - My Apps -> Create App.
    - Select "Other" -> Next.
    - Select "Business" -> Next.
    - Give it a name (e.g., "HabbitVerse") -> Create App.
3.  **Add Product**:
    - Scroll down to **WhatsApp** -> Click "Set up".
4.  **API Setup** (Temporary Token):
    - You will see a "Getting Started" page.
    - **Phone Number ID**: Copy "Phone number ID" and paste into `.env.local` as `WHATSAPP_PHONE_NUMBER_ID`.
    - **Access Token**: Copy "Temporary access token" and paste into `WHATSAPP_ACCESS_TOKEN`.
      - _Note: This token expires in 24h. For production, you need a System User Permanent Token._
5.  **Configure Recipient**:
    - In the "To" field on the Meta setup page, add your own WhatsApp number to test. You must verify it since the app is in "Development" mode.

---

## 4. Webhook Configuration (For Replies)

To receive replies (run the webhook) locally, you need to expose your localhost to the internet.

1.  **Define a Verify Token**:
    - In `.env.local`, set `WHATSAPP_VERIFY_TOKEN` to any string you like (e.g., `habbit123`).
2.  **Setup Ngrok** (Recommended):
    - Download [Ngrok](https://ngrok.com/).
    - Run in terminal: `ngrok http 3000`.
    - Copy the HTTPS URL (e.g., `https://a1b2.ngrok-free.app`).
3.  **Configure Meta**:
    - Go to WhatsApp -> **Configuration** in Meta Dashboard.
    - **Edit Callback URL**: Paste your ngrok URL + `/api/webhook/whatsapp`.
      - Example: `https://a1b2.ngrok-free.app/api/webhook/whatsapp`
    - **Verify Token**: Enter the same string from step 1 (`habbit123`).
    - Click "Verify and Save".
4.  **Subscribe to Fields**:
    - Click "Manage" under Webhook fields.
    - Subscribe to `messages`.

---

## 5. Other Secrets

- **JWT_SECRET_KEY**: Just type any long random string in `.env.local`. This is used to encrypt your login session.

---

## 6. How to Run Locally

1.  Ensure all dependencies are installed:
    ```bash
    npm install
    ```
2.  Start the server:
    ```bash
    npm run dev
    ```
3.  Open browser setup:
    - Go to `http://localhost:3000`.
    - It will redirect to Login.
    - Enter ANY username and password (e.g., `admin` / `password123`).
    - Since it's the first run, the system will **create this account** as an Admin.
4.  Create a Reminder:
    - Use the Dashboard to create a reminder.
    - Use your own WhatsApp number (registered in Step 3).
    - Set the time to 1-2 minutes from now.
5.  **Test the Scheduler**:
    - Locally, Vercel cron doesn't run automatically.
    - Wait for the time to match.
    - Open a new tab and visit: `http://localhost:3000/api/cron`
    - Check your WhatsApp!

You are ready to go!
