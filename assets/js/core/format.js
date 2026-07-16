const intFormatter = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 });
const signedFormatter = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0, signDisplay: "always" });
const percentFormatter = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

export function formatInt(value) {
  return intFormatter.format(Math.round(value));
}

export function formatSigned(value) {
  return signedFormatter.format(Math.round(value));
}

export function formatPercent(value) {
  return `${percentFormatter.format(value)}%`;
}

const MONTH_NAMES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function formatPeriod(period) {
  const [year, month] = period.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatValue(value, format) {
  if (format === "signed") return formatSigned(value);
  if (format === "percent") return formatPercent(value);
  return formatInt(value);
}
