import * as fs from "fs";
import * as path from "path";
import {
  AlertDeliveryLog,
  AlertingConfig,
  AuditLogEntry,
  AuthAccessLog,
  BgpPeer,
  ConfigSnapshot,
  CyberThreatEvent,
  IncidentAlert,
  NetworkDevice,
  OnuDevice,
  RouteFilterRule,
  TopologyLink,
  TrafficPoint,
} from "./types";
import { pollDeviceRealtime, probeSnmpBgpPeers, probeSnmpInterfaces } from "./network-poller";
import { dispatchNocAlert, reportCyberThreat } from "./alerting";

export interface NocState {
  globalMode: "hybrid" | "simulation" | "live_only";
  lastUpdated: string;
  autoBackupEnabled?: boolean;
  devices: NetworkDevice[];
  onus: OnuDevice[];
  bgpPeers: BgpPeer[];
  links: TopologyLink[];
  incidents: IncidentAlert[];
  trafficHistory: TrafficPoint[];
  configSnapshots?: ConfigSnapshot[];
  routeFilters?: RouteFilterRule[];
  auditLogs?: AuditLogEntry[];
  alertingConfig?: AlertingConfig;
  alertLogs?: AlertDeliveryLog[];
  cyberThreats?: CyberThreatEvent[];
  authAccessLogs?: AuthAccessLog[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "noc-state.json");

export function createEmptyNocState(): NocState {
  return {
    globalMode: "hybrid",
    lastUpdated: new Date().toISOString(),
    autoBackupEnabled: false,
    devices: [],
    onus: [],
    bgpPeers: [],
    links: [],
    incidents: [],
    trafficHistory: [],
    configSnapshots: [],
    routeFilters: [],
    auditLogs: [],
    alertLogs: [],
    cyberThreats: [],
    authAccessLogs: [],
  };
}

export function loadNocState(): NocState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STATE_FILE)) {
      const empty = createEmptyNocState();
      fs.writeFileSync(STATE_FILE, JSON.stringify(empty, null, 2), "utf8");
      return empty;
    }
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as NocState;

    return {
      globalMode: parsed.globalMode || "hybrid",
      lastUpdated: parsed.lastUpdated || new Date().toISOString(),
      autoBackupEnabled:
        typeof parsed.autoBackupEnabled === "boolean"
          ? parsed.autoBackupEnabled
          : false,
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      onus: Array.isArray(parsed.onus) ? parsed.onus : [],
      bgpPeers: Array.isArray(parsed.bgpPeers) ? parsed.bgpPeers : [],
      links: Array.isArray(parsed.links) ? parsed.links : [],
      incidents: Array.isArray(parsed.incidents) ? parsed.incidents : [],
      trafficHistory: Array.isArray(parsed.trafficHistory)
        ? parsed.trafficHistory
        : [],
      configSnapshots: Array.isArray(parsed.configSnapshots)
        ? parsed.configSnapshots
        : [],
      routeFilters: Array.isArray(parsed.routeFilters)
        ? parsed.routeFilters
        : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      alertingConfig: parsed.alertingConfig,
      alertLogs: Array.isArray(parsed.alertLogs) ? parsed.alertLogs : [],
      cyberThreats: Array.isArray(parsed.cyberThreats) ? parsed.cyberThreats : [],
      authAccessLogs: Array.isArray(parsed.authAccessLogs) ? parsed.authAccessLogs : [],
    };
  } catch {
    return createEmptyNocState();
  }
}

export function saveNocState(state: NocState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    state.lastUpdated = new Date().toISOString();
    const tmpFile = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.error("Failed to save NOC state:", err);
  }
}

export function resetNocState(): NocState {
  const empty = createEmptyNocState();
  saveNocState(empty);
  return empty;
}

