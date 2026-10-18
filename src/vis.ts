import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";
import { geoCircle, geoMercator, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import {
  type Daerah,
  type Gunung,
  type GunungDekat,
  type Kelas,
  type Letusan,
  GUNUNG,
  MASIH_ERUPSI,
  MUTAKHIR,
  NAMA_BUSUR,
  TAHUN_AWAL,
  kelasTerakhir,
  sejak,
  teksRentang,
  teksTanggal,
  teksVei,
} from "./data";

/* ---------- umum ---------- */
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const angka = (n: number) => n.toLocaleString("id-ID");
const TAHUN_AKHIR = new Date().getUTCFullYear() + 1;
/** Tanggal pembaruan data GVP sebagai tahun pecahan: ujung garis letusan yang masih berlangsung. */
const [thM, blnM] = MUTAKHIR.split("-").map(Number);
const TAHUN_MUTAKHIR = thM + (blnM - 0.5) / 12;
const GUNUNG_ERUPSI = new Set(MASIH_ERUPSI.map((e) => e.g));
/** Ujung letusan dalam tahun pecahan, atau null kalau tidak lintas tahun. */
const ujung = (e: Letusan) => (e.berlanjut ? TAHUN_MUTAKHIR : e.akhir != null && e.akhir > e.tahun ? e.akhir + 0.5 : null);

/** Posisi letusan dalam tahun pecahan (bulan tak diketahui = tengah tahun). */
const tahunPecahan = (e: Letusan) => e.tahun + (e.bulan ? (e.bulan - 0.5) / 12 : 0.5);

/** Jari-jari titik menurut VEI. VEI tak diketahui digambar kecil berongga. */
export const jariVei = (vei: number | null, skala = 1) => (vei == null ? 1.8 : [1.6, 1.8, 2.3, 3.1, 4.4, 6.2, 8.4, 10.8][vei]) * skala;

export const varKelas = (k: Kelas) => `var(--kelas-${k})`;

function buatTip(wadah: HTMLElement) {
  const el = document.createElement("div");
  el.className = "tip";
  el.hidden = true;
  wadah.append(el);
  return {
    tampil(x: number, y: number, html: string) {
      el.innerHTML = html;
      el.hidden = false;
      const w = el.offsetWidth;
      const kiri = x + 14 + w > wadah.clientWidth ? x - 14 - w : x + 14;
      el.style.left = `${Math.max(0, kiri)}px`;
      el.style.top = `${Math.max(0, y - el.offsetHeight - 10)}px`;
    },
    sembunyi() {
      el.hidden = true;
    },
  };
}

export function isiTipLetusan(e: Letusan): string {
  const g = GUNUNG[e.g];
  const waktu = e.berlanjut ? `Mulai ${teksTanggal(e)}, masih berlangsung` : e.akhir != null && e.akhir > e.tahun ? `${teksRentang(e)}, mulai ${teksTanggal(e)}` : teksTanggal(e);
  return `<b>${esc(g.nama)}</b> <span class="redup">${esc(g.daerah.prov)}</span><br>${waktu}<br><span class="redup">${teksVei(e)}</span>`;
}

/* ---------- garis waktu letusan (pembuka) ---------- */
export function gambarGarisWaktu(wadah: HTMLElement, legenda: HTMLElement): void {
  const lebar = Math.max(320, wadah.clientWidth);
  const hp = lebar < 600;
  const tepiKiri = hp ? 4 : 132;
  const tinggiBaris = hp ? 6 : 8;
  const celah = hp ? 18 : 10;
  const skala = hp ? 0.72 : 1;
  const x = scaleLinear().domain([TAHUN_AWAL, TAHUN_AKHIR]).range([tepiKiri + 8, lebar - 8]);

  // Hanya gunung yang punya letusan sejak 1500, urut menyusuri busur.
  const baris = GUNUNG.filter((g) => sejak(g.letusan).length > 0);
  const posY = new Map<number, number>();
  const kelompok: { busur: string; y0: number; y1: number }[] = [];
  let y = hp ? 14 : 12;
  for (const g of baris) {
    const akhir = kelompok.at(-1);
    if (!akhir || akhir.busur !== g.busur) {
      if (akhir) y += celah;
      kelompok.push({ busur: g.busur, y0: y, y1: y });
    }
    posY.set(g.i, y + tinggiBaris / 2);
    y += tinggiBaris;
    kelompok.at(-1)!.y1 = y;
  }
  const tinggi = y + 8;

  const grid: string[] = [];
  for (let th = 1550; th < TAHUN_AKHIR; th += 50) grid.push(`<line class="kisi${th % 100 === 0 ? " tebal" : ""}" x1="${x(th)}" x2="${x(th)}" y1="0" y2="${tinggi}"/>`);
  const garisBaris = baris.map((g) => `<line class="garis-baris" x1="${x(TAHUN_AWAL)}" x2="${x(TAHUN_AKHIR)}" y1="${posY.get(g.i)}" y2="${posY.get(g.i)}"/>`).join("");
  const labelKelompok = kelompok
    .map((k) => {
      const nama = NAMA_BUSUR[k.busur as keyof typeof NAMA_BUSUR];
      if (hp) return `<text class="label-kelompok" x="${tepiKiri + 8}" y="${k.y0 - 6}">${esc(nama)}</text>`;
      // Nama panjang ("Bali & Nusa Tenggara") dipecah dua baris supaya muat di tepi kiri.
      const baris = nama.split(/(?<= &) /);
      const y0 = (k.y0 + k.y1) / 2 + 4 - ((baris.length - 1) * 15) / 2;
      return `<text class="label-kelompok" x="${tepiKiri - 14}" y="${y0}" text-anchor="end">${baris.map((b, i) => `<tspan x="${tepiKiri - 14}" dy="${i ? 15 : 0}">${esc(b)}</tspan>`).join("")}</text>
           <line class="kurung" x1="${tepiKiri - 6}" x2="${tepiKiri - 6}" y1="${k.y0 + 1}" y2="${k.y1 - 1}"/>`;
    })
    .join("");

  // Kecil dulu supaya titik besar tidak menutupi.
  const letusan = baris.flatMap((g) => sejak(g.letusan)).sort((a, b) => (a.vei ?? -1) - (b.vei ?? -1));
  // Letusan yang berlangsung bertahun-tahun digambar sebagai garis durasi di belakang titiknya.
  const durasi = letusan
    .map((e) => {
      const u = ujung(e);
      if (u == null || x(u) - x(tahunPecahan(e)) < 3) return "";
      return `<line class="durasi${e.berlanjut ? " berlanjut" : ""}" x1="${x(tahunPecahan(e)).toFixed(1)}" x2="${x(u).toFixed(1)}" y1="${posY.get(e.g)}" y2="${posY.get(e.g)}"/>`;
    })
    .join("");
  const titik = letusan
    .map((e) => {
      const r = jariVei(e.vei, skala);
      const cx = x(tahunPecahan(e)).toFixed(1);
      const cy = posY.get(e.g);
      return e.vei == null ? `<circle class="titik-ragu" cx="${cx}" cy="${cy}" r="${r}"/>` : `<circle class="titik${e.vei >= 4 ? " besar" : ""}" cx="${cx}" cy="${cy}" r="${r}"/>`;
    })
    .join("");

  // Label untuk letusan VEI 5 ke atas yang VEI-nya pasti. Di layar sempit cukup satu per gunung
  // (yang terbaru) supaya dua label Agung tidak bertumpuk.
  const besar = letusan.filter((e) => (e.vei ?? 0) >= 5 && !e.ragu);
  const label = besar
    .filter((e) => !hp || !besar.some((f) => f.g === e.g && f.tahun > e.tahun))
    .map((e) => {
      const cx = x(tahunPecahan(e));
      const kanan = cx > lebar - 150;
      const r = jariVei(e.vei, skala);
      return `<text class="label-letusan" x="${kanan ? cx - r - 5 : cx + r + 5}" y="${posY.get(e.g)! + 4}" text-anchor="${kanan ? "end" : "start"}">${esc(GUNUNG[e.g].nama)} ${teksRentang(e)}</text>`;
    })
    .join("");

  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}" aria-hidden="true">
    <g>${grid.join("")}</g><g>${garisBaris}</g><g>${labelKelompok}</g>
    <rect class="sorot-baris" x="${x(TAHUN_AWAL)}" width="${x(TAHUN_AKHIR) - x(TAHUN_AWAL)}" height="${tinggiBaris}" y="-20" rx="2"/>
    <g>${durasi}</g><g>${titik}</g><g>${label}</g>
  </svg>`;

  const sumbu = document.createElement("div");
  sumbu.className = "sumbu-tahun";
  for (let th = TAHUN_AWAL; th < TAHUN_AKHIR; th += 100) {
    const gaya = th === TAHUN_AWAL ? `left:${x(th)}px;transform:none` : `left:${x(th)}px`;
    sumbu.insertAdjacentHTML("beforeend", `<span style="${gaya}">${th}</span>`);
  }
  wadah.append(sumbu);

  legenda.innerHTML =
    `<span>Ukuran = VEI</span>` +
    [2, 4, 6]
      .map((v) => {
        const r = jariVei(v, skala);
        return `<span><svg width="${2 * r + 2}" height="${2 * r + 2}"><circle class="titik${v >= 4 ? " besar" : ""}" cx="${r + 1}" cy="${r + 1}" r="${r}"/></svg>${v}</span>`;
      })
      .join("") +
    `<span><svg width="6" height="6"><circle class="titik-ragu" cx="3" cy="3" r="1.8"/></svg>tidak diketahui</span>` +
    `<span><svg width="22" height="6"><line class="durasi berlanjut" x1="1" x2="21" y1="3" y2="3"/></svg>lama letusan</span>`;

  // Sorotan baris + tooltip letusan terdekat.
  const svg = wadah.querySelector("svg")!;
  const sorot = svg.querySelector<SVGRectElement>(".sorot-baris")!;
  const tip = buatTip(wadah);
  svg.addEventListener("pointermove", (ev) => {
    const kotak = svg.getBoundingClientRect();
    const px = ev.clientX - kotak.left;
    const py = ev.clientY - kotak.top;
    let g: Gunung | undefined;
    for (const b of baris) if (Math.abs(posY.get(b.i)! - py) <= tinggiBaris / 2) g = b;
    if (!g || px < x(TAHUN_AWAL) - 4) {
      sorot.setAttribute("y", "-20");
      return tip.sembunyi();
    }
    sorot.setAttribute("y", String(posY.get(g.i)! - tinggiBaris / 2));
    let pilih: Letusan | null = null;
    let jarak = 10;
    for (const e of sejak(g.letusan)) {
      const d = Math.abs(x(tahunPecahan(e)) - px);
      if (d < jarak || (d === jarak && pilih && (e.vei ?? -1) > (pilih.vei ?? -1))) [pilih, jarak] = [e, d];
    }
    const n = sejak(g.letusan).length;
    tip.tampil(px, posY.get(g.i)!, pilih ? isiTipLetusan(pilih) : `<b>${esc(g.nama)}</b> <span class="redup">${esc(g.daerah.prov)}</span><br>${angka(n)} letusan sejak ${TAHUN_AWAL}`);
  });
  svg.addEventListener("pointerleave", () => {
    sorot.setAttribute("y", "-20");
    tip.sembunyi();
  });
}

export const teksTerakhir = (t: Letusan | undefined) =>
  !t ? "tidak ada letusan tercatat" : t.berlanjut ? `masih erupsi sejak ${teksTanggal(t)}` : `terakhir ${teksTanggal(t)}`;

/* ---------- peta ---------- */
type Prop = { id: string };
export type Peta = { darat: FeatureCollection<Geometry, Prop>; batas: MultiLineString };

export async function muatPeta(): Promise<Peta> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/peta.json`);
  const topo = (await r.json()) as Topology<{ daerah: GeometryCollection<Prop> }>;
  return {
    darat: feature(topo, topo.objects.daerah) as FeatureCollection<Geometry, Prop>,
    batas: mesh(topo, topo.objects.daerah, (a, b) => a !== b) as MultiLineString,
  };
}

