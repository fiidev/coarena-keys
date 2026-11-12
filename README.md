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
| `--profile <dir>` | Folder profil Zen. Default: profil default di `~/.config/zen/installs.ini`. |
| `--browser-path <exe>` | Binary Zen/Firefox. Bisa juga lewat env `ZEN_PATH`. |
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
- Chrome 136+ memblokir otomasi di profil default, jadi hanya Zen/Firefox yang didukung.
- Riwayat kunjungan ke coarena ikut tercatat di Zen.
