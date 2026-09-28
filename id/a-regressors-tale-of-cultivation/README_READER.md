# Ruang Baca - panduan menjalankan

| Catatan | Pembaca novel lokal yang mengambil isi dari Markdown asli. Tidak ada teks bab, daftar bab, definisi glosarium, atau ringkasan cerita yang ditanam di HTML. |

## Cara utama: buka proyek melalui server lokal

| Catatan | Dari folder yang berisi `index.html`, `NOVEL.md`, dan `serve.mjs`: |

| Catatan | ```bash |
| Catatan | node serve.mjs |
| Catatan | ``` |

| Catatan | Buka alamat yang tercetak: |

| Catatan | ```text |
| Catatan | http://127.0.0.1:4173 |
| Catatan | ``` |

| Catatan | Tidak perlu `npm install`, framework, build, akun, API key, atau koneksi CDN. Gunakan Node.js modern yang mendukung ES modules dan `node:fs/promises`; Node 20 atau lebih baru adalah baseline praktis paket ini. Nomor port alternatif: |

| Catatan | ```bash |
| Catatan | node serve.mjs 8080 |
| Catatan | ``` |

| Catatan | Server hanya mengikat `127.0.0.1` dan hanya melayani GET/HEAD. Ini alat pembaca lokal, bukan server publik yang telah di-hardening untuk deployment internet. Hentikan dengan Ctrl+C. |

## Cara tanpa server

| Catatan | Buka `index.html` dengan browser, kemudian pilih **Pilih ZIP novel** atau **Pilih folder**. ZIP asli yang kamu unggah dapat langsung dipilih. Baca satu novel per impor. |

| Catatan | Dalam mode ini, HTML tidak otomatis membaca berkas tetangganya. Browser memerlukan pilihan berkas secara eksplisit. Data impor adalah snapshot di memori; pilih ulang ZIP/folder setelah reload atau setelah sumber diedit. Progres, catatan, dan preferensi tetap tersimpan jika browser mengizinkan localStorage. |

| Catatan | Semua parsing berjalan lokal. Novel tidak diunggah ke layanan lain. Gambar remote di dalam Markdown tidak dimuat; ditampilkan sebagai placeholder agar tidak ada pelacakan atau ketergantungan jaringan. Tautan eksternal hanya dibuka ketika kamu mengkliknya. |

## File yang penting

| Catatan | ```text |
| Catatan | a-regressors-tale-of-cultivation/ |
| Catatan | index.html |
| Catatan | index.template.html |
| Catatan | NOVEL.md |
| Catatan | STYLE_GUIDE.md |
| Catatan | glossarium.md |
| Catatan | characters.md |
| Catatan | locations.md |
| Catatan | terminology.md |
| Catatan | continuity.md |
| Catatan | chapter-index.md |
| Catatan | qa-log.md |
| Catatan | chapters/ |
| Catatan | recaps/ |
| Catatan | serve.mjs |
| Catatan | build-manifest.mjs |
| Catatan | reader-manifest.json |
| Catatan | README_READER.md |
| Catatan | _reader/ |
| Catatan | RENCANA_READER.md |
| Catatan | AGENT_REFERENCE.md |
| Catatan | TEST_REPORT.md |
| Catatan | scan.mjs |
| Catatan | licenses/ |
| Catatan | src/ |
| Catatan | tests/ |
| Catatan | screenshots/ |
| Catatan | ``` |

| Catatan | `index.html` sudah siap membaca novel dalam paket ini. `index.template.html` berisi engine yang sama dengan kontrak tambahan untuk agent. Keduanya memakai data eksternal, bukan salinan isi novel di JavaScript. |

## Setelah agent menambah atau memperbaiki bab

| Catatan | Pada `node serve.mjs`, manifest dipindai ulang pada setiap permintaan. Muat ulang halaman atau buka **Sumber lokal terhubung > Kembali membaca folder server lokal**. Navigasi dibuat dari berkas yang benar-benar tersedia, bukan hanya dari `chapter-index.md`. |

| Catatan | Pada hosting statis atau server generik, perbarui manifest setelah menambah/menghapus/mengganti nama Markdown: |

| Catatan | ```bash |
| Catatan | node build-manifest.mjs |
| Catatan | ``` |

| Catatan | Manifest hanya menyimpan jalur file, bukan isi cerita. Tetap sertakan seluruh Markdown. Mengubah teks pada file yang jalurnya sama tidak perlu mengubah HTML; refresh akan memuat ulang sumber. Jangan mengandalkan directory listing pada hosting yang menonaktifkannya. |

## Halaman dan fitur

| Halaman | Kegunaan |
|---|---|
| Beranda | Metadata novel, jumlah bab/rekap/istilah, lanjut membaca, progres selesai |
| Daftar bab | Cari nomor/judul, urutkan, filter belum selesai/selesai/penanda/tanpa rekap |
| Baca novel | Prosa bersih, navigasi aktual, posisi otomatis, mode fokus, cetak, rekap, istilah kontekstual |
| Atlas cerita | Glosarium, tokoh, lokasi, teknik/sistem, peta kemunculan bersama dengan bukti bab |
| Jejak cerita | Rekap per bab menurut peristiwa, waktu/tempat, perkembangan, teknik/benda, pertanyaan terbuka |
| Catatan saya | Penanda, kutipan berjangkar, anotasi, edit/hapus, ekspor Markdown, backup JSON |
| Arsip & kualitas | Semua Markdown asli, sumber mentah/terformat, panduan penerjemahan, kontinuitas, QA, masalah data |

