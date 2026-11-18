"use client";

import React, { useEffect, useMemo, useState } from "react";
import { NocUser } from "@/lib/auth";
import {
  BgpPeer,
  ConfigSnapshot,
  IncidentAlert,
  NetworkDevice,
  OnuDevice,
  RouteFilterRule,
} from "@/lib/types";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cloud,
  Code2,
  Download,
  Eye,
  FileDiff,
  Filter,
  GitCompare,
  Lock,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import type { BentoTheme } from "./BentoOverviewDashboard";

interface AutomationSafetyCenterProps {
  theme?: BentoTheme;
  initialSubTab?: WizardSubTab;
  backupOnly?: boolean;
  devices: NetworkDevice[];
  bgpPeers: BgpPeer[];
  onus: OnuDevice[];
  incidents: IncidentAlert[];
  snapshots: ConfigSnapshot[];
  routeFilters: RouteFilterRule[];
  autoBackupEnabled: boolean;
  currentUser: NocUser;
  onAction: (payload: Record<string, unknown>) => Promise<{ ok?: boolean; error?: string; auditLogId?: string }>;
  onNotify: (msg: string) => void;
}

type WizardSubTab = "wizard" | "backup" | "ai_filters";
type WizardModule = "Interface/VLAN" | "BGP Peering" | "Route Filter" | "Static Route";

function isValidIpv4Cidr(input: string): boolean {
  const cidrRegex =
    /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)(\/(3[0-2]|[12]?\d))?$/;
  return cidrRegex.test(input.trim());
}

