/**
 * DEBUG DB INSPECTOR
 * Run with: node debug_db_inspector.js <phone_number_last_10>
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function inspect() {
  const phoneArg = process.argv[2];
  if (!phoneArg) {
    console.log("Please provide the last 10 digits of the phone number.");
    console.log("Usage: node debug_db_inspector.js 9876543210");
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    console.log(`🔍 Inspecting data for phone ending in: ${phoneArg}\n`);

    const db = client.db();

    // 1. Check Reminder Executions
    console.log('--- REMOTE EXECUTIONS (Last 5) ---');
    const executions = await db.collection('reminderexecutions')
      .find({ phone: { $regex: `${phoneArg}$` } })
      .sort({ sentAt: -1 })
      .limit(5)
      .toArray();
    
    if (executions.length === 0) console.log("No executions found.");
    executions.forEach(e => {
      console.log(`ID: ${e._id}`);
      console.log(`  Date: ${e.date}`);
      console.log(`  Status: ${e.status}`);
      console.log(`  FollowUp: ${e.followUpStatus}`);
      console.log(`  SentAt: ${e.sentAt}`);
      console.log(`  ReplyAt: ${e.replyReceivedAt}`);
      console.log('-----------------------------------');
    });

    // 2. Check Reminders
    console.log('\n--- REMINDERS (Active) ---');
    const reminders = await db.collection('reminders')
      .find({ phone: { $regex: `${phoneArg}$` } })
      .toArray();

    if (reminders.length === 0) console.log("No reminders found.");
    reminders.forEach(r => {
      console.log(`ID: ${r._id}`);
      console.log(`  Title: ${r.title}`);
      console.log(`  Active: ${r.isActive}`);
      console.log(`  DailyStatus: ${r.dailyStatus}`);
      console.log(`  Time: ${r.reminderTime}`);
      console.log('-----------------------------------');
    });

    // 3. Check Message Logs (Inbound)
    console.log('\n--- INBOUND MESSAGE LOGS (Last 5) ---');
    const logs = await db.collection('messagelogs')
      .find({ 
        phone: { $regex: `${phoneArg}$` },
        direction: 'inbound'
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    if (logs.length === 0) console.log("No inbound logs found.");
    logs.forEach(l => {
      console.log(`Time: ${l.createdAt}`);
      console.log(`  Content: ${l.content}`);
      console.log(`  Status: ${l.status}`);
      console.log('-----------------------------------');
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

inspect();
