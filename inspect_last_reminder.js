const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function inspectLast() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    console.log('✅ Connected. Fetching last reminder...\n');

    // 1. Get Last Created Reminder
    const lastReminder = await db.collection('reminders')
      .find({})
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (lastReminder.length === 0) {
      console.log("No reminders found.");
      return;
    }

    const r = lastReminder[0];
    console.log(`🔷 LAST REMINDER: ${r._id}`);
    console.log(`   Title: "${r.title}"`);
    console.log(`   Phone: ${r.phone}`);
    console.log(`   Times: Reminder=${r.reminderTime}, FollowUp=${r.followUpTime}`);
    console.log(`   Active: ${r.isActive}`);
    console.log(`   Status: ${r.dailyStatus}`);
    console.log(`   Created: ${r.createdAt}`);

    // 2. Get Executions for this Reminder
    console.log(`\n🔶 EXECUTIONS for this Reminder:`);
    const executions = await db.collection('reminderexecutions')
      .find({ reminderId: r._id })
      .sort({ date: -1 })
      .toArray();

    if (executions.length === 0) console.log("   No executions found.");
    executions.forEach(e => {
      console.log(`   ID: ${e._id}`);
      console.log(`   Date: ${e.date}`);
      console.log(`   Status: ${e.status}`);
      console.log(`   FollowUpStatus: ${e.followUpStatus}`);
      console.log(`   SentAt: ${e.sentAt}`);
      console.log(`   ReplyReceivedAt: ${e.replyReceivedAt}`);
      console.log('   ----------------');
    });

    // 3. Get Recent Message Logs (Last 10 Global)
    console.log(`\n📜 RECENT LOGS (Last 10):`);
    const logs = await db.collection('messagelogs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    logs.forEach(l => {
      console.log(`   [${l.direction}] ${l.messageType} | Phone: ${l.phone}`);
      console.log(`   Content: ${l.content?.substring(0, 50)}`);
      console.log(`   Time: ${l.createdAt}`);
      console.log('   ---');
    });

  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

inspectLast();
