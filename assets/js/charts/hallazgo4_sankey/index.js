import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { formatInt } from "../../core/format.js";

const VIEW_W = 720;
const VIEW_H = 300;

export function createSankeyChart({ el, data }) {
  const rows = data.metadata.sourceRows;
  const dimRows = data.metadata.dimensionRows;
  const dimTotal = dimRows.actividades + dimRows.ubicaciones + dimRows.fechas;

  const nodeNames = [
    "17 archivos SRI",
    "Fact_Activos.csv", "Fact_Inscripciones.csv", "Fact_Cierres.csv", "Dim_* (3 archivos)",
    "dataset.json",
    "Territorio", "Actividades", "Evolución", "Calidad", "Atlas vivo",
  ];
  const nodeColor = {
    "17 archivos SRI": "#9db0c2",
    "Fact_Activos.csv": "#2f80ed", "Fact_Inscripciones.csv": "#27ae60", "Fact_Cierres.csv": "#eb5757", "Dim_* (3 archivos)": "#6c63ff",
    "dataset.json": "#21d4c2",
    "Territorio": "#6c63ff", "Actividades": "#f2c94c", "Evolución": "#eb5757", "Calidad": "#56ccf2", "Atlas vivo": "#21d4c2",
  };

  const w = (n) => Math.sqrt(n);
  const links = [
    { source: "17 archivos SRI", target: "Fact_Activos.csv", value: w(rows.activos), real: rows.activos },
    { source: "17 archivos SRI", target: "Fact_Inscripciones.csv", value: w(rows.inscripciones), real: rows.inscripciones },
    { source: "17 archivos SRI", target: "Fact_Cierres.csv", value: w(rows.cierres), real: rows.cierres },
    { source: "17 archivos SRI", target: "Dim_* (3 archivos)", value: w(dimTotal) * 1.4, real: dimTotal },
    { source: "Fact_Activos.csv", target: "dataset.json", value: w(rows.activos), real: rows.activos },
    { source: "Fact_Inscripciones.csv", target: "dataset.json", value: w(rows.inscripciones), real: rows.inscripciones },
    { source: "Fact_Cierres.csv", target: "dataset.json", value: w(rows.cierres), real: rows.cierres },
    { source: "Dim_* (3 archivos)", target: "dataset.json", value: w(dimTotal) * 1.4, real: dimTotal },
    { source: "dataset.json", target: "Territorio", value: 14, real: null },
    { source: "dataset.json", target: "Actividades", value: 14, real: null },
    { source: "dataset.json", target: "Evolución", value: 14, real: null },
    { source: "dataset.json", target: "Calidad", value: 14, real: null },
    { source: "dataset.json", target: "Atlas vivo", value: 14, real: null },
  ];

  let svg = null;
  let tooltip = null;

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
    tip.style.display = "block";
    tip.style.left = `${event.clientX}px`;
    tip.style.top = `${event.clientY}px`;
  }
  function hideTooltip() { if (tooltip) tooltip.style.display = "none"; }

  function render(animate) {
    const graph = sankey()
      .nodeId((d) => d.name)
      .nodeWidth(14)
      .nodePadding(14)
      .extent([[8, 10], [VIEW_W - 8, VIEW_H - 10]])({
        nodes: nodeNames.map((name) => ({ name })),
        links: links.map((l) => ({ ...l })),
      });

    const linkSel = svg.select(".sankey-links").selectAll("path.sankey-link").data(graph.links);
    linkSel.exit().remove();
    const linkPaths = linkSel.enter().append("path").attr("class", "sankey-link")
      .merge(linkSel)
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke", (d) => nodeColor[d.source.name] ?? "#7f899b")
      .attr("stroke-width", (d) => Math.max(1.5, d.width))
      .attr("stroke-opacity", 0.38)
      .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.source.name} → ${d.target.name}</strong>${d.real != null ? `<span>${formatInt(d.real)} filas</span>` : ""}`))
      .on("mouseleave", hideTooltip);

    if (animate) {
      linkPaths.each(function (d) {
        const length = this.getTotalLength();
        d3.select(this).attr("stroke-dasharray", `${length} ${length}`).attr("stroke-dashoffset", length)
          .transition().duration(900).delay((d.source.depth ?? 0) * 180).ease(d3.easeCubicOut)
          .attr("stroke-dashoffset", 0);
      });
    } else {
      linkPaths.attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
    }

    const nodeSel = svg.select(".sankey-nodes").selectAll("g.sankey-node").data(graph.nodes, (d) => d.name);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel.enter().append("g").attr("class", "sankey-node");
    nodeEnter.append("rect");
    nodeEnter.append("text");
    const nodeMerge = nodeEnter.merge(nodeSel);
    nodeMerge.attr("transform", (d) => `translate(${d.x0},${d.y0})`);
    nodeMerge.select("rect")
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => Math.max(2, d.y1 - d.y0))
      .attr("fill", (d) => nodeColor[d.name] ?? "#7f899b")
      .attr("rx", 3)
      .on("mousemove", (event, d) => {
        svg.selectAll(".sankey-link").attr("stroke-opacity", (l) => (l.source === d || l.target === d ? 0.75 : 0.12));
        showTooltip(event, `<strong>${d.name}</strong>`);
      })
      .on("mouseleave", () => {
        svg.selectAll(".sankey-link").attr("stroke-opacity", 0.38);
        hideTooltip();
      });
    nodeMerge.select("text")
      .attr("x", (d) => (d.x0 < VIEW_W / 2 ? d.x1 - d.x0 + 8 : -8))
      .attr("y", (d) => (d.y1 - d.y0) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.x0 < VIEW_W / 2 ? "start" : "end"))
      .text((d) => d.name);
  }

  function renderCoverage() {
    const el2 = document.getElementById("coverage-matrix");
    const periods = data.dimensions.periods;
    const series = [
      { key: "active", label: "Activos", cls: "active" },
      { key: "registrations", label: "Inscripciones", cls: "registrations" },
      { key: "closures", label: "Cierres", cls: "closures" },
    ];
    el2.innerHTML = series.map((s) => `
      <div class="coverage-row">
        <span>${s.label}</span>
        <div class="coverage-cells">
          ${periods.map((p, i) => {
            const present = data.coverage[s.key][i];
            const isGap = data.coverage.knownGaps.includes(p);
            return `<i class="${present ? `is-present ${s.cls}` : isGap ? "is-gap" : ""}" title="${p}"></i>`;
          }).join("")}
        </div>
      </div>`).join("");
  }

  return {
    id: "hallazgo4_sankey",
    mount() {
      svg = d3.select(el).append("svg")
        .attr("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%").style("height", "100%");
      svg.append("g").attr("class", "sankey-links");
      svg.append("g").attr("class", "sankey-nodes");
      renderCoverage();
      render(false);
    },
    enter() { render(true); },
    update() {},
    resize() {},
    destroy() { tooltip?.remove(); },
  };
}
