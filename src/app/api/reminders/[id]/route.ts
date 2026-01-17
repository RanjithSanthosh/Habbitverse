import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Reminder from "@/models/Reminder";
import { verifyAuth, unauthorized } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  // Await params in newer Next.js versions if needed, but standard access is fine for file route types currently
  // Actually Next.js 15 treats params as a Promise. Since I used create-next-app@latest, it might be 15.
  // I will await it just in case, or treat it as sync if I know it's 14.
  // To be safe, I'll access it directly if it's an object.
  const { id } = await Promise.resolve(params);

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
  { params }: { params: { id: string } }
) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const { id } = await Promise.resolve(params);

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
