export type DeviceRole =
  | "core_router"
  | "dist_switch"
  | "access_switch"
  | "olt"
  | "firewall"
  | "wireless";

export type VendorBrand =
  | "MikroTik"
  | "Cisco"
  | "Juniper"
  | "Huawei"
  | "ZTE"
  | "FiberHome"
  | "HSGQ"
  | "C-Data"
  | "V-SOL"
  | "BDCOM"
  | "Ruijie"
  | "Arista"
  | "Ubiquiti"
  | "Fortinet"
  | "Other";

export type DeviceStatus = "online" | "warning" | "critical" | "offline";

export type ConnectionProtocol =
  | "SNMPv2c"
  | "SNMPv3"
  | "SSH/CLI"
  | "RouterOS-API"
  | "NETCONF"
  | "RESTCONF"
  | "ICMP-Only";

export interface NetworkInterface {
  id: string;
  name: string;
  description: string;
  type: "ethernet" | "sfp_plus" | "qsfp28" | "gpon" | "epon" | "lag" | "vlan";
  status: "up" | "down" | "admin_down" | "degraded";
  speedMbps: number;
  rxMbps: number;
  txMbps: number;
  rxPowerDbm?: number; // SFP / PON DDM Rx Power
  txPowerDbm?: number; // SFP / PON DDM Tx Power
  sfpTempC?: number;
  crcErrors: number;
  drops: number;
  vlan?: number;
  connectedTo?: string;
}

export interface OltPonPort {
  id: string;
  portName: string; // e.g. gpon-olt_1/1/1 or GPON 0/1/0
  ponType: "GPON" | "EPON" | "XGS-PON";
  status: "up" | "down" | "degraded";
  sfpTxDbm: number;
  sfpTempC: number;
  maxSplitRatio: number; // e.g., 64 or 128
  totalOnu: number;
  onlineOnu: number;
  losOnu: number;
  dyingGaspOnu: number;
  rxTrafficMbps: number;
  txTrafficMbps: number;
  odcArea: string;
}

export type OnuStatus = "online" | "los" | "dying_gasp" | "offline" | "unconfigured";

export interface OnuDevice {
  id: string;
  oltId: string;
  oltName: string;
  oltVendor: VendorBrand;
  ponPort: string;
  onuIndex: number; // e.g., 1..128 -> gpon-onu_1/1/1:1
  sn: string; // Serial Number or MAC (e.g., ZTEGC1A2B3C4 / HWTC8899AABB)
  customerName: string;
  pppoeUser: string;
  odpName: string;
  model: string; // e.g., ZTE F670L, Huawei EG8145V5, FiberHome HG6145D2
  status: OnuStatus;
  rxPowerDbm: number; // ONU received optical power (e.g. -19.4 dBm)
  txPowerDbm: number; // ONU transmit optical power (e.g. +2.3 dBm)
  oltRxPowerDbm: number; // OLT side received power from this ONU (e.g. -21.8 dBm)
  distanceM: number; // Fiber distance in meters
  tempC: number;
  vlan: number;
  serviceProfile: string;
  ipAddress: string;
  rxMbps: number;
  txMbps: number;
  uptime: string;
  lastDownCause: string;
  lastSeen: string;
}

export interface BgpPeer {
  id: string;
  deviceId: string;
  deviceName: string;
  peerName: string;
  remoteAs: number;
  peerIp: string;
  type: "Upstream" | "IXP" | "Peering" | "iBGP";
  state: "Established" | "Active" | "Connect" | "Idle";
  prefixesReceived: number;
  prefixesAdvertised: number;
  uptime: string;
  rxMbps: number;
  txMbps: number;
  latencyMs: number;
}

export interface NetworkDevice {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  vendor: VendorBrand;
  model: string;
  osVersion: string;
  role: DeviceRole;
  location: string;
  rackPosition: string;
  status: DeviceStatus;
  pollingMode: "simulation" | "live_icmp_tcp" | "hybrid";
  protocols: ConnectionProtocol[];
  snmpCommunity?: string;
  snmpPort?: number;
  sshPort?: number;
  apiPort?: number;
  uptime: string;
  cpuUsage: number; // %
  memoryUsage: number; // %
  temperatureC: number; // °C
  voltageV?: number;
  psu1Status: "ok" | "fail" | "na";
  psu2Status: "ok" | "fail" | "na";
  fanRpm?: number;
  latencyMs: number;
  packetLossPct: number;
  totalRxMbps: number;
  totalTxMbps: number;
  capacityMbps: number;
  lastPolled: string;
  interfaces: NetworkInterface[];
  ponPorts?: OltPonPort[];
  notes?: string;
  coordinates?: { x: number; y: number }; // For topology layout
}