export default function AutomationSafetyCenter({
  theme = "dark",
  initialSubTab = "wizard",
  backupOnly = false,
  devices,
  bgpPeers,
  onus,
  incidents,
  snapshots,
  routeFilters,
  autoBackupEnabled,
  currentUser,
  onAction,
  onNotify,
}: AutomationSafetyCenterProps) {
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
  const inputCls = isLightCard
    ? "bg-white border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-sky-500"
    : "bg-[#040d1c] border border-sky-500/30 text-white rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-400";

  const isReadOnly =
    currentUser.role.toLowerCase().includes("read-only") ||
    currentUser.role.toLowerCase().includes("auditor");

  const [subTab, setSubTab] = useState<WizardSubTab>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    devices.find((d) => d.vendor === "Juniper")?.id || devices[0]?.id || ""
  );
  const [wizardModule, setWizardModule] = useState<WizardModule>("Interface/VLAN");

  // Interface/VLAN form state
  const [portName, setPortName] = useState<string>("xe-0/1/2");
  const [vlanId, setVlanId] = useState<string>("120");
  const [ipCidr, setIpCidr] = useState<string>("172.16.120.1/30");
  const [portDesc, setPortDesc] = useState<string>("CUSTOMER-DEDICATED-10G");
  const [portStatus, setPortStatus] = useState<"up" | "admin_down">("up");

  // BGP Peering form state
  const [peerName, setPeerName] = useState<string>("CDN-AKAMAI-JKT");
  const [remoteAsn, setRemoteAsn] = useState<string>("20940");
  const [peerIp, setPeerIp] = useState<string>("103.10.99.2");
  const [peerType, setPeerType] = useState<"Upstream" | "IXP" | "Customer" | "iBGP">("IXP");

  // Route Filter form state
  const [filterListName, setFilterListName] = useState<string>("EXPORT-MY-PREFIX");
  const [filterPrefix, setFilterPrefix] = useState<string>("103.145.12.0/24");
  const [filterMatch, setFilterMatch] = useState<"exact" | "orlonger" | "upto">("exact");
  const [filterUptoLen, setFilterUptoLen] = useState<string>("24");
  const [filterAction, setFilterAction] = useState<"accept" | "reject">("accept");
  const [filterCommunity, setFilterCommunity] = useState<string>("138800:100");
  const [filterComment, setFilterComment] = useState<string>("New BGP Customer Prefix");

  // Static Route form state
  const [staticDest, setStaticDest] = useState<string>("10.20.0.0/16");
  const [staticNextHop, setStaticNextHop] = useState<string>("172.16.10.254");
  const [staticPref, setStaticPref] = useState<string>("5");

  // Safety Net workflow states
  const [commitCheckResult, setCommitCheckResult] = useState<{
    checkedKey: string;
    valid: boolean;
    message: string;
  } | null>(null);
  const [showCompareOpenedKey, setShowCompareOpenedKey] = useState<string>("");
  const [confirmMinutes, setConfirmMinutes] = useState<number>(3);
  const [busyAction, setBusyAction] = useState<boolean>(false);

  // Active Commit Confirmed countdown timer
  const [pendingCommit, setPendingCommit] = useState<{
    auditLogId: string;
    deviceId: string;
    deviceName: string;
    summary: string;
    secondsLeft: number;
    rollbackIfaceName?: string;
    prevIfaceStatus?: string;
  } | null>(null);

  // Backup viewer state
  const [previewSnapshot, setPreviewSnapshot] = useState<ConfigSnapshot | null>(null);
  const [compareSnapshotId, setCompareSnapshotId] = useState<string>("");

  const activeDevice =
    devices.find((d) => d.id === selectedDeviceId) || devices[0];

  // Auto-update port suggestion when device changes
  const handleSelectWizardDevice = (devId: string) => {
    setSelectedDeviceId(devId);
    const dev = devices.find((d) => d.id === devId);
    if (dev && dev.interfaces.length > 0) {
      const targetPort =
        dev.interfaces.find((i) => i.status !== "up") || dev.interfaces[0];
      setPortName(targetPort.name);
      setPortDesc(targetPort.description);
      setPortStatus(targetPort.status === "admin_down" ? "admin_down" : "up");
    }
    setCommitCheckResult(null);
    setShowCompareOpenedKey("");
  };

  // Generate Vendor-Native CLI & Diff Preview
  const generatedPreview = useMemo(() => {
    if (!activeDevice) return { syntaxLines: "", diffText: "", summary: "" };
    const v = activeDevice.vendor;
    let syntaxLines = "";
    let diffText = "";
    let summary = "";

    if (wizardModule === "Interface/VLAN") {
      summary = `Update interface ${portName} (VLAN ${vlanId}, status=${portStatus}) pada ${activeDevice.name}`;
      if (v === "Juniper") {
        syntaxLines = `set interfaces ${portName} description "${portDesc}"\nset interfaces ${portName} vlan-tagging\nset interfaces ${portName} unit ${vlanId} vlan-id ${vlanId}\nset interfaces ${portName} unit ${vlanId} family inet address ${ipCidr}${
          portStatus === "admin_down" ? `\nset interfaces ${portName} disable` : `\ndelete interfaces ${portName} disable`
        }`;
        diffText = `[edit interfaces ${portName}]\n+   description "${portDesc}";\n+   unit ${vlanId} { vlan-id ${vlanId}; family inet { address ${ipCidr}; } }\n${
          portStatus === "admin_down" ? "+   disable;" : "-   disable; /* link enabled */"
        }`;
      } else if (v === "MikroTik") {
        syntaxLines = `/interface vlan add name=vlan${vlanId}-${portName} vlan-id=${vlanId} interface=${portName}\n/ip address add address=${ipCidr} interface=vlan${vlanId}-${portName}\n/interface ethernet set [find default-name=${portName}] comment="${portDesc}" disabled=${
          portStatus === "admin_down" ? "yes" : "no"
        }`;
        diffText = `/interface vlan [edit ${portName}]\n+ add name=vlan${vlanId}-${portName} vlan-id=${vlanId}\n+ /ip address address=${ipCidr}\n${
          portStatus === "admin_down" ? "+ disabled=yes" : "- disabled=yes -> disabled=no"
        }`;
      } else {
        syntaxLines = `interface ${portName}.${vlanId}\n  encapsulation dot1Q ${vlanId}\n  description ${portDesc}\n  ip address ${ipCidr}\n  ${
          portStatus === "admin_down" ? "shutdown" : "no shutdown"
        }`;
        diffText = `[interface ${portName}.${vlanId}]\n+ encapsulation dot1Q ${vlanId}\n+ description ${portDesc}\n+ ip address ${ipCidr}\n+ ${
          portStatus === "admin_down" ? "shutdown" : "no shutdown"
        }`;
      }
    } else if (wizardModule === "BGP Peering") {
      summary = `Setup BGP Peer ${peerName} (AS${remoteAsn} / ${peerIp}) pada ${activeDevice.name}`;
      if (v === "Juniper") {
        syntaxLines = `set protocols bgp group ${peerType.toUpperCase()}-PEERS neighbor ${peerIp} description "${peerName}"\nset protocols bgp group ${peerType.toUpperCase()}-PEERS neighbor ${peerIp} peer-as ${remoteAsn}\nset protocols bgp group ${peerType.toUpperCase()}-PEERS neighbor ${peerIp} import FILTER-BOGON-IN`;
        diffText = `[edit protocols bgp group ${peerType.toUpperCase()}-PEERS]\n+   neighbor ${peerIp} {\n+       description "${peerName}";\n+       peer-as ${remoteAsn};\n+       import FILTER-BOGON-IN;\n+   }`;
      } else if (v === "MikroTik") {
        syntaxLines = `/routing bgp connection add name="${peerName}" remote.address=${peerIp} remote.as=${remoteAsn} local.role=${
          peerType === "iBGP" ? "ibgp" : "ebgp"
        }`;
        diffText = `/routing bgp connection\n+ add name="${peerName}" remote.address=${peerIp} remote.as=${remoteAsn}`;
      } else {
        syntaxLines = `router bgp 138800\n  neighbor ${peerIp} remote-as ${remoteAsn}\n  neighbor ${peerIp} description ${peerName}`;
        diffText = `[router bgp 138800]\n+ neighbor ${peerIp} remote-as ${remoteAsn}\n+ neighbor ${peerIp} description ${peerName}`;
      }
    } else if (wizardModule === "Route Filter") {
      summary = `Tambah Route Filter ${filterListName}: ${filterPrefix} (${filterMatch}) -> ${filterAction}`;
      syntaxLines =
        v === "Juniper"
          ? `set policy-options policy-statement ${filterListName} term ADD-PREFIX from route-filter ${filterPrefix} ${filterMatch}${
              filterMatch === "upto" ? ` /${filterUptoLen}` : ""
            }\nset policy-options policy-statement ${filterListName} term ADD-PREFIX then ${filterAction}`
          : `/routing filter rule add chain=${filterListName} rule="if (dst in ${filterPrefix}) { ${filterAction}; }"`;
      diffText = `[edit policy-options ${filterListName}]\n+ route-filter ${filterPrefix} ${filterMatch} -> ${filterAction} (community: ${
        filterCommunity || "none"
      });`;
    } else {
      summary = `Tambah Static Route ${staticDest} via ${staticNextHop} (pref ${staticPref}) pada ${activeDevice.name}`;
      syntaxLines =
        v === "Juniper"
          ? `set routing-options static route ${staticDest} next-hop ${staticNextHop}\nset routing-options static route ${staticDest} preference ${staticPref}`
          : v === "MikroTik"
          ? `/ip route add dst-address=${staticDest} gateway=${staticNextHop} distance=${staticPref}`
          : `ip route ${staticDest} ${staticNextHop} ${staticPref}`;
      diffText = `[edit routing-options static]\n+ route ${staticDest} next-hop ${staticNextHop} preference ${staticPref};`;
    }

    return { syntaxLines, diffText, summary };
  }, [
    activeDevice,
    wizardModule,
    portName,
    vlanId,
    ipCidr,
    portDesc,
    portStatus,
    peerName,
    remoteAsn,
    peerIp,
    peerType,
    filterListName,
    filterPrefix,
    filterMatch,
    filterUptoLen,
    filterAction,
    filterCommunity,
    staticDest,
    staticNextHop,
    staticPref,
  ]);

  const currentFormKey = `${selectedDeviceId}|${wizardModule}|${generatedPreview.syntaxLines}`;
  const isCommitChecked =
    commitCheckResult?.checkedKey === currentFormKey && commitCheckResult.valid;
  const isCompareReviewed = showCompareOpenedKey === currentFormKey;

  // Countdown tick for Commit Confirmed auto-rollback timer
  useEffect(() => {
    if (!pendingCommit) return;
    if (pendingCommit.secondsLeft <= 0) {
      const expired = pendingCommit;
      setPendingCommit(null);
      onAction({
        action: "resolve_pending_commit",
        mode: "auto_rollback",
        auditLogId: expired.auditLogId,
        deviceId: expired.deviceId,
        rollbackIfaceName: expired.rollbackIfaceName,
        prevIfaceStatus: expired.prevIfaceStatus,
        actorName: currentUser.fullName,
        actorRole: currentUser.role,
      }).then(() => {
        onNotify(
          `Commit Confirmed habis waktu — Auto-Rollback dijalankan pada ${expired.deviceName}`
        );
      });
      return;
    }
    const timer = setTimeout(() => {
      setPendingCommit((prev) =>
        prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingCommit, onAction, onNotify, currentUser]);

  const handleRunCommitCheck = () => {
    if (!activeDevice) return;
    if (wizardModule === "Interface/VLAN") {
      const vNum = Number(vlanId);
      if (!portName.trim()) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: Nama interface tidak boleh kosong.",
        });
        return;
      }
      if (isNaN(vNum) || vNum < 1 || vNum > 4094) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: VLAN ID harus antara 1 s/d 4094.",
        });
        return;
      }
      if (!isValidIpv4Cidr(ipCidr)) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: Format IPv4/CIDR tidak valid (contoh: 172.16.10.1/30).",
        });
        return;
      }
    } else if (wizardModule === "BGP Peering") {
      const asn = Number(remoteAsn);
      if (!peerName.trim() || isNaN(asn) || asn < 1 || asn > 4294967295) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: Peer Name & Remote ASN (1..4294967295) harus valid.",
        });
        return;
      }
      if (!isValidIpv4Cidr(peerIp.split("/")[0])) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: Peer IP address tidak valid.",
        });
        return;
      }
    } else if (wizardModule === "Route Filter") {
      if (!filterListName.trim() || !isValidIpv4Cidr(filterPrefix)) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: Nama Policy List dan Prefix CIDR harus valid.",
        });
        return;
      }
    } else if (wizardModule === "Static Route") {
      if (!isValidIpv4Cidr(staticDest) || !isValidIpv4Cidr(staticNextHop)) {
        setCommitCheckResult({
          checkedKey: currentFormKey,
          valid: false,
          message: "Commit Check GAGAL: Destination Prefix CIDR dan Next-Hop IP harus valid.",
        });
        return;
      }
    }

    setCommitCheckResult({
      checkedKey: currentFormKey,
      valid: true,
      message: `✓ Commit Check Passed (${activeDevice.vendor} semantic & syntax OK). Silakan buka Show | Compare sebelum eksekusi.`,
    });
  };

  const handleExecuteCommit = async (commitMode: "confirmed_timer" | "direct") => {
    if (!activeDevice) return;
    if (!isCommitChecked || !isCompareReviewed) {
      onNotify("Wajib menjalankan Commit Check dan membuka Show | Compare terlebih dahulu.");
      return;
    }

    setBusyAction(true);
    const prevIface = activeDevice.interfaces.find(
      (i) => i.name.toLowerCase() === portName.toLowerCase()
    );

    const payload: Record<string, unknown> = {
      action: "commit_wizard_config",
      deviceId: activeDevice.id,
      module: wizardModule,
      commitMode,
      summary: generatedPreview.summary,
      diffPayload: generatedPreview.diffText,
      actorName: currentUser.fullName,
      actorRole: currentUser.role,
    };

    if (wizardModule === "Interface/VLAN") {
      payload.interfacePayload = {
        portName: portName.trim(),
        vlan: Number(vlanId),
        description: portDesc.trim(),
        portStatus,
      };
    } else if (wizardModule === "BGP Peering") {
      payload.bgpPayload = {
        peerName: peerName.trim(),
        remoteAsn: Number(remoteAsn),
        peerIp: peerIp.trim(),
        peerType,
      };
    } else if (wizardModule === "Route Filter") {
      payload.filterPayload = {
        listName: filterListName.trim(),
        prefix: filterPrefix.trim(),
        matchType: filterMatch,
        uptoLen: filterMatch === "upto" ? Number(filterUptoLen) : undefined,
        action: filterAction,
        community: filterCommunity.trim(),
        comment: filterComment.trim(),
      };
    }

    const res = await onAction(payload);
    setBusyAction(false);

    if (res?.error) {
      onNotify(res.error);
      return;
    }

    if (commitMode === "confirmed_timer" && res?.auditLogId) {
      setPendingCommit({
        auditLogId: res.auditLogId,
        deviceId: activeDevice.id,
        deviceName: activeDevice.name,
        summary: generatedPreview.summary,
        secondsLeft: confirmMinutes * 60,
        rollbackIfaceName: wizardModule === "Interface/VLAN" ? portName.trim() : undefined,
        prevIfaceStatus: prevIface?.status,
      });
      onNotify(
        `Commit Confirmed aktif (${confirmMinutes} menit) pada ${activeDevice.name} — klik Konfirmasi atau biarkan auto-rollback.`
      );
    } else {
      onNotify(`Konfigurasi berhasil di-commit pada ${activeDevice.name} (+ Pre-Commit Backup).`);
    }
  };

  // SuperAI Live Diagnostics Analyzer computed from live NOC telemetry
  const aiInsights = useMemo(() => {
    const insights: {
      id: string;
      severity: "critical" | "warning" | "info";
      title: string;
      analysis: string;
      suggestion: string;
      deviceId: string;
    }[] = [];

    for (const dev of devices) {
      const inactivePorts = dev.interfaces.filter(
        (i) => i.status === "down" || i.status === "admin_down"
      );
      if (dev.cpuUsage >= 75) {
        insights.push({
          id: `ai-cpu-${dev.id}`,
          severity: "warning",
          title: `Routing Engine Load Tinggi pada ${dev.name} (${dev.cpuUsage}%)`,
          analysis: `CPU usage terdeteksi ${dev.cpuUsage}% dengan ${bgpPeers.filter((b) => b.deviceId === dev.id).length} sesi BGP aktif. Berpotensi memperlambat konvergensi BGP/OSPF.`,
          suggestion:
            dev.vendor === "Juniper"
              ? "show system processes extensive | no-more"
              : "/system resource print; /routing bgp session print",
          deviceId: dev.id,
        });
      }
      if (inactivePorts.length > 0) {
        insights.push({
          id: `ai-port-${dev.id}`,
          severity: "info",
          title: `${inactivePorts.length} Interface Non-Aktif / Standby pada ${dev.name}`,
          analysis: `Port terdeteksi tidak membawa trafik (0 Mbps): ${inactivePorts
            .map((p) => `${p.name} [${p.status.toUpperCase()}]`)
            .join(", ")}.`,
          suggestion:
            dev.vendor === "Juniper"
              ? `show interfaces terse | match "${inactivePorts[0].name}"`
              : `/interface print detail where name="${inactivePorts[0].name}"`,
          deviceId: dev.id,
        });
      }
    }

    const losOnus = onus.filter((o) => o.status === "los");
    if (losOnus.length > 0) {
      insights.push({
        id: "ai-los-olt",
        severity: "critical",
        title: `NOCAI OLT Korelasi: ${losOnus.length} ONU Putus FO (LOS)`,
        analysis: `Terindikasi redaman -40 dBm pada ${losOnus[0]?.oltName} port ${losOnus[0]?.ponPort} area ${losOnus[0]?.odpName}. Pola mengarah ke gangguan splitter ODP atau kabel drop putus.`,
        suggestion: "show gpon onu state gpon-olt_1/1/2 | include LOS",
        deviceId: losOnus[0]?.oltId || devices[0]?.id || "",
      });
    }

    if (incidents.some((i) => !i.resolved)) {
      insights.push({
        id: "ai-inc-open",
        severity: "warning",
        title: `${incidents.filter((i) => !i.resolved).length} Insiden Aktif Perlu Triage L1`,
        analysis:
          "Gunakan Safety Net Wizard + Commit Confirmed sebelum mengubah policy routing atau mengaktifkan port backup saat jam sibuk.",
        suggestion: "show | compare -> commit confirmed 3",
        deviceId: devices[0]?.id || "",
      });
    }

    return insights;
  }, [devices, onus, bgpPeers, incidents]);

  const handleDownloadSnapshot = (snap: ConfigSnapshot) => {
    const blob = new Blob([snap.configText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = snap.filename;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Mengunduh snapshot ${snap.filename}`);
  };

  const renderBackupControls = () => (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        disabled={isReadOnly}
        onClick={async () => {
          const res = await onAction({
            action: "toggle_auto_backup",
            actorName: currentUser.fullName,
            actorRole: currentUser.role,
          });
          if (res?.error) onNotify(res.error);
          else onNotify(`Auto-Backup 24h ${!autoBackupEnabled ? "Diaktifkan" : "Dinonaktifkan"}`);
        }}
        className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
          autoBackupEnabled
            ? isLightCard
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
            : `${subBoxCls} ${mutedText}`
        }`}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Jadwal Auto-Backup 24h: {autoBackupEnabled ? "ON" : "OFF"}
      </button>

      <select
        value={selectedDeviceId}
        onChange={(e) => setSelectedDeviceId(e.target.value)}
        className={inputCls}
      >
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.vendor})
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={isReadOnly}
        onClick={async () => {
          const res = await onAction({
            action: "create_snapshot",
            deviceId: selectedDeviceId,
            trigger: "Manual Snapshot",
            actorName: currentUser.fullName,
            actorRole: currentUser.role,
          });
          if (res?.error) onNotify(res.error);
          else onNotify("Snapshot baru berhasil disimpan ke Cloud Vault terenkripsi.");
        }}
        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Backup Sekarang
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {backupOnly ? (
        /* Dedicated Clean Header for Backup View (No Wizard / No Route Filter / No Banner Clutter) */
        <div className={`${cardCls} p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <h3 className={`text-xl font-bold ${headingText} flex items-center gap-2.5`}>
              <Cloud className="w-5 h-5 text-cyan-400" />
              Cloud Backup Vault
            </h3>
            <p className={`text-xs ${mutedText} mt-1`}>
              Pusat penyimpanan cadangan konfigurasi multi-vendor, auto-backup terjadwal 24 jam, dan pemulihan snapshot terenkripsi AES-256.
            </p>
          </div>

          {renderBackupControls()}
        </div>
      ) : (
        /* Top Sub-Navigation Banner (Automation & Config Wizard) */
        <div className={`${cardCls} p-5`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  isLightCard
                    ? "bg-sky-50 text-sky-700 border-sky-200"
                    : "bg-cyan-500/20 text-cyan-300 border-cyan-400/40"
                }`}
              >
                NOCVISION ENGINE INTEGRATED
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${
                  isLightCard
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
                }`}
              >
                <Lock className="w-3 h-3" />
                Zero Direct Access Gateway
              </span>
            </div>
            <h3 className={`text-base font-bold ${headingText} mt-2 flex items-center gap-2`}>
              <Zap className="w-4 h-4 text-cyan-400" />
              Otomasi Router Tanpa CLI, Commit Confirmed, Cloud Auto-Backup &amp; NOCAI
            </h3>
            <p className={`text-xs ${mutedText} mt-0.5`}>
              Eskalasi NOC Level 1 aman tanpa risiko fat-finger: Commit Check, wajib Show | Compare, Timer Auto-Rollback, &amp; Vault Backup Terenkripsi.
            </p>
          </div>

          {/* Sub-Tabs Pills */}
          <div
            className={`flex flex-wrap items-center gap-1.5 p-1 rounded-2xl border ${
              isLightCard
                ? "bg-slate-100 border-slate-200"
                : "bg-[#040e1d] border-sky-500/25"
            }`}
          >
            {[
              { id: "wizard", label: "Config Wizard & Commit Confirmed", icon: GitCompare },
              { id: "backup", label: `Cloud Auto-Backup (${snapshots.length})`, icon: Cloud },
              { id: "ai_filters", label: "Route Filter & NOCAI", icon: Bot },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id as WizardSubTab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    subTab === t.id
                      ? "bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow"
                      : isLightCard
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Read-Only Auditor Warning */}
        {isReadOnly && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Anda login sebagai <strong>{currentUser.role}</strong> (Read-Only). Eksekusi Commit &amp; Restore diblokir otomatis oleh RBAC.
            </span>
          </div>
        )}

        {/* Active Commit Confirmed Countdown Timer Banner */}
        {pendingCommit && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-400/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-400 animate-pulse shrink-0 mt-0.5" />
              <div>
                <p className={`text-xs font-bold ${headingText}`}>
                  COMMIT CONFIRMED AKTIF — Menunggu Konfirmasi ({pendingCommit.deviceName})
                </p>
                <p className={`text-[11px] ${mutedText} font-mono mt-0.5`}>
                  {pendingCommit.summary}
                </p>
                <p className="text-xs font-mono font-bold text-amber-300 mt-1">
                  Auto-Rollback Timer:{" "}
                  {String(Math.floor(pendingCommit.secondsLeft / 60)).padStart(2, "0")}:
                  {String(pendingCommit.secondsLeft % 60).padStart(2, "0")} tersisa
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const current = pendingCommit;
                  setPendingCommit(null);
                  await onAction({
                    action: "resolve_pending_commit",
                    mode: "confirm",
                    auditLogId: current.auditLogId,
                    deviceId: current.deviceId,
                    actorName: currentUser.fullName,
                    actorRole: currentUser.role,
                  });
                  onNotify(`Commit Confirmed dipermanenkan pada ${current.deviceName}.`);
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Konfirmasi Permanen (Confirm)
              </button>

              <button
                type="button"
                onClick={async () => {
                  const current = pendingCommit;
                  setPendingCommit(null);
                  await onAction({
                    action: "resolve_pending_commit",
                    mode: "auto_rollback",
                    auditLogId: current.auditLogId,
                    deviceId: current.deviceId,
                    rollbackIfaceName: current.rollbackIfaceName,
                    prevIfaceStatus: current.prevIfaceStatus,
                    actorName: currentUser.fullName,
                    actorRole: currentUser.role,
                  });
                  onNotify(`Simulasi SSH Putus: Auto-Rollback dijalankan pada ${current.deviceName}.`);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Simulasi Putus / Rollback
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ===================== SUBTAB 1: CONFIG WIZARD & SAFETY NET ===================== */}
      {!backupOnly && subTab === "wizard" && activeDevice && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left: Step 1 & 2 Visual Wizard Form */}
          <div className={`${cardCls} p-5 xl:col-span-6 space-y-4`}>
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div>
                <h4 className={`text-sm font-bold ${headingText}`}>
                  Langkah 1–3: Visual Configuration Wizard
                </h4>
                <p className={`text-[11px] ${mutedText}`}>
                  Pilih router, pilih modul, isi form tervalidasi tanpa sintaksis CLI manual
                </p>
              </div>
              <span className={`text-xs font-mono font-bold ${cyanNum}`}>
                {activeDevice.vendor} • {activeDevice.osVersion.split(" ")[0]}
              </span>
            </div>

            {/* Target Device Picker */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-semibold ${mutedText} block`}>
                1. Pilih Router / Switch / OLT dari Inventory
              </label>
              <select
                value={activeDevice.id}
                onChange={(e) => handleSelectWizardDevice(e.target.value)}
                className={`${inputCls} w-full`}
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    [{d.vendor}] {d.name} ({d.ipAddress}) — {d.role}
                  </option>
                ))}
              </select>
            </div>

            {/* Module Picker */}
            <div className="space-y-1.5">
              <label className={`text-[11px] font-semibold ${mutedText} block`}>
                2. Pilih Modul Konfigurasi
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["Interface/VLAN", "BGP Peering", "Route Filter", "Static Route"] as WizardModule[]).map(
                  (mod) => (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => {
                        setWizardModule(mod);
                        setCommitCheckResult(null);
                        setShowCompareOpenedKey("");
                      }}
                      className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                        wizardModule === mod
                          ? isLightCard
                            ? "bg-sky-500 text-white border-sky-500"
                            : "bg-cyan-500/20 text-cyan-300 border-cyan-400"
                          : `${subBoxCls} ${mutedText}`
                      }`}
                    >
                      {mod}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Dynamic Form Fields per Module */}
            <div className={`${subBoxCls} rounded-2xl p-4 space-y-3`}>
              <p className={`text-xs font-bold ${headingText}`}>
                3. Parameter {wizardModule} (Tervalidasi)
              </p>

              {wizardModule === "Interface/VLAN" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Interface Port</label>
                    <select
                      value={portName}
                      onChange={(e) => setPortName(e.target.value)}
                      className={`${inputCls} w-full`}
                    >
                      {activeDevice.interfaces.map((iface) => (
                        <option key={iface.id} value={iface.name}>
                          {iface.name} [{iface.status.toUpperCase()}]
                        </option>
                      ))}
                      <option value="ge-0/0/9">ge-0/0/9 [NEW SUB-IF]</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Status Link Target</label>
                    <select
                      value={portStatus}
                      onChange={(e) => setPortStatus(e.target.value as "up" | "admin_down")}
                      className={`${inputCls} w-full`}
                    >
                      <option value="up">Enable Link (UP / Active)</option>
                      <option value="admin_down">Shutdown Port (ADMIN DOWN)</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>VLAN ID (802.1Q)</label>
                    <input
                      value={vlanId}
                      onChange={(e) => setVlanId(e.target.value)}
                      className={`${inputCls} w-full`}
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>IP Address / CIDR</label>
                    <input
                      value={ipCidr}
                      onChange={(e) => setIpCidr(e.target.value)}
                      className={`${inputCls} w-full`}
                      placeholder="172.16.10.1/30"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Deskripsi Interface</label>
                    <input
                      value={portDesc}
                      onChange={(e) => setPortDesc(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                </div>
              )}

              {wizardModule === "BGP Peering" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Nama Peer / Upstream</label>
                    <input
                      value={peerName}
                      onChange={(e) => setPeerName(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Tipe Peer</label>
                    <select
                      value={peerType}
                      onChange={(e) =>
                        setPeerType(e.target.value as "Upstream" | "IXP" | "Customer" | "iBGP")
                      }
                      className={`${inputCls} w-full`}
                    >
                      <option value="IXP">IXP</option>
                      <option value="Upstream">Upstream</option>
                      <option value="Customer">Customer</option>
                      <option value="iBGP">iBGP</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Remote ASN</label>
                    <input
                      value={remoteAsn}
                      onChange={(e) => setRemoteAsn(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Neighbor IP</label>
                    <input
                      value={peerIp}
                      onChange={(e) => setPeerIp(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                </div>
              )}

              {wizardModule === "Route Filter" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Policy / Filter List Name</label>
                    <input
                      value={filterListName}
                      onChange={(e) => setFilterListName(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Prefix CIDR</label>
                    <input
                      value={filterPrefix}
                      onChange={(e) => setFilterPrefix(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Match Mode</label>
                    <select
                      value={filterMatch}
                      onChange={(e) => setFilterMatch(e.target.value as "exact" | "orlonger" | "upto")}
                      className={`${inputCls} w-full`}
                    >
                      <option value="exact">exact</option>
                      <option value="orlonger">orlonger</option>
                      <option value="upto">upto /Len</option>
                    </select>
                  </div>
                  {filterMatch === "upto" && (
                    <div>
                      <label className={`text-[10px] ${mutedText} block mb-1`}>Upto Prefix Length (/Len)</label>
                      <input
                        value={filterUptoLen}
                        onChange={(e) => setFilterUptoLen(e.target.value)}
                        placeholder="24"
                        className={`${inputCls} w-full`}
                      />
                    </div>
                  )}
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Action</label>
                    <select
                      value={filterAction}
                      onChange={(e) => setFilterAction(e.target.value as "accept" | "reject")}
                      className={`${inputCls} w-full`}
                    >
                      <option value="accept">accept</option>
                      <option value="reject">reject</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>BGP Community Tag</label>
                    <input
                      value={filterCommunity}
                      onChange={(e) => setFilterCommunity(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Catatan</label>
                    <input
                      value={filterComment}
                      onChange={(e) => setFilterComment(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                </div>
              )}

              {wizardModule === "Static Route" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Destination Prefix</label>
                    <input
                      value={staticDest}
                      onChange={(e) => setStaticDest(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Next-Hop IP</label>
                    <input
                      value={staticNextHop}
                      onChange={(e) => setStaticNextHop(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                  <div>
                    <label className={`text-[10px] ${mutedText} block mb-1`}>Preference / Distance</label>
                    <input
                      value={staticPref}
                      onChange={(e) => setStaticPref(e.target.value)}
                      className={`${inputCls} w-full`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Generated Vendor Syntax Preview */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className={mutedText}>Generated {activeDevice.vendor} Syntax:</span>
                <span className="font-mono text-emerald-400">Anti-Fat-Finger Validated</span>
              </div>
              <pre className="p-3 rounded-2xl bg-[#020814] border border-sky-500/25 text-[11px] font-mono text-cyan-200 overflow-x-auto">
                {generatedPreview.syntaxLines}
              </pre>
            </div>
          </div>

          {/* Right: Step 4 Safety Net (Commit Check, Mandatory Show|Compare, Commit Confirmed) */}
          <div className={`${cardCls} p-5 xl:col-span-6 flex flex-col justify-between space-y-4`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                <div>
                  <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Langkah 4: Safety Net (Commit Check &amp; Show | Compare)
                  </h4>
                  <p className={`text-[11px] ${mutedText}`}>
                    Wajib verifikasi sintaks dan baca diff sebelum eksekusi ke router produksi
                  </p>
                </div>
              </div>

              {/* Step A: Commit Check */}
              <div className={`${subBoxCls} rounded-2xl p-4 space-y-2.5`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${headingText}`}>
                    A. Commit Check (Validasi Sintaks &amp; Semantik)
                  </span>
                  <button
                    type="button"
                    onClick={handleRunCommitCheck}
                    className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Jalankan Commit Check
                  </button>
                </div>
                {commitCheckResult?.checkedKey === currentFormKey && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-mono border ${
                      commitCheckResult.valid
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                    }`}
                  >
                    {commitCheckResult.message}
                  </div>
                )}
              </div>

              {/* Step B: Mandatory Show | Compare Visual Diff */}
              <div className={`${subBoxCls} rounded-2xl p-4 space-y-2.5`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${headingText}`}>
                    B. Mandatory Show | Compare Visual Diff
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCompareOpenedKey(currentFormKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                      isCompareReviewed
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        : "bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400/50 text-indigo-300"
                    }`}
                  >
                    <FileDiff className="w-3.5 h-3.5" />
                    {isCompareReviewed ? "✓ Diff Telah Direview" : "Buka Show | Compare"}
                  </button>
                </div>

                {isCompareReviewed ? (
                  <pre className="p-3 rounded-xl bg-[#020814] border border-cyan-500/30 text-[11px] font-mono overflow-x-auto leading-relaxed">
                    {generatedPreview.diffText.split("\n").map((line, idx) => (
                      <span
                        key={idx}
                        className={`block ${
                          line.startsWith("+")
                            ? "text-emerald-400"
                            : line.startsWith("-")
                            ? "text-rose-400"
                            : "text-sky-300"
                        }`}
                      >
                        {line}
                      </span>
                    ))}
                  </pre>
                ) : (
                  <p className={`text-[11px] ${mutedText} italic`}>
                    Klik tombol &ldquo;Buka Show | Compare&rdquo; untuk membaca perubahan sebelum Commit dibuka.
                  </p>
                )}
              </div>
            </div>

            {/* Step C: Execute Commit Confirmed / Direct Commit */}
            <div className={`${subBoxCls} rounded-2xl p-4 space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs font-bold ${headingText}`}>
                  C. Eksekusi Aman + Auto Pre-Commit Backup
                </span>
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className={mutedText}>Timer Rollback:</span>
                  {[1, 3, 5].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setConfirmMinutes(m)}
                      className={`px-2 py-0.5 rounded-lg border cursor-pointer ${
                        confirmMinutes === m
                          ? "bg-amber-400 text-slate-950 border-amber-400 font-bold"
                          : "border-slate-600/50 text-slate-400"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busyAction || !isCommitChecked || !isCompareReviewed || isReadOnly}
                  onClick={() => handleExecuteCommit("confirmed_timer")}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  Commit Confirmed ({confirmMinutes}m Rollback)
                </button>

                <button
                  type="button"
                  disabled={busyAction || !isCommitChecked || !isCompareReviewed || isReadOnly}
                  onClick={() => handleExecuteCommit("direct")}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Commit Langsung (+Backup)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== SUBTAB 2: CLOUD AUTO-BACKUP & DISASTER RECOVERY ===================== */}
      {(backupOnly || subTab === "backup") && (
        <div className="space-y-6">
          {!backupOnly && (
            <div className={`${cardCls} p-5 flex flex-wrap items-center justify-between gap-4`}>
              <div>
                <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  Cloud Auto-Backup Terenkripsi &amp; Disaster Recovery (&lt; 5 Menit RTO)
                </h4>
                <p className={`text-xs ${mutedText} mt-0.5`}>
                  Lindungi seluruh aset konfigurasi BGP, Policy, dan OLT dari kerusakan hardware atau korup flash.
                </p>
              </div>

              {renderBackupControls()}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Snapshots List */}
            <div className={`${cardCls} p-5 xl:col-span-7 space-y-3`}>
              <h4 className={`text-sm font-bold ${headingText}`}>
                Riwayat Snapshot Konfigurasi ({snapshots.length} Versi)
              </h4>
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className={`${subBoxCls} rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-xs ${headingText} truncate`}>
                          {snap.filename}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          AES-256
                        </span>
                      </div>
                      <p className={`text-[11px] ${mutedText} mt-0.5`}>
                        {snap.deviceName} ({snap.vendor}) • {snap.trigger} • {snap.lineCount} baris (
                        {Math.round(snap.sizeBytes / 1024)} KB)
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                        {new Date(snap.createdAt).toLocaleString("id-ID")} • {snap.checksum}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewSnapshot(snap)}
                        className="px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        Lihat
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSnapshot(snap)}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        Unduh
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={async () => {
                          const res = await onAction({
                            action: "restore_snapshot",
                            snapshotId: snap.id,
                            actorName: currentUser.fullName,
                            actorRole: currentUser.role,
                          });
                          if (res?.error) onNotify(res.error);
                          else onNotify(`Disaster Recovery Restore dari ${snap.filename} selesai (< 5 menit RTO).`);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Snapshot Viewer & Compare */}
            <div className={`${cardCls} p-5 xl:col-span-5 space-y-3`}>
              <div className="flex items-center justify-between">
                <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  Inspector Isi Snapshot
                </h4>
                {previewSnapshot && (
                  <select
                    value={compareSnapshotId}
                    onChange={(e) => setCompareSnapshotId(e.target.value)}
                    className={`${inputCls} py-1 px-2 text-[10px]`}
                  >
                    <option value="">Tampilkan Raw Config</option>
                    {snapshots
                      .filter((s) => s.id !== previewSnapshot.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          Compare vs {s.filename}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              {previewSnapshot ? (
                <pre className="p-3.5 rounded-2xl bg-[#020814] border border-sky-500/25 text-[11px] font-mono text-slate-200 max-h-[420px] overflow-auto leading-relaxed">
                  {compareSnapshotId
                    ? (() => {
                        const other = snapshots.find((s) => s.id === compareSnapshotId);
                        if (!other) return previewSnapshot.configText;
                        const aLines = previewSnapshot.configText.split("\n");
                        const bSet = new Set(other.configText.split("\n"));
                        return aLines.map((line, i) => (
                          <span
                            key={i}
                            className={`block ${
                              bSet.has(line) ? "text-slate-400" : "text-emerald-400 font-bold"
                            }`}
                          >
                            {bSet.has(line) ? `  ${line}` : `+ ${line}`}
                          </span>
                        ));
                      })()
                    : previewSnapshot.configText}
                </pre>
              ) : (
                <div className={`${subBoxCls} rounded-2xl p-8 text-center text-xs ${mutedText}`}>
                  Pilih tombol <strong>Lihat</strong> pada salah satu snapshot di sebelah kiri untuk membaca isi konfigurasi atau membandingkan versi.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== SUBTAB 3: ROUTE FILTER & SUPERAI DIAGNOSTICS ===================== */}
      {!backupOnly && subTab === "ai_filters" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left: Route Filter List Manager */}
          <div className={`${cardCls} p-5 xl:col-span-6 space-y-4`}>
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div>
                <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                  <Filter className="w-4 h-4 text-cyan-400" />
                  Route Filter List &amp; BGP Prefix Policy Manager
                </h4>
                <p className={`text-[11px] ${mutedText}`}>
                  Kelola daftar prefix bogon filter dan export prefix ISP tanpa edit CLI manual
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubTab("wizard");
                  setWizardModule("Route Filter");
                }}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah via Wizard
              </button>
            </div>

            <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
              {routeFilters.map((rf) => {
                const dev = devices.find((d) => d.id === rf.deviceId);
                return (
                  <div
                    key={rf.id}
                    className={`${subBoxCls} rounded-2xl p-3.5 flex items-center justify-between gap-3`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs text-cyan-400">
                          {rf.listName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                            rf.action === "accept"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/35"
                              : "bg-rose-500/15 text-rose-400 border-rose-500/35"
                          }`}
                        >
                          {rf.action.toUpperCase()}
                        </span>
                        <span className={`font-mono text-xs font-bold ${headingText}`}>
                          {rf.prefix} ({rf.matchType}
                          {rf.uptoLen ? ` /${rf.uptoLen}` : ""})
                        </span>
                      </div>
                      <p className={`text-[11px] ${mutedText} mt-1`}>
                        {dev?.name || rf.deviceId} • {rf.comment}
                        {rf.community ? ` • Community: ${rf.community}` : ""}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isReadOnly}
                      onClick={async () => {
                        const res = await onAction({
                          action: "delete_route_filter",
                          ruleId: rf.id,
                          actorName: currentUser.fullName,
                          actorRole: currentUser.role,
                        });
                        if (res?.error) onNotify(res.error);
                        else onNotify(`Rule ${rf.prefix} dihapus dengan aman.`);
                      }}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer disabled:opacity-40"
                      title="Safe Delete Rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: SuperAI Network Intelligence & Orchestrator */}
          <div className={`${cardCls} p-5 xl:col-span-6 space-y-4`}>
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div>
                <h4 className={`text-sm font-bold ${headingText} flex items-center gap-2`}>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  NOCVISION NOCAI — Network Intelligence Orchestrator
                </h4>
                <p className={`text-[11px] ${mutedText}`}>
                  Analisa otomatis anomali interface down/standby, CPU/BGP, dan OLT LOS secara real-time
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">
                {aiInsights.length} Findings
              </span>
            </div>

            <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
              {aiInsights.map((item) => (
                <div
                  key={item.id}
                  className={`${subBoxCls} rounded-2xl p-4 space-y-2`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 ${
                          item.severity === "critical"
                            ? "text-rose-400"
                            : item.severity === "warning"
                            ? "text-amber-400"
                            : "text-cyan-400"
                        }`}
                      />
                      <span className={`text-xs font-bold ${headingText}`}>
                        {item.title}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                        item.severity === "critical"
                          ? "bg-rose-500/20 text-rose-300"
                          : item.severity === "warning"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-cyan-500/20 text-cyan-300"
                      }`}
                    >
                      {item.severity}
                    </span>
                  </div>

                  <p className={`text-[11px] ${mutedText} leading-relaxed`}>
                    {item.analysis}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <code className="px-2.5 py-1 rounded-lg bg-[#020814] border border-sky-500/20 text-[10px] font-mono text-emerald-300">
                      {item.suggestion}
                    </code>
                    {item.deviceId && (
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectWizardDevice(item.deviceId);
                          setSubTab("wizard");
                        }}
                        className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        Remediasi di Wizard →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
