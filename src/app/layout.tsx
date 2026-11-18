import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOCVISION — Network Operations Center | Multi-Vendor Monitoring",
  description:
    "NOCVISION (See Everything. Control Everything.) — Unified Network Operations Center for Core Routers, Distribution Switches, and FTTH OLTs across all brands.",
  icons: {
    icon: "/nocvision-icon.png",
    shortcut: "/nocvision-icon.png",
    apple: "/nocvision-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-screen bg-[#060a12] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
