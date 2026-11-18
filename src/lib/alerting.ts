import * as net from "net";
import {
  AlertDeliveryLog,
  AlertingConfig,
  AlertingConfigPublic,
  AuthAccessLog,
  CyberThreatEvent,
  WhatsAppBotProvider,
} from "./types";
import { loadNocState, saveNocState } from "./noc-store";

export const DEFAULT_ALERTING_CONFIG: AlertingConfig = {
  telegramEnabled: false,
  telegramBotToken: "",
  telegramChatId: "",
  whatsappEnabled: false,
  whatsappProvider: "fonnte",
  whatsappApiUrl: "https://api.fonnte.com/send",
  whatsappToken: "",
  whatsappTarget: "",
  notifyOnCritical: true,
  notifyOnOffline: true,
  notifyOnWarning: false,
  notifyOnRecovery: true,
  notifyOnCyberThreat: true,
  notifyOnAuthActivity: true,
};

export function maskSecret(value?: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 6) return "••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function toPublicAlertingConfig(
  cfg?: Partial<AlertingConfig>
): AlertingConfigPublic {
  const merged: AlertingConfig = { ...DEFAULT_ALERTING_CONFIG, ...cfg };
  return {
    telegramEnabled: merged.telegramEnabled,
    hasTelegramToken: Boolean(merged.telegramBotToken.trim()),
    telegramTokenMasked: maskSecret(merged.telegramBotToken),
    telegramChatId: merged.telegramChatId,
    whatsappEnabled: merged.whatsappEnabled,
    whatsappProvider: merged.whatsappProvider,
    whatsappApiUrl: merged.whatsappApiUrl,
    hasWhatsappToken: Boolean(merged.whatsappToken.trim()),
    whatsappTokenMasked: maskSecret(merged.whatsappToken),
    whatsappTarget: merged.whatsappTarget,
    notifyOnCritical: merged.notifyOnCritical,
    notifyOnOffline: merged.notifyOnOffline,
    notifyOnWarning: merged.notifyOnWarning,
    notifyOnRecovery: merged.notifyOnRecovery,
    notifyOnCyberThreat: merged.notifyOnCyberThreat,
    notifyOnAuthActivity: merged.notifyOnAuthActivity,
    updatedAt: merged.updatedAt,
  };
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  const ipType = net.isIP(lower);
  if (ipType === 4) {
    const parts = lower.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (ipType === 6 && (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd"))) {
    return true;
  }
  return false;
}

export function validateBotApiUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "URL API WhatsApp Bot tidak boleh kosong." };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "URL API WhatsApp Bot wajib menggunakan HTTPS." };
    }
    if (isPrivateOrLocalHostname(parsed.hostname)) {
      return { ok: false, error: "URL API WhatsApp Bot tidak boleh mengarah ke localhost atau IP privat/metadata." };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, error: "Format URL API WhatsApp Bot tidak valid." };
  }
}

export function getDefaultWhatsAppUrl(provider: WhatsAppBotProvider): string {
  switch (provider) {
    case "fonnte":
      return "https://api.fonnte.com/send";
    case "wablas":
      return "https://pati.wablas.com/api/send-message";
    case "meta_cloud":
      return "https://graph.facebook.com/v20.0/YOUR_PHONE_NUMBER_ID/messages";
    case "custom_webhook":
      return "";
  }
}

