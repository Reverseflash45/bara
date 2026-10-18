// Bangun data gunung api dari Smithsonian Global Volcanism Program (Volcanoes of the World).
//
//   node data/skrip/bangun.mjs           pakai data/mentah/*.json yang ada
//   node data/skrip/bangun.mjs --unduh   unduh ulang dari layanan WFS GVP lebih dulu
//
// Keluaran src/data/bara.json:
//   gunung   101 gunung api Holosen Indonesia, diurutkan menyusuri busur vulkanik
//            (Sumatra → Jawa → Nusa Tenggara → Laut Banda → Sulawesi Utara → Halmahera)
//   letusan  hanya "Confirmed Eruption":
//            [indeks gunung, tahun, bulan, hari, tahun akhir, VEI, ragu, masih berlangsung]
//   mutakhir tanggal akhir terbaru di data GVP; letusan bertanda ">" sampai tanggal ini
//            (pada tahun yang sama) berarti masih berlangsung saat data diperbarui
import { readFileSync, writeFileSync } from "node:fs";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

const WFS = "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json";
const R_BUMI_KM = 6371.0088;

if (process.argv.includes("--unduh")) {
  const ambil = async (url) => {
    const r = await fetch(url, { headers: { "User-Agent": "bara/1.0 (github.com/Reverseflash45/bara)" } });
    if (!r.ok) throw new Error(`GVP ${r.status}`);
    return r.json();
  };
  const gunung = await ambil(`${WFS}&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&CQL_FILTER=${encodeURIComponent("Country='Indonesia'")}`);
  const semua = await ambil(`${WFS}&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions`);
  const ids = new Set(gunung.features.map((f) => f.properties.Volcano_Number));
  const ringkas = (fc) => ({ type: "FeatureCollection", features: fc.map((f) => ({ type: "Feature", geometry: f.geometry, properties: f.properties })) });
  writeFileSync("data/mentah/gunung.json", JSON.stringify(ringkas(gunung.features)));
  writeFileSync("data/mentah/letusan.json", JSON.stringify(ringkas(semua.features.filter((f) => ids.has(f.properties.Volcano_Number)))));
}

const gunungMentah = JSON.parse(readFileSync("data/mentah/gunung.json", "utf8")).features.map((f) => f.properties);
const letusanMentah = JSON.parse(readFileSync("data/mentah/letusan.json", "utf8")).features.map((f) => f.properties);
const { daerah } = JSON.parse(readFileSync("data/mentah/daerah.json", "utf8"));
const topo = JSON.parse(readFileSync("public/data/peta.json", "utf8"));
const batas = feature(topo, topo.objects.daerah).features;
const indeksDaerah = new Map(daerah.map((d, i) => [d.id, i]));

const rad = (d) => (d * Math.PI) / 180;
function jarakKm(lat1, lon1, lat2, lon2) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Nama yang di GVP ditulis terbalik atau memakai nama internasional.
const NAMA = {
  "Telong, Bur ni": "Bur ni Telong",
  "Tara, Batu": "Batu Tara",
  "Tengger Caldera": "Bromo-Tengger",
  "Dieng Volcanic Complex": "Dieng",
  Colo: "Colo (Una-Una)",
  "Sano, Wai": "Wai Sano",
};

// Kelompok busur. Busur Sunda dibagi per pulau dengan garis bujur:
// Krakatau (105,42° BT) masih dihitung bersama Sumatra, Pulosari (105,98° BT) sudah Jawa.
function busur(g) {
  if (g.Subregion === "Sunda Volcanic Arc") return g.Longitude < 105.6 ? "sumatra" : g.Longitude < 114.5 ? "jawa" : "nusa-tenggara";
  if (g.Subregion === "Inner Banda Volcanic Arc") return "banda";
  if (g.Subregion === "Sangihe Volcanic Arc") return "sangihe";
  if (g.Subregion === "Halmahera Volcanic Arc") return "halmahera";
  throw new Error(`Subregion tak dikenal: ${g.Subregion}`);
}
const URUT_BUSUR = ["sumatra", "jawa", "nusa-tenggara", "banda", "sangihe", "halmahera"];
// Menyusuri busur: Sunda dari barat ke timur, Banda dan Sangihe dari selatan ke utara,
// Halmahera dari utara ke selatan.
const kunciUrut = (g) => {
  const b = busur(g);
  return b === "banda" || b === "sangihe" ? g.Latitude : b === "halmahera" ? -g.Latitude : g.Longitude;
};

