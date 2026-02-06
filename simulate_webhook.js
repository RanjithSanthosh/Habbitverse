const https = require('https');

// Payload mocking a "Completed" reply from WhatsApp
const data = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "123456789",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "1234567890", phone_number_id: "123456" },
        messages: [{
            from: "916369879920", // YOUR NUMBER
            id: "wamid.test",
            timestamp: "1706680000",
            text: { body: "Completed" },
            type: "text"
        }]
      },
      field: "messages"
    }]
  }]
});

const options = {
  hostname: 'habbitverse.vercel.app',
  path: '/api/webhook/whatsapp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log("🚀 Sending Simulated Webhook to https://habbitverse.vercel.app/api/webhook/whatsapp ...");

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(`\nResponse Status: ${res.statusCode}`);
    console.log(`Response Body: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`ERROR: ${e.message}`);
});

req.write(data);
req.end();