export async function syncBgpPeersForDevice(
  state: NocState,
  dev: NetworkDevice
): Promise<number> {
  const discovered = await probeSnmpBgpPeers(
    dev.ipAddress,
    dev.snmpCommunity || "public",
    dev.snmpPort || 161
  );
  if (discovered.length === 0) return 0;

  let synced = 0;
  for (const peer of discovered) {
    synced++;
    const existing = state.bgpPeers.find(
      (p) => p.deviceId === dev.id && p.peerIp === peer.peerIp
    );
    if (existing) {
      existing.state = peer.state;
      if (peer.remoteAs > 0) existing.remoteAs = peer.remoteAs;
      existing.uptime = peer.uptime;
      existing.latencyMs = dev.latencyMs;
    } else {
      state.bgpPeers.push({
        id: `bgp-${dev.id}-${peer.peerIp.replace(/[^a-zA-Z0-9]/g, "-")}`,
        deviceId: dev.id,
        deviceName: dev.name,
        peerName: `BGP Peer ${peer.peerIp}`,
        peerIp: peer.peerIp,
        remoteAs: peer.remoteAs,
        type: "Peering",
        state: peer.state,
        uptime: peer.uptime,
        prefixesReceived: 0,
        prefixesAdvertised: 0,
        rxMbps: 0,
        txMbps: 0,
        latencyMs: dev.latencyMs,
      });
    }
  }
  return synced;
}

/**
 * Performs a telemetry refresh cycle:
 * - For devices in `live_icmp_tcp` or `hybrid` (when requested), executes real OS ping & TCP port checks
 * - Applies realistic micro-fluctuations to bandwidth, CPU, latency, and optical DDM values
 */
