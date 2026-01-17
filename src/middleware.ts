import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET_KEY = process.env.JWT_SECRET_KEY || "default-secret-key-change-it";
const key = new TextEncoder().encode(SECRET_KEY);

export async function middleware(req: NextRequest) {
  // Check if accessing dashboard
  if (req.nextUrl.pathname.startsWith("/dashboard")) {
    const token = req.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    try {
      await jwtVerify(token, key);
      return NextResponse.next();
    } catch (err) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
