"use client";

import React, { useCallback, useEffect, useState } from "react";
import { NocState } from "@/lib/noc-store";
import { NocUser } from "@/lib/auth";
import { NetworkDevice } from "@/lib/types";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";
import TopologyMap from "@/components/TopologyMap";
import OltPonMonitor from "@/components/OltPonMonitor";
import WebTerminalDiagnostics from "@/components/WebTerminalDiagnostics";
import AddDeviceModal from "@/components/AddDeviceModal";
import LoginView from "@/components/LoginView";
import DeviceGraphsCenter from "@/components/DeviceGraphsCenter";
import UserRoleManager from "@/components/UserRoleManager";
import UptimeMonitorView from "@/components/UptimeMonitorView";
import AutomationSafetyCenter from "@/components/AutomationSafetyCenter";
import SuperAIChatView from "@/components/SuperAIChatView";
import AuditLogView from "@/components/AuditLogView";
import AlertingCenter from "@/components/AlertingCenter";
import BentoOverviewDashboard, {
  BentoTheme,
} from "@/components/BentoOverviewDashboard";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CloudMoon,
  FileText,
  Globe,
  HardDriveDownload,
  LogOut,
  Moon,
  Network,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Wrench,
} from "lucide-react";

type ActiveTab =
  | "overview"
  | "uptime"
  | "graphs"
  | "olt_pon"
  | "topology"
  | "devices"
  | "bgp"
  | "super_ai"
  | "troubleshoot"
  | "backup"
  | "audit_log"
  | "alerting"
  | "diagnostics"
  | "users_rbac";

