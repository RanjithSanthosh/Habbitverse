const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0"; // Use a recent version

interface WhatsAppButton {
  id: string;
  title: string;
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  buttons?: WhatsAppButton[],
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const fromId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!fromId || !token) {
      console.error("WhatsApp credentials missing");
      return { success: false, error: "Credentials missing" };
    }

    const url = `${WHATSAPP_API_URL}/${fromId}/messages`;

    let payload: any = {
      messaging_product: "whatsapp",
      to: to,
    };

    if (buttons && buttons.length > 0) {
      // Interactive Message Payload
      payload.type = "interactive";
      payload.interactive = {
        type: "button",
        body: {
          text: body,
        },
        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title,
            },
          })),
        },
      };
    } else {
      // Standard Text Message
      payload.type = "text";
      payload.text = { body: body };
    }

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

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = "en_US",
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const fromId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!fromId || !token) {
      console.error("WhatsApp credentials missing");
      return { success: false, error: "Credentials missing" };
    }

    const url = `${WHATSAPP_API_URL}/${fromId}/messages`;

    let payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
      },
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
      console.error("WhatsApp Template API Error:", data);
      return { success: false, error: data };
    }

    return { success: true, data };
  } catch (error) {
    console.error("WhatsApp Template Send Exception:", error);
    return { success: false, error };
  }
}