/** Segitiga sama sisi berpusat di (x, y) dengan lebar alas s. */
const segitiga = (x: number, y: number, s: number) =>
  `M${(x).toFixed(1)},${(y - s * 0.58).toFixed(1)}L${(x + s / 2).toFixed(1)},${(y + s * 0.29).toFixed(1)}L${(x - s / 2).toFixed(1)},${(y + s * 0.29).toFixed(1)}Z`;

export const ukuranSegitiga = (g: Gunung, skala = 1) => (7 + 2.3 * Math.sqrt(sejak(g.letusan).length)) * skala;

function tandaGunung(g: Gunung, x: number, y: number, s: number, kelasTambahan = ""): string {
  const k = kelasTerakhir(g);
  // Gunung yang masih erupsi diberi cincin.
  const cincin = GUNUNG_ERUPSI.has(g.i) ? `<circle class="cincin-erupsi" cx="${x.toFixed(1)}" cy="${(y - s * 0.1).toFixed(1)}" r="${(s * 0.62 + 2).toFixed(1)}"/>` : "";
  return `${cincin}<path class="gunung kelas-${k}${kelasTambahan}" d="${segitiga(x, y, s)}" data-i="${g.i}"/>`;
}
/** Nama tanpa keterangan dalam kurung, untuk label peta yang sempit. */
const namaPendek = (g: Gunung) => g.nama.replace(/ \(.*\)$/, "");

