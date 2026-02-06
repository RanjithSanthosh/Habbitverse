const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function checkRecent() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    // 15:30 UTC = 21:00 IST approx
    const cutoff = new Date(Date.now() - 15 * 60 * 1000); 
    
    console.log(`Checking logs since: ${cutoff.toISOString()}`);

    const logs = await client.db().collection('messagelogs')
      .find({ createdAt: { $gt: cutoff } })
      .sort({ createdAt: -1 })
      .toArray();

    if (logs.length === 0) {
        console.log("No logs found in last 15 mins.");
    } else {
        logs.forEach(l => {
            console.log(`[${l.direction}] ${l.messageType} | Status: ${l.status || 'unknown'}`);
            console.log(`Content: ${l.content?.substring(0, 30)}`);
            if (l.rawResponse && l.rawResponse.error) {
                console.log(`❌ Error: ${JSON.stringify(l.rawResponse.error)}`);
            } else if (l.direction === 'outbound') {
                console.log(`✅ Success (No Error recorded)`);
            }
            console.log('---');
        });
    }
  } catch(e) { console.error(e); }
  finally { await client.close(); }
}
checkRecent();
