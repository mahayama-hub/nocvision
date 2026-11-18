"use client";

import React from "react";
import { BgpPeer, NetworkDevice, TopologyLink } from "@/lib/types";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Network,
  Radio,
} from "lucide-react";

import type { BentoTheme } from "./BentoOverviewDashboard";

interface TopologyMapProps {
  theme?: BentoTheme;
  devices: NetworkDevice[];
  links: TopologyLink[];
  selectedDeviceId: string | null;
  onSelectDevice: (device: NetworkDevice) => void;
  bgpPeers?: BgpPeer[];
}

export default function TopologyMap({
  theme = "dark",
  devices,
  links,
  selectedDeviceId,
  onSelectDevice,
  bgpPeers = [],
}: TopologyMapProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const cardCls = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px]";
  const subBoxCls = isLightCard
    ? "bg-slate-50 border border-slate-200/90"
    : "bg-[#051122]/85 border border-sky-500/20";
  const headingText = isLightCard ? "text-slate-900" : "text-white";
  const mutedText = isLightCard ? "text-slate-500" : "text-slate-400";
  const cyanNum = isLightCard ? "text-sky-600" : "text-cyan-300";
  // Auto-label upstream dari sesi BGP yang Established (bukan hardcode)
  const AS_PROVIDER: Record<number, string> = {
    17451: "BIZNET",
    7713: "TELIN",
    4761: "INDOSAT",
    4800: "INDOSAT",
    24203: "ICON+",
    58453: "CMI",
    6939: "HE",
    13335: "CLOUDFLARE",
    2914: "NTT",
    3491: "PCCW",
  };
  const upstreamProviders = Array.from(
    new Set(
      bgpPeers
        .filter((p) => p.state === "Established")
        .map((p) => {
          const name = AS_PROVIDER[p.remoteAs];
          return name ? name + " (AS" + p.remoteAs + ")" : "AS" + p.remoteAs;
        })
    )
  );
  const upstreamLabel =
    upstreamProviders.length > 0
      ? "UPSTREAM — " + upstreamProviders.join(" / ")
      : "UPSTREAM";

  const coreRouters = devices.filter((d) => d.role === "core_router");
  const switches = devices.filter(
    (d) => d.role === "dist_switch" || d.role === "access_switch" || d.role === "firewall"
  );
  const olts = devices.filter((d) => d.role === "olt" || d.role === "wireless");

  // Compute deterministic coordinates by tier so any newly added device also renders cleanly
  const nodePositions = new Map<string, { x: number; y: number }>();

  const placeTier = (tierDevices: NetworkDevice[], y: number) => {
    const count = tierDevices.length;
    tierDevices.forEach((dev, idx) => {
      const spacing = 920 / (count + 1);
      nodePositions.set(dev.id, {
        x: Math.round(spacing * (idx + 1)) + 40,
        y,
      });
    });
  };

  placeTier(coreRouters, 115);
  placeTier(switches, 265);
  placeTier(olts, 425);

  const selectedDevice =
    devices.find((d) => d.id === selectedDeviceId) || devices[0] || null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Main Interactive SVG Canvas */}
      <div className={`xl:col-span-8 ${cardCls} p-5 flex flex-col`}>
        <div
          className={`flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b ${
            isLightCard ? "border-slate-200" : "border-sky-500/20"
          }`}
        >
          <div>
            <h3 className={`text-base font-semibold ${headingText} flex items-center gap-2`}>
              <Network className="w-4 h-4 text-cyan-400" />
              Peta Topologi Hirarki Multi-Vendor (Core &rarr; Distribution &rarr; OLT FTTH)
            </h3>
            <p className={`text-xs ${mutedText} mt-0.5`}>
              Klik pada perangkat untuk inspeksi port SFP/PON, utilisasi link, dan status redaman optik
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              Link Optimal
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Degraded / PON Alarm
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Link Down / LOS
            </span>
          </div>
        </div>

        <div
          className={`relative w-full overflow-x-auto rounded-xl border ${
            isLightCard ? "bg-slate-50 border-slate-200" : "bg-[#070c18] border-slate-800/70"
          }`}
        >
          <svg
            viewBox="0 0 1000 520"
            className="w-full min-w-[760px] h-[480px] select-none"
          >
            <defs>
              <pattern
                id="noc-grid"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 32 0 L 0 0 0 32"
                  fill="none"
                  stroke={isLightCard ? "#e2e8f0" : "#0f172a"}
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            {/* Grid background */}
            <rect width="1000" height="520" fill="url(#noc-grid)" />

            {/* Tier Layer Labels */}
            <g className={isLightCard ? "opacity-80" : "opacity-60"}>
              <text x="18" y="95" fill={isLightCard ? "#475569" : "#64748b"} fontSize="10" fontWeight="700" letterSpacing="1">
                TIER 1: CORE / BORDER ROUTERS (BGP &amp; BRAS)
              </text>
              <line x1="18" y1="185" x2="982" y2="185" stroke={isLightCard ? "#cbd5e1" : "#1e293b"} strokeDasharray="4 4" />
              <text x="18" y="245" fill={isLightCard ? "#475569" : "#64748b"} fontSize="10" fontWeight="700" letterSpacing="1">
                TIER 2: DISTRIBUTION / AGGREGATION SWITCHES (10G/40G/100G)
              </text>
              <line x1="18" y1="340" x2="982" y2="340" stroke={isLightCard ? "#cbd5e1" : "#1e293b"} strokeDasharray="4 4" />
              <text x="18" y="400" fill={isLightCard ? "#475569" : "#64748b"} fontSize="10" fontWeight="700" letterSpacing="1">
                TIER 3: MULTI-VENDOR OLT ACCESS FLEET (GPON / EPON / XGS-PON)
              </text>
            </g>

            {/* Upstream Cloud Node */}
            <g transform="translate(500, 28)">
              <rect
                x="-135"
                y="-18"
                width="270"
                height="34"
                rx="17"
                fill="#0f172a"
                stroke="#38bdf8"
                strokeWidth="1.2"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fill="#e0f2fe"
                fontSize="11"
                fontWeight="600"
              >
                {upstreamLabel}
              </text>
            </g>

            {/* Lines from Upstream to Core Routers */}
            {coreRouters.map((cr) => {
              const pos = nodePositions.get(cr.id);
              if (!pos) return null;
              return (
                <line
                  key={`up-${cr.id}`}
                  x1={500}
                  y1={46}
                  x2={pos.x}
                  y2={pos.y - 30}
                  stroke="#0284c7"
                  strokeWidth="1.8"
                  className="animate-flow-line"
                />
              );
            })}

            {/* Topology Links between Devices */}
            {links.map((lnk) => {
              const src = nodePositions.get(lnk.sourceId);
              const dst = nodePositions.get(lnk.targetId);
              if (!src || !dst) return null;

              const midX = (src.x + dst.x) / 2;
              const midY = (src.y + dst.y) / 2;

              const strokeColor =
                lnk.status === "down"
                  ? "#f43f5e"
                  : lnk.status === "degraded"
                  ? "#f59e0b"
                  : "#10b981";

              const gbps = (lnk.currentTrafficMbps / 1000).toFixed(2);

              return (
                <g key={lnk.id}>
                  {/* Base glow line */}
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={dst.x}
                    y2={dst.y}
                    stroke={strokeColor}
                    strokeOpacity="0.22"
                    strokeWidth="5"
                  />
                  {/* Animated flow line */}
                  <line
                    x1={src.x}
                    y1={src.y}
                    x2={dst.x}
                    y2={dst.y}
                    stroke={strokeColor}
                    strokeWidth="2"
                    className={lnk.status === "down" ? "" : "animate-flow-line"}
                  />
                  {/* Link utilization pill */}
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-46"
                      y="-10"
                      width="92"
                      height="20"
                      rx="6"
                      fill="#090f1d"
                      stroke={strokeColor}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="9.5"
                      fontFamily="monospace"
                    >
                      {gbps}G ({lnk.latencyMs}ms)
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Device Nodes */}
            {devices.map((dev) => {
              const pos = nodePositions.get(dev.id);
              if (!pos) return null;

              const isSelected = selectedDevice?.id === dev.id;
              const borderColor =
                dev.status === "critical" || dev.status === "offline"
                  ? "#f43f5e"
                  : dev.status === "warning"
                  ? "#f59e0b"
                  : isSelected
                  ? "#38bdf8"
                  : "#334155";

              const statusDotColor =
                dev.status === "critical" || dev.status === "offline"
                  ? "#f43f5e"
                  : dev.status === "warning"
                  ? "#f59e0b"
                  : "#10b981";

              return (
                <g
                  key={dev.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => onSelectDevice(dev)}
                  className="cursor-pointer transition-transform"
                >
                  {/* Selection Halo */}
                  {isSelected && (
                    <rect
                      x="-88"
                      y="-38"
                      width="176"
                      height="76"
                      rx="14"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Node Card */}
                  <rect
                    x="-82"
                    y="-32"
                    width="164"
                    height="64"
                    rx="11"
                    fill="#0f172a"
                    stroke={borderColor}
                    strokeWidth={isSelected ? "2.2" : "1.5"}
                  />

                  {/* Status Dot */}
                  <circle cx="-66" cy="-16" r="4.5" fill={statusDotColor} />

                  {/* Vendor Tag */}
                  <text
                    x="-56"
                    y="-12"
                    fill="#38bdf8"
                    fontSize="9.5"
                    fontWeight="700"
                  >
                    {dev.vendor.toUpperCase()}
                  </text>

                  {/* CPU / Temp mini badge */}
                  <text
                    x="72"
                    y="-12"
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    CPU {dev.cpuUsage}% | {dev.temperatureC}°C
                  </text>

                  {/* Device Name */}
                  <text
                    x="-68"
                    y="4"
                    fill="#f8fafc"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {dev.name.length > 20 ? dev.name.slice(0, 20) + "…" : dev.name}
                  </text>

                  {/* IP & Traffic */}
                  <text
                    x="-68"
                    y="20"
                    fill="#94a3b8"
                    fontSize="9.5"
                    fontFamily="monospace"
                  >
                    {dev.ipAddress} • {(dev.totalRxMbps / 1000).toFixed(2)} Gbps
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Right Side Selected Node Inspector */}
      <div className={`xl:col-span-4 ${cardCls} p-5 flex flex-col justify-between`}>
        {selectedDevice ? (
          <div className="space-y-4">
            <div
              className={`flex items-start justify-between gap-2 border-b pb-3 ${
                isLightCard ? "border-slate-200" : "border-sky-500/20"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                      VENDOR_PROFILES[selectedDevice.vendor]?.badgeColor ||
                      VENDOR_PROFILES.Other.badgeColor
                    }`}
                  >
                    {selectedDevice.vendor}
                  </span>
                  <span className={`text-xs ${mutedText} font-mono`}>
                    {selectedDevice.ipAddress}
                  </span>
                </div>
                <h4 className={`text-lg font-bold ${headingText} mt-1`}>
                  {selectedDevice.name}
                </h4>
                <p className={`text-xs ${mutedText}`}>
                  {selectedDevice.model} • {selectedDevice.osVersion}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
                  selectedDevice.status === "online"
                    ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                    : selectedDevice.status === "warning"
                    ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                    : "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                }`}
              >
                {selectedDevice.status === "online" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {selectedDevice.status.toUpperCase()}
              </span>
            </div>

            {/* Hardware Telemetry Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className={`${subBoxCls} rounded-xl p-2.5`}>
                <span className={`text-[11px] ${mutedText} block`}>CPU Load</span>
                <span className={`text-base font-bold ${headingText} font-mono`}>
                  {selectedDevice.cpuUsage}%
                </span>
              </div>
              <div className={`${subBoxCls} rounded-xl p-2.5`}>
                <span className={`text-[11px] ${mutedText} block`}>Memory</span>
                <span className={`text-base font-bold ${headingText} font-mono`}>
                  {selectedDevice.memoryUsage}%
                </span>
              </div>
              <div className={`${subBoxCls} rounded-xl p-2.5`}>
                <span className={`text-[11px] ${mutedText} block`}>Board Temp</span>
                <span className={`text-base font-bold ${cyanNum} font-mono`}>
                  {selectedDevice.temperatureC}°C
                </span>
              </div>
            </div>

            {/* Physical Interfaces & SFP DDM */}
            <div>
              <h5 className={`text-xs font-semibold uppercase tracking-wider ${mutedText} mb-2 flex items-center gap-1.5`}>
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Port Fisik &amp; SFP Optical DDM ({selectedDevice.interfaces.length})
              </h5>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {selectedDevice.interfaces.length === 0 ? (
                  <p className={`text-xs ${mutedText} py-2`}>
                    Belum ada interface terbaca (aktifkan SNMPv2c pada perangkat lalu klik Poll).
                  </p>
                ) : (
                  selectedDevice.interfaces.map((iface) => {
                    const isUp = iface.status === "up" || iface.status === "degraded";
                    const isSfp =
                      iface.type === "sfp_plus" ||
                      iface.type === "qsfp28" ||
                      iface.type === "gpon" ||
                      iface.type === "epon";
                    return (
                      <div
                        key={iface.id}
                        className={`${subBoxCls} rounded-xl p-2.5 text-xs`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-mono font-semibold ${cyanNum} truncate`}>
                            {iface.name}
                          </span>
                          <span
                            className={`text-[11px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                              isUp
                                ? "bg-emerald-500/15 text-emerald-500"
                                : "bg-rose-500/15 text-rose-400"
                            }`}
                          >
                            {iface.speedMbps >= 1000
                              ? `${(iface.speedMbps / 1000).toFixed(0)}G`
                              : `${iface.speedMbps}M`}{" "}
                            {isUp ? "UP" : "DOWN"}
                          </span>
                        </div>
                        <div
                          className={`flex flex-wrap items-center justify-between gap-2 mt-1.5 pt-1.5 border-t font-mono text-[11px] ${
                            isLightCard ? "border-slate-200" : "border-slate-800/70"
                          }`}
                        >
                          <span className="text-sky-500">
                            Tx: {iface.txMbps} Mbps
                          </span>
                          <span className="text-emerald-500">
                            Rx: {iface.rxMbps} Mbps
                          </span>
                          {(isSfp || typeof iface.rxPowerDbm === "number") && (
                            <span
                              className={
                                typeof iface.rxPowerDbm === "number"
                                  ? iface.rxPowerDbm <= -25
                                    ? "text-rose-400"
                                    : iface.rxPowerDbm <= -20
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                                  : mutedText
                              }
                            >
                              {typeof iface.rxPowerDbm === "number"
                                ? `SFP Rx: ${iface.rxPowerDbm} dBm${
                                    typeof iface.txPowerDbm === "number"
                                      ? ` / Tx: ${iface.txPowerDbm} dBm`
                                      : ""
                                  }`
                                : "SFP: N/A"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* If OLT, show PON Port Summary */}
            {selectedDevice.ponPorts && selectedDevice.ponPorts.length > 0 && (
              <div>
                <h5 className={`text-xs font-semibold uppercase tracking-wider ${mutedText} mb-2 flex items-center gap-1.5`}>
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  Ringkasan PON Port OLT ({selectedDevice.ponPorts.length} Port)
                </h5>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {selectedDevice.ponPorts.map((pon) => (
                    <div
                      key={pon.id}
                      className={`${subBoxCls} rounded-xl p-2.5 text-xs`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-mono font-semibold ${headingText}`}>
                          {pon.portName} ({pon.ponType})
                        </span>
                        <span className={`font-mono text-[11px] ${cyanNum}`}>
                          Tx: +{pon.sfpTxDbm} dBm
                        </span>
                      </div>
                      <p className={`text-[11px] ${mutedText} mt-0.5`}>
                        {pon.odcArea}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 font-mono text-[11px]">
                        <span className="text-emerald-500">
                          Online: {pon.onlineOnu}/{pon.totalOnu}
                        </span>
                        {pon.losOnu > 0 && (
                          <span className="text-rose-500 font-bold">
                            LOS: {pon.losOnu}
                          </span>
                        )}
                        {pon.dyingGaspOnu > 0 && (
                          <span className="text-amber-500">
                            DyingGasp: {pon.dyingGaspOnu}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`text-center py-12 ${mutedText} text-sm`}>
            Pilih perangkat pada peta topologi untuk melihat detail telemetri.
          </div>
        )}

        <div
          className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] ${mutedText} ${
            isLightCard ? "border-slate-200" : "border-slate-800/80"
          }`}
        >
          <span>Lokasi: {selectedDevice?.location}</span>
          <span className="font-mono">{selectedDevice?.rackPosition}</span>
        </div>
      </div>
    </div>
  );
}

