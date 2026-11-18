# Panduan Deployment Produksi — NOCVISION

Dokumen ini menjelaskan langkah build, konfigurasi environment, persistensi data, setup reverse proxy HTTPS, dan verifikasi pasca-deploy untuk platform **NOCVISION**.

---

## 1. Prasyarat Sistem

- **Node.js:** v20 LTS atau v24 (`node -v`) beserta `npm`.
- **Utilitas OS untuk Live Poller & Diagnostics:**
  - Linux: paket `iputils-ping` dan `traceroute` tersedia di `$PATH`.
  - Windows Server: utilitas bawaan `ping.exe` dan `tracert.exe`.
- **Akses Jaringan:** Server NOCVISION membutuhkan konektivitas ICMP/TCP ke perangkat router/switch/OLT tujuan agar mode polling `live_icmp_tcp` atau `hybrid` menghasilkan latensi riil.
- **API Key Opsional (NOCAI):** Google Gemini API key jika fitur **NOCAI** diaktifkan.

---

## 2. Konfigurasi Environment Variables

Salin template [.env.example](file:///c:/Users/Ironiul%20Hasani/project-monitoring-NOC/.env.example) menjadi `.env.local` (atau `.env.production`) pada server:

```env
# Konfigurasi AI (NOCAI)
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Wajib diisi secret acak >= 32 karakter untuk menandatangani cookie sesi HMAC-SHA256
SESSION_SECRET=ganti_dengan_hasil_openssl_rand_hex_32
```

Generate `SESSION_SECRET` yang kuat pada Linux/macOS atau PowerShell:

```bash
openssl rand -hex 32
```

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }) -as [byte[]]).ToLower()
```

> **Penting:** Jangan men-commit `.env.local` atau isi direktori `data/` ke repository Git publik.

---

## 3. Persistensi Data & Keamanan Awal (`data/`)

NOCVISION menyimpan state dan kredensial secara persisten pada direktori `data/`:
- `data/noc-state.json` — Inventori perangkat, link topologi, OLT/ONU, BGP peers, snapshots, route filter, dan audit log.
- `data/noc-users.json` — Daftar akun NOC (`passwordHash` berbasis `scrypt`) dan matriks permission RBAC.

Checklist sebelum go-live:
1. Pastikan direktori `data/` memiliki hak akses terbatas ke user service Node.js (`chmod 700 data`).
2. Jadwalkan backup berkala terhadap folder `data/`.
3. Setelah deployment pertama, segera login sebagai `admin` lalu ubah password seluruh akun bawaan (`admin`, `engineer`, `auditor`) melalui menu **Team & RBAC**.

---

## 4. Opsi Deployment

### Opsi A: Build & Jalankan dengan PM2 (Bare-Metal / VM Linux)

```bash
# 1. Install dependencies & build produksi
npm ci
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run build

# 2. Jalankan aplikasi di port 3000 via PM2
pm2 start npm --name "nocvision" -- start
pm2 save
pm2 startup
```

Contoh file `ecosystem.config.cjs` jika ingin lebih terstruktur:

```js
module.exports = {
  apps: [
    {
      name: "nocvision",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      instances: 1, // Wajib 1 instance karena state & rate limiter berbasis local disk/memory
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
```

> Catatan: Gunakan `instances: 1` agar penulisan `data/noc-state.json` dan `data/noc-users.json` tidak mengalami race condition antar-worker.

---

### Opsi B: Docker Container Deployment

Contoh `Dockerfile` untuk server Linux:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache iputils traceroute

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "run", "start"]
```

Jalankan dengan volume persisten agar state perangkat & user aman saat container di-rebuild:

```bash
docker build -t nocvision:latest .
docker run -d \
  --name nocvision \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file .env.local \
  -v $(pwd)/data:/app/data \
  nocvision:latest
```

---

## 5. Reverse Proxy Nginx & HTTPS (TLS)

Disarankan menjalankan NOCVISION di belakang Nginx dengan sertifikat TLS (Let's Encrypt / internal CA). Cookie `omninoc_session` otomatis menambahkan flag `Secure` saat header `X-Forwarded-Proto: https` dikirimkan oleh reverse proxy.

```nginx
server {
    listen 80;
    server_name noc.domainanda.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name noc.domainanda.id;

    ssl_certificate     /etc/letsencrypt/live/noc.domainanda.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/noc.domainanda.id/privkey.pem;

    # Tambahan hardening opsional
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s; # Cukup untuk traceroute & respon NOCAI
    }
}
```

---

## 6. Verifikasi Pasca-Deploy

1. Pastikan halaman `/login` terbuka dengan status `200` dan header keamanan (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`) aktif.
2. Verifikasi `GET /api/noc` tanpa cookie mengembalikan HTTP `401`.
3. Login melalui `/login` dan pastikan dashboard memuat inventori perangkat serta grafik tanpa error konsol.
4. Uji coba satu kali diagnostik ICMP Ping (`Troubleshoot` / `Diagnostics`) dari server produksi.
5. Uji coba **NOCAI** (jika `GEMINI_API_KEY` diisi) untuk memastikan `GET /api/superai` melaporkan `configured: true` dan `source: "env"`.

