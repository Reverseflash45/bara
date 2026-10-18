import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/hanken-grotesk";
import "./gaya.css";
import {
  DAERAH,
  DIBANGUN,
  GUNUNG,
  LETUSAN,
  MASIH_ERUPSI,
  MUTAKHIR,
  NAMA_BUSUR,
  NAMA_KELAS,
  TAHUN_AWAL,
  type Busur,
  type Daerah,
  type Gunung,
  type Kelas,
  type Letusan,
  cariDaerah,
  contohVei,
  kelasTerakhir,
  palingAktif,
  perVei,
  sejak,
  teksRentang,
  teksIso,
  teksTahun,
  teksTanggal,
  teksTipe,
  teksVei,
  terbesar,
  terdekat,
} from "./data";
import { angka, esc, gambarGarisWaktu, gambarPetaBesar, gambarPetaKecil, gambarStrip, grafikAktif, jariVei, muatPeta, teksTerakhir, varKelas, type Peta } from "./vis";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

/* ---------- keadaan dari URL (#daerah=kota-yogyakarta&r=100&gunung=263250) ---------- */
const hash = new URLSearchParams(location.hash.slice(1));
let pilihan: Daerah = DAERAH.find((d) => d.id === hash.get("daerah")) ?? DAERAH.find((d) => d.id === "kota-yogyakarta")!;
let radius = [50, 100, 200].includes(Number(hash.get("r"))) ? Number(hash.get("r")) : 100;
let gunungTerpilih = GUNUNG.find((g) => g.id === Number(hash.get("gunung")))?.i ?? GUNUNG.find((g) => g.nama === "Merapi")!.i;
let peta: Peta | null = null;

function simpanHash() {
  history.replaceState(null, "", `#daerah=${pilihan.id}&r=${radius}&gunung=${GUNUNG[gunungTerpilih].id}`);
}

/** "A, B dan C" */
const daftarNama = (nama: string[]) => nama.join(", ").replace(/, ([^,]*)$/, " dan $1");

const terkini = (daftar: readonly Letusan[]) => daftar.reduce<Letusan | null>((a, e) => (!a || e.tahun > a.tahun || (e.tahun === a.tahun && e.bulan * 40 + e.hari > a.bulan * 40 + a.hari) ? e : a), null);

/* ---------- pembuka ---------- */
function gambarPembuka() {
  const semua = sejak(LETUSAN);
  $("[data-total]").textContent = angka(semua.length);
  $("[data-jumlah-gunung]").textContent = String(new Set(semua.map((e) => e.g)).size);
  $("[data-rentang]").textContent = `${TAHUN_AWAL}–${semua.at(-1)!.tahun}`;
  $("[data-dibangun]").textContent = new Date(DIBANGUN).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const erupsi = [...MASIH_ERUPSI].sort((a, b) => a.tahun - b.tahun);
  $("[data-kini]").innerHTML =
    `<span class="denyut" aria-hidden="true"></span><span>Per ${teksIso(MUTAKHIR)}, <strong>${erupsi.length} gunung masih erupsi</strong>: ` +
    daftarNama(erupsi.map((e) => `${esc(GUNUNG[e.g].nama)} (sejak ${e.tahun})`)) +
    `.</span>`;
  gambarGarisWaktu($("#garis-waktu"), $("[data-legenda-ukuran]"));
}