const LABEL_PETA = new Set(["Sinabung", "Marapi", "Krakatau", "Merapi", "Semeru", "Agung", "Tambora", "Lewotobi", "Banda Api", "Karangetang", "Dukono"]);

export function gambarPetaBesar(wadah: HTMLElement, peta: Peta, terpilih: number, pilih: (i: number) => void): void {
  const lebar = Math.max(320, wadah.clientWidth);
  const hp = lebar < 600;
  const skala = hp ? 0.62 : 1;
  const tepi = hp ? 14 : 28;
  const semua: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      ...peta.darat.features,
      { type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: GUNUNG.map((g) => [g.lon, g.lat]) } },
    ],
  };
  // Dipaskan ke lebar dulu, lalu tingginya mengikuti bentuk kepulauan supaya tidak ada ruang kosong.
  const proyeksi = geoMercator().fitWidth(lebar - 2 * tepi, semua);
  const [[x0, y0], [, y1]] = geoPath(proyeksi).bounds(semua);
  const [tx, ty] = proyeksi.translate();
  proyeksi.translate([tx - x0 + tepi, ty - y0 + tepi]);
  const tinggi = Math.ceil(y1 - y0 + 2 * tepi);
  const jalur = geoPath(proyeksi);
  const pos = GUNUNG.map((g) => proyeksi([g.lon, g.lat]) as [number, number]);
  // Gunung besar digambar dulu supaya yang kecil tetap terlihat di atasnya.
  const urut = [...GUNUNG].sort((a, b) => ukuranSegitiga(b) - ukuranSegitiga(a));
  const label = GUNUNG.filter((g) => g.i === terpilih || (!hp && LABEL_PETA.has(g.nama)))
    .map((g) => {
      const [x, y] = pos[g.i];
      const s = ukuranSegitiga(g, skala);
      return `<text class="label-peta${g.i === terpilih ? " terpilih" : ""}" x="${x + s / 2 + 4}" y="${y + 4}">${esc(g.nama)}</text>`;
    })
    .join("");
  wadah.style.height = `${tinggi}px`;
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}">
    <path class="darat" d="${jalur(peta.darat) ?? ""}"/>
    <path class="batas" d="${jalur(peta.batas) ?? ""}"/>
    <g>${urut.map((g) => tandaGunung(g, pos[g.i][0], pos[g.i][1], ukuranSegitiga(g, skala), g.i === terpilih ? " terpilih" : "")).join("")}</g>
    <g class="label-lapis">${label}</g>
  </svg>`;

  const svg = wadah.querySelector("svg")!;
  const tip = buatTip(wadah);
  // Titik sentuh lebih besar dari tandanya: pilih gunung terdekat dalam 18 px.
  const terdekat = (ev: PointerEvent | MouseEvent) => {
    const kotak = svg.getBoundingClientRect();
    const px = ev.clientX - kotak.left;
    const py = ev.clientY - kotak.top;
    let hasil = -1;
    let jarak = hp ? 22 : 18;
    pos.forEach(([x, y], i) => {
      const d = Math.hypot(x - px, y - py);
      if (d < jarak) [hasil, jarak] = [i, d];
    });
    return hasil;
  };
  svg.addEventListener("pointermove", (ev) => {
    const i = terdekat(ev);
    svg.style.cursor = i >= 0 ? "pointer" : "";
    if (i < 0) return tip.sembunyi();
    const g = GUNUNG[i];
    const t = g.letusan.at(-1);
    tip.tampil(
      pos[i][0],
      pos[i][1] - 6,
      `<b>${esc(g.nama)}</b> <span class="redup">${esc(g.daerah.prov)}</span><br>${angka(sejak(g.letusan).length)} letusan sejak ${TAHUN_AWAL}<br><span class="redup">${teksTerakhir(t)}</span>`,
    );
  });
  svg.addEventListener("pointerleave", () => tip.sembunyi());
  svg.addEventListener("click", (ev) => {
    const i = terdekat(ev);
    if (i >= 0) pilih(i);
  });
}

export function gambarPetaKecil(wadah: HTMLElement, peta: Peta, d: Daerah, radius: number, dekat: GunungDekat[]): void {
  const lebar = Math.max(280, wadah.clientWidth);
  const tinggi = Math.round(Math.min(lebar, 420) * 0.92);
  const lingkar = geoCircle().center(d.titik as [number, number]).radius(radius / 111.2)();
  const bingkai = geoCircle().center(d.titik as [number, number]).radius((radius * 1.18) / 111.2)();
  const proyeksi = geoMercator().fitExtent(
    [
      [8, 8],
      [lebar - 8, tinggi - 8],
    ],
    bingkai,
  );
  const jalur = geoPath(proyeksi);
  const wilayah = peta.darat.features.find((f) => f.properties.id === d.id) as Feature | undefined;
  const [cx, cy] = proyeksi(d.titik as [number, number])!;
  const dalam = new Set(dekat.filter((g) => g.jarak <= radius).map((g) => g.i));
  const tampak = GUNUNG.filter((g) => {
    const p = proyeksi([g.lon, g.lat]);
    return p && p[0] > -10 && p[0] < lebar + 10 && p[1] > -10 && p[1] < tinggi + 10;
  });
  const label = tampak
    .filter((g) => dalam.has(g.i))
    .map((g) => {
      const [x, y] = proyeksi([g.lon, g.lat])!;
      const s = ukuranSegitiga(g, 0.8);
      const kanan = x > lebar - 90;
      return `<text class="label-peta" x="${kanan ? x - s / 2 - 4 : x + s / 2 + 4}" y="${y + 4}" text-anchor="${kanan ? "end" : "start"}">${esc(namaPendek(g))}</text>`;
    })
    .join("");
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}" aria-hidden="true">
    <defs><clipPath id="potong-kecil"><rect width="${lebar}" height="${tinggi}"/></clipPath></defs>
    <g clip-path="url(#potong-kecil)">
      <path class="darat" d="${jalur(peta.darat) ?? ""}"/>
      <path class="batas" d="${jalur(peta.batas) ?? ""}"/>
      ${wilayah ? `<path class="wilayah" d="${jalur(wilayah) ?? ""}"/>` : ""}
      <path class="lingkar" d="${jalur(lingkar) ?? ""}"/>
      ${tampak.map((g) => { const [x, y] = proyeksi([g.lon, g.lat])!; return tandaGunung(g, x, y, ukuranSegitiga(g, 0.8), dalam.has(g.i) ? "" : " pudar"); }).join("")}
      <circle class="pusat" cx="${cx}" cy="${cy}" r="4"/>
      ${label}
    </g>
  </svg>`;
}

