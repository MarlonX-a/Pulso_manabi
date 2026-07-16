import * as d3 from "d3";
import { sectorMeta } from "../../core/sectors.js";
import { formatInt, formatPercent, formatPeriod } from "../../core/format.js";

export function createTreemapChart({ el, data, gsap }) {
  const periods = data.dimensions.periods;
  const sectors = data.dimensions.sectors;
  const types = data.dimensions.types;
  let currentPeriod = data.metadata.latestPeriod;
  let currentType = "all";
  let periodSelect = null;
  let typeToggle = null;
  let detailEl = null;
  let selectedSector = null;

  function rollupByPeriod(period, type) {
    const periodIdx = periods.indexOf(period);
    const typeIdx = type === "all" ? null : types.indexOf(type);
    const map = new Map();
    for (const row of data.activeCube) {
      if (row[0] !== periodIdx) continue;
      if (typeIdx != null && row[3] !== typeIdx) continue;
      map.set(row[1], (map.get(row[1]) ?? 0) + row[4]);
    }
    return map;
  }

  function computeNodes() {
    const map = rollupByPeriod(currentPeriod, currentType);
    const baseline = rollupByPeriod("2022-01", currentType);
    const total = d3.sum([...map.values()]);
    return [...map.entries()]
      .map(([sectorIdx, value]) => ({
        sectorIdx, sector: sectors[sectorIdx], value,
        share: total ? (value / total) * 100 : 0,
        baseline: baseline.get(sectorIdx) ?? 0,
      }))
      .sort((a, b) => b.value - a.value);
  }

  function buildPeriodOptions() {
    const byYear = new Map();
    periods.forEach((period) => {
      const year = period.slice(0, 4);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(period);
    });
    let html = "";
    for (const [year, list] of byYear) {
      html += `<optgroup label="${year}">${list.map((p) => `<option value="${p}" ${p === currentPeriod ? "selected" : ""}>${formatPeriod(p)}</option>`).join("")}</optgroup>`;
    }
    periodSelect.innerHTML = html;
  }

  function showDetail(node) {
    selectedSector = node.sectorIdx;
    const delta = node.baseline ? ((node.value / node.baseline - 1) * 100) : null;
    detailEl.innerHTML = `
      <div>
        <b>${node.sector.name}</b><br/>
        <small>${formatInt(node.value)} activos · ${formatPercent(node.share)} del total ${delta != null ? `· ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs ene 2022` : ""}</small>
      </div>
      <button type="button" id="fabric-detail-close">Cerrar</button>`;
    detailEl.hidden = false;
    detailEl.querySelector("#fabric-detail-close").addEventListener("click", () => {
      detailEl.hidden = true;
      selectedSector = null;
    });
  }

  function render(animate) {
    const nodes = computeNodes();
    const rect = el.getBoundingClientRect();
    const width = Math.max(280, rect.width);
    const height = Math.max(240, rect.height);

    const root = d3.hierarchy({ children: nodes }).sum((d) => d.value);
    d3.treemap().size([width, height]).paddingInner(3).round(true)(root);

    const blocks = el.querySelectorAll(".tree-block");
    blocks.forEach((b) => b.remove());

    root.leaves().forEach((leaf, i) => {
      const node = leaf.data;
      const meta = sectorMeta(node.sector.id);
      const block = document.createElement("div");
      block.className = "tree-block";
      block.style.background = `linear-gradient(160deg, color-mix(in srgb, ${meta.color} 30%, #0d1120), color-mix(in srgb, ${meta.color} 12%, #0d1120))`;
      block.style.color = meta.color;
      block.style.left = `${leaf.x0}px`;
      block.style.top = `${leaf.y0}px`;
      block.style.width = `${Math.max(0, leaf.x1 - leaf.x0)}px`;
      block.style.height = `${Math.max(0, leaf.y1 - leaf.y0)}px`;
      const w = leaf.x1 - leaf.x0;
      const h = leaf.y1 - leaf.y0;
      const showDetails = w > 70 && h > 46;
      block.innerHTML = `
        <b>${meta.icon}${meta.short}</b>
        <strong>${formatInt(node.value)}</strong>
        ${showDetails ? `<small>${formatPercent(node.share)} del total</small>` : ""}`;
      block.addEventListener("click", () => showDetail(node));
      block.addEventListener("mouseenter", (event) => {
        block.title = `${node.sector.name} · ${formatInt(node.value)} activos`;
      });
      if (animate) {
        block.style.opacity = "0";
        block.style.transform = "scale(.85)";
      }
      el.appendChild(block);
      if (animate) {
        gsap.to(block, { opacity: 1, scale: 1, duration: 0.4, delay: i * 0.025, ease: "power2.out" });
      }
    });
  }

  function wireToolbar() {
    periodSelect.addEventListener("change", () => {
      currentPeriod = periodSelect.value;
      render(false);
    });
    typeToggle.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-type]");
      if (!btn) return;
      currentType = btn.dataset.type;
      [...typeToggle.children].forEach((b) => b.classList.toggle("active", b === btn));
      render(false);
    });
  }

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(false), 180);
  }

  return {
    id: "hallazgo2_treemap",
    mount() {
      periodSelect = document.getElementById("fabric-period");
      typeToggle = document.getElementById("fabric-type-toggle");
      buildPeriodOptions();
      wireToolbar();

      detailEl = document.createElement("div");
      detailEl.className = "fabric-detail";
      detailEl.hidden = true;
      el.parentElement.appendChild(detailEl);

      window.addEventListener("resize", onResize);
      render(false);
    },
    enter() {
      render(true);
    },
    update() {},
    resize() { render(false); },
    destroy() {
      window.removeEventListener("resize", onResize);
      detailEl?.remove();
    },
  };
}
