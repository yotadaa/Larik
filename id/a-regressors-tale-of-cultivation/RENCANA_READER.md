# Rencana implementasi: Ruang Baca

| Catatan | Status dokumen: disusun setelah riset dan inspeksi arsip, sebelum implementasi UI. |
| Catatan | Target: `index.html` untuk novel yang diunggah dan `index.template.html` untuk novel lain dengan struktur Markdown serupa. |

## 1. Tujuan dan batasan

| Catatan | Buat pembaca novel yang berorientasi pada kegiatan membaca, bukan dashboard yang mengganggu cerita. Semua isi novel, judul bab, rekap, entitas, istilah, panduan, dan catatan mutu berasal dari berkas sumber. HTML boleh memiliki konfigurasi presentasi dan label antarmuka, tetapi tidak boleh menyimpan salinan hardcoded dari cerita. |

| Catatan | Gunakan Bahasa Indonesia untuk UI. Jangan mengarang sinopsis, penulis, hubungan tokoh, urutan tingkat kultivasi, atau bab yang tidak ada. Jangan mengubah Markdown sumber untuk menutupi ketidakkonsistenan. Tampilkan provenance dan keadaan data yang sebenarnya. |

## 2. Temuan sumber yang memengaruhi desain

| Catatan | Arsip memiliki 39 Markdown: 16 bab (1-16), 14 rekap, dan 9 dokumen pendukung. Konfigurasi `.obsidian/` bukan konten novel dan diabaikan aplikasi. |

| Catatan | `NOVEL.md` menyebut cakupan 1-100, tetapi yang tersedia hanya 16 bab. Angka 100 bukan jumlah bab yang dapat dibaca. |
| Catatan | `chapter-index.md` baru mencantumkan 1-15. Bab 16 harus ditemukan lewat inventaris berkas. |
| Catatan | Rekap bab 9 memang berstatus Pending. Tautan rekap bab 13 ada di indeks, tetapi berkasnya tidak ada. |
| Catatan | Ada navigasi ke nama sementara seperti `015-untitled.md` dan `017-untitled.md`. Navigasi aplikasi harus dihitung dari bab yang benar-benar tersedia. |
| Catatan | Glosarium berformat tabel, sementara karakter, lokasi, terminologi, kontinuitas, dan QA banyak berupa bullet. Parser harus mendukung kedua bentuk. |
| Catatan | Catatan di akhir bab menggunakan heading campuran Indonesia/Inggris. Catatan ini dipisahkan dari prosa, bukan dibuang. |
| Catatan | `First Seen` pada glosarium memberi waktu kemunculan istilah, bukan waktu penulisan seluruh deskripsinya. Deskripsi global berpotensi membocorkan bab mendatang. |

## 3. Dasar riset dan keputusan UX

### Membaca sebagai aktivitas utama

| Catatan | NN/g menjelaskan manfaat struktur yang jelas dan pemisahan ringkasan dalam konten panjang. Terapkan pada indeks, arsip, dan rekap. Jangan menerapkan teknik pemindaian secara berlebihan ke prosa novel: tidak menyisipkan ringkasan atau menebalkan narasi secara otomatis. |
| Catatan | Sumber: https://www.nngroup.com/articles/formatting-long-form-content/ |

### Tipografi yang dapat disesuaikan

| Catatan | Studi font yang dibahas NN/g tidak menemukan satu font terbaik untuk semua orang; studi tersebut bukan pengujian buku panjang. Karena itu gunakan default yang masuk akal dan pilihan font untuk kenyamanan, tanpa klaim bahwa pilihan pengguna pasti meningkatkan kecepatan membaca. |
| Catatan | Sumber: https://www.nngroup.com/articles/best-font-for-online-reading/ |

| Catatan | Default: serif sekitar 20 px, line-height 1.85, kolom sekitar 700 px, rata kiri. Sediakan pilihan serif/sans/mono, ukuran, panjang baris, spasi paragraf, huruf, dan kata. Pengaturan harus langsung terlihat dan tidak mengembalikan pembaca ke awal bab. |

### Tema mengikuti konteks pengguna

| Catatan | Gunakan `prefers-color-scheme` sebagai default sistem, dengan pilihan kertas, sepia, dan malam. Tidak mengklaim bahwa dark mode pasti lebih sehat. Semua elemen, batas panel, fokus, dan ilustrasi diuji pada kedua polaritas. |
| Catatan | Sumber: https://www.nngroup.com/articles/dark-mode-users-issues/ |

### Aksesibilitas sebagai syarat desain

