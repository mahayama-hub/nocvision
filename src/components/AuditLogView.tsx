"use client";

import React, { useMemo, useState } from "react";
import { AuditLogEntry } from "@/lib/types";
import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Lock,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { BentoTheme } from "./BentoOverviewDashboard";

interface AuditLogViewProps {
  theme?: BentoTheme;
  auditLogs: AuditLogEntry[];
  onNotify: (msg: string) => void;
}

export default function AuditLogView({
  theme = "dark",
  auditLogs,
  onNotify,
}: AuditLogViewProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const cardCls = isLightCard
    ? "bento-card-light rounded-[26px]"
    : "bento-card-dark rounded-[26px]";
  const subBoxCls = isLightCard
    ? "bg-slate-50 border border-slate-200/90"
    : "bg-[#051122]/85 border border-sky-500/20";
  const headingText = isLightCard ? "text-slate-900" : "text-white";
  const mutedText = isLightCard ? "text-slate-500" : "text-slate-400";

  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(
    auditLogs[0]?.id || null
  );

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          entry.deviceName.toLowerCase().includes(q) ||
          entry.actorName.toLowerCase().includes(q) ||
          entry.module.toLowerCase().includes(q) ||
          entry.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [auditLogs, search, statusFilter]);

  const handleExportCsv = () => {
    const header = [
      "ID",
      "Timestamp",
      "Actor",
      "Role",
      "SourceGateway",
      "Device",
      "Module",
      "Action",
      "Status",
      "Summary",
    ].join(",");
    const rows = filteredLogs.map((l) =>
      [
        l.id,
        l.timestamp,
        `"${l.actorName}"`,
        `"${l.actorRole}"`,
        `"${l.sourceIp}"`,
        `"${l.deviceName}"`,
        `"${l.module}"`,
        l.actionType,
        l.status,
        `"${l.summary.replace(/"/g, '""')}"`,
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nocvision-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify("Audit Trail berhasil diekspor ke CSV (ISO/SOC Compliance).");
  };

  const renderStatusBadge = (status: AuditLogEntry["status"]) => {
    if (status === "CONFIRMED" || status === "SUCCESS") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          {status}
        </span>
      );
    }
    if (status === "PENDING_CONFIRM") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35 inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          PENDING
        </span>
      );
    }
    if (status === "ROLLED_BACK") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border border-sky-500/35 inline-flex items-center gap-1">
          <RotateCcw className="w-3 h-3" />
          ROLLED BACK
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/35 inline-flex items-center gap-1">
        <ShieldAlert className="w-3 h-3" />
        BLOCKED
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Compliance Strip */}
      <div className={`${cardCls} p-5`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-sky-500/20">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Zero Direct Access Audit
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/35">
                ISO / SOC Ready
              </span>
            </div>
            <h3 className={`text-base font-bold ${headingText} flex items-center gap-2`}>
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Audit Trail Lengkap &amp; Forensik Perubahan Konfigurasi
            </h3>
            <p className={`text-xs ${mutedText} mt-0.5`}>
              Mencatat setiap eksekusi Commit, Auto-Rollback, Restore Snapshot, dan blokir RBAC beserta diff payload persisnya.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari actor, router, modul..."
                className={`border rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none w-56 ${
                  isLightCard
                    ? "bg-white border-slate-300 text-slate-900"
                    : "bg-[#051122] border-sky-500/30 text-white"
                }`}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`border rounded-full px-3 py-1.5 text-xs ${
                isLightCard
                  ? "bg-white border-slate-300 text-slate-800"
                  : "bg-[#051122] border-sky-500/30 text-white"
              }`}
            >
              <option value="all">Semua Status ({auditLogs.length})</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="SUCCESS">Success (Backup/Restore)</option>
              <option value="ROLLED_BACK">Auto-Rolled Back</option>
              <option value="PENDING_CONFIRM">Pending Confirm</option>
              <option value="BLOCKED">Blocked by RBAC</option>
            </select>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor CSV
            </button>
          </div>
        </div>

        {/* Audit Entries List */}
        <div className="mt-4 space-y-2.5">
          {filteredLogs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <div
                key={log.id}
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                className={`${subBoxCls} rounded-2xl p-4 cursor-pointer transition hover:border-cyan-400/50`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {renderStatusBadge(log.status)}
                      <span className="font-mono font-bold text-xs text-cyan-400">
                        {log.deviceName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          isLightCard
                            ? "bg-slate-200/80 text-slate-700"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {log.module}
                      </span>
                      <span className={`text-xs font-semibold ${headingText}`}>
                        {log.summary}
                      </span>
                    </div>

                    <div className={`text-[11px] font-mono ${mutedText} flex flex-wrap gap-3`}>
                      <span>Actor: {log.actorName} ({log.actorRole})</span>
                      <span>•</span>
                      <span>Via: {log.sourceIp}</span>
                      <span>•</span>
                      <span>{new Date(log.timestamp).toLocaleString("id-ID")}</span>
                    </div>
                  </div>

                  {log.diffPayload && (
                    <span className="text-[11px] font-mono text-sky-400 flex items-center gap-1 shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                      {isExpanded ? "Tutup Diff" : "Lihat Diff Payload"}
                    </span>
                  )}
                </div>

                {isExpanded && log.diffPayload && (
                  <pre className="mt-3 p-3 rounded-xl bg-[#020814] border border-sky-500/25 text-[11px] font-mono overflow-x-auto leading-relaxed">
                    {log.diffPayload.split("\n").map((line, i) => (
                      <span
                        key={i}
                        className={`block ${
                          line.startsWith("+")
                            ? "text-emerald-400"
                            : line.startsWith("-") || line.startsWith("<<<")
                            ? "text-rose-400"
                            : "text-sky-300"
                        }`}
                      >
                        {line}
                      </span>
                    ))}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