/* ---------- riwayat satu gunung (strip) ---------- */
export function gambarStrip(wadah: HTMLElement, g: Gunung): void {
  const lebar = Math.max(280, wadah.clientWidth);
  const tinggi = 64;
  const x = scaleLinear().domain([TAHUN_AWAL, TAHUN_AKHIR]).range([10, lebar - 10]);
  const daftar = sejak(g.letusan).sort((a, b) => (a.vei ?? -1) - (b.vei ?? -1));
  const tengah = 28;
  const kisi: string[] = [];
  for (let th = TAHUN_AWAL; th < TAHUN_AKHIR; th += 100) kisi.push(`<line class="kisi tebal" x1="${x(th)}" x2="${x(th)}" y1="6" y2="${tengah + 14}"/><text class="sumbu" x="${x(th)}" y="${tinggi - 4}" text-anchor="${th === TAHUN_AWAL ? "start" : "middle"}">${th}</text>`);
  wadah.innerHTML = `<svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}" aria-hidden="true">
    ${kisi.join("")}
    <line class="garis-baris" x1="${x(TAHUN_AWAL)}" x2="${x(TAHUN_AKHIR)}" y1="${tengah}" y2="${tengah}"/>
    ${daftar.map((e) => { const u = ujung(e); return u != null && x(u) - x(tahunPecahan(e)) >= 3 ? `<line class="durasi${e.berlanjut ? " berlanjut" : ""}" x1="${x(tahunPecahan(e))}" x2="${x(u)}" y1="${tengah}" y2="${tengah}"/>` : ""; }).join("")}
    ${daftar.map((e) => (e.vei == null ? `<circle class="titik-ragu" cx="${x(tahunPecahan(e))}" cy="${tengah}" r="2.2"/>` : `<circle class="titik${e.vei >= 4 ? " besar" : ""}" cx="${x(tahunPecahan(e))}" cy="${tengah}" r="${jariVei(e.vei)}"/>`)).join("")}
  </svg>`;
  if (!daftar.length) {
    wadah.insertAdjacentHTML("beforeend", `<p class="kosong-strip">Tidak ada letusan pasti yang tercatat sejak ${TAHUN_AWAL}.</p>`);
    return;
  }
  const svg = wadah.querySelector("svg")!;
  const tip = buatTip(wadah);
  svg.addEventListener("pointermove", (ev) => {
    const px = ev.clientX - svg.getBoundingClientRect().left;
    let pilih: Letusan | null = null;
    let jarak = 12;
    for (const e of daftar) {
      const d = Math.abs(x(tahunPecahan(e)) - px);
      if (d < jarak) [pilih, jarak] = [e, d];
    }
    if (!pilih) return tip.sembunyi();
    tip.tampil(x(tahunPecahan(pilih)), tengah - 6, isiTipLetusan(pilih));
  });
  svg.addEventListener("pointerleave", () => tip.sembunyi());
}

