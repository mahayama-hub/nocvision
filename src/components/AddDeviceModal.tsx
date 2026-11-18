"use client";

import React, { useState } from "react";
import { DeviceRole, VendorBrand } from "@/lib/types";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";
import type { BentoTheme } from "./BentoOverviewDashboard";
import { Plus, Router } from "lucide-react";

interface AddDeviceModalProps {
  theme?: BentoTheme;
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (payload: Record<string, unknown>) => Promise<void>;
}

const VENDORS: VendorBrand[] = [
  "MikroTik",
  "Cisco",
  "Juniper",
  "Huawei",
  "ZTE",
  "FiberHome",
  "HSGQ",
  "C-Data",
  "V-SOL",
  "BDCOM",
  "Ruijie",
  "Arista",
  "Ubiquiti",
  "Fortinet",
  "Other",
];

const ROLES: { value: DeviceRole; label: string }[] = [
  { value: "core_router", label: "Core Router / Border BGP / BRAS" },
  { value: "dist_switch", label: "Distribution / Aggregation Switch" },
  { value: "access_switch", label: "Access / PoE Switch" },
  { value: "olt", label: "OLT (Optical Line Terminal - GPON/EPON/XGS-PON)" },
  { value: "firewall", label: "Firewall / Security Gateway" },
  { value: "wireless", label: "Wireless Backhaul / PTP Radio" },
];

