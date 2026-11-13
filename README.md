# coarena-keys

Ambil API key [coarena.ai](https://coarena.ai) dari banyak akun Google secara otomatis tanpa perlu login satu per satu secara manual.

Mendukung **Windows**, **macOS**, dan **Linux** untuk berbagai browser:
- **Zen Browser / Firefox** (langsung pakai profil utama tanpa perlu clone/setup)
- **Chromium Family**: Google Chrome, Brave, Microsoft Edge, Chromium, Vivaldi

---

## 📋 Syarat

1. **Node.js 20+** terpasang di komputermu ([unduh Node.js](https://nodejs.org/)).
2. Browser yang didukung (sudah terpasang dan sudah login ke akun Google).
3. **PENTING: Browser harus DITUTUP** sebelum menjalankan script agar file database/cookie tidak terkunci.

---

## 🚀 Panduan Cepat (Semua OS)

### 1. Install Dependency
Buka terminal (Terminal di Mac/Linux, atau Command Prompt / PowerShell di Windows):
```bash
npm install
```

### 2. Siapkan Daftar Akun
Buat file `accounts.txt` di folder project ini, lalu isi dengan email akun Google-mu (satu email per baris):
```text
emailpertama@gmail.com
emailkedua@gmail.com
emailketiga@gmail.com
```

### 3. Jalankan Script Sesuai Browser

#### A. Jika Memakai Chrome / Brave / Edge (Chromium Family)
Karena Chrome memiliki sistem keamanan baru, ada dua cara:

* **Cara 1: Pakai Login yang Sudah Ada di Browser (Rekomendasi)**
  1. Pastikan browser sudah ditutup rapat.
  2. Salin profil dan cek koneksi:
     ```bash
     node getkeys.mjs --browser chrome --copy-default --check
     ```
  3. Cetak dan simpan API Key:
     ```bash
     node getkeys.mjs --browser chrome --print
     ```

* **Cara 2: Setup Profil Khusus (Jika cara 1 tidak mendeteksi akun)**
  1. Buka jendela setup khusus:
     ```bash
     node getkeys.mjs --browser chrome --setup
     ```
  2. Login ke akun-akun Google-mu di jendela browser yang terbuka, lalu **tutup** browsernya.
  3. Cetak API Key:
     ```bash
     node getkeys.mjs --browser chrome --print
     ```

#### B. Jika Memakai Zen Browser / Firefox
Tutup Zen/Firefox, lalu langsung jalankan:
```bash
# Cek akun yang aktif
node getkeys.mjs --browser zen --check

# Cetak dan simpan API Key
node getkeys.mjs --browser zen --print
```

---

### 🛡️ Fitur Keamanan: Backup & Restore Sesi/Tabs Otomatis
Sebelum script otomasi berjalan atau menyentuh profil browser apapun (Zen, Chrome, Brave, Edge, Firefox), script akan **otomatis mencadangkan (backup) seluruh tab, workspace, dan sesi** ke folder `~/.browser-backups/<browser>/<timestamp>`.

Jika sewaktu-waktu jendela atau tab kamu tertutup / hilang, cukup pulihkan dengan 1 perintah:
```bash
# Untuk Zen Browser:
node restore-session.mjs --browser zen
# atau
node getkeys.mjs --browser zen --restore

# Untuk Chrome / Brave / Edge / Firefox:
node restore-session.mjs --browser chrome
```

---

## 💻 Panduan Khusus per Sistem Operasi

Script ini sudah dibuat 100% otomatis mendeteksi lokasi file dan browser di masing-masing OS:

### 🪟 Windows
- **Terminal:** Gunakan PowerShell, Windows Terminal, atau Command Prompt (CMD).
- **Deteksi Browser Otomatis:**
  - Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe` atau `%LOCALAPPDATA%`
  - Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
  - Brave: `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`
  - Zen: `C:\Program Files\Zen Browser\zen.exe`
- **Profil Default:** Dibaca otomatis dari `%LOCALAPPDATA%` (Chrome/Edge/Brave) dan `%APPDATA%\zen` (Zen).

### 🍎 macOS
- **Terminal:** Gunakan Terminal bawaan atau iTerm2.
- **Deteksi Browser Otomatis:**
  - Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - Brave: `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`
  - Edge: `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`
  - Zen: `/Applications/Zen Browser.app/Contents/MacOS/zen-bin`
- **Profil Default:** Dibaca otomatis dari `~/Library/Application Support/`.

### 🐧 Linux
- **Terminal:** Bash, Zsh, dll.
- **Deteksi Browser Otomatis:** Otomatis mencari di `$PATH`, `/usr/bin/`, dan `/opt/`.
- **Profil Default:** Dibaca otomatis dari `~/.config/`.

---

## ⚙️ Daftar Opsi Lengkap

| Opsi | Keterangan |
| --- | --- |
| `--browser <nama>` | Pilihan browser: `zen` (default), `chrome`, `brave`, `edge`, `chromium`, `vivaldi`, `firefox`. |
| `--copy-default` | Salin data profil bawaan browser ke folder kerja tools ini. (Browser wajib ditutup). |
| `--setup` | Membuka jendela browser khusus tanpa otomasi untuk login Google manual sekali saja. |
| `--only <email>` | Hanya proses satu akun email tertentu, contoh: `--only user@gmail.com`. |
| `--check` | Cek status login dan jumlah key yang aktif tanpa membuat key baru. |
| `--print` | Tampilkan token API key langsung di terminal. |
| `--force` | Tetap buat key baru meskipun akun sudah memiliki key aktif (maks 10 key per akun). |
| `--profile-dir <nama>` | Pilih profil tertentu secara manual (misal `Profile 3`). Otomatis terdeteksi jika tidak diisi. |
| `--browser-path <path>` | Tentukan lokasi executable browser secara manual jika terpasang di lokasi non-standar. |
| `--out <file>` | Nama file CSV hasil penyimpanan (default: `keys.csv`). |

---

## 📄 Format Hasil (`keys.csv`)

File `keys.csv` akan otomatis dibuat/ditambahkan dengan format:
```csv
email,key_id,token,expires_at,status
```
*Catatan: Token hanya diberikan satu kali oleh server CoArena. File `keys.csv` dan `accounts.txt` sudah dimasukkan ke `.gitignore` agar tidak bocor ke publik.*
