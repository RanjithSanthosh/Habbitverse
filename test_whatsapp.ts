import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const TO_PHONE = "916369879920"; // Hardcoded from your previous debug log

async function testWhatsapp() {
  const fromId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  console.log("--- Debugging Credentials ---");
  console.log("Phone ID Length:", fromId?.length);
  console.log("Token Length:", token?.length);
  console.log("Target Phone:", TO_PHONE);

  if (!fromId || !token) {
    console.error("MISSING CREDENTIALS in .env.local");
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${fromId}/messages`;

  // We try to send a simple "hello_world" template which is always available in Dev accounts
  // This bypasses the "24h window" restriction for testing permissions.
  const payload = {
    messaging_product: "whatsapp",
    to: TO_PHONE,
    type: "template",
    template: {
      name: "hello_world",
      language: { code: "en_US" },
    },
  };

  console.log("\n--- Sending Request ---");
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("\n--- API Response ---");
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Request Failed", e);
  }
}

testWhatsapp();
