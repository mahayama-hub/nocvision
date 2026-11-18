import { execFile } from "child_process";
import * as net from "net";
import * as dns from "dns";
import { promisify } from "util";

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

