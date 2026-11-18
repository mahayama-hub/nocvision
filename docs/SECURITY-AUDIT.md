# Laporan Audit Keamanan & Remediasi — NOCVISION

**Tanggal Audit:** 11 November 2026  
**Cakupan Kode:** [auth.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/auth.ts), [network-poller.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/network-poller.ts), API Routes (`src/app/api/*`), [LoginView.tsx](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/components/LoginView.tsx), [login/page.tsx](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/login/page.tsx), [next.config.mjs](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/next.config.mjs)  

---

## 1. Ringkasan Eksekutif

Audit kode menyeluruh menemukan **3 kerentanan Critical**, **1 kerentanan High**, dan **2 temuan Medium** yang memungkinkan pemalsuan sesi admin tanpa password, akses API tanpa autentikasi, kebocoran kredensial plaintext, serta risiko injection argumen pada utilitas ping/traceroute. **Seluruh temuan Critical, High, dan Medium di layer server & konfigurasi HTTP telah diperbaiki** dan diverifikasi melalui TypeScript strict check serta E2E security regression tests.

---

## 2. Daftar Temuan & Status Remediasi

### [CRITICAL-01] Pemalsuan Cookie Sesi Tanpa Signature (`omninoc_session`)
- **Lokasi Sebelumnya:** [src/app/api/auth/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/auth/route.ts)
- **Temuan:** Cookie `omninoc_session` hanya menyimpan Base64 mentah dari objek `NocUser` dengan atribut `httpOnly: false`, serta `GET /api/auth` mendekode Base64 tanpa verifikasi tanda tangan kriptografis, expiry, maupun status akun di server. Penyerang dapat membuat cookie berisi `"role": "Tenant Owner"` dan masuk sebagai admin tanpa login.
- **Remediasi:**
  - Mengimplementasikan token bertanda tangan **HMAC-SHA256** (`createSessionToken` / `verifySessionToken`) di [src/lib/auth.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/auth.ts) menggunakan `crypto.timingSafeEqual`, payload `{ sub, exp }`, dan `SESSION_SECRET`.
  - Validasi sesi kini juga memeriksa apakah `user.id` masih ada dan berstatus `active` di store RBAC serta menghitung ulang permissions terbaru dari definisi role-nya.
  - Mengatur cookie `omninoc_session` sebagai `httpOnly: true`, `sameSite: "lax"`, dan `secure` otomatis saat protokol HTTPS (`x-forwarded-proto` / `https:`).

---

### [CRITICAL-02] Tidak Ada Autentikasi & Otorisasi RBAC Server-Side pada API Routes
- **Lokasi Sebelumnya:**
  - [src/app/api/noc/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/noc/route.ts)
  - [src/app/api/users/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/users/route.ts)
  - [src/app/api/diagnostics/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/diagnostics/route.ts)
  - [src/app/api/superai/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/superai/route.ts)
- **Temuan:**
  1. Seluruh API route menerima request anonim (`401` tidak pernah diterapkan), sehingga pihak luar dapat membaca topologi/inventori, memindai port TCP jaringan internal, menghabiskan kuota `GEMINI_API_KEY`, dan menambah/menghapus akun admin.
  2. `POST /api/noc` sebelumnya mempercayai `body.actorRole` dan `body.actorName` dari client untuk menentukan `isReadOnlyRole`.
- **Remediasi:**
  - Menambahkan helper `requireSessionUser(req, requiredPermission?)` di [src/lib/auth.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/auth.ts).
  - `/api/noc`: `GET` wajib `view_dashboard`; `POST` memetakan setiap `action` ke izin spesifik via `ACTION_PERMISSION_MAP`, serta mengambil `actorName` & `actorRole` langsung dari sesi terverifikasi (`auth.user`), bukan dari body request.
  - `/api/users`: `GET` wajib sesi terautentikasi; `POST` wajib izin `manage_users`.
  - `/api/diagnostics`: `POST` wajib izin `run_diagnostics`.
  - `/api/superai`: `GET` & `POST` wajib sesi terautentikasi.

---

