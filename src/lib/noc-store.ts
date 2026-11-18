import * as fs from "fs";
import * as path from "path";
import {
  AlertDeliveryLog,
  AlertingConfig,
  AuditLogEntry,
  BgpPeer,
  ConfigSnapshot,
  IncidentAlert,
  NetworkDevice,
  OnuDevice,
  RouteFilterRule,
  TopologyLink,
  TrafficPoint,
} from "./types";
import { executeRealPing, probeTcpPort } from "./network-poller";

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

  for (const dev of state.devices) {
    if (forceRealPing || dev.pollingMode === "live_icmp_tcp") {
      const pingRes = await executeRealPing(dev.ipAddress, 1);
      const sshRes = await probeTcpPort(dev.ipAddress, dev.sshPort || 22, "SSH", 800);
      if (pingRes.alive || sshRes.open) {
        dev.latencyMs = pingRes.alive ? pingRes.latencyMs : sshRes.responseTimeMs;
        dev.packetLossPct = pingRes.alive ? pingRes.packetLossPct : 0;
        if (dev.status === "offline") dev.status = "online";
      } else if (dev.pollingMode === "live_icmp_tcp") {
        dev.status = "offline";
        dev.latencyMs = 0;
        dev.packetLossPct = 100;
      }
    } else {
      // Realistic telemetry jitter for active simulation / hybrid devices
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
  }

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
    coreLatencyMs: state.devices[0]?.latencyMs || 1.4,
    activeOnuCount,
  });
  if (state.trafficHistory.length > 14) {
    state.trafficHistory.shift();
  }

  saveNocState(state);
  return state;
}