export async function sendTelegramBotMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; detail: string }> {
  const token = botToken.trim();
  const target = chatId.trim();
  if (!token || !target) {
    return { ok: false, detail: "Bot Token dan Chat ID Telegram wajib diisi." };
  }
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    return { ok: false, detail: "Format Telegram Bot Token tidak valid." };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: target,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        detail: data.description || `Telegram API HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      detail: `Terkirim (message_id: ${data.result?.message_id ?? "ok"})`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Gagal menghubungi Telegram Bot API",
    };
  }
}

export async function sendWhatsAppBotMessage(
  config: Pick<
    AlertingConfig,
    "whatsappProvider" | "whatsappApiUrl" | "whatsappToken" | "whatsappTarget"
  >,
  text: string
): Promise<{ ok: boolean; detail: string }> {
  const token = config.whatsappToken.trim();
  const target = config.whatsappTarget.trim();
  const apiUrlRaw =
    config.whatsappApiUrl.trim() || getDefaultWhatsAppUrl(config.whatsappProvider);

  if (!token || !target) {
    return { ok: false, detail: "Token dan Nomor/Target WhatsApp wajib diisi." };
  }
  const urlCheck = validateBotApiUrl(apiUrlRaw);
  if (!urlCheck.ok) {
    return { ok: false, detail: urlCheck.error };
  }

  try {
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let payload: Record<string, unknown>;

    if (config.whatsappProvider === "fonnte") {
      headers.Authorization = token;
      payload = { target, message: text };
    } else if (config.whatsappProvider === "wablas") {
      headers.Authorization = token;
      payload = { phone: target, message: text };
    } else if (config.whatsappProvider === "meta_cloud") {
      headers.Authorization = `Bearer ${token}`;
      payload = {
        messaging_product: "whatsapp",
        to: target.replace(/^\+/, ""),
        type: "text",
        text: { body: text },
      };
    } else {
      headers.Authorization = `Bearer ${token}`;
      payload = { target, message: text };
    }

    const res = await fetch(urlCheck.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const rawText = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      // Non-JSON webhook response
    }

    if (!res.ok || parsed.status === false) {
      const reason =
        (typeof parsed.reason === "string" && parsed.reason) ||
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.error === "object" &&
        parsed.error &&
        "message" in parsed.error
          ? String((parsed.error as { message?: unknown }).message)
          : "") ||
        `HTTP ${res.status}`;
      return { ok: false, detail: reason };
    }

    return {
      ok: true,
      detail: `Terkirim via ${config.whatsappProvider} (HTTP ${res.status})`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Gagal menghubungi WhatsApp Bot API",
    };
  }
}

export async function dispatchNocAlert(params: {
  severity: "critical" | "offline" | "warning" | "recovery" | "cyber" | "auth";
  title: string;
  message: string;
  triggeredBy: string;
}): Promise<AlertDeliveryLog[]> {
  const state = loadNocState();
  const cfg: AlertingConfig = {
    ...DEFAULT_ALERTING_CONFIG,
    ...state.alertingConfig,
  };

  const shouldSend =
    (params.severity === "critical" && cfg.notifyOnCritical) ||
    (params.severity === "offline" && cfg.notifyOnOffline) ||
    (params.severity === "warning" && cfg.notifyOnWarning) ||
    (params.severity === "recovery" && cfg.notifyOnRecovery) ||
    (params.severity === "cyber" && cfg.notifyOnCyberThreat) ||
    (params.severity === "auth" && cfg.notifyOnAuthActivity);

  if (!shouldSend) return [];

  const logs: AlertDeliveryLog[] = [];
  const nowIso = new Date().toISOString();

  if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
    const res = await sendTelegramBotMessage(
      cfg.telegramBotToken,
      cfg.telegramChatId,
      params.message
    );
    logs.push({
      id: `alt-tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      channel: "telegram",
      target: cfg.telegramChatId,
      status: res.ok ? "sent" : "failed",
      title: params.title,
      messagePreview: params.message.slice(0, 140),
      detail: res.detail,
      triggeredBy: params.triggeredBy,
    });
  }

  if (cfg.whatsappEnabled && cfg.whatsappToken && cfg.whatsappTarget) {
    const res = await sendWhatsAppBotMessage(cfg, params.message);
    logs.push({
      id: `alt-wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      channel: "whatsapp",
      target: cfg.whatsappTarget,
      status: res.ok ? "sent" : "failed",
      title: params.title,
      messagePreview: params.message.slice(0, 140),
      detail: res.detail,
      triggeredBy: params.triggeredBy,
    });
  }

  if (logs.length > 0) {
    state.alertLogs = [...logs, ...(state.alertLogs || [])].slice(0, 100);
    saveNocState(state);
  }
  return logs;
}

const cyberThrottleMap = new Map<string, number>();

export async function reportCyberThreat(params: {
  severity: CyberThreatEvent["severity"];
  category: CyberThreatEvent["category"];
  sourceIp: string;
  target: string;
  summary: string;
  mitigationAction: string;
  triggeredBy: string;
}): Promise<CyberThreatEvent | null> {
  const key = `${params.category}:${params.sourceIp}:${params.target}`;
  const now = Date.now();
  const lastSeen = cyberThrottleMap.get(key) || 0;
  if (now - lastSeen < 2 * 60 * 1000) {
    return null;
  }
  cyberThrottleMap.set(key, now);

  const event: CyberThreatEvent = {
    id: `sec-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date(now).toISOString(),
    severity: params.severity,
    category: params.category,
    sourceIp: params.sourceIp,
    target: params.target,
    summary: params.summary,
    mitigationAction: params.mitigationAction,
    status: "active",
  };

  const state = loadNocState();
  state.cyberThreats = [event, ...(state.cyberThreats || [])].slice(0, 100);
  saveNocState(state);

  const msg =
    `[NOCVISION CYBER DEFENSE - ${params.severity.toUpperCase()}]\n` +
    `Ancaman: ${params.category.toUpperCase()}\n` +
    `Sumber IP: ${params.sourceIp}\n` +
    `Target: ${params.target}\n` +
    `Detail: ${params.summary}\n` +
    `Mitigasi: ${params.mitigationAction}`;

  await dispatchNocAlert({
    severity: "cyber",
    title: `Cyber Threat: ${params.category}`,
    message: msg,
    triggeredBy: params.triggeredBy,
  });

  return event;
}

export function recordAuthAccessLog(params: {
  username: string;
  role?: string;
  sourceIp: string;
  userAgent: string;
  outcome: AuthAccessLog["outcome"];
  reason: string;
}): AuthAccessLog {
  const now = Date.now();
  const entry: AuthAccessLog = {
    id: `auth-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date(now).toISOString(),
    username: params.username || "(kosong)",
    role: params.role,
    sourceIp: params.sourceIp,
    userAgent: params.userAgent.slice(0, 120),
    outcome: params.outcome,
    reason: params.reason,
  };

  const state = loadNocState();
  state.authAccessLogs = [entry, ...(state.authAccessLogs || [])].slice(0, 200);
  saveNocState(state);

  const label =
    params.outcome === "success"
      ? "LOGIN BERHASIL"
      : params.outcome === "blocked_bruteforce"
      ? "SERANGAN PAKSA DIBLOKIR"
      : "PERCOBAAN LOGIN GAGAL";

  const msg =
    `[NOCVISION AUTH - ${label}]\n` +
    `Akun: ${entry.username}${entry.role ? ` (${entry.role})` : ""}\n` +
    `IP Sumber: ${entry.sourceIp}\n` +
    `Status: ${params.reason}\n` +
    `Waktu: ${new Date(now).toLocaleString("id-ID")}`;

  void dispatchNocAlert({
    severity: "auth",
    title: `${label}: ${entry.username}`,
    message: msg,
    triggeredBy: "Auth Access Logger",
  }).catch(() => {});

  return entry;
}