| Catatan | Target kontras teks biasa minimal 4.5:1 dan teks besar 3:1. Dukung reflow pada lebar 320 CSS px. Jangan memotong teks ketika spasi diperbesar. Target tombol utama sekitar 44 px; WCAG 2.2 AA memiliki ketentuan target minimum 24 px dengan pengecualian, bukan selalu 44 px. |
| Catatan | Sumber: |
| Catatan | https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html |
| Catatan | https://www.w3.org/WAI/WCAG22/Understanding/reflow.html |
| Catatan | https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html |
| Catatan | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html |

| Catatan | Modal memakai fokus terkurung, Escape, label yang jelas, dan pengembalian fokus. Hormati `prefers-reduced-motion` dan sediakan skip link. |
| Catatan | Sumber: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ |

### Tidak mengandalkan fetch file lokal

| Catatan | Browser membatasi akses `file://` lewat fetch. Sediakan dua jalur: server lokal untuk pembacaan Markdown langsung, serta pemilih folder/ZIP untuk pembukaan HTML tanpa server. Impor dilakukan lokal, tanpa unggahan ke layanan lain. |
| Catatan | Sumber: |
| Catatan | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp |
| Catatan | https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath |

### Markdown tidak dipercaya sebagai HTML aman

| Catatan | Render Markdown dengan Marked, lalu sanitasi dengan DOMPurify. Marked sendiri tidak melakukan sanitasi. Nonaktifkan HTML aktif, URL JavaScript, iframe, dan pemuatan gambar eksternal dari naskah. ZIP diurai memakai fflate dengan pemeriksaan ukuran, jalur, dan jumlah berkas. |
| Catatan | Sumber: |
| Catatan | https://marked.js.org/ |
| Catatan | https://github.com/cure53/DOMPurify |
| Catatan | https://github.com/101arrowz/fflate |

## 4. Arah visual

| Catatan | Konsep: ruang baca editorial dengan nuansa tinta, kertas, dan lanskap pegunungan. Sidebar hijau hutan, permukaan hangat, serif besar untuk judul, sans-serif untuk kontrol, serta aksen tanah liat secukupnya. |

| Catatan | Ilustrasi vektor pegunungan hanya pada pembuka, bukan di tengah paragraf. Tidak memakai cover palsu atau gambar yang seolah-olah bagian dari kanon. Labelnya ilustrasi dekoratif. Tidak memuat font, gambar, analitik, atau CDN saat runtime. Gunakan font sistem; hasil rupa font dapat berbeda antar-OS. |

| Catatan | Desktop: sidebar tetap, header ringkas, konten utama lapang. Mobile: navigasi ringkas/drawer, kontrol sentuh jelas, prosa satu kolom. Mode fokus menyembunyikan dekorasi dan navigasi non-esensial. |

## 5. Arsitektur informasi

| Halaman | Data | Manfaat |
|---|---|---|
| Beranda | NOVEL, inventaris bab, progres lokal | Identitas novel, statistik yang benar, lanjut membaca |
| Daftar bab | inventaris + chapter-index + frontmatter | Cari, urutkan, filter, indikator rekap/baca/penanda |
| Pembaca | chapter Markdown + catatan + istilah | Prosa bersih, progres, prev/next valid, konteks opsional |
| Atlas cerita | glossarium, characters, locations, terminology | Cari istilah, profil, sistem, dan peta kemunculan bersama |
| Jejak cerita | recaps + continuity | Rekap per bab, waktu/lokasi, perkembangan, pertanyaan terbuka |
| Catatan saya | state lokal milik pembaca | Bookmark, kutipan, anotasi, ekspor/impor cadangan |
| Arsip & kualitas | seluruh Markdown + pemeriksaan lintas berkas | Sumber asli, gaya terjemahan, QA, diagnosis data |

## 6. Kontrak data dan penemuan berkas

