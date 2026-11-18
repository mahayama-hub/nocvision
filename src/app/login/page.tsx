"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginView from "@/components/LoginView";
import type { BentoTheme } from "@/components/BentoOverviewDashboard";

export default function LoginPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<BentoTheme>("dark");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nocvision_theme");
      if (saved === "dark" || saved === "twilight" || saved === "light") {
        setTheme(saved);
      }
    } catch {
      // Ignore storage access failures
    }
  }, []);

  const handleThemeChange = useCallback((nextTheme: BentoTheme) => {
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("nocvision_theme", nextTheme);
    } catch {
      // Ignore storage access failures
    }
  }, []);

  return (
    <LoginView
      theme={theme}
      onThemeChange={handleThemeChange}
      onLoginSuccess={() => {
        router.push("/");
        router.refresh();
      }}
    />
  );
}

