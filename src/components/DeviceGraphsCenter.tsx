"use client";

import React, { useMemo, useState } from "react";
import { NetworkDevice, NetworkInterface } from "@/lib/types";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";
import {
  ArrowDownUp,
  BarChart3,
  Cpu,
  Gauge,
  Network,
  Radio,
  Thermometer,
} from "lucide-react";

import type { BentoTheme } from "./BentoOverviewDashboard";

interface DeviceGraphsCenterProps {
  theme?: BentoTheme;
  devices: NetworkDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
}

type TimeRange = "15m" | "1h" | "24h" | "7d";
type InterfaceFilter = "all" | "active" | "inactive";

const INTERFACE_PALETTE = [
  "#22d3ee",
  "#818cf8",
  "#10b981",
  "#f59e0b",
  "#38bdf8",
  "#ec4899",
  "#a855f7",
  "#14b8a6",
];

function isInterfaceActive(status: NetworkInterface["status"]): boolean {
  return status === "up" || status === "degraded";
}

function formatBandwidth(mbps: number): string {
  if (mbps <= 0) return "0 Mbps";
  if (mbps < 1000) return `${Math.round(mbps)} Mbps`;
  return `${(mbps / 1000).toFixed(2)} Gbps`;
}

function getInterfaceStatusMeta(
  status: NetworkInterface["status"],
  isLightCard: boolean
) {
  switch (status) {
    case "up":
      return {
        label: "ACTIVE • UP",
        shortLabel: "UP",
        lineColor: "#10b981",
        badgeCls: isLightCard
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
      };
    case "degraded":
      return {
        label: "DEGRADED",
        shortLabel: "DEGRADED",
        lineColor: "#f59e0b",
        badgeCls: isLightCard
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-amber-500/15 text-amber-300 border-amber-500/35",
      };
    case "admin_down":
      return {
        label: "ADMIN DOWN",
        shortLabel: "ADMIN DOWN",
        lineColor: "#94a3b8",
        badgeCls: isLightCard
          ? "bg-slate-100 text-slate-600 border-slate-300"
          : "bg-slate-700/40 text-slate-300 border-slate-600/50",
      };
    case "down":
    default:
      return {
        label: "INACTIVE • DOWN",
        shortLabel: "DOWN",
        lineColor: "#f43f5e",
        badgeCls: isLightCard
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-rose-500/15 text-rose-300 border-rose-500/35",
      };
  }
}

function getTimeLabels(timeRange: TimeRange, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === count - 1) return "NOW";
    if (timeRange === "15m") return `-${(count - 1 - i) * 1}m`;
    if (timeRange === "1h") return `-${(count - 1 - i) * 5}m`;
    if (timeRange === "24h") {
      return `${String((10 + i * 2) % 24).padStart(2, "0")}:00`;
    }
    return `H-${count - 1 - i}`;
  });
}

function buildInterfaceSeries(
  device: NetworkDevice,
  iface: NetworkInterface,
  timeRange: TimeRange,
  count = 14
) {
  const labels = getTimeLabels(timeRange, count);
  const seed = (device.id + iface.id)
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const active = isInterfaceActive(iface.status);

  return labels.map((label, i) => {
    if (!active) {
      return {
        label,
        rxMbps: 0,
        txMbps: 0,
        totalMbps: 0,
        opticalDbm: iface.rxPowerDbm ?? -40,
      };
    }

    const wave = Math.sin((i + seed * 0.37) * 0.68);
    const wave2 = Math.cos((i + seed * 0.53) * 0.78);
    const rxMbps =
      i === count - 1
        ? Math.round(iface.rxMbps)
        : Math.max(
            0,
            Math.round(iface.rxMbps * (0.8 + wave * 0.18))
          );
    const txMbps =
      i === count - 1
        ? Math.round(iface.txMbps)
        : Math.max(
            0,
            Math.round(iface.txMbps * (0.78 + wave2 * 0.17))
          );

    return {
      label,
      rxMbps,
      txMbps,
      totalMbps: rxMbps + txMbps,
      opticalDbm:
        Math.round(((iface.rxPowerDbm ?? -4.0) + wave * 0.22) * 100) / 100,
    };
  });
}

