// Direct HTTPS test for WhatsApp API
const https = require('https');
require('dotenv').config({ path: '.env.local' });

async function testSend() {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    // User's phone from logs
    const to = "916369879920"; 

    console.log(`Testing Token: ${token.substring(0, 15)}...`);
    console.log(`Phone ID: ${phoneId}`);

    const data = JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "template",
        template: {
            name: "hello_world",
            language: { code: "en_US" }
        }
    });

    const options = {
        hostname: 'graph.facebook.com',
        path: `/v21.0/${phoneId}/messages`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
            responseBody += chunk;
        });

        res.on('end', () => {
            console.log(`\nStatus Code: ${res.statusCode}`);
            const json = JSON.parse(responseBody);
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log("✅ SUCCESS! Message Sent.");
                console.log("Response:", JSON.stringify(json, null, 2));
            } else {
                console.log("❌ FAILED. Token might be invalid or permissions missing.");
                console.log("Error:", JSON.stringify(json, null, 2));
            }
        });
    });

    req.on('error', (error) => {
        console.error("Network Error:", error);
    });

    req.write(data);
    req.end();
}

testSend();
