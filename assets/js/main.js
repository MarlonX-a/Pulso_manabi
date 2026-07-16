import "@fontsource/archivo-black/400.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";

import gsap from "gsap";
import { loadDataset } from "./core/data.js";
import { initNavigation } from "./core/navigation.js";
import { state, on } from "./core/store.js";
import { buildEnterTimeline } from "./core/motion.js";

import * as portada from "./sections/01-portada/index.js";
import * as contexto from "./sections/02-contexto/index.js";
import * as objetivos from "./sections/03-objetivos/index.js";
import * as hallazgo1 from "./sections/04-hallazgo1/index.js";
import * as hallazgo2 from "./sections/05-hallazgo2/index.js";
import * as hallazgo3 from "./sections/06-hallazgo3/index.js";
import * as hallazgo4 from "./sections/07-hallazgo4/index.js";
import * as hallazgo5 from "./sections/08-hallazgo5/index.js";
import * as conclusiones from "./sections/09-conclusiones/index.js";
import * as recomendaciones from "./sections/10-recomendaciones/index.js";
import * as creditos from "./sections/11-creditos/index.js";

import { createSunburstChart } from "./charts/hallazgo1_sunburst/index.js";
import { createTreemapChart } from "./charts/hallazgo2_treemap/index.js";
import { createWaterfallChart } from "./charts/hallazgo3_waterfall/index.js";
import { createSankeyChart } from "./charts/hallazgo4_sankey/index.js";
import { createAtlasChart } from "./charts/hallazgo5_atlas/index.js";

const SECTION_MODULES = [
  portada, contexto, objetivos, hallazgo1, hallazgo2,
  hallazgo3, hallazgo4, hallazgo5, conclusiones, recomendaciones, creditos,
];

const CHART_FACTORIES = {
  hallazgo1_sunburst: createSunburstChart,
  hallazgo2_treemap: createTreemapChart,
  hallazgo3_waterfall: createWaterfallChart,
  hallazgo4_sankey: createSankeyChart,
  hallazgo5_atlas: createAtlasChart,
};

function initMethodologyDrawer() {
  const backdrop = document.getElementById("method-backdrop");
  const openBtn = document.getElementById("open-methodology");
  const closeBtn = document.getElementById("method-close");
  openBtn.addEventListener("click", () => { backdrop.hidden = false; });
  closeBtn.addEventListener("click", () => { backdrop.hidden = true; });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) backdrop.hidden = true;
  });
}

async function boot() {
  const loadingScreen = document.getElementById("loading-screen");
  let data;
  try {
    data = await loadDataset();
  } catch (error) {
    loadingScreen.querySelector("p").textContent = "No se pudo cargar el dataset. Revisa la consola.";
    console.error(error);
    return;
  }

  const { panels } = initNavigation();

  const charts = {};
  document.querySelectorAll("[data-chart-slot]").forEach((el) => {
    const id = el.dataset.chartSlot;
    const factory = CHART_FACTORIES[id];
    if (!factory) return;
    const chart = factory({ el, data, state, gsap });
    chart.mount();
    charts[id] = chart;
  });

  on("chapter:enter", (index) => {
    const panel = panels[index];
    SECTION_MODULES[index]?.enter({ panel, data });
    const chartEl = panel.querySelector("[data-chart-slot]");
    if (chartEl) charts[chartEl.dataset.chartSlot]?.enter();
  });

  const startIndex = state.chapter;
  const startPanel = panels[startIndex];
  SECTION_MODULES[startIndex]?.enter({ panel: startPanel, data });
  buildEnterTimeline(startPanel).restart();
  const startChartEl = startPanel.querySelector("[data-chart-slot]");
  if (startChartEl) charts[startChartEl.dataset.chartSlot]?.enter();

  initMethodologyDrawer();

  requestAnimationFrame(() => {
    loadingScreen.dataset.hidden = "true";
  });
}

boot();