/* ---------- daerahmu ---------- */
function gambarSekitar() {
  const dekat = terdekat(pilihan);
  const dalam = dekat.filter((g) => g.jarak <= radius);
  const pertama = dekat[0];
  const letusan = dalam.flatMap((g) => sejak(g.letusan));
  const besar = terbesar(letusan);
  const akhir = terkini(letusan);
  const diWilayah = GUNUNG.filter((g) => g.daerah.id === pilihan.id);

  $("[data-nama-daerah]").innerHTML = `${esc(pilihan.nama)}<small>${esc(pilihan.prov)} · radius ${radius} km</small>`;
  let kalimat = `Gunung api terdekat dari titik tengah ${esc(pilihan.nama)} adalah <strong>${esc(pertama.nama)}</strong>, sekitar ${angka(Math.round(pertama.jarak))} km ke arah ${pertama.arah}.`;
  if (diWilayah.length) kalimat += ` Di wilayah ${esc(pilihan.nama)} sendiri ada ${daftarNama(diWilayah.map((g) => esc(g.nama)))}.`;
  kalimat += !dalam.length
    ? ` Tidak ada gunung api dalam radius ${radius} km.`
    : letusan.length
      ? ` Dalam radius ${radius} km ada ${dalam.length} gunung api, dengan total <strong>${angka(letusan.length)} letusan</strong> tercatat sejak ${TAHUN_AWAL}.`
      : ` Dalam radius ${radius} km ada ${dalam.length} gunung api, tetapi tidak satu pun tercatat meletus sejak ${TAHUN_AWAL}.`;
  const erupsi = letusan.filter((e) => e.berlanjut);
  if (erupsi.length) kalimat += ` ${daftarNama(erupsi.map((e) => esc(GUNUNG[e.g].nama)))} masih erupsi per ${teksIso(MUTAKHIR)}.`;
  $("[data-kalimat]").innerHTML = kalimat;

  const ubin: [string, string, string][] = [
    ["Gunung api", String(dalam.length), `dalam radius ${radius} km`],
    ["Letusan", angka(letusan.length), `sejak ${TAHUN_AWAL}`],
    ["Terbesar", besar ? `VEI ${besar.vei}` : "—", besar ? `${GUNUNG[besar.g].nama} ${teksRentang(besar)}` : "tidak ada"],
    ["Terakhir", akhir ? teksTahun(akhir.tahun) : "—", akhir ? `${GUNUNG[akhir.g].nama}, ${teksTanggal(akhir)}${akhir.berlanjut ? ", masih berlangsung" : ""}` : "tidak ada"],
  ];
  $("[data-ubin]").innerHTML = ubin.map(([l, n, k]) => `<li><span class="label">${l}</span><span class="angka">${esc(n)}</span><span class="ket">${esc(k)}</span></li>`).join("");

  const daftar = dalam.length ? dalam : dekat.slice(0, 3);
  $("[data-judul-daftar]").textContent = dalam.length ? "Gunung api dalam radius ini" : "Terdekat, di luar radius";
  $("[data-daftar]").innerHTML = daftar
    .map((g) => {
      const n = sejak(g.letusan).length;
      const t = g.letusan.at(-1);
      return `<li><svg width="16" height="14" aria-hidden="true"><path class="gunung kelas-${kelasTerakhir(g)}" d="M8 1 15 13H1Z"/></svg>
        <span><button type="button" class="tautan" data-buka="${g.i}">${esc(g.nama)}</button>
        <span class="rinci">${angka(Math.round(g.jarak))} km ke ${g.arah} · ${n ? `${angka(n)} letusan sejak ${TAHUN_AWAL}` : `tidak ada letusan sejak ${TAHUN_AWAL}`}${t ? ` · ${teksTerakhir(t)}` : ""}</span></span></li>`;
    })
    .join("");
  if (peta) gambarPetaKecil($("#peta-kecil"), peta, pilihan, radius, dekat);
  $$<HTMLButtonElement>("[data-radius]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.radius) === radius)));
  masuk.value = pilihan.nama;
}

/* ---------- peta & kartu gunung ---------- */
function gambarLegenda() {
  const jumlah: Record<Kelas, number> = { baru: 0, abad20: 0, lama: 0, tidak: 0 };
  for (const g of GUNUNG) jumlah[kelasTerakhir(g)]++;
  $("[data-legenda-kelas]").innerHTML =
    (Object.keys(NAMA_KELAS) as Kelas[])
      .map((k) => `<li><svg width="14" height="12" aria-hidden="true"><path class="gunung kelas-${k}" d="M7 1 13 11H1Z"/></svg>${NAMA_KELAS[k]} <span class="redup">${jumlah[k]}</span></li>`)
      .join("") +
    `<li><svg width="16" height="16" aria-hidden="true"><circle class="cincin-erupsi" cx="8" cy="8" r="6"/></svg>Masih erupsi</li>` +
    `<li class="redup">Ukuran: jumlah letusan sejak ${TAHUN_AWAL}</li>`;
}

function gambarPeta() {
  if (!peta) return;
  gambarPetaBesar($("#peta-besar"), peta, gunungTerpilih, (i) => pilihGunung(i, false));
}

const teksPil = (g: Gunung) => {
  const k = kelasTerakhir(g);
  if (akhirBerlanjut(g)) return "Masih erupsi";
  return k === "tidak" ? `Tidak meletus sejak ${TAHUN_AWAL}` : `Terakhir meletus ${NAMA_KELAS[k].toLowerCase()}`;
};
const akhirBerlanjut = (g: Gunung) => g.letusan.at(-1)?.berlanjut ?? false;

function gambarKartu() {
  const g = GUNUNG[gunungTerpilih];
  const semua = g.letusan;
  const baru = sejak(semua);
  const besar = terbesar(semua);
  const akhir = semua.at(-1);
  const lokasi = g.diDarat ? `${g.daerah.nama}, ${g.daerah.prov}` : `Perairan dekat ${g.daerah.nama}, ${g.daerah.prov}`;
  const tinggi = g.tinggi < 0 ? `${angka(-g.tinggi)} m di bawah laut` : `${angka(g.tinggi)} m dpl`;
  const fakta: [string, string][] = [
    ["Tinggi", tinggi],
    ["Tipe", teksTipe(g.tipe)],
    ["Letusan pasti", semua.length ? `${angka(semua.length)} (${angka(baru.length)} sejak ${TAHUN_AWAL})` : "belum tercatat"],
    ["Tertua tercatat", semua[0] ? teksTahun(semua[0].tahun) : "—"],
    ["Terbesar", besar ? `${teksVei(besar)}, ${teksRentang(besar)}` : "—"],
    ["Terakhir", akhir ? `${teksTanggal(akhir)}${akhir.berlanjut ? ", masih berlangsung" : ""}` : "—"],
  ];
  $("[data-kartu]").innerHTML = `
    <h3>${esc(g.nama)}</h3>
    <p class="lokasi"><span class="pil" style="--warna:${varKelas(kelasTerakhir(g))}">${teksPil(g)}</span> ${esc(lokasi)}</p>
    <dl class="fakta">${fakta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    <p class="label">Letusan sejak ${TAHUN_AWAL}</p>
    <div class="strip" id="strip"></div>
    <p class="ke-gvp"><a href="https://volcano.si.edu/volcano.cfm?vn=${g.id}" rel="noopener">Profil lengkap ${esc(g.gvp)} di Global Volcanism Program →</a></p>`;
  gambarStrip($("#strip"), g);
  $<HTMLSelectElement>("#pilih-gunung").value = String(g.i);
}

function pilihGunung(i: number, gulir: boolean) {
  gunungTerpilih = i;
  simpanHash();
  gambarPeta();
  gambarKartu();
  if (gulir) $("#peta").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function isiPilihan() {
  const sel = $<HTMLSelectElement>("#pilih-gunung");
  sel.innerHTML = (Object.keys(NAMA_BUSUR) as Busur[])
    .map((b) => `<optgroup label="${NAMA_BUSUR[b]}">${GUNUNG.filter((g) => g.busur === b).map((g) => `<option value="${g.i}">${esc(g.nama)}</option>`).join("")}</optgroup>`)
    .join("");
  sel.addEventListener("change", () => pilihGunung(Number(sel.value), false));
}

/* ---------- VEI ---------- */
const VEI: [string, string][] = [
  ["tidak eksplosif", "< 10 ribu m³"],
  ["lemah", "10 ribu – 1 juta m³"],
  ["eksplosif", "1–10 juta m³"],
  ["hebat", "10–100 juta m³"],
  ["dahsyat", "0,1–1 km³"],
  ["paroksismal", "1–10 km³"],
  ["kolosal", "10–100 km³"],
  ["superkolosal", "100–1.000 km³"],
];

function gambarVei() {
  const daftar = sejak(LETUSAN);
  const n = perVei(daftar);
  const maks = Math.log10(Math.max(...n) + 1);
  const baris = VEI.map(([nama, volume], v) => {
    const c = contohVei(daftar, v);
    const r = jariVei(v);
    return `<tr>
      <th scope="row"><span class="vei-angka"><svg width="24" height="24" aria-hidden="true"><circle class="titik${v >= 4 ? " besar" : ""}" cx="12" cy="12" r="${r}"/></svg>${v}</span><span class="vei-nama">${nama}</span></th>
      <td class="volume">${volume}</td>
      <td><span class="jalur-vei"><span class="isi" style="width:${(Math.log10(n[v] + 1) / maks) * 100}%"></span></span><span class="nilai">${angka(n[v])}</span></td>
      <td class="contoh">${c ? `${esc(GUNUNG[c.g].nama)}, ${teksRentang(c)}` : '<span class="redup">—</span>'}</td>
    </tr>`;
  }).join("");
  $("[data-vei]").innerHTML =
    baris +
    `<tr class="tak-tahu"><th scope="row"><span class="vei-angka">?</span><span class="vei-nama">tidak diketahui</span></th><td class="volume">—</td><td><span class="jalur-vei"><span class="isi" style="width:${(Math.log10(n[8] + 1) / maks) * 100}%"></span></span><span class="nilai">${angka(n[8])}</span></td><td></td></tr>`;
}

/* ---------- paling aktif ---------- */
function gambarAktif() {
  const data = palingAktif(12);
  $("#grafik-aktif").setAttribute("aria-label", `Gunung api dengan letusan terbanyak sejak ${TAHUN_AWAL}: ${data.map((d) => `${d.g.nama} ${d.n}`).join(", ")}`);
  grafikAktif($("#grafik-aktif"), data);
}

function gambarSemua() {
  gambarPembuka();
  gambarSekitar();
  gambarPeta();
  gambarKartu();
  gambarAktif();
}

/* ---------- combobox daerah ---------- */
const masuk = $<HTMLInputElement>("#daerah");
const daftarSaran = $<HTMLUListElement>("#saran");
let saran: Daerah[] = [];
let aktif = -1;

function tutupSaran() {
  daftarSaran.hidden = true;
  masuk.setAttribute("aria-expanded", "false");
  masuk.removeAttribute("aria-activedescendant");
}
function sorot() {
  $$("#saran [role=option]").forEach((li, i) => li.setAttribute("aria-selected", String(i === aktif)));
  if (aktif >= 0) masuk.setAttribute("aria-activedescendant", `saran-${aktif}`);
}
function pilihDaerah(d: Daerah) {
  pilihan = d;
  tutupSaran();
  simpanHash();
  gambarSekitar();
}
masuk.addEventListener("focus", () => masuk.select());
masuk.addEventListener("input", () => {
  saran = cariDaerah(masuk.value);
  aktif = saran.length ? 0 : -1;
  daftarSaran.innerHTML = saran.length
    ? saran.map((d, i) => `<li role="option" id="saran-${i}" data-i="${i}" aria-selected="${i === aktif}"><span>${esc(d.nama)}</span><small>${esc(d.prov)}</small></li>`).join("")
    : `<li aria-disabled="true">Tidak ada yang cocok</li>`;
  daftarSaran.hidden = !masuk.value.trim();
  masuk.setAttribute("aria-expanded", String(!daftarSaran.hidden));
  sorot();
});
masuk.addEventListener("keydown", (e) => {
  if (daftarSaran.hidden || !saran.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    aktif = (aktif + (e.key === "ArrowDown" ? 1 : -1) + saran.length) % saran.length;
    sorot();
    e.preventDefault();
  } else if (e.key === "Escape") tutupSaran();
});
masuk.addEventListener("blur", () =>
  setTimeout(() => {
    tutupSaran();
    masuk.value = pilihan.nama;
  }, 150),
);
daftarSaran.addEventListener("mousedown", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
  if (!li) return;
  e.preventDefault();
  pilihDaerah(saran[Number(li.dataset.i)]);
  masuk.blur();
});
$("#cari").addEventListener("submit", (e) => {
  e.preventDefault();
  if (aktif >= 0 && saran[aktif]) {
    pilihDaerah(saran[aktif]);
    masuk.blur();
  }
});
$$<HTMLButtonElement>("[data-radius]").forEach((b) =>
  b.addEventListener("click", () => {
    radius = Number(b.dataset.radius);
    simpanHash();
    gambarSekitar();
  }),
);
$("[data-daftar]").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-buka]");
  if (b) pilihGunung(Number(b.dataset.buka), true);
});

/* ---------- ukuran layar ---------- */
let lebarTerakhir = 0;
let tunda = 0;
new ResizeObserver(([e]) => {
  const w = Math.round(e.contentRect.width);
  if (!lebarTerakhir) {
    lebarTerakhir = w;
    return;
  }
  if (w === lebarTerakhir) return;
  lebarTerakhir = w;
  cancelAnimationFrame(tunda);
  tunda = requestAnimationFrame(gambarSemua);
}).observe(document.querySelector("main")!);

/* ---------- mulai ---------- */
isiPilihan();
gambarLegenda();
gambarVei();
gambarSemua();
muatPeta()
  .then((p) => {
    peta = p;
    gambarSekitar();
    gambarPeta();
  })
  .catch(() => {
    $("#peta-besar").innerHTML = `<p class="gagal">Peta gagal dimuat. Muat ulang halaman.</p>`;
  });
