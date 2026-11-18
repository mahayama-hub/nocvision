import { execFile } from "child_process";
import * as dgram from "dgram";
import * as net from "net";
import * as dns from "dns";
import { promisify } from "util";
import { NetworkInterface } from "./types";

const execFileAsync = promisify(execFile);
const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolveAny);

export interface PingResult {
  host: string;
  alive: boolean;
  latencyMs: number;
  packetLossPct: number;
  minMs?: number;
  maxMs?: number;
  ttl?: number;
  rawOutput: string;
}

export interface TcpProbeResult {
  host: string;
  port: number;
  service: string;
  open: boolean;
  responseTimeMs: number;
  banner?: string;
}

// Strictly validate & sanitize host input to prevent flag/argument/command injection
export function sanitizeHost(input: string): string {
  const trimmed = input.trim();
  if (net.isIP(trimmed) !== 0) {
    return trimmed;
  }
  const cleaned = trimmed.replace(/[^a-zA-Z0-9.\-]/g, "");
  if (
    !cleaned ||
    cleaned.startsWith("-") ||
    cleaned.startsWith(".") ||
    cleaned.length > 120 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,118}[a-zA-Z0-9]?$/.test(cleaned)
  ) {
    return "127.0.0.1";
  }
  return cleaned;
}

/**
 * Executes a real OS ICMP ping (supports Windows & Linux/macOS)
 */
export async function executeRealPing(hostInput: string, count = 3): Promise<PingResult> {
  const host = sanitizeHost(hostInput);
  const safeCount = Math.min(Math.max(Math.floor(count), 1), 5);
  const isWin = process.platform === "win32";
  const args = isWin
    ? ["-n", String(safeCount), "-w", "1500", host]
    : ["-c", String(safeCount), "-W", "2", host];

  try {
    const { stdout } = await execFileAsync("ping", args, { timeout: 8000 });
    return parsePingOutput(host, stdout);
  } catch (err: unknown) {
    const stdout =
      err && typeof err === "object" && "stdout" in err && typeof err.stdout === "string"
        ? err.stdout
        : "";
    if (stdout) {
      return parsePingOutput(host, stdout);
    }
    return {
      host,
      alive: false,
      latencyMs: 0,
      packetLossPct: 100,
      rawOutput:
        err instanceof Error ? err.message : `Request timed out reaching ${host}`,
    };
  }
}

function parsePingOutput(host: string, output: string): PingResult {
  // Loss percentage
  const lossMatch =
    output.match(/\((\d+)%\s*loss\)/i) ||
    output.match(/(\d+(?:\.\d+)?)%\s*packet loss/i);
  const packetLossPct = lossMatch ? Number(lossMatch[1]) : 0;

  // TTL
  const ttlMatch = output.match(/TTL=(\d+)/i);
  const ttl = ttlMatch ? Number(ttlMatch[1]) : undefined;

  // Windows: Minimum = 12ms, Maximum = 15ms, Average = 13ms
  const winAvgMatch = output.match(
    /Minimum\s*=\s*(\d+)ms,\s*Maximum\s*=\s*(\d+)ms,\s*Average\s*=\s*(\d+)ms/i
  );
  if (winAvgMatch) {
    const minMs = Number(winAvgMatch[1]);
    const maxMs = Number(winAvgMatch[2]);
    const avgMs = Number(winAvgMatch[3]);
    return {
      host,
      alive: packetLossPct < 100,
      latencyMs: avgMs || 1,
      minMs,
      maxMs,
      packetLossPct,
      ttl,
      rawOutput: output.trim(),
    };
  }

  // Single reply fallback: time=14ms or time<1ms
  const timeMatch = output.match(/time[=<](\d+(?:\.\d+)?)\s*ms/i);
  const latencyMs = timeMatch ? Number(timeMatch[1]) : 0;
  const alive = /TTL=/i.test(output) || (packetLossPct < 100 && timeMatch !== null);

  return {
    host,
    alive,
    latencyMs: alive ? Math.max(latencyMs, 1) : 0,
    packetLossPct: alive ? packetLossPct : 100,
    ttl,
    rawOutput: output.trim(),
  };
}