export async function refreshNocTelemetry(forceRealPing = false): Promise<NocState> {
  const state = loadNocState();
  const now = new Date();
  const timeLabel = now.toTimeString().slice(0, 5);

  const clamp = (val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max);

  const transitions: Array<{
    severity: "offline" | "recovery";
    title: string;
    message: string;
  }> = [];
  const cyberAlerts: Array<{
    severity: "critical" | "high" | "medium";
    category: "ddos_spike" | "bgp_hijack_flap";
    sourceIp: string;
    target: string;
    summary: string;
    mitigationAction: string;
  }> = [];

  await Promise.all(
    state.devices.map(async (dev) => {
      const prevStatus = dev.status;
      const prevRx = dev.totalRxMbps;
      if (forceRealPing || dev.pollingMode === "live_icmp_tcp" || dev.pollingMode === "hybrid") {
        const poll = await pollDeviceRealtime({
          ipAddress: dev.ipAddress,
          sshPort: dev.sshPort,
          apiPort: dev.apiPort,
          snmpPort: dev.snmpPort,
          snmpCommunity: dev.snmpCommunity,
        });

        dev.latencyMs = poll.latencyMs;
        dev.packetLossPct = poll.packetLossPct;
        if (poll.snmpResult.uptime) {
          dev.uptime = poll.snmpResult.uptime;
        }
        if (poll.snmpResult.sysDescr) {
          dev.osVersion = poll.snmpResult.sysDescr.slice(0, 64);
        }

        if (poll.alive) {
          dev.status = poll.status;
          if (prevStatus === "offline") {
            const autoInc = state.incidents.find(
              (inc) => inc.deviceId === dev.id && !inc.resolved && inc.category === "ping_timeout"
            );
            if (autoInc) autoInc.resolved = true;
            transitions.push({
              severity: "recovery",
              title: `Device Recovered: ${dev.name}`,
              message: `[NOCVISION RECOVERY] ${dev.name} (${dev.ipAddress}) kembali ONLINE. Latency: ${dev.latencyMs} ms.`,
            });
          }
          if (poll.snmpResult.reachable) {
            const realIfaces = await probeSnmpInterfaces(
              dev.ipAddress,
              dev.snmpCommunity || "public",
              dev.snmpPort || 161,
              dev.id
            );
            if (realIfaces.length > 0) {
              dev.interfaces = realIfaces;
              dev.totalRxMbps = Number(
                realIfaces.reduce((sum, i) => sum + i.rxMbps, 0).toFixed(2)
              );
              dev.totalTxMbps = Number(
                realIfaces.reduce((sum, i) => sum + i.txMbps, 0).toFixed(2)
              );
            }
            if (dev.role === "core_router" || dev.role === "firewall") {
              const prevPeerStates = new Map(
                state.bgpPeers
                  .filter((p) => p.deviceId === dev.id)
                  .map((p) => [p.peerIp, p.state])
              );
              await syncBgpPeersForDevice(state, dev);
              for (const bp of state.bgpPeers) {
                if (bp.deviceId === dev.id && prevPeerStates.get(bp.peerIp) === "Established" && bp.state !== "Established") {
                  cyberAlerts.push({
                    severity: "high",
                    category: "bgp_hijack_flap",
                    sourceIp: bp.peerIp,
                    target: `${dev.name} (AS${bp.remoteAs})`,
                    summary: `Sesi BGP ${bp.peerName} (${bp.peerIp}) drop dari Established ke ${bp.state} saat router online.`,
                    mitigationAction: "Verifikasi BGP Hold-Timer, RPKI/ROA, dan route-filter prefix pada upstream.",
                  });
                }
              }
            }

            if (
              dev.capacityMbps > 0 &&
              (dev.totalRxMbps >= dev.capacityMbps * 0.85 ||
                (prevRx > 50 && dev.totalRxMbps > prevRx * 3 && dev.totalRxMbps > 500 && dev.packetLossPct > 0))
            ) {
              cyberAlerts.push({
                severity: "critical",
                category: "ddos_spike",
                sourceIp: dev.ipAddress,
                target: dev.name,
                summary: `Lonjakan trafik mencurigakan ${dev.totalRxMbps} Mbps (kapasitas ${dev.capacityMbps} Mbps, loss ${dev.packetLossPct}%).`,
                mitigationAction: "Terapkan rate-limit / SYN-flood drop di firewall & aktifkan BGP RTBH blackhole bila serangan berlanjut.",
              });
            }
          }
        } else {
          dev.status = "offline";
          dev.latencyMs = 0;
          dev.packetLossPct = 100;
          dev.cpuUsage = 0;
          dev.totalRxMbps = 0;
          dev.totalTxMbps = 0;
          dev.interfaces.forEach((iface) => {
            iface.rxMbps = 0;
            iface.txMbps = 0;
          });
          state.bgpPeers.forEach((bp) => {
            if (bp.deviceId === dev.id) {
              bp.state = "Idle";
              bp.uptime = "0d 00h 00m";
            }
          });

          if (prevStatus !== "offline") {
            const hasOpen = state.incidents.some(
              (inc) => inc.deviceId === dev.id && !inc.resolved
            );
            if (!hasOpen) {
              state.incidents.unshift({
                id: `inc-${Date.now().toString().slice(-6)}-${dev.id.slice(-3)}`,
                timestamp: now.toISOString(),
                severity: "critical",
                deviceId: dev.id,
                deviceName: dev.name,
                vendor: dev.vendor,
                category: "ping_timeout",
                title: `${dev.name} (${dev.ipAddress}) Unreachable / Offline`,
                message: `Polling real-time ICMP/TCP/SNMP gagal menjangkau perangkat ${dev.name}.`,
                rootCauseAnalysis: "Tidak ada respons ICMP Echo maupun port manajemen TCP/SNMP dari perangkat target.",
                acknowledged: false,
                resolved: false,
              });
            }
            transitions.push({
              severity: "offline",
              title: `Device Offline: ${dev.name}`,
              message: `[NOCVISION CRITICAL] ${dev.name} (${dev.ipAddress}) OFFLINE / Unreachable pada ${now.toLocaleString("id-ID")}.`,
            });
          }
        }
      } else {
        // Simulation mode only
        const deltaCpu = Math.round((Math.random() - 0.48) * 4);
        dev.cpuUsage = clamp(dev.cpuUsage + deltaCpu, 8, 94);
        dev.latencyMs = Number(
          clamp(dev.latencyMs + (Math.random() - 0.5) * 0.4, 0.5, 25).toFixed(1)
        );
        const rxFactor = 1 + (Math.random() - 0.48) * 0.06;
        const txFactor = 1 + (Math.random() - 0.48) * 0.06;
        dev.totalRxMbps = Math.round(clamp(dev.totalRxMbps * rxFactor, 120, dev.capacityMbps * 0.92));
        dev.totalTxMbps = Math.round(clamp(dev.totalTxMbps * txFactor, 50, dev.capacityMbps * 0.85));

        dev.interfaces.forEach((iface) => {
          if (iface.status === "up" || iface.status === "degraded") {
            iface.rxMbps = Math.round(clamp(iface.rxMbps * rxFactor, 10, iface.speedMbps * 0.95));
            iface.txMbps = Math.round(clamp(iface.txMbps * txFactor, 10, iface.speedMbps * 0.95));
            if (typeof iface.rxPowerDbm === "number") {
              iface.rxPowerDbm = Number(
                (iface.rxPowerDbm + (Math.random() - 0.5) * 0.08).toFixed(2)
              );
            }
          } else {
            iface.rxMbps = 0;
            iface.txMbps = 0;
          }
        });
      }
      dev.lastPolled = now.toISOString();
    })
  );

  // Slight optical & traffic jitter on online ONUs
  for (const onu of state.onus) {
    if (onu.status === "online") {
      onu.rxPowerDbm = Number(
        clamp(onu.rxPowerDbm + (Math.random() - 0.5) * 0.06, -31.0, -12.0).toFixed(2)
      );
      onu.rxMbps = Number(
        clamp(onu.rxMbps * (1 + (Math.random() - 0.48) * 0.08), 1.2, 980).toFixed(1)
      );
      onu.txMbps = Number(
        clamp(onu.txMbps * (1 + (Math.random() - 0.48) * 0.08), 0.5, 500).toFixed(1)
      );
      onu.lastSeen = now.toISOString();
    }
  }

  // Update topology link traffic from source devices
  for (const link of state.links) {
    const delta = 1 + (Math.random() - 0.48) * 0.05;
    link.currentTrafficMbps = Math.round(
      clamp(link.currentTrafficMbps * delta, 100, link.capacityMbps * 0.95)
    );
  }

  // Push new point to trafficHistory
  const totalDlGbps = Number(
    (
      state.devices
        .filter((d) => d.role === "core_router")
        .reduce((acc, d) => acc + d.totalRxMbps, 0) / 1000
    ).toFixed(2)
  );
  const totalUlGbps = Number(
    (
      state.devices
        .filter((d) => d.role === "core_router")
        .reduce((acc, d) => acc + d.totalTxMbps, 0) / 1000
    ).toFixed(2)
  );
  const activeOnuCount = state.devices
    .filter((d) => d.role === "olt")
    .reduce(
      (sum, olt) =>
        sum + (olt.ponPorts?.reduce((pSum, p) => pSum + p.onlineOnu, 0) || 0),
      0
    );

  state.trafficHistory.push({
    time: timeLabel,
    totalDownloadGbps: totalDlGbps,
    totalUploadGbps: totalUlGbps,
    coreLatencyMs: state.devices[0]?.latencyMs ?? 0,
    activeOnuCount,
  });
  if (state.trafficHistory.length > 14) {
    state.trafficHistory.shift();
  }

  saveNocState(state);

  for (const t of transitions) {
    await dispatchNocAlert({
      severity: t.severity,
      title: t.title,
      message: t.message,
      triggeredBy: "Realtime Poller",
    });
  }

  for (const c of cyberAlerts) {
    await reportCyberThreat({
      ...c,
      triggeredBy: "Cyber Defense Monitor",
    });
  }

  return loadNocState();
}
