import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import { verifyAuth, unauthorized } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  try {
    const body = await req.json();
    await dbConnect();

    const reminder = await Reminder.findByIdAndUpdate(id, body, { new: true });
    return NextResponse.json(reminder);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update reminder" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const { id } = await params;

  try {
    await dbConnect();
    await Reminder.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete reminder" },
      { status: 500 }
    );
  }
}
