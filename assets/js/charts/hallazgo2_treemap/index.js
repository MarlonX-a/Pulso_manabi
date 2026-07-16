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
  let activeBlock = null;

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
    const nodes = [...map.entries()]
      .map(([sectorIdx, value]) => ({
        sectorIdx, sector: sectors[sectorIdx], value,
        share: total ? (value / total) * 100 : 0,
        baseline: baseline.get(sectorIdx) ?? 0,
      }))
      .sort((a, b) => b.value - a.value);
    return { nodes, total };
  }

  function groupNodes(nodes, total, visibleCount) {
    const primary = nodes.slice(0, visibleCount);
    const remainder = nodes.slice(visibleCount);
    if (!remainder.length) return primary;
    return [...primary, {
      sectorIdx: "other",
      sector: { id: "other", name: "Otros sectores" },
      value: d3.sum(remainder, (node) => node.value),
      baseline: d3.sum(remainder, (node) => node.baseline),
      share: total ? (d3.sum(remainder, (node) => node.value) / total) * 100 : 0,
      members: remainder,
      isOther: true,
    }];
  }

  function closeDetail({ restoreFocus = false } = {}) {
    if (!detailEl) return;
    detailEl.hidden = true;
    selectedSector = null;
    activeBlock?.setAttribute("aria-expanded", "false");
    if (restoreFocus) activeBlock?.focus();
    activeBlock = null;
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

  function showDetail(node, block) {
    activeBlock?.setAttribute("aria-expanded", "false");
    activeBlock = block;
    activeBlock.setAttribute("aria-expanded", "true");
    selectedSector = node.sectorIdx;
    const delta = node.baseline ? ((node.value / node.baseline - 1) * 100) : null;
    const memberList = node.isOther
      ? `<div class="fabric-other-list" data-scroll-ok="true" data-scroll-lock="true">${node.members.map((member) => {
        const meta = sectorMeta(member.sector.id);
        return `<span><b>${meta.short}</b><small>${formatInt(member.value)}</small></span>`;
      }).join("")}</div>`
      : "";
    detailEl.innerHTML = `
      <div>
        <b>${node.sector.name}</b><br/>
        <small>${formatInt(node.value)} activos · ${formatPercent(node.share)} del total ${delta != null ? `· ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs ene 2022` : ""}</small>
        ${memberList}
      </div>
      <button type="button" id="fabric-detail-close">Cerrar</button>`;
    detailEl.hidden = false;
    detailEl.querySelector("#fabric-detail-close").addEventListener("click", () => closeDetail({ restoreFocus: true }));
  }

  function render(animate) {
    closeDetail();
    const { nodes: allNodes, total } = computeNodes();
    const rect = el.getBoundingClientRect();
    const width = Math.max(280, rect.width);
    const height = Math.max(240, rect.height);

    let visibleCount = Math.min(12, allNodes.length);
    let root;
    do {
      const nodes = groupNodes(allNodes, total, visibleCount);
      root = d3.hierarchy({ children: nodes })
        .sum((d) => d.value)
        .sort((a, b) => b.value - a.value);
      d3.treemap()
        .tile(d3.treemapSquarify.ratio(1))
        .size([width, height])
        .paddingInner(3)
        .round(true)(root);
      const hasCrampedCell = root.leaves().some((leaf) => (leaf.x1 - leaf.x0) < 106 || (leaf.y1 - leaf.y0) < 58);
      if (!hasCrampedCell || visibleCount <= 5) break;
      visibleCount -= 1;
    } while (visibleCount >= 5);

    const blocks = el.querySelectorAll(".tree-block");
    blocks.forEach((b) => b.remove());

    root.leaves().forEach((leaf, i) => {
      const node = leaf.data;
      const meta = node.isOther
        ? { icon: "", short: `Otros (${node.members.length})`, color: "#8793a8" }
        : sectorMeta(node.sector.id);
      const block = document.createElement("button");
      block.type = "button";
      block.className = "tree-block";
      block.style.background = `linear-gradient(160deg, color-mix(in srgb, ${meta.color} 30%, #0d1120), color-mix(in srgb, ${meta.color} 12%, #0d1120))`;
      block.style.color = meta.color;
      block.style.left = `${leaf.x0}px`;
      block.style.top = `${leaf.y0}px`;
      block.style.width = `${Math.max(0, leaf.x1 - leaf.x0)}px`;
      block.style.height = `${Math.max(0, leaf.y1 - leaf.y0)}px`;
      const w = leaf.x1 - leaf.x0;
      const h = leaf.y1 - leaf.y0;
      const showValue = w >= 108 && h >= 72;
      const showShare = w >= 145 && h >= 108;
      const showIcon = w >= 145;
      block.innerHTML = `<b>${showIcon ? meta.icon : ""}<span>${meta.short}</span></b>${showValue ? `<strong>${formatInt(node.value)}</strong>` : ""}${showShare ? `<small>${formatPercent(node.share)} del total</small>` : ""}`;
      block.title = `${node.sector.name} · ${formatInt(node.value)} activos · ${formatPercent(node.share)} del total`;
      block.setAttribute("aria-label", block.title);
      block.setAttribute("aria-expanded", "false");
      block.addEventListener("click", () => showDetail(node, block));
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

  let resizeObserver = null;
  let resizeRaf = null;

  return {
    id: "hallazgo2_treemap",
    mount() {
      periodSelect = document.getElementById("fabric-period");
      typeToggle = document.getElementById("fabric-type-toggle");
      buildPeriodOptions();
      wireToolbar();

      detailEl = document.createElement("div");
      detailEl.className = "fabric-detail";
      detailEl.setAttribute("role", "region");
      detailEl.setAttribute("aria-label", "Detalle de la actividad seleccionada");
      detailEl.hidden = true;
      el.parentElement.appendChild(detailEl);

      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => render(false));
      });
      resizeObserver.observe(el);
      render(false);
    },
    enter() {
      render(true);
    },
    leave() {
      closeDetail();
      gsap.killTweensOf(el.querySelectorAll(".tree-block"));
    },
    update() {},
    resize() { render(false); },
    destroy() {
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeRaf);
      detailEl?.remove();
    },
  };
}