export interface TopologyLink {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort: string;
  targetPort: string;
  linkType: "100G-LR4" | "40G-LR4" | "10G-SFP+" | "1G-SFP" | "GPON-Trunk";
  capacityMbps: number;
  currentTrafficMbps: number;
  latencyMs: number;
  status: "up" | "degraded" | "down";
}

export interface IncidentAlert {
  id: string;
  timestamp: string;
  severity: "critical" | "major" | "warning" | "info";
  deviceId: string;
  deviceName: string;
  vendor: VendorBrand;
  category:
    | "pon_los"
    | "dying_gasp"
    | "bgp_down"
    | "high_cpu"
    | "link_down"
    | "optical_warn"
    | "ping_timeout";
  title: string;
  message: string;
  rootCauseAnalysis: string;
  recommendedCli?: string;
  acknowledged: boolean;
  resolved: boolean;
}

export interface TrafficPoint {
  time: string;
  totalDownloadGbps: number;
  totalUploadGbps: number;
  coreLatencyMs: number;
  activeOnuCount: number;
}

export interface VendorProfile {
  brand: VendorBrand;
  badgeColor: string;
  defaultOs: string;
  supportedRoles: DeviceRole[];
  defaultProtocols: ConnectionProtocol[];
  defaultPorts: {
    ssh: number;
    snmp: number;
    api?: number;
    telnet?: number;
  };
  snmpOids: {
    sysDescr: string;
    cpuLoad: string;
    memUsed: string;
    temperature: string;
    ifHCInOctets: string;
    ifHCOutOctets: string;
    ponOpticalRx?: string;
    onuStatusOid?: string;
  };
  cliCheatSheet: {
    label: string;
    command: string;
    description: string;
  }[];
}

export interface ConfigSnapshot {
  id: string;
  deviceId: string;
  deviceName: string;
  vendor: VendorBrand;
  filename: string;
  createdAt: string;
  trigger: "Scheduled Auto-Backup" | "Pre-Commit Safety" | "Manual Snapshot" | "Restore Point";
  sizeBytes: number;
  lineCount: number;
  checksum: string;
  encrypted: boolean;
  configText: string;
}

export interface RouteFilterRule {
  id: string;
  deviceId: string;
  listName: string;
  prefix: string;
  matchType: "exact" | "orlonger" | "upto";
  uptoLen?: number;
  action: "accept" | "reject";
  community?: string;
  comment: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  sourceIp: string;
  deviceId: string;
  deviceName: string;
  vendor: VendorBrand | "System";
  module:
    | "Interface/VLAN"
    | "BGP Peering"
    | "Route Filter"
    | "Static Route"
    | "Cloud Backup"
    | "Commit Confirmed"
    | "System/RBAC";
  actionType:
    | "COMMIT_CONFIRMED_START"
    | "COMMIT_CONFIRMED"
    | "COMMIT_APPLIED"
    | "AUTO_ROLLBACK"
    | "MANUAL_ROLLBACK"
    | "SNAPSHOT_CREATED"
    | "CONFIG_RESTORED"
    | "FILTER_UPDATED"
    | "BLOCKED_BY_RBAC";
  status: "CONFIRMED" | "PENDING_CONFIRM" | "ROLLED_BACK" | "SUCCESS" | "BLOCKED";
  summary: string;
  diffPayload?: string;
}

export type WhatsAppBotProvider =
  | "fonnte"
  | "wablas"
  | "meta_cloud"
  | "custom_webhook";

export interface AlertingConfig {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  whatsappEnabled: boolean;
  whatsappProvider: WhatsAppBotProvider;
  whatsappApiUrl: string;
  whatsappToken: string;
  whatsappTarget: string;
  notifyOnCritical: boolean;
  notifyOnOffline: boolean;
  notifyOnWarning: boolean;
  notifyOnRecovery: boolean;
  updatedAt?: string;
}

export interface AlertingConfigPublic {
  telegramEnabled: boolean;
  hasTelegramToken: boolean;
  telegramTokenMasked: string;
  telegramChatId: string;
  whatsappEnabled: boolean;
  whatsappProvider: WhatsAppBotProvider;
  whatsappApiUrl: string;
  hasWhatsappToken: boolean;
  whatsappTokenMasked: string;
  whatsappTarget: string;
  notifyOnCritical: boolean;
  notifyOnOffline: boolean;
  notifyOnWarning: boolean;
  notifyOnRecovery: boolean;
  updatedAt?: string;
}

export interface AlertDeliveryLog {
  id: string;
  timestamp: string;
  channel: "telegram" | "whatsapp";
  target: string;
  status: "sent" | "failed";
  title: string;
  messagePreview: string;
  detail: string;
  triggeredBy: string;
}



