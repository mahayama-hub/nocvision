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
import { recordAuthAccessLog, reportCyberThreat } from "@/lib/alerting";

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

    const username = (typeof body.username === "string" ? body.username : "").trim();
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "Username/Email dan Password wajib diisi." },
        { status: 400 }
      );
    }

    const rawClientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "local";
    const clientIp = rawClientIp
      .replace(/^::ffff:/, "")
      .replace(/^::1$/, "127.0.0.1");
    const userAgent = req.headers.get("user-agent") || "unknown";
    const rateKey = `${clientIp}:${username.toLowerCase()}`;
    const rateIp = checkLoginRateLimit(clientIp);
    const rateAccount = checkLoginRateLimit(rateKey);
    const rate = !rateIp.allowed ? rateIp : rateAccount;
    if (!rate.allowed) {
      recordAuthAccessLog({
        username,
        sourceIp: clientIp,
        userAgent,
        outcome: "blocked_bruteforce",
        reason: `Diblokir rate limiter (${rate.retryAfterSeconds}s)`,
      });
      void reportCyberThreat({
        severity: "high",
        category: "brute_force",
        sourceIp: clientIp,
        target: username,
        summary: `Terdeteksi percobaan brute-force login berulang terhadap akun '${username}'.`,
        mitigationAction: `Akun/IP diblokir sementara selama ${rate.retryAfterSeconds} detik oleh Rate Limiter. Evaluasi blokir IP ${clientIp} di firewall.`,
        triggeredBy: "Auth Guard",
      }).catch(() => {});

      return NextResponse.json(
        {
          ok: false,
          error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${rate.retryAfterSeconds} detik.`,
        },
        { status: 429 }
      );
    }

    const user = authenticateNocUser(username, password);
    if (!user) {
      recordLoginFailure(clientIp);
      recordLoginFailure(rateKey);
      recordAuthAccessLog({
        username,
        sourceIp: clientIp,
        userAgent,
        outcome: "failed",
        reason: "Username/Email atau Password salah",
      });
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
    clearLoginFailures(rateKey);
    recordAuthAccessLog({
      username: user.username,
      role: user.role,
      sourceIp: clientIp,
      userAgent,
      outcome: "success",
      reason: "Autentikasi berhasil & sesi diterbitkan",
    });
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

