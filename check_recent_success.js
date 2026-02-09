const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function checkRecent() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    // 15:30 UTC = 21:00 IST approx
    const timeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    console.log(`Checking logs since: ${timeThreshold.toISOString()}`);

    const logs = await client.db().collection('messagelogs')
      .find({ createdAt: { $gt: timeThreshold } })
      .sort({ createdAt: -1 })
      .toArray();

    if (logs.length === 0) {
        console.log("No logs found in last 15 mins.");
    } else {
        logs.forEach(log => {
            console.log(`[${log.direction}] ${log.messageType} | Status: ${log.status}`);
            console.log(`Time: ${new Date(log.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
            console.log(`Content: ${log.content?.substring(0, 30)}`);
            if (log.rawResponse && log.rawResponse.error) {
                console.log(`❌ Error: ${JSON.stringify(log.rawResponse.error)}`);
            } else if (log.direction === 'outbound') {
                console.log(`✅ Success (No Error recorded)`);
            }
            console.log('---');
        });
    }
  } catch(e) { console.error(e); }
  finally { await client.close(); }
}
checkRecent();
