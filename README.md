# NOCVISION — Multi-Vendor NOC Monitoring & Alerting Platform

**NOCVISION** adalah platform monitoring Network Operations Center (NOC) berbasis **Next.js 15**, **React 19**, dan **Tailwind CSS v4** untuk pemantauan perangkat jaringan multi-vendor (Core Router, Switch, OLT/PON, BGP Peers), diagnostik jaringan real-time, Cloud Backup Vault, RBAC bertingkat, serta notifikasi **Telegram & WhatsApp Bot API**.

## Fitur Utama

- **Bento NOC Overview Dashboard**: Ringkasan throughput real-time, kapasitas per tier (`CORE`, `SWITCH`, `OLT PON`), alarm aktif, dan pemantauan perangkat.
- **Multi-Vendor Telemetry & Topology**: Monitoring router, switch, OLT/ONU (GPON/EPON/XGS-PON), BGP peers, grafik trafik, dan peta topologi interaktif dengan tema `Dark`, `Twilight`, dan `Light`.
- **Alerting Gateway (Telegram & WhatsApp Bot API)**: Notifikasi ke Telegram Bot API serta WhatsApp Bot API (`Fonnte`, `Wablas`, `Meta Cloud API`, atau Custom HTTPS Webhook) dengan token ter-masking di server dan proteksi anti-SSRF.
- **Cloud Backup Vault**: Penyimpanan snapshot konfigurasi perangkat dan jadwal auto-backup.
- **Web Terminal Diagnostics**: Ping, Traceroute, DNS lookup, TCP port scan, dan inspeksi SNMP langsung dari server melalui `execFile` dengan sanitasi host ketat.
- **NOCAI Diagnostic Assistant**: Integrasi opsional Gemini API (`GEMINI_API_KEY`) untuk analisis insiden dan telemetri.
- **Server-Side Authentication & RBAC**:
  - Sesi ditandatangani HMAC-SHA256 dalam cookie `HttpOnly` (`omninoc_session`).
  - Hashing password menggunakan `scrypt` + random 16-byte salt.
  - Hierarki role (`Administrator`, `Tenant Owner`, `NOC Engineer`, `NOC Read-Only / Auditor`, `Refresh`).
- **Audit Log Forensik**: Pencatatan aktivitas perubahan dan akses RBAC.

## Persyaratan

- **Node.js** 20+ dan **npm**
- Reverse proxy HTTPS (Nginx/Caddy/Cloudflare) untuk deployment produksi

## Instalasi & Menjalankan Secara Lokal

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Konfigurasi environment**:
   Salin `.env.example` menjadi `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Isi variabel berikut di `.env.local`:
   - `SESSION_SECRET`: string acak minimal 32 karakter (wajib diisi pada mode `production`).
   - `GEMINI_API_KEY`: opsional, untuk fitur NOCAI Assistant.
   - `GEMINI_MODEL`: default `gemini-2.5-flash`.

3. **Jalankan mode development**:
   ```bash
   npm run dev
   ```
   Buka `http://localhost:3000`.

## Kredensial Awal

Pada kondisi awal, database runtime (`data/noc-state.json` & `data/noc-users.json`) kosong dan hanya memiliki satu akun bawaan:

- **Username**: `superadmin` (atau `superadmin@nocvision.id`)
- **Password**: `superadmin123`
- **Role**: `Administrator`

> Segera ubah password `superadmin` melalui menu **Role & User -> Edit** setelah login pertama di server produksi.

## Skrip & Pengujian

```bash
npm run typecheck   # Validasi TypeScript (tsc --noEmit)
npm run build       # Build aplikasi produksi Next.js
npm run start       # Menjalankan server produksi
npm run test:e2e    # Menjalankan 5 suite uji E2E (butuh server aktif di E2E_BASE_URL)
```

## Dokumentasi Tambahan

- [Product Requirements Document (PRD)](docs/PRD.md)
- [UI/UX Design Brief](docs/UI-UX-DESIGN-BRIEF.md)
- [Security Audit](docs/SECURITY-AUDIT.md)
- [Panduan Deployment Produksi](docs/DEPLOYMENT.md)

## Lisensi

Lihat file [LICENSE](LICENSE).
