"use client";

import React, { useEffect, useState } from "react";
import { BentoTheme } from "@/components/BentoOverviewDashboard";
import { NocUser } from "@/lib/auth";
import {
  AlertDeliveryLog,
  AlertingConfigPublic,
  AuthAccessLog,
  CyberThreatEvent,
  WhatsAppBotProvider,
} from "@/lib/types";
import {
  Bell,
  CheckCircle2,
  MessageCircle,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

interface AlertingCenterProps {
  theme: BentoTheme;
  currentUser: NocUser;
  onNotify: (msg: string) => void;
}

const WA_PROVIDER_DEFAULTS: Record<WhatsAppBotProvider, string> = {
  fonnte: "https://api.fonnte.com/send",
  wablas: "https://pati.wablas.com/api/send-message",
  meta_cloud: "https://graph.facebook.com/v20.0/YOUR_PHONE_NUMBER_ID/messages",
  custom_webhook: "",
};

export default function AlertingCenter({
  theme,
  currentUser,
  onNotify,
}: AlertingCenterProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const canEdit = currentUser.permissions.includes("manage_devices");

  const cardSurface = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px] text-slate-100";
  const headingText = isLightCard ? "text-slate-900" : "text-white";
  const mutedText = isLightCard ? "text-slate-500" : "text-slate-400";
  const subBoxCls = isLightCard
    ? "bg-slate-50 border-slate-200"
    : "bg-[#040e21]/90 border-sky-500/20";
  const inputCls = isLightCard
    ? "w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
    : "w-full px-3.5 py-2.5 rounded-xl bg-[#040d1d] border border-sky-500/25 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [testingWa, setTestingWa] = useState(false);

  const [config, setConfig] = useState<AlertingConfigPublic>({
    telegramEnabled: false,
    hasTelegramToken: false,
    telegramTokenMasked: "",
    telegramChatId: "",
    whatsappEnabled: false,
    whatsappProvider: "fonnte",
    whatsappApiUrl: WA_PROVIDER_DEFAULTS.fonnte,
    hasWhatsappToken: false,
    whatsappTokenMasked: "",
    whatsappTarget: "",
    notifyOnCritical: true,
    notifyOnOffline: true,
    notifyOnWarning: false,
    notifyOnRecovery: true,
    notifyOnCyberThreat: true,
    notifyOnAuthActivity: true,
  });

  const [telegramBotTokenInput, setTelegramBotTokenInput] = useState("");
  const [whatsappTokenInput, setWhatsappTokenInput] = useState("");
  const [logs, setLogs] = useState<AlertDeliveryLog[]>([]);
  const [cyberThreats, setCyberThreats] = useState<CyberThreatEvent[]>([]);
  const [authAccessLogs, setAuthAccessLogs] = useState<AuthAccessLog[]>([]);
  const [testingCyber, setTestingCyber] = useState(false);

  useEffect(() => {
    const loadAlerting = async () => {
      try {
        const res = await fetch("/api/alerting", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.config) {
          setConfig(data.config);
          setLogs(Array.isArray(data.logs) ? data.logs : []);
          setCyberThreats(Array.isArray(data.cyberThreats) ? data.cyberThreats : []);
          setAuthAccessLogs(Array.isArray(data.authAccessLogs) ? data.authAccessLogs : []);
        }
      } catch {
        onNotify("Gagal memuat konfigurasi Alerting.");
      } finally {
        setLoading(false);
      }
    };
    loadAlerting();
  }, [onNotify]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/alerting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_config",
          telegramEnabled: config.telegramEnabled,
          telegramBotToken: telegramBotTokenInput.trim() || undefined,
          telegramChatId: config.telegramChatId,
          telegramBotName: config.telegramBotName,
          whatsappEnabled: config.whatsappEnabled,
          whatsappProvider: config.whatsappProvider,
          whatsappApiUrl: config.whatsappApiUrl,
          whatsappToken: whatsappTokenInput.trim() || undefined,
          whatsappTarget: config.whatsappTarget,
          whatsappBotName: config.whatsappBotName,
          notifyOnCritical: config.notifyOnCritical,
          notifyOnOffline: config.notifyOnOffline,
          notifyOnWarning: config.notifyOnWarning,
          notifyOnRecovery: config.notifyOnRecovery,
          notifyOnCyberThreat: config.notifyOnCyberThreat,
          notifyOnAuthActivity: config.notifyOnAuthActivity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || "Gagal menyimpan konfigurasi Alerting.");
        return;
      }
      setConfig(data.config);
      setTelegramBotTokenInput("");
      setWhatsappTokenInput("");
      onNotify("Konfigurasi Alerting Telegram & WhatsApp berhasil disimpan.");
    } catch {
      onNotify("Terjadi kesalahan saat menyimpan konfigurasi Alerting.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestChannel = async (channel: "telegram" | "whatsapp") => {
    if (!canEdit) return;
    if (channel === "telegram") setTestingTg(true);
    else setTestingWa(true);

    try {
      const payload =
        channel === "telegram"
          ? {
              action: "test_telegram",
              telegramBotToken: telegramBotTokenInput.trim() || undefined,
              telegramChatId: config.telegramChatId,
            }
          : {
              action: "test_whatsapp",
              whatsappProvider: config.whatsappProvider,
              whatsappApiUrl: config.whatsappApiUrl,
              whatsappToken: whatsappTokenInput.trim() || undefined,
              whatsappTarget: config.whatsappTarget,
            };

      const res = await fetch("/api/alerting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLogs(data.logs);

      if (!res.ok || !data.ok) {
        onNotify(`Tes ${channel === "telegram" ? "Telegram" : "WhatsApp"} gagal: ${data.error || "Periksa token & target."}`);
        return;
      }
      onNotify(`Tes ${channel === "telegram" ? "Telegram" : "WhatsApp"} berhasil: ${data.detail}`);
    } catch {
      onNotify(`Gagal mengirim tes ${channel === "telegram" ? "Telegram" : "WhatsApp"}.`);
    } finally {
      if (channel === "telegram") setTestingTg(false);
      else setTestingWa(false);
    }
  };

  const handleDeleteChannel = async (channel: "telegram" | "whatsapp") => {
    if (!canEdit) return;
    try {
      const res = await fetch("/api/alerting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_config", channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || "Gagal menghapus konfigurasi Alerting.");
        return;
      }
      if (data.config) setConfig(data.config);
      setTelegramBotTokenInput("");
      setWhatsappTokenInput("");
      onNotify(
        "Konfigurasi " + (channel === "telegram" ? "Telegram" : "WhatsApp") + " dihapus."
      );
    } catch {
      onNotify("Gagal menghapus konfigurasi Alerting.");
    }
  };

  const handleEditChannel = (channel: "telegram" | "whatsapp") => {
    const id =
      channel === "telegram" ? "telegram-config-card" : "whatsapp-config-card";
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const input = el.querySelector("input") as HTMLInputElement | null;
    if (input) setTimeout(() => input.focus(), 400);
  };

  const handleClearLogs = async () => {
    if (!canEdit) return;
    try {
      const res = await fetch("/api/alerting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_logs" }),
      });
      if (res.ok) {
        setLogs([]);
        onNotify("Riwayat pengiriman alert dibersihkan.");
      }
    } catch {
      onNotify("Gagal membersihkan riwayat alert.");
    }
  };

  const handleTestCyberAlert = async () => {
    if (!canEdit) return;
    setTestingCyber(true);
    try {
      const res = await fetch("/api/alerting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_cyber_alert" }),
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLogs(data.logs);
      if (Array.isArray(data.cyberThreats)) setCyberThreats(data.cyberThreats);
      onNotify(
        res.ok
          ? "Simulasi ancaman cyber dicatat & dikirim ke saluran alerting aktif."
          : data.error || "Gagal menjalankan simulasi cyber alert."
      );
    } finally {
      setTestingCyber(false);
    }
  };

  const handleMitigateThreat = async (threatId: string) => {
    if (!canEdit) return;
    const res = await fetch("/api/alerting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mitigate_threat", threatId }),
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.cyberThreats)) {
      setCyberThreats(data.cyberThreats);
      onNotify("Status ancaman cyber ditandai telah dimitigasi.");
    }
  };

  if (loading) {
    return (
      <div className={`${cardSurface} p-10 text-center text-sm ${mutedText}`}>
        Memuat konfigurasi Alerting Telegram &amp; WhatsApp Bot API...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Header Banner */}
      <div className={`${cardSurface} p-6 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h3 className={`text-xl font-bold ${headingText} flex items-center gap-2.5`}>
            <Bell className="w-5 h-5 text-cyan-400" />
            NOC Alerting Gateway (Telegram &amp; WhatsApp Bot API)
          </h3>
          <p className={`text-xs ${mutedText} mt-1`}>
            Kirim notifikasi real-time insiden kritis, perangkat offline, dan pemulihan ke grup/chat Telegram maupun WhatsApp.
          </p>
        </div>

        <button
          type="submit"
          disabled={!canEdit || saving}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-extrabold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
        </button>
      </div>

      {/* Ringkasan Konfigurasi Tersimpan */}
      <div className={`${cardSurface} p-5`}>
        <h4 className={`text-sm font-bold ${headingText} mb-3`}>
          Konfigurasi Alert Tersimpan
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className={`rounded-xl border p-3 space-y-1 ${subBoxCls}`}>
            <div className={`font-bold ${headingText}`}>Telegram</div>
            <div>Status: {config.telegramEnabled ? "Aktif" : "Nonaktif"}</div>
            <div>Nama Bot: {config.telegramBotName || "-"}</div>
            <div>Chat ID: {config.telegramChatId || "-"}</div>
            <div>Token: {config.hasTelegramToken ? config.telegramTokenMasked : "-"}</div>
            <div className="pt-1 flex gap-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleEditChannel("telegram")}
                className="px-2.5 py-1 rounded-lg border border-sky-400/40 text-sky-400 text-[11px] font-bold cursor-pointer disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleDeleteChannel("telegram")}
                className="px-2.5 py-1 rounded-lg border border-rose-400/40 text-rose-400 text-[11px] font-bold cursor-pointer disabled:opacity-50"
              >
                Hapus
              </button>
            </div>
          </div>
          <div className={`rounded-xl border p-3 space-y-1 ${subBoxCls}`}>
            <div className={`font-bold ${headingText}`}>WhatsApp</div>
            <div>Status: {config.whatsappEnabled ? "Aktif" : "Nonaktif"}</div>
            <div>Provider: {config.whatsappProvider}</div>
            <div>Nama Bot: {config.whatsappBotName || "-"}</div>
            <div>Target: {config.whatsappTarget || "-"}</div>
            <div>Token: {config.hasWhatsappToken ? config.whatsappTokenMasked : "-"}</div>
            <div className="pt-1 flex gap-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleEditChannel("whatsapp")}
                className="px-2.5 py-1 rounded-lg border border-sky-400/40 text-sky-400 text-[11px] font-bold cursor-pointer disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleDeleteChannel("whatsapp")}
                className="px-2.5 py-1 rounded-lg border border-rose-400/40 text-rose-400 text-[11px] font-bold cursor-pointer disabled:opacity-50"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bot Channels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Telegram Bot API */}
        <div className={`${cardSurface} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h4 className={`text-sm font-bold ${headingText}`}>Telegram Bot API</h4>
                <p className={`text-[11px] ${mutedText}`}>api.telegram.org/bot&lt;token&gt;/sendMessage</p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={config.telegramEnabled}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, telegramEnabled: e.target.checked }))
                }
                className="w-4 h-4 accent-cyan-500"
              />
              <span className={config.telegramEnabled ? "text-emerald-400" : mutedText}>
                {config.telegramEnabled ? "Aktif" : "Nonaktif"}
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={`text-[11px] font-semibold ${mutedText}`}>
                  Bot Token (@BotFather)
                </label>
                {config.hasTelegramToken && (
                  <span className="text-[10px] font-mono text-emerald-400 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Tersimpan ({config.telegramTokenMasked})
                  </span>
                )}
              </div>
              <input
                type="password"
                disabled={!canEdit}
                value={telegramBotTokenInput}
                onChange={(e) => setTelegramBotTokenInput(e.target.value)}
                placeholder={
                  config.hasTelegramToken
                    ? "Kosongkan jika tidak ingin mengubah token"
                    : "123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxx"
                }
                className={inputCls}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${mutedText}`}>
                Nama Bot / Label
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={config.telegramBotName || ""}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, telegramBotName: e.target.value }))
                }
                placeholder="mis. NOC-Monitor-Telegram"
                className={inputCls}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${mutedText}`}>
                Chat ID / Group / Channel ID
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={config.telegramChatId}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, telegramChatId: e.target.value }))
                }
                placeholder="-1001234567890 atau @channel_noc"
                className={inputCls}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className={`text-[11px] ${mutedText}`}>
              Pastikan bot sudah di-invite sebagai admin di grup target.
            </span>
            <button
              type="button"
              disabled={!canEdit || testingTg}
              onClick={() => handleTestChannel("telegram")}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isLightCard
                  ? "bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700"
                  : "bg-sky-500/15 hover:bg-sky-500/25 border-sky-400/30 text-sky-300"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {testingTg ? "Mengirim..." : "Kirim Tes Telegram"}
            </button>
          </div>
        </div>

        {/* WhatsApp Bot API */}
        <div className={`${cardSurface} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className={`text-sm font-bold ${headingText}`}>WhatsApp Bot API</h4>
                <p className={`text-[11px] ${mutedText}`}>Fonnte, Wablas, Meta Cloud API, atau Custom HTTPS</p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={config.whatsappEnabled}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, whatsappEnabled: e.target.checked }))
                }
                className="w-4 h-4 accent-emerald-500"
              />
              <span className={config.whatsappEnabled ? "text-emerald-400" : mutedText}>
                {config.whatsappEnabled ? "Aktif" : "Nonaktif"}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${mutedText}`}>
                Provider Bot API
              </label>
              <select
                disabled={!canEdit}
                value={config.whatsappProvider}
                onChange={(e) => {
                  const provider = e.target.value as WhatsAppBotProvider;
                  setConfig((prev) => ({
                    ...prev,
                    whatsappProvider: provider,
                    whatsappApiUrl: WA_PROVIDER_DEFAULTS[provider],
                  }));
                }}
                className={inputCls}
              >
                <option value="fonnte">Fonnte (api.fonnte.com)</option>
                <option value="wablas">Wablas</option>
                <option value="meta_cloud">Meta WhatsApp Cloud API</option>
                <option value="custom_webhook">Custom Bot API (HTTPS)</option>
              </select>
            </div>

            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${mutedText}`}>
                Nama Bot / Label
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={config.whatsappBotName || ""}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, whatsappBotName: e.target.value }))
                }
                placeholder="mis. NOC-Monitor-WA"
                className={inputCls}
              />
            </div>
            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${mutedText}`}>
                Target Nomor WA / Group ID
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={config.whatsappTarget}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, whatsappTarget: e.target.value }))
                }
                placeholder="6281234567890 atau 120363...@g.us"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${mutedText}`}>
              Endpoint URL Bot API (HTTPS)
            </label>
            <input
              type="url"
              disabled={!canEdit}
              value={config.whatsappApiUrl}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, whatsappApiUrl: e.target.value }))
              }
              placeholder="https://api.fonnte.com/send"
              className={inputCls}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`text-[11px] font-semibold ${mutedText}`}>
                API Token / Bearer Key
              </label>
              {config.hasWhatsappToken && (
                <span className="text-[10px] font-mono text-emerald-400 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Tersimpan ({config.whatsappTokenMasked})
                </span>
              )}
            </div>
            <input
              type="password"
              disabled={!canEdit}
              value={whatsappTokenInput}
              onChange={(e) => setWhatsappTokenInput(e.target.value)}
              placeholder={
                config.hasWhatsappToken
                  ? "Kosongkan jika tidak ingin mengubah token"
                  : "Masukkan token WhatsApp Bot API"
              }
              className={inputCls}
            />
          </div>

          <div className="pt-1 flex items-center justify-end">
            <button
              type="button"
              disabled={!canEdit || testingWa}
              onClick={() => handleTestChannel("whatsapp")}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isLightCard
                  ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700"
                  : "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-400/30 text-emerald-300"
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {testingWa ? "Mengirim..." : "Kirim Tes WhatsApp"}
            </button>
          </div>
        </div>
      </div>

      {/* Trigger Rules */}
      <div className={`${cardSurface} p-6`}>
        <h4 className={`text-sm font-bold ${headingText} mb-3`}>
          Aturan Pemicu Notifikasi Otomatis
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            {
              key: "notifyOnCritical" as const,
              label: "Critical Alarm",
              desc: "BGP Down, PON LOS massal, CPU > 90%",
            },
            {
              key: "notifyOnOffline" as const,
              label: "Device Offline",
              desc: "Router / Switch / OLT unreachable",
            },
            {
              key: "notifyOnWarning" as const,
              label: "Warning & Optical",
              desc: "Redaman tinggi atau packet loss",
            },
            {
              key: "notifyOnRecovery" as const,
              label: "Recovery / Resolved",
              desc: "Saat insiden selesai ditangani",
            },
            {
              key: "notifyOnCyberThreat" as const,
              label: "Ancaman Cyber",
              desc: "Brute-force, DDoS spike, BGP flap",
            },
            {
              key: "notifyOnAuthActivity" as const,
              label: "Log Login & IP",
              desc: "Semua login masuk & percobaan paksa",
            },
          ].map((rule) => (
            <label
              key={rule.key}
              className={`p-3.5 rounded-2xl border flex items-start gap-2.5 cursor-pointer ${subBoxCls}`}
            >
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={config[rule.key]}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, [rule.key]: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 accent-cyan-500"
              />
              <div>
                <div className={`text-xs font-bold ${headingText}`}>{rule.label}</div>
                <div className={`text-[11px] ${mutedText}`}>{rule.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Cyber Threat & Defensive Security Monitor */}
      <div className={`${cardSurface} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Cyber Threat &amp; Defensive Security Monitor ({cyberThreats.filter((t) => t.status === "active").length} Aktif)
            </h4>
            <p className={`text-[11px] ${mutedText}`}>
              Deteksi otomatis brute-force login, lonjakan DDoS trafik jaringan, dan anomali BGP flap dengan rekomendasi mitigasi cepat.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              disabled={testingCyber}
              onClick={handleTestCyberAlert}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isLightCard
                  ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
                  : "bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/30 text-rose-300"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {testingCyber ? "Menguji..." : "Tes Alert Cyber"}
            </button>
          )}
        </div>

        {cyberThreats.length === 0 ? (
          <div className={`p-6 rounded-2xl border text-center text-xs ${subBoxCls} ${mutedText}`}>
            Tidak ada ancaman serangan siber yang terdeteksi. Sistem pertahanan aktif memantau autentikasi &amp; telemetri.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {cyberThreats.map((threat) => (
              <div
                key={threat.id}
                className={`p-3.5 rounded-2xl border flex flex-wrap items-start justify-between gap-3 text-xs ${subBoxCls}`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                        threat.severity === "critical"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {threat.severity} · {threat.category}
                    </span>
                    <span className={`font-mono text-[11px] ${headingText}`}>
                      IP: {threat.sourceIp} &rarr; {threat.target}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        threat.status === "mitigated"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}
                    >
                      {threat.status === "mitigated" ? "TERMITIGASI" : "AKTIF"}
                    </span>
                  </div>
                  <p className={mutedText}>{threat.summary}</p>
                  <p className="text-[11px] font-mono text-cyan-400">
                    Mitigasi: {threat.mitigationAction}
                  </p>
                </div>

                {canEdit && threat.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleMitigateThreat(threat.id)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    Tandai Mitigasi
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auth Access & Intrusion Attempt Log */}
      <div className={`${cardSurface} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Log Akses Masuk &amp; Percobaan Login Paksa ({authAccessLogs.length})
            </h4>
            <p className={`text-[11px] ${mutedText}`}>
              Mencatat semua akun terdaftar yang berhasil masuk maupun IP yang gagal / memaksa masuk ke NOCVISION.
            </p>
          </div>
          {canEdit && authAccessLogs.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/alerting", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "clear_auth_logs" }),
                });
                if (res.ok) {
                  setAuthAccessLogs([]);
                  onNotify("Log akses login dibersihkan.");
                }
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subBoxCls} ${mutedText}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Bersihkan Log Akses
            </button>
          )}
        </div>

        {authAccessLogs.length === 0 ? (
          <div className={`p-6 rounded-2xl border text-center text-xs ${subBoxCls} ${mutedText}`}>
            Belum ada catatan percobaan login yang terekam.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {authAccessLogs.map((entry) => (
              <div
                key={entry.id}
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${subBoxCls}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase shrink-0 ${
                      entry.outcome === "success"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : entry.outcome === "blocked_bruteforce"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {entry.outcome === "success"
                      ? "MASUK"
                      : entry.outcome === "blocked_bruteforce"
                      ? "PAKSA / BLOKIR"
                      : "GAGAL"}
                  </span>
                  <div className="min-w-0">
                    <div className={`font-bold truncate ${headingText}`}>
                      Akun: {entry.username}{entry.role ? ` (${entry.role})` : ""} · IP: {entry.sourceIp}
                    </div>
                    <div className={`text-[11px] truncate ${mutedText}`}>
                      {entry.reason} · {entry.userAgent}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-mono ${mutedText}`}>
                  {new Date(entry.timestamp).toLocaleString("id-ID")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery Logs */}
      <div className={`${cardSurface} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className={`text-sm font-bold ${headingText}`}>
              Riwayat Pengiriman Alert ({logs.length})
            </h4>
            <p className={`text-[11px] ${mutedText}`}>
              Catatan status pengiriman pesan ke Telegram &amp; WhatsApp Bot API.
            </p>
          </div>
          {canEdit && logs.length > 0 && (
            <button
              type="button"
              onClick={handleClearLogs}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${subBoxCls} ${mutedText}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Bersihkan Log
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className={`p-6 rounded-2xl border text-center text-xs ${subBoxCls} ${mutedText}`}>
            Belum ada riwayat pengiriman alert. Gunakan tombol &ldquo;Kirim Tes&rdquo; di atas untuk menguji koneksi bot.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${subBoxCls}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {log.status === "sent" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className={`font-bold truncate ${headingText}`}>
                      [{log.channel.toUpperCase()}] {log.title} &rarr; {log.target}
                    </div>
                    <div className={`text-[11px] truncate ${mutedText}`}>
                      {log.detail} · Oleh {log.triggeredBy}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-mono ${mutedText}`}>
                  {new Date(log.timestamp).toLocaleString("id-ID")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
