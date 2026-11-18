"use client";

import React, { useState } from "react";
import {
  BgpPeer,
  IncidentAlert,
  NetworkDevice,
  OnuDevice,
  TrafficPoint,
} from "@/lib/types";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Globe,
  Layers,
  Radio,
  RefreshCw,
  Router,
  ShieldAlert,
  UserCheck,
} from "lucide-react";

export type BentoTheme = "dark" | "twilight" | "light";

interface BentoOverviewDashboardProps {
  theme: BentoTheme;
  devices: NetworkDevice[];
  onus: OnuDevice[];
  bgpPeers: BgpPeer[];
  incidents: IncidentAlert[];
  trafficHistory: TrafficPoint[];
  selectedDeviceId: string | null;
  pollingDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onLivePollDevice: (device: NetworkDevice) => void;
  onIncidentAction: (
    incidentId: string,
    action: "ack_incident" | "resolve_incident"
  ) => void;
  onNavigateTab: (
    tab:
      | "overview"
      | "graphs"
      | "olt_pon"
      | "topology"
      | "devices"
      | "bgp"
      | "diagnostics"
      | "users_rbac"
  ) => void;
}

export default function BentoOverviewDashboard({
  theme,
  devices,
  onus,
  bgpPeers,
  incidents,
  trafficHistory,
  selectedDeviceId,
  pollingDeviceId,
  onSelectDevice,
  onLivePollDevice,
  onIncidentAction,
  onNavigateTab,
}: BentoOverviewDashboardProps) {
  const [inflowFilter, setInflowFilter] = useState<"all" | "core" | "olt">(
    "all"
  );
  const [showRxCurve, setShowRxCurve] = useState(true);
  const [showTxCurve, setShowTxCurve] = useState(true);

  const isLightCard = theme === "light" || theme === "twilight";
  const cardCls = isLightCard
    ? "bento-card-light rounded-[26px] p-5 transition-all"
    : "bento-card-dark rounded-[26px] p-5 text-slate-100 transition-all";

  const mutedText = isLightCard ? "text-slate-500" : "text-slate-400";
  const headingText = isLightCard ? "text-slate-900" : "text-white";
  const subBg = isLightCard
    ? "bg-slate-100/90 border-slate-200/80"
    : "bg-[#051122]/80 border-sky-500/15";

  // Compute live NOC metrics
  const coreRouters = devices.filter((d) => d.role === "core_router");
  const switches = devices.filter(
    (d) => d.role === "dist_switch" || d.role === "access_switch"
  );
  const olts = devices.filter((d) => d.role === "olt");

  const totalRxMbps = devices.reduce((acc, d) => acc + d.totalRxMbps, 0);
  const totalTxMbps = devices.reduce((acc, d) => acc + d.totalTxMbps, 0);
  const totalFlowGbps = ((totalRxMbps + totalTxMbps) / 1000).toFixed(2);
  const coreRxGbps = (
    coreRouters.reduce((acc, d) => acc + d.totalRxMbps, 0) / 1000
  ).toFixed(2);

  const avgCpuLoad =
    devices.length > 0
      ? Math.round(devices.reduce((acc, d) => acc + d.cpuUsage, 0) / devices.length)
      : 0;
  const onlineDeviceCount = devices.filter((d) => d.status !== "offline").length;
  const slaPct =
    devices.length > 0
      ? ((onlineDeviceCount / devices.length) * 100).toFixed(1)
      : "0.0";

  const allPonPorts = olts.flatMap((o) => o.ponPorts || []);
  const totalOnu = allPonPorts.reduce((a, p) => a + p.totalOnu, 0);
  const onlineOnu = allPonPorts.reduce((a, p) => a + p.onlineOnu, 0);
  const losOnu = allPonPorts.reduce((a, p) => a + p.losOnu, 0);
  const dyingGaspOnu = allPonPorts.reduce((a, p) => a + p.dyingGaspOnu, 0);
  const highAttenOnu = onus.filter(
    (o) => o.status === "online" && o.rxPowerDbm <= -24.0
  ).length;
  const onuOnlinePct =
    totalOnu > 0
      ? Math.min(100, Math.round((onlineOnu / totalOnu) * 100))
      : 0;

  const totalBwMbps = totalRxMbps + totalTxMbps;
  const rxSharePct = totalBwMbps > 0 ? Math.round((totalRxMbps / totalBwMbps) * 100) : 0;
  const txSharePct = totalBwMbps > 0 ? 100 - rxSharePct : 0;

  const selectedDevice =
    devices.find((d) => d.id === selectedDeviceId) || devices[0];

  // Prepare 12 bars for the Center Top "Inflow" Bar Chart
  const barSourceDevices =
    inflowFilter === "core"
      ? coreRouters
      : inflowFilter === "olt"
      ? olts
      : devices;

  const barItems = barSourceDevices.slice(0, 12).map((dev, idx) => {
    const gbps = Number((dev.totalRxMbps / 1000).toFixed(2));
    const isHighlighted = dev.id === selectedDeviceId || (selectedDeviceId === null && idx === 0);
    return {
      idx,
      label: dev.name.split("-").slice(-1)[0].slice(0, 5).toUpperCase(),
      gbps,
      isHighlighted,
      deviceId: dev.id,
      fullName: dev.name,
    };
  });

  const maxBarGbps = Math.max(1, ...barItems.map((b) => b.gbps * 1.15));

  // Vendor Traffic Share for Right Bottom Donut (computed from live devices)
  const vendorColors = ["#0ea5e9", "#22d3ee", "#38bdf8", "#0284c7", "#64748b"];
  const vendorTotals = new Map<string, number>();
  for (const d of devices) {
    const bw = d.totalRxMbps + d.totalTxMbps;
    vendorTotals.set(d.vendor, (vendorTotals.get(d.vendor) || 0) + bw);
  }
  const totalVendorBw = Array.from(vendorTotals.values()).reduce((a, b) => a + b, 0);
  const vendorStats = Array.from(vendorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, mbps], i) => ({
      name,
      color: vendorColors[i % vendorColors.length],
      pct: totalVendorBw > 0 ? Math.round((mbps / totalVendorBw) * 100) : 0,
      traffic: `${(mbps / 1000).toFixed(2)}G`,
    }));

  const activeIncidents = incidents.filter((i) => !i.resolved);

  return (
    <div className="space-y-6">
      {/* MAIN BENTO GRID MATCHING THE UPLOADED REFERENCE DESIGN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* ================= LEFT COLUMN (3 COLS): HERO FLOW CARD + SLA GOALS ================= */}
        <div
          className={`lg:col-span-3 rounded-[28px] p-2.5 flex flex-col justify-between gap-3 ${
            isLightCard
              ? "bg-white border border-slate-200/90 shadow-lg"
              : "bg-[#051428]/90 border border-cyan-500/20 shadow-2xl"
          }`}
        >
          {/* Upper Dark Navy Gradient Hero Card (Always Dark Navy like Reference Image!) */}
          <div className="bento-hero-card rounded-[22px] p-5 flex flex-col justify-between relative overflow-hidden">
            {/* Ambient radial glow */}
            <div
              className="pointer-events-none absolute -right-10 -bottom-10 w-44 h-44 rounded-full opacity-35"
              style={{
                background:
                  "radial-gradient(circle, #22d3ee 0%, transparent 70%)",
              }}
            />

            {/* Top Balance / Throughput Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-sky-200/80">
                  Core Rx
                </span>
                <span className="text-2xl font-extrabold tracking-tight text-white">
                  {coreRxGbps} Gbps
                </span>
              </div>
              <button
                onClick={() => onNavigateTab("users_rbac")}
                className="w-8 h-8 rounded-xl bg-sky-400/20 border border-sky-300/30 flex items-center justify-center text-sky-200 hover:bg-sky-400/30 transition cursor-pointer"
                title="Profil & Hak Akses Engineer"
              >
                <UserCheck className="w-4 h-4" />
              </button>
            </div>

            {/* Middle Chip + Circular Radial Gauge */}
            <div className="flex items-center justify-between mt-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-4 rounded bg-gradient-to-r from-cyan-300 to-sky-400 inline-block opacity-90" />
                  <span className="text-[11px] font-mono tracking-widest text-sky-200/75">
                    •••• •••• 10.1
                  </span>
                </div>
                <p className="text-xl font-extrabold text-white mt-2.5 tracking-tight">
                  {(totalRxMbps / 1000).toFixed(2)} Gbps
                </p>
                <span className="text-[11px] text-sky-200/70">
                  Total Aggregate Flow
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-sky-200/80">CPU Load</span>
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.2)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="3"
                      strokeDasharray={`${(avgCpuLoad / 100) * 88} 88`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-[11px] font-bold text-white font-mono">
                    {avgCpuLoad}%
                  </span>
                </div>
              </div>
            </div>

            {/* Smooth Glowing Spline Wave inside Hero Card */}
            <div className="mt-3 h-20 -mx-2">
              <svg viewBox="0 0 260 75" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="heroWaveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.42" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 5 55 Q 45 25, 85 42 T 165 26 T 255 36 L 255 72 L 5 72 Z"
                  fill="url(#heroWaveGrad)"
                />
                <path
                  d="M 5 60 Q 50 48, 95 36 T 185 45 T 255 24"
                  fill="none"
                  stroke="rgba(125, 211, 252, 0.35)"
                  strokeWidth="1.5"
                />
                <path
                  d="M 5 55 Q 45 25, 85 42 T 165 26 T 255 36"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.4"
                />
                <circle
                  cx="165"
                  cy="26"
                  r="4"
                  fill="#082f49"
                  stroke="#22d3ee"
                  strokeWidth="2.2"
                />
                <circle
                  cx="215"
                  cy="31"
                  r="4"
                  fill="#082f49"
                  stroke="#22d3ee"
                  strokeWidth="2.2"
                />
              </svg>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-sky-200/80">
                Core RX{" "}
                <strong className="text-cyan-300 font-mono">{coreRxGbps}G</strong>
              </span>
              <span className="text-emerald-300 font-mono">SLA {slaPct}%</span>
            </div>
          </div>

          {/* Lower Goals / SLA Subsystem Progress List */}
          <div className="px-3 pb-3 pt-1 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`font-bold ${headingText}`}>SLA &amp; Goals</span>
                <span className="font-mono text-xs text-cyan-500 font-bold">
                  {onlineOnu} / {totalOnu} ONUs
                </span>
                <span className={`font-extrabold ${headingText}`}>
                  {onuOnlinePct}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-700/25 overflow-hidden mb-3">
                <div
                  style={{ width: `${onuOnlinePct}%` }}
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              {(() => {
                const coreOnline = coreRouters.filter((d) => d.status !== "offline").length;
                const swOnline = switches.filter((d) => d.status !== "offline").length;
                const bgpUp = bgpPeers.filter((p) => p.state === "Established").length;
                return [
                  {
                    label: "Core Router",
                    val: `${coreOnline} / ${coreRouters.length} (${coreRxGbps}G)`,
                    pct: coreRouters.length > 0 ? Math.round((coreOnline / coreRouters.length) * 100) : 0,
                    icon: Router,
                  },
                  {
                    label: "Dist Switch",
                    val: `${swOnline} / ${switches.length} Active`,
                    pct: switches.length > 0 ? Math.round((swOnline / switches.length) * 100) : 0,
                    icon: Layers,
                  },
                  {
                    label: "OLT PON",
                    val: `${onlineOnu} / ${totalOnu} ONT`,
                    pct: onuOnlinePct,
                    icon: Radio,
                  },
                  {
                    label: "BGP Peers",
                    val: `${bgpUp} / ${bgpPeers.length} Up`,
                    pct: bgpPeers.length > 0 ? Math.round((bgpUp / bgpPeers.length) * 100) : 0,
                    icon: Globe,
                  },
                ];
              })().map((g) => {
                const Icon = g.icon;
                return (
                  <div key={g.label} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className={`font-semibold truncate ${headingText}`}>
                          {g.label}
                        </span>
                        <span className={`font-mono text-[10px] ${mutedText}`}>
                          {g.val}
                        </span>
                        <span className={`font-bold font-mono ${headingText}`}>
                          {g.pct}%
                        </span>
                      </div>
                      <div className="w-full h-1 bg-slate-500/20 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${g.pct}%` }}
                          className="h-full bg-gradient-to-r from-sky-400 to-cyan-400 rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================= CENTER COLUMN (6 COLS): INFLOW BAR CHART + DONUT BUDGET CARD ================= */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-5">
          {/* Top-Center: Rounded Vertical Bar Chart Card ("Inflow Traffic") */}
          <div className={`${cardCls} flex-1 flex flex-col justify-between`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-base font-bold ${headingText}`}>
                Inflow Traffic
              </h3>

              {/* Center Pill Filter Tabs */}
              <div
                className={`flex items-center gap-1 p-1 rounded-full border text-xs ${subBg}`}
              >
                {[
                  { id: "core", label: "Core" },
                  { id: "olt", label: "OLT PON" },
                  { id: "all", label: "Inflow" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      setInflowFilter(tab.id as "all" | "core" | "olt")
                    }
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${
                      inflowFilter === tab.id
                        ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-sm"
                        : `${mutedText} hover:opacity-80`
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className={`text-base font-extrabold font-mono ${headingText}`}>
                {totalFlowGbps} Gbps
              </span>
            </div>

            {/* 12 Vertical Rounded Bars with Glowing Cyan Active Bars */}
            <div className="mt-5 pt-4 relative">
              {/* Horizontal subtle dashed grid lines */}
              <div className="absolute inset-x-7 top-2 bottom-7 flex flex-col justify-between pointer-events-none">
                {["10G", "8G", "6G", "4G", "2G"].map((lvl) => (
                  <div key={lvl} className="flex items-center gap-2 w-full">
                    <span className={`text-[10px] font-mono w-6 ${mutedText}`}>
                      {lvl}
                    </span>
                    <div
                      className={`flex-1 border-b border-dashed ${
                        isLightCard ? "border-slate-200" : "border-sky-500/15"
                      }`}
                    />
                  </div>
                ))}
              </div>

              <div className="relative z-10 pl-8 grid grid-cols-12 gap-2 items-end h-44">
                {barItems.map((bar) => {
                  const heightPct = Math.max(
                    18,
                    Math.min(96, Math.round((bar.gbps / maxBarGbps) * 100))
                  );
                  return (
                    <div
                      key={bar.idx}
                      onClick={() => onSelectDevice(bar.deviceId)}
                      title={`${bar.fullName}: ${bar.gbps} Gbps (Klik untuk inspeksi)`}
                      className="flex flex-col items-center justify-end h-full group cursor-pointer"
                    >
                      {/* Floating metric label above highlighted bars */}
                      <span
                        className={`text-[10px] font-mono font-bold mb-1 transition ${
                          bar.isHighlighted
                            ? isLightCard
                              ? "text-sky-600 opacity-100"
                              : "text-cyan-300 opacity-100"
                            : "opacity-0 group-hover:opacity-100 text-cyan-400"
                        }`}
                      >
                        {bar.gbps}G
                      </span>

                      {/* Rounded Vertical Bar */}
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full max-w-[22px] rounded-t-xl rounded-b-lg transition-all duration-300 ${
                          bar.isHighlighted
                            ? "bg-gradient-to-t from-sky-500 via-cyan-400 to-teal-300 shadow-lg shadow-cyan-500/35"
                            : isLightCard
                            ? "bg-slate-600/85 group-hover:bg-sky-500"
                            : "bg-slate-700/65 group-hover:bg-cyan-400/75"
                        }`}
                      />

                      {/* Bottom Pill Label */}
                      <span
                        className={`mt-2 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition ${
                          bar.isHighlighted
                            ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow"
                            : mutedText
                        }`}
                      >
                        {bar.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Middle-Center: Optical Budget & ONU Donut + Inflow/Outflow Card */}
          <div className={`${cardCls}`}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Left Donut Chart */}
              <div className="md:col-span-4 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${headingText}`}>
                    ONU Status
                  </span>
                </div>
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="13.5"
                      fill="none"
                      stroke={isLightCard ? "#e2e8f0" : "#0f2942"}
                      strokeWidth="5"
                    />
                    {/* Online segment */}
                    <circle
                      cx="18"
                      cy="18"
                      r="13.5"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="5"
                      strokeDasharray={`${(onuOnlinePct / 100) * 84.8} 84.8`}
                    />
                    {/* Highlight arc */}
                    <circle
                      cx="18"
                      cy="18"
                      r="13.5"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="5"
                      strokeDasharray="24 84.8"
                      strokeDashoffset="-12"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span
                      className={`text-base font-extrabold font-mono block ${headingText}`}
                    >
                      {onlineOnu}
                    </span>
                    <span className={`text-[10px] ${mutedText}`}>
                      Active ONT
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Inflow / Outflow + 4 Bullet Rows + Summary Box */}
              <div className="md:col-span-8 space-y-3">
                {/* Download / Upload Bars */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 text-xs">
                    <ArrowDownCircle className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className={`w-14 font-medium ${mutedText}`}>
                      Inflow
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-500/20 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${rxSharePct}%` }}
                        className="h-full bg-gradient-to-r from-cyan-400 to-sky-500 rounded-full"
                      />
                    </div>
                    <span className={`font-mono font-bold w-9 text-right ${headingText}`}>
                      {rxSharePct}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-xs">
                    <ArrowUpCircle className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className={`w-14 font-medium ${mutedText}`}>
                      Outflow
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-500/20 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${txSharePct}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                      />
                    </div>
                    <span className={`font-mono font-bold w-9 text-right ${headingText}`}>
                      {txSharePct}%
                    </span>
                  </div>
                </div>

                {/* 4 Bullet Rows + Right Balance Pill */}
                <div className="grid grid-cols-12 gap-3 items-center pt-1">
                  <div className="col-span-7 space-y-1.5 text-[11px]">
                    {[
                      {
                        label: "Online Optimal",
                        pct: `${onuOnlinePct}%`,
                        val: `${onlineOnu} ONU`,
                        dot: "bg-cyan-400",
                      },
                      {
                        label: "High Atten",
                        pct: `${totalOnu > 0 ? Math.round((highAttenOnu / totalOnu) * 100) : 0}%`,
                        val: `${highAttenOnu} ONU`,
                        dot: "bg-sky-400",
                      },
                      {
                        label: "DyingGasp",
                        pct: `${totalOnu > 0 ? Math.round((dyingGaspOnu / totalOnu) * 100) : 0}%`,
                        val: `${dyingGaspOnu} ONU`,
                        dot: "bg-amber-400",
                      },
                      {
                        label: "LOS (Putus)",
                        pct: `${totalOnu > 0 ? Math.round((losOnu / totalOnu) * 100) : 0}%`,
                        val: `${losOnu} ONU`,
                        dot: "bg-rose-500",
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${row.dot}`}
                          />
                          <span className={mutedText}>{row.label}</span>
                        </span>
                        <span className={`font-mono ${mutedText}`}>
                          {row.pct}
                        </span>
                        <span className={`font-mono font-semibold ${headingText}`}>
                          {row.val}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
                    onClick={() => onNavigateTab("olt_pon")}
                    className={`col-span-5 rounded-2xl p-3 text-center border cursor-pointer hover:scale-[1.02] transition ${subBg}`}
                  >
                    <span
                      className={`text-lg font-extrabold font-mono block ${headingText}`}
                    >
                      {devices.length} Unit
                    </span>
                    <span className={`text-[11px] ${mutedText}`}>
                      Active Fleet
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN (3 COLS): RADAR PENTAGON CHART + VENDOR DONUT ================= */}
        <div className="lg:col-span-3 flex flex-col justify-between gap-5">
          {/* Top-Right: 5-Axis Pentagon Radar Chart ("Structure / Health") */}
          <div className={`${cardCls}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-sm font-bold ${headingText}`}>
                  Structure
                </h3>
                <span className={`text-xs ${mutedText}`}>Health Matrix</span>
              </div>
              <span className="text-xs font-mono text-cyan-400 font-bold">
                96.4%
              </span>
            </div>

            <div className="mt-2 flex items-center justify-center">
              <svg viewBox="0 0 220 175" className="w-full h-44 overflow-visible">
                {/* Outer & Inner Pentagon Grids */}
                {[62, 46, 30, 15].map((r, idx) => {
                  const pts = [0, 1, 2, 3, 4]
                    .map((i) => {
                      const angle = ((i * 72 - 90) * Math.PI) / 180;
                      return `${110 + r * Math.cos(angle)},${
                        92 + r * Math.sin(angle)
                      }`;
                    })
                    .join(" ");
                  return (
                    <polygon
                      key={idx}
                      points={pts}
                      fill="none"
                      stroke={
                        isLightCard
                          ? "rgba(148, 163, 184, 0.35)"
                          : "rgba(56, 189, 248, 0.2)"
                      }
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Axis spokes */}
                {[0, 1, 2, 3, 4].map((i) => {
                  const angle = ((i * 72 - 90) * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1="110"
                      y1="92"
                      x2={110 + 62 * Math.cos(angle)}
                      y2={92 + 62 * Math.sin(angle)}
                      stroke={
                        isLightCard
                          ? "rgba(148, 163, 184, 0.3)"
                          : "rgba(56, 189, 248, 0.18)"
                      }
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Data Polygon (computed from live telemetry) */}
                {(() => {
                  const bgpUp = bgpPeers.filter((p) => p.state === "Established").length;
                  const bgpScore = bgpPeers.length > 0 ? bgpUp / bgpPeers.length : devices.length > 0 ? 0.5 : 0;
                  const ponScore = totalOnu > 0 ? onlineOnu / totalOnu : devices.length > 0 ? 0.5 : 0;
                  const cpuScore = devices.length > 0 ? Math.max(0.1, 1 - avgCpuLoad / 100) : 0;
                  const avgLat =
                    devices.length > 0
                      ? devices.reduce((a, d) => a + d.latencyMs, 0) / devices.length
                      : 0;
                  const latScore = devices.length > 0 ? Math.max(0.1, 1 - Math.min(avgLat, 100) / 100) : 0;
                  const upScore = devices.length > 0 ? onlineDeviceCount / devices.length : 0;
                  const scores = [bgpScore, ponScore, cpuScore, latScore, upScore];
                  const coords = scores.map((s, i) => {
                    const angle = ((i * 72 - 90) * Math.PI) / 180;
                    const r = s * 60;
                    return {
                      x: 110 + r * Math.cos(angle),
                      y: 92 + r * Math.sin(angle),
                    };
                  });
                  const polyPoints = coords
                    .map((c) => `${c.x},${c.y}`)
                    .join(" ");

                  return (
                    <>
                      <polygon
                        points={polyPoints}
                        fill="rgba(34, 211, 238, 0.28)"
                        stroke="#22d3ee"
                        strokeWidth="2"
                      />
                      {coords.map((c, idx) => (
                        <circle
                          key={idx}
                          cx={c.x}
                          cy={c.y}
                          r="3.2"
                          fill="#22d3ee"
                        />
                      ))}
                    </>
                  );
                })()}

                {/* 5 Vertex Labels */}
                <text
                  x="110"
                  y="19"
                  textAnchor="middle"
                  fill={isLightCard ? "#475569" : "#94a3b8"}
                  fontSize="9.5"
                >
                  Core BGP
                </text>
                <text
                  x="178"
                  y="72"
                  textAnchor="start"
                  fill={isLightCard ? "#475569" : "#94a3b8"}
                  fontSize="9.5"
                >
                  Switch
                </text>
                <text
                  x="156"
                  y="158"
                  textAnchor="middle"
                  fill={isLightCard ? "#475569" : "#94a3b8"}
                  fontSize="9.5"
                >
                  OLT PON
                </text>
                <text
                  x="64"
                  y="158"
                  textAnchor="middle"
                  fill={isLightCard ? "#475569" : "#94a3b8"}
                  fontSize="9.5"
                >
                  Optical dBm
                </text>
                <text
                  x="42"
                  y="72"
                  textAnchor="end"
                  fill={isLightCard ? "#475569" : "#94a3b8"}
                  fontSize="9.5"
                >
                  Uptime
                </text>
              </svg>
            </div>
          </div>

          {/* Bottom-Right: Multi-Vendor Traffic Share Donut + List ("Costs / Vendor Share") */}
          <div className={`${cardCls} flex-1 flex flex-col justify-between`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold ${headingText}`}>
                Vendor Share
              </h3>
              <span className={`text-xs font-mono ${mutedText}`}>
                All Brands
              </span>
            </div>

            <div className="my-3 flex items-center justify-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg viewBox="0 0 36 36" className="w-36 h-36 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="13.5"
                    fill="none"
                    stroke={isLightCard ? "#e2e8f0" : "#1e293b"}
                    strokeWidth="5.2"
                  />
                  {(() => {
                    const circumference = 2 * Math.PI * 13.5;
                    let offset = 0;
                    return vendorStats.map((v) => {
                      const segLen = (v.pct / 100) * circumference;
                      const currentOffset = -offset;
                      offset += segLen;
                      return (
                        <circle
                          key={v.name}
                          cx="18"
                          cy="18"
                          r="13.5"
                          fill="none"
                          stroke={v.color}
                          strokeWidth="5.2"
                          strokeDasharray={`${segLen.toFixed(2)} ${circumference.toFixed(2)}`}
                          strokeDashoffset={currentOffset.toFixed(2)}
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute text-center">
                  <span
                    className={`text-base font-extrabold font-mono block ${headingText}`}
                  >
                    {totalFlowGbps}G
                  </span>
                  <span className={`text-[10px] ${mutedText}`}>Total Load</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px]">
              {vendorStats.length === 0 ? (
                <p className={`text-center text-xs py-2 ${mutedText}`}>
                  Belum ada perangkat terdaftar.
                </p>
              ) : (
                vendorStats.map((v) => (
                  <div
                    key={v.name}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: v.color }}
                      />
                      <span className={mutedText}>{v.name}</span>
                    </span>
                    <span className={`font-mono ${mutedText}`}>{v.pct}%</span>
                    <span className={`font-mono font-semibold ${headingText}`}>
                      {v.traffic}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= BOTTOM ROW OF BENTO GRID: COMPARE SPLINE WAVE + TIER PLANS ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Bottom-Left (6 Cols): Compare Traffic & Optical Spline Wave Card with Toggles */}
        <div
          className={`lg:col-span-6 rounded-[26px] p-5 ${
            theme === "twilight"
              ? "bento-hero-card"
              : cardCls
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h3
                className={`text-sm font-bold ${
                  theme === "twilight" ? "text-white" : headingText
                }`}
              >
                Compare Flow
              </h3>
              <span className="text-sm font-mono font-bold text-cyan-400">
                {coreRxGbps} Gbps
              </span>
            </div>

            {/* Interactive Toggle Pills matching the Reference Image */}
            <div className="flex items-center gap-4 text-xs">
              <button
                type="button"
                onClick={() => setShowRxCurve(!showRxCurve)}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <span
                  className={
                    theme === "twilight" ? "text-slate-300" : mutedText
                  }
                >
                  Download
                </span>
                <span
                  className={`w-8 h-4 rounded-full p-0.5 flex items-center transition ${
                    showRxCurve
                      ? "bg-cyan-400 justify-end"
                      : "bg-slate-600 justify-start"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-slate-950" />
                </span>
              </button>

              <span className="font-mono text-xs text-sky-400">
                {(totalTxMbps / 1000).toFixed(2)} Gbps
              </span>

              <button
                type="button"
                onClick={() => setShowTxCurve(!showTxCurve)}
                className="flex items-center gap-1.5 cursor-pointer"
              >
                <span
                  className={
                    theme === "twilight" ? "text-slate-300" : mutedText
                  }
                >
                  Upload
                </span>
                <span
                  className={`w-8 h-4 rounded-full p-0.5 flex items-center transition ${
                    showTxCurve
                      ? "bg-teal-400 justify-end"
                      : "bg-slate-600 justify-start"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-slate-950" />
                </span>
              </button>
            </div>
          </div>

          {/* Smooth Dual Spline Chart with Highlighted Mid-Axis Pills */}
          <div className="mt-3 h-36">
            <svg viewBox="0 0 540 120" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="cmpWave" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[22, 52, 82].map((y) => (
                <line
                  key={y}
                  x1="10"
                  y1={y}
                  x2="530"
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.15)"
                  strokeDasharray="3 3"
                />
              ))}

              {/* Vertical guide lines on highlighted intervals */}
              {[245, 290, 335].map((x) => (
                <line
                  key={x}
                  x1={x}
                  y1="18"
                  x2={x}
                  y2="96"
                  stroke="rgba(34, 211, 238, 0.35)"
                  strokeDasharray="2 2"
                />
              ))}

              {(() => {
                const pts = trafficHistory.slice(-14);
                if (pts.length < 2) {
                  return (
                    <line
                      x1="15"
                      y1="92"
                      x2="525"
                      y2="92"
                      stroke="rgba(34, 211, 238, 0.35)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  );
                }
                const maxVal = Math.max(
                  0.5,
                  ...pts.map((p) => Math.max(p.totalDownloadGbps, p.totalUploadGbps))
                );
                const toCoords = (vals: number[]) =>
                  vals.map((v, idx) => {
                    const x = 15 + (idx / Math.max(pts.length - 1, 1)) * 510;
                    const y = 92 - Math.min(74, (v / maxVal) * 70);
                    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
                  });
                const rxCoords = toCoords(pts.map((p) => p.totalDownloadGbps));
                const txCoords = toCoords(pts.map((p) => p.totalUploadGbps));
                const rxLine = rxCoords.map((c) => `${c.x},${c.y}`).join(" ");
                const txLine = txCoords.map((c) => `${c.x},${c.y}`).join(" ");
                const rxArea = `15,96 ${rxLine} 525,96`;

                return (
                  <>
                    {showRxCurve && (
                      <>
                        <polygon points={rxArea} fill="url(#cmpWave)" />
                        <polyline
                          points={rxLine}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth="2.4"
                        />
                      </>
                    )}
                    {showTxCurve && (
                      <polyline
                        points={txLine}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                      />
                    )}
                    {rxCoords.slice(-3).map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r="4"
                        fill="#082f49"
                        stroke="#22d3ee"
                        strokeWidth="2"
                      />
                    ))}
                  </>
                );
              })()}

              {/* X-Axis Labels with 3 Highlighted Cyan Pills */}
              {[
                "10:00",
                "11:00",
                "12:00",
                "13:00",
                "14:00",
                "15:00",
                "16:00",
                "17:00",
                "18:00",
                "19:00",
                "20:00",
                "NOW",
              ].map((lbl, idx) => {
                const x = 20 + idx * 45.5;
                const isPeak = idx === 5 || idx === 6 || idx === 7;
                return (
                  <g key={lbl} transform={`translate(${x}, 108)`}>
                    {isPeak && (
                      <rect
                        x="-18"
                        y="-9"
                        width="36"
                        height="13"
                        rx="6"
                        fill="#06b6d4"
                      />
                    )}
                    <text
                      x="0"
                      y="0"
                      textAnchor="middle"
                      fill={
                        isPeak
                          ? "#020617"
                          : isLightCard && theme !== "twilight"
                          ? "#64748b"
                          : "#94a3b8"
                      }
                      fontSize="8.5"
                      fontWeight={isPeak ? "700" : "500"}
                      fontFamily="monospace"
                    >
                      {lbl}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Bottom-Center (3 Cols): Grouped Tier Bars ("Tier Capacity") */}
        <div
          className={`lg:col-span-3 rounded-[26px] p-5 flex flex-col justify-between ${
            theme === "twilight" ? "bento-hero-card" : cardCls
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3
                className={`text-sm font-bold ${
                  theme === "twilight" ? "text-white" : headingText
                }`}
              >
                Tier Capacity
              </h3>
              <div className="flex items-center gap-3 mt-1 text-[10px] font-mono">
                <span
                  className={`inline-flex items-center gap-1 ${
                    theme === "twilight" ? "text-slate-300" : mutedText
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  RX
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    theme === "twilight" ? "text-slate-300" : mutedText
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  TX
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab("graphs")}
              className="text-[11px] text-cyan-400 hover:underline font-mono cursor-pointer shrink-0"
            >
              Detail Grafik &rarr;
            </button>
          </div>

          {(() => {
            const tiers = [
              { label: "CORE", list: coreRouters, capGbps: 40 },
              { label: "SWITCH", list: switches, capGbps: 40 },
              { label: "OLT PON", list: olts, capGbps: 20 },
            ].map((t) => {
              const rxMbps = t.list.reduce((a, d) => a + d.totalRxMbps, 0);
              const txMbps = t.list.reduce((a, d) => a + d.totalTxMbps, 0);
              const capMbps = Math.max(t.capGbps * 1000, rxMbps, txMbps, 1000);
              const h1 = rxMbps > 0 ? Math.max(8, Math.min(100, Math.round((rxMbps / capMbps) * 100))) : 0;
              const h2 = txMbps > 0 ? Math.max(8, Math.min(100, Math.round((txMbps / capMbps) * 100))) : 0;
              const totalG = ((rxMbps + txMbps) / 1000).toFixed(1);
              return {
                label: t.label,
                h1,
                h2,
                tag: `${totalG}G`,
                tooltip: `${t.label} (${t.list.length} node): RX ${(rxMbps / 1000).toFixed(2)} Gbps | TX ${(txMbps / 1000).toFixed(2)} Gbps`,
              };
            });

            return (
              <div className="mt-3">
                <div
                  className={`grid grid-cols-3 gap-3 items-end h-28 px-2 pb-1 border-b ${
                    theme === "twilight" || !isLightCard
                      ? "border-slate-700/60"
                      : "border-slate-200"
                  }`}
                >
                  {tiers.map((tier) => (
                    <div
                      key={tier.label}
                      title={tier.tooltip}
                      className="flex flex-col items-center justify-end h-full group"
                    >
                      <span
                        className={`text-[10px] font-mono font-bold mb-1.5 px-1.5 py-0.5 rounded-md ${
                          theme === "twilight" || !isLightCard
                            ? "bg-cyan-500/10 text-cyan-300"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {tier.tag}
                      </span>
                      <div className="flex items-end gap-1.5 h-16 w-full justify-center">
                        <div
                          style={{ height: `${tier.h1}%` }}
                          className="w-3.5 rounded-t-md bg-gradient-to-t from-cyan-500 to-teal-300 shadow-sm transition-all group-hover:brightness-110"
                        />
                        <div
                          style={{ height: `${tier.h2}%` }}
                          className="w-3.5 rounded-t-md bg-gradient-to-t from-blue-600 to-sky-400 shadow-sm transition-all group-hover:brightness-110"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 px-2 pt-2 text-center">
                  {tiers.map((tier) => (
                    <span
                      key={tier.label}
                      className={`text-[10px] font-mono font-bold tracking-wide ${
                        theme === "twilight" ? "text-slate-200" : mutedText
                      }`}
                    >
                      {tier.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Bottom-Right (3 Cols): Quick Root-Cause Alarm & Port Inspector Bento Card */}
        <div className={`lg:col-span-3 ${cardCls} flex flex-col justify-between`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold flex items-center gap-1.5 ${headingText}`}>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Active NOC Alarms
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              {activeIncidents.length} Open
            </span>
          </div>

          <div className="my-2 space-y-2 max-h-28 overflow-y-auto pr-1">
            {activeIncidents.slice(0, 2).map((inc) => (
              <div
                key={inc.id}
                className={`p-2.5 rounded-xl border text-[11px] ${subBg}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-400 truncate">
                    {inc.deviceName}
                  </span>
                  <button
                    onClick={() => onIncidentAction(inc.id, "resolve_incident")}
                    className="text-[10px] text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Resolve
                  </button>
                </div>
                <p className={`truncate mt-0.5 ${mutedText}`}>{inc.title}</p>
              </div>
            ))}
          </div>

          {selectedDevice && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-500/20 text-[11px]">
              <span className={`font-mono truncate ${mutedText}`}>
                Focus: <strong className={headingText}>{selectedDevice.name}</strong>
              </span>
              <button
                onClick={() => onLivePollDevice(selectedDevice)}
                disabled={pollingDeviceId === selectedDevice.id}
                className="px-2.5 py-1 rounded-full bg-cyan-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3 h-3 ${
                    pollingDeviceId === selectedDevice.id ? "animate-spin" : ""
                  }`}
                />
                Ping
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

