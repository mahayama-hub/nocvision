import { NextRequest, NextResponse } from "next/server";
import {
  authenticateNocUser,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  recordLoginFailure,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

function isHttpsRequest(req: NextRequest): boolean {
  return (
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https"
  );
}

export async function GET(req: NextRequest) {
  const rawCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = verifySessionToken(rawCookie);
  if (!user) {
    return NextResponse.json({ authenticated: false, user: null });
  }
  return NextResponse.json({ authenticated: true, user });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE_NAME, "", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: isHttpsRequest(req),
        maxAge: 0,
      });
      return res;
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rate = checkLoginRateLimit(clientIp);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${rate.retryAfterSeconds} detik.`,
        },
        { status: 429 }
      );
    }

    const username = (body.username as string) || "";
    const password = (body.password as string) || "";

    const user = authenticateNocUser(username, password);
    if (!user) {
      recordLoginFailure(clientIp);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Username/Email atau Password tidak sesuai. Silakan cek kembali kredensial NOC Anda.",
        },
        { status: 401 }
      );
    }

    clearLoginFailures(clientIp);
    const token = createSessionToken(user);
    const res = NextResponse.json({ ok: true, user });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isHttpsRequest(req),
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Authentication error",
      },
      { status: 500 }
    );
  }
}

