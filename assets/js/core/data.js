let cachedData = null;

export async function loadDataset() {
  if (cachedData) return cachedData;
  const url = new URL("../../../data/dataset.json", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar dataset.json (${response.status})`);
  cachedData = await response.json();
  return cachedData;
}

export function activeIndexes(data, filters) {
  return {
    period: filters.period == null ? null : data.dimensions.periods.indexOf(filters.period),
    canton: filters.canton == null ? null : data.dimensions.cantons.indexOf(filters.canton),
    sector: filters.sector == null ? null : data.dimensions.sectors.findIndex((item) => item.id === filters.sector),
    type: filters.type == null ? null : data.dimensions.types.indexOf(filters.type),
  };
}

export function matchesActive(data, row, filters, ignore) {
  const index = activeIndexes(data, filters);
  return (ignore === "period" || index.period == null || row[0] === index.period)
    && (ignore === "sector" || index.sector == null || row[1] === index.sector)
    && (ignore === "canton" || index.canton == null || row[2] === index.canton)
    && (ignore === "type" || index.type == null || row[3] === index.type);
}

const analysisCache = new Map();

export function analyseActive(data, filters) {
  const cacheKey = `${filters.period}|${filters.sector ?? ""}|${filters.canton ?? ""}|${filters.type ?? ""}`;
  if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey);

  const periodIndex = data.dimensions.periods.indexOf(filters.period);
  const hasData = periodIndex >= 0 && Boolean(data.coverage.active[periodIndex]);
  const current = hasData
    ? data.activeCube.filter((row) => matchesActive(data, row, filters))
    : [];
  const total = hasData ? current.reduce((sum, row) => sum + row[4], 0) : null;

  const cantonMap = new Map();
  const sectorMap = new Map();
  for (const row of current) {
    cantonMap.set(row[2], (cantonMap.get(row[2]) ?? 0) + row[4]);
    sectorMap.set(row[1], (sectorMap.get(row[1]) ?? 0) + row[4]);
  }

  const trendRows = data.activeCube.filter((row) => matchesActive(data, row, filters, "period"));
  const trendMap = new Map();
  for (const row of trendRows) {
    trendMap.set(row[0], (trendMap.get(row[0]) ?? 0) + row[4]);
  }

  const priorEntry = [...trendMap.entries()]
    .filter(([index]) => index < periodIndex)
    .sort((a, b) => b[0] - a[0])[0];
  const prior = priorEntry ? priorEntry[1] : null;

  const result = {
    total,
    cantons: [...cantonMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    sectors: [...sectorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    trendMap,
    hasData,
    delta: total != null && prior != null && prior !== 0 ? (total / prior - 1) * 100 : null,
  };
  analysisCache.set(cacheKey, result);
  return result;
}
