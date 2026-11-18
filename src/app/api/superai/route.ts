import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth";
import { loadNocState } from "@/lib/noc-store";

const DEFAULT_MODEL = "gemini-2.5-flash";

function resolveGeminiCredentials(): {
  apiKey: string | null;
  model: string;
} {
  const envKey = process.env.GEMINI_API_KEY?.trim() || null;
  const envModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return {
    apiKey: envKey,
    model: envModel,
  };
}

export async function GET(req: NextRequest) {
  const auth = requireSessionUser(req);
  if (auth.response) return auth.response;

  const creds = resolveGeminiCredentials();
  return NextResponse.json({
    configured: Boolean(creds.apiKey),
    source: creds.apiKey ? "env" : "none",
    model: creds.model,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireSessionUser(req);
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const action = (body.action as string) || "chat";

    if (action === "chat") {
      const creds = resolveGeminiCredentials();
      if (!creds.apiKey) {
        return NextResponse.json(
          {
            ok: false,
            fallback: true,
            reason: "GEMINI_API_KEY_NOT_CONFIGURED",
            error: "GEMINI_API_KEY belum dikonfigurasi di environment (.env.local).",
          },
          { status: 200 }
        );
      }

      const prompt = ((body.prompt as string) || "").trim();
      if (!prompt) {
        return NextResponse.json(
          { ok: false, error: "Prompt tidak boleh kosong." },
          { status: 400 }
        );
      }

      const deviceId = (body.deviceId as string) || "all";
      const history = Array.isArray(body.history)
        ? (body.history as { role: string; content: string }[]).slice(-6)
        : [];

      const state = loadNocState();
      const targetDevice =
        deviceId !== "all"
          ? state.devices.find((d) => d.id === deviceId) || null
          : null;

      const contextPayload = targetDevice
        ? {
            mode: "Device Mode",
            device: {
              hostname: targetDevice.hostname,
              ipAddress: targetDevice.ipAddress,
              vendor: targetDevice.vendor,
              model: targetDevice.model,
              osVersion: targetDevice.osVersion,
              role: targetDevice.role,
              status: targetDevice.status,
              uptime: targetDevice.uptime,
              cpuUsage: targetDevice.cpuUsage,
              memoryUsage: targetDevice.memoryUsage,
              temperatureC: targetDevice.temperatureC,
              latencyMs: targetDevice.latencyMs,
              packetLossPct: targetDevice.packetLossPct,
              totalRxMbps: targetDevice.totalRxMbps,
              totalTxMbps: targetDevice.totalTxMbps,
              interfaces: targetDevice.interfaces.map((i) => ({
                name: i.name,
                status: i.status,
                speedMbps: i.speedMbps,
                rxMbps: i.rxMbps,
                txMbps: i.txMbps,
                crcErrors: i.crcErrors,
                drops: i.drops,
                rxPowerDbm: i.rxPowerDbm,
              })),
            },
            bgpPeers: state.bgpPeers.filter((p) => p.deviceId === targetDevice.id),
            routeFilters: (state.routeFilters ?? []).filter((f) => f.deviceId === targetDevice.id),
            openIncidents: state.incidents.filter(
              (inc) => inc.deviceId === targetDevice.id && !inc.resolved
            ),
            criticalOnus: state.onus
              .filter(
                (o) =>
                  o.oltId === targetDevice.id &&
                  (o.rxPowerDbm < -26.5 || o.status !== "online")
              )
              .slice(0, 8),
            snapshotsCount: (state.configSnapshots ?? []).filter(
              (s) => s.deviceId === targetDevice.id
            ).length,
          }
        : {
            mode: "Fleet Mode",
            deviceCount: state.devices.length,
            devicesSummary: state.devices.map((d) => ({
              hostname: d.hostname,
              ip: d.ipAddress,
              vendor: d.vendor,
              status: d.status,
              cpuUsage: d.cpuUsage,
              memoryUsage: d.memoryUsage,
              temperatureC: d.temperatureC,
              activePorts: d.interfaces.filter(
                (i) => i.status === "up" || i.status === "degraded"
              ).length,
              inactivePorts: d.interfaces.filter(
                (i) => i.status === "down" || i.status === "admin_down"
              ).length,
            })),
            bgpPeers: state.bgpPeers,
            routeFilters: state.routeFilters ?? [],
            openIncidents: state.incidents.filter((i) => !i.resolved).slice(0, 10),
            criticalOnusCount: state.onus.filter(
              (o) => o.rxPowerDbm < -26.5 || o.status !== "online"
            ).length,
            snapshotsCount: (state.configSnapshots ?? []).length,
          };

      const systemInstruction =
        `Kamu adalah NOCAI, AI Network Intelligence & Multi-Vendor Diagnostic Orchestrator untuk platform NOCVISION (ISP/Telco NOC).\n` +
        `Jawab SELALU dalam Bahasa Indonesia yang jelas, ringkas, teknis, dan akurat berdasarkan JSON telemetri LIVE di bawah.\n` +
        `Jangan pernah mengarang angka yang tidak ada di telemetri.\n` +
        `Berikan command CLI yang sesuai dengan vendor perangkat (Juniper JunOS, MikroTik RouterOS v7, Cisco IOS-XR/XE, Huawei VRP/OLT, ZTE OLT).\n` +
        `Kembalikan respons dalam JSON valid dengan schema:\n` +
        `{\n` +
        `  "title": "Judul analisis singkat",\n` +
        `  "content": "Penjelasan analisis terstruktur dengan bullet point dan angka telemetri nyata",\n` +
        `  "cliSnippet": "Perintah CLI diagnostik vendor (opsional, string atau null)",\n` +
        `  "metrics": [{"label": "Nama Metrik", "value": "Nilai", "tone": "ok|warn|bad|info"}],\n` +
        `  "suggestedTab": "troubleshoot|backup|bgp|null"\n` +
        `}`;

      const geminiContents = [
        ...history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        {
          role: "user",
          parts: [
            {
              text:
                `[LIVE TELEMETRY CONTEXT]\n${JSON.stringify(contextPayload)}\n\n` +
                `[USER REQUEST]\n${prompt}`,
            },
          ],
        },
      ];

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          creds.model
        )}:generateContent?key=${encodeURIComponent(creds.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: geminiContents,
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 1600,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errPayload = await geminiRes.json().catch(() => ({}));
        const errMsg =
          errPayload?.error?.message || `Gemini API HTTP ${geminiRes.status}`;
        return NextResponse.json(
          {
            ok: false,
            fallback: true,
            reason: "GEMINI_API_ERROR",
            error: errMsg,
          },
          { status: 200 }
        );
      }

      const geminiData = await geminiRes.json();
      const rawText: string =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      let parsed: {
        title?: string;
        content?: string;
        cliSnippet?: string | null;
        metrics?: {
          label: string;
          value: string;
          tone?: "ok" | "warn" | "bad" | "info";
        }[];
        suggestedTab?: string | null;
      } = {};

      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = {
          title: `Gemini AI Diagnostic (${creds.model})`,
          content: rawText || "Respons diterima dari Gemini AI.",
        };
      }

      const validTabs = ["troubleshoot", "backup", "bgp"] as const;
      const matchedTab = validTabs.includes(
        parsed.suggestedTab as (typeof validTabs)[number]
      )
        ? (parsed.suggestedTab as (typeof validTabs)[number])
        : undefined;

      return NextResponse.json({
        ok: true,
        provider: "gemini",
        model: creds.model,
        reply: {
          title: parsed.title || `NOCAI Gemini · ${creds.model}`,
          content: parsed.content || rawText,
          cliSnippet: parsed.cliSnippet || undefined,
          metrics: Array.isArray(parsed.metrics) ? parsed.metrics.slice(0, 4) : undefined,
          suggestedTab: matchedTab,
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