| Catatan | 1. HTTP mode: baca `reader-manifest.json`, kemudian fetch Markdown yang tercantum. Manifest berisi jalur, bukan salinan isi cerita. |
| Catatan | 2. `serve.mjs` menghasilkan inventaris secara dinamis saat diminta. Bab baru muncul setelah refresh tanpa mengedit HTML. |
| Catatan | 3. Static hosting: gunakan manifest yang disertakan; jalankan `node build-manifest.mjs` setelah menambah atau menghapus Markdown. |
| Catatan | 4. Fallback tanpa manifest: gabungkan tautan `chapter-index.md`, dokumen standar, dan directory listing jika server menyediakannya. Beri peringatan bahwa berkas tanpa tautan mungkin tidak terdeteksi. |
| Catatan | 5. Import mode: pindai semua Markdown dari folder/ZIP yang dipilih. Hilangkan root folder bersama; tolak ZIP berisi beberapa proyek ambigu dan minta memilih satu folder novel. |
| Catatan | 6. Parse metadata YAML sederhana yang dipakai sumber; jangan mengklaim sebagai parser YAML penuh. Fallback ke heading dan angka filename. |
| Catatan | 7. Gabungkan bab menurut path/nomor, urutkan numerik, laporkan nomor duplikat. Hitung navigasi dari himpunan bab valid, bukan `next` yang rusak. |
| Catatan | 8. Indeks bab adalah sumber tambahan, bukan satu-satunya daftar. Tolak path keluar root dan URL eksternal sebagai sumber data. |
| Catatan | 9. Simpan berkas asli dalam memory provider; parser menghasilkan model turunan tanpa menulis ke berkas. |

## 7. Pengendalian spoiler

| Catatan | Default: hanya rekap sampai bab yang ditandai selesai secara berurutan. Pembaca dapat menetapkan sendiri batas bab yang sudah dibaca. Membuka/scroll bab tidak otomatis berarti selesai. |

| Catatan | Nama istilah hanya muncul pada atlas jika `First Seen` sudah melewati batas aman, atau istilah memang tampak dalam bab yang sedang dibuka. |
| Catatan | Deskripsi global tanpa penanggalan per fakta tetap ditutup, meskipun istilah sudah pernah muncul. |
| Catatan | Profil tokoh, lokasi, kontinuitas kumulatif, dan catatan sistem yang tidak bertanggal membutuhkan konfirmasi buka spoiler. |
| Catatan | Rekap ditampilkan sebagai snapshot babnya, dengan tautan sumber. Bab yang rekapnya hilang memiliki empty state, bukan ringkasan buatan. |
| Catatan | Pencarian default tidak mengindeks potongan bab/rekap di atas batas aman. Pencarian seluruh cerita memerlukan tindakan eksplisit. |
| Catatan | Peta koneksi menunjukkan kemunculan nama pada bab yang sama, bukan hubungan sosial atau aliansi kanonis. Setiap sisi memiliki daftar bab bukti; berikan daftar tekstual yang ekuivalen. |

| Catatan | Batas ini konservatif, bukan jaminan otomatis bahwa semua catatan sumber bebas spoiler. Pembaca selalu dapat mengakses sumber asli dengan konfirmasi. |

## 8. Fitur pembaca

| Catatan | Navigasi hash tanpa build tool; back/forward browser bekerja. |
| Catatan | Simpan posisi per bab, menggunakan anchor paragraf dan fallback fraksi scroll. |
| Catatan | Tombol mulai/lanjut, sebelumnya/berikutnya, tandai selesai, bookmark. |
| Catatan | Progres baca lokal dan perkiraan durasi berdasarkan jumlah kata serta WPM yang dapat diubah; bukan janji durasi. |
| Catatan | Mode fokus, cetak bab aktif, pencarian dalam koleksi, kutipan dari seleksi teks. |
| Catatan | Catatan pribadi terkait bab/paragraf; dapat diekspor/impor sebagai JSON yang divalidasi. |
| Catatan | Tema, font, tipografi, dan preferensi tersimpan lokal. Kegagalan storage tidak boleh mematikan pembaca; tampilkan peringatan bahwa sesi tidak persisten. |
| Catatan | Berkas sumber dan naskah selalu read-only. |

## 9. Strategi penyimpanan dan privasi

| Catatan | Gunakan localStorage untuk preferensi/progres/penanda/catatan; pisahkan key per identitas novel dan bahasa. Impor data novel disimpan di memory selama halaman terbuka; untuk sesi berikutnya pengguna dapat memilih ulang ZIP/folder. Hindari menyembunyikan fakta bahwa file import tidak tersinkron otomatis. |

| Catatan | Ekspor JSON adalah cadangan pembaca, bukan perubahan naskah. Impor hanya menerima field yang diizinkan dan identitas novel yang cocok. Tidak ada akun, backend cloud, analytics, scraping, atau pengiriman konten novel. |

## 10. Rencana implementasi berurutan

### Tahap A: fondasi data

| Catatan | Buat manifest, server lokal tanpa dependency, importer folder/ZIP, parser Markdown/frontmatter, registri bab, pengelompokan glosarium, pemisahan catatan, dan audit data. |

