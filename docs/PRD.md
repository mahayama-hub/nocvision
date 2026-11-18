# Product Requirements Document (PRD) — NOCVISION

**Versi Dokumen:** 1.0  
**Produk:** NOCVISION (`omninoc-network-monitoring`)  
**Tech Stack:** Next.js 15 (`^15.2.0`), React 19 (`^19.0.0`), TypeScript (`^5.7.0`), Tailwind CSS v4, Lucide Icons  

---

## 1. Ringkasan Eksekutif & Visi Produk

**NOCVISION** adalah platform Network Operations Center (NOC) multi-vendor untuk operasional jaringan ISP, enterprise backbone, dan akses FTTH/GPON. Platform ini menyatukan telemetri real-time (ICMP, TCP port probing, utilitas trafik, BGP peer monitoring, serta optical power GPON OLT/ONU), manajemen perubahan konfigurasi yang aman (*Config Wizard*, *Auto-Backup*, dan *Commit Confirmed* dengan auto-rollback), diagnostik jaringan langsung dari browser, asisten AI operasional (**NOCAI** berbasis Google Gemini env-key), serta kontrol akses berbasis peran (RBAC) dengan jejak audit forensik.

### Sasaran Utama
1. **Single Pane of Glass Multi-Vendor:** Memantau dan mengelola perangkat dari vendor MikroTik, Cisco, Juniper, ZTE, Huawei, FiberHome, dan perangkat generik dalam satu antarmuka terpadu.
2. **Zero-Regret Configuration Safety:** Mencegah putusnya koneksi manajemen router inti melalui mekanisme *Config Snapshot* otomatis dan timer *Commit Confirmed* (auto-rollback bila operator gagal melakukan konfirmasi).
3. **Observabilitas Akses FTTH:** Memantau kesehatan port PON OLT, redaman optik (`Rx`/`OLT Rx` dalam dBm), deteksi LOS / High Attenuation, auto-discovery ONU baru, provisioning PPPoE/VLAN, dan remote reboot ONU.
4. **Keamanan & Akuntabilitas:** Autentikasi cookie sesi tertandatangani HMAC-SHA256 (`httpOnly`), hashing password `scrypt`, RBAC tervalidasi di server, serta audit log dengan ekspor CSV.

---

## 2. Persona Pengguna & Matriks RBAC

Sistem RBAC didefinisikan di [auth.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/auth.ts) dan disimpan persisten di `data/noc-users.json`.

