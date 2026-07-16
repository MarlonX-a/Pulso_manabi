import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "data", "raw");
const outputPath = resolve(projectRoot, "data/dataset.json");

const readCsv = (name, required) => {
  const rows = parse(readFileSync(resolve(sourceRoot, name), "utf8"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const fields = new Set(Object.keys(rows[0] ?? {}));
  const missing = required.filter((field) => !fields.has(field));
  if (missing.length) {
    throw new Error(`${name}: faltan columnas obligatorias: ${missing.join(", ")}`);
  }
  return rows;
};

const activities = readCsv("Dim_Actividad.csv", ["Codigo_Familia", "Actividad_Economica"]);
const locations = readCsv("Dim_Ubicacion.csv", ["Provincia", "Canton", "Parroquia", "Clave_Ubicacion"]);
const dates = readCsv("Dim_Fecha.csv", ["Anio"]);
const activeRows = readCsv("Fact_Activos.csv", [
  "Anio", "Fecha", "Codigo_Familia", "Tipo_Contribuyente", "Canton", "Parroquia", "Total_Activos",
]);
const registrationRows = readCsv("Fact_Inscripciones.csv", [
  "Anio", "Fecha", "Codigo_Familia", "Total_Inscripciones",
]);
const closureRows = readCsv("Fact_Cierres.csv", [
  "Anio", "Fecha", "Codigo_Familia", "Total_Cierres",
]);

const periodOf = (row) => `${row.Anio}-${String(Number(row.Fecha.slice(5, 7))).padStart(2, "0")}`;
const numberOf = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Valor numérico inválido: ${value}`);
  return parsed;
};
const add = (map, key, value) => map.set(key, (map.get(key) ?? 0) + value);
const entries = (map) => [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

const activePeriods = new Set(activeRows.map(periodOf));
const registrationPeriods = new Set(registrationRows.map(periodOf));
const closurePeriods = new Set(closureRows.map(periodOf));
const latestPeriod = [...activePeriods].sort().at(-1);
if (!latestPeriod) throw new Error("Fact_Activos.csv no contiene periodos.");

const [startYear, startMonth] = [...activePeriods].sort()[0].split("-").map(Number);
const [endYear, endMonth] = latestPeriod.split("-").map(Number);
const periods = [];
for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
  periods.push(`${year}-${String(month).padStart(2, "0")}`);
  month += 1;
  if (month === 13) { year += 1; month = 1; }
}

const sectors = activities
  .map((row) => ({ id: row.Codigo_Familia, name: row.Actividad_Economica.trim() }))
  .sort((a, b) => a.id.localeCompare(b.id));
const cantons = [...new Set(locations.map((row) => row.Canton))].sort();
const types = [...new Set(activeRows.map((row) => row.Tipo_Contribuyente || "SIN TIPO"))].sort();

const periodIndex = new Map(periods.map((value, index) => [value, index]));
const sectorIndex = new Map(sectors.map((value, index) => [value.id, index]));
const cantonIndex = new Map(cantons.map((value, index) => [value, index]));
const typeIndex = new Map(types.map((value, index) => [value, index]));

const activeOverall = new Map();
const registrationOverall = new Map();
const closureOverall = new Map();
const activeCube = new Map();
const latestParish = new Map();
const registrationsBySector = new Map();
const closuresBySector = new Map();

for (const row of activeRows) {
  const period = periodOf(row);
  const value = numberOf(row.Total_Activos);
  add(activeOverall, period, value);
  const cubeKey = [
    periodIndex.get(period),
    sectorIndex.get(row.Codigo_Familia),
    cantonIndex.get(row.Canton),
    typeIndex.get(row.Tipo_Contribuyente || "SIN TIPO"),
  ].join("|");
  add(activeCube, cubeKey, value);
  if (period === latestPeriod) {
    add(latestParish, `${cantonIndex.get(row.Canton)}|${row.Parroquia}`, value);
  }
}

for (const row of registrationRows) {
  const period = periodOf(row);
  const value = numberOf(row.Total_Inscripciones);
  add(registrationOverall, period, value);
  add(registrationsBySector, `${periodIndex.get(period)}|${sectorIndex.get(row.Codigo_Familia)}`, value);
}

for (const row of closureRows) {
  const period = periodOf(row);
  const value = numberOf(row.Total_Cierres);
  add(closureOverall, period, value);
  add(closuresBySector, `${periodIndex.get(period)}|${sectorIndex.get(row.Codigo_Familia)}`, value);
}

const compactSeries = (map) => entries(map).map(([period, value]) => [periodIndex.get(period), value]);
const compactCube = entries(activeCube).map(([key, value]) => [...key.split("|").map(Number), value]);
const compactSectorSeries = (map) => entries(map).map(([key, value]) => [...key.split("|").map(Number), value]);
const compactParish = entries(latestParish).map(([key, value]) => {
  const [cantonId, parish] = key.split("|");
  return [Number(cantonId), parish, value];
});

const h1 = (map, year) => entries(map)
  .filter(([period]) => period.startsWith(`${year}-`) && Number(period.slice(5)) <= 6)
  .reduce((sum, [, value]) => sum + value, 0);
const h1Balance2026 = h1(registrationOverall, 2026) - h1(closureOverall, 2026);
const latestActive = activeOverall.get(latestPeriod);

const assertions = [
  [sectors.length === 25, `Se esperaban 25 actividades y se encontraron ${sectors.length}`],
  [cantons.length === 22, `Se esperaban 22 cantones y se encontraron ${cantons.length}`],
  [latestPeriod === "2026-06", `El último periodo esperado era 2026-06 y se encontró ${latestPeriod}`],
  [latestActive === 244515, `El total activo de 2026-06 debe ser 244515 y es ${latestActive}`],
  [h1Balance2026 === -2478, `El balance H1 2026 debe ser -2478 y es ${h1Balance2026}`],
];
for (const [valid, message] of assertions) if (!valid) throw new Error(message);

const storyData = {
  metadata: {
    title: "Pulso Manabí",
    latestPeriod,
    source: "Servicio de Rentas Internas (SRI) · Catastro Tributario",
    territory: "Provincia de Manabí",
    documentedOriginalFiles: 17,
    preparedFiles: [
      "Dim_Actividad.csv",
      "Dim_Fecha.csv",
      "Dim_Ubicacion.csv",
      "Fact_Activos.csv",
      "Fact_Inscripciones.csv",
      "Fact_Cierres.csv",
    ],
    sourceRows: {
      activos: activeRows.length,
      inscripciones: registrationRows.length,
      cierres: closureRows.length,
    },
    dimensionRows: {
      actividades: activities.length,
      ubicaciones: locations.length,
      fechas: dates.length,
    },
  },
  dimensions: { periods, sectors, cantons, types },
  coverage: {
    active: periods.map((period) => activePeriods.has(period)),
    registrations: periods.map((period) => registrationPeriods.has(period)),
    closures: periods.map((period) => closurePeriods.has(period)),
    knownGaps: ["2024-11", "2025-12"],
  },
  summary: {
    latestActive,
    firstActive: activeOverall.get("2022-01"),
    june2025Active: activeOverall.get("2025-06"),
    h1Registrations2026: h1(registrationOverall, 2026),
    h1Closures2026: h1(closureOverall, 2026),
    h1Balance2026,
  },
  overall: {
    active: compactSeries(activeOverall),
    registrations: compactSeries(registrationOverall),
    closures: compactSeries(closureOverall),
  },
  activeCube: compactCube,
  latestParish: compactParish,
  flowsBySector: {
    registrations: compactSectorSeries(registrationsBySector),
    closures: compactSectorSeries(closuresBySector),
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(storyData));
console.log(`Datos preparados: ${activeRows.length.toLocaleString("es-EC")} filas activas -> ${(JSON.stringify(storyData).length / 1024 / 1024).toFixed(2)} MB.`);
