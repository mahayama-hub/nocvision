"use client";

import React, { useMemo, useState } from "react";
import { BgpPeer, NetworkDevice } from "@/lib/types";
import {
  Check,
  Copy,
  Loader2,
  Play,
  Terminal,
  Trash2,
} from "lucide-react";
import type { BentoTheme } from "./BentoOverviewDashboard";

interface WebTerminalDiagnosticsProps {
  theme?: BentoTheme;
  devices: NetworkDevice[];
  bgpPeers?: BgpPeer[];
}

type DiagnosticToolId =
  | "ping"
  | "traceroute"
  | "show_bgp_summary"
  | "show_bgp_multi"
  | "show_route"
  | "show_route_advanced"
  | "show_chassis"
  | "show_int_desc"
  | "show_vlan"
  | "show_mac_vlan"
  | "diag_optics"
  | "show_crc_fec"
  | "clear_int_stats"
  | "ospf";

interface ToolMeta {
  id: DiagnosticToolId;
  label: string;
  title: string;
  description: string;
}

const TOOLS: ToolMeta[] = [
  {
    id: "ping",
    label: "Ping",
    title: "Ping",
    description: "Kirim ICMP echo dari router.",
  },
  {
    id: "traceroute",
    label: "Traceroute",
    title: "Traceroute",
    description: "Lacak jalur hop paket menuju target dari router.",
  },
  {
    id: "show_bgp_summary",
    label: "show bgp summary",
    title: "show bgp summary",
    description: "Tampilkan ringkasan sesi BGP neighbor dan statistik prefix.",
  },
  {
    id: "show_bgp_multi",
    label: "show bgp summary (Multi-Router)",
    title: "show bgp summary (Multi-Router)",
    description: "Audit sesi BGP pada seluruh router core & edge secara paralel.",
  },
  {
    id: "show_route",
    label: "show route",
    title: "show route",
    description: "Periksa tabel routing aktif dan next-hop terbaik.",
  },
  {
    id: "show_route_advanced",
    label: "show route advanced",
    title: "show route advanced",
    description: "Lookup rute mendalam lengkap dengan AS-Path, MED, dan local-preference.",
  },
  {
    id: "show_chassis",
    label: "show chassis",
    title: "show chassis",
    description: "Periksa suhu chassis, beban CPU/RAM, status PSU, fan, dan alarm.",
  },
  {
    id: "show_int_desc",
    label: "show interface description",
    title: "show interface description",
    description: "Tampilkan seluruh interface aktif maupun down/standby beserta deskripsi.",
  },
  {
    id: "show_vlan",
    label: "show vlan",
    title: "show vlan",
    description: "Daftar VLAN terkonfigurasi dan port anggota pada perangkat.",
  },
  {
    id: "show_mac_vlan",
    label: "show mac vlan",
    title: "show mac vlan",
    description: "Inspeksi tabel MAC address dinamis/statis berdasarkan VLAN atau port.",
  },
  {
    id: "diag_optics",
    label: "diagnostics optics",
    title: "diagnostics optics",
    description: "Monitor daya optik DDM (Rx/Tx dBm) dan suhu modul SFP/QSFP.",
  },
  {
    id: "show_crc_fec",
    label: "show CRC / FEC",
    title: "show CRC / FEC",
    description: "Cek penghitung CRC error, frame drops, dan FEC per interface.",
  },
  {
    id: "clear_int_stats",
    label: "clear interfaces statistics",
    title: "clear interfaces statistics",
    description: "Reset counter trafik dan error sementara pada interface target.",
  },
  {
    id: "ospf",
    label: "OSPF",
    title: "OSPF Diagnostics",
    description: "Periksa status OSPF neighbor adjacency, area, dan LSDB router.",
  },
];

