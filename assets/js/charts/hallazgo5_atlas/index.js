import * as d3 from "d3";
import { analyseActive } from "../../core/data.js";
import { sectorMeta } from "../../core/sectors.js";
import { formatInt, formatPercent, formatPeriod, formatSigned } from "../../core/format.js";
import { animateCount } from "../../core/motion.js";
import { closePopover, openPopover } from "../../core/overlay.js";

const TREND_W = 460;
const TREND_H = 150;

export function createAtlasChart({ el, data, state }) {
  const periods = data.dimensions.periods;
  const cantons = data.dimensions.cantons;
  const sectors = data.dimensions.sectors;
  const types = data.dimensions.types;
  const latestIndex = periods.indexOf(data.metadata.latestPeriod);
  const previousPeriod = periods[Math.max(0, latestIndex - 1)];

  const segmentA = state.segmentA;
  const segmentB = state.segmentB;
  if (!segmentA.period) segmentA.period = data.metadata.latestPeriod;
  if (!segmentB.period) Object.assign(segmentB, { ...segmentA, period: previousPeriod });

  let playing = false;
  let playTimer = null;
  let resizeObserver = null;
  let resizeRaf = null;
  let popoverSequence = 0;

  const toolbarEl = document.getElementById("atlas-toolbar");
  const controlAreaEl = document.getElementById("atlas-control-area");
  const kpiEl = document.getElementById("atlas-kpi");
  const trendEl = document.getElementById("atlas-trend");
  const cantonsEl = document.getElementById("atlas-cantons");
  const sectorsEl = document.getElementById("atlas-sectors");
  const narrativeEl = document.getElementById("atlas-narrative");
  const chipsEl = document.getElementById("atlas-chips");
  const resetBtn = document.getElementById("atlas-reset");
  const modeSwitchEl = toolbarEl.querySelector(".mode-switch");

  function stopPlaying() {
    playing = false;
    window.clearInterval(playTimer);
    playTimer = null;
    const playBtn = document.getElementById("atlas-play");
    playBtn?.setAttribute("aria-pressed", "false");
  }

  function setPeriod(segment, period, animate = false) {
    segment.period = period;
    renderAll(animate);
  }

  function filterOptions(key) {
    if (key === "canton") return cantons.map((label) => ({ value: label, label }));
    if (key === "sector") return sectors.map((sector) => ({ value: sector.id, label: sector.name }));
    return types.map((label) => ({ value: label, label }));
  }

  function filterLabel(key) {
    if (key === "canton") return "Cantón";
    if (key === "sector") return "Sector";
    return "Tipo";
  }

  function selectedLabel(segment, key) {
    if (segment[key] == null) return null;
    if (key === "sector") return sectors.find((sector) => sector.id === segment.sector)?.name ?? segment.sector;
    return segment[key];
  }

  function buildFilterMenu(anchor, segment, key, segmentName) {
    const options = filterOptions(key);
    const menu = document.createElement("div");
    menu.className = "filter-popover-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", `${filterLabel(key)} del segmento ${segmentName}`);
    menu.setAttribute("data-scroll-ok", "true");
    menu.setAttribute("data-scroll-lock", "true");

    let search = null;
    if (options.length > 8) {
      search = document.createElement("input");
      search.type = "search";
      search.placeholder = "Buscar…";
      search.setAttribute("aria-label", `Buscar ${filterLabel(key).toLowerCase()}`);
      menu.appendChild(search);
    }

    const list = document.createElement("div");
    list.className = "popover-options";
    list.setAttribute("role", "listbox");
    list.setAttribute("data-scroll-ok", "true");
    list.setAttribute("data-scroll-lock", "true");

    options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.value = option.value;
      button.textContent = option.label;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(segment[key] === option.value));
      if (segment[key] === option.value) button.classList.add("is-selected");
      button.addEventListener("click", () => {
        segment[key] = option.value;
        closePopover({ restoreFocus: false });
        renderControls();
        renderAll(false);
      });
      list.appendChild(button);
    });
    menu.appendChild(list);

    search?.addEventListener("input", () => {
      const term = search.value.trim().toLocaleLowerCase("es");
      [...list.children].forEach((button) => {
        button.hidden = !button.textContent.toLocaleLowerCase("es").includes(term);
      });
    });

    popoverSequence += 1;
    openPopover({
      anchor,
      element: menu,
      id: `atlas-filter-${segmentName.toLowerCase()}-${key}-${popoverSequence}`,
      focusSelector: search ? 'input[type="search"]' : 'button[role="option"]',
    });
  }

  function makeFilterButton(segment, key, segmentName) {
    const selected = selectedLabel(segment, key);
    const wrap = document.createElement("div");
    wrap.className = `filter-popover${selected ? " is-set" : ""}`;
    wrap.dataset.filter = key;
    wrap.dataset.segment = segmentName;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-trigger";
    button.textContent = filterLabel(key);
    button.title = selected ?? `Sin filtro de ${filterLabel(key).toLowerCase()}`;
    button.setAttribute("aria-label", selected ? `${filterLabel(key)}: ${selected}` : filterLabel(key));
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => buildFilterMenu(button, segment, key, segmentName));
    wrap.appendChild(button);
    return wrap;
  }

  function appendFilterGroup(container, segment, segmentName) {
    ["canton", "sector", "type"].forEach((key) => {
      container.appendChild(makeFilterButton(segment, key, segmentName));
    });
  }

  function renderExploreControls() {
    const controls = document.createElement("div");
    controls.className = "explore-controls";

    const scrubber = document.createElement("div");
    scrubber.className = "period-scrubber";
    scrubber.innerHTML = `
      <button type="button" id="atlas-play" aria-label="Reproducir la evolución mensual" aria-pressed="false"></button>
      <input type="range" id="atlas-period" min="0" max="${periods.length - 1}" value="${periods.indexOf(segmentA.period)}" aria-label="Periodo" />
      <output id="atlas-period-label" for="atlas-period">${formatPeriod(segmentA.period)}</output>`;
    controls.appendChild(scrubber);

    const filters = document.createElement("div");
    filters.className = "atlas-filter-row";
    appendFilterGroup(filters, segmentA, "A");
    controls.appendChild(filters);
    controlAreaEl.appendChild(controls);

    const periodInput = scrubber.querySelector("#atlas-period");
    const periodLabel = scrubber.querySelector("#atlas-period-label");
    const playBtn = scrubber.querySelector("#atlas-play");
    periodInput.addEventListener("input", () => {
      segmentA.period = periods[Number(periodInput.value)];
      periodLabel.textContent = formatPeriod(segmentA.period);
      renderAll(false);
    });
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.setAttribute("aria-pressed", String(playing));
      if (!playing) {
        stopPlaying();
        return;
      }
      let index = periods.indexOf(segmentA.period);
      playTimer = window.setInterval(() => {
        index = (index + 1) % periods.length;
        segmentA.period = periods[index];
        periodInput.value = String(index);
        periodLabel.textContent = formatPeriod(segmentA.period);
        renderAll(false);
      }, 420);
    });
  }

  function renderSegmentEditor(segment, name, defaultPeriod) {
    const row = document.createElement("div");
    row.className = "compare-segment-row";
    row.dataset.segment = name;

    const badge = document.createElement("strong");
    badge.className = `segment-badge segment-${name.toLowerCase()}`;
    badge.textContent = name;
    row.appendChild(badge);

    const select = document.createElement("select");
    select.className = "compare-period-select";
    select.setAttribute("aria-label", `Periodo del segmento ${name}`);
    periods.forEach((period) => {
      const option = document.createElement("option");
      option.value = period;
      option.textContent = formatPeriod(period);
      option.selected = period === segment.period;
      select.appendChild(option);
    });
    select.addEventListener("change", () => setPeriod(segment, select.value));
    row.appendChild(select);

    appendFilterGroup(row, segment, name);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "segment-clear";
    clear.textContent = `Limpiar ${name}`;
    clear.addEventListener("click", () => {
      Object.assign(segment, { period: defaultPeriod, canton: null, sector: null, type: null });
      renderControls();
      renderAll(false);
    });
    row.appendChild(clear);
    return row;
  }

  function renderCompareControls() {
    const rows = document.createElement("div");
    rows.className = "compare-segments";
    rows.append(
      renderSegmentEditor(segmentA, "A", data.metadata.latestPeriod),
      renderSegmentEditor(segmentB, "B", previousPeriod),
    );
    controlAreaEl.appendChild(rows);
  }

  function renderControls() {
    closePopover({ restoreFocus: false });
    controlAreaEl.replaceChildren();
    modeSwitchEl.querySelectorAll("button[data-mode]").forEach((button) => {
      const active = button.dataset.mode === state.atlasMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (state.atlasMode === "compare") renderCompareControls();
    else renderExploreControls();
  }

  function renderChips() {
    chipsEl.replaceChildren();
    if (state.atlasMode === "compare") {
      [["A", segmentA], ["B", segmentB]].forEach(([name, segment]) => {
        const chip = document.createElement("span");
        chip.className = `filter-chip segment-summary segment-${name.toLowerCase()}`;
        const parts = [formatPeriod(segment.period)];
        if (segment.canton) parts.push(segment.canton);
        if (segment.sector) parts.push(sectorMeta(segment.sector).short);
        if (segment.type) parts.push(segment.type);
        chip.textContent = `${name} · ${parts.join(" · ")}`;
        chip.title = parts.join(" · ");
        chipsEl.appendChild(chip);
      });
      return;
    }

    const chips = [];
    if (segmentA.canton != null) chips.push({ key: "canton", label: segmentA.canton });
    if (segmentA.sector != null) chips.push({ key: "sector", label: sectors.find((s) => s.id === segmentA.sector)?.name ?? segmentA.sector });
    if (segmentA.type != null) chips.push({ key: "type", label: segmentA.type });
    chips.forEach((chipData) => {
      const chip = document.createElement("span");
      chip.className = "filter-chip";
      chip.textContent = chipData.label;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Quitar filtro ${chipData.label}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        segmentA[chipData.key] = null;
        renderControls();
        renderAll(false);
      });
      chip.appendChild(remove);
      chipsEl.appendChild(chip);
    });
  }

  function renderExploreKpi(analysis, animate) {
    kpiEl.className = "atlas-card atlas-kpi";
    kpiEl.innerHTML = `<small></small><strong data-current-value="0">0</strong><span class="delta-pill"></span>`;
    const filtered = segmentA.canton || segmentA.sector || segmentA.type;
    kpiEl.querySelector("small").textContent = filtered
      ? "Contribuyentes activos (filtro aplicado)"
      : "Contribuyentes activos · Manabí";
    const strong = kpiEl.querySelector("strong");
    const pill = kpiEl.querySelector(".delta-pill");
    if (!analysis.hasData) {
      strong.textContent = "Sin dato";
      pill.textContent = formatPeriod(segmentA.period);
      pill.className = "delta-pill";
      return;
    }
    if (animate) animateCount(strong, analysis.total);
    else {
      strong.textContent = formatInt(analysis.total);
      strong.dataset.currentValue = String(analysis.total);
    }
    if (analysis.delta == null) {
      pill.textContent = "Sin base comparable";
      pill.className = "delta-pill";
    } else {
      pill.textContent = `${formatPercent(analysis.delta)} vs mes anterior`;
      pill.className = `delta-pill ${analysis.delta >= 0 ? "is-up" : "is-down"}`;
    }
  }

  function renderCompareKpi(a, b) {
    const difference = a.hasData && b.hasData ? b.total - a.total : null;
    const percentage = difference != null && a.total !== 0 ? (difference / a.total) * 100 : null;
    kpiEl.className = "atlas-card atlas-kpi atlas-kpi-compare";
    kpiEl.innerHTML = `
      <small>Contribuyentes activos comparados</small>
      <div class="compare-kpi-values">
        <div><span>A · ${formatPeriod(segmentA.period)}</span><strong>${a.hasData ? formatInt(a.total) : "Sin dato"}</strong></div>
        <div><span>B · ${formatPeriod(segmentB.period)}</span><strong>${b.hasData ? formatInt(b.total) : "Sin dato"}</strong></div>
      </div>
      <span class="delta-pill ${difference == null ? "" : difference >= 0 ? "is-up" : "is-down"}">
        ${difference == null ? "Sin base comparable" : `${formatSigned(difference)} · ${percentage == null ? "sin base porcentual" : formatPercent(percentage)}`}
      </span>`;
  }

  function trendPoints(analysis) {
    return periods.map((_, index) => [index, analysis.trendMap.get(index) ?? null]);
  }

  function renderExploreTrend(analysis) {
    const points = trendPoints(analysis);
    const known = points.filter((point) => point[1] != null);
    const extent = known.length ? d3.extent(known, (point) => point[1]) : [0, 1];
    if (extent[0] === extent[1]) extent[1] = extent[0] + 1;
    const x = d3.scaleLinear().domain([0, periods.length - 1]).range([12, TREND_W - 12]);
    const y = d3.scaleLinear().domain(extent).range([TREND_H - 16, 8]).nice();
    const line = d3.line().defined((point) => point[1] != null).x((point) => x(point[0])).y((point) => y(point[1])).curve(d3.curveMonotoneX);
    const currentIndex = periods.indexOf(segmentA.period);
    const currentValue = analysis.trendMap.get(currentIndex);

    trendEl.innerHTML = `<small>Tendencia · 54 meses ${segmentA.canton || segmentA.sector || segmentA.type ? "(filtrada)" : ""}</small>
      <svg viewBox="0 0 ${TREND_W} ${TREND_H}" preserveAspectRatio="none" aria-hidden="true">
        <path d="${line(points) ?? ""}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="${x(currentIndex)}" x2="${x(currentIndex)}" y1="8" y2="${TREND_H - 16}" stroke="rgba(255,255,255,.28)" stroke-dasharray="3 4"/>
        ${currentValue != null ? `<circle cx="${x(currentIndex)}" cy="${y(currentValue)}" r="4.5" fill="var(--accent)"/>` : ""}
      </svg>`;
  }

  function renderCompareTrend(a, b) {
    const pointsA = trendPoints(a);
    const pointsB = trendPoints(b);
    const known = [...pointsA, ...pointsB].filter((point) => point[1] != null);
    const extent = known.length ? d3.extent(known, (point) => point[1]) : [0, 1];
    if (extent[0] === extent[1]) extent[1] = extent[0] + 1;
    const x = d3.scaleLinear().domain([0, periods.length - 1]).range([12, TREND_W - 12]);
    const y = d3.scaleLinear().domain(extent).range([TREND_H - 16, 8]).nice();
    const line = d3.line().defined((point) => point[1] != null).x((point) => x(point[0])).y((point) => y(point[1])).curve(d3.curveMonotoneX);
    const indexA = periods.indexOf(segmentA.period);
    const indexB = periods.indexOf(segmentB.period);
    trendEl.innerHTML = `<small>Tendencias comparadas · <span class="legend-a">A</span> / <span class="legend-b">B</span></small>
      <svg viewBox="0 0 ${TREND_W} ${TREND_H}" preserveAspectRatio="none" aria-hidden="true">
        <path d="${line(pointsA) ?? ""}" fill="none" stroke="var(--active)" stroke-width="2.2" stroke-linecap="round"/>
        <path d="${line(pointsB) ?? ""}" fill="none" stroke="var(--teal)" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="${x(indexA)}" x2="${x(indexA)}" y1="8" y2="${TREND_H - 16}" stroke="var(--active)" stroke-opacity=".45" stroke-dasharray="3 4"/>
        <line x1="${x(indexB)}" x2="${x(indexB)}" y1="8" y2="${TREND_H - 16}" stroke="var(--teal)" stroke-opacity=".45" stroke-dasharray="3 4"/>
      </svg>`;
  }

  function renderExploreRank(container, title, entries, resolve) {
    const max = d3.max(entries, (entry) => entry[1]) || 1;
    container.replaceChildren();
    const heading = document.createElement("h4");
    heading.textContent = title;
    container.appendChild(heading);
    entries.forEach(([index, value]) => {
      const { label, color, icon } = resolve(index);
      const row = document.createElement("div");
      row.className = "rank-bar-row";
      row.title = label;
      row.setAttribute("aria-label", `${label}: ${formatInt(value)}`);
      row.innerHTML = `${icon ? `<span style="color:${color}">${icon}</span>` : "<span></span>"}
        <div class="rank-label-wrap"><div class="rank-label">${label}</div>
          <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${(value / max) * 100}%;background:${color ?? "var(--accent)"}"></div></div>
        </div><b>${formatInt(value)}</b>`;
      container.appendChild(row);
    });
  }

  function renderCompareRank(container, title, entriesA, entriesB, resolve) {
    const mapA = new Map(entriesA);
    const mapB = new Map(entriesB);
    const indexes = [...new Set([...mapA.keys(), ...mapB.keys()])]
      .sort((left, right) => Math.max(mapB.get(right) ?? 0, mapA.get(right) ?? 0) - Math.max(mapB.get(left) ?? 0, mapA.get(left) ?? 0))
      .slice(0, 5);
    const max = d3.max(indexes.flatMap((index) => [mapA.get(index) ?? 0, mapB.get(index) ?? 0])) || 1;
    container.replaceChildren();
    const heading = document.createElement("h4");
    heading.textContent = `${title} · A / B`;
    container.appendChild(heading);
    indexes.forEach((index) => {
      const { label } = resolve(index);
      const valueA = mapA.get(index) ?? 0;
      const valueB = mapB.get(index) ?? 0;
      const row = document.createElement("div");
      row.className = "compare-rank-row";
      row.title = `${label}: A ${formatInt(valueA)}, B ${formatInt(valueB)}`;
      row.innerHTML = `<span class="compare-rank-label">${label}</span>
        <div class="compare-rank-bars">
          <i class="bar-a" style="width:${(valueA / max) * 100}%"></i>
          <i class="bar-b" style="width:${(valueB / max) * 100}%"></i>
        </div>
        <b>${formatInt(valueA)} / ${formatInt(valueB)}</b>`;
      container.appendChild(row);
    });
  }

  function renderExploreNarrative(analysis) {
    if (!analysis.hasData) {
      narrativeEl.innerHTML = `<span aria-hidden="true">—</span><p>No existe cobertura de activos para <strong>${formatPeriod(segmentA.period)}</strong>.</p>`;
      return;
    }
    const topCanton = analysis.cantons[0];
    const topSector = analysis.sectors[0];
    let sentence = `En ${formatPeriod(segmentA.period)}, Manabí registra <strong>${formatInt(analysis.total)}</strong> contribuyentes activos`;
    if (topCanton) sentence += ` — <strong>${cantons[topCanton[0]]}</strong> concentra ${formatInt(topCanton[1])}`;
    if (topSector) sentence += ` y <strong>${sectors[topSector[0]].name}</strong> es el sector con más presencia (${formatInt(topSector[1])})`;
    narrativeEl.innerHTML = `<span aria-hidden="true">◎</span><p>${sentence}.</p>`;
  }

  function renderCompareNarrative(a, b) {
    if (!a.hasData || !b.hasData) {
      narrativeEl.innerHTML = `<span aria-hidden="true">A/B</span><p>La comparación no tiene una base completa porque uno de los segmentos corresponde a un periodo sin cobertura.</p>`;
      return;
    }
    const difference = b.total - a.total;
    const percentage = a.total !== 0 ? (difference / a.total) * 100 : null;
    narrativeEl.innerHTML = `<span aria-hidden="true">A/B</span><p>El segmento B registra <strong>${formatSigned(difference)}</strong> contribuyentes frente a A${percentage == null ? ", sin base porcentual comparable" : ` (${formatPercent(percentage)})`}. Los filtros de ambos segmentos se aplican de forma independiente.</p>`;
  }

  function renderAll(animate = false) {
    renderChips();
    const analysisA = analyseActive(data, segmentA);
    const cantonResolver = (index) => ({ label: cantons[index], color: "var(--active)" });
    const sectorResolver = (index) => {
      const sector = sectors[index];
      const meta = sectorMeta(sector.id);
      return { label: meta.short, color: meta.color, icon: meta.icon };
    };

    if (state.atlasMode === "compare") {
      const analysisB = analyseActive(data, segmentB);
      renderCompareKpi(analysisA, analysisB);
      renderCompareTrend(analysisA, analysisB);
      renderCompareRank(cantonsEl, "Top cantones", analysisA.cantons, analysisB.cantons, cantonResolver);
      renderCompareRank(sectorsEl, "Top sectores", analysisA.sectors, analysisB.sectors, sectorResolver);
      renderCompareNarrative(analysisA, analysisB);
    } else {
      renderExploreKpi(analysisA, animate);
      renderExploreTrend(analysisA);
      renderExploreRank(cantonsEl, "Top cantones", analysisA.cantons, cantonResolver);
      renderExploreRank(sectorsEl, "Top sectores", analysisA.sectors, sectorResolver);
      renderExploreNarrative(analysisA);
    }
  }

  function resetSegments() {
    Object.assign(segmentA, { period: data.metadata.latestPeriod, canton: null, sector: null, type: null });
    Object.assign(segmentB, { period: previousPeriod, canton: null, sector: null, type: null });
    stopPlaying();
    renderControls();
    renderAll(false);
  }

  function wireToolbar() {
    modeSwitchEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-mode]");
      if (!button || button.dataset.mode === state.atlasMode) return;
      state.atlasMode = button.dataset.mode;
      stopPlaying();
      renderControls();
      renderAll(false);
    });
    resetBtn.addEventListener("click", resetSegments);
  }

  return {
    id: "hallazgo5_atlas",
    mount() {
      wireToolbar();
      renderControls();
      renderAll(false);
      resizeObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(resizeRaf);
        resizeRaf = window.requestAnimationFrame(() => renderAll(false));
      });
      resizeObserver.observe(el);
    },
    enter() { renderAll(true); },
    leave() {
      stopPlaying();
      closePopover({ restoreFocus: false });
    },
    update() { renderAll(false); },
    resize() { renderAll(false); },
    destroy() {
      stopPlaying();
      closePopover({ restoreFocus: false });
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(resizeRaf);
    },
  };
}
