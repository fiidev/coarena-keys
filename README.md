# coarena-keys

Ambil API key [coarena.ai](https://coarena.ai) dari banyak akun Google tanpa login satu per satu.

Script membuka **Zen asli dengan profil asli** (yang sudah login Google), lalu untuk tiap email: login coarena lewat Google, pilih akun itu, buat key, logout dari coarena. Akun yang tidak login di Zen di-skip.

Tidak ada cookie yang disalin atau disimpan ke disk, jadi Google tidak melihat "perangkat baru" dan sesi Zen tidak ke-logout.

## Syarat

- Node.js 20+
- Zen Browser (default `/opt/zen-browser-bin/zen-bin`), sudah login semua akun Google yang mau dipakai
- **Zen ditutup** saat script jalan (profil hanya bisa dipakai satu proses)

```bash
npm install
```

## Pemakaian

`accounts.txt` berisi satu email per baris.

```bash
# cek login saja, tidak membuat key
node getkeys.mjs --check

# buat key, tampilkan token di layar
node getkeys.mjs --print
```

### Opsi

| Opsi | Keterangan |
| --- | --- |
| `--browser <nama>` | `zen` (default), `firefox`, `chrome`, `chromium`, `brave`, `edge`, `vivaldi`. |
| `--copy-default` | Chromium family: salin profil default browser (yang sudah login Google) ke profil khusus. Browser harus ditutup. |
| `--setup` | Chromium family: buka profil khusus untuk login Google manual. |
| `--profile <dir>` | Folder profil. Default Zen: `~/.config/zen/installs.ini`. Default Chromium: `~/.config/coarena-keys/<browser>`. |
| `--browser-path <exe>` | Path binary browser. Zen bisa juga lewat env `ZEN_PATH`. |
| `--only <email>` | Proses satu akun saja. |
| `--check` | Login dan cek jumlah key aktif, tanpa membuat key. |
| `--force` | Buat key baru walau sudah punya key aktif (maksimal 10 per akun). |
| `--print` | Tampilkan token di terminal. |
| `--out <file>` | File CSV hasil (default `keys.csv`). |

## Format hasil

`keys.csv`:

```
email,key_id,token,expires_at,status
```

Token hanya ditampilkan sekali oleh server. Simpan file ini baik-baik.

## Keamanan

Jangan commit `keys.csv` dan `accounts.txt` (sudah ada di `.gitignore`).

## Catatan

- Memakai endpoint privat coarena, bukan API resmi. Bentuk respons bisa berubah kapan saja.
- Batas per akun: 10 key aktif.
- Akun coarena yang sedang login di browser dikembalikan di akhir, jadi tidak ke-logout.

## Chromium family (Chrome, Brave, Edge, Chromium, Vivaldi)

Chrome 136+ memblokir otomasi di profil utama, jadi pakai profil khusus (sekali setup):

```bash
# atau pakai login yang sudah ada di profil default (browser ditutup):
node getkeys.mjs --browser brave --copy-default --check

node getkeys.mjs --browser brave --setup   # login semua akun Google, lalu tutup browsernya
node getkeys.mjs --browser brave --print
```
- Riwayat kunjungan ke coarena ikut tercatat di Zen.
