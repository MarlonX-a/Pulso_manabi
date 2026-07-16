import * as d3 from "d3";
import { formatInt, formatPercent } from "../../core/format.js";
import { positionTooltip } from "../../core/overlay.js";

const PALETTE = d3.quantize(d3.interpolateHcl("#2f80ed", "#6c63ff"), 22);

export function createSunburstChart({ el, data }) {
  const cantons = data.dimensions.cantons;
  const grouped = new Map();
  data.latestParish.forEach(([cantonIdx, parish, value]) => {
    if (!grouped.has(cantonIdx)) grouped.set(cantonIdx, []);
    grouped.get(cantonIdx).push({ name: parish, value });
  });
  const total = d3.sum(data.latestParish, (d) => d[2]);
  const cantonTotals = [...grouped.entries()]
    .map(([cantonIdx, parishes]) => ({ cantonIdx, name: cantons[cantonIdx], value: d3.sum(parishes, (p) => p.value) }))
    .sort((a, b) => b.value - a.value);

  const color = new Map(cantonTotals.map((c, i) => [c.cantonIdx, PALETTE[i % PALETTE.length]]));

  let svg = null;
  let centerText = null;
  let rankEl = null;
  let zoomed = null;
  let tooltip = null;
  let resizeObserver = null;
  let resizeRaf = null;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.className = "data-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
    return tooltip;
  }
  function showTooltip(event, html) {
    const tip = ensureTooltip();
    tip.innerHTML = html;
    positionTooltip(tip, event);
  }
  function hideTooltip() { if (tooltip) tooltip.style.display = "none"; }

  function dimensions() {
    const rect = el.getBoundingClientRect();
    return { width: Math.max(260, rect.width), height: Math.max(260, rect.height) };
  }

  function renderRank() {
    rankEl.innerHTML = cantonTotals.slice(0, 6).map((c, i) => `
      <button type="button" class="rank-row" data-canton="${c.cantonIdx}" aria-label="${c.name}: ${formatInt(c.value)} activos">
        <span>${i + 1}</span>
        <b>${c.name}</b>
        <small>${formatInt(c.value)}</small>
      </button>`).join("");

    rankEl.querySelectorAll(".rank-row").forEach((row) => {
      const cantonIdx = Number(row.dataset.canton);
      row.addEventListener("mouseenter", () => highlight(cantonIdx));
      row.addEventListener("mouseleave", () => highlight(null));
      row.addEventListener("click", () => zoomTo(cantonIdx));
    });
  }

  function highlight(cantonIdx) {
    svg.selectAll("path.arc-canton, path.arc-parish")
      .style("opacity", (d) => (cantonIdx == null || d.data.cantonIdx === cantonIdx ? 1 : 0.28));
    rankEl.querySelectorAll(".rank-row").forEach((row) => {
      row.classList.toggle("is-active", Number(row.dataset.canton) === cantonIdx);
    });
  }

  function renderOverview(animate) {
    const { width, height } = dimensions();
    const radius = Math.min(width, height) / 2;
    const ring = radius / 3;

    const root = d3.hierarchy({
      children: cantonTotals.map((c) => ({
        cantonIdx: c.cantonIdx, name: c.name, value: c.value,
        children: grouped.get(c.cantonIdx).map((p) => ({ ...p, cantonIdx: c.cantonIdx })),
      })),
    }).sum((d) => d.value).sort((a, b) => b.value - a.value);
    d3.partition().size([2 * Math.PI, 3])(root);

    const arc = d3.arc()
      .startAngle((d) => d.x0).endAngle((d) => d.x1)
      .padAngle(0.006).padRadius(radius)
      .innerRadius((d) => d.y0 * ring)
      .outerRadius((d) => d.y1 * ring - 1);

    svg.attr("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);

    const cantonNodes = root.descendants().filter((d) => d.depth === 1);
    const parishNodes = root.descendants().filter((d) => d.depth === 2);

    const cantonSel = svg.select(".arcs-canton").selectAll("path.arc-canton").data(cantonNodes, (d) => d.data.cantonIdx);
    cantonSel.exit().remove();
    const cantonPaths = cantonSel.enter().append("path").attr("class", "arc-canton")
      .merge(cantonSel)
      .attr("fill", (d) => color.get(d.data.cantonIdx))
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.data.name}</strong><span>${formatInt(d.value)} activos · ${formatPercent((d.value / total) * 100)} del total</span>`))
      .on("mouseleave", hideTooltip)
      .on("click", (event, d) => zoomTo(d.data.cantonIdx));

    const parishSel = svg.select(".arcs-parish").selectAll("path.arc-parish").data(parishNodes, (d) => `${d.data.cantonIdx}-${d.data.name}`);
    parishSel.exit().remove();
    const parishPaths = parishSel.enter().append("path").attr("class", "arc-parish")
      .merge(parishSel)
      .attr("fill", (d) => d3.color(color.get(d.data.cantonIdx)).brighter(0.4 + (d.x1 - d.x0) * 2))
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.data.name}</strong><span>${d.parent.data.name} · ${formatInt(d.value)} activos</span>`))
      .on("mouseleave", hideTooltip)
      .on("click", (event, d) => zoomTo(d.data.cantonIdx));

    const allPaths = cantonPaths.merge(parishPaths);
    if (animate) {
      allPaths.attr("d", (d) => arc({ ...d, x1: d.x0 }))
        .transition().duration(700).delay((d) => d.depth * 120)
        .attrTween("d", function (d) {
          const i = d3.interpolate(d.x0, d.x1);
          return (t) => arc({ ...d, x1: i(t) });
        });
    } else {
      allPaths.attr("d", arc);
    }

    centerText.html(`<strong>${formatInt(total)}</strong><small>Activos · Manabí</small>`);
    centerText.style("cursor", "default");
    centerText.on("click", null);
    renderRank();
  }

  function renderZoom(cantonIdx, animate) {
    const { width, height } = dimensions();
    const radius = Math.min(width, height) / 2;
    const parishes = grouped.get(cantonIdx) ?? [];
    const cantonName = cantons[cantonIdx];
    const cantonTotal = d3.sum(parishes, (p) => p.value);

    svg.attr("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`);
    svg.select(".arcs-canton").selectAll("path").remove();

    const pie = d3.pie().value((d) => d.value).sort((a, b) => b.value - a.value);
    const arcs = pie(parishes);
    const arcGen = d3.arc().innerRadius(radius * 0.42).outerRadius(radius * 0.96).padAngle(0.008).cornerRadius(3);

    const base = d3.color(color.get(cantonIdx));
    const shade = d3.scaleLinear().domain([0, parishes.length - 1 || 1]).range([-0.3, 0.5]);

    const sel = svg.select(".arcs-parish").selectAll("path.arc-parish").data(arcs, (d) => d.data.name);
    sel.exit().remove();
    const paths = sel.enter().append("path").attr("class", "arc-parish")
      .merge(sel)
      .attr("fill", (d, i) => (shade(i) >= 0 ? base.brighter(shade(i)) : base.darker(-shade(i))))
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.data.name}</strong><span>${cantonName} · ${formatInt(d.data.value)} activos · ${formatPercent((d.data.value / cantonTotal) * 100)} del cantón</span>`))
      .on("mouseleave", hideTooltip);

    if (animate) {
      paths.each(function (d) { this._current = { startAngle: d.startAngle, endAngle: d.startAngle }; });
      paths.transition().duration(650).delay((_, i) => i * 30)
        .attrTween("d", function (d) {
          const i = d3.interpolate(this._current, d);
          this._current = i(1);
          return (t) => arcGen(i(t));
        });
    } else {
      paths.attr("d", arcGen);
    }

    centerText.html(`<strong>${formatInt(cantonTotal)}</strong><small>${cantonName}</small><em>Volver a Manabí</em>`);
    centerText.style("cursor", "pointer");
    centerText.on("click", () => zoomTo(null));

    rankEl.innerHTML = parishes.slice().sort((a, b) => b.value - a.value).slice(0, 8).map((p, i) => `
      <div class="rank-row" aria-label="${p.name}: ${formatInt(p.value)} activos">
        <span>${i + 1}</span>
        <b>${p.name}</b>
        <small>${formatInt(p.value)}</small>
      </div>`).join("") + `<button type="button" class="ghost-button" id="sunburst-back" style="margin-top:8px">Volver a Manabí</button>`;
    rankEl.querySelector("#sunburst-back")?.addEventListener("click", () => zoomTo(null));
  }

  function zoomTo(cantonIdx) {
    zoomed = cantonIdx;
    if (cantonIdx == null) renderOverview(true);
    else renderZoom(cantonIdx, true);
  }

  return {
    id: "hallazgo1_sunburst",
    mount() {
      const wrap = d3.select(el);
      svg = wrap.append("svg").style("width", "100%").style("height", "100%").style("overflow", "visible");
      svg.append("g").attr("class", "arcs-canton");
      svg.append("g").attr("class", "arcs-parish");

      const foreign = svg.append("foreignObject").attr("class", "sunburst-center");
      centerText = d3.select(document.createElement("div"));
      const centerHtml = document.createElement("div");
      centerHtml.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;width:100%;height:100%;pointer-events:auto;";
      centerText = d3.select(centerHtml);
      foreign.node().appendChild(centerHtml);

      const resizeFO = () => {
        const { width, height } = dimensions();
        const size = Math.min(width, height) * 0.4;
        foreign.attr("x", -size / 2).attr("y", -size / 2).attr("width", size).attr("height", size);
      };
      resizeFO();

      rankEl = document.getElementById("territory-rank");
      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          resizeFO();
          if (zoomed == null) renderOverview(false);
          else renderZoom(zoomed, false);
        });
      });
      resizeObserver.observe(el);

      renderOverview(false);
    },
    enter() {
      if (zoomed == null) renderOverview(true);
      else renderZoom(zoomed, true);
    },
    leave() { svg?.selectAll("*").interrupt(); },
    update() {},
    resize() {},
    destroy() {
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeRaf);
      tooltip?.remove();
    },
  };
}