/**
 * Probes a TCP port (e.g. SSH 22, Telnet 23, HTTP 80, MikroTik API 8728, HTTPS 443)
 */
export async function probeTcpPort(
  hostInput: string,
  port: number,
  serviceName = "TCP",
  timeoutMs = 1800
): Promise<TcpProbeResult> {
  const host = sanitizeHost(hostInput);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let banner = "";

    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        host,
        port,
        service: serviceName,
        open,
        responseTimeMs: Date.now() - startTime,
        banner: banner ? banner.trim().slice(0, 80) : undefined,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      // Wait briefly to see if SSH/Telnet/RouterOS sends a banner
      setTimeout(() => finish(true), 150);
    });

    socket.on("data", (chunk) => {
      banner += chunk.toString("utf8");
      finish(true);
    });

    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));

    socket.connect(port, host);
  });
}

/**
 * Executes a real Traceroute (tracert on Windows, traceroute on Linux)
 */
export async function executeRealTraceroute(hostInput: string, maxHops = 10): Promise<string> {
  const host = sanitizeHost(hostInput);
  const hops = Math.min(Math.max(Math.floor(maxHops), 3), 15);
  const isWin = process.platform === "win32";
  const bin = isWin ? "tracert" : "traceroute";
  const args = isWin
    ? ["-d", "-h", String(hops), "-w", "800", host]
    : ["-n", "-m", String(hops), "-w", "1", host];

  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 15000 });
    return stdout.trim();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stdout" in err && typeof err.stdout === "string" && err.stdout) {
      return err.stdout.trim();
    }
    return err instanceof Error ? err.message : `Traceroute timed out for ${host}`;
  }
}

/**
 * Executes DNS Lookup & Reverse/Any resolution
 */