### [CRITICAL-03] Penyimpanan Password Plaintext & Kebocoran `passwordHint`
- **Lokasi Sebelumnya:** [src/lib/auth.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/auth.ts), [src/app/api/users/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/users/route.ts)
- **Temuan:** `data/noc-users.json` menyimpan `passwordPlain` dalam bentuk teks terbuka dengan perbandingan `===`, dan `GET /api/users` mengembalikan `passwordHint: "${passwordPlain.slice(0, 2)}***"`.
- **Remediasi:**
  - Menambahkan `hashPassword()` dan `verifyPassword()` memakai per-user salt 16-byte + `crypto.scryptSync` (format `scrypt$<salt>$<hash>`) dengan perbandingan `crypto.timingSafeEqual`.
  - `loadRbacStore()` secara otomatis memigrasi akun lama ber-`passwordPlain` ke `passwordHash` saat boot/akses dan menghapus field plaintext dari `data/noc-users.json` (versi store v3).
  - Menghapus total `passwordHint` dan memakai `stripSensitiveUserFields()` pada seluruh respons `/api/users`.

---

### [HIGH-01] Eksekusi Shell & Sanitasi Host Lemah pada Network Poller
- **Lokasi Sebelumnya:** [src/lib/network-poller.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/network-poller.ts)
- **Temuan:** `executeRealPing` dan `executeRealTraceroute` memanggil `exec()` dengan string command terinterpolasi, serta `sanitizeHost` tidak menolak awalan `-` sehingga berpotensi menjadi argument/flag injection.
- **Remediasi:**
  - Mengganti `exec` dengan `execFile("ping" | "tracert" | "traceroute", args)` sehingga shell tidak pernah dipanggil.
  - Memperketat `sanitizeHost()` agar memvalidasi IPv4/IPv6 via `net.isIP()` dan hanya mengizinkan hostname RFC-1123 valid yang tidak diawali tanda `-` atau `.`.

---

### [HIGH-02] Eskalasi Role Hierarki `Tenant Owner` ke `Administrator`
- **Lokasi:** [src/lib/rbac-rules.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/lib/rbac-rules.ts), [src/app/api/users/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/users/route.ts), [src/components/UserRoleManager.tsx](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/components/UserRoleManager.tsx)
- **Temuan:** Sebelumnya seluruh pemilik izin `manage_users` (termasuk `Tenant Owner`) dapat membuat user ber-role `Administrator` maupun mengubah role akun lain menjadi `Administrator`.
- **Remediasi:**
  - Menerapkan `canAssignRole()` / `SUBORDINATE_NOC_ROLES` (`NOC Engineer`, `NOC Read-Only / Auditor`, `Refresh`) di server (`POST /api/users`) dan UI (`UserRoleManager.tsx`).
  - Memblokir dengan HTTP `403` apabila `Tenant Owner` mencoba membuat, mempromosikan, menghapus, atau mengubah matriks izin role `Administrator` atau `Tenant Owner`.

---

### [MEDIUM-01 & MEDIUM-02] Security Headers & Login Rate Limiting
- **Lokasi:** [next.config.mjs](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/next.config.mjs), [src/app/api/auth/route.ts](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/app/api/auth/route.ts)
- **Remediasi:**
  - Menambahkan HTTP headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, dan `X-DNS-Prefetch-Control: off`.
  - Menambahkan rate limiting percobaan login gagal (`checkLoginRateLimit` / `recordLoginFailure` — batas 10 percobaan per jendela 5 menit sebelum mengembalikan HTTP `429`).

---

## 3. Catatan Risiko Residual & Rekomendasi Produksi Lanjutan

1. **Wajib Set `SESSION_SECRET` di Production:** Jika `SESSION_SECRET` belum diatur di `.env.local`, aplikasi menggunakan fallback development default. Pada lingkungan produksi wajib menggunakan nilai acak minimal 32 karakter (`openssl rand -hex 32`).
2. **Tombol Demo / Quick-Login di `LoginView.tsx`:** [LoginView.tsx](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/src/components/LoginView.tsx) masih memiliki `handleGoogleLogin` / `fillDemoAccount` untuk kenyamanan demo lokal serta label default `admin / admin123`. Disarankan menonaktifkan helper demo tersebut sebelum rilis publik dan mengganti seluruh password default segera setelah instalasi.
3. **Skalabilitas Penyimpanan & Rate Limit:** `data/noc-users.json`, `data/noc-state.json`, dan Map rate-limiter berbasis single-node filesystem/memory. Untuk deployment multi-replica/cluster, migrasikan ke PostgreSQL dan Redis.
4. **Kontrol Akses Jaringan `diagnostics`:** `POST /api/diagnostics` dan `probeTcpPort` membolehkan probing ke IP internal NOC secara desain. Pastikan host server ditempatkan di segmen manajemen terisolasi dan batasi akses role `run_diagnostics`.

