# Full UI/UX Design Brief — NOCVISION Bento Command Center

**Sistem Desain:** NOCVISION Dual/Tri-Theme Bento Architecture  
**Cakupan:** `/login`, Dashboard Workspace (`/`), serta seluruh 14 sub-modul operasional NOC  

---

## 1. Filosofi Visual & Arah Estetika

NOCVISION dirancang dengan bahasa visual **"Tactile Telecom Bento"**: memadukan keterbacaan telemetry kepadatan tinggi khas ruang kontrol ISP dengan struktur kartu modular ber-radius besar (*pill & bento geometry*) dan kedalaman glassmorphism yang tenang. Tidak ada dekorasi berlebihan yang mengalihkan perhatian operator saat menangani insiden kritis; setiap elemen warna memiliki makna status jaringan yang tegas.

---

## 2. Sistem Tiga Tema (*Tri-Theme Fidelity*)

Didefinisikan di [globals.css](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/globals.css) dan dikelola seragam antara `/` dan `/login` via `localStorage` (`nocvision_theme`):

| Tema | Karakteristik Canvas (`bento-shell-*`) | Window Container (`bento-window-*`) | Kartu Konten (`bento-card-*`) | Target Penggunaan |
|---|---|---|---|---|
| **Dark** (`dark`) | Deep midnight navy (`#020612` – `#0b162d` radial mesh) | Translusen dark navy `rgba(9,16,32,0.84)` + border cyan tipis `rgba(14,165,233,0.18)` | `#0f1a2d` dengan subtle ring `rgba(255,255,255,0.06)` | Shift malam NOC / ruang kontrol redup |
| **Twilight** (`twilight`) | Slate-indigo gradasi lembut (`#e2e8f0` – `#cbd5e1`) | Surface frosted light `rgba(255,255,255,0.88)` + header bar kontras | Kartu putih bersih (`#ffffff`) agar tabel & grafik tetap tajam | Transisi sore / pencahayaan campuran |
| **Light** (`light`) | Daylight cloud gradient (`#f8fafc` – `#e2e8f0`) | Putih crisp `rgba(255,255,255,0.92)` + border `#e2e8f0` | Kartu putih elevasi halus (`rgba(255,255,255,0.96)`) | Kantor siang / presentasi manajemen |

### Prinsip Kontras & Token Warna Semantik
- **Primary Telemetry Accent:** Cyan / Sky (`#00c8ff` / `sky-500` – `cyan-400`) untuk interaksi aktif, CTA primer, dan status poller aktif.
- **Status Sehat (`UP` / `Established` / `SUCCESS`):** Emerald (`emerald-400` di dark, `emerald-600` di light/twilight) dengan kontras latar pastel/translusen.
- **Status Peringatan (`WARNING` / `High Attenuation` / `Pending`):** Amber (`amber-400` / `amber-600`).
- **Status Kritis (`CRITICAL` / `DOWN` / `LOS` / `BLOCKED`):** Rose (`rose-400` / `rose-600`).

---

## 3. Tipografi, Hierarki & Keterbacaan Data Jaringan

- **Heading & Label Navigasi:** Sans-serif tegas (`font-bold` / `font-extrabold`), tracking rapat untuk angka KPI besar.
- **Telemetry & Network Identifiers:** Monospace (`font-mono`) wajib dipakai pada:
  - Alamat IPv4/IPv6, CIDR prefix, dan hostname perangkat
  - Nomor ASN BGP, serial number ONT/ONU, serta MAC address
  - Nilai redaman optik FTTH (`-18.42 dBm`), latensi (`ms`), packet loss (`%`), dan diff CLI konfigurasi
- **Empty & Clean Titles:** Hindari subtitle panjang yang memenuhi header kartu; judul modul seperti **Topology**, **Troubleshoot & Diagnostics**, dan **NOCAI** menggunakan hierarki bersih tanpa teks pengantar berulang.

---

## 4. Anatomi Layout & Komponen Kunci

### 4.1 Portal Login (`/login` & Gate `/` saat belum terautentikasi)
- **Split-Screen Responsive (`grid-cols-1 lg:grid-cols-12`):**
  - *Panel Kiri*: Visual hero NOC (`/nocvision-hero.jpg`) dengan overlay gradient gelap terjaga kontras, badge High Availability & Poller Active, serta footer ringkas vendor yang didukung (`MikroTik • Cisco • Juniper • ZTE • Huawei • FiberHome`).
  - *Panel Kanan*: Branding `NOCVISION` (`/nocvision-icon.png`), pemilih tema pill 3-state (*Dark / Twilight / Light*), input Username/Email & Password dengan toggle visibilitas ikon mata, serta CTA pill **Login** + opsi **Login with Google**. Autentikasi disederhanakan tanpa switcher protokol `Local DB | RADIUS | TACACS+` maupun deretan tombol role demo di bagian bawah.

### 4.2 Shell Dashboard Utama ([page.tsx](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/page.tsx))
- **Collapsible Left Sidebar:** Dapat diciutkan (`isSidebarCollapsed`) dengan pengelompokan navigasi jelas:
  - *Monitoring*: Overview, Uptime Monitor, Device Graphs, OLT & PON, Topology
  - *Inventory & Routing*: Devices, BGP Peers
  - *Intelligence & Safety*: **NOCAI** (ikon kustom NOCVISION), Troubleshoot, Cloud Backup, Config Safety & Route Filter, Audit Log, Network Diagnostics
  - *Administration*: Team & RBAC
- **Top Control Bar:** Breadcrumb/judul view aktif, kontrol tema 3-mode instan, status sesi user + avatar inisial & badge role, serta tombol **Logout**.

### 4.3 Sub-Modul Operasional Penting
- **OLT & PON Monitor:** Filter cepat per OLT/status, tabel ONU dengan indikator bar/angka dBm langsung, modal Provision/Auto-Register dengan gaya Bento adaptif tema.
- **NOCAI Workspace:** Chat bubble responsif terhadap 3 tema, chip prompt diagnostik cepat (*Cek perangkat offline*, *Analisis ONU LOS*, *Audit BGP flap*), tanpa tombol konfigurasi API key di UI (status server env ditampilkan sebagai indikator pasif).
- **Troubleshoot & Diagnostics:** Pemilihan router tujuan, tab perintah multi-vendor bergaya pill, form parameter target/count, dan output terminal ber-scroll kontras tinggi.
- **Uptime Monitor & User Role Manager:** Seluruh kartu, filter bar, tabel, dan modal selaras penuh dengan tema aktif (`isLightCard = theme === "light" || theme === "twilight"`).

---

## 5. Standar UX, Aksesibilitas & Interaksi
1. **Cursor & Hit-Target Fidelity:** Semua tombol interaktif, pill tema, tab perintah, dan baris klik wajib memakai `cursor-pointer` dan fokus ring yang terlihat di semua tema.
2. **RBAC-Aware Affordance:** Akun *Read-Only / Auditor* melihat pesan penolakan yang jelas (dan tidak memicu perubahan state) saat mencoba melakukan mutasi, baik di UI maupun lewat respon API `403`.
3. **Konfirmasi Aksi Destruktif & Konfigurasi:** Penghapusan perangkat/user serta deployment konfigurasi dilengkapi umpan balik toast/status bar dan mekanisme rollback (*Commit Confirmed*).
4. **Responsivitas:** Layout beradaptasi dari layar mobile (`grid-cols-1`) hingga monitor ultrawide NOC (`max-w-[1440px]` pada portal login dan fluid Bento grid di dashboard utama).
