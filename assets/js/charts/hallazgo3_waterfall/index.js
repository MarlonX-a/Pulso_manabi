import * as d3 from "d3";
import { formatSigned, formatInt } from "../../core/format.js";
import { positionTooltip } from "../../core/overlay.js";

const VIEW_W = 760;
const VIEW_H = 380;
const MARGIN = { top: 18, right: 16, bottom: 46, left: 54 };
const YEARS = ["2022", "2023", "2024", "2025", "2026"];
const MONTH_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function createWaterfallChart({ el, data, gsap }) {
  const regMap = new Map(data.overall.registrations.map(([i, v]) => [i, v]));
  const closMap = new Map(data.overall.closures.map(([i, v]) => [i, v]));
  const periods = data.dimensions.periods;

  let currentYear = "2026";
  let svg = null;
  let tooltip = null;
  let yearButtons = null;

  function monthsForYear(year) {
    return periods
      .map((period, index) => ({ period, index }))
      .filter(({ period }) => period.startsWith(`${year}-`));
  }

  function computeSeries(year) {
    const months = monthsForYear(year);
    let cumulative = 0;
    const bars = months.map(({ period, index }) => {
      const hasReg = regMap.has(index);
      const hasClos = closMap.has(index);
      if (!hasReg && !hasClos) {
        return { period, label: MONTH_SHORT[Number(period.slice(5, 7)) - 1], gap: true, start: cumulative, end: cumulative, value: 0 };
      }
      const value = (regMap.get(index) ?? 0) - (closMap.get(index) ?? 0);
      const start = cumulative;
      cumulative += value;
      return {
        period, label: MONTH_SHORT[Number(period.slice(5, 7)) - 1], gap: false,
        start, end: cumulative, value, registrations: regMap.get(index) ?? 0, closures: closMap.get(index) ?? 0,
      };
    });
    bars.push({ period: `${year}`, label: "TOTAL", total: true, start: 0, end: cumulative, value: cumulative });
    return bars;
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "data-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function showTooltip(event, bar) {
    const tip = ensureTooltip();
    if (bar.total) {
      tip.innerHTML = `<strong>${bar.period} · balance del año</strong><span>${formatSigned(bar.value)} contribuyentes</span>`;
    } else if (bar.gap) {
      tip.innerHTML = `<strong>${bar.period}</strong><span>Sin dato disponible</span>`;
    } else {
      tip.innerHTML = `<strong>${bar.period}</strong><span>Inscripciones ${formatInt(bar.registrations)} · Cierres ${formatInt(bar.closures)}</span><span>Balance ${formatSigned(bar.value)}</span>`;
    }
    positionTooltip(tip, event);
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = "none";
  }

  function render(animate) {
    const bars = computeSeries(currentYear);
    const x = d3.scaleBand().domain(bars.map((b) => b.period)).range([MARGIN.left, VIEW_W - MARGIN.right]).padding(0.32);
    const extent = d3.extent(bars.flatMap((b) => [b.start, b.end]));
    const pad = Math.max(20, (extent[1] - extent[0]) * 0.12);
    const y = d3.scaleLinear().domain([Math.min(0, extent[0] - pad), extent[1] + pad]).range([VIEW_H - MARGIN.bottom, MARGIN.top]).nice();

    svg.select(".wf-zero-line")
      .attr("x1", MARGIN.left).attr("x2", VIEW_W - MARGIN.right)
      .attr("y1", y(0)).attr("y2", y(0));

    const barSel = svg.select(".wf-bars").selectAll("rect.wf-bar").data(bars, (b) => b.period);
    barSel.exit().remove();
    const barEnter = barSel.enter().append("rect").attr("class", "wf-bar").attr("rx", 3);
    const barMerge = barEnter.merge(barSel)
      .attr("x", (b) => x(b.period))
      .attr("width", x.bandwidth())
      .attr("class", (b) => `wf-bar ${b.total ? "wf-bar-total" : b.gap ? "" : b.value >= 0 ? "wf-bar-up" : "wf-bar-down"}`)
      .style("opacity", (b) => (b.gap ? 0.18 : 1))
      .on("mousemove", (event, b) => showTooltip(event, b))
      .on("mouseleave", hideTooltip);

    if (animate) {
      barMerge
        .attr("y", y(0)).attr("height", 0)
        .transition().duration(650).delay((_, i) => i * 45).ease(d3.easeCubicOut)
        .attr("y", (b) => y(Math.max(b.start, b.end)))
        .attr("height", (b) => Math.max(1, Math.abs(y(b.start) - y(b.end))));
    } else {
      barMerge
        .attr("y", (b) => y(Math.max(b.start, b.end)))
        .attr("height", (b) => Math.max(1, Math.abs(y(b.start) - y(b.end))));
    }

    const connectors = bars.slice(0, -1).map((b, i) => ({
      x1: x(b.period) + x.bandwidth(), x2: x(bars[i + 1].period),
      y: y(b.end),
    }));
    const connSel = svg.select(".wf-connectors").selectAll("line.wf-connector").data(connectors);
    connSel.exit().remove();
    connSel.enter().append("line").attr("class", "wf-connector")
      .merge(connSel)
      .attr("x1", (c) => c.x1).attr("x2", (c) => c.x2).attr("y1", (c) => c.y).attr("y2", (c) => c.y);

    const labelSel = svg.select(".wf-labels").selectAll("text.wf-label").data(bars, (b) => b.period);
    labelSel.exit().remove();
    labelSel.enter().append("text").attr("class", "wf-label")
      .merge(labelSel)
      .attr("x", (b) => x(b.period) + x.bandwidth() / 2)
      .attr("y", VIEW_H - MARGIN.bottom + 18)
      .attr("text-anchor", "middle")
      .text((b) => b.label);

    const gapSel = svg.select(".wf-gap-labels").selectAll("text.wf-gap-label").data(bars.filter((b) => b.gap));
    gapSel.exit().remove();
    gapSel.enter().append("text").attr("class", "wf-gap-label")
      .merge(gapSel)
      .attr("x", (b) => x(b.period) + x.bandwidth() / 2)
      .attr("y", y(0) - 6)
      .attr("text-anchor", "middle")
      .text("SIN DATO");
  }

  return {
    id: "hallazgo3_waterfall",
    mount() {
      svg = d3.select(el).append("svg")
        .attr("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%").style("height", "100%");
      svg.append("line").attr("class", "wf-zero-line wf-zero");
      svg.append("g").attr("class", "wf-connectors");
      svg.append("g").attr("class", "wf-bars");
      svg.append("g").attr("class", "wf-labels");
      svg.append("g").attr("class", "wf-gap-labels");

      yearButtons = document.getElementById("waterfall-years");
      yearButtons.innerHTML = YEARS.map((year) => `<button type="button" data-year="${year}" class="${year === currentYear ? "active" : ""}">${year}</button>`).join("");
      yearButtons.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-year]");
        if (!btn) return;
        currentYear = btn.dataset.year;
        [...yearButtons.children].forEach((b) => b.classList.toggle("active", b === btn));
        render(true);
      });

      render(false);
    },
    enter() {
      render(true);
    },
    leave() { svg?.selectAll("*").interrupt(); },
    update() {},
    resize() {},
    destroy() {
      tooltip?.remove();
    },
  };
}
