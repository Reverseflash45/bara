import dataBara from "./data/bara.json";
import dataDaerah from "./data/daerah.json";

export type Daerah = (typeof dataDaerah.daerah)[number];
export const DAERAH: readonly Daerah[] = dataDaerah.daerah;

export type Busur = "sumatra" | "jawa" | "nusa-tenggara" | "banda" | "sangihe" | "halmahera";
export const NAMA_BUSUR: Record<Busur, string> = {
  sumatra: "Sumatra",
  jawa: "Jawa",
  "nusa-tenggara": "Bali & Nusa Tenggara",
  banda: "Laut Banda",
  sangihe: "Sulawesi Utara",
  halmahera: "Halmahera",
};

/**
 * Satu letusan pasti. `vei` null = tidak diketahui; `ragu` = VEI hanya perkiraan kasar ("?" di GVP);
 * `berlanjut` = masih berlangsung saat data GVP terakhir diperbarui (lihat MUTAKHIR).
 */
export type Letusan = {
  g: number;
  tahun: number;
  bulan: number; // 0 = tidak diketahui
  hari: number; // 0 = tidak diketahui
  akhir: number | null;
  vei: number | null;
  ragu: boolean;
  berlanjut: boolean;
};

export type Gunung = {
  i: number;
  id: number;
  nama: string;
  gvp: string;
  lat: number;
  lon: number;
  tinggi: number;
  tipe: string;
  busur: Busur;
  daerah: Daerah;
  diDarat: boolean;
  letusan: Letusan[]; // urut waktu
};

export const DIBANGUN = dataBara.dibangun;
/** Tanggal pembaruan terakhir catatan GVP (tanggal akhir terbaru di data). */
export const MUTAKHIR = dataBara.mutakhir;
export const TAHUN_AWAL = 1500;

export const LETUSAN: readonly Letusan[] = dataBara.letusan.map(([g, tahun, bulan, hari, akhir, vei, ragu, berlanjut]) => ({
  g: g as number,
  tahun: tahun as number,
  bulan: bulan as number,
  hari: hari as number,
  akhir: akhir as number | null,
  vei: vei as number | null,
  ragu: ragu === 1,
  berlanjut: berlanjut === 1,
}));

/** Letusan yang masih berlangsung, yang paling lama dulu. */
export const MASIH_ERUPSI: readonly Letusan[] = LETUSAN.filter((e) => e.berlanjut);

export const GUNUNG: readonly Gunung[] = dataBara.gunung.map((g, i) => ({
  ...g,
  i,
  busur: g.busur as Busur,
  daerah: DAERAH[g.daerah],
  letusan: LETUSAN.filter((e) => e.g === i),
}));

/* ---------- ringkasan per gunung ---------- */
export const sejak = (daftar: readonly Letusan[], tahun = TAHUN_AWAL) => daftar.filter((e) => e.tahun >= tahun);

/** Letusan terakhir = yang mulainya paling akhir. */
export const terakhir = (g: Gunung): Letusan | null => g.letusan.at(-1) ?? null;

/**
 * Letusan terbesar: VEI tertinggi; kalau seri, yang VEI-nya pasti didahulukan, lalu yang lebih baru
 * (catatan baru lebih bisa dipercaya).
 */
export function terbesar(daftar: readonly Letusan[]): Letusan | null {
  const banding = (a: Letusan, b: Letusan) => a.vei! - b.vei! || Number(b.ragu) - Number(a.ragu) || a.tahun - b.tahun;
  let hasil: Letusan | null = null;
  for (const e of daftar) if (e.vei != null && (!hasil || banding(e, hasil) >= 0)) hasil = e;
  return hasil;
}

export type Kelas = "baru" | "abad20" | "lama" | "tidak";
/** Kelas waktu letusan terakhir, dipakai untuk warna peta. */
export function kelasTerakhir(g: Gunung): Kelas {
  const t = terakhir(g)?.tahun;
  if (t == null || t < TAHUN_AWAL) return "tidak";
  return t >= 2000 ? "baru" : t >= 1900 ? "abad20" : "lama";
}
export const NAMA_KELAS: Record<Kelas, string> = {
  baru: "Sejak 2000",
  abad20: "1900–1999",
  lama: "1500–1899",
  tidak: "Tidak ada sejak 1500",
};

