"use client";

import React, { useState } from "react";
import { NocUser } from "@/lib/auth";
import type { BentoTheme } from "./BentoOverviewDashboard";
import {
  AlertCircle,
  BarChart3,
  BellRing,
  CheckCircle2,
  CloudMoon,
  Eye,
  EyeOff,
  MonitorActivity,
  Moon,
  Network,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";

interface LoginViewProps {
  theme?: BentoTheme;
  onThemeChange?: (theme: BentoTheme) => void;
  onLoginSuccess: (user: NocUser) => void;
}

export default function LoginView({
  theme = "dark",
  onThemeChange,
  onLoginSuccess,
}: LoginViewProps) {
  const isLightCard = theme === "light" || theme === "twilight";
  const shellClass =
    theme === "dark"
      ? "bento-shell-dark text-slate-100"
      : theme === "twilight"
      ? "bento-shell-twilight text-slate-800"
      : "bento-shell-light text-slate-800";
  const containerClass =
    theme === "dark"
      ? "bg-[#040d21]/95 border border-sky-500/30 shadow-[0_0_80px_-10px_rgba(0,184,255,0.3)]"
      : theme === "twilight"
      ? "bento-window-twilight"
      : "bento-window-light";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const performLogin = async (u: string, p: string) => {
    setErrorMsg(null);
    setInfoMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          username: u,
          password: p,
          authMethod: "local",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(
          data.error ||
            "Gagal masuk ke portal NOCVISION. Periksa username/password."
        );
        return;
      }
      onLoginSuccess(data.user as NocUser);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Terjadi kesalahan jaringan."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(username, password);
  };

  return (
    <div className={`min-h-screen ${shellClass} flex items-stretch justify-center p-0 sm:p-4 lg:p-6 relative overflow-hidden transition-colors duration-300`}>
      {/* Subtle Ambient Glow */}
      {theme === "dark" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 25% 35%, rgba(0, 195, 255, 0.16), rgba(2, 8, 22, 0.96) 70%)",
          }}
        />
      )}

      {/* Main Split-Screen Container */}
      <div className={`relative z-10 w-full max-w-[1440px] min-h-[92vh] grid grid-cols-1 lg:grid-cols-12 ${containerClass} sm:rounded-[32px] overflow-hidden backdrop-blur-xl transition-all duration-300`}>
        {/* ================= LEFT PANEL: HERO ARTWORK & CENTERED BRANDING ================= */}
        <div
          className={`lg:col-span-6 relative flex flex-col justify-between p-7 sm:p-10 overflow-hidden rounded-b-[32px] lg:rounded-b-none lg:rounded-r-[36px] border-b lg:border-b-0 lg:border-r ${
            theme === "dark"
              ? "border-sky-400/30 shadow-[12px_0_40px_rgba(0,0,0,0.65)]"
              : "border-slate-200/80 shadow-[12px_0_32px_rgba(15,23,42,0.14)]"
          }`}
        >
          {/* Background NOCVISION Hero Image + Cyber Gradient Overlay */}
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-1000"
            style={{
              backgroundImage: "url('/nocvision-hero.jpg')",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(2,10,28,0.82) 0%, rgba(3,12,32,0.72) 45%, rgba(2,8,22,0.94) 100%)",
            }}
          />

          {/* Top Navigation Bar inside Left Panel (matching "Selected Works" | "Sign Up" | "( Join Us )") */}
          <div className="relative z-10 flex items-center justify-between gap-4 text-xs sm:text-sm">
            <span className="font-semibold tracking-wide text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-ping" />
              Network Operations
            </span>

            <div className="flex items-center gap-3">
              <span className="px-3.5 py-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 text-sky-200 font-semibold text-xs tracking-wide">
                NOCVISION AAA
              </span>
            </div>
          </div>

          {/* Center Logo + Brand Title (matching Centered NextResume Logo in Reference Image) */}
          <div className="relative z-10 my-auto py-10 flex flex-col items-center text-center">
            <div className="relative group">
              <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-[#00d4ff]/30 to-[#0066ff]/30 blur-2xl opacity-80 group-hover:opacity-100 transition" />
              <img
                src="/nocvision-icon.png"
                alt="NOCVISION Icon"
                className="relative w-32 h-32 sm:w-36 sm:h-36 object-contain drop-shadow-[0_0_32px_rgba(0,195,255,0.55)] transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            <div className="mt-5 flex items-baseline justify-center gap-1">
              <span className="text-3xl sm:text-4xl font-black tracking-wider text-white drop-shadow">
                NOC
              </span>
              <span className="text-3xl sm:text-4xl font-black tracking-wider text-[#00b8ff] drop-shadow-[0_0_18px_rgba(0,184,255,0.55)]">
                VISION
              </span>
            </div>

            <p className="text-xs sm:text-sm font-mono uppercase tracking-[0.22em] text-sky-200/90 mt-1">
              NETWORK OPERATIONS CENTER
            </p>

            <p className="text-sm italic text-slate-200 mt-3">
              See Everything.{" "}
              <span className="text-[#00d4ff] font-semibold">
                Control Everything.
              </span>
            </p>
          </div>

          {/* Bottom Feature Pillars & Multi-Brand Footer inside Left Panel */}
          <div className="relative z-10 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                {
                  icon: MonitorActivity,
                  title: "Real-Time",
                  sub: "Monitoring",
                },
                {
                  icon: Network,
                  title: "Network",
                  sub: "Topology",
                },
                {
                  icon: BarChart3,
                  title: "Traffic",
                  sub: "Analytics",
                },
                {
                  icon: BellRing,
                  title: "Smart",
                  sub: "Alert",
                },
                {
                  icon: ShieldCheck,
                  title: "High",
                  sub: "Availability",
                },
              ].map((f, idx) => {
                const Icon = f.icon;
                return (
                  <div
                    key={idx}
                    className="bg-[#051229]/85 border border-sky-500/25 rounded-xl p-2 flex items-center gap-2 backdrop-blur-md"
                  >
                    <Icon className="w-4 h-4 text-[#00c8ff] shrink-0" />
                    <div className="leading-tight text-left">
                      <span className="block text-[10px] font-bold text-white">
                        {f.title}
                      </span>
                      <span className="block text-[9px] text-sky-300/80">
                        {f.sub}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-sky-200/75 pt-1">
              <span>
                Core Router • Switch • FTTH OLT (MikroTik • Cisco • Juniper •
                ZTE • Huawei • FiberHome)
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Poller Active
              </span>
            </div>
          </div>
        </div>

        {/* ================= RIGHT PANEL: LOGIN FORM ================= */}
        <div
          className={`lg:col-span-6 p-7 sm:p-12 lg:p-14 flex flex-col justify-between transition-colors duration-300 ${
            isLightCard
              ? "bg-gradient-to-br from-white via-white to-sky-50/50 text-slate-800"
              : "bg-gradient-to-br from-[#06132c] via-[#040d21] to-[#020714] text-slate-100"
          }`}
        >
          {/* Top-Left Brand Header + AAA Protocol + Theme Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img
                src="/nocvision-icon.png"
                alt="NOCVISION"
                className="w-11 h-11 object-contain drop-shadow-[0_0_12px_rgba(0,184,255,0.35)]"
              />
              <div className="flex items-baseline gap-0.5">
                <span className={`text-xl font-black tracking-wider ${isLightCard ? "text-slate-900" : "text-white"}`}>
                  NOC
                </span>
                <span className={`text-xl font-black tracking-wider ${isLightCard ? "text-sky-600" : "text-[#00b8ff]"}`}>
                  VISION
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Theme Switcher Pill (Dark / Twilight / Light) */}
              {onThemeChange && (
                <div
                  className={`flex items-center gap-1 p-1 rounded-full border ${
                    theme === "light"
                      ? "bg-white border-slate-200 shadow-xs"
                      : theme === "twilight"
                      ? "bg-white/90 border-slate-300 shadow-xs"
                      : "bg-[#030917] border-sky-500/30"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onThemeChange("dark")}
                    title="Dark Mode"
                    className={`p-1.5 rounded-full transition cursor-pointer ${
                      theme === "dark"
                        ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50"
                        : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange("twilight")}
                    title="Twilight Mode"
                    className={`p-1.5 rounded-full transition cursor-pointer ${
                      theme === "twilight"
                        ? "bg-slate-700 text-white shadow-xs"
                        : "text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    <CloudMoon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onThemeChange("light")}
                    title="Light Mode"
                    className={`p-1.5 rounded-full transition cursor-pointer ${
                      theme === "light"
                        ? "bg-amber-400/20 text-amber-600 border border-amber-300"
                        : "text-slate-400 hover:text-amber-400"
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Center Form Block */}
          <div className="max-w-[400px] w-full mx-auto my-auto py-6">
            <div className="text-center mb-7">
              <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${isLightCard ? "text-slate-900" : "text-white"}`}>
                Hi Network Engineer
              </h1>
              <p className={`text-sm mt-2 ${isLightCard ? "text-slate-500" : "text-sky-200/80"}`}>
                Welcome to{" "}
                <span className={`font-bold ${isLightCard ? "text-slate-900" : "text-white"}`}>NOC</span>
                <span className={`font-bold ${isLightCard ? "text-sky-600" : "text-[#00c8ff]"}`}>VISION</span> Command
                Center
              </p>
            </div>

            {errorMsg && (
              <div
                className={`mb-4 p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  isLightCard
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-rose-950/50 border-rose-500/50 text-rose-200"
                }`}
              >
                <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isLightCard ? "text-rose-500" : "text-rose-400"}`} />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoMsg && (
              <div
                className={`mb-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  isLightCard
                    ? "bg-sky-50 border-sky-200 text-sky-800"
                    : "bg-sky-950/60 border-sky-400/40 text-sky-200"
                }`}
              >
                <Sparkles className={`w-4 h-4 shrink-0 ${isLightCard ? "text-sky-600" : "text-[#00d4ff]"}`} />
                <span>{infoMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email / Username Input */}
              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Email atau Username"
                  autoComplete="username"
                  maxLength={128}
                  className={`w-full border rounded-xl px-4 py-3.5 text-sm placeholder-slate-400 focus:outline-none shadow-inner font-mono transition ${
                    isLightCard
                      ? "bg-white border-slate-200 focus:border-sky-500 text-slate-900"
                      : "bg-[#051026]/90 border-sky-500/35 focus:border-[#00d4ff] text-white"
                  }`}
                  required
                />
              </div>

              {/* Password Input with Eye Toggle */}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  maxLength={128}
                  className={`w-full border rounded-xl px-4 pr-11 py-3.5 text-sm placeholder-slate-400 focus:outline-none shadow-inner font-mono transition ${
                    isLightCard
                      ? "bg-white border-slate-200 focus:border-sky-500 text-slate-900"
                      : "bg-[#051026]/90 border-sky-500/35 focus:border-[#00d4ff] text-white"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer ${
                    isLightCard ? "hover:text-sky-600" : "hover:text-[#00d4ff]"
                  }`}
                  aria-label="Toggle Password Visibility"
                >
                  {showPassword ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Forgot Password Link on Right */}
              <div className="flex items-center justify-end text-xs pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setInfoMsg(
                      "Hubungi Administrator atau Tenant Owner workspace Anda untuk reset password akun NOC."
                    );
                  }}
                  className={`font-semibold transition cursor-pointer ${
                    isLightCard
                      ? "text-sky-600 hover:text-sky-700"
                      : "text-[#00c8ff] hover:text-sky-300"
                  }`}
                >
                  Forgot password ?
                </button>
              </div>

              {/* Main Login Pill Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:brightness-110 text-white font-extrabold text-sm shadow-[0_10px_28px_rgba(14,165,233,0.35)] flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isLoading ? "Memverifikasi Sesi NOCVISION..." : "Login"}
              </button>
            </form>
          </div>

          {/* Bottom Subtle Security Footer */}
          <div
            className={`flex items-center justify-between text-[11px] font-mono pt-2 border-t ${
              isLightCard
                ? "text-slate-500 border-slate-200"
                : "text-slate-500 border-sky-500/15"
            }`}
          >
            <span>NOCVISION AAA Security • 7-Day Session</span>
            <span className={isLightCard ? "text-sky-600 font-semibold" : "text-sky-400/80"}>
              99.9% High Availability
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