export default function DeviceGraphsCenter({
  theme = "dark",
  devices,
  selectedDeviceId,
  onSelectDevice,
}: DeviceGraphsCenterProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const cardCls = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px]";
  const subBoxCls = isLightCard
    ? "bg-slate-50 border border-slate-200/90"
    : "bg-[#051122]/85 border border-sky-500/20";
  const headingText = isLightCard ? "text-slate-900" : "text-white";
  const mutedText = isLightCard ? "text-slate-500" : "text-slate-400";
  const gridStroke = isLightCard ? "#e2e8f0" : "#162d4c";
  const cyanNum = isLightCard ? "text-sky-600" : "text-cyan-300";
  const indigoNum = isLightCard ? "text-indigo-600" : "text-indigo-300";
  const emeraldNum = isLightCard ? "text-emerald-600" : "text-emerald-400";
  const amberNum = isLightCard ? "text-amber-600" : "text-amber-300";
  const roseNum = isLightCard ? "text-rose-600" : "text-rose-400";
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedPortId, setSelectedPortId] = useState<string>("all_interfaces");
  const [ifaceFilter, setIfaceFilter] = useState<InterfaceFilter>("all");
  const [ifaceColumns, setIfaceColumns] = useState<1 | 2>(2);

  const filteredDevices = devices.filter(
    (d) => roleFilter === "all" || d.role === roleFilter
  );

  const activeDevice =
    devices.find((d) => d.id === selectedDeviceId) ||
    filteredDevices[0] ||
    devices[0];

  const effectivePortId = useMemo(() => {
    if (!activeDevice) return "all_interfaces";
    if (selectedPortId === "all_interfaces" || selectedPortId === "aggregate") {
      return selectedPortId;
    }
    const exists = activeDevice.interfaces.some((i) => i.id === selectedPortId);
    return exists ? selectedPortId : "all_interfaces";
  }, [activeDevice, selectedPortId]);

  const allInterfaceSeries = useMemo(() => {
    if (!activeDevice) return [];
    let activeColorIdx = 0;
    return activeDevice.interfaces.map((iface) => {
      const active = isInterfaceActive(iface.status);
      const statusMeta = getInterfaceStatusMeta(iface.status, isLightCard);
      const color = active
        ? INTERFACE_PALETTE[activeColorIdx++ % INTERFACE_PALETTE.length]
        : statusMeta.lineColor;
      const series = buildInterfaceSeries(activeDevice, iface, timeRange);
      const peakRxMbps = Math.max(0, ...series.map((p) => p.rxMbps));
      const peakTotalMbps = Math.max(0, ...series.map((p) => p.totalMbps));
      const avgRxMbps = Math.round(
        series.reduce((sum, p) => sum + p.rxMbps, 0) / Math.max(series.length, 1)
      );
      return {
        iface,
        active,
        statusMeta,
        color,
        series,
        peakRxMbps,
        peakTotalMbps,
        avgRxMbps,
      };
    });
  }, [activeDevice, timeRange, isLightCard]);

  // Generate deterministic + live-seeded time-series points for the selected device & time range
  const telemetrySeries = useMemo(() => {
    if (!activeDevice) return [];
    const count = 14;
    const labels = getTimeLabels(timeRange, count);
    const seed = activeDevice.id
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    const selectedEntry = allInterfaceSeries.find(
      (entry) => entry.iface.id === effectivePortId
    );
    const firstActiveEntry = allInterfaceSeries.find((e) => e.active);
    const baseOptic =
      selectedEntry?.iface.rxPowerDbm ??
      firstActiveEntry?.iface.rxPowerDbm ??
      activeDevice.interfaces[0]?.rxPowerDbm ??
      -3.5;

    return labels.map((label, i) => {
      const wave = Math.sin((i + seed) * 0.65);
      const wave2 = Math.cos((i + seed * 0.5) * 0.8);

      let rxMbps = 0;
      let txMbps = 0;
      if (selectedEntry) {
        rxMbps = selectedEntry.series[i]?.rxMbps ?? 0;
        txMbps = selectedEntry.series[i]?.txMbps ?? 0;
      } else {
        const summedRx = allInterfaceSeries.reduce(
          (sum, item) => sum + (item.series[i]?.rxMbps ?? 0),
          0
        );
        const summedTx = allInterfaceSeries.reduce(
          (sum, item) => sum + (item.series[i]?.txMbps ?? 0),
          0
        );
        if (allInterfaceSeries.length > 0) {
          rxMbps = summedRx;
          txMbps = summedTx;
        } else {
          rxMbps = Math.max(
            0,
            Math.round(
              activeDevice.totalRxMbps *
                (0.82 + wave * 0.16 + (i === count - 1 ? 0.18 : 0))
            )
          );
          txMbps = Math.max(
            0,
            Math.round(
              activeDevice.totalTxMbps *
                (0.8 + wave2 * 0.15 + (i === count - 1 ? 0.2 : 0))
            )
          );
        }
      }

      const cpu = Math.min(
        98,
        Math.max(5, Math.round(activeDevice.cpuUsage + wave * 9))
      );
      const mem = Math.min(
        96,
        Math.max(12, Math.round(activeDevice.memoryUsage + wave2 * 4))
      );
      const temp = Math.round((activeDevice.temperatureC + wave * 2.5) * 10) / 10;
      const latency = Math.max(
        0.4,
        Math.round((activeDevice.latencyMs + Math.abs(wave2) * 1.4) * 10) / 10
      );
      const opticalDbm =
        selectedEntry && !selectedEntry.active
          ? -40.0
          : Math.round((baseOptic + wave * 0.25) * 100) / 100;

      return {
        label,
        rxMbps,
        txMbps,
        cpu,
        mem,
        temp,
        latency,
        opticalDbm,
      };
    });
  }, [activeDevice, timeRange, effectivePortId, allInterfaceSeries]);

  if (!activeDevice) return null;

  const selectedIfaceEntry = allInterfaceSeries.find(
    (entry) => entry.iface.id === effectivePortId
  );
  const activeIfaceCount = allInterfaceSeries.filter((i) => i.active).length;
  const inactiveIfaceCount = allInterfaceSeries.length - activeIfaceCount;
  const isAllInterfacesMode = effectivePortId === "all_interfaces";

  const maxMultiInterfaceMbps = Math.max(
    100,
    ...allInterfaceSeries.flatMap((item) =>
      item.series.map((p) => p.rxMbps * 1.18)
    )
  );
  const maxTrafficMbps = Math.max(
    100,
    ...(isAllInterfacesMode
      ? [maxMultiInterfaceMbps]
      : telemetrySeries.map((p) => Math.max(p.rxMbps, p.txMbps) * 1.18))
  );
  const peakRxMbps = Math.max(0, ...telemetrySeries.map((p) => p.rxMbps));
  const avgRxMbps = Math.round(
    telemetrySeries.reduce((s, p) => s + p.rxMbps, 0) /
      Math.max(telemetrySeries.length, 1)
  );
  const p95RxMbps = Math.round(peakRxMbps * 0.93);

  const visibleInterfaceCards = allInterfaceSeries.filter((item) => {
    if (ifaceFilter === "active") return item.active;
    if (ifaceFilter === "inactive") return !item.active;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Selector & Filter Controls */}
      <div className={`${cardCls} p-5`}>
        <div
          className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b ${
            isLightCard ? "border-slate-200" : "border-sky-500/20"
          }`}
        >
          <div>
            <h3 className={`text-base font-semibold ${headingText} flex items-center gap-2`}>
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Pusat Grafik &amp; Telemetri Historis Per Alat (Core Router, Switch &amp; OLT)
            </h3>
            <p className={`text-xs ${mutedText} mt-0.5`}>
              Pilih perangkat jaringan di bawah untuk menampilkan grafik Throughput (Rx/Tx), CPU/RAM, Suhu, Latency, dan Redaman Optik SFP/PON
            </p>
          </div>

          {/* Time Horizon Buttons */}
          <div
            className={`flex items-center gap-1.5 p-1 rounded-full border ${
              isLightCard
                ? "bg-slate-100 border-slate-200"
                : "bg-[#040e1d] border-sky-500/25"
            }`}
          >
            {[
              { id: "15m", label: "Live 15 Menit" },
              { id: "1h", label: "1 Jam Terakhir" },
              { id: "24h", label: "24 Jam (Harian)" },
              { id: "7d", label: "7 Hari (Mingguan)" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeRange(t.id as TimeRange)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  timeRange === t.id
                    ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow"
                    : isLightCard
                    ? "text-slate-600 hover:text-slate-900"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Role Filter + Device Selector Strip */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "all", label: "Semua Alat" },
                { id: "core_router", label: "Core Router" },
                { id: "dist_switch", label: "Distribution Switch" },
                { id: "olt", label: "OLT FTTH" },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRoleFilter(r.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                    roleFilter === r.id
                      ? isLightCard
                        ? "bg-sky-500 text-white shadow-sm"
                        : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : isLightCard
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                      : "bg-[#051122] text-slate-400 hover:text-slate-200 border border-sky-500/20"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Interface / Port Sub-Selector */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={mutedText}>Sumber Grafik Port:</span>
              <select
                value={effectivePortId}
                onChange={(e) => setSelectedPortId(e.target.value)}
                className={`rounded-xl px-3 py-1.5 font-mono text-xs border focus:outline-none ${
                  isLightCard
                    ? "bg-white border-slate-300 text-sky-700"
                    : "bg-[#051122] border-sky-500/30 text-cyan-300"
                }`}
              >
                <option value="all_interfaces">
                  Semua Interface — Aktif &amp; Tidak Aktif ({activeDevice.interfaces.length} Port)
                </option>
                <option value="aggregate">
                  Aggregate Total Chassis ({activeDevice.name})
                </option>
                {activeDevice.interfaces.map((iface) => {
                  const statusTag = getInterfaceStatusMeta(
                    iface.status,
                    isLightCard
                  ).shortLabel;
                  const rxLabel = isInterfaceActive(iface.status)
                    ? formatBandwidth(iface.rxMbps)
                    : "0 Mbps";
                  const txLabel = isInterfaceActive(iface.status)
                    ? formatBandwidth(iface.txMbps)
                    : "0 Mbps";
                  const sfpTag =
                    typeof iface.rxPowerDbm === "number"
                      ? ` | SFP ${iface.rxPowerDbm} dBm`
                      : "";
                  return (
                    <option key={iface.id} value={iface.id}>
                      [{statusTag}] {iface.name} (Tx {txLabel} / Rx {rxLabel}{sfpTag})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Device Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 pt-1">
            {filteredDevices.map((dev) => {
              const isSelected = dev.id === activeDevice.id;
              return (
                <button
                  key={dev.id}
                  onClick={() => {
                    onSelectDevice(dev.id);
                    setSelectedPortId("all_interfaces");
                  }}
                  className={`text-left p-3 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? isLightCard
                        ? "bg-sky-50 border-sky-500 shadow-sm"
                        : "bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.18)]"
                      : isLightCard
                      ? "bg-slate-50/90 border-slate-200 hover:border-sky-300"
                      : "bg-[#051122]/80 border-sky-500/15 hover:border-sky-500/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${
                        VENDOR_PROFILES[dev.vendor]?.badgeColor ||
                        VENDOR_PROFILES.Other.badgeColor
                      }`}
                    >
                      {dev.vendor}
                    </span>
                    <span className={`text-[11px] font-mono ${emeraldNum}`}>
                      {(dev.totalRxMbps / 1000).toFixed(2)} Gbps
                    </span>
                  </div>
                  <p className={`font-bold text-xs ${headingText} mt-1.5 truncate`}>
                    {dev.name}
                  </p>
                  <p className={`text-[10px] ${mutedText} font-mono truncate`}>
                    {dev.ipAddress} • CPU {dev.cpuUsage}%
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Device Telemetry Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3.5">
        <div className={`${cardCls} p-4`}>
          <span className={`text-[11px] ${mutedText} block`}>
            Perangkat Aktif
          </span>
          <span className={`text-sm font-extrabold ${headingText} block mt-1 truncate`}>
            {activeDevice.name}
          </span>
          <span className={`text-[11px] ${cyanNum} font-mono`}>
            {activeIfaceCount} UP • {inactiveIfaceCount} DOWN/SHUT
          </span>
        </div>

        <div className={`${cardCls} p-4`}>
          <span className={`text-[11px] ${mutedText} block`}>
            Peak Download (Rx)
          </span>
          <span className={`text-lg font-extrabold ${cyanNum} font-mono block mt-1`}>
            {formatBandwidth(peakRxMbps)}
          </span>
          <span className={`text-[11px] ${mutedText} font-mono`}>
            Avg: {formatBandwidth(avgRxMbps)}
          </span>
        </div>

        <div className={`${cardCls} p-4`}>
          <span className={`text-[11px] ${mutedText} block`}>
            95th Percentile
          </span>
          <span className={`text-lg font-extrabold ${indigoNum} font-mono block mt-1`}>
            {formatBandwidth(p95RxMbps)}
          </span>
          <span className={`text-[11px] ${emeraldNum} font-mono`}>
            Kapasitas {(activeDevice.capacityMbps / 1000).toFixed(0)}G
          </span>
        </div>

        <div className={`${cardCls} p-4`}>
          <span className={`text-[11px] ${mutedText} block`}>
            CPU &amp; Memory Load
          </span>
          <span className={`text-lg font-extrabold ${headingText} font-mono block mt-1`}>
            {activeDevice.cpuUsage}% / {activeDevice.memoryUsage}%
          </span>
          <span className={`text-[11px] ${mutedText}`}>
            Uptime: {activeDevice.uptime}
          </span>
        </div>

        <div className={`${cardCls} p-4`}>
          <span className={`text-[11px] ${mutedText} block`}>
            Board &amp; SFP Temp
          </span>
          <span className={`text-lg font-extrabold ${amberNum} font-mono block mt-1`}>
            {activeDevice.temperatureC} °C
          </span>
          <span className={`text-[11px] ${emeraldNum}`}>
            Fan {activeDevice.fanRpm || 4500} RPM • PSU OK
          </span>
        </div>

        <div className={`${cardCls} p-4`}>
          <span className={`text-[11px] ${mutedText} block`}>
            ICMP Ping &amp; Jitter
          </span>
          <span className={`text-lg font-extrabold ${emeraldNum} font-mono block mt-1`}>
            {activeDevice.latencyMs} ms
          </span>
          <span className={`text-[11px] ${mutedText} font-mono`}>
            Packet Loss: {activeDevice.packetLossPct}%
          </span>
        </div>
      </div>

      {/* 4 Interactive SVG Telemetry Graphs Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* CHART 1: Bandwidth Throughput (Multi-Interface Aktif & Non-Aktif OR Single Port Rx/Tx) */}
        <div className={`${cardCls} p-5 flex flex-col justify-between`}>
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                <ArrowDownUp className="w-4 h-4 text-cyan-400" />
                1. Grafik Bandwidth Traffic —{" "}
                {selectedIfaceEntry
                  ? selectedIfaceEntry.iface.name
                  : activeDevice.name}
              </h4>
              <p className={`text-[11px] ${mutedText}`}>
                {isAllInterfacesMode
                  ? `Menampilkan seluruh ${allInterfaceSeries.length} interface (${activeIfaceCount} aktif & ${inactiveIfaceCount} non-aktif) dalam satu grafik`
                  : selectedIfaceEntry
                  ? `${selectedIfaceEntry.iface.description} • Status: ${selectedIfaceEntry.statusMeta.label}`
                  : `Inbound (Rx) vs Outbound (Tx) beserta garis 95th Percentile (${formatBandwidth(
                      p95RxMbps
                    )})`}
              </p>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setSelectedPortId("all_interfaces")}
                className={`px-2.5 py-1 rounded-full font-semibold transition cursor-pointer ${
                  isAllInterfacesMode
                    ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-sm"
                    : isLightCard
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                    : "bg-[#051122] text-slate-400 hover:text-slate-200 border border-sky-500/20"
                }`}
              >
                Semua Interface
              </button>
              <button
                type="button"
                onClick={() => setSelectedPortId("aggregate")}
                className={`px-2.5 py-1 rounded-full font-semibold transition cursor-pointer ${
                  effectivePortId === "aggregate"
                    ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-sm"
                    : isLightCard
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                    : "bg-[#051122] text-slate-400 hover:text-slate-200 border border-sky-500/20"
                }`}
              >
                Aggregate Rx/Tx
              </button>
            </div>
          </div>

          <div className={`${subBoxCls} rounded-2xl p-3 h-56 relative`}>
            <svg viewBox="0 0 620 190" className="w-full h-full overflow-visible">
              {[25, 60, 95, 130, 165].map((y, idx) => {
                const tickVal = Math.round(((165 - y) / 140) * maxTrafficMbps);
                return (
                  <g key={idx}>
                    <line
                      x1="44"
                      y1={y}
                      x2="600"
                      y2={y}
                      stroke={gridStroke}
                      strokeDasharray="3 3"
                    />
                    {idx % 2 === 0 && (
                      <text
                        x="38"
                        y={y + 3}
                        textAnchor="end"
                        fill="#64748b"
                        fontSize="8.5"
                        fontFamily="monospace"
                      >
                        {tickVal >= 1000
                          ? `${(tickVal / 1000).toFixed(1)}G`
                          : `${tickVal}M`}
                      </text>
                    )}
                  </g>
                );
              })}

              {isAllInterfacesMode ? (
                (() => {
                  const labels = getTimeLabels(timeRange, 14);
                  const stepX = 548 / Math.max(labels.length - 1, 1);

                  return (
                    <>
                      {allInterfaceSeries.map((item) => {
                        const pts = item.series.map((p, i) => ({
                          x: 50 + i * stepX,
                          y: 165 - (p.rxMbps / maxTrafficMbps) * 140,
                        }));
                        const pathD = pts
                          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                          .join(" ");
                        const last = pts[pts.length - 1];

                        return (
                          <g key={item.iface.id}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={item.color}
                              strokeWidth={item.active ? "2.3" : "1.8"}
                              strokeDasharray={item.active ? undefined : "5 4"}
                              strokeOpacity={item.active ? 0.95 : 0.85}
                            />
                            {last && (
                              <circle
                                cx={last.x}
                                cy={last.y}
                                r={item.active ? "3.5" : "3.2"}
                                fill={item.active ? item.color : "#0f172a"}
                                stroke={item.color}
                                strokeWidth="1.8"
                              />
                            )}
                          </g>
                        );
                      })}

                      {labels.map((lbl, i) => (
                        <text
                          key={i}
                          x={50 + i * stepX}
                          y="182"
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {lbl}
                        </text>
                      ))}
                    </>
                  );
                })()
              ) : (
                (() => {
                  const stepX = 548 / Math.max(telemetrySeries.length - 1, 1);
                  const rxPts = telemetrySeries.map((p, i) => ({
                    x: 50 + i * stepX,
                    y: 165 - (p.rxMbps / maxTrafficMbps) * 140,
                    val: p.rxMbps,
                    label: p.label,
                  }));
                  const txPts = telemetrySeries.map((p, i) => ({
                    x: 50 + i * stepX,
                    y: 165 - (p.txMbps / maxTrafficMbps) * 140,
                    val: p.txMbps,
                  }));
                  const p95Y = 165 - (p95RxMbps / maxTrafficMbps) * 140;

                  const rxPath = rxPts
                    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                    .join(" ");
                  const rxArea = `${rxPath} L ${
                    rxPts[rxPts.length - 1].x
                  } 165 L ${rxPts[0].x} 165 Z`;
                  const txPath = txPts
                    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                    .join(" ");

                  const isInactiveSingle =
                    selectedIfaceEntry && !selectedIfaceEntry.active;

                  return (
                    <>
                      {!isInactiveSingle && (
                        <path d={rxArea} fill="rgba(34, 211, 238, 0.16)" />
                      )}
                      <path
                        d={rxPath}
                        fill="none"
                        stroke={
                          isInactiveSingle
                            ? selectedIfaceEntry.statusMeta.lineColor
                            : "#22d3ee"
                        }
                        strokeWidth="2.5"
                        strokeDasharray={isInactiveSingle ? "5 4" : undefined}
                      />
                      <path
                        d={txPath}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="2"
                        strokeDasharray={isInactiveSingle ? "4 4" : undefined}
                      />
                      {p95RxMbps > 0 && (
                        <line
                          x1="44"
                          y1={p95Y}
                          x2="600"
                          y2={p95Y}
                          stroke="#f43f5e"
                          strokeWidth="1.2"
                          strokeDasharray="5 4"
                        />
                      )}
                      {isInactiveSingle && (
                        <text
                          x="322"
                          y="105"
                          textAnchor="middle"
                          fill={selectedIfaceEntry.statusMeta.lineColor}
                          fontSize="11"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {selectedIfaceEntry.statusMeta.label} • 0 Mbps (Tidak Aktif)
                        </text>
                      )}
                      {rxPts.map((c, i) => (
                        <g key={i}>
                          <circle
                            cx={c.x}
                            cy={c.y}
                            r="3"
                            fill={
                              isInactiveSingle
                                ? selectedIfaceEntry.statusMeta.lineColor
                                : "#22d3ee"
                            }
                          />
                          <text
                            x={c.x}
                            y="182"
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="monospace"
                          >
                            {c.label}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()
              )}
            </svg>
          </div>

          {/* All Interfaces Legend Strip (Active + Inactive always visible on chart) */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {allInterfaceSeries.map((item) => {
              const isFocused = effectivePortId === item.iface.id;
              return (
                <button
                  key={item.iface.id}
                  type="button"
                  onClick={() =>
                    setSelectedPortId(
                      isFocused ? "all_interfaces" : item.iface.id
                    )
                  }
                  className={`px-2.5 py-1 rounded-xl border text-[10px] font-mono flex items-center gap-1.5 transition cursor-pointer ${
                    isFocused
                      ? isLightCard
                        ? "bg-sky-50 border-sky-500 text-sky-900 shadow-sm"
                        : "bg-cyan-950/50 border-cyan-400 text-white"
                      : isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-700 hover:border-sky-300"
                      : "bg-[#051122]/80 border-sky-500/20 text-slate-300 hover:border-sky-400/50"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      item.active ? "" : "border-2 bg-transparent"
                    }`}
                    style={{
                      backgroundColor: item.active ? item.color : "transparent",
                      borderColor: item.color,
                    }}
                  />
                  <span className="font-bold">{item.iface.name}</span>
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-bold border ${item.statusMeta.badgeCls}`}
                  >
                    {item.statusMeta.shortLabel}
                  </span>
                  <span className={mutedText}>
                    {item.active ? formatBandwidth(item.iface.rxMbps) : "0 Mbps"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CHART 2: CPU & Memory Resource Utilization (%) */}
        <div className={`${cardCls} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                <Cpu className="w-4 h-4 text-emerald-400" />
                2. Grafik Utilisasi CPU &amp; Memory (%) — {activeDevice.name}
              </h4>
              <p className={`text-[11px] ${mutedText}`}>
                Histori beban Routing Engine / Mainboard ({activeDevice.osVersion})
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className={emeraldNum}>
                ● CPU ({activeDevice.cpuUsage}%)
              </span>
              <span className={amberNum}>
                ● RAM ({activeDevice.memoryUsage}%)
              </span>
            </div>
          </div>

          <div className={`${subBoxCls} rounded-2xl p-3 h-60`}>
            <svg viewBox="0 0 620 190" className="w-full h-full overflow-visible">
              {[25, 60, 95, 130, 165].map((y, idx) => (
                <line
                  key={idx}
                  x1="40"
                  y1={y}
                  x2="600"
                  y2={y}
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                />
              ))}

              {(() => {
                const stepX = 550 / Math.max(telemetrySeries.length - 1, 1);
                const cpuPts = telemetrySeries.map((p, i) => ({
                  x: 45 + i * stepX,
                  y: 165 - (p.cpu / 100) * 140,
                  val: p.cpu,
                  label: p.label,
                }));
                const memPts = telemetrySeries.map((p, i) => ({
                  x: 45 + i * stepX,
                  y: 165 - (p.mem / 100) * 140,
                  val: p.mem,
                }));

                const cpuPath = cpuPts
                  .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                  .join(" ");
                const memPath = memPts
                  .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                  .join(" ");

                return (
                  <>
                    <path
                      d={cpuPath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                    />
                    <path
                      d={memPath}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="2"
                    />
                    {cpuPts.map((c, i) => (
                      <g key={i}>
                        <circle cx={c.x} cy={c.y} r="3" fill="#10b981" />
                        <text
                          x={c.x}
                          y="182"
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {c.label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* CHART 3: Optical Power Stability (SFP / PON Rx dBm) */}
        <div className={`${cardCls} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                <Radio className="w-4 h-4 text-amber-400" />
                3. Grafik Redaman &amp; Daya Optik SFP/PON (dBm) — {activeDevice.name}
              </h4>
              <p className={`text-[11px] ${mutedText}`}>
                Stabilitas sinyal laser optik DDM pada uplink SFP+ maupun modul GPON/EPON
              </p>
            </div>
            <span className={`text-xs font-mono ${amberNum} font-semibold`}>
              Current: {telemetrySeries[telemetrySeries.length - 1]?.opticalDbm}{" "}
              dBm
            </span>
          </div>

          <div className={`${subBoxCls} rounded-2xl p-3 h-60`}>
            <svg viewBox="0 0 620 190" className="w-full h-full overflow-visible">
              {[25, 60, 95, 130, 165].map((y, idx) => (
                <line
                  key={idx}
                  x1="40"
                  y1={y}
                  x2="600"
                  y2={y}
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                />
              ))}

              {(() => {
                const stepX = 550 / Math.max(telemetrySeries.length - 1, 1);
                const optPts = telemetrySeries.map((p, i) => {
                  // Normalize dBm around -30 to 0 dBm
                  const norm = Math.min(
                    1,
                    Math.max(0, (p.opticalDbm + 30) / 30)
                  );
                  return {
                    x: 45 + i * stepX,
                    y: 165 - norm * 130,
                    val: p.opticalDbm,
                    label: p.label,
                  };
                });

                const optPath = optPts
                  .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                  .join(" ");

                return (
                  <>
                    <path
                      d={optPath}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                    />
                    {optPts.map((c, i) => (
                      <g key={i}>
                        <circle cx={c.x} cy={c.y} r="3.2" fill="#f59e0b" />
                        <text
                          x={c.x}
                          y={c.y - 8}
                          textAnchor="middle"
                          fill="#fcd34d"
                          fontSize="8.5"
                          fontFamily="monospace"
                        >
                          {i % 2 === 0 ? `${c.val}` : ""}
                        </text>
                        <text
                          x={c.x}
                          y="182"
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {c.label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* CHART 4: Board Temperature (°C) & ICMP Latency (ms) */}
        <div className={`${cardCls} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                <Thermometer className="w-4 h-4 text-rose-400" />
                4. Grafik Suhu Chassis (°C) &amp; Latency ICMP (ms) —{" "}
                {activeDevice.name}
              </h4>
              <p className={`text-[11px] ${mutedText}`}>
                Korelasi temperatur hardware terhadap waktu respons ping (RTT)
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className={roseNum}>
                ● Temp ({activeDevice.temperatureC}°C)
              </span>
              <span className={cyanNum}>
                ● Ping ({activeDevice.latencyMs}ms)
              </span>
            </div>
          </div>

          <div className={`${subBoxCls} rounded-2xl p-3 h-60`}>
            <svg viewBox="0 0 620 190" className="w-full h-full overflow-visible">
              {[25, 60, 95, 130, 165].map((y, idx) => (
                <line
                  key={idx}
                  x1="40"
                  y1={y}
                  x2="600"
                  y2={y}
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                />
              ))}

              {(() => {
                const stepX = 550 / Math.max(telemetrySeries.length - 1, 1);
                const tempPts = telemetrySeries.map((p, i) => ({
                  x: 45 + i * stepX,
                  y: 165 - (p.temp / 85) * 135,
                  val: p.temp,
                  label: p.label,
                }));
                const latPts = telemetrySeries.map((p, i) => ({
                  x: 45 + i * stepX,
                  y: 165 - Math.min(1, p.latency / 15) * 120,
                  val: p.latency,
                }));

                const tempPath = tempPts
                  .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                  .join(" ");
                const latPath = latPts
                  .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                  .join(" ");

                return (
                  <>
                    <path
                      d={tempPath}
                      fill="none"
                      stroke="#fb7185"
                      strokeWidth="2.5"
                    />
                    <path
                      d={latPath}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                    />
                    {tempPts.map((c, i) => (
                      <g key={i}>
                        <circle cx={c.x} cy={c.y} r="3" fill="#fb7185" />
                        <text
                          x={c.x}
                          y="182"
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {c.label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      </div>

      {/* Dedicated Per-Interface Bandwidth Graphs (Active + Inactive Ports) */}
      <div className={`${cardCls} p-5`}>
        <div
          className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b ${
            isLightCard ? "border-slate-200" : "border-sky-500/20"
          }`}
        >
          <div>
            <h3 className={`text-base font-semibold ${headingText} flex items-center gap-2`}>
              <Network className="w-4 h-4 text-cyan-400" />
              Grafik Bandwidth Per Interface (Aktif &amp; Tidak Aktif) — {activeDevice.name}
            </h3>
            <p className={`text-xs ${mutedText} mt-0.5`}>
              Setiap port/interface ditampilkan individual termasuk interface berstatus{" "}
              <span className={emeraldNum}>UP</span>,{" "}
              <span className={amberNum}>DEGRADED</span>,{" "}
              <span className={roseNum}>DOWN</span>, maupun{" "}
              <span className={mutedText}>ADMIN DOWN</span>. Klik kartu interface untuk zoom pada grafik utama.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              {
                id: "all",
                label: `Semua Interface (${allInterfaceSeries.length})`,
              },
              {
                id: "active",
                label: `Aktif (${activeIfaceCount})`,
              },
              {
                id: "inactive",
                label: `Tidak Aktif (${inactiveIfaceCount})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setIfaceFilter(tab.id as InterfaceFilter)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  ifaceFilter === tab.id
                    ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-sm"
                    : isLightCard
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                    : "bg-[#051122] text-slate-400 hover:text-slate-200 border border-sky-500/20"
                }`}
              >
                {tab.label}
              </button>
            ))}

            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-500/25">
              {([2, 1] as const).map((cols) => (
                <button
                  key={cols}
                  type="button"
                  onClick={() => setIfaceColumns(cols)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                    ifaceColumns === cols
                      ? isLightCard
                        ? "bg-slate-900 text-white"
                        : "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                      : isLightCard
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                      : "bg-[#051122] text-slate-400 hover:text-slate-200 border border-sky-500/20"
                  }`}
                >
                  {cols} Kolom
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleInterfaceCards.length === 0 ? (
          <div
            className={`${subBoxCls} mt-4 rounded-2xl p-6 text-center text-xs ${mutedText}`}
          >
            Tidak ada interface pada kategori filter ini untuk perangkat{" "}
            <span className={`font-semibold ${headingText}`}>{activeDevice.name}</span>.
          </div>
        ) : (
          <div
            className={`grid gap-5 mt-4 ${
              ifaceColumns === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            }`}
          >
            {visibleInterfaceCards.map((item) => {
              const { iface, active, statusMeta, color, series, peakRxMbps: portPeakRx } = item;
              const isCardSelected = effectivePortId === iface.id;
              const speedGbps =
                iface.speedMbps >= 1000
                  ? `${(iface.speedMbps / 1000).toFixed(0)}G`
                  : `${iface.speedMbps}M`;
              const utilPct = active
                ? Math.min(
                    100,
                    Math.round((iface.rxMbps / Math.max(iface.speedMbps, 1)) * 100)
                  )
                : 0;
              const localMax = Math.max(
                100,
                ...series.map((p) => Math.max(p.rxMbps, p.txMbps) * 1.2)
              );

              return (
                <div
                  key={iface.id}
                  onClick={() =>
                    setSelectedPortId(
                      isCardSelected ? "all_interfaces" : iface.id
                    )
                  }
                  className={`rounded-2xl p-4 border transition cursor-pointer space-y-3 ${
                    isCardSelected
                      ? isLightCard
                        ? "bg-sky-50/90 border-sky-500 shadow-md"
                        : "bg-cyan-950/35 border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.16)]"
                      : `${subBoxCls} hover:border-cyan-400/45`
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            active ? "" : "border-2 bg-transparent"
                          }`}
                          style={{
                            backgroundColor: active ? color : "transparent",
                            borderColor: color,
                          }}
                        />
                        <span className={`font-bold font-mono text-xs truncate ${headingText}`}>
                          {iface.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                            isLightCard
                              ? "bg-slate-200/80 text-slate-700"
                              : "bg-slate-800/80 text-slate-300"
                          }`}
                        >
                          {speedGbps} {iface.type.toUpperCase()}
                        </span>
                      </div>
                      <p className={`text-[10px] ${mutedText} truncate mt-0.5`}>
                        {iface.description}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono border shrink-0 ${statusMeta.badgeCls}`}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Interface Bandwidth SVG Graph */}
                  <div
                    className={`rounded-xl p-3 border ${
                      ifaceColumns === 1 ? "h-56" : "h-44"
                    } ${
                      isLightCard
                        ? "bg-white border-slate-200/80"
                        : "bg-[#030b18]/80 border-sky-500/15"
                    }`}
                  >
                    <svg viewBox="0 0 320 96" className="w-full h-full overflow-visible">
                      {[16, 48, 80].map((y, idx) => (
                        <line
                          key={idx}
                          x1="28"
                          y1={y}
                          x2="312"
                          y2={y}
                          stroke={gridStroke}
                          strokeDasharray="3 3"
                        />
                      ))}
                      <text
                        x="24"
                        y="19"
                        textAnchor="end"
                        fill="#64748b"
                        fontSize="7.5"
                        fontFamily="monospace"
                      >
                        {active ? formatBandwidth(localMax).replace(" ", "") : "100M"}
                      </text>
                      <text
                        x="24"
                        y="82"
                        textAnchor="end"
                        fill="#64748b"
                        fontSize="7.5"
                        fontFamily="monospace"
                      >
                        0
                      </text>

                      {(() => {
                        const stepX = 278 / Math.max(series.length - 1, 1);
                        const rxPts = series.map((p, i) => ({
                          x: 32 + i * stepX,
                          y: 80 - (p.rxMbps / localMax) * 64,
                        }));
                        const txPts = series.map((p, i) => ({
                          x: 32 + i * stepX,
                          y: 80 - (p.txMbps / localMax) * 64,
                        }));
                        const rxPath = rxPts
                          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                          .join(" ");
                        const rxArea = `${rxPath} L ${
                          rxPts[rxPts.length - 1].x
                        } 80 L ${rxPts[0].x} 80 Z`;
                        const txPath = txPts
                          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                          .join(" ");
                        const lastRx = rxPts[rxPts.length - 1];

                        return (
                          <>
                            {active && (
                              <path
                                d={rxArea}
                                fill={`${color}26`}
                              />
                            )}
                            <path
                              d={rxPath}
                              fill="none"
                              stroke={color}
                              strokeWidth={active ? "2" : "1.8"}
                              strokeDasharray={active ? undefined : "5 4"}
                            />
                            <path
                              d={txPath}
                              fill="none"
                              stroke="#818cf8"
                              strokeWidth="1.5"
                              strokeDasharray={active ? undefined : "4 4"}
                              strokeOpacity={active ? 0.85 : 0.45}
                            />
                            {lastRx && (
                              <circle
                                cx={lastRx.x}
                                cy={lastRx.y}
                                r="2.8"
                                fill={active ? color : "#0f172a"}
                                stroke={color}
                                strokeWidth="1.5"
                              />
                            )}
                            {!active && (
                              <text
                                x="172"
                                y="44"
                                textAnchor="middle"
                                fill={statusMeta.lineColor}
                                fontSize="9"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                LINK TIDAK AKTIF (0 Mbps)
                              </text>
                            )}
                          </>
                        );
                      })()}

                      <text
                        x="32"
                        y="93"
                        textAnchor="start"
                        fill="#64748b"
                        fontSize="7.5"
                        fontFamily="monospace"
                      >
                        {series[0]?.label}
                      </text>
                      <text
                        x="310"
                        y="93"
                        textAnchor="end"
                        fill="#64748b"
                        fontSize="7.5"
                        fontFamily="monospace"
                      >
                        NOW
                      </text>
                    </svg>
                  </div>

                  {/* Per-Interface Metrics Footer */}
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                    <div>
                      <span className={mutedText}>Rx Now</span>
                      <span className={`block font-bold ${active ? cyanNum : roseNum}`}>
                        {formatBandwidth(iface.rxMbps)}
                      </span>
                    </div>
                    <div>
                      <span className={mutedText}>Tx Now</span>
                      <span className={`block font-bold ${active ? indigoNum : mutedText}`}>
                        {formatBandwidth(iface.txMbps)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={mutedText}>Peak / Util</span>
                      <span className={`block font-bold ${headingText}`}>
                        {formatBandwidth(portPeakRx)} ({utilPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-Device Sparkline Comparison Wall */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-base font-semibold ${headingText} flex items-center gap-2`}>
              <Gauge className="w-4 h-4 text-cyan-400" />
              Wall Grafik Perbandingan Seluruh Alat (Multi-Device NOC Wallboard)
            </h3>
            <p className={`text-xs ${mutedText}`}>
              Ringkasan bar utilisasi trafik, CPU, RAM, dan Suhu di seluruh perangkat secara serentak
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {devices.map((dev) => {
            const utilPct = Math.min(
              100,
              Math.round((dev.totalRxMbps / dev.capacityMbps) * 100)
            );
            return (
              <div
                key={dev.id}
                onClick={() => {
                  onSelectDevice(dev.id);
                  setSelectedPortId("all_interfaces");
                }}
                className={`${subBoxCls} rounded-2xl p-3.5 cursor-pointer transition space-y-2.5`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-xs ${headingText}`}>
                    {dev.name}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                      VENDOR_PROFILES[dev.vendor]?.badgeColor ||
                      VENDOR_PROFILES.Other.badgeColor
                    }`}
                  >
                    {dev.vendor}
                  </span>
                </div>

                {/* Bandwidth Utilization Bar */}
                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className={mutedText}>
                      Throughput ({utilPct}% of {(dev.capacityMbps / 1000).toFixed(0)}G)
                    </span>
                    <span className={cyanNum}>
                      &darr;{(dev.totalRxMbps / 1000).toFixed(2)}G &uarr;
                      {(dev.totalTxMbps / 1000).toFixed(2)}G
                    </span>
                  </div>
                  <div
                    className={`w-full h-2 rounded-full overflow-hidden ${
                      isLightCard ? "bg-slate-200" : "bg-slate-800"
                    }`}
                  >
                    <div
                      style={{ width: `${Math.max(6, utilPct)}%` }}
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                    />
                  </div>
                </div>

                {/* CPU & RAM Mini Bars */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between text-[10px] font-mono mb-0.5">
                      <span className={mutedText}>CPU</span>
                      <span className={emeraldNum}>{dev.cpuUsage}%</span>
                    </div>
                    <div
                      className={`w-full h-1.5 rounded-full overflow-hidden ${
                        isLightCard ? "bg-slate-200" : "bg-slate-800"
                      }`}
                    >
                      <div
                        style={{ width: `${dev.cpuUsage}%` }}
                        className="h-full bg-emerald-400"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-mono mb-0.5">
                      <span className={mutedText}>RAM</span>
                      <span className={amberNum}>{dev.memoryUsage}%</span>
                    </div>
                    <div
                      className={`w-full h-1.5 rounded-full overflow-hidden ${
                        isLightCard ? "bg-slate-200" : "bg-slate-800"
                      }`}
                    >
                      <div
                        style={{ width: `${dev.memoryUsage}%` }}
                        className="h-full bg-amber-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

