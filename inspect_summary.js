const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function inspectLast() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db();
    
    const lastReminder = await db.collection('reminders').find({}).sort({ createdAt: -1 }).limit(1).toArray();
    const r = lastReminder[0];
    
    if (!r) return console.log("No reminder");

    const executions = await db.collection('reminderexecutions').find({ reminderId: r._id }).sort({ date: -1 }).toArray();
    
    const logs = await db.collection('messagelogs').find({}).sort({ createdAt: -1 }).limit(5).toArray();

    const report = {
        lastReminder: { 
            id: r._id, 
            title: r.title, 
            phone: r.phone,
            status: r.dailyStatus,
            active: r.isActive 
        },
        executions: executions.map(e => ({
            id: e._id,
            status: e.status,
            followUp: e.followUpStatus,
            sent: e.sentAt,
            reply: e.replyReceivedAt
        })),
        recentLogs: logs.map(l => ({
            dir: l.direction,
            type: l.messageType,
            txt: l.content,
            time: l.createdAt
        }))
    };

    console.log("___REPORT_START___");
    console.log(JSON.stringify(report, null, 2));
    console.log("___REPORT_END___");

  } catch (e) { console.error(e); } 
  finally { await client.close(); }
}
inspectLast();