export async function executeDnsDiagnostic(hostInput: string): Promise<string> {
  const host = sanitizeHost(hostInput);
  const lines: string[] = [`=== DNS & Host Resolution for ${host} ===`];
  try {
    const res = await dnsLookup(host, { all: true });
    res.forEach((entry, idx) => {
      lines.push(`[${idx + 1}] Address: ${entry.address} (IPv${entry.family})`);
    });
  } catch (e: unknown) {
    lines.push(`Lookup error: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const records = await dnsResolve(host);
    lines.push(`\n--- Resource Records ---`);
    lines.push(JSON.stringify(records, null, 2));
  } catch {
    // Ignore if IP literal or no extra records
  }

  return lines.join("\n");
}

function encodeBerLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeTlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeBerLength(content.length), content]);
}

function encodeOid(oid: number[]): Buffer {
  const out: number[] = [oid[0] * 40 + oid[1]];
  for (let i = 2; i < oid.length; i++) {
    let val = oid[i];
    if (val === 0) {
      out.push(0);
      continue;
    }
    const parts: number[] = [];
    while (val > 0) {
      parts.unshift(val & 0x7f);
      val >>= 7;
    }
    for (let j = 0; j < parts.length - 1; j++) {
      parts[j] |= 0x80;
    }
    out.push(...parts);
  }
  return encodeTlv(0x06, Buffer.from(out));
}

function formatSysUpTime(centiseconds: number): string {
  const totalSec = Math.floor(centiseconds / 100);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
}

export interface SnmpProbeResult {
  reachable: boolean;
  responseTimeMs: number;
  sysDescr?: string;
  uptime?: string;
}

/**
 * Lightweight real SNMPv2c UDP GetRequest probe (sysDescr.0 & sysUpTime.0)
 */
export async function probeSnmpSysInfo(
  hostInput: string,
  community = "public",
  port = 161,
  timeoutMs = 900
): Promise<SnmpProbeResult> {
  const host = sanitizeHost(hostInput);
  const safePort = Math.min(Math.max(Math.floor(port) || 161, 1), 65535);
  const safeCommunity = (community || "public").slice(0, 64);
  const start = Date.now();

  const vb1 = encodeTlv(0x30, Buffer.concat([encodeOid([1, 3, 6, 1, 2, 1, 1, 1, 0]), Buffer.from([0x05, 0x00])]));
  const vb2 = encodeTlv(0x30, Buffer.concat([encodeOid([1, 3, 6, 1, 2, 1, 1, 3, 0]), Buffer.from([0x05, 0x00])]));
  const reqId = Buffer.from([0x02, 0x02, 0x1a, 0x2b]);
  const errStat = Buffer.from([0x02, 0x01, 0x00]);
  const errIdx = Buffer.from([0x02, 0x01, 0x00]);
  const pdu = encodeTlv(0xa0, Buffer.concat([reqId, errStat, errIdx, encodeTlv(0x30, Buffer.concat([vb1, vb2]))]));
  const packet = encodeTlv(
    0x30,
    Buffer.concat([
      Buffer.from([0x02, 0x01, 0x01]), // version = 1 (SNMPv2c)
      encodeTlv(0x04, Buffer.from(safeCommunity, "utf8")),
      pdu,
    ])
  );

  return new Promise((resolve) => {
    const socket = dgram.createSocket(net.isIPv6(host) ? "udp6" : "udp4");
    let settled = false;

    const done = (res: SnmpProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
      resolve(res);
    };

    const timer = setTimeout(() => {
      done({ reachable: false, responseTimeMs: Date.now() - start });
    }, timeoutMs);

    socket.on("error", () => {
      done({ reachable: false, responseTimeMs: Date.now() - start });
    });

    socket.on("message", (msg) => {
      let sysDescr: string | undefined;
      let uptime: string | undefined;

      // Scan response buffer for OctetString (0x04) sysDescr and TimeTicks (0x43) sysUpTime
      for (let i = 0; i < msg.length - 4; i++) {
        if (!sysDescr && msg[i] === 0x04 && msg[i + 1] > 8 && msg[i + 1] < 120 && i + 2 + msg[i + 1] <= msg.length) {
          const candidate = msg.subarray(i + 2, i + 2 + msg[i + 1]).toString("utf8");
          if (candidate !== safeCommunity && /^[\x20-\x7e]+$/.test(candidate)) {
            sysDescr = candidate.trim();
          }
        }
        if (!uptime && msg[i] === 0x43 && msg[i + 1] >= 1 && msg[i + 1] <= 4 && i + 2 + msg[i + 1] <= msg.length) {
          let ticks = 0;
          for (let j = 0; j < msg[i + 1]; j++) {
            ticks = (ticks << 8) | msg[i + 2 + j];
          }
          uptime = formatSysUpTime(ticks >>> 0);
        }
      }

      done({
        reachable: true,
        responseTimeMs: Date.now() - start,
        sysDescr,
        uptime,
      });
    });

    socket.send(packet, safePort, host);
  });
}

export interface RealtimeDevicePoll {
  alive: boolean;
  status: "online" | "warning" | "offline";
  latencyMs: number;
  packetLossPct: number;
  pingResult: PingResult;
  sshResult: TcpProbeResult;
  apiResult: TcpProbeResult;
  snmpResult: SnmpProbeResult;
}

export async function pollDeviceRealtime(params: {
  ipAddress: string;
  sshPort?: number;
  apiPort?: number;
  snmpPort?: number;
  snmpCommunity?: string;
}): Promise<RealtimeDevicePoll> {
  const [pingResult, sshResult, apiResult, snmpResult] = await Promise.all([
    executeRealPing(params.ipAddress, 2),
    probeTcpPort(params.ipAddress, params.sshPort || 22, "SSH", 900),
    probeTcpPort(params.ipAddress, params.apiPort || 80, "API/HTTP", 900),
    probeSnmpSysInfo(params.ipAddress, params.snmpCommunity || "public", params.snmpPort || 161, 900),
  ]);

  const alive =
    pingResult.alive || sshResult.open || apiResult.open || snmpResult.reachable;

  const latencyMs = pingResult.alive
    ? pingResult.latencyMs
    : snmpResult.reachable
    ? snmpResult.responseTimeMs
    : sshResult.open
    ? sshResult.responseTimeMs
    : apiResult.open
    ? apiResult.responseTimeMs
    : 0;

  const packetLossPct = pingResult.alive
    ? pingResult.packetLossPct
    : alive
    ? 0
    : 100;

  const status: "online" | "warning" | "offline" = !alive
    ? "offline"
    : packetLossPct > 0 || latencyMs > 120
    ? "warning"
    : "online";

  return {
    alive,
    status,
    latencyMs,
    packetLossPct,
    pingResult,
    sshResult,
    apiResult,
    snmpResult,
  };
}

function readBerLength(buf: Buffer, offset: number): { length: number; next: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if ((first & 0x80) === 0) {
    return { length: first, next: offset + 1 };
  }
  const numBytes = first & 0x7f;
  if (numBytes === 0 || numBytes > 4 || offset + 1 + numBytes > buf.length) return null;
  let len = 0;
  for (let i = 0; i < numBytes; i++) {
    len = (len << 8) | buf[offset + 1 + i];
  }
  return { length: len, next: offset + 1 + numBytes };
}

function decodeOid(buf: Buffer): number[] {
  if (buf.length === 0) return [];
  const first = buf[0];
  const oid: number[] = [Math.floor(first / 40), first % 40];
  let val = 0;
  for (let i = 1; i < buf.length; i++) {
    val = (val << 7) | (buf[i] & 0x7f);
    if ((buf[i] & 0x80) === 0) {
      oid.push(val);
      val = 0;
    }
  }
  return oid;
}

function decodeSnmpInt(buf: Buffer): number {
  let val = 0;
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8) | buf[i];
  }
  return val >>> 0;
}

function decodeSnmpSignedInt(buf: Buffer): number {
  if (buf.length === 0) return 0;
  let val = (buf[0] & 0x80) !== 0 ? -1 : 0;
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8) | buf[i];
  }
  return val;
}

function decodeSnmpCounter64(buf: Buffer): number {
  let val = 0;
  for (let i = 0; i < buf.length; i++) {
    val = val * 256 + buf[i];
  }
  return val;
}

function parseFirstVarbind(msg: Buffer): { oid: number[]; tag: number; valBuf: Buffer } | null {
  let pos = 0;
  if (msg[pos++] !== 0x30) return null;
  const topLen = readBerLength(msg, pos);
  if (!topLen) return null;
  pos = topLen.next;

  // version + community
  for (let i = 0; i < 2; i++) {
    pos++;
    const l = readBerLength(msg, pos);
    if (!l) return null;
    pos = l.next + l.length;
  }

  // GetResponse PDU (0xa2)
  if (pos >= msg.length || msg[pos++] !== 0xa2) return null;
  const pduLen = readBerLength(msg, pos);
  if (!pduLen) return null;
  pos = pduLen.next;

  // request-id, error-status, error-index
  for (let i = 0; i < 3; i++) {
    pos++;
    const l = readBerLength(msg, pos);
    if (!l) return null;
    pos = l.next + l.length;
  }

  // VarBindList (0x30) -> first VarBind (0x30)
  if (pos >= msg.length || msg[pos++] !== 0x30) return null;
  const vblLen = readBerLength(msg, pos);
  if (!vblLen) return null;
  pos = vblLen.next;

  if (pos >= msg.length || msg[pos++] !== 0x30) return null;
  const vbLen = readBerLength(msg, pos);
  if (!vbLen) return null;
  pos = vbLen.next;

  if (pos >= msg.length || msg[pos++] !== 0x06) return null;
  const oidLen = readBerLength(msg, pos);
  if (!oidLen) return null;
  const oid = decodeOid(msg.subarray(oidLen.next, oidLen.next + oidLen.length));
  pos = oidLen.next + oidLen.length;

  if (pos >= msg.length) return null;
  const tag = msg[pos++];
  const valLen = readBerLength(msg, pos);
  if (!valLen) return null;
  const valBuf = msg.subarray(valLen.next, valLen.next + valLen.length);

  return { oid, tag, valBuf };
}

export interface DiscoveredBgpPeer {
  peerIp: string;
  remoteAs: number;
  state: "Established" | "Active" | "Idle" | "Connect";
  uptime: string;
}

const BGP_STATE_MAP: Record<number, DiscoveredBgpPeer["state"]> = {
  1: "Idle",
  2: "Connect",
  3: "Active",
  4: "Connect",
  5: "Connect",
  6: "Established",
};

async function snmpWalkSubtree(
  hostInput: string,
  community: string,
  port: number,
  basePrefix: number[],
  maxSteps = 48
): Promise<Array<{ suffix: number[]; tag: number; valBuf: Buffer }>> {
  const host = sanitizeHost(hostInput);
  const safePort = Math.min(Math.max(Math.floor(port) || 161, 1), 65535);
  const safeCommunity = (community || "public").slice(0, 64);

  const sendGetNext = (
    oid: number[],
    reqNum: number
  ): Promise<{ oid: number[]; tag: number; valBuf: Buffer } | null> =>
    new Promise((resolve) => {
      const vb = encodeTlv(
        0x30,
        Buffer.concat([encodeOid(oid), Buffer.from([0x05, 0x00])])
      );
      const reqId = Buffer.from([
        0x02,
        0x02,
        (reqNum >> 8) & 0xff,
        reqNum & 0xff,
      ]);
      const errStat = Buffer.from([0x02, 0x01, 0x00]);
      const errIdx = Buffer.from([0x02, 0x01, 0x00]);
      const pdu = encodeTlv(
        0xa1,
        Buffer.concat([reqId, errStat, errIdx, encodeTlv(0x30, vb)])
      );
      const packet = encodeTlv(
        0x30,
        Buffer.concat([
          Buffer.from([0x02, 0x01, 0x01]),
          encodeTlv(0x04, Buffer.from(safeCommunity, "utf8")),
          pdu,
        ])
      );

      const socket = dgram.createSocket(net.isIPv6(host) ? "udp6" : "udp4");
      let settled = false;
      const done = (
        val: { oid: number[]; tag: number; valBuf: Buffer } | null
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          // ignore
        }
        resolve(val);
      };

      const timer = setTimeout(() => done(null), 650);
      socket.on("error", () => done(null));
      socket.on("message", (msg) => done(parseFirstVarbind(msg)));
      socket.send(packet, safePort, host);
    });

  const rows: Array<{ suffix: number[]; tag: number; valBuf: Buffer }> = [];
  let currentOid = [...basePrefix];
  let reqSeq = 200;

  for (let step = 0; step < maxSteps; step++) {
    const res = await sendGetNext(currentOid, reqSeq++);
    if (!res || res.tag === 0x80 || res.tag === 0x81 || res.tag === 0x82) break;
    const matchesPrefix = basePrefix.every((v, idx) => res.oid[idx] === v);
    if (!matchesPrefix || res.oid.length <= basePrefix.length) break;

    rows.push({
      suffix: res.oid.slice(basePrefix.length),
      tag: res.tag,
      valBuf: res.valBuf,
    });
    currentOid = res.oid;
  }

  return rows;
}

/**
 * Walks BGP4-MIB::bgpPeerTable (1.3.6.1.2.1.15.3.1) via SNMPv2c GetNextRequest
 * to discover live BGP peer IP, Remote AS, FSM State, and Established Time.
 */

export interface RouterOsBgpPrefix {
  peerIp: string;
  received: number;
  advertised: number;
}

/**
 * Ambil jumlah prefix BGP langsung dari RouterOS via SSH (BGP4-MIB tidak punya
 * OID prefix counter). Perlu kredensial SSH read-only pada perangkat.
 */
export async function probeTopTalker(params: {
  host: string;
  port: number;
  user: string;
  pass: string;
  interfaceName: string;
  durationSec?: number;
}): Promise<string> {
  const host = sanitizeHost(params.host);
  const iface = String(params.interfaceName).replace(/"/g, "");
  const dur = Math.min(Math.max(params.durationSec || 3, 2), 6);
  const remoteCmd = '/tool torch interface="' + iface + '" duration=' + dur;
  const args = [
    "-p",
    params.pass,
    "ssh",
    "-p",
    String(params.port || 22),
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR",
    "-o",
    "ConnectTimeout=8",
    params.user + "@" + host,
    remoteCmd,
  ];
  const { stdout } = await execFileAsync("sshpass", args, {
    timeout: (dur + 12) * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const lines = String(stdout).split(String.fromCharCode(10));
  const score = new Map<string, number>();
  const toBps = (token: string) => {
    const t = token.replace("bps", "");
    const mult = t.endsWith("k") ? 1e3 : t.endsWith("M") ? 1e6 : t.endsWith("G") ? 1e9 : 1;
    const num = Number(t.replace(/[^0-9.]/g, ""));
    return Number.isFinite(num) ? num * mult : 0;
  };
  for (const raw of lines) {
    const m = raw.match(/^\s*ip\s+\S+\s+\S+\s+(\d+\.\d+\.\d+\.\d+)/);
    if (!m) continue;
    const ip = m[1];
    const tokens = raw.trim().split(/\s+/);
    const bpsTokens = tokens.filter((t) => t.includes("bps"));
    const rx = bpsTokens.length >= 2 ? toBps(bpsTokens[1]) : 0;
    score.set(ip, (score.get(ip) || 0) + rx);
  }
  let best = "";
  let bestVal = 0;
  for (const [ip, val] of score.entries()) {
    if (val > bestVal) {
      bestVal = val;
      best = ip;
    }
  }
  return best;
}

export async function fetchRouterOsBgpPrefixes(params: {
  host: string;
  port: number;
  user: string;
  password: string;
}): Promise<RouterOsBgpPrefix[]> {
  const host = sanitizeHost(params.host);
  const remoteCmd = [
    "/routing bgp session print detail",
    "/routing bgp advertisements print count-only",
    "/ip route print count-only where bgp",
  ].join("; ");
  const args = [
    "-p",
    params.password,
    "ssh",
    "-p",
    String(params.port || 22),
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "LogLevel=ERROR",
    "-o",
    "ConnectTimeout=8",
    params.user + "@" + host,
    remoteCmd,
  ];
  const { stdout } = await execFileAsync("sshpass", args, {
    timeout: 25000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const text = String(stdout);
  const lines = text.split(String.fromCharCode(10));
  const records: RouterOsBgpPrefix[] = [];
  let current: RouterOsBgpPrefix | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length > 1 && line[0] >= "0" && line[0] <= "9" && (line[1] === " " || line[1] === "	")) {
      if (current) records.push(current);
      current = { peerIp: "", received: 0, advertised: 0 };
    }
    if (!current) continue;
    const ipIdx = line.indexOf("remote.address=");
    if (ipIdx >= 0) {
      const rest = line.slice(ipIdx + 15).trim();
      const ip = rest.split(" ")[0].trim();
      if (ip) current.peerIp = ip;
    }
    const cntIdx = line.indexOf("prefix-count=");
    if (cntIdx >= 0) {
      const rest = line.slice(cntIdx + 13).trim();
      const num = rest.split(" ")[0].replace(/[^0-9]/g, "");
      if (num) current.received = Number(num);
    }
  }
  if (current) records.push(current);

  const numbers: number[] = [];
  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (t.length > 0 && /^[0-9]+$/.test(t)) numbers.push(Number(t));
  }
  const advertised = numbers.length >= 2 ? numbers[numbers.length - 2] : 0;
  const installed = numbers.length >= 1 ? numbers[numbers.length - 1] : 0;

  const peers = records.filter((r) => r.peerIp);
  if (peers.length === 1 && !peers[0].received) peers[0].received = installed;
  return peers.map((r, idx) => ({
    peerIp: r.peerIp,
    received: r.received || (peers.length === 1 ? installed : 0),
    advertised: idx === 0 ? advertised : 0,
  }));
}

export async function probeSnmpBgpPeers(
  hostInput: string,
  community = "public",
  port = 161
): Promise<DiscoveredBgpPeer[]> {
  const peers = new Map<string, DiscoveredBgpPeer>();
  const columns: number[] = [2, 9, 16];

  for (const col of columns) {
    const rows = await snmpWalkSubtree(
      hostInput,
      community,
      port,
      [1, 3, 6, 1, 2, 1, 15, 3, 1, col],
      32
    );
    for (const row of rows) {
      if (row.suffix.length < 4) continue;
      const peerIp = row.suffix.slice(0, 4).join(".");
      const existing = peers.get(peerIp) || {
        peerIp,
        remoteAs: 0,
        state: "Idle" as const,
        uptime: "0d 00h 00m",
      };
      const numVal = decodeSnmpInt(row.valBuf);
      if (col === 2) {
        existing.state = BGP_STATE_MAP[numVal] || "Idle";
      } else if (col === 9) {
        existing.remoteAs = numVal;
      } else if (col === 16) {
        const d = Math.floor(numVal / 86400);
        const h = Math.floor((numVal % 86400) / 3600);
        const m = Math.floor((numVal % 3600) / 60);
        existing.uptime = `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
      }
      peers.set(peerIp, existing);
    }
  }

  return Array.from(peers.values());
}