| Peran (`NocRoleName`) | Deskripsi Operasional | `view_dashboard` | `view_graphs` | `manage_devices` | `olt_provision` | `run_diagnostics` | `manage_incidents` | `manage_users` | `refresh_sync` |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Administrator** | Super Admin — kelola seluruh role, user, perangkat, dan operasional penuh (Akun bawaan: `superadmin` / `superadmin123`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Tenant Owner** | Pemilik workspace; kelola operasional & hanya dapat membuat/mengelola user di bawahnya (`NOC Engineer`, `NOC Read-Only / Auditor`, `Refresh`) (Akun bawaan: `admin` / `admin123`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **NOC Engineer** | Konfigurasi, commit, provisioning OLT, dan troubleshoot | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **NOC Read-Only / Auditor** | Hanya baca: monitoring dashboard, grafik, log, & diagnostik | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Refresh** | Akses membaca dashboard, grafik, dan sinkronisasi data | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 3. Ruang Lingkup Fitur & Kebutuhan Fungsional

Seluruh modul dashboard diatur pada [page.tsx](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/page.tsx) (`ActiveTab`):

### 3.1 Autentikasi & Sesi (`LoginView.tsx`, `/login`, `/api/auth`)
- Login berbasis username, email, atau nama lengkap dengan verifikasi password `scrypt`.
- Cookie sesi `omninoc_session` bertanda tangan HMAC-SHA256, `httpOnly`, `sameSite: lax`, berlaku 7 hari, disertai rate limiting percobaan login gagal (`429 Too Many Requests` setelah 10 kegagalan dalam 5 menit).
- Dukungan 3 tema persisten (`dark`, `twilight`, `light`) melalui `localStorage` (`nocvision_theme`) di `/` dan `/login`.

### 3.2 Overview & Telemetry Core (`overview`, `BentoOverviewDashboard.tsx`)
- KPI fleet ringkas: Total perangkat, uptime, insiden aktif/critical, BGP peers established, status ONU FTTH.
- Grafik trafik agregat (Inbound/Outbound Gbps), daftar top talkers, ringkasan insiden dengan aksi Acknowledge/Resolve (`manage_incidents`).
- Mode polling **Hybrid / Simulation / Live ICMP+TCP** dengan refresh interval 5 detik atau manual refresh.

### 3.3 Uptime Monitor (`uptime`, `UptimeMonitorView.tsx`)
- Monitoring SLA, latensi ICMP, packet loss, riwayat status bar 24h, filter status (Up/Degraded/Down), serta detail target probe per perangkat.

### 3.4 Device Graphs (`graphs`, `DeviceGraphsCenter.tsx`)
- Analisis metrik CPU, Memory, Temperature, Latency, dan Packet Loss per perangkat serta interface utilization.

### 3.5 FTTH OLT & ONU Monitor (`olt_pon`, `OltPonMonitor.tsx`)
- Ringkasan port GPON/EPON (`ponPorts`), daftar ONU terdaftar (`onus`), penandaan **LOS** / **High Attenuation** (`rxPowerDbm`), pencarian SN/PPPoE/nama pelanggan.
- Aksi **Auto-Register / Provision ONU** (`olt_provision`) dan **Remote Reboot / Recalibrate Optical** per ONU.

### 3.6 Topology Map (`topology`, `TopologyMap.tsx`)
- Peta interkoneksi link antar Core Router, Distribution Switch, dan OLT beserta status link, bandwidth utilitas, dan pemilihan node untuk detail cepat.

### 3.7 Inventory Perangkat (`devices`, `AddDeviceModal.tsx`, `page.tsx`)
- Tabel inventori dengan filter pencarian, role perangkat, dan vendor.
- Tambah perangkat baru (pilihan vendor profile otomatis mengisi port SSH/API/SNMP) serta **Live Poll** individual maupun hapus perangkat (`manage_devices`).

### 3.8 BGP Peers & Routing (`bgp`, `page.tsx`)
- Pemantauan sesi BGP eBGP/iBGP (`bgpPeers`: Remote ASN, Peer IP, State, Prefix Received, Uptime, FLAP counter) beserta inspeksi detail peer.

### 3.9 NOCAI Assistant (`super_ai`, `SuperAIChatView.tsx`, `/api/superai`)
- Integrasi server-side Google Gemini (`process.env.GEMINI_API_KEY`, default model `gemini-2.5-flash`) dengan konteks telemetri NOCVISION live (`loadNocState()`).
- Tidak ada input API key di sisi client; status konfigurasi terbaca read-only dari environment server (`GET /api/superai`).

### 3.10 Troubleshoot, Config Safety & Diagnostics (`troubleshoot`, `backup`, `automation`, `diagnostics`)
- **Troubleshoot & Diagnostics (`WebTerminalDiagnostics.tsx`, `/api/diagnostics`):** Eksekusi real OS ICMP `ping`, `traceroute`/`tracert`, resolusi DNS (`dns.lookup` & `resolveAny`), TCP Port Scan, serta perintah diagnostik multi-vendor (`show bgp summary`, `show route`, `diagnostics optics`, dll.).
- **Automation & Config Safety (`AutomationSafetyCenter.tsx`):**
  - *Config Wizard & Route Filter*: Pratinjau diff konfigurasi vendor-aware.
  - *Commit Confirmed*: Deployment konfigurasi dengan countdown timer auto-rollback dan tombol konfirmasi manual (`resolve_pending_commit`).
  - *Cloud Auto-Backup & Snapshots*: Toggle jadwal backup 24 jam, pembuatan snapshot manual, dan restore snapshot.

### 3.11 Audit Log (`audit_log`, `AuditLogView.tsx`)
- Jejak audit forensik ISO timestamp mencatat `actorName`, `actorRole`, `module`, `actionType`, `status` (`SUCCESS`, `ROLLED_BACK`, `BLOCKED`), ringkasan aksi, dan `diffPayload`, lengkap dengan ekspor CSV.

### 3.12 User & RBAC Manager (`users_rbac`, `UserRoleManager.tsx`, `/api/users`)
- Daftar anggota tim NOC, tambah anggota (`add_user`), edit role/status/password (`update_user`), hapus anggota selain `usr-01` (`delete_user`), serta toggle izin dinamis per role (`toggle_role_permission`).

---

## 4. Spesifikasi Endpoint API

| Endpoint | Method | Auth / Permission Wajib | Fungsi Utama |
|---|---|---|---|
| `/api/auth` | `GET`, `POST` | Public (`POST` rate-limited) | Cek sesi aktif, login (`scrypt`), logout (clear cookie) |
| `/api/noc` | `GET` | `view_dashboard` | Ambil `NocState` atau refresh telemetri (`?refresh=true&realPing=true`) |
| `/api/noc` | `POST` | Session + izin per `action` (`ACTION_PERMISSION_MAP`) | CRUD perangkat, polling, OLT provisioning, insiden, backup, commit confirmed, route filter |
| `/api/users` | `GET` | Session aktif | Ambil daftar roles & users tersanitasi (tanpa hash/plain password) |
| `/api/users` | `POST` | `manage_users` | Tambah, ubah, hapus user, dan toggle permission matrix |
| `/api/diagnostics` | `POST` | `run_diagnostics` | ICMP Ping, Traceroute, DNS, TCP scan, simulasi vendor CLI |
| `/api/superai` | `GET`, `POST` | Session aktif | Status env Gemini & inferensi AI kontekstual jaringan |

---

## 5. Kriteria Keberhasilan Rilis
- Zero TypeScript errors dengan pemeriksaan ketat (`tsc --noEmit --noUnusedLocals --noUnusedParameters`).
- Build produksi (`npm run build`) sukses tanpa error.
- Seluruh test E2E HTTP/RBAC/CRUD pada [e2e.mjs](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/tests/e2e.mjs) lulus 100%.
- Seluruh celah keamanan kritis pada autentikasi, RBAC server-side, dan command execution tertangani.