| Catatan | Tombol **Aa** membuka tema sistem/kertas/sepia/malam; pilihan font; ukuran; tinggi baris; lebar teks; jarak paragraf/huruf/kata; perataan; ketebalan; dan estimasi kecepatan membaca. Font memakai font sistem, tanpa mengunduh atau membagikan font file. |

| Catatan | Pintasan: **Ctrl/Cmd+K** untuk pencarian; **Alt+panah kiri/kanan** untuk bab sebelumnya/berikutnya saat tidak mengetik; **Esc** untuk menutup dialog atau keluar mode fokus. Teks yang diseleksi dapat disimpan sebagai kutipan. |

## Cara kerja spoiler

| Catatan | Batas awal adalah **bab 0**. Membuka bab, menggulir, atau mencapai bagian bawah tidak otomatis menyatakan kamu selesai. Tekan **Tandai selesai** di akhir bab. Batas otomatis mengikuti bab tersedia yang selesai secara berurutan. Pembaca yang sudah jauh dapat mengatur batas manual pada **Aa > Jaga kejutan ceritanya**. |

| Catatan | Nama/terjemahan istilah ditampilkan sesuai First Seen. **Deskripsi global tidak dianggap aman hanya karena First Seen sudah tercapai.** Profil, glosarium lengkap, kontinuitas, dan catatan kumulatif memerlukan persetujuan tersendiri. Rekap dan catatan akhir bab dapat membuka akhir bab, sehingga ikut diberi batas. |

| Catatan | Judul bab dalam daftar tetap terlihat sebagai metadata navigasi. Catatan pribadi milikmu tidak disembunyikan oleh filter spoiler. Peta koneksi hanya berarti dua nama ditemukan dalam teks bab yang sama; bukan bukti bahwa tokoh bertemu, berteman, atau memiliki hubungan kanonis. |

## Penyimpanan dan cadangan

| Catatan | State tersimpan per judul novel dan bahasa di browser/origin ini, bukan di Markdown. Mode server, mode file, port lain, browser lain, atau lokasi HTML lain dapat memiliki penyimpanan berbeda. Mengganti judul/bahasa novel dapat menghasilkan identitas baru. |

| Catatan | Gunakan **Catatan saya > Ekspor cadangan** untuk JSON progres, penanda, preferensi, dan anotasi. Impor meminta konfirmasi dan menolak identitas novel berbeda. Ekspor tidak menyertakan seluruh teks novel. Menghapus data browser dapat menghapus state; simpan cadangan berkala. |

## Data sumber dalam paket ini

| Catatan | Tersedia **39 Markdown: 16 bab, 14 rekap, dan 9 dokumen pendukung**. Glosarium berisi **58 baris yang dikelompokkan menjadi 55 entri unik**. Rekap bab 9 dan 13 tidak tersedia. Bab 16 ada walaupun belum tercantum dalam indeks. Beberapa tautan sumber tidak valid. Semua masalah ditampilkan di kualitas data; aplikasi tidak memperbaiki naskah diam-diam. |

| Catatan | Semua 39 Markdown asli telah dibandingkan dengan ZIP unggahan dan tetap identik byte demi byte. Pengaturan `.obsidian` tidak diperlukan dan tidak dimasukkan ke paket pembaca. |

## Memakai template untuk novel lain

| Catatan | Salin `index.template.html` sebagai `index.html` ke root novel lain. Salin `serve.mjs`, `build-manifest.mjs`, dan `_reader/scan.mjs` untuk mode server. Alternatifnya, buka HTML lalu pilih folder/ZIP novel lain tanpa menyalin server. |

| Catatan | Ikuti `_reader/AGENT_REFERENCE.md` untuk skema Markdown dan aturan perubahan. Jangan mengisi HTML dengan array bab hardcoded. `_reader/src/` menyediakan bagian source yang lebih mudah diedit agent. Rebuild opsional: |

| Catatan | ```bash |
| Catatan | python3 _reader/src/build_reader.py |
| Catatan | ``` |

| Catatan | Rebuild hanya diperlukan saat mengubah desain/kode, bukan saat menambah bab. |

## Batas yang perlu diketahui

| Catatan | Baseline browser adalah browser desktop/mobile modern dengan native dialog, Unicode regex, `Array.toSorted`, fetch, dan File API. Pengujian dilakukan di Chromium, bukan seluruh browser/perangkat. Batas impor: ZIP 32 MB terkompresi, 6 MB per Markdown, 64 MB hasil ekstraksi, 5.000 Markdown. Untuk koleksi sangat besar, gunakan server dan pertimbangkan lazy loading; versi ini memuat kumpulan Markdown ke memori. |

| Catatan | Frontmatter mendukung scalar sederhana, bukan seluruh YAML. Tak ada OCR, login, scraping, terjemahan otomatis, sinkronisasi cloud, pemulihan rekap hilang, atau inferensi fakta cerita. Laporan pengujian menjelaskan batas lingkungan tes dan tidak mengklaim sertifikasi WCAG atau audit keamanan menyeluruh. |
