const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function checkInbound() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const inbound = await client.db().collection('messagelogs')
      .find({ direction: 'inbound' })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (inbound.length > 0) {
        console.log("✅ INBOUND LOG FOUND:");
        console.log(`Time: ${inbound[0].createdAt}`);
        console.log(`Content: ${inbound[0].content}`);
        console.log(`Type: ${inbound[0].messageType}`);
    } else {
        console.log("❌ NO INBOUND LOGS FOUND. The webhook has never successfully logged a message.");
    }
  } catch(e) { console.error(e); }
  finally { await client.close(); }
}
checkInbound();