/* ---------- jarak & arah ---------- */
const R_BUMI_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
export function jarakKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Arah mata angin dari titik 1 ke titik 2 (azimut awal, delapan arah). */
export function arah(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  const derajat = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"][Math.round(derajat / 45) % 8];
}

export type GunungDekat = Gunung & { jarak: number; arah: string };

/** Semua gunung api diurutkan dari yang terdekat ke titik tengah daerah. */
export function terdekat(d: Daerah): GunungDekat[] {
  const [lon, lat] = d.titik;
  return GUNUNG.map((g) => ({ ...g, jarak: jarakKm(lat, lon, g.lat, g.lon), arah: arah(lat, lon, g.lat, g.lon) })).sort((a, b) => a.jarak - b.jarak);
}

/* ---------- ringkasan nasional ---------- */
/** Jumlah letusan per VEI sejak tahun tertentu; indeks 0–7, lalu 8 = tidak diketahui. */
export function perVei(daftar: readonly Letusan[]): number[] {
  const n = Array(9).fill(0);
  for (const e of daftar) n[e.vei ?? 8]++;
  return n;
}

/** Contoh paling baru untuk tiap VEI yang nilainya pasti. */
export function contohVei(daftar: readonly Letusan[], vei: number): Letusan | null {
  for (let i = daftar.length - 1; i >= 0; i--) if (daftar[i].vei === vei && !daftar[i].ragu) return daftar[i];
  return null;
}

export function palingAktif(n: number, tahun = TAHUN_AWAL): { g: Gunung; n: number }[] {
  return GUNUNG.map((g) => ({ g, n: sejak(g.letusan, tahun).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.g.nama.localeCompare(b.g.nama))
    .slice(0, n);
}

/* ---------- teks ---------- */
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const teksTahun = (t: number) => (t < 0 ? `${-t} SM` : String(t));
export function teksTanggal(e: Letusan): string {
  const th = teksTahun(e.tahun);
  if (!e.bulan) return th;
  return e.hari ? `${e.hari} ${BULAN[e.bulan - 1]} ${th}` : `${BULAN[e.bulan - 1]} ${th}`;
}
/** "1812–1815" kalau letusan berlangsung lintas tahun, "2020–kini" kalau masih berlangsung. */
export const teksRentang = (e: Letusan) =>
  e.berlanjut ? `${teksTahun(e.tahun)}–kini` : e.akhir != null && e.akhir > e.tahun ? `${teksTahun(e.tahun)}–${e.akhir}` : teksTahun(e.tahun);
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "25 Maret 2026" dari "2026-03-25". */
export const teksIso = (iso: string) => {
  const [t, b, h] = iso.split("-").map(Number);
  return `${h} ${BULAN_PANJANG[b - 1]} ${t}`;
};
export const teksVei = (e: Letusan) => (e.vei == null ? "VEI tidak diketahui" : `VEI ${e.vei}${e.ragu ? " (perkiraan)" : ""}`);

const TIPE: Record<string, string> = {
  Stratovolcano: "Stratovolkano",
  "Stratovolcano(es)": "Stratovolkano (lebih dari satu)",
  "Stratovolcano?": "Kemungkinan stratovolkano",
  Complex: "Kompleks gunung api",
  Caldera: "Kaldera",
  "Caldera(s)": "Kaldera",
  "Lava dome(s)": "Kubah lava",
  "Pyroclastic cone(s)": "Kerucut piroklastik",
};
export const teksTipe = (t: string) => TIPE[t] ?? t;

export const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(kabupaten|kab\.?|kota)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Cari kabupaten/kota: awalan nama dulu, lalu yang mengandung kata kunci. */
export function cariDaerah(q: string, batas = 8): Daerah[] {
  const k = normal(q);
  if (!k) return [];
  const nilai = (d: Daerah) => {
    const n = normal(d.nama);
    return n === k ? 0 : n.startsWith(k) ? 1 : n.includes(k) ? 2 : normal(d.prov).includes(k) ? 3 : 9;
  };
  return DAERAH.map((d) => [d, nilai(d)] as const)
    .filter(([, v]) => v < 9)
    .sort((a, b) => a[1] - b[1] || a[0].nama.localeCompare(b[0].nama))
    .slice(0, batas)
    .map(([d]) => d);
}