export default function NocVisionDashboard() {
  const [currentUser, setCurrentUser] = useState<NocUser | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [nocState, setNocState] = useState<NocState | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [theme, setTheme] = useState<BentoTheme>("dark");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nocvision_theme");
      if (saved === "dark" || saved === "twilight" || saved === "light") {
        setTheme(saved);
      }
    } catch {
      // Ignore storage access failures
    }
  }, []);

  const handleThemeChange = useCallback((nextTheme: BentoTheme) => {
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("nocvision_theme", nextTheme);
    } catch {
      // Ignore storage access failures
    }
  }, []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    "dev-cr-01"
  );
  const [autoRefresh] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Device Inventory Filter states
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [deviceSearch, setDeviceSearch] = useState<string>("");
  const [pollingDeviceId, setPollingDeviceId] = useState<string | null>(null);
  const [pollToast, setPollToast] = useState<string | null>(null);
  const [selectedBgpPeerId, setSelectedBgpPeerId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setCurrentUser(data.user as NocUser);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const fetchNocState = useCallback(async (refresh = false, realPing = false) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(
        `/api/noc?refresh=${refresh ? "true" : "false"}&realPing=${
          realPing ? "true" : "false"
        }`
      );
      if (res.status === 401) {
        setCurrentUser(null);
        setNocState(null);
        return;
      }
      const data = await res.json();
      if (res.ok && Array.isArray(data?.devices)) {
        setNocState(data as NocState);
      }
    } catch (err) {
      console.error("Failed to fetch NOC state:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetchNocState(false);
  }, [currentUser, fetchNocState]);

  useEffect(() => {
    if (!currentUser || !autoRefresh) return;
    const timer = setInterval(() => {
      fetchNocState(true, false);
    }, 5000);
    return () => clearInterval(timer);
  }, [currentUser, autoRefresh, fetchNocState]);

  const handleLogout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setCurrentUser(null);
  };

  const showToast = (msg: string) => {
    setPollToast(msg);
    setTimeout(() => setPollToast(null), 4000);
  };

  const handleAddDevice = async (payload: Record<string, unknown>) => {
    if (currentUser && !currentUser.permissions.includes("manage_devices")) {
      showToast(
        `Akses Ditolak: Role '${currentUser.role}' tidak memiliki izin menambah perangkat.`
      );
      return;
    }
    const res = await fetch("/api/noc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_device", ...payload }),
    });
    const data = await res.json();
    if (res.status === 401) {
      setCurrentUser(null);
      setNocState(null);
      return;
    }
    if (!res.ok) {
      showToast(data.error || "Gagal menambah perangkat.");
      return;
    }
    if (data.state) {
      setNocState(data.state);
      if (data.device) {
        setSelectedDeviceId(data.device.id);
        showToast(
          `Perangkat ${data.device.name} (${data.device.vendor} - ${data.device.ipAddress}) berhasil ditambahkan!`
        );
      }
    }
  };

  const handleDeleteDevice = async (deviceId: string, name: string) => {
    if (currentUser && !currentUser.permissions.includes("manage_devices")) {
      showToast(
        `Akses Ditolak: Role '${currentUser.role}' tidak memiliki izin menghapus perangkat.`
      );
      return;
    }
    const res = await fetch("/api/noc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_device", deviceId }),
    });
    const data = await res.json();
    if (res.status === 401) {
      setCurrentUser(null);
      setNocState(null);
      return;
    }
    if (!res.ok) {
      showToast(data.error || "Gagal menghapus perangkat.");
      return;
    }
    if (data.state) {
      setNocState(data.state);
      showToast(`Perangkat ${name} dihapus dari monitoring.`);
    }
  };

  const handleLivePollDevice = async (dev: NetworkDevice) => {
    setPollingDeviceId(dev.id);
    try {
      const res = await fetch("/api/noc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "poll_device", deviceId: dev.id }),
      });
      if (res.status === 401) {
        setCurrentUser(null);
        setNocState(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Live poll ditolak.");
        return;
      }
      if (data.state) setNocState(data.state);
      if (data.pingResult) {
        const pr = data.pingResult;
        showToast(
          `Live Poll ${dev.name} (${dev.ipAddress}): ${
            pr.alive
              ? `ICMP UP (${pr.latencyMs} ms, Loss ${pr.packetLossPct}%)`
              : `No ICMP Reply (Mode: ${dev.pollingMode})`
          }`
        );
      }
    } finally {
      setPollingDeviceId(null);
    }
  };

  const handleProvisionOnu = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/noc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "provision_onu", ...payload }),
    });
    if (res.status === 401) {
      setCurrentUser(null);
      setNocState(null);
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal melakukan provisioning ONU.");
      return;
    }
    if (data.state) {
      setNocState(data.state);
      showToast("ONU/ONT berhasil di-provision dan aktif!");
    }
  };

  const handleRebootOnu = async (onuId: string) => {
    const res = await fetch("/api/noc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reboot_onu", onuId }),
    });
    if (res.status === 401) {
      setCurrentUser(null);
      setNocState(null);
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal mereset ONU.");
      return;
    }
    if (data.state) {
      setNocState(data.state);
      showToast("Perintah Remote Reset & Re-sync Optik ONU berhasil dikirim.");
    }
  };

  const handleIncidentAction = async (
    incidentId: string,
    action: "ack_incident" | "resolve_incident"
  ) => {
    const res = await fetch("/api/noc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, incidentId }),
    });
    if (res.status === 401) {
      setCurrentUser(null);
      setNocState(null);
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Aksi insiden ditolak.");
      return;
    }
    if (data.state) setNocState(data.state);
  };

  const handleResetDemo = async () => {
    const res = await fetch("/api/noc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_demo" }),
    });
    if (res.status === 401) {
      setCurrentUser(null);
      setNocState(null);
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal mereset data demo.");
      return;
    }
    if (data.state) {
      setNocState(data.state);
      showToast("State NOC berhasil di-reset ke data multi-vendor awal.");
    }
  };

  const handleAutomationAction = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/noc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setCurrentUser(null);
        setNocState(null);
        return { error: "Sesi berakhir, silakan login ulang." };
      }
      const data = await res.json();
      if (data.state) {
        setNocState(data.state);
      }
      return data;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Network error" };
    }
  };

  const shellClass =
    theme === "dark"
      ? "bento-shell-dark"
      : theme === "twilight"
      ? "bento-shell-twilight"
      : "bento-shell-light";

  if (!authChecked) {
    return (
      <div
        className={`min-h-screen ${shellClass} flex flex-col items-center justify-center gap-3 ${
          theme === "dark" ? "text-slate-300" : "text-slate-700"
        }`}
      >
        <img
          src="/nocvision-icon.png"
          alt="NOCVISION"
          className="w-20 h-20 object-contain drop-shadow-[0_0_24px_rgba(0,200,255,0.55)] animate-pulse"
        />
        <p className="text-sm font-mono">
          Memeriksa Sesi Keamanan NOCVISION AAA...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginView
        theme={theme}
        onThemeChange={handleThemeChange}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
        }}
      />
    );
  }

  if (!nocState) {
    return (
      <div
        className={`min-h-screen ${shellClass} flex flex-col items-center justify-center gap-3 ${
          theme === "dark" ? "text-slate-300" : "text-slate-700"
        }`}
      >
        <img
          src="/nocvision-icon.png"
          alt="NOCVISION"
          className="w-20 h-20 object-contain drop-shadow-[0_0_24px_rgba(0,200,255,0.55)] animate-pulse"
        />
        <p className="text-sm font-mono">
          Menginisialisasi NOCVISION Multi-Vendor Telemetry Engine...
        </p>
      </div>
    );
  }

  const {
    devices,
    onus,
    bgpPeers,
    links,
    incidents,
    trafficHistory,
    configSnapshots = [],
    routeFilters = [],
    auditLogs = [],
    autoBackupEnabled = true,
  } = nocState;

  const olts = devices.filter((d) => d.role === "olt");
  const allPonPorts = olts.flatMap((o) => o.ponPorts || []);
  const losOnuCount = allPonPorts.reduce((acc, p) => acc + p.losOnu, 0);

  const uniqueVendors = Array.from(new Set(devices.map((d) => d.vendor)));

  const filteredDevices = devices.filter((d) => {
    if (roleFilter !== "all" && d.role !== roleFilter) return false;
    if (vendorFilter !== "all" && d.vendor !== vendorFilter) return false;
    if (deviceSearch.trim()) {
      const q = deviceSearch.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.ipAddress.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.vendor.toLowerCase().includes(q) ||
        d.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const windowClass =
    theme === "dark"
      ? "bento-window-dark"
      : theme === "twilight"
      ? "bento-window-twilight"
      : "bento-window-light";

  const headerTextColor =
    theme === "light" ? "text-slate-800" : "text-white";
  const isLightCard = theme === "light" || theme === "twilight";
  const pageCardCls = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px]";
  const pageHeading = isLightCard ? "text-slate-900" : "text-white";
  const pageMuted = isLightCard ? "text-slate-500" : "text-slate-400";
  const pageCyan = isLightCard ? "text-sky-600" : "text-cyan-300";

  const sidebarItems: {
    id: ActiveTab;
    label: string;
    subLabel: string;
    icon: React.ElementType;
    group: string;
    badge?: string;
    badgeTone?: "danger" | "info" | "success";
    hasDot?: boolean;
  }[] = [
    {
      id: "overview",
      label: "Dashboard",
      subLabel: "Bento Command Overview",
      icon: Activity,
      group: "MONITORING UTAMA",
    },
    {
      id: "uptime",
      label: "Uptime",
      subLabel: "Heartbeat & SLA Ping",
      icon: TrendingUp,
      group: "MONITORING UTAMA",
      badge: "UP",
      badgeTone: "success",
    },
    {
      id: "graphs",
      label: "Structure & Grafik",
      subLabel: "Telemetri Per-Alat & Port",
      icon: BarChart3,
      group: "MONITORING UTAMA",
    },
    {
      id: "olt_pon",
      label: "OLT & ONU",
      subLabel: "FTTH GPON / EPON / XGS",
      icon: Radio,
      group: "INFRASTRUKTUR JARINGAN",
      badge: losOnuCount > 0 ? `${losOnuCount} LOS` : `${onus.length}`,
      badgeTone: losOnuCount > 0 ? "danger" : "info",
    },
    {
      id: "topology",
      label: "Topology",
      subLabel: "Peta Interkoneksi Link",
      icon: Network,
      group: "INFRASTRUKTUR JARINGAN",
    },
    {
      id: "devices",
      label: "Devices",
      subLabel: "Router, Switch & OLT",
      icon: Server,
      group: "INFRASTRUKTUR JARINGAN",
      badge: `${devices.length}`,
      badgeTone: "info",
    },
    {
      id: "bgp",
      label: "BGP Peers",
      subLabel: "Upstream IX & Transit",
      icon: Globe,
      group: "INFRASTRUKTUR JARINGAN",
      badge: `${bgpPeers.length}`,
      badgeTone: "info",
    },
    {
      id: "super_ai",
      label: "NOCAI",
      subLabel: "AI Chat & Gemini Engine",
      icon: Sparkles,
      group: "DIAGNOSTIK & AI",
      hasDot: true,
    },
    {
      id: "troubleshoot",
      label: "Troubleshoot",
      subLabel: "Ping, Traceroute & CLI",
      icon: Wrench,
      group: "DIAGNOSTIK & AI",
    },
    {
      id: "backup",
      label: "Backup",
      subLabel: "Cloud Auto-Backup Vault",
      icon: HardDriveDownload,
      group: "DIAGNOSTIK & AI",
      badge: `${configSnapshots.length}`,
      badgeTone: "info",
    },
    {
      id: "audit_log",
      label: "Audit Log",
      subLabel: "Forensik Perubahan ISO",
      icon: FileText,
      group: "TOOLS & ADMINISTRASI",
      badge: `${auditLogs.length}`,
      badgeTone: "info",
    },
    {
      id: "alerting",
      label: "Alerting",
      subLabel: "Telegram & WhatsApp Bot",
      icon: Bell,
      group: "TOOLS & ADMINISTRASI",
    },
    {
      id: "users_rbac",
      label: "Role & User",
      subLabel: "Hak Akses Anggota NOC",
      icon: ShieldCheck,
      group: "TOOLS & ADMINISTRASI",
    },
  ];

  const activeMenuObj =
    sidebarItems.find((i) => i.id === activeTab) || sidebarItems[0];

  const sidebarGroups = [
    "MONITORING UTAMA",
    "INFRASTRUKTUR JARINGAN",
    "DIAGNOSTIK & AI",
    "TOOLS & ADMINISTRASI",
  ];

  return (
    <div
      className={`min-h-screen ${shellClass} flex transition-colors duration-300`}
    >
      {/* Top Notification Toast */}
      {pollToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-cyan-950/95 border border-cyan-400/50 text-cyan-100 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-medium">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{pollToast}</span>
        </div>
      )}

      {/* ================= LEFT SIDEBAR NAVIGATION ================= */}
      <aside
        className={`${
          isSidebarCollapsed ? "w-[84px]" : "w-[276px]"
        } shrink-0 sticky top-0 h-screen flex flex-col justify-between border-r transition-all duration-300 z-30 ${
          theme === "light"
            ? "bg-white/90 border-slate-200/90 text-slate-800 shadow-lg"
            : theme === "twilight"
            ? "bg-[#1a2234]/95 border-slate-700/70 text-slate-100 shadow-2xl"
            : "bg-[#040b18]/95 border-cyan-500/20 text-slate-100 shadow-[4px_0_30px_rgba(0,0,0,0.6)]"
        } backdrop-blur-xl`}
      >
        {/* Top Brand + Add Node Button */}
        <div className="p-4 border-b border-slate-700/30">
          <div className="flex items-center justify-between gap-2">
            <div
              onClick={() => setActiveTab("overview")}
              className="flex items-center gap-3 cursor-pointer group overflow-hidden"
            >
              <img
                src="/nocvision-icon.png"
                alt="NOCVISION Icon"
                className="w-11 h-11 object-contain drop-shadow-[0_0_14px_rgba(0,184,255,0.45)] shrink-0 transition-transform group-hover:scale-105"
              />
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="flex items-baseline gap-0.5 leading-none">
                    <span
                      className={`text-lg font-black tracking-wider ${headerTextColor}`}
                    >
                      NOC
                    </span>
                    <span className="text-lg font-black tracking-wider text-[#00b8ff]">
                      VISION
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-mono block mt-1 truncate ${
                      theme === "light" ? "text-slate-500" : "text-sky-200/70"
                    }`}
                  >
                    See Everything. Control.
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={
                isSidebarCollapsed ? "Perlebar Menu Kiri" : "Kecilkan Menu Kiri"
              }
              className={`p-1.5 rounded-xl border transition cursor-pointer shrink-0 ${
                theme === "light"
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
                  : "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/70"
              }`}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Center Scrollable Menu List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {sidebarGroups.map((groupName) => {
            const groupItems = sidebarItems.filter(
              (item) => item.group === groupName
            );
            return (
              <div key={groupName} className="space-y-1">
                {!isSidebarCollapsed && (
                  <p
                    className={`px-3 text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5 ${
                      theme === "light"
                        ? "text-slate-400"
                        : "text-sky-300/50"
                    }`}
                  >
                    {groupName}
                  </p>
                )}
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      title={`${item.label} — ${item.subLabel}`}
                      className={`w-full flex items-center ${
                        isSidebarCollapsed
                          ? "justify-center px-2 py-3"
                          : "justify-between px-3 py-2.5"
                      } rounded-xl text-left transition-all cursor-pointer group ${
                        isActive
                          ? theme === "light"
                            ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/20"
                            : "bg-gradient-to-r from-cyan-500/20 to-sky-500/10 text-cyan-200 border border-cyan-400/50 shadow-[0_0_18px_rgba(0,200,255,0.18)]"
                          : theme === "light"
                          ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          : "text-slate-300/85 hover:bg-white/5 hover:text-white border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 ${
                            item.group === "DIAGNOSTIK & AI"
                              ? "rounded-full"
                              : "rounded-lg"
                          } flex items-center justify-center shrink-0 transition ${
                            item.id === "super_ai"
                              ? isActive
                                ? theme === "light"
                                  ? "bg-white/95 shadow-sm"
                                  : "bg-[#051122] border border-cyan-400/60 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                                : theme === "light"
                                ? "bg-sky-50 border border-sky-200/80 group-hover:bg-sky-100"
                                : "bg-slate-900/90 border border-sky-500/25 group-hover:border-cyan-400/50"
                              : isActive
                              ? theme === "light"
                                ? "bg-white/25 text-white shadow-sm"
                                : "bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                              : theme === "light"
                              ? "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                              : "bg-slate-900/80 text-slate-400 group-hover:text-cyan-300"
                          }`}
                        >
                          {item.id === "super_ai" ? (
                            <img
                              src="/nocvision-icon.png"
                              alt="NOCAI"
                              className="w-5 h-5 object-contain"
                            />
                          ) : (
                            <Icon className="w-4 h-4" />
                          )}
                        </div>
                        {!isSidebarCollapsed && (
                          <span className="block text-xs font-bold leading-tight truncate">
                            {item.label}
                          </span>
                        )}
                      </div>

                      {!isSidebarCollapsed && item.hasDot && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isActive && theme === "light"
                              ? "bg-white"
                              : "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                          }`}
                        />
                      )}

                      {!isSidebarCollapsed && item.badge && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                            item.badgeTone === "danger"
                              ? "bg-rose-500 text-white"
                              : item.badgeTone === "success"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : isActive && theme === "light"
                              ? "bg-white/25 text-white"
                              : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom User Profile & Quick Sync Controls inside Left Sidebar */}
        <div className="p-3 border-t border-slate-700/30 space-y-2.5">
          {!isSidebarCollapsed && (
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <button
                onClick={() => fetchNocState(true, true)}
                className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  theme === "light"
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                    : "bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border-slate-800"
                }`}
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span>{isRefreshing ? "SYNC..." : "POLL"}</span>
              </button>
              <button
                onClick={handleResetDemo}
                className={`py-1.5 px-2 rounded-lg border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  theme === "light"
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
                    : "bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800"
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>RESET</span>
              </button>
            </div>
          )}

          <div
            className={`flex items-center ${
              isSidebarCollapsed ? "justify-center" : "justify-between"
            } gap-2 p-2 rounded-xl border ${
              theme === "light"
                ? "bg-slate-50 border-slate-200"
                : "bg-slate-950/70 border-slate-800/80"
            }`}
          >
            <div
              onClick={() => setActiveTab("users_rbac")}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer"
              title={`${currentUser.fullName} (${currentUser.role})`}
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 flex items-center justify-center font-bold text-xs font-mono shrink-0">
                {currentUser.avatarInitials}
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <p
                    className={`text-xs font-bold truncate leading-tight ${
                      theme === "light" ? "text-slate-800" : "text-white"
                    }`}
                  >
                    {currentUser.fullName}
                  </p>
                  <p className="text-[10px] font-mono text-cyan-400 truncate">
                    {currentUser.role}
                  </p>
                </div>
              )}
            </div>

            {!isSidebarCollapsed && (
              <button
                onClick={handleLogout}
                title="Keluar dari Sesi NOCVISION (Logout)"
                className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${
                  theme === "light"
                    ? "bg-white text-slate-600 hover:text-rose-600 border-slate-200"
                    : "bg-slate-900 text-slate-400 hover:text-rose-400 border-slate-800"
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ================= RIGHT MAIN WORKSPACE AREA ================= */}
      <div className="flex-1 min-w-0 px-3 sm:px-6 lg:px-8 py-5 overflow-x-hidden">
        {/* Top Status & Theme Switcher Bar */}
        <div className="max-w-[1540px] mx-auto flex flex-wrap items-center justify-between gap-3 mb-4 px-2">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                autoRefresh ? "bg-emerald-400 animate-ping" : "bg-slate-400"
              }`}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm sm:text-base font-extrabold tracking-tight ${headerTextColor}`}
                >
                  {activeMenuObj.label}
                </h2>
                <span className="text-xs text-slate-500">•</span>
                <span
                  className={`text-xs font-mono ${
                    theme === "light"
                      ? "text-slate-600"
                      : "text-sky-200/80"
                  }`}
                >
                  {activeMenuObj.subLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`hidden md:inline text-xs font-mono ${
                theme === "light"
                  ? "text-slate-600 font-semibold"
                  : "text-sky-200/75"
              }`}
            >
              NOCVISION Engine • {devices.length} Multi-Vendor Nodes
            </span>

            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-600/30">
              <span
                className={`text-[11px] mr-1 ${
                  theme === "light" ? "text-slate-600" : "text-sky-200/70"
                }`}
              >
                Tema:
              </span>
              <button
                onClick={() => handleThemeChange("dark")}
                title="Cyber Dark Mode (Glowing Navy)"
                className={`p-1.5 rounded-full transition cursor-pointer ${
                  theme === "dark"
                    ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleThemeChange("twilight")}
                title="Hybrid Twilight Mode (Slate & White Bento)"
                className={`p-1.5 rounded-full transition cursor-pointer ${
                  theme === "twilight"
                    ? "bg-white/25 text-white border border-white/50 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CloudMoon className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleThemeChange("light")}
                title="Frost Light Mode (Clean Ice Bento)"
                className={`p-1.5 rounded-full transition cursor-pointer ${
                  theme === "light"
                    ? "bg-slate-900 text-amber-300 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* MAIN ROUNDED BENTO GLASS WINDOW CONTAINER */}
        <div
          className={`max-w-[1540px] mx-auto rounded-[32px] p-5 sm:p-7 ${windowClass} transition-all duration-300`}
        >

        {/* ===================== TAB 1: BENTO OVERVIEW DASHBOARD ===================== */}
        {activeTab === "overview" && (
          <BentoOverviewDashboard
            theme={theme}
            devices={devices}
            onus={onus}
            bgpPeers={bgpPeers}
            incidents={incidents}
            trafficHistory={trafficHistory}
            selectedDeviceId={selectedDeviceId}
            pollingDeviceId={pollingDeviceId}
            onSelectDevice={(id) => setSelectedDeviceId(id)}
            onLivePollDevice={handleLivePollDevice}
            onIncidentAction={handleIncidentAction}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}

        {/* ===================== TAB 1.5: UPTIME MONITOR (UPTIME KUMA STYLE) ===================== */}
        {activeTab === "uptime" && (
          <UptimeMonitorView
            theme={theme}
            devices={devices}
            onNotify={showToast}
          />
        )}

        {/* ===================== TAB 2: GRAFIK & TELEMETRI ALAT ===================== */}
        {activeTab === "graphs" && (
          <DeviceGraphsCenter
            theme={theme}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={(id) => setSelectedDeviceId(id)}
          />
        )}

        {/* ===================== TAB 3: FTTH OLT & ONU MONITOR ===================== */}
        {activeTab === "olt_pon" && (
          <OltPonMonitor
            theme={theme}
            devices={devices}
            onus={onus}
            onProvisionOnu={handleProvisionOnu}
            onRebootOnu={handleRebootOnu}
          />
        )}

        {/* ===================== TAB 4: INTERACTIVE TOPOLOGY MAP ===================== */}
        {activeTab === "topology" && (
          <TopologyMap
            theme={theme}
            devices={devices}
            links={links}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={(dev) => setSelectedDeviceId(dev.id)}
          />
        )}

        {/* ===================== TAB 5: MULTI-VENDOR DEVICE INVENTORY ===================== */}
        {activeTab === "devices" && (
          <div className={`${pageCardCls} p-5 space-y-5`}>
            <div
              className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ${
                isLightCard ? "border-slate-200" : "border-sky-500/20"
              }`}
            >
              <div>
                <h3 className={`text-base font-semibold ${pageHeading} flex items-center gap-2`}>
                  <Server className="w-4 h-4 text-cyan-400" />
                  Inventory Perangkat Jaringan Multi-Vendor (Core Router, Switch, OLT)
                </h3>
                <p className={`text-xs ${pageMuted} mt-0.5`}>
                  Mendukung koneksi nyata (ICMP Ping &amp; TCP Port Probe) serta profil SNMP OID otomatis di semua brand
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    placeholder="Cari nama, IP, seri, lokasi..."
                    className={`border rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-cyan-400 w-56 ${
                      isLightCard
                        ? "bg-white border-slate-300 text-slate-900"
                        : "bg-[#051122] border-sky-500/30 text-white"
                    }`}
                  />
                </div>

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className={`border rounded-full px-3 py-1.5 text-xs ${
                    isLightCard
                      ? "bg-white border-slate-300 text-slate-800"
                      : "bg-[#051122] border-sky-500/30 text-white"
                  }`}
                >
                  <option value="all">Semua Tipe ({devices.length})</option>
                  <option value="core_router">Core Router</option>
                  <option value="dist_switch">Distribution Switch</option>
                  <option value="access_switch">Access Switch</option>
                  <option value="olt">OLT (GPON/EPON)</option>
                  <option value="firewall">Firewall</option>
                </select>

                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className={`border rounded-full px-3 py-1.5 text-xs ${
                    isLightCard
                      ? "bg-white border-slate-300 text-slate-800"
                      : "bg-[#051122] border-sky-500/30 text-white"
                  }`}
                >
                  <option value="all">Semua Brand</option>
                  {uniqueVendors.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Perangkat
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b text-[11px] uppercase tracking-wider ${pageMuted} ${
                      isLightCard ? "border-slate-200" : "border-sky-500/20"
                    }`}
                  >
                    <th className="py-2.5 px-3">Status &amp; Nama Perangkat</th>
                    <th className="py-2.5 px-3">Brand &amp; Model Hardware</th>
                    <th className="py-2.5 px-3">IP Address &amp; Protokol</th>
                    <th className="py-2.5 px-3">CPU / RAM / Temp</th>
                    <th className="py-2.5 px-3">Latency &amp; Traffic</th>
                    <th className="py-2.5 px-3">Lokasi Rack</th>
                    <th className="py-2.5 px-3 text-right">Aksi &amp; Tes Koneksi</th>
                  </tr>
                </thead>
                <tbody
                  className={`divide-y text-xs ${
                    isLightCard ? "divide-slate-100" : "divide-sky-500/15"
                  }`}
                >
                  {filteredDevices.map((dev) => (
                    <tr
                      key={dev.id}
                      className={`transition-colors ${
                        isLightCard ? "hover:bg-slate-50" : "hover:bg-sky-950/30"
                      }`}
                    >
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              dev.status === "online"
                                ? "bg-emerald-400"
                                : dev.status === "warning"
                                ? "bg-amber-400"
                                : "bg-rose-500"
                            }`}
                          />
                          <div>
                            <span className={`font-bold ${pageHeading} block`}>
                              {dev.name}
                            </span>
                            <span className={`text-[11px] ${pageMuted} uppercase font-mono`}>
                              {dev.role.replace("_", " ")} • Uptime {dev.uptime}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border mb-1 ${
                            VENDOR_PROFILES[dev.vendor]?.badgeColor ||
                            VENDOR_PROFILES.Other.badgeColor
                          }`}
                        >
                          {dev.vendor}
                        </span>
                        <span
                          className={`block font-medium ${
                            isLightCard ? "text-slate-800" : "text-slate-200"
                          }`}
                        >
                          {dev.model}
                        </span>
                        <span className={`text-[11px] ${pageMuted}`}>
                          {dev.osVersion}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 font-mono">
                        <span className={`${pageCyan} font-semibold block`}>
                          {dev.ipAddress}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dev.protocols.map((p) => (
                            <span
                              key={p}
                              className={`px-1.5 py-0.2 rounded text-[10px] ${
                                isLightCard
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-mono">
                        <div className="flex items-center gap-2">
                          <span className={isLightCard ? "text-slate-700" : "text-slate-200"}>
                            CPU: <strong>{dev.cpuUsage}%</strong>
                          </span>
                          <span className="text-slate-400">|</span>
                          <span className={isLightCard ? "text-slate-700" : "text-slate-200"}>
                            RAM: <strong>{dev.memoryUsage}%</strong>
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-500 block mt-0.5">
                          Board Temp: {dev.temperatureC}°C • PSU:{" "}
                          {dev.psu1Status.toUpperCase()}/
                          {dev.psu2Status.toUpperCase()}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 font-mono">
                        <span className="text-emerald-500 font-semibold block">
                          RTT: {dev.latencyMs} ms (Loss {dev.packetLossPct}%)
                        </span>
                        <span className="text-[11px] text-sky-500">
                          Rx: {(dev.totalRxMbps / 1000).toFixed(2)} Gbps | Tx:{" "}
                          {(dev.totalTxMbps / 1000).toFixed(2)} Gbps
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={`${isLightCard ? "text-slate-700" : "text-slate-200"} block`}>
                          {dev.location}
                        </span>
                        <span className={`text-[11px] ${pageMuted} font-mono`}>
                          {dev.rackPosition}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedDeviceId(dev.id);
                              setActiveTab("graphs");
                            }}
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                              isLightCard
                                ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                                : "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border-indigo-500/30"
                            }`}
                          >
                            <BarChart3 className="w-3 h-3" />
                            Grafik
                          </button>

                          <button
                            onClick={() => handleLivePollDevice(dev)}
                            disabled={pollingDeviceId === dev.id}
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                              isLightCard
                                ? "bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200"
                                : "bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30"
                            }`}
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${
                                pollingDeviceId === dev.id ? "animate-spin" : ""
                              }`}
                            />
                            Live Ping
                          </button>

                          <button
                            onClick={() => handleDeleteDevice(dev.id, dev.name)}
                            className={`p-1.5 rounded-full border cursor-pointer ${
                              isLightCard
                                ? "bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border-slate-200"
                                : "bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border-slate-800"
                            }`}
                            title="Hapus Perangkat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================== TAB 6: BGP & UPSTREAM PEERS ===================== */}
        {activeTab === "bgp" && (
          <div className={`${pageCardCls} p-5 space-y-4`}>
            <div
              className={`flex flex-wrap items-center justify-between gap-2 pb-3 border-b ${
                isLightCard ? "border-slate-200" : "border-sky-500/20"
              }`}
            >
              <div>
                <h3 className={`text-base font-semibold ${pageHeading} flex items-center gap-2`}>
                  <Globe className="w-4 h-4 text-cyan-400" />
                  BGP Routing Sessions &amp; Upstream / IXP Peering Telemetry
                </h3>
                <p className={`text-xs ${pageMuted} mt-0.5`}>
                  Monitoring sesi BGP pada Juniper MX204, MikroTik CCR2116, dan Cisco ASR1001
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                {bgpPeers.length}/{bgpPeers.length} Sessions Established
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b text-[11px] uppercase tracking-wider ${pageMuted} ${
                      isLightCard ? "border-slate-200" : "border-sky-500/20"
                    }`}
                  >
                    <th className="py-2.5 px-3">Router Local</th>
                    <th className="py-2.5 px-3">Peer Name / Upstream</th>
                    <th className="py-2.5 px-3">Remote ASN &amp; IP</th>
                    <th className="py-2.5 px-3">Tipe Peer</th>
                    <th className="py-2.5 px-3">BGP State</th>
                    <th className="py-2.5 px-3">Prefixes (Rx / Tx)</th>
                    <th className="py-2.5 px-3">Traffic &amp; Latency</th>
                    <th className="py-2.5 px-3">Session Uptime</th>
                  </tr>
                </thead>
                <tbody
                  className={`divide-y text-xs font-mono ${
                    isLightCard ? "divide-slate-100" : "divide-sky-500/15"
                  }`}
                >
                  {bgpPeers.map((peer) => {
                    const isSelectedPeer = selectedBgpPeerId === peer.id;
                    return (
                      <tr
                        key={peer.id}
                        onClick={() =>
                          setSelectedBgpPeerId(isSelectedPeer ? null : peer.id)
                        }
                        className={`cursor-pointer transition ${
                          isSelectedPeer
                            ? isLightCard
                              ? "bg-sky-50"
                              : "bg-cyan-950/40"
                            : isLightCard
                            ? "hover:bg-slate-50"
                            : "hover:bg-sky-950/30"
                        }`}
                      >
                        <td className={`py-3 px-3 font-sans font-semibold ${pageHeading}`}>
                          {peer.deviceName}
                        </td>
                        <td className={`py-3 px-3 font-sans font-medium ${pageCyan}`}>
                          {peer.peerName}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`${pageHeading} font-bold`}>
                            AS{peer.remoteAs}
                          </span>
                          <span className={`block text-[11px] ${pageMuted}`}>
                            {peer.peerIp}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              isLightCard
                                ? "bg-slate-100 text-slate-700"
                                : "bg-slate-800 text-slate-200"
                            }`}
                          >
                            {peer.type}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[11px] font-semibold">
                            ● {peer.state}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-emerald-500">
                            {peer.prefixesReceived.toLocaleString()} Rx
                          </span>{" "}
                          /{" "}
                          <span className="text-sky-500">
                            {peer.prefixesAdvertised} Tx
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`${pageHeading} block`}>
                            &darr;{(peer.rxMbps / 1000).toFixed(2)}G &uarr;
                            {(peer.txMbps / 1000).toFixed(2)}G
                          </span>
                          <span className={`text-[11px] ${pageMuted}`}>
                            RTT: {peer.latencyMs} ms
                          </span>
                        </td>
                        <td className={`py-3 px-3 ${isLightCard ? "text-slate-600" : "text-slate-300"}`}>
                          {peer.uptime}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Show BGP Neighbor Detail Panel (SuperNOC-style) */}
            {(() => {
              const detailPeer =
                bgpPeers.find((p) => p.id === selectedBgpPeerId) || bgpPeers[0];
              if (!detailPeer) return null;
              const attachedFilters = routeFilters.filter(
                (f) => f.deviceId === detailPeer.deviceId
              );
              return (
                <div
                  className={`mt-4 rounded-2xl p-4 border space-y-3 ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200"
                      : "bg-[#040d1c] border-sky-500/25"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold">
                        Show BGP Neighbor Detail — {detailPeer.deviceName}
                      </span>
                      <h4 className={`text-sm font-bold ${pageHeading}`}>
                        {detailPeer.peerName} (AS{detailPeer.remoteAs} • {detailPeer.peerIp})
                      </h4>
                    </div>
                  </div>

                  <pre className="p-3 rounded-xl bg-[#020712] border border-sky-500/20 text-[11px] font-mono text-emerald-300 overflow-x-auto">
{`Peer: ${detailPeer.peerIp}+179 AS ${detailPeer.remoteAs}  Local: AS 138800
  Group: ${detailPeer.type.toUpperCase()}-PEERS    State: ${detailPeer.state}    Active-Time: ${detailPeer.uptime}
  Last State: OpenConfirm   Last Event: RecvKeepAlive   Holdtime: 90s
  Table inet.0: Prefixes Received: ${detailPeer.prefixesReceived.toLocaleString()} | Advertised: ${detailPeer.prefixesAdvertised}
  Route-Filters Active (${attachedFilters.length}): ${attachedFilters.map((f) => `${f.listName}[${f.prefix} -> ${f.action}]`).join(", ") || "DEFAULT-ACCEPT"}`}
                  </pre>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===================== TAB 7A: SUPERAI CHAT & DIAGNOSTIC ORCHESTRATOR ===================== */}
        {activeTab === "super_ai" && (
          <SuperAIChatView
            theme={theme}
            devices={devices}
            bgpPeers={bgpPeers}
            onus={onus}
            incidents={incidents}
            snapshots={configSnapshots}
            routeFilters={routeFilters}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={(devId) => setSelectedDeviceId(devId)}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* ===================== TAB 7B: CLOUD BACKUP VAULT ===================== */}
        {activeTab === "backup" && (
          <AutomationSafetyCenter
            theme={theme}
            initialSubTab="backup"
            backupOnly={true}
            devices={devices}
            bgpPeers={bgpPeers}
            onus={onus}
            incidents={incidents}
            snapshots={configSnapshots}
            routeFilters={routeFilters}
            autoBackupEnabled={autoBackupEnabled}
            currentUser={currentUser}
            onAction={handleAutomationAction}
            onNotify={showToast}
          />
        )}

        {/* ===================== TAB 8: AUDIT LOG FORENSIK & COMPLIANCE ===================== */}
        {activeTab === "audit_log" && (
          <AuditLogView
            theme={theme}
            auditLogs={auditLogs}
            onNotify={showToast}
          />
        )}

        {/* ===================== TAB 8B: ALERTING (TELEGRAM & WHATSAPP BOT API) ===================== */}
        {activeTab === "alerting" && (
          <AlertingCenter
            theme={theme}
            currentUser={currentUser}
            onNotify={showToast}
          />
        )}

        {/* ===================== TAB 9: TROUBLESHOOT & WEB TERMINAL DIAGNOSTICS ===================== */}
        {(activeTab === "troubleshoot" || activeTab === "diagnostics") && (
          <WebTerminalDiagnostics
            theme={theme}
            devices={devices}
            bgpPeers={bgpPeers}
          />
        )}

        {/* ===================== TAB 8: USER & HAK AKSES ROLE (RBAC) ===================== */}
        {activeTab === "users_rbac" && (
          <UserRoleManager
            theme={theme}
            currentUser={currentUser}
            onNotify={showToast}
          />
        )}
        </div>
      </div>

      {/* Add Multi-Vendor Device Modal */}
      <AddDeviceModal
        theme={theme}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddDevice={handleAddDevice}
      />
    </div>
  );
}
