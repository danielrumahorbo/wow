# RADAR KGB Command Center

Website ini berisi 2 dashboard dalam 1 domain Vercel:

- `/` atau `/mapping.html` = **Mercator**, dashboard mapping kawasan padat penduduk berbasis titik Sekretariat RT/RW untuk prioritas akuisisi New CIF.
- `/livin.html` = **Treatrix**, dashboard klasifikasi merchant LVM KGB menjadi WINNER, WATCH, dan DROP.

## Data yang sudah diproses

### Mercator
Sumber data asli:
- sekre rt depok.xlsx
- sekre rt jakarta 1.xlsx
- sekre rt jakarta 2.xlsx
- sekretariat rt kelapa gading.xlsx

Hasil processing:
- 81 baris input scraping
- 63 lokasi unik setelah deduplikasi
- 18 data duplikat dihapus
- Data aktif saat ini: Jakarta dan Depok
- Filter Tangerang dan Bekasi disediakan untuk ekspansi data berikutnya

Metode deduplikasi: Google Place ID dari URL Google Maps, fallback koordinat + nama lokasi.

### Treatrix
Sumber data asli:
- Data LVM KGB.xlsx

Hasil processing:
- 280 merchant LVM KGB
- WINNER: 69
- WATCH: 120
- DROP: 91

Metode scoring Treatrix:
- SV 30D
- Freq 30D
- Status transaksi
- Status rekening

Promo dan kuota tidak digunakan dalam scoring karena merupakan kebijakan manual cabang.

## Deploy Vercel

Framework Preset: Vite  
Install Command: `npm install --package-lock=false --no-audit --no-fund`  
Build Command: `npm run build`  
Output Directory: `dist`  
Root Directory: kosongkan jika file project berada langsung di root GitHub.

Jangan upload folder `node_modules/`, `dist/`, `.env`, atau `.env.local`.
