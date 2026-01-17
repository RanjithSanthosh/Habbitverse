import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SECRET_KEY = process.env.JWT_SECRET_KEY || "default-secret-key-change-it";
const key = new TextEncoder().encode(SECRET_KEY);

export async function signToken(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function verifyAuth(req: NextRequest) {
  const token = (await cookies()).get("admin_token")?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch (err) {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
