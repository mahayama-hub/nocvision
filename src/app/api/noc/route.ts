import { NextRequest, NextResponse } from "next/server";
import { hasPermission, PermissionKey, requireSessionUser } from "@/lib/auth";
import {
  loadNocState,
  refreshNocTelemetry,
  resetNocState,
  saveNocState,
} from "@/lib/noc-store";
import { executeRealPing, probeTcpPort } from "@/lib/network-poller";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";
import {
  AuditLogEntry,
  ConfigSnapshot,
  ConnectionProtocol,
  DeviceRole,
  NetworkDevice,
  OnuDevice,
  VendorBrand,
} from "@/lib/types";

const ACTION_PERMISSION_MAP: Record<string, PermissionKey> = {
  reset_demo: "manage_devices",
  add_device: "manage_devices",
  delete_device: "manage_devices",
  poll_device: "run_diagnostics",
  provision_onu: "olt_provision",
  reboot_onu: "olt_provision",
  ack_incident: "manage_incidents",
  resolve_incident: "manage_incidents",
  toggle_auto_backup: "manage_devices",
  create_snapshot: "manage_devices",
  restore_snapshot: "manage_devices",
  commit_wizard_config: "manage_devices",
  resolve_pending_commit: "manage_devices",
  delete_route_filter: "manage_devices",
};