/* ---------- batang: gunung paling aktif ---------- */
export function grafikAktif(wadah: HTMLElement, data: { g: Gunung; n: number }[]): void {
  const maks = Math.max(...data.map((d) => d.n));
  wadah.innerHTML = `<ol class="batang">${data
    .map(
      ({ g, n }) => `<li data-i="${g.i}">
        <span class="nama">${esc(g.nama)}<small>${esc(g.daerah.prov)}</small></span>
        <span class="jalur"><span class="isi" style="width:${(n / maks) * 100}%"></span><span class="nilai">${angka(n)}</span></span>
      </li>`,
    )
    .join("")}</ol>`;
  const tip = buatTip(wadah);
  wadah.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
    li.addEventListener("pointerenter", () => {
      const g = GUNUNG[Number(li.dataset.i)];
      const t = g.letusan.at(-1)!;
      const kotak = wadah.getBoundingClientRect();
      const isi = li.querySelector(".isi")!.getBoundingClientRect();
      tip.tampil(isi.right - kotak.left, isi.top - kotak.top, `<b>${esc(g.nama)}</b><br>${angka(sejak(g.letusan).length)} letusan sejak ${TAHUN_AWAL}<br><span class="redup">${teksTerakhir(t)}</span>`);
    });
    li.addEventListener("pointerleave", () => tip.sembunyi());
  });
}
