const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function checkError() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const logs = await client.db().collection('messagelogs')
      .find({ status: { $ne: 'sent' } }) // Find failed logs
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (logs.length > 0) {
        console.log("--- LAST ERROR LOG ---");
        console.log(JSON.stringify(logs[0].rawResponse, null, 2));
    } else {
        console.log("No failed logs found recently.");
    }
  } catch(e) { console.error(e); }
  finally { await client.close(); }
}
checkError();
