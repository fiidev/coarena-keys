# coarena-keys

Ambil API key [coarena.ai](https://coarena.ai) dari banyak akun Google tanpa login satu per satu.

Script memakai sesi Google yang sudah ada di browser lokal, membuka sesi itu di Playwright, lalu membuat dan memverifikasi API key lewat HTTP biasa.

## Cara kerja

1. Baca sesi Google dari browser:
   - **Firefox family** (Zen, Firefox, LibreWolf, Waterfox): impor cookie dari `cookies.sqlite`.
   - **Chromium family** (Chrome, Chromium, Brave, Edge, Vivaldi): pakai salinan profil apa adanya.
2. Pilih akun di halaman Google, selesaikan consent kalau diminta.
3. Ambil sesi coarena, simpan ke `states/<email>.json`.
4. `GET /api/me/keys` -> accept terms kalau perlu -> `POST /api/me/keys` -> verifikasi key.
5. Tulis hasil ke `keys.csv`.

Sesi coarena di `states/` dipakai ulang di run berikutnya, jadi Google hanya disentuh saat sesi itu belum ada atau sudah expired.

## Syarat

- Node.js 22+ (butuh `node:sqlite`)
- Playwright browser: `npx playwright install firefox chromium`
- Browser sumber sudah login Google, dan **dalam keadaan ditutup** saat script jalan (profilnya disalin)

```bash
npm install
npx playwright install firefox chromium
```

## Pemakaian

```bash
# lihat akun yang terdeteksi, tulis accounts.txt
node getkeys.mjs --dry-run --browser firefox

# cek login saja, tidak membuat key
node getkeys.mjs --check

# buat key, tampilkan token di layar
node getkeys.mjs --print
```

### Opsi

| Opsi | Keterangan |
| --- | --- |
| `--browser auto\|firefox\|chromium` | Pilih backend. Default `auto` (deteksi dari isi profil). |
| `--profile <dir>` | Folder profil Firefox, atau user-data-dir Chromium (folder yang berisi `Local State`). |
| `--browser-path <exe>` | Binary Chrome/Chromium/Brave/Edge. Bisa juga lewat env `CHROME_PATH`. |
| `--only <email>` | Proses satu akun saja. |
| `--check` | Login dan cek jumlah key aktif, tanpa membuat key. |
| `--force` | Buat key baru walau sudah punya key aktif (maksimal 10 per akun). |
| `--print` | Tampilkan token di terminal. |
| `--headless` | Tanpa jendela browser. Cocok untuk akun yang sesinya masih hidup. |
| `--out <file>` | File CSV hasil (default `keys.csv`). |

### Kredensial (opsional)

Kalau Google meminta password/OTP, isi `accounts.csv`:

```
email,password,totp_secret_opsional
```

Tanpa file itu, akun yang butuh password akan dilewati dengan status `butuh password`.

## Format hasil

`keys.csv`:

```
email,key_id,token,expires_at,status
```

Token hanya ditampilkan sekali oleh server. Simpan file ini baik-baik.

## Keamanan

File berikut tidak boleh masuk repo (sudah ada di `.gitignore`):

- `keys.csv` - token API aktif
- `states/` - cookie sesi coarena, setara password
- `accounts.csv` - password dan secret TOTP
- `accounts.txt` - daftar email

Kalau salah satu terlanjur ter-commit, anggap bocor: buat key baru dan login ulang.

## Catatan

- Ini memakai endpoint privat coarena, bukan API resmi. Bentuk respons bisa berubah kapan saja.
- Batas per akun: 10 key aktif, jatah gratis harian $5.
- Cookie Google bersifat sekali pakai untuk OAuth. Kalau `states/` expired, akun itu perlu login Google lagi.
- Chromium: cookie yang diimpor manual ditolak Google ("Signed out"). Karena itu jalur Chromium wajib memakai profil asli yang sudah login.