const gunung = gunungMentah
  .map((g) => {
    const titik = [g.Longitude, g.Latitude];
    const wadah = batas.find((f) => geoContains(f, titik));
    let iDaerah;
    let diDarat = Boolean(wadah);
    if (wadah) iDaerah = indeksDaerah.get(wadah.properties.id);
    if (iDaerah === undefined) {
      // Gunung bawah laut atau pulau kecil yang hilang saat batas disederhanakan.
      diDarat = false;
      let terbaik = Infinity;
      daerah.forEach((d, i) => {
        const j = jarakKm(g.Latitude, g.Longitude, d.titik[1], d.titik[0]);
        if (j < terbaik) [terbaik, iDaerah] = [j, i];
      });
    }
    return { g, iDaerah, diDarat };
  })
  .sort((a, b) => URUT_BUSUR.indexOf(busur(a.g)) - URUT_BUSUR.indexOf(busur(b.g)) || kunciUrut(a.g) - kunciUrut(b.g));

// Nama ganda (dua Sumbing) dibedakan dengan provinsinya.
const hitungNama = {};
for (const { g } of gunung) hitungNama[g.Volcano_Name] = (hitungNama[g.Volcano_Name] ?? 0) + 1;

const indeksGunung = new Map(gunung.map(({ g }, i) => [g.Volcano_Number, i]));
const keluaranGunung = gunung.map(({ g, iDaerah, diDarat }) => {
  const d = daerah[iDaerah];
  const dasar = NAMA[g.Volcano_Name] ?? g.Volcano_Name;
  return {
    id: g.Volcano_Number,
    nama: hitungNama[g.Volcano_Name] > 1 ? `${dasar} (${d.prov})` : dasar,
    gvp: g.Volcano_Name,
    lat: g.Latitude,
    lon: g.Longitude,
    tinggi: g.Elevation,
    tipe: g.Primary_Volcano_Type,
    busur: busur(g),
    daerah: iDaerah,
    diDarat,
  };
});

const pasti = letusanMentah.filter((e) => e.Activity_Type === "Confirmed Eruption" && e.StartDateYear != null);
const tanggalAkhir = (e) => (e.EndDateYear == null ? "" : `${e.EndDateYear}-${String(e.EndDateMonth || 1).padStart(2, "0")}-${String(e.EndDateDay || 1).padStart(2, "0")}`);
const mutakhir = pasti.map(tanggalAkhir).sort().at(-1);
const letusan = pasti
  .map((e) => [
    indeksGunung.get(e.Volcano_Number),
    e.StartDateYear,
    e.StartDateMonth || 0,
    e.StartDateDay || 0,
    e.EndDateYear ?? null,
    e.ExplosivityIndexMax ?? null,
    // VEI bertanda "?" berarti perkiraan kasar dari GVP.
    e.ExplosivityIndexModifier === "?" ? 1 : 0,
    e.EndDateYearModifier === ">" && e.EndDateYear === Number(mutakhir.slice(0, 4)) ? 1 : 0,
  ])
  .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[0] - b[0]);

const keluaran = {
  dibangun: new Date().toISOString().slice(0, 10),
  sumber: "Global Volcanism Program, Smithsonian Institution: Volcanoes of the World",
  mutakhir,
  busur: URUT_BUSUR,
  gunung: keluaranGunung,
  letusan,
};
writeFileSync("src/data/bara.json", JSON.stringify(keluaran));
writeFileSync("src/data/daerah.json", JSON.stringify({ daerah }));

const sejak1500 = letusan.filter((e) => e[1] >= 1500);
console.log(`${keluaranGunung.length} gunung, ${letusan.length} letusan pasti (${sejak1500.length} sejak 1500)`);
console.log(`gunung yang meletus sejak 1500: ${new Set(sejak1500.map((e) => e[0])).size}`);
console.log(`data GVP mutakhir ${mutakhir}; masih berlangsung: ${letusan.filter((e) => e[7]).map((e) => `${keluaranGunung[e[0]].nama} (sejak ${e[1]})`).join(", ")}`);
console.log(`di laut / pulau kecil: ${keluaranGunung.filter((g) => !g.diDarat).map((g) => g.nama).join(", ")}`);
