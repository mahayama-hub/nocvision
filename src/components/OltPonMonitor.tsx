"use client";

import React, { useState } from "react";
import { NetworkDevice, OnuDevice } from "@/lib/types";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  Plus,
  PowerOff,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

import type { BentoTheme } from "./BentoOverviewDashboard";

interface OltPonMonitorProps {
  theme?: BentoTheme;
  devices: NetworkDevice[];
  onus: OnuDevice[];
  onProvisionOnu: (payload: Record<string, unknown>) => Promise<void>;
  onRebootOnu: (onuId: string) => Promise<void>;
}

export default function OltPonMonitor({
  theme = "dark",
  devices,
  onus,
  onProvisionOnu,
  onRebootOnu,
}: OltPonMonitorProps) {
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
  const oltDevices = devices.filter((d) => d.role === "olt");
  const [selectedOltId, setSelectedOltId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [busyOnuId, setBusyOnuId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // New ONU Registration form state
  const [newOnuOltId, setNewOnuOltId] = useState<string>(
    oltDevices[0]?.id || "dev-olt-01"
  );
  const [newOnuPonPort, setNewOnuPonPort] = useState<string>("gpon-olt_1/1/1");
  const [newOnuSn, setNewOnuSn] = useState<string>("ZTEGC558899A");
  const [newOnuCustomer, setNewOnuCustomer] = useState<string>("");
  const [newOnuPppoe, setNewOnuPppoe] = useState<string>("");
  const [newOnuOdp, setNewOnuOdp] = useState<string>("ODP-SEL-01/05");
  const [newOnuVlan, setNewOnuVlan] = useState<number>(101);
  const [newOnuProfile, setNewOnuProfile] = useState<string>("HOME-100M");

  // Aggregate PON port stats across all OLTs
  const allPonPorts = oltDevices.flatMap((olt) =>
    (olt.ponPorts || []).map((p) => ({
      ...p,
      oltId: olt.id,
      oltName: olt.name,
      vendor: olt.vendor,
    }))
  );

  const totalOnuFleet = allPonPorts.reduce((acc, p) => acc + p.totalOnu, 0);
  const totalOnlineFleet = allPonPorts.reduce((acc, p) => acc + p.onlineOnu, 0);
  const totalLosFleet = allPonPorts.reduce((acc, p) => acc + p.losOnu, 0);
  const totalDyingGaspFleet = allPonPorts.reduce(
    (acc, p) => acc + p.dyingGaspOnu,
    0
  );

  const filteredOnus = onus.filter((onu) => {
    if (selectedOltId !== "all" && onu.oltId !== selectedOltId) return false;
    if (statusFilter === "high_atten") {
      if (onu.status !== "online" || onu.rxPowerDbm > -24.0) return false;
    } else if (statusFilter !== "all" && onu.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        onu.customerName.toLowerCase().includes(q) ||
        onu.sn.toLowerCase().includes(q) ||
        onu.pppoeUser.toLowerCase().includes(q) ||
        onu.odpName.toLowerCase().includes(q) ||
        onu.ponPort.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getOpticalPowerBadge = (onu: OnuDevice) => {
    if (onu.status === "los") {
      return {
        label: "LOS (-40.0 dBm)",
        sub: "Putus FO / Konektor Lepas",
        cls: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      };
    }
    if (onu.status === "dying_gasp") {
      return {
        label: "OFF (DyingGasp)",
        sub: "Listrik Pelanggan Padam",
        cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      };
    }
    if (onu.rxPowerDbm <= -27.0) {
      return {
        label: `${onu.rxPowerDbm} dBm (KRITIS)`,
        sub: `OLT Rx: ${onu.oltRxPowerDbm} dBm`,
        cls: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      };
    }
    if (onu.rxPowerDbm <= -24.0) {
      return {
        label: `${onu.rxPowerDbm} dBm (WARNING)`,
        sub: `OLT Rx: ${onu.oltRxPowerDbm} dBm`,
        cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      };
    }
    return {
      label: `${onu.rxPowerDbm} dBm (OPTIMAL)`,
      sub: `OLT Rx: ${onu.oltRxPowerDbm} dBm`,
      cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    };
  };

  const generateVendorCliForOnu = (onu: OnuDevice) => {
    if (onu.oltVendor === "ZTE") {
      return `show pon power attenuation ${onu.ponPort.replace("olt", "onu")}:${onu.onuIndex}`;
    }
    if (onu.oltVendor === "Huawei") {
      return `display ont optical-info 0 1 0 ${onu.onuIndex}`;
    }
    if (onu.oltVendor === "FiberHome") {
      return `show optical-module-info slot 1 pon 1 onu ${onu.onuIndex}`;
    }
    return `show ont optical-info 1 ${onu.onuIndex}`;
  };

  const handleCopyCli = (onu: OnuDevice) => {
    const cmd = generateVendorCliForOnu(onu);
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(onu.id);
    setTimeout(() => setCopiedCmd(null), 1800);
  };

  const handleReboot = async (onuId: string) => {
    setBusyOnuId(onuId);
    try {
      await onRebootOnu(onuId);
    } finally {
      setBusyOnuId(null);
    }
  };

  const handleQuickProvision = async (onu: OnuDevice) => {
    setBusyOnuId(onu.id);
    try {
      await onProvisionOnu({
        onuId: onu.id,
        customerName: onu.customerName.replace("[NEW UNCONFIGURED] ", ""),
        pppoeUser: `ftth-${onu.sn.slice(-5).toLowerCase()}@nocvision.id`,
        vlan: 103,
        serviceProfile: "HOME-100M",
      });
    } finally {
      setBusyOnuId(null);
    }
  };

  const handleCreateNewOnu = async (e: React.FormEvent) => {
    e.preventDefault();
    await onProvisionOnu({
      oltId: newOnuOltId,
      ponPort: newOnuPonPort,
      sn: newOnuSn,
      customerName: newOnuCustomer || "Pelanggan Baru FTTH",
      pppoeUser: newOnuPppoe || "pelanggan-baru@nocvision.id",
      odpName: newOnuOdp,
      vlan: newOnuVlan,
      serviceProfile: newOnuProfile,
    });
    setShowRegisterModal(false);
    setNewOnuCustomer("");
    setNewOnuPppoe("");
  };

  return (
    <div className="space-y-6">
      {/* Top Optical & PON Summary Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className={`${cardCls} p-4`}>
          <div className={`flex items-center justify-between text-xs ${mutedText}`}>
            <span>Total OLT &amp; PON Ports</span>
            <Radio className="w-4 h-4 text-cyan-400" />
          </div>
          <p className={`text-2xl font-bold ${headingText} mt-1 font-mono`}>
            {oltDevices.length} OLT / {allPonPorts.length} PON
          </p>
          <p className={`text-[11px] ${mutedText} mt-1`}>
            ZTE, Huawei, FiberHome, HSGQ
          </p>
        </div>

        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between text-xs text-emerald-500 font-semibold">
            <span>ONU / ONT Online</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-500 mt-1 font-mono">
            {totalOnlineFleet}{" "}
            <span className={`text-xs ${mutedText} font-normal`}>
              / {totalOnuFleet}
            </span>
          </p>
          <p className="text-[11px] text-emerald-500/80 mt-1">
            Availability{" "}
            {totalOnuFleet > 0
              ? ((totalOnlineFleet / totalOnuFleet) * 100).toFixed(1)
              : "100"}
            %
          </p>
        </div>

        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between text-xs text-rose-500 font-semibold">
            <span>LOS (Loss of Signal / FO Putus)</span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-500 mt-1 font-mono">
            {totalLosFleet} ONU
          </p>
          <p className="text-[11px] text-rose-500/80 mt-1">
            Indikasi putus kabel dropcore/ODP
          </p>
        </div>

        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between text-xs text-amber-500 font-semibold">
            <span>Dying-Gasp (Listrik PLN Mati)</span>
            <PowerOff className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-500 mt-1 font-mono">
            {totalDyingGaspFleet} ONU
          </p>
          <p className="text-[11px] text-amber-500/80 mt-1">
            Adaptor ONT mati / PLN padam
          </p>
        </div>

        <div className={`${cardCls} p-4 col-span-2 lg:col-span-1 flex flex-col justify-between`}>
          <div className={`flex items-center justify-between text-xs ${cyanNum} font-semibold`}>
            <span>Provisioning ONU / ONT</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <button
            onClick={() => setShowRegisterModal(true)}
            className="mt-2 w-full py-2 px-3 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Register / Tambah ONU
          </button>
        </div>
      </div>

      {/* Multi-Vendor PON Port Health Cards */}
      <div className={`${cardCls} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className={`text-base font-semibold ${headingText} flex items-center gap-2`}>
              <Zap className="w-4 h-4 text-amber-400" />
              Status Modul SFP GPON / EPON / XGS-PON per OLT
            </h3>
            <p className={`text-xs ${mutedText}`}>
              Monitoring Laser Tx Power SFP OLT, Temperatur Optik, dan Rasio Splitter per ODC
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedOltId("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                selectedOltId === "all"
                  ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-semibold"
                  : isLightCard
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                  : "bg-[#051122] text-slate-300 hover:bg-slate-800 border border-sky-500/20"
              }`}
            >
              Semua OLT ({oltDevices.length})
            </button>
            {oltDevices.map((olt) => (
              <button
                key={olt.id}
                onClick={() => setSelectedOltId(olt.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                  selectedOltId === olt.id
                    ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-semibold"
                    : isLightCard
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                    : "bg-[#051122] text-slate-300 hover:bg-slate-800 border border-sky-500/20"
                }`}
              >
                {olt.name} ({olt.vendor})
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {allPonPorts
            .filter((p) => selectedOltId === "all" || p.oltId === selectedOltId)
            .map((pon) => {
              const onlinePct =
                pon.totalOnu > 0
                  ? Math.round((pon.onlineOnu / pon.totalOnu) * 100)
                  : 100;
              return (
                <div
                  key={pon.id}
                  className={`rounded-2xl p-3.5 border transition ${
                    pon.losOnu > 0
                      ? isLightCard
                        ? "bg-rose-50 border-rose-300"
                        : "bg-rose-950/20 border-rose-500/40"
                      : pon.dyingGaspOnu > 0
                      ? isLightCard
                        ? "bg-amber-50 border-amber-300"
                        : "bg-amber-950/20 border-amber-500/35"
                      : subBoxCls
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                          VENDOR_PROFILES[pon.vendor]?.badgeColor ||
                          VENDOR_PROFILES.Other.badgeColor
                        }`}
                      >
                        {pon.vendor}
                      </span>
                      <span className={`font-mono font-bold text-sm ${headingText}`}>
                        {pon.portName}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          isLightCard
                            ? "bg-sky-100 text-sky-700"
                            : "bg-slate-800 text-cyan-300"
                        }`}
                      >
                        {pon.ponType}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-emerald-500 font-semibold">
                      Tx +{pon.sfpTxDbm} dBm
                    </span>
                  </div>

                  <p className={`text-xs ${isLightCard ? "text-slate-700" : "text-slate-300"} mt-1.5 font-medium truncate`}>
                    {pon.odcArea}
                  </p>
                  <p className={`text-[11px] ${mutedText}`}>
                    OLT: {pon.oltName} • SFP Temp: {pon.sfpTempC}°C • Split 1:
                    {pon.maxSplitRatio}
                  </p>

                  {/* Progress Bar */}
                  <div
                    className={`w-full h-2 rounded-full overflow-hidden mt-2.5 flex ${
                      isLightCard ? "bg-slate-200" : "bg-slate-800"
                    }`}
                  >
                    <div
                      style={{ width: `${onlinePct}%` }}
                      className="bg-emerald-500 h-full"
                    />
                    {pon.losOnu > 0 && (
                      <div
                        style={{
                          width: `${(pon.losOnu / pon.totalOnu) * 100}%`,
                        }}
                        className="bg-rose-500 h-full"
                      />
                    )}
                    {pon.dyingGaspOnu > 0 && (
                      <div
                        style={{
                          width: `${(pon.dyingGaspOnu / pon.totalOnu) * 100}%`,
                        }}
                        className="bg-amber-400 h-full"
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[11px] font-mono">
                    <span className="text-emerald-500">
                      Online: {pon.onlineOnu}/{pon.totalOnu}
                    </span>
                    <span
                      className={
                        pon.losOnu > 0
                          ? "text-rose-500 font-bold"
                          : mutedText
                      }
                    >
                      LOS: {pon.losOnu}
                    </span>
                    <span
                      className={
                        pon.dyingGaspOnu > 0
                          ? "text-amber-500 font-bold"
                          : mutedText
                      }
                    >
                      DyingGasp: {pon.dyingGaspOnu}
                    </span>
                    <span className="text-sky-500">
                      {pon.txTrafficMbps} Mbps
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Detailed ONU / ONT Optical Power & Status Table */}
      <div className={`${cardCls} p-5`}>
        <div
          className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b ${
            isLightCard ? "border-slate-200" : "border-sky-500/20"
          }`}
        >
          <div>
            <h3 className={`text-base font-semibold ${headingText} flex items-center gap-2`}>
              <Activity className="w-4 h-4 text-cyan-400" />
              Daftar Real-Time Redaman Optik ONU / ONT Pelanggan (Multi-Vendor)
            </h3>
            <p className={`text-xs ${mutedText} mt-0.5`}>
              Ambang Redaman GPON: Optimal (-8 s/d -24 dBm) • Warning (-24 s/d -27 dBm) • Critical (&lt; -27 dBm)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari SN, Pelanggan, ODP, PPPoE..."
                className={`rounded-full pl-8 pr-3 py-1.5 text-xs placeholder-slate-400 focus:outline-none focus:border-cyan-400 w-60 border ${
                  isLightCard
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#051122] border-sky-500/25 text-white"
                }`}
              />
            </div>

            {/* Filter pills */}
            {[
              { id: "all", label: "Semua ONU" },
              { id: "online", label: "Online" },
              { id: "high_atten", label: "Redaman Tinggi (<-24dBm)" },
              { id: "los", label: "LOS (Putus FO)" },
              { id: "dying_gasp", label: "DyingGasp (Mati Listrik)" },
              { id: "unconfigured", label: "Unconfigured (Baru)" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                  statusFilter === tab.id
                    ? isLightCard
                      ? "bg-sky-500 text-white shadow-sm"
                      : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : isLightCard
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                    : "bg-[#051122] text-slate-400 hover:text-slate-200 border border-sky-500/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className={`border-b text-[11px] uppercase tracking-wider ${mutedText} ${
                  isLightCard ? "border-slate-200" : "border-sky-500/20"
                }`}
              >
                <th className="py-2.5 px-3">OLT &amp; PON Index</th>
                <th className="py-2.5 px-3">SN / Model ONT</th>
                <th className="py-2.5 px-3">Pelanggan &amp; ODP</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Redaman Optik (Rx / OLT Rx)</th>
                <th className="py-2.5 px-3">Jarak &amp; Traffic</th>
                <th className="py-2.5 px-3">Diagnosa Terakhir</th>
                <th className="py-2.5 px-3 text-right">Aksi NOC</th>
              </tr>
            </thead>
            <tbody
              className={`divide-y text-xs ${
                isLightCard ? "divide-slate-100" : "divide-sky-500/15"
              }`}
            >
              {filteredOnus.map((onu) => {
                const badge = getOpticalPowerBadge(onu);
                return (
                  <tr
                    key={onu.id}
                    className={`transition-colors ${
                      isLightCard ? "hover:bg-slate-50" : "hover:bg-sky-950/30"
                    }`}
                  >
                    <td className="py-3 px-3 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] rounded border ${
                            VENDOR_PROFILES[onu.oltVendor]?.badgeColor ||
                            VENDOR_PROFILES.Other.badgeColor
                          }`}
                        >
                          {onu.oltVendor}
                        </span>
                        <span className={`font-semibold ${headingText}`}>
                          {onu.ponPort}:{onu.onuIndex}
                        </span>
                      </div>
                      <span className={`text-[11px] ${mutedText} block mt-0.5`}>
                        {onu.oltName}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`font-mono font-semibold ${cyanNum} block`}>
                        {onu.sn}
                      </span>
                      <span className={`text-[11px] ${mutedText}`}>
                        {onu.model} • VLAN {onu.vlan}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`font-medium ${headingText} block`}>
                        {onu.customerName}
                      </span>
                      <span className={`text-[11px] ${mutedText} font-mono`}>
                        {onu.odpName} • {onu.pppoeUser}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {onu.status === "online" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          ONLINE
                        </span>
                      )}
                      {onu.status === "los" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-500 border border-rose-500/40 animate-pulse">
                          <AlertOctagon className="w-3 h-3" />
                          LOS (PUTUS FO)
                        </span>
                      )}
                      {onu.status === "dying_gasp" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/40">
                          <PowerOff className="w-3 h-3" />
                          DYING-GASP
                        </span>
                      )}
                      {onu.status === "unconfigured" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/20 text-cyan-500 border border-cyan-500/40">
                          <Sparkles className="w-3 h-3" />
                          UNCFG / BARU
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 font-mono">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className={`block text-[10px] ${mutedText} mt-0.5`}>
                        {badge.sub} • Tx: +{onu.txPowerDbm} dBm
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono">
                      <span className={`${isLightCard ? "text-slate-700" : "text-slate-200"} block`}>
                        {(onu.distanceM / 1000).toFixed(2)} km ({onu.distanceM}m)
                      </span>
                      <span className="text-[11px] text-emerald-500">
                        &darr;{onu.rxMbps}M{" "}
                        <span className="text-sky-500">&uarr;{onu.txMbps}M</span>
                      </span>
                    </td>

                    <td className="py-3 px-3 max-w-[210px]">
                      <span className={`text-[11px] ${isLightCard ? "text-slate-700" : "text-slate-300"} block truncate`}>
                        {onu.lastDownCause}
                      </span>
                      <span className={`text-[10px] ${mutedText} font-mono`}>
                        Uptime: {onu.uptime} • IP: {onu.ipAddress}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onu.status === "unconfigured" ? (
                          <button
                            onClick={() => handleQuickProvision(onu)}
                            disabled={busyOnuId === onu.id}
                            className="px-2.5 py-1 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-[11px] transition cursor-pointer"
                          >
                            {busyOnuId === onu.id
                              ? "Memproses..."
                              : "Auto-Provision"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReboot(onu.id)}
                            disabled={busyOnuId === onu.id}
                            title="Reset / Re-sync Optical ONU"
                            className={`px-2.5 py-1 rounded-full border text-[11px] flex items-center gap-1 transition cursor-pointer ${
                              isLightCard
                                ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                            }`}
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${
                                busyOnuId === onu.id ? "animate-spin" : ""
                              }`}
                            />
                            Reset
                          </button>
                        )}

                        <button
                          onClick={() => handleCopyCli(onu)}
                          title={generateVendorCliForOnu(onu)}
                          className={`px-2.5 py-1 rounded-full border text-[11px] flex items-center gap-1 transition cursor-pointer ${
                            isLightCard
                              ? "bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200"
                              : "bg-[#051122] hover:bg-slate-800 text-cyan-300 border-sky-500/25"
                          }`}
                        >
                          {copiedCmd === onu.id ? (
                            <>Copied!</>
                          ) : (
                            <>
                              <Terminal className="w-3 h-3" />
                              CLI
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Register / Provision ONU Baru */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`border rounded-[26px] max-w-lg w-full p-6 shadow-2xl ${
              isLightCard
                ? "bg-white border-slate-200 text-slate-800"
                : "bg-[#071830] border-sky-500/35 text-slate-100"
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isLightCard ? "border-slate-200" : "border-sky-500/20"
              }`}
            >
              <h3 className={`text-base font-bold flex items-center gap-2 ${isLightCard ? "text-slate-900" : "text-white"}`}>
                <Sparkles className={`w-4 h-4 ${isLightCard ? "text-sky-600" : "text-cyan-400"}`} />
                Provisioning / Registrasi ONU &amp; ONT Baru
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className={`text-sm cursor-pointer ${
                  isLightCard ? "text-slate-400 hover:text-slate-700" : "text-slate-400 hover:text-white"
                }`}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewOnu} className="space-y-3.5 mt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Pilih OLT Target
                  </label>
                  <select
                    value={newOnuOltId}
                    onChange={(e) => setNewOnuOltId(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  >
                    {oltDevices.map((olt) => (
                      <option key={olt.id} value={olt.id}>
                        {olt.name} ({olt.vendor})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    PON Port
                  </label>
                  <input
                    type="text"
                    value={newOnuPonPort}
                    onChange={(e) => setNewOnuPonPort(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 font-mono outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Serial Number (SN) / MAC ONT
                  </label>
                  <input
                    type="text"
                    value={newOnuSn}
                    onChange={(e) => setNewOnuSn(e.target.value)}
                    placeholder="ZTEGC1122334 / HWTC..."
                    className={`w-full border rounded-xl px-3 py-2 font-mono outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-sky-700 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-cyan-300 focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Lokasi ODP / Splitter
                  </label>
                  <input
                    type="text"
                    value={newOnuOdp}
                    onChange={(e) => setNewOnuOdp(e.target.value)}
                    placeholder="ODP-SEL-01/05"
                    className={`w-full border rounded-xl px-3 py-2 outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Nama Pelanggan
                  </label>
                  <input
                    type="text"
                    value={newOnuCustomer}
                    onChange={(e) => setNewOnuCustomer(e.target.value)}
                    placeholder="Contoh: PT Maju Jaya / Bpk Budi"
                    className={`w-full border rounded-xl px-3 py-2 outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Username PPPoE / IP
                  </label>
                  <input
                    type="text"
                    value={newOnuPppoe}
                    onChange={(e) => setNewOnuPppoe(e.target.value)}
                    placeholder="budi-ftth@nocvision.id"
                    className={`w-full border rounded-xl px-3 py-2 font-mono outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Service VLAN ID
                  </label>
                  <input
                    type="number"
                    value={newOnuVlan}
                    onChange={(e) => setNewOnuVlan(Number(e.target.value))}
                    className={`w-full border rounded-xl px-3 py-2 font-mono outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-medium ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
                    Bandwidth Profile
                  </label>
                  <select
                    value={newOnuProfile}
                    onChange={(e) => setNewOnuProfile(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 outline-none ${
                      isLightCard
                        ? "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500"
                        : "bg-[#051122] border-sky-500/25 text-white focus:border-cyan-400"
                    }`}
                  >
                    <option value="HOME-50M">HOME-50M</option>
                    <option value="HOME-100M">HOME-100M</option>
                    <option value="BIZ-200M">BIZ-200M</option>
                    <option value="CORP-500M">CORP-500M</option>
                    <option value="XGSPON-1Gbps">XGSPON-1Gbps</option>
                  </select>
                </div>
              </div>

              <div
                className={`flex items-center justify-end gap-2 pt-3 border-t ${
                  isLightCard ? "border-slate-200" : "border-sky-500/20"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className={`px-4 py-2 rounded-xl cursor-pointer transition ${
                    isLightCard
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-white/10 text-slate-300 hover:bg-white/15"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-semibold shadow-sm cursor-pointer transition"
                >
                  Provision &amp; Aktifkan ONU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

