const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function checkStatus() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const r = (await client.db().collection('reminders').find().sort({createdAt:-1}).limit(1).toArray())[0];
    const executions = await client.db().collection('reminderexecutions').find({reminderId: r._id}).toArray();

    console.log("FINAL_STATUS_CHECK");
    console.log(`REMINDER_ID: ${r._id}`);
    console.log(`REMINDER_STATUS: ${r.dailyStatus}`);
    
    executions.forEach((e, i) => {
        console.log(`EXEC_${i}_ID: ${e._id}`);
        console.log(`EXEC_${i}_DATE: "${e.date}"`); // Quote date to see invisible chars
        console.log(`EXEC_${i}_STATUS: ${e.status}`);
        console.log(`EXEC_${i}_FOLLOWUP: ${e.followUpStatus}`);
    });
  } catch(e) { console.error(e); }
  finally { await client.close(); }
}
checkStatus();