const ifaceCounterCache = new Map<
  string,
  { inOctets: number; outOctets: number; ts: number }
>();

function detectInterfaceType(name: string): NetworkInterface["type"] {
  const lower = name.toLowerCase();
  if (lower.includes("qsfp") || lower.startsWith("et-") || lower.includes("100g")) {
    return "qsfp28";
  }
  if (
    lower.includes("sfp+") ||
    lower.includes("sfp-sfpplus") ||
    lower.startsWith("xe-") ||
    lower.includes("tengig") ||
    lower.startsWith("te") ||
    lower.includes("10g")
  ) {
    return "sfp_plus";
  }
  if (lower.includes("epon")) {
    return "epon";
  }
  if (lower.includes("gpon") || lower.includes("pon")) {
    return "gpon";
  }
  if (lower.includes("sfp") || lower.includes("fiber") || lower.includes("opt")) {
    return "sfp_plus";
  }
  if (lower.includes("vlan") || lower.includes("bridge") || lower.includes("lo")) {
    return "vlan";
  }
  return "ethernet";
}

function normalizeSfpDbm(raw: number): number {
  // MikroTik / standard DDM often reports in 0.001 dBm (e.g. -18500 -> -18.50) or 0.01 dBm (e.g. -1850 -> -18.50)
  if (Math.abs(raw) > 500) return Number((raw / 1000).toFixed(2));
  if (Math.abs(raw) > 60) return Number((raw / 100).toFixed(2));
  return Number(raw.toFixed(2));
}

