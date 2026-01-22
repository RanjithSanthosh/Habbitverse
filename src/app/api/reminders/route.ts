import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import { verifyAuth, unauthorized } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  await dbConnect();
  const reminders = await Reminder.find().sort({ createdAt: -1 });
  return NextResponse.json(reminders);
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  try {
    const body = await req.json();
    await dbConnect();

    // Basic Validation
    if (
      !body.phone ||
      !body.title ||
      !body.message ||
      !body.reminderTime ||
      !body.followUpTime
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Format Phone: Ensure it has 91 prefix for India if 10 digits
    let phone = body.phone.trim().replace(/\D/g, ""); // Remove non-digits
    if (phone.length === 10) {
      phone = "91" + phone;
    }

    const reminder = await Reminder.create({ ...body, phone });
    return NextResponse.json(reminder);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create reminder" },
      { status: 500 }
    );
  }
}
