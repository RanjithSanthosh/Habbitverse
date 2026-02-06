import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import MessageLog from "@/models/MessageLog";

export const maxDuration = 60;

// VERIFICATION
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// INBOUND
export async function POST(req: NextRequest) {
  try {
    console.log("🔥 SIMPLE WEBHOOK HIT 🔥");
    const body = await req.json();

    // Try logging to DB just to prove we can
    try {
      await dbConnect();
      await MessageLog.create({
        phone: "0000000000",
        direction: "inbound",
        messageType: "debug_hit",
        content: "Simple Webhook Hit",
        status: "received",
        rawResponse: body,
      });
    } catch (e) {
      console.error("DB Log failed", e);
    }

    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    return new NextResponse("Server Error", { status: 500 });
  }
}