export default function AddDeviceModal({
  theme = "dark",
  isOpen,
  onClose,
  onAddDevice,
}: AddDeviceModalProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("192.168.1.1");
  const [vendor, setVendor] = useState<VendorBrand>("MikroTik");
  const [role, setRole] = useState<DeviceRole>("core_router");
  const [model, setModel] = useState("CCR2116-12G-4S+");
  const [location, setLocation] = useState("POP Utama - Rack A1");
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("");
  const [sshPassword, setSshPassword] = useState("");
  const [pollingMode, setPollingMode] = useState<
    "hybrid" | "live_icmp_tcp" | "simulation"
  >("live_icmp_tcp");
  const [testNow, setTestNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleVendorChange = (brand: VendorBrand) => {
    setVendor(brand);
    const prof = VENDOR_PROFILES[brand] || VENDOR_PROFILES.Other;
    setSshPort(prof.defaultPorts.ssh);
    if (brand === "ZTE") {
      setRole("olt");
      setModel("ZXA10 C320 / C600 GPON");
    } else if (brand === "Huawei") {
      setRole("olt");
      setModel("SmartAX MA5800-X7");
    } else if (brand === "FiberHome") {
      setRole("olt");
      setModel("AN5516-06 GPON");
    } else if (brand === "HSGQ" || brand === "C-Data" || brand === "V-SOL" || brand === "BDCOM") {
      setRole("olt");
      setModel(`${brand} 8/16-Port GPON/EPON OLT`);
    } else if (brand === "MikroTik") {
      setRole("core_router");
      setModel("CCR2116-12G-4S+");
    } else if (brand === "Cisco") {
      setRole("dist_switch");
      setModel("Nexus 93180YC-FX / ASR1001");
    } else if (brand === "Juniper") {
      setRole("core_router");
      setModel("MX204 Universal Router");
    } else {
      setModel(`${brand} Network Appliance`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onAddDevice({
        name: name.trim() || `${vendor.toUpperCase()}-${role.toUpperCase()}`,
        ipAddress: ipAddress.trim(),
        vendor,
        role,
        model,
        location,
        snmpCommunity,
        sshPort,
        sshUser: sshUser.trim() || undefined,
        sshPassword: sshPassword || undefined,
        pollingMode,
        testNow,
      });
      onClose();
      setName("");
    } finally {
      setSubmitting(false);
    }
  };

  const profile = VENDOR_PROFILES[vendor] || VENDOR_PROFILES.Other;

  const inputCls = isLightCard
    ? "w-full bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-xl px-3 py-2 text-slate-900 outline-none transition"
    : "w-full bg-[#051122] border border-sky-500/25 focus:border-cyan-400 rounded-xl px-3 py-2 text-white outline-none transition";
  const labelCls = isLightCard ? "text-slate-700 font-medium block mb-1" : "text-slate-300 block mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`border rounded-[26px] max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto ${
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
          <div>
            <h3 className={`text-base font-bold flex items-center gap-2 ${isLightCard ? "text-slate-900" : "text-white"}`}>
              <Router className={`w-4 h-4 ${isLightCard ? "text-sky-600" : "text-cyan-400"}`} />
              Tambah Perangkat Jaringan Multi-Vendor Baru
            </h3>
            <p className={`text-xs mt-0.5 ${isLightCard ? "text-slate-500" : "text-slate-400"}`}>
              Mendukung Router Core, Switch, OLT (GPON/EPON/XGS-PON), Firewall, dan Wireless di semua brand
            </p>
          </div>
          <button
            onClick={onClose}
            className={`text-sm px-2 py-1 cursor-pointer ${
              isLightCard ? "text-slate-400 hover:text-slate-700" : "text-slate-400 hover:text-white"
            }`}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
          {/* Brand Selection Pills */}
          <div>
            <label className={`font-semibold block mb-1.5 ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
              1. Pilih Brand / Vendor Perangkat
            </label>
            <div className="flex flex-wrap gap-1.5">
              {VENDORS.map((b) => (
                <button
                  type="button"
                  key={b}
                  onClick={() => handleVendorChange(b)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    vendor === b
                      ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow"
                      : isLightCard
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                      : "bg-[#051122] text-slate-300 hover:bg-slate-800 border border-sky-500/20"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>
                Tipe / Role Perangkat
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as DeviceRole)}
                className={inputCls}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Nama Perangkat / Hostname ID
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Contoh: OLT-05-${vendor.toUpperCase()}-UTARA`}
                className={inputCls}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>
                SSH / API User (read-only)
              </label>
              <input
                type="text"
                autoComplete="off"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="mis. nocviewer"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>
                SSH Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
                placeholder="disimpan di server, tidak dikirim balik ke browser"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className={labelCls}>
                IP Address / Hostname
              </label>
              <input
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="192.168.1.1 / 103.x.x.x"
                className={`${inputCls} font-mono ${isLightCard ? "text-sky-700" : "text-cyan-300"}`}
                required
              />
            </div>

            <div>
              <label className={labelCls}>
                Seri / Model Hardware
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className={labelCls}>
                Lokasi POP / Data Center
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className={labelCls}>
                SNMP v2c/v3 Community
              </label>
              <input
                type="text"
                value={snmpCommunity}
                onChange={(e) => setSnmpCommunity(e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>

            <div>
              <label className={labelCls}>
                SSH / CLI Port
              </label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(Number(e.target.value))}
                className={`${inputCls} font-mono`}
              />
            </div>

            <div>
              <label className={labelCls}>
                Mode Polling Telemetri
              </label>
              <select
                value={pollingMode}
                onChange={(e) =>
                  setPollingMode(
                    e.target.value as "hybrid" | "live_icmp_tcp" | "simulation"
                  )
                }
                className={inputCls}
              >
                <option value="hybrid">
                  Hybrid (Real Ping + Simulasi MIB/PON)
                </option>
                <option value="live_icmp_tcp">
                  Real Network Polling (Strict ICMP &amp; TCP)
                </option>
                <option value="simulation">
                  Full Simulasi (Demo Lab Mode)
                </option>
              </select>
            </div>
          </div>

          {/* Auto-detected Vendor MIB Profile Preview */}
          <div
            className={`border rounded-xl p-3 font-mono text-[11px] ${
              isLightCard
                ? "bg-sky-50/70 border-sky-200 text-slate-700"
                : "bg-[#051122] border-sky-500/25 text-slate-300"
            }`}
          >
            <div className={`font-semibold mb-1 ${isLightCard ? "text-sky-700" : "text-cyan-300"}`}>
              Auto-Detected {vendor} SNMP &amp; Telemetry Profile:
            </div>
            <div>OS Template: {profile.defaultOs}</div>
            <div>CPU OID: {profile.snmpOids.cpuLoad}</div>
            {profile.snmpOids.ponOpticalRx && (
              <div className={isLightCard ? "text-amber-600" : "text-amber-300"}>
                PON Optical DDM OID: {profile.snmpOids.ponOpticalRx}
              </div>
            )}
          </div>

          <label className={`flex items-center gap-2 cursor-pointer ${isLightCard ? "text-slate-700" : "text-slate-300"}`}>
            <input
              type="checkbox"
              checked={testNow}
              onChange={(e) => setTestNow(e.target.checked)}
              className="rounded accent-cyan-500"
            />
            <span>
              Langsung jalankan tes koneksi nyata (ICMP Ping &amp; SSH Port Probe) saat menyimpan perangkat
            </span>
          </label>

          <div
            className={`flex items-center justify-end gap-2 pt-3 border-t ${
              isLightCard ? "border-slate-200" : "border-sky-500/20"
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl cursor-pointer transition ${
                isLightCard
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  : "bg-white/10 hover:bg-white/15 text-slate-300"
              }`}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-bold shadow-md shadow-sky-500/20 flex items-center gap-1.5 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              {submitting ? "Menambahkan & Testing..." : "Tambahkan ke NOC"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

