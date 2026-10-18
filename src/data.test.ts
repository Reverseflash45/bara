import { describe, expect, it } from "vitest";
import {
  DAERAH,
  GUNUNG,
  LETUSAN,
  MASIH_ERUPSI,
  arah,
  cariDaerah,
  contohVei,
  jarakKm,
  kelasTerakhir,
  palingAktif,
  perVei,
  sejak,
  teksRentang,
  teksIso,
  teksTanggal,
  terbesar,
  terdekat,
} from "./data";

const gunung = (nama: string) => GUNUNG.find((g) => g.nama === nama)!;
const daerah = (id: string) => DAERAH.find((d) => d.id === id)!;

describe("data", () => {
  it("memuat 101 gunung api dan semua letusan menunjuk gunung yang ada", () => {
    expect(GUNUNG).toHaveLength(101);
    expect(LETUSAN.every((e) => GUNUNG[e.g] !== undefined)).toBe(true);
    expect(GUNUNG.reduce((n, g) => n + g.letusan.length, 0)).toBe(LETUSAN.length);
  });

  it("urutan gunung menyusuri busur dari Aceh ke Halmahera", () => {
    expect(GUNUNG[0].busur).toBe("sumatra");
    expect(GUNUNG.at(-1)!.busur).toBe("halmahera");
    const i = (n: string) => GUNUNG.indexOf(gunung(n));
    expect(i("Krakatau")).toBeLessThan(i("Merapi"));
    expect(i("Merapi")).toBeLessThan(i("Tambora"));
    expect(i("Tambora")).toBeLessThan(i("Banda Api"));
  });

  it("letusan per gunung urut waktu", () => {
    for (const g of GUNUNG) for (let k = 1; k < g.letusan.length; k++) expect(g.letusan[k].tahun).toBeGreaterThanOrEqual(g.letusan[k - 1].tahun);
  });
});

describe("letusan terbesar", () => {
  it("Tambora dan Samalas (Rinjani) VEI 7, Krakatau 1883 VEI 6", () => {
    expect(terbesar(gunung("Tambora").letusan)).toMatchObject({ vei: 7, ragu: false });
    expect(terbesar(gunung("Rinjani").letusan)).toMatchObject({ vei: 7, tahun: 1257 });
    expect(terbesar(gunung("Krakatau").letusan)).toMatchObject({ vei: 6, tahun: 1883 });
  });

  it("VEI pasti menang dari VEI perkiraan yang sama besar", () => {
    const e = (tahun: number, ragu: boolean) => ({ g: 0, tahun, bulan: 0, hari: 0, akhir: null, vei: 4, ragu, berlanjut: false });
    expect(terbesar([e(2000, false), e(2010, true)])!.tahun).toBe(2000);
    expect(terbesar([e(2000, false), e(2010, false)])!.tahun).toBe(2010);
  });

  it("satu-satunya VEI 7 sejak 1500 adalah Tambora", () => {
    const n = perVei(sejak(LETUSAN));
    expect(n[7]).toBe(1);
    expect(n.reduce((a, b) => a + b, 0)).toBe(sejak(LETUSAN).length);
    expect(GUNUNG[contohVei(sejak(LETUSAN), 7)!.g].nama).toBe("Tambora");
  });
});

describe("jarak dan arah", () => {
  it("haversine Jakarta–Bandung sekitar 120 km", () => {
    expect(jarakKm(-6.2, 106.82, -6.91, 107.61)).toBeGreaterThan(110);
    expect(jarakKm(-6.2, 106.82, -6.91, 107.61)).toBeLessThan(125);
  });

  it("arah delapan mata angin", () => {
    expect(arah(0, 100, 1, 100)).toBe("utara");
    expect(arah(0, 100, 0, 101)).toBe("timur");
    expect(arah(0, 100, -1, 99)).toBe("barat daya");
  });

  it("gunung api terdekat dari Kota Yogyakarta adalah Merapi, di utara", () => {
    const [g] = terdekat(daerah("kota-yogyakarta"));
    expect(g.nama).toBe("Merapi");
    expect(g.arah).toBe("utara");
    expect(g.jarak).toBeGreaterThan(20);
    expect(g.jarak).toBeLessThan(35);
  });
});

describe("lain-lain", () => {
  it("kelas letusan terakhir", () => {
    expect(kelasTerakhir(gunung("Merapi"))).toBe("baru");
    expect(GUNUNG.some((g) => kelasTerakhir(g) === "tidak")).toBe(true);
  });

  it("Merapi paling sering meletus sejak 1500", () => {
    expect(palingAktif(1)[0].g.nama).toBe("Merapi");
  });

  it("teks tanggal dan rentang", () => {
    const krakatau = terbesar(gunung("Krakatau").letusan)!;
    // GVP mencatat awal aktivitas, bukan puncaknya (26–27 Agu).
    expect(teksTanggal(krakatau)).toBe("20 Mei 1883");
    expect(teksRentang(terbesar(gunung("Tambora").letusan)!)).toBe("1812–1815");
    expect(teksTanggal({ g: 0, tahun: -1180, bulan: 0, hari: 0, akhir: null, vei: null, ragu: false, berlanjut: false })).toBe("1180 SM");
  });

  it("letusan yang masih berlangsung", () => {
    const nama = MASIH_ERUPSI.map((e) => GUNUNG[e.g].nama);
    expect(nama).toContain("Dukono");
    expect(nama).toContain("Merapi");
    expect(teksRentang(MASIH_ERUPSI.find((e) => GUNUNG[e.g].nama === "Dukono")!)).toBe("1933–kini");
    expect(teksIso("2026-03-25")).toBe("25 Maret 2026");
  });

  it("pencarian daerah", () => {
    expect(cariDaerah("sleman")[0].nama).toBe("Kab. Sleman");
    expect(cariDaerah("kota yogya")[0].id).toBe("kota-yogyakarta");
    expect(cariDaerah("")).toEqual([]);
  });
});
