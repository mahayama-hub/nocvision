import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { requireSessionUser } from "@/lib/auth";
import { loadNocState, saveNocState } from "@/lib/noc-store";
import {
  DEFAULT_ALERTING_CONFIG,
  getDefaultWhatsAppUrl,
  reportCyberThreat,
  sendTelegramBotMessage,
  sendWhatsAppBotMessage,
  toPublicAlertingConfig,
  validateBotApiUrl,
} from "@/lib/alerting";
import { AlertDeliveryLog, AlertingConfig, WhatsAppBotProvider } from "@/lib/types";


function logAlertingAttempt(entry: Record<string, unknown>) {
  try {
    fs.appendFileSync(
      "/var/log/nocvision-alerting.log",
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n"
    );
  } catch {
    // abaikan kegagalan logging
  }
}

export async function GET(req: NextRequest) {
  const auth = requireSessionUser(req, "view_dashboard");
  if (auth.response) return auth.response;

  const state = loadNocState();
  return NextResponse.json({
    ok: true,
    config: toPublicAlertingConfig(state.alertingConfig),
    logs: state.alertLogs || [],
    cyberThreats: state.cyberThreats || [],
    authAccessLogs: state.authAccessLogs || [],
  });
}

export async function POST(req: NextRequest) {
  const auth = requireSessionUser(req, "manage_devices");
  if (auth.response) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const state = loadNocState();
    const prev: AlertingConfig = {
      ...DEFAULT_ALERTING_CONFIG,
      ...state.alertingConfig,
    };

    if (action === "save_config") {
      const whatsappProvider = (
        ["fonnte", "wablas", "meta_cloud", "custom_webhook"].includes(
          String(body.whatsappProvider || "")
        )
          ? String(body.whatsappProvider)
          : prev.whatsappProvider
      ) as WhatsAppBotProvider;

      const nextTelegramToken =
        typeof body.telegramBotToken === "string" && body.telegramBotToken.trim()
          ? body.telegramBotToken.trim()
          : body.clearTelegramToken === true
          ? ""
          : prev.telegramBotToken;

      const nextWhatsappToken =
        typeof body.whatsappToken === "string" && body.whatsappToken.trim()
          ? body.whatsappToken.trim()
          : body.clearWhatsappToken === true
          ? ""
          : prev.whatsappToken;

      const rawWaUrl =
        typeof body.whatsappApiUrl === "string" && body.whatsappApiUrl.trim()
          ? body.whatsappApiUrl.trim()
          : getDefaultWhatsAppUrl(whatsappProvider);

      const whatsappEnabled = Boolean(body.whatsappEnabled);
      // validasi hanya untuk channel yang memang diaktifkan,
      // supaya simpan Telegram tidak ikut gagal karena URL WhatsApp kosong
      if (whatsappEnabled) {
        const check = validateBotApiUrl(rawWaUrl);
        if (!check.ok) {
          return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
        }
      }

      const nextConfig: AlertingConfig = {
        telegramEnabled: Boolean(body.telegramEnabled),
        telegramBotToken: nextTelegramToken,
        telegramChatId: String(body.telegramChatId ?? prev.telegramChatId).trim(),
        telegramBotName: String(body.telegramBotName ?? prev.telegramBotName ?? "").trim(),
        whatsappEnabled,
        whatsappProvider,
        whatsappApiUrl: rawWaUrl,
        whatsappToken: nextWhatsappToken,
        whatsappTarget: String(body.whatsappTarget ?? prev.whatsappTarget).trim(),
        whatsappBotName: String(body.whatsappBotName ?? prev.whatsappBotName ?? "").trim(),
        notifyOnCritical:
          body.notifyOnCritical !== undefined
            ? Boolean(body.notifyOnCritical)
            : prev.notifyOnCritical,
        notifyOnOffline:
          body.notifyOnOffline !== undefined
            ? Boolean(body.notifyOnOffline)
            : prev.notifyOnOffline,
        notifyOnWarning:
          body.notifyOnWarning !== undefined
            ? Boolean(body.notifyOnWarning)
            : prev.notifyOnWarning,
        notifyOnRecovery:
          body.notifyOnRecovery !== undefined
            ? Boolean(body.notifyOnRecovery)
            : prev.notifyOnRecovery,
        notifyOnCyberThreat:
          body.notifyOnCyberThreat !== undefined
            ? Boolean(body.notifyOnCyberThreat)
            : prev.notifyOnCyberThreat,
        notifyOnAuthActivity:
          body.notifyOnAuthActivity !== undefined
            ? Boolean(body.notifyOnAuthActivity)
            : prev.notifyOnAuthActivity,
        updatedAt: new Date().toISOString(),
      };

      state.alertingConfig = nextConfig;
      saveNocState(state);
      logAlertingAttempt({
        action: "save_config",
        user: auth.user.username,
        telegramEnabled: nextConfig.telegramEnabled,
        telegramChatId: nextConfig.telegramChatId,
        hasTelegramToken: Boolean(nextConfig.telegramBotToken),
        whatsappEnabled: nextConfig.whatsappEnabled,
        whatsappTarget: nextConfig.whatsappTarget,
        result: "ok",
      });

      return NextResponse.json({
        ok: true,
        config: toPublicAlertingConfig(nextConfig),
        logs: state.alertLogs || [],
      });
    }

    if (action === "reset_config") {
      const channel = String(body.channel || "all");
      const next: AlertingConfig = { ...prev };
      if (channel === "telegram" || channel === "all") {
        next.telegramEnabled = false;
        next.telegramBotToken = "";
        next.telegramChatId = "";
      }
      if (channel === "whatsapp" || channel === "all") {
        next.whatsappEnabled = false;
        next.whatsappToken = "";
        next.whatsappTarget = "";
      }
      next.updatedAt = new Date().toISOString();
      state.alertingConfig = next;
      saveNocState(state);
      return NextResponse.json({ ok: true, config: toPublicAlertingConfig(next) });
    }

    if (action === "test_telegram") {
      const token =
        typeof body.telegramBotToken === "string" && body.telegramBotToken.trim()
          ? body.telegramBotToken.trim()
          : prev.telegramBotToken;
      const chatId =
        typeof body.telegramChatId === "string" && body.telegramChatId.trim()
          ? body.telegramChatId.trim()
          : prev.telegramChatId;
      const testMessage =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : `[NOCVISION TEST] Uji koneksi Telegram Bot API berhasil.\nDikirim oleh: ${auth.user.fullName} (${auth.user.role})\nWaktu: ${new Date().toLocaleString("id-ID")}`;

      const result = await sendTelegramBotMessage(token, chatId, testMessage);
      const logEntry: AlertDeliveryLog = {
        id: `alt-tg-${Date.now()}`,
        timestamp: new Date().toISOString(),
        channel: "telegram",
        target: chatId || "(kosong)",
        status: result.ok ? "sent" : "failed",
        title: "Test Telegram Bot API",
        messagePreview: testMessage.slice(0, 140),
        detail: result.detail,
        triggeredBy: auth.user.fullName,
      };
      state.alertLogs = [logEntry, ...(state.alertLogs || [])].slice(0, 100);
      saveNocState(state);

      return NextResponse.json(
        {
          ok: result.ok,
          detail: result.detail,
          error: result.ok ? undefined : result.detail,
          logs: state.alertLogs,
        },
        { status: result.ok ? 200 : 400 }
      );
    }

    if (action === "test_whatsapp") {
      const provider = (
        ["fonnte", "wablas", "meta_cloud", "custom_webhook"].includes(
          String(body.whatsappProvider || "")
        )
          ? String(body.whatsappProvider)
          : prev.whatsappProvider
      ) as WhatsAppBotProvider;

      const token =
        typeof body.whatsappToken === "string" && body.whatsappToken.trim()
          ? body.whatsappToken.trim()
          : prev.whatsappToken;
      const target =
        typeof body.whatsappTarget === "string" && body.whatsappTarget.trim()
          ? body.whatsappTarget.trim()
          : prev.whatsappTarget;
      const apiUrl =
        typeof body.whatsappApiUrl === "string" && body.whatsappApiUrl.trim()
          ? body.whatsappApiUrl.trim()
          : prev.whatsappApiUrl || getDefaultWhatsAppUrl(provider);

      const testMessage =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : `[NOCVISION TEST] Uji koneksi WhatsApp Bot API (${provider}) berhasil. Dikirim oleh ${auth.user.fullName} pada ${new Date().toLocaleString("id-ID")}.`;

      const result = await sendWhatsAppBotMessage(
        {
          whatsappProvider: provider,
          whatsappApiUrl: apiUrl,
          whatsappToken: token,
          whatsappTarget: target,
        },
        testMessage
      );

      const logEntry: AlertDeliveryLog = {
        id: `alt-wa-${Date.now()}`,
        timestamp: new Date().toISOString(),
        channel: "whatsapp",
        target: target || "(kosong)",
        status: result.ok ? "sent" : "failed",
        title: "Test WhatsApp Bot API",
        messagePreview: testMessage.slice(0, 140),
        detail: result.detail,
        triggeredBy: auth.user.fullName,
      };
      state.alertLogs = [logEntry, ...(state.alertLogs || [])].slice(0, 100);
      saveNocState(state);

      return NextResponse.json(
        {
          ok: result.ok,
          detail: result.detail,
          error: result.ok ? undefined : result.detail,
          logs: state.alertLogs,
        },
        { status: result.ok ? 200 : 400 }
      );
    }

    if (action === "clear_logs") {
      state.alertLogs = [];
      saveNocState(state);
      return NextResponse.json({ ok: true, logs: [] });
    }

    if (action === "mitigate_threat") {
      const threatId = String(body.threatId || "");
      const target = (state.cyberThreats || []).find((t) => t.id === threatId);
      if (!target) {
        return NextResponse.json({ ok: false, error: "Event ancaman tidak ditemukan." }, { status: 404 });
      }
      target.status = "mitigated";
      saveNocState(state);
      return NextResponse.json({
        ok: true,
        cyberThreats: state.cyberThreats || [],
      });
    }

    if (action === "clear_threats") {
      state.cyberThreats = [];
      saveNocState(state);
      return NextResponse.json({ ok: true, cyberThreats: [] });
    }

    if (action === "clear_auth_logs") {
      state.authAccessLogs = [];
      saveNocState(state);
      return NextResponse.json({ ok: true, authAccessLogs: [] });
    }

    if (action === "test_cyber_alert") {
      const ev = await reportCyberThreat({
        severity: "high",
        category: "ddos_spike",
        sourceIp: "203.0.113.99",
        target: "Core Edge Gateway",
        summary: "Simulasi uji deteksi DDoS / SYN Flood untuk verifikasi Defensive Security Alerting.",
        mitigationAction: "Aktifkan SYN-Flood Drop & RTBH Blackhole pada BGP Upstream.",
        triggeredBy: auth.user.fullName,
      });
      const updated = loadNocState();
      return NextResponse.json({
        ok: true,
        event: ev,
        logs: updated.alertLogs || [],
        cyberThreats: updated.cyberThreats || [],
      });
    }

    return NextResponse.json({ ok: false, error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Server alerting error",
      },
      { status: 500 }
    );
  }
}