export async function GET(req: NextRequest) {
  const auth = requireSessionUser(req, "view_dashboard");
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "true";
  const realPing = searchParams.get("realPing") === "true";

  if (refresh) {
    if (!hasPermission(auth.user, "refresh_sync")) {
      return NextResponse.json(
        {
          error: `Akses ditolak: Role '${auth.user.role}' tidak memiliki izin 'refresh_sync'.`,
        },
        { status: 403 }
      );
    }
    const updated = await refreshNocTelemetry(realPing);
    return NextResponse.json(updated);
  }

  const state = loadNocState();
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const auth = requireSessionUser(req);
  if (auth.response) return auth.response;
  const currentUser = auth.user;

  try {
    const body = await req.json();
    const action = body.action as string;
    const requiredPermission = ACTION_PERMISSION_MAP[action];
    if (!requiredPermission) {
      return NextResponse.json(
        { error: "Aksi tidak dikenal." },
        { status: 400 }
      );
    }
    if (!hasPermission(currentUser, requiredPermission)) {
      return NextResponse.json(
        {
          error: `Akses ditolak: Role '${currentUser.role}' tidak memiliki izin '${requiredPermission}'.`,
        },
        { status: 403 }
      );
    }

    const state = loadNocState();

    if (action === "reset_demo") {
      const fresh = resetNocState();
      return NextResponse.json({ ok: true, state: fresh });
    }

    if (action === "add_device") {
      const vendor = (body.vendor as VendorBrand) || "MikroTik";
      const role = (body.role as DeviceRole) || "core_router";
      const profile = VENDOR_PROFILES[vendor] || VENDOR_PROFILES.Other;
      const ipAddress = (body.ipAddress as string)?.trim() || "192.168.1.1";
      const pollingMode =
        (body.pollingMode as "simulation" | "live_icmp_tcp" | "hybrid") || "hybrid";

      let latencyMs = 1.8;
      let packetLossPct = 0;
      let status: "online" | "warning" | "critical" | "offline" = "online";

      if (pollingMode === "live_icmp_tcp" || body.testNow) {
        const pingRes = await executeRealPing(ipAddress, 2);
        const sshProbe = await probeTcpPort(ipAddress, Number(body.sshPort) || 22, "SSH", 1000);
        if (pingRes.alive || sshProbe.open) {
          latencyMs = pingRes.alive ? pingRes.latencyMs : sshProbe.responseTimeMs;
          packetLossPct = pingRes.alive ? pingRes.packetLossPct : 0;
          status = "online";
        } else if (pollingMode === "live_icmp_tcp") {
          status = "offline";
          latencyMs = 0;
          packetLossPct = 100;
        }
      }

      const newId = `dev-${Date.now().toString().slice(-6)}`;
      const isOlt = role === "olt";

      const newDevice: NetworkDevice = {
        id: newId,
        name: (body.name as string)?.trim() || `${vendor.toUpperCase()}-${role.toUpperCase()}`,
        hostname:
          (body.hostname as string)?.trim() ||
          `${vendor.toLowerCase()}-${newId}.nocvision.id`,
        ipAddress,
        vendor,
        model: (body.model as string)?.trim() || `${vendor} Enterprise Series`,
        osVersion: (body.osVersion as string)?.trim() || profile.defaultOs,
        role,
        location: (body.location as string)?.trim() || "POP Utama - Rack Server",
        rackPosition: (body.rackPosition as string)?.trim() || "Rack A-02",
        status,
        pollingMode,
        protocols:
          (body.protocols as ConnectionProtocol[]) || profile.defaultProtocols,
        snmpCommunity: (body.snmpCommunity as string) || "public",
        snmpPort: Number(body.snmpPort) || profile.defaultPorts.snmp,
        sshPort: Number(body.sshPort) || profile.defaultPorts.ssh,
        apiPort: Number(body.apiPort) || profile.defaultPorts.api,
        uptime: "1d 00h 12m",
        cpuUsage: 18,
        memoryUsage: 34,
        temperatureC: 41,
        voltageV: isOlt ? -48.0 : 24.0,
        psu1Status: "ok",
        psu2Status: "ok",
        fanRpm: 4500,
        latencyMs,
        packetLossPct,
        totalRxMbps: 420,
        totalTxMbps: 180,
        capacityMbps: 10000,
        lastPolled: new Date().toISOString(),
        coordinates: {
          x: 200 + Math.floor(Math.random() * 500),
          y: role === "core_router" ? 80 : role === "olt" ? 390 : 230,
        },
        interfaces: [
          {
            id: `if-${newId}-1`,
            name: vendor === "MikroTik" ? "sfp-sfpplus1" : "TenGigabitEthernet0/1",
            description: "PRIMARY-UPLINK-10G",
            type: "sfp_plus",
            status: status === "offline" ? "down" : "up",
            speedMbps: 10000,
            rxMbps: status === "offline" ? 0 : 420,
            txMbps: status === "offline" ? 0 : 180,
            rxPowerDbm: -3.6,
            txPowerDbm: -1.2,
            sfpTempC: 42,
            crcErrors: 0,
            drops: 0,
          },
          {
            id: `if-${newId}-2`,
            name: vendor === "MikroTik" ? "ether1" : "GigabitEthernet0/1",
            description: "MGMT-OUT-OF-BAND",
            type: "ethernet",
            status: "up",
            speedMbps: 1000,
            rxMbps: 12,
            txMbps: 8,
            crcErrors: 0,
            drops: 0,
          },
          {
            id: `if-${newId}-3`,
            name: vendor === "MikroTik" ? "sfp-sfpplus2" : "TenGigabitEthernet0/2",
            description: "STANDBY-UPLINK (NO LINK)",
            type: "sfp_plus",
            status: "down",
            speedMbps: 10000,
            rxMbps: 0,
            txMbps: 0,
            crcErrors: 0,
            drops: 0,
          },
        ],
        ponPorts: isOlt
          ? [
              {
                id: `pon-${newId}-1`,
                portName:
                  vendor === "ZTE"
                    ? "gpon-olt_1/1/1"
                    : vendor === "Huawei"
                    ? "GPON 0/1/0"
                    : "PON 0/1",
                ponType: "GPON",
                status: "up",
                sfpTxDbm: 5.5,
                sfpTempC: 45,
                maxSplitRatio: 128,
                totalOnu: 16,
                onlineOnu: 16,
                losOnu: 0,
                dyingGaspOnu: 0,
                rxTrafficMbps: 85,
                txTrafficMbps: 340,
                odcArea: `${body.location || "ODC-NEW-01"}`,
              },
            ]
          : undefined,
      };

      state.devices.unshift(newDevice);

      // Connect to first Core Router or Switch in topology automatically
      const parentDev =
        state.devices.find(
          (d) =>
            d.id !== newId &&
            (role === "olt" ? d.role === "dist_switch" : d.role === "core_router")
        ) || state.devices.find((d) => d.id !== newId);

      if (parentDev) {
        state.links.push({
          id: `lnk-${Date.now()}`,
          sourceId: parentDev.id,
          targetId: newDevice.id,
          sourcePort: "sfp-uplink",
          targetPort: newDevice.interfaces[0].name,
          linkType: "10G-SFP+",
          capacityMbps: 10000,
          currentTrafficMbps: 420,
          latencyMs: newDevice.latencyMs || 1.8,
          status: newDevice.status === "offline" ? "down" : "up",
        });
      }

      saveNocState(state);
      return NextResponse.json({ ok: true, device: newDevice, state });
    }

    if (action === "delete_device") {
      const deviceId = body.deviceId as string;
      state.devices = state.devices.filter((d) => d.id !== deviceId);
      state.links = state.links.filter(
        (l) => l.sourceId !== deviceId && l.targetId !== deviceId
      );
      state.onus = state.onus.filter((o) => o.oltId !== deviceId);
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "poll_device") {
      const deviceId = body.deviceId as string;
      const dev = state.devices.find((d) => d.id === deviceId);
      if (!dev) {
        return NextResponse.json({ error: "Device not found" }, { status: 404 });
      }

      const pingRes = await executeRealPing(dev.ipAddress, 2);
      const sshRes = await probeTcpPort(dev.ipAddress, dev.sshPort || 22, "SSH", 1200);
      const webRes = await probeTcpPort(dev.ipAddress, 80, "HTTP", 1200);

      dev.lastPolled = new Date().toISOString();
      if (pingRes.alive || sshRes.open || webRes.open) {
        dev.latencyMs = pingRes.alive
          ? pingRes.latencyMs
          : sshRes.open
          ? sshRes.responseTimeMs
          : webRes.responseTimeMs;
        dev.packetLossPct = pingRes.alive ? pingRes.packetLossPct : 0;
        if (dev.status === "offline") dev.status = "online";
      } else if (dev.pollingMode === "live_icmp_tcp") {
        dev.status = "offline";
        dev.latencyMs = 0;
        dev.packetLossPct = 100;
      }

      saveNocState(state);
      return NextResponse.json({
        ok: true,
        pingResult: pingRes,
        tcpResult: { ssh: sshRes, http: webRes },
        device: dev,
        state,
      });
    }

    if (action === "provision_onu") {
      const onuId = body.onuId as string;
      const existing = state.onus.find((o) => o.id === onuId);
      if (existing) {
        existing.status = "online";
        existing.customerName =
          (body.customerName as string) || existing.customerName.replace("[NEW UNCONFIGURED] ", "");
        existing.pppoeUser = (body.pppoeUser as string) || "pppoe-active@nocvision.id";
        existing.vlan = Number(body.vlan) || 103;
        existing.serviceProfile = (body.serviceProfile as string) || "HOME-100M";
        existing.ipAddress = `100.64.${Math.floor(Math.random() * 50) + 10}.${Math.floor(Math.random() * 200) + 10}`;
        existing.rxMbps = 48.5;
        existing.txMbps = 12.4;
        existing.uptime = "0d 00h 01m";
        existing.lastDownCause = "Provisioned via NOCVISION Auto-Register";
      } else {
        // Create brand new ONU
        const olt =
          state.devices.find((d) => d.id === body.oltId) ||
          state.devices.find((d) => d.role === "olt");
        if (olt) {
          const newOnu: OnuDevice = {
            id: `onu-${Date.now().toString().slice(-5)}`,
            oltId: olt.id,
            oltName: olt.name,
            oltVendor: olt.vendor,
            ponPort: (body.ponPort as string) || olt.ponPorts?.[0]?.portName || "gpon-olt_1/1/1",
            onuIndex: Number(body.onuIndex) || Math.floor(Math.random() * 60) + 15,
            sn: ((body.sn as string) || `${olt.vendor.slice(0, 4).toUpperCase()}${Math.floor(10000000 + Math.random() * 90000000)}`).toUpperCase(),
            customerName: (body.customerName as string) || "Pelanggan FTTH Baru",
            pppoeUser: (body.pppoeUser as string) || "user-baru@nocvision.id",
            odpName: (body.odpName as string) || "ODP-01/04",
            model: (body.model as string) || `${olt.vendor} DualBand ONT`,
            status: "online",
            rxPowerDbm: Number((-17.5 - Math.random() * 4.5).toFixed(2)),
            txPowerDbm: 2.3,
            oltRxPowerDbm: -19.8,
            distanceM: Math.floor(800 + Math.random() * 1800),
            tempC: 42,
            vlan: Number(body.vlan) || 101,
            serviceProfile: (body.serviceProfile as string) || "HOME-100M",
            ipAddress: `100.64.20.${Math.floor(Math.random() * 220) + 10}`,
            rxMbps: 35.2,
            txMbps: 9.8,
            uptime: "0d 00h 01m",
            lastDownCause: "None",
            lastSeen: new Date().toISOString(),
          };
          state.onus.unshift(newOnu);
        }
      }
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "reboot_onu") {
      const onuId = body.onuId as string;
      const onu = state.onus.find((o) => o.id === onuId);
      if (onu) {
        onu.status = "online";
        onu.rxPowerDbm = Number(Math.max(onu.rxPowerDbm, -21.4).toFixed(2));
        onu.oltRxPowerDbm = Number((onu.rxPowerDbm - 1.6).toFixed(2));
        onu.uptime = "0d 00h 01m";
        onu.rxMbps = 54.2;
        onu.txMbps = 14.1;
        onu.ipAddress = onu.ipAddress === "0.0.0.0" ? "100.64.12.91" : onu.ipAddress;
        onu.lastDownCause = "Remote Reset/Optical Recalibrate by NOC";
        onu.lastSeen = new Date().toISOString();
      }
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "ack_incident") {
      const inc = state.incidents.find((i) => i.id === body.incidentId);
      if (inc) inc.acknowledged = true;
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "resolve_incident") {
      const inc = state.incidents.find((i) => i.id === body.incidentId);
      if (inc) {
        inc.acknowledged = true;
        inc.resolved = true;
      }
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    // ============ NOCVISION AUTOMATION, BACKUP, ROUTE FILTER & AUDIT ============
    const actorName = currentUser.fullName || currentUser.username;
    const actorRole = currentUser.role;
    const isReadOnlyRole = !hasPermission(currentUser, "manage_devices");

    const buildDeviceConfigText = (dev: NetworkDevice) => {
      const devPeers = state.bgpPeers.filter((p) => p.deviceId === dev.id);
      const devFilters = (state.routeFilters || []).filter((f) => f.deviceId === dev.id);
      const ifaceLines = dev.interfaces
        .map(
          (i) =>
            `  interface ${i.name} { status ${i.status}; vlan ${i.vlan || 0}; desc "${i.description}"; }`
        )
        .join("\n");
      const bgpLines = devPeers
        .map(
          (p) =>
            `  neighbor ${p.peerIp} { peer-as ${p.remoteAs}; desc "${p.peerName}"; state ${p.state}; }`
        )
        .join("\n");
      const rfLines = devFilters
        .map(
          (f) =>
            `  policy ${f.listName} { route-filter ${f.prefix} ${f.matchType} -> ${f.action}; }`
        )
        .join("\n");
      return `## NOCVISION Encrypted Cloud Config Snapshot\n## Device: ${dev.name} (${dev.vendor} ${dev.model})\n## OS: ${dev.osVersion} | Host: ${dev.hostname}\nsystem {\n  host-name ${dev.hostname};\n}\ninterfaces {\n${ifaceLines || "  # no interfaces"}\n}\nbgp {\n${bgpLines || "  # no bgp peers"}\n}\npolicy-options {\n${rfLines || "  # no route-filters"}\n}`;
    };

    const appendAudit = (entry: Omit<AuditLogEntry, "id" | "timestamp" | "actorName" | "actorRole" | "sourceIp">) => {
      state.auditLogs = state.auditLogs || [];
      state.auditLogs.unshift({
        id: `aud-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
        actorName,
        actorRole,
        sourceIp: "10.255.0.10 (Zero-Direct Gateway)",
        ...entry,
      });
      if (state.auditLogs.length > 100) {
        state.auditLogs = state.auditLogs.slice(0, 100);
      }
    };

    if (action === "toggle_auto_backup") {
      if (isReadOnlyRole) {
        appendAudit({
          deviceId: "system",
          deviceName: "NOCVISION Cloud Backup",
          vendor: "System",
          module: "Cloud Backup",
          actionType: "BLOCKED_BY_RBAC",
          status: "BLOCKED",
          summary: "Role Read-Only / Auditor mencoba mengubah jadwal Auto-Backup",
        });
        saveNocState(state);
        return NextResponse.json({ error: "Akses ditolak: Role Auditor bersifat Read-Only" }, { status: 403 });
      }
      state.autoBackupEnabled = !state.autoBackupEnabled;
      appendAudit({
        deviceId: "system",
        deviceName: "NOCVISION Scheduler",
        vendor: "System",
        module: "Cloud Backup",
        actionType: "SNAPSHOT_CREATED",
        status: "SUCCESS",
        summary: `Cloud Auto-Backup Terjadwal ${state.autoBackupEnabled ? "DIAKTIFKAN (24 jam)" : "DINONAKTIFKAN"}`,
      });
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "create_snapshot") {
      if (isReadOnlyRole) {
        return NextResponse.json({ error: "Akses ditolak: Role Auditor bersifat Read-Only" }, { status: 403 });
      }
      const dev = state.devices.find((d) => d.id === body.deviceId) || state.devices[0];
      if (!dev) return NextResponse.json({ error: "Device not found" }, { status: 404 });

      const cfgText = buildDeviceConfigText(dev);
      const ext = dev.vendor === "MikroTik" ? "rsc" : dev.vendor === "Juniper" ? "txt" : "cfg";
      const dateStr = new Date().toISOString().slice(0, 10);
      const snap: ConfigSnapshot = {
        id: `snap-${Date.now().toString().slice(-6)}`,
        deviceId: dev.id,
        deviceName: dev.name,
        vendor: dev.vendor,
        filename: `${dev.name.toLowerCase()}_${dateStr}_${Date.now().toString().slice(-4)}.${ext}`,
        createdAt: new Date().toISOString(),
        trigger: (body.trigger as ConfigSnapshot["trigger"]) || "Manual Snapshot",
        sizeBytes: cfgText.length * 48,
        lineCount: cfgText.split("\n").length + 120,
        checksum: `sha256:${Math.random().toString(16).slice(2, 14)}`,
        encrypted: true,
        configText: cfgText,
      };
      state.configSnapshots = state.configSnapshots || [];
      state.configSnapshots.unshift(snap);
      appendAudit({
        deviceId: dev.id,
        deviceName: dev.name,
        vendor: dev.vendor,
        module: "Cloud Backup",
        actionType: "SNAPSHOT_CREATED",
        status: "SUCCESS",
        summary: `Snapshot ${snap.filename} (${snap.lineCount} baris) disimpan terenkripsi ke Cloud Vault`,
      });
      saveNocState(state);
      return NextResponse.json({ ok: true, snapshot: snap, state });
    }

    if (action === "restore_snapshot") {
      if (isReadOnlyRole) {
        return NextResponse.json({ error: "Akses ditolak: Role Auditor bersifat Read-Only" }, { status: 403 });
      }
      const snap = (state.configSnapshots || []).find((s) => s.id === body.snapshotId);
      if (!snap) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
      appendAudit({
        deviceId: snap.deviceId,
        deviceName: snap.deviceName,
        vendor: snap.vendor,
        module: "Cloud Backup",
        actionType: "CONFIG_RESTORED",
        status: "SUCCESS",
        summary: `Disaster Recovery Restore dari ${snap.filename} selesai (< 5 menit RTO)`,
        diffPayload: `<<< RESTORE FROM SNAPSHOT ${snap.filename} (${snap.checksum})`,
      });
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "commit_wizard_config") {
      const dev = state.devices.find((d) => d.id === body.deviceId);
      if (!dev) return NextResponse.json({ error: "Device not found" }, { status: 404 });

      const moduleName = (body.module as AuditLogEntry["module"]) || "Interface/VLAN";
      const diffPayload = (body.diffPayload as string) || "";
      const summary = (body.summary as string) || `Konfigurasi ${moduleName} pada ${dev.name}`;
      const isConfirmedTimer = body.commitMode === "confirmed_timer";

      if (isReadOnlyRole) {
        appendAudit({
          deviceId: dev.id,
          deviceName: dev.name,
          vendor: dev.vendor,
          module: moduleName,
          actionType: "BLOCKED_BY_RBAC",
          status: "BLOCKED",
          summary: `Diblokir RBAC: Role Read-Only mencoba eksekusi ${moduleName}`,
          diffPayload,
        });
        saveNocState(state);
        return NextResponse.json({ error: "Akses ditolak: Role Auditor hanya Read-Only" }, { status: 403 });
      }

      // Create automatic Pre-Commit Safety Snapshot
      const preCfg = buildDeviceConfigText(dev);
      state.configSnapshots = state.configSnapshots || [];
      state.configSnapshots.unshift({
        id: `snap-pre-${Date.now().toString().slice(-6)}`,
        deviceId: dev.id,
        deviceName: dev.name,
        vendor: dev.vendor,
        filename: `${dev.name.toLowerCase()}_precommit_${Date.now().toString().slice(-4)}.txt`,
        createdAt: new Date().toISOString(),
        trigger: "Pre-Commit Safety",
        sizeBytes: preCfg.length * 42,
        lineCount: preCfg.split("\n").length + 115,
        checksum: `sha256:${Math.random().toString(16).slice(2, 14)}`,
        encrypted: true,
        configText: preCfg,
      });

      // Apply operational change to live inventory/BGP/filter state
      if (moduleName === "Interface/VLAN" && body.interfacePayload) {
        const ip = body.interfacePayload as {
          portName: string;
          vlan?: number;
          description: string;
          portStatus: "up" | "admin_down";
        };
        const existingIface = dev.interfaces.find(
          (i) => i.name.toLowerCase() === ip.portName.toLowerCase()
        );
        if (existingIface) {
          existingIface.description = ip.description || existingIface.description;
          existingIface.vlan = ip.vlan || existingIface.vlan;
          existingIface.status = ip.portStatus;
          if (ip.portStatus === "admin_down") {
            existingIface.rxMbps = 0;
            existingIface.txMbps = 0;
          } else if (existingIface.rxMbps === 0) {
            existingIface.rxMbps = 185;
            existingIface.txMbps = 92;
          }
        } else {
          dev.interfaces.push({
            id: `if-wiz-${Date.now().toString().slice(-5)}`,
            name: ip.portName,
            description: ip.description || "WIZARD-VLAN-INTERFACE",
            type: "ethernet",
            status: ip.portStatus,
            speedMbps: 10000,
            rxMbps: ip.portStatus === "up" ? 185 : 0,
            txMbps: ip.portStatus === "up" ? 92 : 0,
            vlan: ip.vlan,
            crcErrors: 0,
            drops: 0,
          });
        }
      } else if (moduleName === "BGP Peering" && body.bgpPayload) {
        const bp = body.bgpPayload as {
          peerName: string;
          remoteAsn: number;
          peerIp: string;
          peerType: "Upstream" | "IXP" | "Peering" | "iBGP";
        };
        state.bgpPeers.unshift({
          id: `bgp-wiz-${Date.now().toString().slice(-5)}`,
          deviceId: dev.id,
          deviceName: dev.name,
          peerName: bp.peerName,
          remoteAs: Number(bp.remoteAsn) || 65100,
          peerIp: bp.peerIp,
          type: bp.peerType === "IXP" || bp.peerType === "Upstream" || bp.peerType === "iBGP" ? bp.peerType : "Peering",
          state: "Established",
          uptime: "0d 00h 01m",
          prefixesReceived: bp.peerType === "Upstream" ? 945000 : 1240,
          prefixesAdvertised: 18,
          rxMbps: 410,
          txMbps: 195,
          latencyMs: 2.1,
        });
      } else if (moduleName === "Route Filter" && body.filterPayload) {
        const fp = body.filterPayload as {
          listName: string;
          prefix: string;
          matchType: "exact" | "orlonger" | "upto";
          uptoLen?: number;
          action: "accept" | "reject";
          community?: string;
          comment: string;
        };
        state.routeFilters = state.routeFilters || [];
        state.routeFilters.unshift({
          id: `rf-${Date.now().toString().slice(-5)}`,
          deviceId: dev.id,
          ...fp,
        });
      }

      const logId = `aud-${Date.now().toString().slice(-6)}`;
      state.auditLogs = state.auditLogs || [];
      state.auditLogs.unshift({
        id: logId,
        timestamp: new Date().toISOString(),
        actorName,
        actorRole,
        sourceIp: "10.255.0.10 (Zero-Direct Gateway)",
        deviceId: dev.id,
        deviceName: dev.name,
        vendor: dev.vendor,
        module: moduleName,
        actionType: isConfirmedTimer ? "COMMIT_CONFIRMED_START" : "COMMIT_APPLIED",
        status: isConfirmedTimer ? "PENDING_CONFIRM" : "CONFIRMED",
        summary,
        diffPayload,
      });

      saveNocState(state);
      return NextResponse.json({ ok: true, auditLogId: logId, state });
    }

    if (action === "resolve_pending_commit") {
      if (isReadOnlyRole) {
        return NextResponse.json({ error: "Akses ditolak: Role Auditor bersifat Read-Only" }, { status: 403 });
      }
      const mode = body.mode as "confirm" | "auto_rollback" | "manual_rollback";
      const targetLog = (state.auditLogs || []).find((a) => a.id === body.auditLogId);
      const dev = state.devices.find((d) => d.id === body.deviceId);

      if (mode === "confirm") {
        if (targetLog) targetLog.status = "CONFIRMED";
        appendAudit({
          deviceId: dev?.id || body.deviceId || "unknown",
          deviceName: dev?.name || targetLog?.deviceName || "Router",
          vendor: dev?.vendor || targetLog?.vendor || "System",
          module: "Commit Confirmed",
          actionType: "COMMIT_CONFIRMED",
          status: "CONFIRMED",
          summary: `Commit Confirmed dikonfirmasi permanen sebelum timer rollback berakhir`,
          diffPayload: targetLog?.diffPayload,
        });
      } else {
        if (targetLog) targetLog.status = "ROLLED_BACK";
        // Rollback optional created interface/bgp/filter IDs if supplied
        if (body.rollbackIfaceName && dev) {
          const targetIface = dev.interfaces.find((i) => i.name === body.rollbackIfaceName);
          if (targetIface && body.prevIfaceStatus) {
            targetIface.status = body.prevIfaceStatus;
            if (targetIface.status === "admin_down" || targetIface.status === "down") {
              targetIface.rxMbps = 0;
              targetIface.txMbps = 0;
            }
          }
        }
        appendAudit({
          deviceId: dev?.id || body.deviceId || "unknown",
          deviceName: dev?.name || targetLog?.deviceName || "Router",
          vendor: dev?.vendor || targetLog?.vendor || "System",
          module: "Commit Confirmed",
          actionType: mode === "auto_rollback" ? "AUTO_ROLLBACK" : "MANUAL_ROLLBACK",
          status: "ROLLED_BACK",
          summary:
            mode === "auto_rollback"
              ? "Timer Commit Confirmed habis / sesi terputus — Auto-Rollback ke konfigurasi aman!"
              : "Manual Rollback dijalankan oleh Engineer — konfigurasi dikembalikan ke snapshot sebelumnya",
          diffPayload: `<<< ROLLBACK TRIGGERED\n${targetLog?.diffPayload || ""}`,
        });
      }
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    if (action === "delete_route_filter") {
      if (isReadOnlyRole) {
        return NextResponse.json({ error: "Akses ditolak: Role Auditor bersifat Read-Only" }, { status: 403 });
      }
      const rule = (state.routeFilters || []).find((r) => r.id === body.ruleId);
      state.routeFilters = (state.routeFilters || []).filter((r) => r.id !== body.ruleId);
      if (rule) {
        const dev = state.devices.find((d) => d.id === rule.deviceId);
        appendAudit({
          deviceId: rule.deviceId,
          deviceName: dev?.name || rule.deviceId,
          vendor: dev?.vendor || "System",
          module: "Route Filter",
          actionType: "FILTER_UPDATED",
          status: "SUCCESS",
          summary: `Hapus rule prefix ${rule.prefix} dari ${rule.listName}`,
          diffPayload: `- ${rule.listName}: ${rule.prefix} (${rule.matchType}) ${rule.action}`,
        });
      }
      saveNocState(state);
      return NextResponse.json({ ok: true, state });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