/**
 * Walks IF-MIB (ifDescr, ifSpeed/ifHighSpeed, ifOperStatus, ifHCInOctets/ifInOctets, ifHCOutOctets/ifOutOctets)
 * and SFP DDM optical power (MIKROTIK-MIB mtxrOpticalRxPower / mtxrOpticalTxPower) to return pure interfaces + real TX/RX Mbps.
 */
export async function probeSnmpInterfaces(
  hostInput: string,
  community = "public",
  port = 161,
  deviceId = "dev"
): Promise<NetworkInterface[]> {
  const host = sanitizeHost(hostInput);
  const nowMs = Date.now();

  const [
    descrRows,
    operRows,
    speedRows,
    highSpeedRows,
    hcInRows,
    hcOutRows,
    in32Rows,
    out32Rows,
    sfpRxRows,
    sfpTxRows,
  ] = await Promise.all([
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 2, 2, 1, 2], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 2, 2, 1, 8], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 2, 2, 1, 5], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 31, 1, 1, 1, 15], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 31, 1, 1, 1, 6], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 31, 1, 1, 1, 10], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 2, 2, 1, 10], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 2, 1, 2, 2, 1, 16], 64),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 4, 1, 14988, 1, 1, 19, 1, 1, 9], 32),
    snmpWalkSubtree(host, community, port, [1, 3, 6, 1, 4, 1, 14988, 1, 1, 19, 1, 1, 10], 32),
  ]);

  if (descrRows.length === 0) return [];

  const toMap = <T,>(
    rows: Array<{ suffix: number[]; valBuf: Buffer }>,
    fn: (b: Buffer) => T
  ) => {
    const m = new Map<number, T>();
    for (const r of rows) {
      if (r.suffix.length >= 1) m.set(r.suffix[0], fn(r.valBuf));
    }
    return m;
  };

  const operMap = toMap(operRows, decodeSnmpInt);
  const speedMap = toMap(speedRows, decodeSnmpInt);
  const highSpeedMap = toMap(highSpeedRows, decodeSnmpInt);
  const hcInMap = toMap(hcInRows, decodeSnmpCounter64);
  const hcOutMap = toMap(hcOutRows, decodeSnmpCounter64);
  const in32Map = toMap(in32Rows, decodeSnmpInt);
  const out32Map = toMap(out32Rows, decodeSnmpInt);
  const sfpRxMap = toMap(sfpRxRows, decodeSnmpSignedInt);
  const sfpTxMap = toMap(sfpTxRows, decodeSnmpSignedInt);

  const interfaces: NetworkInterface[] = [];

  for (const row of descrRows) {
    if (row.suffix.length < 1) continue;
    const ifIdx = row.suffix[0];
    const name = row.valBuf.toString("utf8").trim();
    if (!name || name.toLowerCase() === "lo" || name.toLowerCase() === "lo0") continue;

    const oper = operMap.get(ifIdx);
    const status: NetworkInterface["status"] = oper === 1 ? "up" : "down";
    const highMbps = highSpeedMap.get(ifIdx) || 0;
    const speedMbps =
      highMbps > 0 ? highMbps : Math.round((speedMap.get(ifIdx) || 1_000_000_000) / 1_000_000);

    const inOctets = hcInMap.get(ifIdx) ?? in32Map.get(ifIdx) ?? 0;
    const outOctets = hcOutMap.get(ifIdx) ?? out32Map.get(ifIdx) ?? 0;
    const cacheKey = `${host}:${ifIdx}`;
    const prev = ifaceCounterCache.get(cacheKey);

    let rxMbps = 0;
    let txMbps = 0;
    if (prev && nowMs > prev.ts && status === "up") {
      const dtSec = (nowMs - prev.ts) / 1000;
      const dIn = inOctets >= prev.inOctets ? inOctets - prev.inOctets : 0;
      const dOut = outOctets >= prev.outOctets ? outOctets - prev.outOctets : 0;
      rxMbps = Number((((dIn * 8) / dtSec) / 1_000_000).toFixed(2));
      txMbps = Number((((dOut * 8) / dtSec) / 1_000_000).toFixed(2));
    }
    ifaceCounterCache.set(cacheKey, { inOctets, outOctets, ts: nowMs });

    const ifaceType = detectInterfaceType(name);
    const rawRxDbm = sfpRxMap.get(ifIdx);
    const rawTxDbm = sfpTxMap.get(ifIdx);

    interfaces.push({
      id: `if-${deviceId}-${ifIdx}`,
      name,
      description: `IF-MIB #${ifIdx}`,
      type: ifaceType,
      status,
      speedMbps,
      rxMbps,
      txMbps,
      rxPowerDbm: typeof rawRxDbm === "number" ? normalizeSfpDbm(rawRxDbm) : undefined,
      txPowerDbm: typeof rawTxDbm === "number" ? normalizeSfpDbm(rawTxDbm) : undefined,
      crcErrors: 0,
      drops: 0,
    });
  }

  return interfaces;
}



