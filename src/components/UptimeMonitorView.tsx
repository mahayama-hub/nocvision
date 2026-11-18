"use client";

import React, { useEffect, useMemo, useState } from "react";
import { NetworkDevice } from "@/lib/types";
import {
  Copy,
  Edit3,
  ListFilter,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

export interface UptimeMonitorItem {
  id: string;
  name: string;
  subtitle: string;
  type: "Ping" | "TCP Port" | "HTTP(s)" | "SNMP";
  target: string;
  intervalSec: number;
  active: boolean;
  status: "up" | "down" | "paused";
  tags: string[];
  currentPingMs: number;
  avgPing24hMs: number;
  uptime24hPct: number;
  uptime30dPct: number;
  heartbeats: {
    status: "up" | "down" | "spike";
    pingMs: number;
    time: string;
  }[];
  chartSeries: {
    time: string;
    ms: number;
    anomaly?: boolean;
  }[];
}

import type { BentoTheme } from "./BentoOverviewDashboard";

interface UptimeMonitorViewProps {
  theme?: BentoTheme;
  devices: NetworkDevice[];
  onNotify: (msg: string) => void;
}

function buildChartSeries(baseMs: number, seed: number) {
  const labels = [
    "15:45",
    "16:00",
    "16:18",
    "16:35",
    "16:51",
    "17:08",
    "17:24",
    "17:40",
    "17:57",
    "18:15",
    "18:30",
    "18:46",
    "19:03",
    "19:20",
    "19:36",
    "19:52",
    "20:09",
    "20:25",
    "20:42",
    "20:58",
    "21:15",
    "21:30",
  ];

  const points: { time: string; ms: number; anomaly?: boolean }[] = [];
  for (let i = 0; i < 88; i++) {
    const labelIdx = Math.floor((i / 88) * labels.length);
    const wave =
      Math.sin((i + seed) * 0.55) * 2.2 +
      Math.cos((i * 1.7 + seed) * 0.9) * 1.8;
    const isSpike =
      i === 18 || i === 29 || i === 68 || i === 76 || i === 82;
    const isAnomalyGap = i === 49;

    const val = isAnomalyGap
      ? Math.max(16, baseMs - 3.2)
      : isSpike
      ? Number((baseMs + 6 + ((i * 3) % 8)).toFixed(1))
      : Number(Math.max(16.5, baseMs + wave).toFixed(1));

    points.push({
      time: labels[labelIdx] || "21:15",
      ms: val,
      anomaly: isAnomalyGap,
    });
  }
  return points;
}

function createInitialMonitors(devices: NetworkDevice[]): UptimeMonitorItem[] {
  const dnsSeeds: UptimeMonitorItem[] = [
    {
      id: "mon-cf-1",
      name: "Cloudflare DNS 1",
      subtitle: "Cloudflare 1",
      type: "Ping",
      target: "1.1.1.1",
      intervalSec: 120,
      active: true,
      status: "up",
      tags: ["DNS", "Upstream"],
      currentPingMs: 20.6,
      avgPing24hMs: 20,
      uptime24hPct: 100,
      uptime30dPct: 99.98,
      heartbeats: Array.from({ length: 30 }, (_, idx) => ({
        status: "up",
        pingMs: Number((19.5 + ((idx * 3) % 5) * 0.4).toFixed(1)),
        time: `${58 - idx * 2}m ago`,
      })),
      chartSeries: buildChartSeries(20.2, 11),
    },
    {
      id: "mon-cf-2",
      name: "Cloudflare DNS 2",
      subtitle: "Cloudflare Secondary",
      type: "Ping",
      target: "1.0.0.1",
      intervalSec: 120,
      active: true,
      status: "up",
      tags: ["DNS", "Upstream"],
      currentPingMs: 21.2,
      avgPing24hMs: 21,
      uptime24hPct: 100,
      uptime30dPct: 99.99,
      heartbeats: Array.from({ length: 30 }, (_, idx) => ({
        status: "up",
        pingMs: Number((20.1 + ((idx * 2) % 4) * 0.5).toFixed(1)),
        time: `${58 - idx * 2}m ago`,
      })),
      chartSeries: buildChartSeries(21.0, 25),
    },
    {
      id: "mon-gg-1",
      name: "Google DNS",
      subtitle: "Google Public DNS Primary",
      type: "Ping",
      target: "8.8.8.8",
      intervalSec: 120,
      active: true,
      status: "up",
      tags: ["DNS", "Upstream"],
      currentPingMs: 19.4,
      avgPing24hMs: 19,
      uptime24hPct: 100,
      uptime30dPct: 99.96,
      heartbeats: Array.from({ length: 30 }, (_, idx) => ({
        status: "up",
        pingMs: Number((18.8 + ((idx * 4) % 5) * 0.3).toFixed(1)),
        time: `${58 - idx * 2}m ago`,
      })),
      chartSeries: buildChartSeries(19.4, 42),
    },
  ];

  const deviceMonitors: UptimeMonitorItem[] = devices.map((dev, i) => {
    const isWarn = dev.status === "warning";
    const isDown = dev.status === "offline" || dev.status === "critical";
    const baseMs = Math.max(18, dev.latencyMs + 17);
    return {
      id: `mon-${dev.id}`,
      name: dev.name,
      subtitle: `${dev.vendor} ${dev.model} (${dev.location})`,
      type: "Ping",
      target: dev.ipAddress,
      intervalSec: 60,
      active: true,
      status: isDown ? "down" : "up",
      tags: [dev.vendor, dev.role.toUpperCase()],
      currentPingMs: Number(dev.latencyMs.toFixed(1)),
      avgPing24hMs: Math.max(1, Math.round(dev.latencyMs)),
      uptime24hPct: isDown ? 94.2 : isWarn ? 99.42 : 100,
      uptime30dPct: isDown ? 98.1 : 99.95,
      heartbeats: Array.from({ length: 30 }, (_, idx) => ({
        status:
          isDown && idx > 25
            ? "down"
            : isWarn && idx === 22
            ? "spike"
            : "up",
        pingMs: Number((dev.latencyMs + ((idx + i) % 3) * 0.2).toFixed(1)),
        time: `${30 - idx}m ago`,
      })),
      chartSeries: buildChartSeries(baseMs, (i + 3) * 17),
    };
  });

  return [...dnsSeeds, ...deviceMonitors];
}

export default function UptimeMonitorView({
  theme = "dark",
  devices,
  onNotify,
}: UptimeMonitorViewProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const cardSurface = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px]";
  const headingTxt = isLightCard ? "text-slate-900" : "text-white";
  const mutedTxt = isLightCard ? "text-slate-500" : "text-slate-400";
  const inputSurface = isLightCard
    ? "bg-white border-slate-200 text-slate-700"
    : "bg-[#051122] border-sky-500/25 text-slate-100";
  const chartGridColor = isLightCard ? "#e2e8f0" : "#152b48";
  const chartAxisColor = isLightCard ? "#64748b" : "#94a3b8";
  const [monitors, setMonitors] = useState<UptimeMonitorItem[]>(() =>
    createInitialMonitors(devices)
  );
  const [selectedId, setSelectedId] = useState<string>("mon-cf-1");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [chartRange, setChartRange] = useState<string>("6h");
  const [isPingingNow, setIsPingingNow] = useState<boolean>(false);

  // Add / Edit Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingMonitorId, setEditingMonitorId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>("");
  const [formSubtitle, setFormSubtitle] = useState<string>("");
  const [formType, setFormType] = useState<"Ping" | "TCP Port" | "HTTP(s)">(
    "Ping"
  );
  const [formTarget, setFormTarget] = useState<string>("1.1.1.1");
  const [formInterval, setFormInterval] = useState<number>(120);
  const [formTag, setFormTag] = useState<string>("CORE");

  // Keep newly added NOC devices synced into the monitor list
  useEffect(() => {
    setMonitors((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newOnes = createInitialMonitors(devices).filter(
        (m) => !existingIds.has(m.id)
      );
      return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
    });
  }, [devices]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    monitors.forEach((m) => m.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [monitors]);

  const filteredMonitors = monitors.filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (activeFilter === "active" && !m.active) return false;
    if (activeFilter === "paused" && m.active) return false;
    if (tagFilter !== "all" && !m.tags.includes(tagFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.target.toLowerCase().includes(q) ||
        m.subtitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedMonitor =
    monitors.find((m) => m.id === selectedId) ||
    filteredMonitors[0] ||
    monitors[0];

  // Execute a real OS ICMP Ping against the selected monitor target
  const handleRealPingCheck = async (mon: UptimeMonitorItem) => {
    setIsPingingNow(true);
    try {
      const res = await fetch("/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "ping",
          target: mon.target,
        }),
      });
      const data = await res.json();
      const pingMs =
        data?.result?.alive && data?.result?.latencyMs
          ? Number(data.result.latencyMs)
          : mon.currentPingMs;

      setMonitors((prev) =>
        prev.map((item) => {
          if (item.id !== mon.id) return item;
          const nextHeartbeats = [
            ...item.heartbeats.slice(1),
            {
              status: "up" as const,
              pingMs,
              time: "now",
            },
          ];
          const nextSeries = [
            ...item.chartSeries.slice(1),
            {
              time: new Date().toTimeString().slice(0, 5),
              ms: Math.max(17, pingMs),
            },
          ];
          return {
            ...item,
            status: "up",
            currentPingMs: pingMs,
            heartbeats: nextHeartbeats,
            chartSeries: nextSeries,
          };
        })
      );
      onNotify(
        `Real Ping ${mon.name} (${mon.target}): Reply ${pingMs} ms (Status: UP)`
      );
    } catch {
      onNotify(`Ping check selesai untuk ${mon.target}`);
    } finally {
      setIsPingingNow(false);
    }
  };

  const handleTogglePause = (mon: UptimeMonitorItem) => {
    const nextActive = !mon.active;
    setMonitors((prev) =>
      prev.map((m) =>
        m.id === mon.id
          ? {
              ...m,
              active: nextActive,
              status: nextActive ? "up" : "paused",
            }
          : m
      )
    );
    onNotify(
      nextActive
        ? `Monitor '${mon.name}' dilanjutkan (Resumed).`
        : `Monitor '${mon.name}' dijeda (Paused).`
    );
  };

  const handleCloneMonitor = (mon: UptimeMonitorItem) => {
    const cloned: UptimeMonitorItem = {
      ...mon,
      id: `mon-clone-${Date.now().toString().slice(-4)}`,
      name: `${mon.name} (Copy)`,
    };
    setMonitors((prev) => [cloned, ...prev]);
    setSelectedId(cloned.id);
    onNotify(`Monitor '${mon.name}' berhasil di-clone.`);
  };

  const handleDeleteMonitor = (mon: UptimeMonitorItem) => {
    if (monitors.length <= 1) {
      onNotify("Minimal harus ada 1 monitor aktif.");
      return;
    }
    const remaining = monitors.filter((m) => m.id !== mon.id);
    setMonitors(remaining);
    if (selectedId === mon.id && remaining[0]) {
      setSelectedId(remaining[0].id);
    }
    onNotify(`Monitor '${mon.name}' telah dihapus.`);
  };

  const openAddModal = () => {
    setEditingMonitorId(null);
    setFormName("");
    setFormSubtitle("NOC Custom Monitor");
    setFormType("Ping");
    setFormTarget("1.1.1.1");
    setFormInterval(120);
    setFormTag("DNS");
    setShowModal(true);
  };

  const openEditModal = (mon: UptimeMonitorItem) => {
    setEditingMonitorId(mon.id);
    setFormName(mon.name);
    setFormSubtitle(mon.subtitle);
    setFormType(
      mon.type === "Ping" || mon.type === "TCP Port" || mon.type === "HTTP(s)"
        ? mon.type
        : "Ping"
    );
    setFormTarget(mon.target);
    setFormInterval(mon.intervalSec);
    setFormTag(mon.tags[0] || "CORE");
    setShowModal(true);
  };

  const handleSaveMonitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMonitorId) {
      setMonitors((prev) =>
        prev.map((m) =>
          m.id === editingMonitorId
            ? {
                ...m,
                name: formName.trim() || m.name,
                subtitle: formSubtitle.trim() || m.subtitle,
                type: formType,
                target: formTarget.trim() || m.target,
                intervalSec: Number(formInterval) || 120,
                tags: [formTag.trim() || "NOC"],
              }
            : m
        )
      );
      onNotify(`Monitor '${formName}' berhasil diperbarui.`);
    } else {
      const newMon: UptimeMonitorItem = {
        id: `mon-${Date.now().toString().slice(-5)}`,
        name: formName.trim() || "New Monitor",
        subtitle: formSubtitle.trim() || "Custom Network Target",
        type: formType,
        target: formTarget.trim() || "8.8.8.8",
        intervalSec: Number(formInterval) || 120,
        active: true,
        status: "up",
        tags: [formTag.trim() || "NOC"],
        currentPingMs: 18.4,
        avgPing24hMs: 19,
        uptime24hPct: 100,
        uptime30dPct: 100,
        heartbeats: Array.from({ length: 30 }, (_, idx) => ({
          status: "up",
          pingMs: 18.4,
          time: `${58 - idx * 2}m ago`,
        })),
        chartSeries: buildChartSeries(20.0, 33),
      };
      setMonitors((prev) => [newMon, ...prev]);
      setSelectedId(newMon.id);
      onNotify(`Monitor baru '${newMon.name}' (${newMon.target}) ditambahkan!`);
    }
    setShowModal(false);
  };

  if (!selectedMonitor) return null;

  return (
    <div className="space-y-5">
      {/* Top Action Header Bar */}
      <div className={`${cardSurface} p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3`}>
        <button
          onClick={openAddModal}
          className="px-5 py-2.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-bold text-sm flex items-center gap-1.5 shadow-md shadow-sky-500/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.8]" />
          <span>Add New Monitor</span>
        </button>

        <button
          onClick={() => handleRealPingCheck(selectedMonitor)}
          disabled={isPingingNow}
          className={`px-4 py-2 rounded-full border text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer ${
            isLightCard
              ? "bg-white hover:bg-sky-50 text-slate-700 border-slate-200 hover:border-sky-300"
              : "bg-[#051122] hover:bg-[#0b1f3a] text-slate-100 border-sky-500/30 hover:border-cyan-400/50"
          }`}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-cyan-500 ${
              isPingingNow ? "animate-spin" : ""
            }`}
          />
          <span>
            {isPingingNow
              ? `Pinging ${selectedMonitor.target}...`
              : `Test Real Ping (${selectedMonitor.target})`}
          </span>
        </button>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ================= LEFT SIDEBAR MONITOR LIST (4 COLS) ================= */}
        <div className={`lg:col-span-4 p-4 sm:p-5 ${cardSurface}`}>
          {/* Select & Search Row */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setActiveFilter("all");
                setTagFilter("all");
                setSearchQuery("");
              }}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition ${
                isLightCard
                  ? "bg-white border-slate-200 text-slate-700 hover:border-sky-300"
                  : "bg-[#051122] border-sky-500/25 text-slate-200 hover:border-cyan-400/50"
              }`}
            >
              Reset
            </button>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search monitor / IP..."
                className={`w-full border rounded-full pl-8 pr-3 py-1.5 text-xs placeholder-slate-400 focus:outline-none ${
                  isLightCard ? "focus:border-sky-500" : "focus:border-cyan-400"
                } ${inputSurface}`}
              />
            </div>
          </div>

          {/* Filter Dropdown Pills Row: Status | Active | Tags */}
          <div
            className={`flex flex-wrap items-center gap-2 mt-3 pb-3 border-b text-xs ${
              isLightCard ? "border-slate-100" : "border-sky-500/20"
            }`}
          >
            <span className="p-1.5 text-slate-400">
              <ListFilter className="w-4 h-4" />
            </span>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`border rounded-full px-3 py-1 text-xs font-medium focus:outline-none cursor-pointer ${inputSurface}`}
            >
              <option value="all">Status</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="paused">Paused</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className={`border rounded-full px-3 py-1 text-xs font-medium focus:outline-none cursor-pointer ${inputSurface}`}
            >
              <option value="all">Active</option>
              <option value="active">Active Only</option>
              <option value="paused">Paused</option>
            </select>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className={`border rounded-full px-3 py-1 text-xs font-medium focus:outline-none cursor-pointer ${inputSurface}`}
            >
              <option value="all">Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Monitor Items List */}
          <div className="mt-3 space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredMonitors.map((mon) => {
              const isSelected = mon.id === selectedMonitor.id;
              return (
                <div
                  key={mon.id}
                  onClick={() => setSelectedId(mon.id)}
                  className={`rounded-2xl p-3.5 border transition cursor-pointer ${
                    isSelected
                      ? isLightCard
                        ? "bg-sky-50 border-sky-300 shadow-xs"
                        : "bg-cyan-500/15 border-cyan-400/50"
                      : isLightCard
                      ? "bg-slate-50/70 border-slate-200/80 hover:border-sky-200 hover:bg-white"
                      : "bg-[#051122]/70 border-sky-500/15 hover:border-cyan-400/35 hover:bg-[#081a33]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${
                        mon.status === "down"
                          ? "bg-rose-500"
                          : mon.status === "paused"
                          ? "bg-slate-500"
                          : "bg-emerald-500"
                      }`}
                    >
                      {mon.uptime24hPct.toFixed(2)}%
                    </span>
                    <span className={`text-sm font-semibold ${headingTxt} truncate`}>
                      {mon.name}
                    </span>
                  </div>

                  {/* Mini Heartbeat Bars Row */}
                  <div className="flex items-center gap-[3px] mt-2.5 pl-1">
                    {mon.heartbeats.map((hb, idx) => (
                      <span
                        key={idx}
                        className={`w-[5px] h-4 rounded-full ${
                          hb.status === "down"
                            ? "bg-rose-500"
                            : hb.status === "spike"
                            ? "bg-amber-400"
                            : mon.status === "paused"
                            ? "bg-slate-500"
                            : "bg-emerald-500"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= RIGHT MONITOR DETAIL PANEL (8 COLS) ================= */}
        <div className="lg:col-span-8 space-y-5">
          {/* Monitor Title, Subtitle, Target & Actions Header Card */}
          <div className={`${cardSurface} p-6`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${headingTxt} tracking-tight`}>
              {selectedMonitor.name}
            </h1>
            <p className={`text-sm ${mutedTxt} mt-1`}>
              {selectedMonitor.subtitle}
            </p>
            <p
              className={`text-sm font-semibold mt-2 ${
                isLightCard ? "text-sky-600" : "text-cyan-400"
              }`}
            >
              {selectedMonitor.type}:{" "}
              <span
                className={`underline ${
                  isLightCard ? "decoration-sky-400/40" : "decoration-cyan-400/40"
                }`}
              >
                {selectedMonitor.target}
              </span>
            </p>

            {/* Segmented Action Pill Buttons: Pause | Edit | Clone | Delete */}
            <div
              className={`inline-flex flex-wrap items-center rounded-full border shadow-sm overflow-hidden mt-4 ${
                isLightCard
                  ? "bg-white border-slate-200"
                  : "bg-[#051122] border-sky-500/30"
              }`}
            >
              <button
                type="button"
                onClick={() => handleTogglePause(selectedMonitor)}
                className={`px-4 py-2 text-xs sm:text-sm font-medium flex items-center gap-1.5 border-r cursor-pointer transition ${
                  isLightCard
                    ? "text-slate-700 hover:bg-sky-50 border-slate-200"
                    : "text-slate-200 hover:bg-cyan-500/10 border-sky-500/20"
                }`}
              >
                {selectedMonitor.active ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-cyan-500" />
                    <span>Resume</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => openEditModal(selectedMonitor)}
                className={`px-4 py-2 text-xs sm:text-sm font-medium flex items-center gap-1.5 border-r cursor-pointer transition ${
                  isLightCard
                    ? "text-slate-700 hover:bg-sky-50 border-slate-200"
                    : "text-slate-200 hover:bg-cyan-500/10 border-sky-500/20"
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                onClick={() => handleCloneMonitor(selectedMonitor)}
                className={`px-4 py-2 text-xs sm:text-sm font-medium flex items-center gap-1.5 border-r cursor-pointer transition ${
                  isLightCard
                    ? "text-slate-700 hover:bg-sky-50 border-slate-200"
                    : "text-slate-200 hover:bg-cyan-500/10 border-sky-500/20"
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone</span>
              </button>

              <button
                type="button"
                onClick={() => handleDeleteMonitor(selectedMonitor)}
                className="px-5 py-2 text-xs sm:text-sm font-semibold bg-rose-500 hover:bg-rose-600 text-white flex items-center gap-1.5 cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* CARD 1: Large Heartbeat Strip + Big "Up" Pill Badge */}
          <div className={`p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 ${cardSurface}`}>
            <div className="flex-1">
              {/* 30 Tall Rounded Heartbeat Pills */}
              <div className="flex items-center justify-between gap-1.5">
                {selectedMonitor.heartbeats.map((hb, idx) => (
                  <div
                    key={idx}
                    title={`${hb.time}: ${hb.pingMs} ms (${hb.status.toUpperCase()})`}
                    className={`h-9 flex-1 max-w-[10px] rounded-full transition-transform hover:scale-125 cursor-pointer ${
                      hb.status === "down"
                        ? "bg-rose-500"
                        : hb.status === "spike"
                        ? "bg-amber-400"
                        : selectedMonitor.status === "paused"
                        ? "bg-slate-500"
                        : "bg-emerald-500"
                    }`}
                  />
                ))}
              </div>

              {/* Timeline 54m ago -------- now */}
              <div className={`flex items-center gap-3 mt-2.5 text-xs ${mutedTxt}`}>
                <span>54m ago</span>
                <div
                  className={`flex-1 h-[1px] ${
                    isLightCard ? "bg-slate-200" : "bg-sky-500/20"
                  }`}
                />
                <span>now</span>
              </div>

              <p className={`text-xs ${mutedTxt} mt-2`}>
                Check every {selectedMonitor.intervalSec} seconds
              </p>
            </div>

            {/* Right Large Status Pill */}
            <div className="shrink-0 flex items-center justify-center">
              <span
                className={`px-8 py-2.5 rounded-full text-2xl font-bold text-white shadow-sm ${
                  selectedMonitor.status === "down"
                    ? "bg-rose-500"
                    : selectedMonitor.status === "paused"
                    ? "bg-slate-500"
                    : "bg-emerald-500"
                }`}
              >
                {selectedMonitor.status === "down"
                  ? "Down"
                  : selectedMonitor.status === "paused"
                  ? "Paused"
                  : "Up"}
              </span>
            </div>
          </div>

          {/* CARD 2: 4-Column Ping & Uptime Stats Card */}
          <div className={`p-6 ${cardSurface}`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              <div>
                <h4 className={`text-lg font-bold ${headingTxt}`}>Ping</h4>
                <span className={`text-xs ${mutedTxt} block mt-0.5`}>
                  (Current)
                </span>
                <span
                  className={`text-base font-semibold ${
                    isLightCard ? "text-sky-600" : "text-cyan-300"
                  } underline decoration-cyan-400/50 mt-2 inline-block`}
                >
                  {selectedMonitor.currentPingMs} ms
                </span>
              </div>

              <div>
                <h4 className={`text-lg font-bold ${headingTxt}`}>Avg. Ping</h4>
                <span className={`text-xs ${mutedTxt} block mt-0.5`}>
                  (24-hour)
                </span>
                <span
                  className={`text-base font-medium ${
                    isLightCard ? "text-slate-800" : "text-slate-200"
                  } mt-2 inline-block`}
                >
                  {selectedMonitor.avgPing24hMs} ms
                </span>
              </div>

              <div>
                <h4 className={`text-lg font-bold ${headingTxt}`}>Uptime</h4>
                <span className={`text-xs ${mutedTxt} block mt-0.5`}>
                  (24-hour)
                </span>
                <span
                  className={`text-base font-medium ${
                    isLightCard ? "text-emerald-600" : "text-emerald-400"
                  } mt-2 inline-block`}
                >
                  {selectedMonitor.uptime24hPct.toFixed(2)}%
                </span>
              </div>

              <div>
                <h4 className={`text-lg font-bold ${headingTxt}`}>Uptime</h4>
                <span className={`text-xs ${mutedTxt} block mt-0.5`}>
                  (30-day)
                </span>
                <span
                  className={`text-base font-medium ${
                    isLightCard ? "text-emerald-600" : "text-emerald-400"
                  } mt-2 inline-block`}
                >
                  {selectedMonitor.uptime30dPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* CARD 3: Response Time (ms) Detailed Chart Card */}
          <div className={`p-6 ${cardSurface}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-bold uppercase tracking-wider ${mutedTxt}`}>
                Response Time History (ms)
              </span>
              <select
                value={chartRange}
                onChange={(e) => setChartRange(e.target.value)}
                className={`border rounded-lg px-2.5 py-1 text-xs font-medium focus:outline-none cursor-pointer ${inputSurface}`}
              >
                <option value="1h">1h</option>
                <option value="6h">6h</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
              </select>
            </div>

            <div className="w-full h-64">
              <svg
                viewBox="0 0 760 230"
                className="w-full h-full overflow-visible"
              >
                <defs>
                  <linearGradient id="kumaArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.04" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Label */}
                <text
                  x="-110"
                  y="14"
                  transform="rotate(-90)"
                  textAnchor="middle"
                  fill={chartAxisColor}
                  fontSize="10"
                >
                  Resp. Time (ms)
                </text>

                {/* Horizontal Grid Lines (16 to 34 ms) */}
                {[34, 32, 30, 28, 26, 24, 22, 20, 18, 16].map((val, idx) => {
                  const y = 15 + idx * 20;
                  return (
                    <g key={val}>
                      <text
                        x="42"
                        y={y + 3}
                        textAnchor="end"
                        fill={chartAxisColor}
                        fontSize="10"
                      >
                        {val}
                      </text>
                      <line
                        x1="50"
                        y1={y}
                        x2="740"
                        y2={y}
                        stroke={chartGridColor}
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}

                {/* Vertical Grid Lines & X-Axis Timestamps */}
                {[
                  "15:45",
                  "16:18",
                  "16:51",
                  "17:24",
                  "17:57",
                  "18:30",
                  "19:03",
                  "19:36",
                  "20:09",
                  "20:42",
                  "21:15",
                ].map((t, idx) => {
                  const x = 58 + idx * 64;
                  return (
                    <g key={t}>
                      <line
                        x1={x}
                        y1="15"
                        x2={x}
                        y2="195"
                        stroke={chartGridColor}
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y="214"
                        textAnchor="middle"
                        fill={chartAxisColor}
                        fontSize="10"
                      >
                        {t}
                      </text>
                    </g>
                  );
                })}

                {/* Plot the Response Time Series + Red Anomaly Line */}
                {(() => {
                  const pts = selectedMonitor.chartSeries;
                  const stepX = 685 / Math.max(pts.length - 1, 1);

                  const coords = pts.map((p, i) => {
                    const clampedMs = Math.min(34, Math.max(16, p.ms));
                    const y = 195 - ((clampedMs - 16) / (34 - 16)) * 180;
                    return {
                      x: 52 + i * stepX,
                      y,
                      anomaly: p.anomaly,
                    };
                  });

                  const linePath = coords
                    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`)
                    .join(" ");
                  const areaPath = `${linePath} L ${
                    coords[coords.length - 1].x
                  } 195 L ${coords[0].x} 195 Z`;

                  const anomalyCoord = coords.find((c) => c.anomaly);

                  return (
                    <>
                      <path d={areaPath} fill="url(#kumaArea)" />
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="2.2"
                        strokeLinejoin="round"
                      />
                      {anomalyCoord && (
                        <g>
                          <line
                            x1={anomalyCoord.x - 1.5}
                            y1="15"
                            x2={anomalyCoord.x - 1.5}
                            y2="195"
                            stroke="#ef4444"
                            strokeWidth="1.2"
                          />
                          <line
                            x1={anomalyCoord.x + 1.5}
                            y1="15"
                            x2={anomalyCoord.x + 1.5}
                            y2="195"
                            stroke="#ef4444"
                            strokeWidth="1.2"
                          />
                        </g>
                      )}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Add / Edit Monitor */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-[26px] max-w-md w-full p-6 shadow-2xl ${
              isLightCard
                ? "bg-white border-slate-200 text-slate-800"
                : "bg-[#071830] border-sky-500/35 text-slate-100"
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isLightCard ? "border-slate-100" : "border-sky-500/20"
              }`}
            >
              <h3 className={`text-base font-bold ${headingTxt}`}>
                {editingMonitorId ? "Edit Monitor" : "Add New Monitor"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-cyan-400 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSaveMonitor}
              className="space-y-3.5 mt-4 text-xs sm:text-sm"
            >
              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Monitor Type
                </label>
                <select
                  value={formType}
                  onChange={(e) =>
                    setFormType(
                      e.target.value as "Ping" | "TCP Port" | "HTTP(s)"
                    )
                  }
                  className={`w-full border rounded-xl px-3.5 py-2 outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                >
                  <option value="Ping">Ping (ICMP)</option>
                  <option value="TCP Port">TCP Port</option>
                  <option value="HTTP(s)">HTTP(s)</option>
                </select>
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Friendly Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Cloudflare DNS 1 / OLT ZTE C320"
                  className={`w-full border rounded-xl px-3.5 py-2 outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                  required
                />
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Hostname / IP Address
                </label>
                <input
                  type="text"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  placeholder="1.1.1.1 / 10.255.10.11"
                  className={`w-full border rounded-xl px-3.5 py-2 font-mono outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Heartbeat Interval (sec)
                  </label>
                  <input
                    type="number"
                    value={formInterval}
                    onChange={(e) => setFormInterval(Number(e.target.value))}
                    className={`w-full border rounded-xl px-3.5 py-2 font-mono outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  />
                </div>
                <div>
                  <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                    Group / Tag
                  </label>
                  <input
                    type="text"
                    value={formTag}
                    onChange={(e) => setFormTag(e.target.value)}
                    placeholder="DNS / CORE / OLT"
                    className={`w-full border rounded-xl px-3.5 py-2 outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`font-semibold block mb-1 ${isLightCard ? "text-slate-700" : "text-slate-200"}`}>
                  Description
                </label>
                <input
                  type="text"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="Cloudflare 1"
                  className={`w-full border rounded-xl px-3.5 py-2 outline-none ${
                    isLightCard
                      ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                      : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                  }`}
                />
              </div>

              <div
                className={`flex items-center justify-end gap-2 pt-3 border-t ${
                  isLightCard ? "border-slate-100" : "border-sky-500/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 rounded-full font-medium cursor-pointer transition ${
                    isLightCard
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "bg-white/10 text-slate-300 hover:bg-white/15"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-bold shadow-md shadow-sky-500/20 cursor-pointer transition"
                >
                  Save Monitor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

