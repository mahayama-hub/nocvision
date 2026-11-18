"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  Bot,
  Cable,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  FileText,
  GitFork,
  Globe,
  HeartPulse,
  History,
  MessageSquarePlus,
  Network,
  Router,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import { BentoTheme } from "@/components/BentoOverviewDashboard";
import {
  BgpPeer,
  ConfigSnapshot,
  IncidentAlert,
  NetworkDevice,
  OnuDevice,
  RouteFilterRule,
} from "@/lib/types";

interface SuperAIChatViewProps {
  theme?: BentoTheme;
  devices: NetworkDevice[];
  bgpPeers: BgpPeer[];
  onus: OnuDevice[];
  incidents: IncidentAlert[];
  snapshots: ConfigSnapshot[];
  routeFilters: RouteFilterRule[];
  selectedDeviceId: string | null;
  onSelectDevice?: (deviceId: string) => void;
  onNavigateTab?: (tab: "troubleshoot" | "backup" | "bgp") => void;
}

function renderInlineMarkdown(text: string, isLightCard: boolean): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={idx}
          className={`font-semibold ${isLightCard ? "text-slate-900" : "text-white"}`}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] ${
            isLightCard
              ? "bg-slate-200/80 text-sky-700"
              : "bg-cyan-500/15 text-cyan-300"
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderFormattedAiContent(
  text: string,
  isLightCard: boolean,
  isUser: boolean
): React.ReactNode {
  if (isUser) {
    return <p className="text-[13px] leading-relaxed whitespace-pre-line">{text}</p>;
  }

  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        const bulletMatch = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-0.5">
              <span
                className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${
                  isLightCard ? "bg-sky-500" : "bg-cyan-400"
                }`}
              />
              <p className="flex-1">{renderInlineMarkdown(bulletMatch[1], isLightCard)}</p>
            </div>
          );
        }

        return <p key={idx}>{renderInlineMarkdown(line, isLightCard)}</p>;
      })}
    </div>
  );
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  title?: string;
  content: string;
  cliSnippet?: string;
  metrics?: { label: string; value: string; tone?: "ok" | "warn" | "bad" | "info" }[];
  actionCta?: {
    label: string;
    tab: "troubleshoot" | "backup" | "bgp";
  };
  reportMarkdown?: string;
  providerTag?: string;
  fallbackNotice?: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  deviceId: string;
  deviceName: string;
  updatedAt: string;
  messages: ChatMessage[];
}

function getVendorCliFlavor(device?: NetworkDevice | null): {
  label: string;
  showBgp: string;
  showInt: string;
  showRoute: string;
  showHealth: string;
} {
  if (!device) {
    return {
      label: "Multi-Vendor Fleet Orchestrator",
      showBgp: "show bgp summary | show ip bgp summary",
      showInt: "show interfaces extensive | /interface print stats",
      showRoute: "show route summary | show ip route summary",
      showHealth: "show chassis environment | /system resource print",
    };
  }
  switch (device.vendor) {
    case "Juniper":
      return {
        label: "JunOS Diagnostic Orchestrator",
        showBgp: "show bgp summary\nshow bgp neighbor extensive",
        showInt: "show interfaces diagnostics optics\nshow interfaces extensive | match \"Error|Physical\"",
        showRoute: "show route summary\nshow policy options prefix-list",
        showHealth: "show chassis routing-engine\nshow chassis environment\nshow system alarms",
      };
    case "MikroTik":
      return {
        label: "RouterOS v7 Diagnostic Orchestrator",
        showBgp: "/routing/bgp/session/print detail\n/routing/bgp/connection/print",
        showInt: "/interface/print stats-detail\n/interface/ethernet/monitor [find] once",
        showRoute: "/ip/route/print count-only\n/routing/filter/rule/print",
        showHealth: "/system/resource/print\n/system/health/print\n/log/print where topics~\"error|critical\"",
      };
    case "Cisco":
      return {
        label: "Cisco IOS-XR / IOS-XE Orchestrator",
        showBgp: "show bgp ipv4 unicast summary\nshow bgp neighbors",
        showInt: "show interfaces counters errors\nshow controllers optics 0/0/0/*",
        showRoute: "show route summary\nshow rpl route-policy",
        showHealth: "show processes cpu sorted\nshow environment temperatures\nshow redundancy",
      };
    case "Huawei":
      return {
        label: "Huawei VRP / OLT Diagnostic Orchestrator",
        showBgp: "display bgp peer\ndisplay bgp routing-table statistics",
        showInt: "display interface brief\ndisplay ont optical-info all",
        showRoute: "display ip routing-table statistics\ndisplay ip ip-prefix",
        showHealth: "display cpu-usage\ndisplay memory-usage\ndisplay temperature all",
      };
    default:
      return {
        label: `${device.vendor.toUpperCase()} Diagnostic Orchestrator`,
        showBgp: "show bgp summary",
        showInt: "show interface status\nshow interface optical-transceiver",
        showRoute: "show ip route summary",
        showHealth: "show system health\nshow system alarms",
      };
  }
}

export default function SuperAIChatView({
  theme = "dark",
  devices,
  bgpPeers,
  onus,
  incidents,
  snapshots,
  routeFilters,
  selectedDeviceId,
  onSelectDevice,
  onNavigateTab,
}: SuperAIChatViewProps) {
  const isLightCard = theme === "light" || theme === "twilight";

  const defaultDeviceId =
    selectedDeviceId && devices.some((d) => d.id === selectedDeviceId)
      ? selectedDeviceId
      : devices[0]?.id || "all";

  const [contextDeviceId, setContextDeviceId] = useState<string>(defaultDeviceId);
  const [isContextOpen, setIsContextOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>("");
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPromptSuggestions, setShowPromptSuggestions] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeDevice = useMemo(
    () => (contextDeviceId === "all" ? null : devices.find((d) => d.id === contextDeviceId) || devices[0] || null),
    [contextDeviceId, devices]
  );

  const flavor = useMemo(() => getVendorCliFlavor(activeDevice), [activeDevice]);

  // Seed 2 initial diagnostic history items so the "Riwayat 2" badge feels immediately authentic
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const firstDev = devices[0];
    const secondDev = devices.find((d) => d.status !== "online") || devices[1] || firstDev;
    return [
      {
        id: "hist-1",
        title: `Health Audit · ${firstDev?.hostname || "Core Router"}`,
        deviceId: firstDev?.id || "all",
        deviceName: firstDev?.hostname || "Global Fleet",
        updatedAt: "10 menit lalu",
        messages: [
          {
            id: "seed-u-1",
            role: "user",
            content: `Run Health Check pada ${firstDev?.hostname || "Core Router"}`,
            timestamp: "19:20",
          },
          {
            id: "seed-a-1",
            role: "assistant",
            title: "Health Check Summary",
            content: `Perangkat ${firstDev?.hostname || "Core Router"} (${firstDev?.ipAddress || "-"}) dalam kondisi ${firstDev?.status?.toUpperCase() || "ONLINE"} dengan CPU ${firstDev?.cpuUsage ?? 0}% dan suhu ${firstDev?.temperatureC ?? 0}°C. ${firstDev?.interfaces.filter((i) => i.status === "down" || i.status === "admin_down").length || 0} port terdeteksi standby/down pada 0 Mbps.`,
            cliSnippet: getVendorCliFlavor(firstDev).showHealth,
            timestamp: "19:20",
          },
        ],
      },
      {
        id: "hist-2",
        title: `OLT Optical & BGP Audit · ${secondDev?.hostname || "Fleet"}`,
        deviceId: secondDev?.id || "all",
        deviceName: secondDev?.hostname || "Global Fleet",
        updatedAt: "28 menit lalu",
        messages: [
          {
            id: "seed-u-2",
            role: "user",
            content: "Find BGP Problems & cek redaman ONU kritis",
            timestamp: "19:02",
          },
          {
            id: "seed-a-2",
            role: "assistant",
            title: "BGP & Optical Triage",
            content: `Terdeteksi ${bgpPeers.length} BGP session aktif dan ${onus.filter((o) => o.rxPowerDbm < -27 || o.status !== "online").length} ONU perlu pengecekan redaman/LOS.`,
            cliSnippet: getVendorCliFlavor(secondDev).showBgp,
            timestamp: "19:02",
          },
        ],
      },
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const activeMessages = activeSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, isThinking]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsContextOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  // Build intelligent response grounded in REAL noc-state telemetry
  const buildDiagnosticResponse = (actionKey: string, userPrompt: string): Omit<ChatMessage, "id" | "role" | "timestamp"> => {
    const targetDevices = activeDevice ? [activeDevice] : devices;
    const scopeName = activeDevice ? `${activeDevice.hostname} (${activeDevice.ipAddress})` : `Seluruh Infrastruktur (${devices.length} Perangkat)`;
    const devBgp = activeDevice ? bgpPeers.filter((p) => p.deviceId === activeDevice.id) : bgpPeers;
    const devIncidents = activeDevice
      ? incidents.filter((inc) => inc.deviceId === activeDevice.id && !inc.resolved)
      : incidents.filter((inc) => !inc.resolved);
    const devFilters = activeDevice ? routeFilters.filter((f) => f.deviceId === activeDevice.id) : routeFilters;
    const devSnapshots = activeDevice ? snapshots.filter((s) => s.deviceId === activeDevice.id) : snapshots;

    const allPorts = targetDevices.flatMap((d) =>
      d.interfaces.map((iface) => ({ ...iface, hostname: d.hostname }))
    );
    const activePorts = allPorts.filter((i) => i.status === "up" || i.status === "degraded");
    const inactivePorts = allPorts.filter((i) => i.status === "down" || i.status === "admin_down");
    const errorPorts = allPorts.filter((i) => i.crcErrors + i.drops > 0 || i.status === "degraded" || i.status === "down");
    const totalRx = activePorts.reduce((s, i) => s + i.rxMbps, 0);
    const totalTx = activePorts.reduce((s, i) => s + i.txMbps, 0);

    const lowOpticalOnus = onus.filter((o) =>
      (!activeDevice || o.oltId === activeDevice.id) && (o.rxPowerDbm < -26.5 || o.status !== "online")
    );

    const lower = userPrompt.toLowerCase();
    const resolvedAction =
      actionKey !== "chat"
        ? actionKey
        : lower.includes("bgp") || lower.includes("peer") || lower.includes("as")
        ? "bgp"
        : lower.includes("error") || lower.includes("interface") || lower.includes("port") || lower.includes("down") || lower.includes("bandwidth")
        ? "interface_errors"
        : lower.includes("health") || lower.includes("suhu") || lower.includes("cpu") || lower.includes("cek")
        ? "health"
        : lower.includes("rout") || lower.includes("filter") || lower.includes("bogon") || lower.includes("prefix")
        ? "routing"
        : lower.includes("report") || lower.includes("laporan") || lower.includes("export")
        ? "report"
        : lower.includes("olt") || lower.includes("pon") || lower.includes("onu") || lower.includes("redaman")
        ? "optical"
        : "analyze_device";

    if (resolvedAction === "analyze_device") {
      if (activeDevice) {
        const highUtilPorts = activePorts.filter((p) => (p.rxMbps + p.txMbps) / Math.max(1, p.speedMbps) > 0.7);
        return {
          title: `Deep Device Analysis · ${activeDevice.hostname}`,
          content:
            `Analisis telemetri real-time untuk **${activeDevice.hostname}** (${activeDevice.vendor.toUpperCase()} · ${activeDevice.osVersion}):\n` +
            `• **Status Operasional**: ${activeDevice.status.toUpperCase()} | Latency ${activeDevice.latencyMs}ms | Uptime ${activeDevice.uptime}\n` +
            `• **Resource Compute**: CPU ${activeDevice.cpuUsage}% | Memory ${activeDevice.memoryUsage}% | Suhu ${activeDevice.temperatureC}°C\n` +
            `• **Traffic & Interface**: Total throughput ↓${(totalRx / 1000).toFixed(2)} Gbps / ↑${(totalTx / 1000).toFixed(2)} Gbps pada ${activePorts.length} port aktif (${inactivePorts.length} port standby/down pada 0 Mbps).\n` +
            `• **Temuan Prioritas**: ${
              devIncidents.length > 0
                ? `Terdapat ${devIncidents.length} insiden aktif (${devIncidents[0].title}).`
                : highUtilPorts.length > 0
                ? `${highUtilPorts.length} interface mendekati saturasi (>70%).`
                : `Tidak ada bottleneck kritikal terdeteksi; ${devSnapshots.length} config snapshot tersedia di Backup Vault.`
            }`,
          metrics: [
            { label: "CPU Load", value: `${activeDevice.cpuUsage}%`, tone: activeDevice.cpuUsage > 75 ? "warn" : "ok" },
            { label: "Memory", value: `${activeDevice.memoryUsage}%`, tone: activeDevice.memoryUsage > 80 ? "warn" : "ok" },
            { label: "Port Aktif / Down", value: `${activePorts.length} / ${inactivePorts.length}`, tone: inactivePorts.length > 0 ? "info" : "ok" },
            { label: "Throughput", value: `${((totalRx + totalTx) / 1000).toFixed(2)} Gbps`, tone: "info" },
          ],
          cliSnippet: flavor.showHealth,
          actionCta: { label: "Buka Troubleshoot Terminal", tab: "troubleshoot" },
        };
      }

      const degradedDevices = devices.filter((d) => d.status !== "online");
      return {
        title: "Fleet-Wide Topology & Device Analysis",
        content:
          `Analisis menyeluruh terhadap **${devices.length} perangkat NOCVISION**:\n` +
          `• **Ketersediaan Fleet**: ${devices.length - degradedDevices.length}/${devices.length} online penuh (${degradedDevices.length} degraded/offline).\n` +
          `• **Inventori Port**: ${activePorts.length} interface aktif dan ${inactivePorts.length} interface non-aktif (down / admin-down) terpantau di grafik bandwidth.\n` +
          `• **Insiden Terbuka**: ${devIncidents.length} insiden perlu atensi, ${lowOpticalOnus.length} ONU memiliki anomali optik.`,
        metrics: [
          { label: "Online Devices", value: `${devices.length - degradedDevices.length}/${devices.length}`, tone: degradedDevices.length > 0 ? "warn" : "ok" },
          { label: "Active / Inactive Ports", value: `${activePorts.length} / ${inactivePorts.length}`, tone: "info" },
          { label: "Open Incidents", value: `${devIncidents.length}`, tone: devIncidents.length > 0 ? "bad" : "ok" },
          { label: "Snapshots Vault", value: `${snapshots.length}`, tone: "ok" },
        ],
        cliSnippet: flavor.showHealth,
        actionCta: { label: "Buka Troubleshoot Terminal", tab: "troubleshoot" },
      };
    }

    if (resolvedAction === "bgp") {
      const nonEstablished = devBgp.filter((p) => p.state !== "Established");
      const highRtt = devBgp.filter((p) => p.latencyMs > 20);
      const totalRxPrefixes = devBgp.reduce((s, p) => s + p.prefixesReceived, 0);
      return {
        title: `BGP Peering & Route Leak Diagnostic · ${scopeName}`,
        content:
          devBgp.length === 0
            ? `Perangkat **${scopeName}** tidak memiliki sesi BGP peering aktif (berperan sebagai Switch/OLT/Access Layer). Periksa uplink router core untuk status peering ASN 138800.`
            : `Audit **${devBgp.length} BGP session** pada ${scopeName}:\n` +
              `• **State Check**: ${devBgp.length - nonEstablished.length}/${devBgp.length} session **Established** (${nonEstablished.length} bermasalah).\n` +
              `• **Prefix Table**: Total ${totalRxPrefixes.toLocaleString()} prefix diterima dengan ${devFilters.length} aturan Route Filter terpasang.\n` +
              `• **Rekomendasi AI**: ${
                highRtt.length > 0
                  ? `${highRtt.map((h) => `${h.peerName} (${h.latencyMs}ms)`).join(", ")} menunjukkan elevasi RTT — verifikasi jalur upstream & RPKI validation.`
                  : "Semua peering stabil. Pertahankan max-prefix limit & anti-bogon filter di Config Wizard."
              }`,
        metrics: [
          { label: "BGP Peers", value: `${devBgp.length} sesi`, tone: "info" },
          { label: "Non-Established", value: `${nonEstablished.length}`, tone: nonEstablished.length > 0 ? "bad" : "ok" },
          { label: "Total Prefixes", value: totalRxPrefixes.toLocaleString(), tone: "info" },
          { label: "Route Filters", value: `${devFilters.length} rules`, tone: devFilters.length > 0 ? "ok" : "warn" },
        ],
        cliSnippet: flavor.showBgp,
        actionCta: { label: "Kelola di BGP Peers", tab: "bgp" },
      };
    }

    if (resolvedAction === "interface_errors") {
      const topList = (errorPorts.length > 0 ? errorPorts : allPorts).slice(0, 4);
      return {
        title: `Interface & Optical Error Scan · ${scopeName}`,
        content:
          `Hasil pemindaian **${allPorts.length} interface** pada ${scopeName}:\n` +
          `• **Port Aktif**: ${activePorts.length} port (up/degraded) mengalirkan trafik aktif.\n` +
          `• **Port Tidak Aktif / Standby**: ${inactivePorts.length} port (down / admin_down) tercatat pada baseline **0 Mbps**.\n` +
          `• **Anomali & CRC Errors**: ${errorPorts.length} port perlu inspeksi:\n` +
          topList
            .map(
              (p) =>
                `  - \`${p.hostname}:${p.name}\` [${p.status.toUpperCase()}] · CRC/Drops: ${p.crcErrors + p.drops} · Rx/Tx: ${p.rxMbps}/${p.txMbps} Mbps`
            )
            .join("\n"),
        metrics: [
          { label: "Total Ports", value: `${allPorts.length}`, tone: "info" },
          { label: "Up / Degraded", value: `${activePorts.length}`, tone: "ok" },
          { label: "Down / Standby", value: `${inactivePorts.length}`, tone: inactivePorts.length > 0 ? "warn" : "ok" },
          { label: "Ports w/ Errors", value: `${allPorts.filter((i) => i.crcErrors + i.drops > 0).length}`, tone: allPorts.some((i) => i.crcErrors + i.drops > 0) ? "bad" : "ok" },
        ],
        cliSnippet: flavor.showInt,
        actionCta: { label: "Uji di Troubleshoot Terminal", tab: "troubleshoot" },
      };
    }

    if (resolvedAction === "health") {
      const cpuOk = targetDevices.every((d) => d.cpuUsage < 75);
      const tempOk = targetDevices.every((d) => d.temperatureC < 60);
      const backupOk = devSnapshots.length > 0;
      const incOk = devIncidents.length === 0;
      const score = [cpuOk, tempOk, backupOk, incOk].filter(Boolean).length * 25;
      return {
        title: `NOC Health Check Scorecard · ${scopeName}`,
        content:
          `Skor Kesehatan Infrastruktur: **${score}/100**\n` +
          `1. **Compute & Thermal**: ${cpuOk ? "✅ PASS" : "⚠️ WARN"} CPU dalam batas normal, ${tempOk ? "✅ PASS" : "⚠️ WARN"} Thermal chassis aman (<60°C).\n` +
          `2. **Alert & Incident State**: ${incOk ? "✅ PASS (0 open incident)" : `⚠️ WARN (${devIncidents.length} open incident)`}.\n` +
          `3. **Configuration Safety**: ${backupOk ? `✅ PASS (${devSnapshots.length} backup snapshot siap rollback)` : "⚠️ WARN (Belum ada snapshot)"}.\n` +
          `4. **FTTH Optical Compliance**: ${lowOpticalOnus.length === 0 ? "✅ PASS" : `⚠️ ${lowOpticalOnus.length} ONU di bawah -26.5 dBm / LOS`}.`,
        metrics: [
          { label: "Health Score", value: `${score}%`, tone: score >= 75 ? "ok" : "warn" },
          { label: "Open Incidents", value: `${devIncidents.length}`, tone: incOk ? "ok" : "bad" },
          { label: "Backup Snapshots", value: `${devSnapshots.length}`, tone: backupOk ? "ok" : "warn" },
          { label: "Optical Alerts", value: `${lowOpticalOnus.length}`, tone: lowOpticalOnus.length === 0 ? "ok" : "warn" },
        ],
        cliSnippet: flavor.showHealth,
        actionCta: { label: "Buka Cloud Backup Vault", tab: "backup" },
      };
    }

    if (resolvedAction === "routing") {
      return {
        title: `Routing Table & Prefix Filter Audit · ${scopeName}`,
        content:
          `Evaluasi arsitektur routing pada ${scopeName}:\n` +
          `• **Active Route Filters**: ${devFilters.length} policy rule (${devFilters.map((f) => `${f.listName} [${f.prefix} upto /${f.uptoLen} -> ${f.action}]`).join("; ") || "Belum ada custom prefix-list"}).\n` +
          `• **Saran AI**: Gunakan **Visual Config Wizard** dengan validasi **Commit Check** + **Show | Compare** + **Commit Confirmed (5m rollback)** sebelum mengubah BGP policy atau static route di jam sibuk.`,
        metrics: [
          { label: "Policy Rules", value: `${devFilters.length}`, tone: devFilters.length > 0 ? "ok" : "warn" },
          { label: "BGP Sessions", value: `${devBgp.length}`, tone: "info" },
          { label: "Safety Guard", value: "Commit Confirmed", tone: "ok" },
        ],
        cliSnippet: flavor.showRoute,
        actionCta: { label: "Buka BGP Peers", tab: "bgp" },
      };
    }

    if (resolvedAction === "optical") {
      return {
        title: `FTTH OLT & ONU Optical Analysis · ${scopeName}`,
        content:
          `Pemantauan optik PON (${onus.length} total ONU terdaftar):\n` +
          `• **ONU Kritis / LOS**: ${lowOpticalOnus.length} unit (${lowOpticalOnus.slice(0, 3).map((o) => `${o.customerName} [${o.rxPowerDbm} dBm · ${o.status}]`).join(", ") || "Semua dalam rentang optik optimal"}).\n` +
          `• **Tindakan Disarankan**: Bersihkan patchcord ODF atau cek redaman ODP pada port PON yang memiliki redaman < -27 dBm.`,
        metrics: [
          { label: "Total ONU", value: `${onus.length}`, tone: "info" },
          { label: "ONU Kritis/LOS", value: `${lowOpticalOnus.length}`, tone: lowOpticalOnus.length > 0 ? "warn" : "ok" },
        ],
        cliSnippet: "display ont optical-info all\ndisplay interface gpon 0/1",
        actionCta: { label: "Jalankan OLT Check", tab: "troubleshoot" },
      };
    }

    // Generate Report
    const mdReport =
      `# NOCVISION Executive Diagnostic Report\n` +
      `- Scope: ${scopeName}\n` +
      `- Timestamp: ${new Date().toISOString()}\n` +
      `- Devices Audited: ${targetDevices.length}\n` +
      `- Active / Inactive Ports: ${activePorts.length} / ${inactivePorts.length}\n` +
      `- Aggregate Throughput: Rx ${(totalRx / 1000).toFixed(2)} Gbps | Tx ${(totalTx / 1000).toFixed(2)} Gbps\n` +
      `- BGP Sessions: ${devBgp.length} (${devBgp.filter((b) => b.state === "Established").length} Established)\n` +
      `- Open Incidents: ${devIncidents.length}\n` +
      `- Backup Vault Snapshots: ${devSnapshots.length}\n`;

    return {
      title: `Executive Diagnostic Report · ${scopeName}`,
      content:
        `Laporan ringkas kesiapan jaringan untuk **${scopeName}** telah dibuat:\n` +
        `• **Kapasitas**: Throughput agregat ↓${(totalRx / 1000).toFixed(2)} Gbps / ↑${(totalTx / 1000).toFixed(2)} Gbps (${activePorts.length} port aktif, ${inactivePorts.length} port standby).\n` +
        `• **Stabilitas BGP**: ${devBgp.filter((b) => b.state === "Established").length}/${devBgp.length} peer Established.\n` +
        `• **Compliance Backup**: ${devSnapshots.length} snapshot konfigurasi tersimpan aman.`,
      metrics: [
        { label: "Aggregate Rx", value: `${(totalRx / 1000).toFixed(2)} Gbps`, tone: "info" },
        { label: "Aggregate Tx", value: `${(totalTx / 1000).toFixed(2)} Gbps`, tone: "info" },
        { label: "Open Incidents", value: `${devIncidents.length}`, tone: devIncidents.length > 0 ? "warn" : "ok" },
        { label: "Vault Snapshots", value: `${devSnapshots.length}`, tone: "ok" },
      ],
      reportMarkdown: mdReport,
      actionCta: { label: "Arsipkan Snapshot di Backup", tab: "backup" },
    };
  };

  const triggerPrompt = async (actionKey: string, displayPrompt: string) => {
    if (isThinking) return;
    const nowTime = formatTime();
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      content: displayPrompt,
      timestamp: nowTime,
    };

    const prevHistory = activeMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      targetSessionId = `sess-${Date.now()}`;
      const newSession: ChatSession = {
        id: targetSessionId,
        title: `${displayPrompt.slice(0, 32)} · ${activeDevice?.hostname || "Global"}`,
        deviceId: contextDeviceId,
        deviceName: activeDevice?.hostname || "Global Fleet",
        updatedAt: "Baru saja",
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(targetSessionId);
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, updatedAt: "Baru saja", messages: [...s.messages, userMsg] }
            : s
        )
      );
    }

    setIsThinking(true);
    setShowPromptSuggestions(false);
    const sid = targetSessionId;

    try {
      const res = await fetch("/api/superai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          actionKey,
          prompt: displayPrompt,
          deviceId: contextDeviceId,
          history: prevHistory,
        }),
      });
      const data = await res.json();

      if (data.ok && data.reply) {
        const localFallback = actionKey === "report" ? buildDiagnosticResponse("report", displayPrompt) : null;
        const aiMsg: ChatMessage = {
          id: `msg-a-${Date.now()}`,
          role: "assistant",
          title: data.reply.title,
          content: data.reply.content,
          cliSnippet: data.reply.cliSnippet,
          metrics: data.reply.metrics,
          actionCta: data.reply.suggestedTab
            ? {
                label:
                  data.reply.suggestedTab === "troubleshoot"
                    ? "Buka Troubleshoot Terminal"
                    : data.reply.suggestedTab === "backup"
                    ? "Buka Cloud Backup Vault"
                    : "Buka BGP Peers",
                tab: data.reply.suggestedTab,
              }
            : undefined,
          reportMarkdown: localFallback?.reportMarkdown,
          providerTag: `Gemini · ${data.model}`,
          timestamp: formatTime(),
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sid
              ? { ...s, updatedAt: "Baru saja", messages: [...s.messages, aiMsg] }
              : s
          )
        );
        return;
      }

      // Fallback cleanly to built-in telemetry analyzer
      const fallbackReply = buildDiagnosticResponse(actionKey, displayPrompt);
      const noticeText =
        data.reason === "GEMINI_API_KEY_NOT_CONFIGURED"
          ? "GEMINI_API_KEY belum diset di environment (.env.local) — menggunakan Telemetry Engine lokal."
          : `Fallback lokal aktif (${data.error || "Gemini API tidak terjangkau"}).`;
      const aiMsg: ChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: "assistant",
        ...fallbackReply,
        providerTag: "Telemetry Engine",
        fallbackNotice: noticeText,
        timestamp: formatTime(),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sid
            ? { ...s, updatedAt: "Baru saja", messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch {
      const fallbackReply = buildDiagnosticResponse(actionKey, displayPrompt);
      const aiMsg: ChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: "assistant",
        ...fallbackReply,
        providerTag: "Telemetry Engine",
        fallbackNotice: "Koneksi server terganggu — menggunakan Telemetry Engine lokal.",
        timestamp: formatTime(),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sid
            ? { ...s, updatedAt: "Baru saja", messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } finally {
      setIsThinking(false);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setInputText("");
    triggerPrompt("chat", trimmed);
  };

  const handleCopyCli = (id: string, cli: string) => {
    navigator.clipboard?.writeText(cli).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDownloadReport = (md: string) => {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nocvision-nocai-report-${activeDevice?.hostname || "fleet"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetToWelcome = () => {
    setActiveSessionId(null);
    setShowPromptSuggestions(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const statusDotColor = (status?: string) => {
    if (status === "online") return "bg-emerald-500";
    if (status === "warning" || status === "degraded") return "bg-amber-500";
    if (status === "critical" || status === "offline") return "bg-rose-500";
    return "bg-cyan-500";
  };

  // Theme tokens matching dark / twilight / light Bento design
  const topBarClass = isLightCard
    ? "bento-card-light"
    : "bento-card-dark";

  const mainCardClass = isLightCard
    ? "bento-card-light"
    : "bento-card-dark";

  const pillClass = isLightCard
    ? "bg-white border border-slate-200 text-slate-700 hover:border-sky-300 hover:bg-sky-50/60"
    : "bg-[#0d172c] border border-sky-500/25 text-slate-200 hover:border-cyan-400/50 hover:bg-[#111e38]";

  const quickActions = [
    {
      key: "analyze_device",
      label: "Analyze Device",
      prompt: `Analyze Device ${activeDevice ? activeDevice.hostname : "seluruh jaringan"} secara menyeluruh`,
      icon: Cpu,
      iconColor: "text-cyan-500",
      featured: true,
    },
    {
      key: "bgp",
      label: "Find BGP Problems",
      prompt: `Find BGP Problems pada ${activeDevice ? activeDevice.hostname : "semua BGP peer"}`,
      icon: Network,
      iconColor: "text-amber-500",
    },
    {
      key: "interface_errors",
      label: "Check Interface Errors",
      prompt: `Check Interface Errors dan status port aktif/non-aktif pada ${activeDevice ? activeDevice.hostname : "fleet"}`,
      icon: Cable,
      iconColor: "text-rose-500",
    },
    {
      key: "health",
      label: "Run Health Check",
      prompt: `Run Health Check lengkap untuk ${activeDevice ? activeDevice.hostname : "infrastruktur NOC"}`,
      icon: HeartPulse,
      iconColor: "text-emerald-500",
    },
    {
      key: "routing",
      label: "Analyze Routing",
      prompt: `Analyze Routing & active route filters pada ${activeDevice ? activeDevice.hostname : "core router"}`,
      icon: GitFork,
      iconColor: "text-indigo-500",
    },
    {
      key: "report",
      label: "Generate Report",
      prompt: `Generate Report diagnostik & kapasitas untuk ${activeDevice ? activeDevice.hostname : "NOCVISION Fleet"}`,
      icon: FileText,
      iconColor: "text-sky-500",
    },
    {
      key: "focus_chat",
      label: "Chat dengan AI",
      prompt: "",
      icon: Bot,
      iconColor: "text-cyan-500",
    },
  ];

  const promptStarters = [
    "Kenapa ada port standby down di grafik bandwidth?",
    "Cek status BGP peer & apakah ada anomaly RTT?",
    "Buatkan checklist mitigasi sebelum Commit Wizard",
  ];

  return (
    <div className="space-y-4">
      {/* ===================== TOP NOCAI HEADER BAR ===================== */}
      <div className={`rounded-[26px] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 transition-all ${topBarClass}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isLightCard
                ? "bg-sky-50 border border-sky-200/80 shadow-xs"
                : "bg-sky-500/15 border border-sky-500/30"
            }`}
          >
            <img
              src="/nocvision-icon.png"
              alt="NOCAI"
              className="w-7 h-7 object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-sm font-bold tracking-tight ${isLightCard ? "text-slate-900" : "text-white"}`}>
                NOCAI
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                  isLightCard
                    ? "bg-sky-100/90 text-sky-700 border border-sky-200/80"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/35"
                }`}
              >
                {activeDevice ? "Device Mode" : "Fleet Mode"}
              </span>
            </div>
            <p className={`text-[11px] truncate ${isLightCard ? "text-slate-500" : "text-slate-400"}`}>
              AI Network Intelligence · {flavor.label}
            </p>
          </div>
        </div>

        {/* Right Controls: Device Context, Back, Riwayat */}
        <div className="flex items-center gap-2 flex-wrap" ref={dropdownRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsContextOpen((o) => !o)}
              className={`flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl transition cursor-pointer ${pillClass}`}
            >
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  isLightCard ? "bg-sky-50 text-sky-600" : "bg-cyan-500/15 text-cyan-400"
                }`}
              >
                {activeDevice ? <Router className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              </span>
              <div className="text-left leading-tight">
                <span className="block text-[9px] font-bold tracking-wider uppercase text-slate-400">
                  DEVICE CONTEXT
                </span>
                <span className={`block text-xs font-bold ${isLightCard ? "text-slate-800" : "text-white"}`}>
                  {activeDevice ? activeDevice.hostname : `Semua Perangkat (${devices.length})`}
                </span>
              </div>
              <span className={`w-2 h-2 rounded-full ${statusDotColor(activeDevice?.status)}`} />
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>

            {isContextOpen && (
              <div
                className={`absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl z-30 p-1.5 max-h-80 overflow-y-auto ${
                  isLightCard
                    ? "bg-white border-slate-200"
                    : "bg-[#0c162b] border-sky-500/30"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setContextDeviceId("all");
                    setIsContextOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition cursor-pointer ${
                    contextDeviceId === "all"
                      ? isLightCard
                        ? "bg-sky-50 text-sky-700 font-semibold"
                        : "bg-cyan-500/20 text-cyan-300 font-semibold"
                      : isLightCard
                      ? "text-slate-700 hover:bg-slate-50"
                      : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-cyan-500" />
                    Semua Perangkat (Fleet Mode)
                  </span>
                  <span className="w-2 h-2 rounded-full bg-cyan-500" />
                </button>
                <div className={`my-1 border-t ${isLightCard ? "border-slate-100" : "border-white/10"}`} />
                {devices.map((dev) => (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => {
                      setContextDeviceId(dev.id);
                      onSelectDevice?.(dev.id);
                      setIsContextOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition cursor-pointer ${
                      contextDeviceId === dev.id
                        ? isLightCard
                          ? "bg-sky-50 text-sky-700 font-semibold"
                          : "bg-cyan-500/20 text-cyan-300 font-semibold"
                        : isLightCard
                        ? "text-slate-700 hover:bg-slate-50"
                        : "text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{dev.hostname}</div>
                      <div className="text-[10px] opacity-70 truncate">
                        {dev.ipAddress} · {dev.vendor.toUpperCase()}
                      </div>
                    </div>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor(dev.status)}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            title="Kembali ke halaman awal NOCAI"
            onClick={handleResetToWelcome}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition cursor-pointer ${pillClass}`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsHistoryOpen((o) => !o)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
              isHistoryOpen
                ? isLightCard
                  ? "bg-sky-50 border border-sky-300 text-sky-700"
                  : "bg-cyan-500/20 border border-cyan-400/50 text-cyan-200"
                : pillClass
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat</span>
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
              {sessions.length}
            </span>
          </button>
        </div>
      </div>

      {/* ===================== MAIN CHAT CARD + HISTORY DRAWER ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div
          className={`${
            isHistoryOpen ? "lg:col-span-8" : "lg:col-span-12"
          } rounded-[26px] flex flex-col justify-between min-h-[590px] overflow-hidden transition-all ${mainCardClass}`}
        >
          {/* Body: Welcome State OR Active Conversation */}
          {activeMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
              {/* Centered Brand AI Tile */}
              <div
                className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${
                  isLightCard
                    ? "bg-white border border-slate-200/80 shadow-[0_12px_30px_-8px_rgba(14,165,233,0.22)]"
                    : "bg-[#111c34] border border-sky-500/25 shadow-[0_12px_32px_-8px_rgba(14,165,233,0.32)]"
                }`}
              >
                <img
                  src="/nocvision-icon.png"
                  alt="NOCAI"
                  className="w-12 h-12 object-contain drop-shadow-[0_4px_12px_rgba(0,180,255,0.28)]"
                />
              </div>

              <h3 className={`text-2xl font-bold tracking-tight mb-2 ${isLightCard ? "text-slate-900" : "text-white"}`}>
                Selamat Datang di NOCAI
              </h3>
              <p className={`text-sm max-w-md leading-relaxed mb-8 ${isLightCard ? "text-slate-500" : "text-slate-400"}`}>
                Pilih salah satu aksi cepat di bawah untuk memulai analisis jaringan atau memulai
                percakapan dengan AI seputar{" "}
                {activeDevice
                  ? `${activeDevice.vendor.toUpperCase()} (${activeDevice.hostname})`
                  : "perangkat & topologi NOCVISION"}
                .
              </p>

              {/* Quick Actions Label */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase mb-3.5 text-slate-400">
                <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                <span>QUICK ACTIONS</span>
              </div>

              {/* 7 Quick Action Pills (Centered 2-Row Wrap) */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl">
                {quickActions.map((qa) => {
                  const Icon = qa.icon;
                  return (
                    <button
                      key={qa.key}
                      type="button"
                      onClick={() => {
                        if (qa.key === "focus_chat") {
                          setShowPromptSuggestions(true);
                          inputRef.current?.focus();
                        } else {
                          triggerPrompt(qa.key, qa.prompt);
                        }
                      }}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
                        qa.featured
                          ? isLightCard
                            ? "bg-sky-50 border border-sky-300 text-slate-800 shadow-[0_2px_10px_rgba(14,165,233,0.14)] hover:bg-sky-100/70"
                            : "bg-cyan-500/15 border border-cyan-400/50 text-white shadow-[0_2px_12px_rgba(34,211,238,0.2)] hover:bg-cyan-500/25"
                          : isLightCard
                          ? "bg-white border border-slate-200 text-slate-700 hover:border-sky-300 hover:bg-slate-50 shadow-2xs"
                          : "bg-[#0e1930] border border-sky-500/20 text-slate-200 hover:border-cyan-400/45 hover:bg-[#142342]"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          isLightCard ? "bg-slate-100/80" : "bg-white/5"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${qa.iconColor}`} />
                      </span>
                      <span>{qa.label}</span>
                    </button>
                  );
                })}
              </div>

              {showPromptSuggestions && (
                <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-xl animate-fadeIn">
                  {promptStarters.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => triggerPrompt("chat", p)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-medium border transition cursor-pointer ${
                        isLightCard
                          ? "bg-sky-50/70 border-sky-200 text-sky-700 hover:bg-sky-100"
                          : "bg-cyan-500/10 border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/20"
                      }`}
                    >
                      “{p}”
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[540px]">
              {activeMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-4 space-y-3 ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/20"
                        : isLightCard
                        ? "bg-slate-50 border border-slate-200 text-slate-800"
                        : "bg-[#051122] border border-sky-500/25 text-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                        {msg.role === "assistant" && (
                          <span className="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center">
                            <img src="/nocvision-icon.png" alt="NOCAI" className="w-3.5 h-3.5 object-contain" />
                          </span>
                        )}
                        <span>{msg.role === "user" ? "Anda" : msg.title || "NOCAI Diagnostic"}</span>
                        {msg.role === "assistant" && msg.providerTag && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              msg.providerTag.startsWith("Gemini")
                                ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                                : "bg-slate-500/15 text-slate-400 border border-slate-500/20"
                            }`}
                          >
                            {msg.providerTag}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] ${msg.role === "user" ? "text-sky-100" : "opacity-60"}`}>
                        {msg.timestamp}
                      </span>
                    </div>

                    {msg.fallbackNotice && (
                      <div
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                          isLightCard
                            ? "bg-amber-50 border border-amber-200 text-amber-800"
                            : "bg-amber-500/10 border border-amber-500/25 text-amber-300"
                        }`}
                      >
                        <span>{msg.fallbackNotice}</span>
                      </div>
                    )}

                    {msg.role === "assistant" && msg.title && (
                      <h4
                        className={`text-sm font-bold tracking-tight ${
                          isLightCard ? "text-slate-900" : "text-white"
                        }`}
                      >
                        {msg.title}
                      </h4>
                    )}

                    {renderFormattedAiContent(msg.content, isLightCard, msg.role === "user")}

                    {msg.metrics && msg.metrics.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {msg.metrics.map((m) => (
                          <div
                            key={m.label}
                            className={`rounded-xl px-2.5 py-2 border ${
                              isLightCard ? "bg-white border-slate-200" : "bg-black/25 border-white/10"
                            }`}
                          >
                            <div className="text-[10px] opacity-65">{m.label}</div>
                            <div
                              className={`text-xs font-bold mt-0.5 ${
                                m.tone === "ok"
                                  ? "text-emerald-500"
                                  : m.tone === "warn"
                                  ? "text-amber-500"
                                  : m.tone === "bad"
                                  ? "text-rose-500"
                                  : isLightCard
                                  ? "text-slate-900"
                                  : "text-cyan-400"
                              }`}
                            >
                              {m.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.cliSnippet && (
                      <div className="rounded-xl bg-[#030916] border border-sky-500/25 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 text-[10px] font-mono text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-cyan-400" />
                            Recommended Vendor CLI ({activeDevice?.vendor.toUpperCase() || "MULTI-VENDOR"})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCli(msg.id, msg.cliSnippet!)}
                            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3" /> Disalin
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Salin
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                          {msg.cliSnippet}
                        </pre>
                      </div>
                    )}

                    {(msg.actionCta || msg.reportMarkdown) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {msg.actionCta && onNavigateTab && (
                          <button
                            type="button"
                            onClick={() => onNavigateTab(msg.actionCta!.tab)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition ${
                              isLightCard
                                ? "bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-700"
                                : "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-400/35 text-cyan-300"
                            }`}
                          >
                            {msg.actionCta.tab === "troubleshoot" ? (
                              <Wrench className="w-3 h-3" />
                            ) : (
                              <Activity className="w-3 h-3" />
                            )}
                            {msg.actionCta.label}
                          </button>
                        )}
                        {msg.reportMarkdown && (
                          <button
                            type="button"
                            onClick={() => handleDownloadReport(msg.reportMarkdown!)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer transition ${
                              isLightCard
                                ? "bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-700"
                                : "bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30 text-cyan-400"
                            }`}
                          >
                            <Download className="w-3 h-3" />
                            Unduh Laporan (.md)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div
                    className={`px-4 py-3 rounded-2xl text-xs flex items-center gap-2 ${
                      isLightCard
                        ? "bg-slate-100 text-slate-600"
                        : "bg-[#0c162b] border border-sky-500/20 text-slate-300"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-500 animate-spin" />
                    <span>NOCAI sedang menganalisis telemetri {activeDevice?.hostname || "infrastruktur"}...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Bottom Chat Composer Bar */}
          <form
            onSubmit={handleSend}
            className={`px-5 py-3.5 border-t flex items-center gap-2.5 ${
              isLightCard ? "border-slate-100 bg-slate-50/70" : "border-white/10 bg-black/20"
            }`}
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Tanya NOCAI tentang ${
                  activeDevice ? activeDevice.hostname : "jaringan"
                } (BGP, interface error, routing, OLT, atau health check)...`}
                className={`w-full pl-4 pr-12 py-2.5 rounded-2xl text-xs outline-none transition ${
                  isLightCard
                    ? "bg-white border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-sky-500"
                    : "bg-[#0e1930] border border-sky-500/25 text-white placeholder:text-slate-400 focus:border-cyan-400"
                }`}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isThinking}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white flex items-center justify-center disabled:opacity-40 cursor-pointer transition hover:brightness-110 shadow-sm"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* ===================== RIWAYAT DRAWER ===================== */}
        {isHistoryOpen && (
          <div className={`lg:col-span-4 rounded-[26px] p-4 flex flex-col gap-3 max-h-[640px] ${mainCardClass}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-500" />
                <h4 className={`text-sm font-bold ${isLightCard ? "text-slate-900" : "text-white"}`}>
                  Riwayat Percakapan ({sessions.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={handleResetToWelcome}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition ${
                  isLightCard
                    ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
                    : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                }`}
              >
                <MessageSquarePlus className="w-3.5 h-3.5" /> Chat Baru
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {sessions.length === 0 ? (
                <div className="text-center py-10 text-xs opacity-60 flex flex-col items-center gap-2">
                  <ShieldAlert className="w-6 h-6 text-slate-400" />
                  Belum ada riwayat percakapan.
                </div>
              ) : (
                sessions.map((sess) => {
                  const isActive = sess.id === activeSessionId;
                  return (
                    <div
                      key={sess.id}
                      onClick={() => {
                        setActiveSessionId(sess.id);
                        if (sess.deviceId) setContextDeviceId(sess.deviceId);
                      }}
                      className={`group p-3 rounded-2xl border transition cursor-pointer ${
                        isActive
                          ? isLightCard
                            ? "bg-sky-50 border-sky-300"
                            : "bg-cyan-500/15 border-cyan-400/50"
                          : isLightCard
                          ? "bg-slate-50/70 border-slate-200 hover:border-sky-200"
                          : "bg-white/5 border-white/10 hover:border-cyan-400/35"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`text-xs font-bold truncate ${isLightCard ? "text-slate-800" : "text-white"}`}>
                            {sess.title}
                          </div>
                          <div className="text-[10px] opacity-65 mt-0.5 flex items-center gap-2">
                            <span>{sess.deviceName}</span>
                            <span>•</span>
                            <span>{sess.updatedAt}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(sess.id, e)}
                          className="opacity-50 group-hover:opacity-100 text-rose-500 p-1 cursor-pointer"
                          title="Hapus riwayat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
