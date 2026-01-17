const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"; // Use a recent version

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const fromId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!fromId || !token) {
      console.error("WhatsApp credentials missing");
      return { success: false, error: "Credentials missing" };
    }

    const url = `${WHATSAPP_API_URL}/${fromId}/messages`;

    // NOTE: For business-initiated messages to new users, you MUST use templates.
    // This implementation sends text messages, which works for replies (24h window)
    // or if the implementation uses a "template" structure in the body logic.
    // Given the prompt asks for "Reminder message" input, we'll try text first.
    // If you need template, the payload structure changes.

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: body },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API Error:", data);
      return { success: false, error: data };
    }

    return { success: true, data };
  } catch (error) {
    console.error("WhatsApp Send Exception:", error);
    return { success: false, error };
  }
}
