import * as d3 from "d3";
import { analyseActive } from "../../core/data.js";
import { sectorMeta } from "../../core/sectors.js";
import { formatInt, formatPercent, formatPeriod } from "../../core/format.js";
import { animateCount } from "../../core/motion.js";

const TREND_W = 460;
const TREND_H = 150;

export function createAtlasChart({ el, data, state }) {
  const periods = data.dimensions.periods;
  const cantons = data.dimensions.cantons;
  const sectors = data.dimensions.sectors;
  const types = data.dimensions.types;

  const filters = state.atlasFilters;
  filters.period = data.metadata.latestPeriod;

  let mode = "explore";
  let playing = false;
  let playTimer = null;

  const kpiEl = document.getElementById("atlas-kpi");
  const trendEl = document.getElementById("atlas-trend");
  const cantonsEl = document.getElementById("atlas-cantons");
  const sectorsEl = document.getElementById("atlas-sectors");
  const narrativeEl = document.getElementById("atlas-narrative");
  const chipsEl = document.getElementById("atlas-chips");
  const periodInput = document.getElementById("atlas-period");
  const periodLabel = document.getElementById("atlas-period-label");
  const playBtn = document.getElementById("atlas-play");
  const resetBtn = document.getElementById("atlas-reset");
  const modeSwitchEl = document.querySelector(".mode-switch");

  function setPeriodByIndex(i, animate) {
    filters.period = periods[Math.max(0, Math.min(periods.length - 1, i))];
    periodInput.value = periods.indexOf(filters.period);
    periodLabel.textContent = formatPeriod(filters.period);
    renderAll(animate);
  }

  function renderChips() {
    const chips = [];
    if (filters.canton != null) chips.push({ key: "canton", label: filters.canton });
    if (filters.sector != null) chips.push({ key: "sector", label: sectors.find((s) => s.id === filters.sector)?.name ?? filters.sector });
    if (filters.type != null) chips.push({ key: "type", label: filters.type });
    chipsEl.innerHTML = chips.map((c) => `
      <span class="filter-chip" data-key="${c.key}">${c.label}
        <button type="button" aria-label="Quitar filtro ${c.label}">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>`).join("");
    chipsEl.querySelectorAll(".filter-chip button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.parentElement.dataset.key;
        filters[key] = null;
        document.querySelector(`.filter-popover[data-filter="${key}"]`).classList.remove("is-set");
        renderAll(false);
      });
    });
    document.querySelectorAll(".filter-popover").forEach((pop) => {
      pop.classList.toggle("is-set", filters[pop.dataset.filter] != null);
    });
  }

  function renderKpi(analysis, animate) {
    const label = filters.canton || filters.sector || filters.type
      ? "Contribuyentes activos (filtro aplicado)"
      : "Contribuyentes activos · Manabí";
    let strong = kpiEl.querySelector("strong");
    if (!strong) {
      kpiEl.innerHTML = `<small></small><strong data-current-value="0">0</strong><span class="delta-pill"></span>`;
      strong = kpiEl.querySelector("strong");
    }
    kpiEl.querySelector("small").textContent = label;
    if (animate) animateCount(strong, analysis.total);
    else { strong.textContent = formatInt(analysis.total); strong.dataset.currentValue = String(analysis.total); }

    const pill = kpiEl.querySelector(".delta-pill");
    if (analysis.delta == null) {
      pill.textContent = "Primer periodo con dato";
      pill.className = "delta-pill";
    } else {
      const up = analysis.delta >= 0;
      pill.textContent = `${formatPercent(analysis.delta)} vs mes anterior`;
      pill.className = `delta-pill ${up ? "is-up" : "is-down"}`;
    }
  }

  function renderTrend(analysis) {
    const points = periods.map((p, i) => [i, analysis.trendMap.get(i) ?? null]);
    const known = points.filter((p) => p[1] != null);
    const x = d3.scaleLinear().domain([0, periods.length - 1]).range([12, TREND_W - 12]);
    const y = d3.scaleLinear().domain(d3.extent(known, (p) => p[1])).range([TREND_H - 16, 8]).nice();
    const line = d3.line().defined((p) => p[1] != null).x((p) => x(p[0])).y((p) => y(p[1])).curve(d3.curveMonotoneX);

    const currentIndex = periods.indexOf(filters.period);
    const currentValue = analysis.trendMap.get(currentIndex);

    trendEl.innerHTML = `<small>Tendencia · 54 meses ${filters.canton || filters.sector || filters.type ? "(filtrada)" : ""}</small>
      <svg viewBox="0 0 ${TREND_W} ${TREND_H}" preserveAspectRatio="none" style="width:100%;flex:1">
        <path d="${line(points)}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="${x(currentIndex)}" x2="${x(currentIndex)}" y1="8" y2="${TREND_H - 16}" stroke="rgba(255,255,255,.28)" stroke-dasharray="3 4"/>
        ${currentValue != null ? `<circle cx="${x(currentIndex)}" cy="${y(currentValue)}" r="4.5" fill="var(--accent)"/>` : ""}
      </svg>`;
  }

  function renderRankCard(container, title, entries, resolveLabel, resolveColorIcon) {
    const max = d3.max(entries, (e) => e[1]) || 1;
    container.innerHTML = `<h4>${title}</h4>` + entries.map(([idx, value]) => {
      const { label, color, icon } = resolveLabel(idx);
      return `<div class="rank-bar-row">
        ${icon ? `<span style="color:${color}">${icon}</span>` : "<span></span>"}
        <div><div style="font-size:.68rem;margin-bottom:3px">${label}</div>
          <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${(value / max) * 100}%;background:${color ?? "var(--accent)"}"></div></div>
        </div>
        <b>${formatInt(value)}</b>
      </div>`;
    }).join("");
  }

  function renderNarrative(analysis) {
    const topCanton = analysis.cantons[0];
    const topSector = analysis.sectors[0];
    const periodLabelText = formatPeriod(filters.period);
    let sentence = `En ${periodLabelText}, Manabí registra <strong>${formatInt(analysis.total)}</strong> contribuyentes activos`;
    if (topCanton) sentence += ` — <strong>${cantons[topCanton[0]]}</strong> concentra ${formatInt(topCanton[1])}`;
    if (topSector) sentence += ` y <strong>${sectors[topSector[0]].name}</strong> es el sector con más presencia (${formatInt(topSector[1])})`;
    sentence += ".";
    narrativeEl.innerHTML = `<span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></span><p>${sentence}</p>`;
  }

  function renderAll(animate) {
    const analysis = analyseActive(data, filters);
    renderKpi(analysis, animate);
    renderTrend(analysis);
    renderRankCard(cantonsEl, "Top cantones", analysis.cantons, (idx) => ({ label: cantons[idx], color: "var(--active)" }));
    renderRankCard(sectorsEl, "Top sectores", analysis.sectors, (idx) => {
      const s = sectors[idx];
      const meta = sectorMeta(s.id);
      return { label: meta.short, color: meta.color, icon: meta.icon };
    });
    renderNarrative(analysis);
    renderChips();
  }

  function closeAllPopovers() {
    document.querySelectorAll(".filter-popover-menu").forEach((m) => m.remove());
  }

  function setupPopover(key, label, getOptions) {
    const container = document.querySelector(`.filter-popover[data-filter="${key}"]`);
    const button = container.querySelector("button");
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const existing = container.querySelector(".filter-popover-menu");
      closeAllPopovers();
      if (existing) return;

      const menu = document.createElement("div");
      menu.className = "filter-popover-menu";
      const options = getOptions();
      const needsSearch = options.length > 8;
      menu.innerHTML = `
        ${needsSearch ? '<input type="search" placeholder="Buscar…" data-scroll-ok />' : ""}
        <div class="popover-options">${options.map((opt) => `<button type="button" data-value="${opt.value}" class="${filters[key] === opt.value ? "is-selected" : ""}">${opt.label}</button>`).join("")}</div>`;
      container.appendChild(menu);

      const search = menu.querySelector("input[type=search]");
      const optionsWrap = menu.querySelector(".popover-options");
      if (search) {
        search.addEventListener("input", () => {
          const term = search.value.toLowerCase();
          [...optionsWrap.children].forEach((btn) => {
            btn.style.display = btn.textContent.toLowerCase().includes(term) ? "" : "none";
          });
        });
        search.focus();
      }
      optionsWrap.querySelectorAll("button[data-value]").forEach((btn) => {
        btn.addEventListener("click", () => {
          filters[key] = btn.dataset.value;
          closeAllPopovers();
          renderAll(false);
        });
      });
    });
  }

  function wireControls() {
    setupPopover("canton", "Cantón", () => cantons.map((c) => ({ value: c, label: c })));
    setupPopover("sector", "Sector", () => sectors.map((s) => ({ value: s.id, label: s.name })));
    setupPopover("type", "Tipo", () => types.map((t) => ({ value: t, label: t })));
    document.addEventListener("click", closeAllPopovers);

    periodInput.addEventListener("input", () => setPeriodByIndex(Number(periodInput.value), false));

    resetBtn.addEventListener("click", () => {
      filters.canton = null; filters.sector = null; filters.type = null;
      setPeriodByIndex(periods.length - 1, false);
    });

    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.setAttribute("aria-pressed", String(playing));
      if (playing) {
        let i = 0;
        playTimer = setInterval(() => {
          setPeriodByIndex(i, false);
          i = (i + 1) % periods.length;
        }, 320);
      } else {
        clearInterval(playTimer);
      }
    });

    modeSwitchEl.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-mode]");
      if (!btn) return;
      mode = btn.dataset.mode;
      [...modeSwitchEl.children].forEach((b) => b.classList.toggle("active", b === btn));
      narrativeEl.style.opacity = mode === "compare" ? "0.55" : "1";
    });
  }

  return {
    id: "hallazgo5_atlas",
    mount() {
      periodInput.max = String(periods.length - 1);
      periodInput.value = String(periods.length - 1);
      periodLabel.textContent = formatPeriod(filters.period);
      wireControls();
      renderAll(false);
    },
    enter() {
      renderAll(true);
    },
    update() { renderAll(false); },
    resize() {},
    destroy() {
      clearInterval(playTimer);
    },
  };
}