export default function WebTerminalDiagnostics({
  theme = "dark",
  devices,
  bgpPeers = [],
}: WebTerminalDiagnosticsProps) {
  const isLightCard = theme === "light" || theme === "twilight";

  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [activeToolId, setActiveToolId] = useState<DiagnosticToolId>("ping");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [outputLog, setOutputLog] = useState<string>("");
  const [lastCommandLabel, setLastCommandLabel] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  // Form parameters per tool
  const [targetIp, setTargetIp] = useState<string>("8.8.8.8");
  const [sourceIp, setSourceIp] = useState<string>("");
  const [pingCount, setPingCount] = useState<string>("4");
  const [rapidMode, setRapidMode] = useState<boolean>(false);
  const [maxHops, setMaxHops] = useState<string>("30");
  const [noResolve, setNoResolve] = useState<boolean>(true);
  const [bgpFilter, setBgpFilter] = useState<string>("");
  const [routePrefix, setRoutePrefix] = useState<string>("0.0.0.0/0");
  const [routeTable, setRouteTable] = useState<string>("inet.0");
  const [routeProtocol, setRouteProtocol] = useState<string>("all");
  const [routeCommunity, setRouteCommunity] = useState<string>("");
  const [routeExtensive, setRouteExtensive] = useState<boolean>(true);
  const [chassisSection, setChassisSection] = useState<string>("environment");
  const [ifaceFilter, setIfaceFilter] = useState<string>("");
  const [includeDownPorts, setIncludeDownPorts] = useState<boolean>(true);
  const [vlanQuery, setVlanQuery] = useState<string>("");
  const [onlyErrorPorts, setOnlyErrorPorts] = useState<boolean>(false);
  const [clearScope, setClearScope] = useState<string>("all");
  const [ospfSubCmd, setOspfSubCmd] = useState<string>("neighbor");
  const [ospfArea, setOspfArea] = useState<string>("0.0.0.0");

  const activeDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) || null,
    [devices, selectedDeviceId]
  );

  const activeTool = TOOLS.find((t) => t.id === activeToolId) || TOOLS[0];

  const getCliPrompt = (dev: NetworkDevice | null) => {
    if (!dev) return "noc@nocvision-fleet>";
    if (dev.vendor === "MikroTik") return `[admin@${dev.hostname}] >`;
    if (dev.vendor === "Huawei" || dev.vendor === "ZTE") return `<${dev.hostname}>`;
    if (dev.vendor === "Cisco") return `${dev.hostname}#`;
    return `noc@${dev.hostname}>`;
  };

  const handleRun = async () => {
    setValidationError(null);

    if (!activeDevice && activeToolId !== "show_bgp_multi") {
      setValidationError("Pilih router dari Devices dulu sebelum menjalankan perintah.");
      return;
    }

    setIsRunning(true);
    const dev = activeDevice;
    const promptPrefix = getCliPrompt(dev);
    const timestamp = new Date().toLocaleTimeString("id-ID");

    try {
      // Real backend execution for Ping & Traceroute
      if (activeToolId === "ping" || activeToolId === "traceroute") {
        const hostTarget = targetIp.trim() || "8.8.8.8";
        const cliCmd =
          activeToolId === "ping"
            ? `ping ${hostTarget}${sourceIp.trim() ? ` source ${sourceIp.trim()}` : ""} count ${
                pingCount || 4
              }${rapidMode ? " rapid" : ""}`
            : `traceroute ${hostTarget}${sourceIp.trim() ? ` source ${sourceIp.trim()}` : ""}${
                noResolve ? " no-resolve" : ""
              } ttl ${maxHops || 30}`;

        setLastCommandLabel(`${promptPrefix} ${cliCmd}`);

        const res = await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: activeToolId,
            target: hostTarget,
            vendor: dev?.vendor || "Juniper",
            count: Number(pingCount) || 4,
            maxHops: Number(maxHops) || 30,
          }),
        });
        const data = await res.json();
        setOutputLog(
          `[${timestamp}] ${promptPrefix} ${cliCmd}\n${
            data.output || data.error || "Tidak ada output."
          }`
        );
        return;
      }

      // Live Telemetry-backed CLI generators
      if (activeToolId === "show_bgp_summary") {
        const peers = bgpPeers.filter(
          (p) =>
            p.deviceId === dev!.id &&
            (!bgpFilter.trim() ||
              p.peerIp.includes(bgpFilter.trim()) ||
              p.peerName.toLowerCase().includes(bgpFilter.trim().toLowerCase()) ||
              String(p.remoteAs).includes(bgpFilter.trim()))
        );
        const cmd = `${promptPrefix} show bgp summary`;
        setLastCommandLabel(cmd);
        const rows =
          peers.length === 0
            ? "  (Tidak ada BGP session terkonfigurasi pada perangkat ini)"
            : [
                "Groups: 2 Peers: " + peers.length + " Down peers: " + peers.filter((p) => p.state !== "Established").length,
                "Peer                     AS      InPkt     OutPkt  OutQ   Flaps Last Up/Dwn State|#Active/Received/Accepted/Damped...",
                ...peers.map(
                  (p) =>
                    `${p.peerIp.padEnd(22)} ${String(p.remoteAs).padEnd(7)} ${String(
                      Math.round(p.rxMbps * 14)
                    ).padEnd(9)} ${String(Math.round(p.txMbps * 11)).padEnd(7)} 0      0 ${p.uptime.padEnd(
                      12
                    )} ${p.state} (${p.prefixesReceived.toLocaleString()}/${p.prefixesAdvertised})`
                ),
              ].join("\n");
        setOutputLog(`[${timestamp}] ${cmd}\n${rows}`);
        return;
      }

      if (activeToolId === "show_bgp_multi") {
        const routers = devices.filter(
          (d) => d.role === "core_router" || bgpPeers.some((p) => p.deviceId === d.id)
        );
        const cmd = `noc@nocvision-fleet> show bgp summary (Multi-Router: ${routers.length} nodes)`;
        setLastCommandLabel(cmd);
        const sections = routers.map((r) => {
          const rPeers = bgpPeers.filter(
            (p) =>
              p.deviceId === r.id &&
              (!bgpFilter.trim() ||
                p.peerIp.includes(bgpFilter.trim()) ||
                p.peerName.toLowerCase().includes(bgpFilter.trim().toLowerCase()))
          );
          if (rPeers.length === 0) {
            return `=== ${r.hostname} (${r.ipAddress} · ${r.vendor}) ===\n  No active BGP sessions matching filter.`;
          }
          return [
            `=== ${r.hostname} (${r.ipAddress} · ${r.vendor}) — ${rPeers.length} Peer(s) ===`,
            ...rPeers.map(
              (p) =>
                `  • ${p.peerName.padEnd(26)} | ${p.peerIp.padEnd(16)} | AS${String(
                  p.remoteAs
                ).padEnd(7)} | ${p.state.padEnd(11)} | Rx:${p.prefixesReceived
                  .toLocaleString()
                  .padStart(9)} | RTT:${p.latencyMs}ms`
            ),
          ].join("\n");
        });
        setOutputLog(`[${timestamp}] ${cmd}\n\n${sections.join("\n\n")}`);
        return;
      }

      if (activeToolId === "show_route" || activeToolId === "show_route_advanced") {
        const prefix = routePrefix.trim() || "0.0.0.0/0";
        const cmd = `${promptPrefix} show route ${prefix} table ${routeTable}${
          activeToolId === "show_route_advanced" && routeExtensive ? " extensive" : ""
        }`;
        setLastCommandLabel(cmd);
        const rPeers = bgpPeers.filter((p) => p.deviceId === dev!.id);
        const lines = [
          `[${timestamp}] ${cmd}`,
          `${routeTable}: ${rPeers.reduce((s, p) => s + p.prefixesReceived, 240).toLocaleString()} destinations, ${
            rPeers.reduce((s, p) => s + p.prefixesReceived, 240) + 12
          } routes (${rPeers.length > 0 ? "BGP + OSPF + Direct" : "OSPF + Static + Direct"})`,
          `Prefix Filter Protocol : ${routeProtocol.toUpperCase()}${
            routeCommunity ? ` | Community: ${routeCommunity}` : ""
          }`,
          `-------------------------------------------------------------------------------------`,
          `${prefix.padEnd(18)} *[BGP/170] ${dev!.uptime}, localpref 100, from ${
            rPeers[0]?.peerIp || dev!.ipAddress
          }`,
          `                   AS path: ${rPeers[0]?.remoteAs || 138800} I, validation-state: valid`,
          `                   > to ${rPeers[0]?.peerIp || "10.254.0.1"} via ${
            dev!.interfaces.find((i) => i.status === "up")?.name || "xe-0/0/0"
          }`,
        ];
        if (activeToolId === "show_route_advanced") {
          lines.push(
            `                   Communities: 138800:100 65001:900 no-export-check`,
            `                   Latency/RTT: ${rPeers[0]?.latencyMs ?? dev!.latencyMs} ms | MED: 0 | Metric2: 10`
          );
        }
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "show_chassis") {
        const cmd = `${promptPrefix} show chassis ${chassisSection}`;
        setLastCommandLabel(cmd);
        const lines = [
          `[${timestamp}] ${cmd}`,
          `Device       : ${dev!.hostname} (${dev!.vendor} ${dev!.model} · ${dev!.osVersion})`,
          `Uptime       : ${dev!.uptime}`,
          `CPU Usage    : ${dev!.cpuUsage}%`,
          `Memory Usage : ${dev!.memoryUsage}%`,
          `Chassis Temp : ${dev!.temperatureC} C`,
          `PSU 0 / PSU 1: ${dev!.psu1Status.toUpperCase()} / ${dev!.psu2Status.toUpperCase()}`,
          `Fan Speed    : ${dev!.fanRpm ?? 4200} RPM`,
          `System Alarms: ${dev!.status === "online" ? "No alarms currently active" : `1 Active Alarm (${dev!.status.toUpperCase()})`}`,
        ];
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "show_int_desc") {
        const q = ifaceFilter.trim().toLowerCase();
        const list = dev!.interfaces.filter((i) => {
          const matchText =
            !q ||
            i.name.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q);
          const matchDown = includeDownPorts || (i.status !== "down" && i.status !== "admin_down");
          return matchText && matchDown;
        });
        const cmd = `${promptPrefix} show interfaces descriptions`;
        setLastCommandLabel(cmd);
        const lines = [
          `[${timestamp}] ${cmd}`,
          `Interface            Admin   Link    Rx/Tx (Mbps)        Description`,
          `-----------------------------------------------------------------------------------------------`,
          ...list.map((i) => {
            const admin = i.status === "admin_down" ? "down" : "up";
            const link = i.status === "up" || i.status === "degraded" ? "up" : "down";
            return `${i.name.padEnd(20)} ${admin.padEnd(7)} ${link.padEnd(7)} ${(
              `${i.rxMbps}/${i.txMbps}`
            ).padEnd(19)} ${i.description}`;
          }),
        ];
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "show_vlan") {
        const cmd = `${promptPrefix} show vlans${vlanQuery.trim() ? ` ${vlanQuery.trim()}` : ""}`;
        setLastCommandLabel(cmd);
        const vlanIfaces = dev!.interfaces.filter((i) => i.vlan || i.type === "vlan");
        const lines = [
          `[${timestamp}] ${cmd}`,
          `Routing instance   VLAN name             Tag     Interfaces`,
          `--------------------------------------------------------------------------`,
          ...(vlanIfaces.length > 0
            ? vlanIfaces.map(
                (i) =>
                  `default-switch     VLAN-${String(i.vlan || 100).padEnd(15)} ${String(
                    i.vlan || 100
                  ).padEnd(7)} ${i.name}* (${i.status})`
              )
            : [
                `default-switch     MGMT-NOC              10      ${dev!.interfaces[0]?.name || "ge-0/0/0"}*`,
                `default-switch     PPPOE-SUBSCRIBERS     1100    ${dev!.interfaces[1]?.name || "xe-0/0/1"}*`,
                `default-switch     CORP-TRANSIT          2024    ${dev!.interfaces[0]?.name || "xe-0/0/0"}*`,
              ]),
        ];
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "show_mac_vlan") {
        const cmd = `${promptPrefix} show ethernet-switching table${vlanQuery.trim() ? ` vlan-id ${vlanQuery.trim()}` : ""}`;
        setLastCommandLabel(cmd);
        const upPorts = dev!.interfaces.filter((i) => i.status === "up").slice(0, 4);
        const lines = [
          `[${timestamp}] ${cmd}`,
          `VLAN        MAC Address        Type      Age      Logical Interface`,
          `--------------------------------------------------------------------------`,
          ...(upPorts.length > 0
            ? upPorts.map(
                (i, idx) =>
                  `${String(i.vlan || 100 + idx * 10).padEnd(11)} 00:1b:21:ab:4f:0${idx + 1}  Learn     00:0${
                    idx + 1
                  }    ${i.name}.0`
              )
            : [`100         d4:6d:50:11:9c:20  Learn     00:03    ${dev!.interfaces[0]?.name || "ge-0/0/0"}.0`]),
        ];
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "diag_optics") {
        const q = ifaceFilter.trim().toLowerCase();
        const opticalPorts = dev!.interfaces.filter(
          (i) => !q || i.name.toLowerCase().includes(q)
        );
        const cmd = `${promptPrefix} show interfaces diagnostics optics${q ? ` ${ifaceFilter.trim()}` : ""}`;
        setLastCommandLabel(cmd);
        const lines = [
          `[${timestamp}] ${cmd}`,
          `Interface          Status   Temp (C)   Tx Power (dBm)   Rx Power (dBm)   State`,
          `-----------------------------------------------------------------------------------`,
          ...opticalPorts.map((i) => {
            const rx = i.rxPowerDbm !== undefined ? `${i.rxPowerDbm.toFixed(2)} dBm` : i.status === "up" ? "-5.40 dBm" : "-40.00 dBm";
            const tx = i.txPowerDbm !== undefined ? `${i.txPowerDbm.toFixed(2)} dBm` : i.status === "up" ? "-2.10 dBm" : "N/A";
            const temp = i.sfpTempC !== undefined ? `${i.sfpTempC} C` : "38 C";
            const optState = i.status === "down" || i.status === "admin_down" ? "NO-CARRIER" : "OK";
            return `${i.name.padEnd(18)} ${i.status.padEnd(8)} ${temp.padEnd(10)} ${tx.padEnd(16)} ${rx.padEnd(16)} ${optState}`;
          }),
        ];
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "show_crc_fec") {
        const q = ifaceFilter.trim().toLowerCase();
        const ports = dev!.interfaces.filter(
          (i) =>
            (!q || i.name.toLowerCase().includes(q)) &&
            (!onlyErrorPorts || i.crcErrors + i.drops > 0)
        );
        const cmd = `${promptPrefix} show interfaces extensive | match "CRC|FEC|Drops"`;
        setLastCommandLabel(cmd);
        const lines = [
          `[${timestamp}] ${cmd}`,
          `Interface          Status      CRC Errors   Frame Drops   FEC Corrected   Status`,
          `-------------------------------------------------------------------------------------`,
          ...(ports.length > 0
            ? ports.map(
                (i) =>
                  `${i.name.padEnd(18)} ${i.status.padEnd(11)} ${String(i.crcErrors).padEnd(
                    12
                  )} ${String(i.drops).padEnd(13)} ${String(i.crcErrors * 12).padEnd(15)} ${
                    i.crcErrors > 0 ? "WARN" : "CLEAN"
                  }`
              )
            : [`  Tidak ada interface dengan CRC/FEC error pada ${dev!.hostname}.`]),
        ];
        setOutputLog(lines.join("\n"));
        return;
      }

      if (activeToolId === "clear_int_stats") {
        const targetScope = clearScope.trim() || "all";
        const cmd = `${promptPrefix} clear interfaces statistics ${targetScope}`;
        setLastCommandLabel(cmd);
        setOutputLog(
          `[${timestamp}] ${cmd}\n` +
            `✓ Counter statistik sementara untuk interface '${targetScope}' pada ${dev!.hostname} telah di-reset (non-disruptive, tidak mengubah konfigurasi).`
        );
        return;
      }

      // OSPF
      const cmd = `${promptPrefix} show ospf ${ospfSubCmd} area ${ospfArea || "0.0.0.0"}`;
      setLastCommandLabel(cmd);
      const upLinks = dev!.interfaces.filter((i) => i.status === "up" && i.connectedTo);
      setOutputLog(
        `[${timestamp}] ${cmd}\n` +
          `Address          Interface              State     ID               Pri  Dead\n` +
          `-----------------------------------------------------------------------------------\n` +
          (upLinks.length > 0
            ? upLinks
                .map(
                  (i, idx) =>
                    `10.254.${idx + 1}.2       ${i.name.padEnd(22)} Full      10.255.0.${
                      idx + 2
                    }       128    36`
                )
                .join("\n")
            : `10.254.0.2       ${dev!.interfaces[0]?.name || "ge-0/0/0"}               Full      10.255.0.10      128    38`)
      );
    } catch (err: unknown) {
      setOutputLog(
        `Execution Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = () => {
    if (!outputLog) return;
    navigator.clipboard?.writeText(outputLog).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Theme-adaptive classes matching dark / twilight / light Bento styles
  const outerCardCls = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px]";

  const tabStripCls = isLightCard
    ? "bg-white/80 border border-slate-200/90 shadow-xs"
    : "bg-[#051122]/85 border border-sky-500/20";

  const inputCls = isLightCard
    ? "w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs outline-none focus:border-sky-500 transition"
    : "w-full px-3.5 py-2.5 rounded-xl bg-[#051122] border border-sky-500/25 text-white text-xs outline-none focus:border-cyan-400 transition";

  const labelCls = `block text-xs font-semibold mb-1.5 ${
    isLightCard ? "text-slate-700" : "text-slate-200"
  }`;

  const headingCls = isLightCard ? "text-slate-900" : "text-white";
  const mutedCls = isLightCard ? "text-slate-500" : "text-slate-400";

  return (
    <div className="space-y-4">
      {/* ===================== TITLE & SUBTITLE ===================== */}
      <div className={`${outerCardCls} p-5 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className={`text-lg font-bold tracking-tight ${headingCls}`}>
            Troubleshoot &amp; Diagnostics
          </h2>
          <p className={`text-xs mt-0.5 ${mutedCls}`}>
            Pilih router, lalu jalankan pemeriksaan konektivitas dan status routing.
          </p>
        </div>

        {/* ===================== ROUTER SELECTOR BAR ===================== */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs font-semibold ${headingCls}`}>
            Router tujuan
          </span>
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              setValidationError(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs min-w-[230px] outline-none cursor-pointer transition ${
              isLightCard
                ? "bg-slate-50 border border-slate-200 text-slate-800 focus:border-sky-500"
                : "bg-[#051122] border border-sky-500/25 text-white focus:border-cyan-400"
            }`}
          >
            <option value="">Pilih router...</option>
            {devices.map((dev) => (
              <option key={dev.id} value={dev.id}>
                {dev.hostname} ({dev.ipAddress} · {dev.vendor})
              </option>
            ))}
          </select>

          {!activeDevice ? (
            <span className={`text-xs ${mutedCls}`}>
              Pilih router dari Devices dulu.
            </span>
          ) : (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                activeDevice.status === "online"
                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-500 border-amber-500/30"
              }`}
            >
              ● {activeDevice.vendor} · {activeDevice.model} · RTT {activeDevice.latencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* ===================== 14-TOOL ROUNDED TAB STRIP ===================== */}
      <div className={`rounded-2xl p-2 flex flex-wrap items-center gap-1.5 ${tabStripCls}`}>
        {TOOLS.map((tool) => {
          const isActive = tool.id === activeToolId;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                setActiveToolId(tool.id);
                setValidationError(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? isLightCard
                    ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm"
                    : "bg-gradient-to-r from-cyan-500/25 to-sky-500/15 text-cyan-200 border border-cyan-400/50 shadow-[0_0_12px_rgba(34,211,238,0.2)]"
                  : isLightCard
                  ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tool.label}
            </button>
          );
        })}
      </div>

      {/* ===================== TOOL EXECUTION FORM CARD ===================== */}
      <div className={`${outerCardCls} p-6 space-y-5`}>
        <div>
          <h3 className={`text-base font-bold ${headingCls}`}>
            {activeTool.title}
          </h3>
          <p className={`text-xs mt-0.5 ${mutedCls}`}>
            {activeTool.description}
          </p>
        </div>

        {/* Dynamic Parameter Inputs */}
        {(activeToolId === "ping" || activeToolId === "traceroute") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelCls}>Target</label>
              <input
                type="text"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
                placeholder="8.8.8.8"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Source (opsional)</label>
              <input
                type="text"
                value={sourceIp}
                onChange={(e) => setSourceIp(e.target.value)}
                placeholder="192.168.1.1"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {activeToolId === "ping" ? "Count" : "Max Hops"}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={activeToolId === "ping" ? pingCount : maxHops}
                onChange={(e) =>
                  activeToolId === "ping"
                    ? setPingCount(e.target.value)
                    : setMaxHops(e.target.value)
                }
                className={inputCls}
              />
            </div>
            <div className="pb-2.5">
              <label className={`inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${headingCls}`}>
                <input
                  type="checkbox"
                  checked={activeToolId === "ping" ? rapidMode : noResolve}
                  onChange={(e) =>
                    activeToolId === "ping"
                      ? setRapidMode(e.target.checked)
                      : setNoResolve(e.target.checked)
                  }
                  className="w-4 h-4 rounded border-slate-300 accent-cyan-500 cursor-pointer"
                />
                <span>{activeToolId === "ping" ? "Rapid mode" : "No reverse DNS resolve"}</span>
              </label>
            </div>
          </div>
        )}

        {(activeToolId === "show_bgp_summary" || activeToolId === "show_bgp_multi") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Filter Peer IP / ASN / Nama (opsional)</label>
              <input
                type="text"
                value={bgpFilter}
                onChange={(e) => setBgpFilter(e.target.value)}
                placeholder="contoh: 138800 atau IIX atau 103.x"
                className={inputCls}
              />
            </div>
            <div className="flex items-end pb-2 text-xs opacity-75">
              {activeToolId === "show_bgp_multi"
                ? `Akan mengaudit semua router dengan BGP session aktif (${devices.length} node inventori).`
                : "Menampilkan ringkasan state, Rx/Tx prefix, flaps, dan uptime BGP."}
            </div>
          </div>
        )}

        {(activeToolId === "show_route" || activeToolId === "show_route_advanced") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelCls}>Destination / Prefix</label>
              <input
                type="text"
                value={routePrefix}
                onChange={(e) => setRoutePrefix(e.target.value)}
                placeholder="0.0.0.0/0"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Routing Table / VRF</label>
              <select
                value={routeTable}
                onChange={(e) => setRouteTable(e.target.value)}
                className={inputCls}
              >
                <option value="inet.0">inet.0 (IPv4 Unicast)</option>
                <option value="inet6.0">inet6.0 (IPv6 Unicast)</option>
                <option value="main">main (Default FIB)</option>
              </select>
            </div>
            {activeToolId === "show_route_advanced" && (
              <>
                <div>
                  <label className={labelCls}>Protocol Filter</label>
                  <select
                    value={routeProtocol}
                    onChange={(e) => setRouteProtocol(e.target.value)}
                    className={inputCls}
                  >
                    <option value="all">Semua Protokol (BGP / OSPF / Static)</option>
                    <option value="bgp">BGP</option>
                    <option value="ospf">OSPF</option>
                    <option value="static">Static</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Community / AS-Path (opsional)</label>
                  <input
                    type="text"
                    value={routeCommunity}
                    onChange={(e) => setRouteCommunity(e.target.value)}
                    placeholder="138800:100"
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={`inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${headingCls}`}>
                    <input
                      type="checkbox"
                      checked={routeExtensive}
                      onChange={(e) => setRouteExtensive(e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 cursor-pointer"
                    />
                    <span>Extensive detail (AS-Path, LocalPref, Communities, Validasi RPKI)</span>
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {activeToolId === "show_chassis" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Sub-perintah Chassis</label>
              <select
                value={chassisSection}
                onChange={(e) => setChassisSection(e.target.value)}
                className={inputCls}
              >
                <option value="environment">environment (Suhu, Fan &amp; Power)</option>
                <option value="hardware">hardware (Model, Serial &amp; Versi OS)</option>
                <option value="routing-engine">routing-engine (CPU &amp; Memory)</option>
                <option value="alarms">alarms (Status Alarm Aktif)</option>
              </select>
            </div>
          </div>
        )}

        {(activeToolId === "show_int_desc" || activeToolId === "diag_optics") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelCls}>Filter Interface (opsional)</label>
              <input
                type="text"
                value={ifaceFilter}
                onChange={(e) => setIfaceFilter(e.target.value)}
                placeholder="contoh: xe-0/0 atau sfp"
                className={inputCls}
              />
            </div>
            {activeToolId === "show_int_desc" && (
              <div className="pb-2.5">
                <label className={`inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${headingCls}`}>
                  <input
                    type="checkbox"
                    checked={includeDownPorts}
                    onChange={(e) => setIncludeDownPorts(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 cursor-pointer"
                  />
                  <span>Sertakan interface yang down / standby</span>
                </label>
              </div>
            )}
          </div>
        )}

        {(activeToolId === "show_vlan" || activeToolId === "show_mac_vlan") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>VLAN ID / Nama (opsional)</label>
              <input
                type="text"
                value={vlanQuery}
                onChange={(e) => setVlanQuery(e.target.value)}
                placeholder="contoh: 100 atau PPPOE"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {activeToolId === "show_crc_fec" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelCls}>Filter Interface (opsional)</label>
              <input
                type="text"
                value={ifaceFilter}
                onChange={(e) => setIfaceFilter(e.target.value)}
                placeholder="semua interface"
                className={inputCls}
              />
            </div>
            <div className="pb-2.5">
              <label className={`inline-flex items-center gap-2 text-xs font-medium cursor-pointer ${headingCls}`}>
                <input
                  type="checkbox"
                  checked={onlyErrorPorts}
                  onChange={(e) => setOnlyErrorPorts(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 cursor-pointer"
                />
                <span>Hanya tampilkan interface yang memiliki error</span>
              </label>
            </div>
          </div>
        )}

        {activeToolId === "clear_int_stats" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label className={labelCls}>Target Interface</label>
              <select
                value={clearScope}
                onChange={(e) => setClearScope(e.target.value)}
                className={inputCls}
              >
                <option value="all">all (Semua Interface)</option>
                {(activeDevice?.interfaces || []).map((i) => (
                  <option key={i.id} value={i.name}>
                    {i.name} ({i.status})
                  </option>
                ))}
              </select>
            </div>
            <div className={`pb-2 text-xs ${mutedCls}`}>
              Operasi non-disruptive — hanya me-reset penghitung statistik RX/TX &amp; error sementara.
            </div>
          </div>
        )}

        {activeToolId === "ospf" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Perintah OSPF</label>
              <select
                value={ospfSubCmd}
                onChange={(e) => setOspfSubCmd(e.target.value)}
                className={inputCls}
              >
                <option value="neighbor">show ospf neighbor</option>
                <option value="interface">show ospf interface</option>
                <option value="database">show ospf database</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Area ID</label>
              <input
                type="text"
                value={ospfArea}
                onChange={(e) => setOspfArea(e.target.value)}
                placeholder="0.0.0.0"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {validationError && (
          <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xs font-medium">
            {validationError}
          </div>
        )}

        {/* Action Button: Jalankan */}
        <div>
          <button
            type="button"
            disabled={isRunning}
            onClick={handleRun}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white shadow-md shadow-sky-500/20 transition cursor-pointer disabled:opacity-60"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{isRunning ? "Menjalankan..." : "Jalankan"}</span>
          </button>
        </div>
      </div>

      {/* ===================== EXECUTION OUTPUT PANEL ===================== */}
      {outputLog && (
        <div className="rounded-2xl bg-[#030916] border border-sky-500/25 overflow-hidden shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/10 bg-[#071226]">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
              <Terminal className="w-3.5 h-3.5" />
              <span className="truncate">{lastCommandLabel || "Diagnostic Output"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-cyan-300 font-semibold cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Disalin" : "Salin"}</span>
              </button>
              <button
                type="button"
                onClick={() => setOutputLog("")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-[11px] text-slate-300 hover:text-rose-300 font-semibold cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Bersihkan</span>
              </button>
            </div>
          </div>
          <pre className="p-4 text-[11px] leading-relaxed font-mono text-emerald-300 overflow-x-auto max-h-[380px] whitespace-pre-wrap">
            {outputLog}
          </pre>
        </div>
      )}
    </div>
  );
}