### Tahap B: kerangka dan tampilan

| Catatan | Buat tokens, layout responsif, router, sidebar/header/dialog, ilustrasi dekoratif, home, dan daftar bab. |

### Tahap C: pengalaman membaca

| Catatan | Buat prose renderer aman, navigasi, pengaturan langsung, resume, bookmarks, catatan, pencarian, focus mode, dan print CSS. |

### Tahap D: pemanfaatan Markdown pendukung

| Catatan | Buat atlas, graph co-occurrence beserta bukti, timeline rekap per kategori, continuity, source viewer, dan quality dashboard. Tambahkan batas spoiler pada setiap jalur akses. |

### Tahap E: template dan handoff

| Catatan | Hasilkan `index.html` serta `index.template.html` dari mesin yang sama. Perbedaannya hanya konfigurasi presentasi/penemuan data, bukan isi cerita. Dokumentasikan kontrak bagi agent. |

### Tahap F: pengujian

| Catatan | Uji dengan browser nyata: startup, 16 bab terdeteksi, missing recap, navigasi rusak dipulihkan, Markdown tidak terpotong, mobile 320/390 px, desktop, tema, pengaturan, keyboard, search, notes, backup, ZIP/folder import, template novel sintetis, dan XSS payload. Simpan screenshot dan hasil tes yang benar-benar dijalankan. Jangan menyatakan audit aksesibilitas menyeluruh atau user testing manusia jika tidak dilakukan. |

## 11. Deliverable

| Catatan | `index.html`: aplikasi untuk diletakkan sejajar dengan NOVEL.md di folder novel pengguna. |
| Catatan | `index.template.html`: engine generik lengkap, tanpa judul atau isi novel hardcoded. |
| Catatan | ZIP siap pakai: 39 Markdown asli, HTML, manifest, `serve.mjs`, `build-manifest.mjs`, README, rencana, referensi agent, dan lisensi dependency. |
| Catatan | Screenshot hasil browser dan laporan pengujian. |

## 12. Kriteria penerimaan

| Catatan | 1. Mengubah Markdown atau menambah bab melalui jalur discovery yang didukung tidak membutuhkan perubahan komponen UI. |
| Catatan | 2. Semua 39 Markdown dapat dijangkau melalui UI sumber; tidak ada `.obsidian` yang diperlakukan sebagai cerita. |
| Catatan | 3. Bab 16 dapat dibaca walaupun belum tercantum dalam indeks. |
| Catatan | 4. Rekap bab 9/13 tidak diada-adakan. Navigasi akhir bab tidak menuju bab 17 yang belum tersedia. |
| Catatan | 5. Isi prosa tidak tercampur YAML, menu indeks lama, atau catatan penerjemah. |
| Catatan | 6. Fitur utama tetap bekerja pada tampilan sempit dan lewat keyboard. |
| Catatan | 7. UI jujur tentang batas spoiler, sumber, kekurangan data, dan state lokal. |
| Catatan | 8. Tidak ada dependency jaringan saat runtime setelah HTML dan Markdown tersedia lokal. |


## 13. Catatan implementasi setelah rencana

| Catatan | Rencana di atas dibuat sebelum implementasi. Saat pembangunan, unduhan dependency dari registry tidak tersedia pada lingkungan kerja. Implementasi final menggunakan salinan lokal **Marked 4.0.19** dan **JSZip 3.10.1**, dibundel inline. **DOMPurify dan fflate tidak dipakai.** Sebagai pengganti sanitasi, output Markdown diparse pada DOM inert lalu direkonstruksi melalui allowlist elemen/atribut; HTML mentah, event handler, protokol berbahaya, dan gambar remote tidak dijalankan. |

| Catatan | Ini tidak diklaim setara dengan audit keamanan menyeluruh atau dependency terbaru. Referensi agent mewajibkan review dependency dan regression test sebelum deployment publik. |

| Catatan | Paket juga menyertakan source modular dan rebuild script opsional agar agent tidak perlu mengedit blok vendor di HTML. Jalur runtime tetap tanpa build step. Rencana dan referensi riset tidak dianggap fakta novel. |

| Catatan | Browser Chromium di lingkungan pengujian menerapkan kebijakan yang memblokir navigasi URL. Karena itu aplikasi dieksekusi dalam browser dengan fixture respons berkas lokal, sedangkan server HTTP nyata diuji terpisah. Tidak ada pengubahan kebijakan browser. Laporan tes membedakan kedua cakupan tersebut, serta tidak mengklaim user testing manusia atau validasi lintas-browser. |
