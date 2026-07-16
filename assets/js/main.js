import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";

import gsap from "gsap";
import { loadDataset } from "./core/data.js";
import { initNavigation } from "./core/navigation.js";
import { state, on } from "./core/store.js";
import { buildEnterTimeline, resetEnterTimeline } from "./core/motion.js";
import { closePopover } from "./core/overlay.js";
import { enter as enterPortada } from "./sections/01-portada/index.js";
import { enter as enterHallazgo3 } from "./sections/06-hallazgo3/index.js";

import { createSunburstChart } from "./charts/hallazgo1_sunburst/index.js";
import { createTreemapChart } from "./charts/hallazgo2_treemap/index.js";
import { createWaterfallChart } from "./charts/hallazgo3_waterfall/index.js";
import { createSankeyChart } from "./charts/hallazgo4_sankey/index.js";
import { createAtlasChart } from "./charts/hallazgo5_atlas/index.js";

const SECTION_ENTER = new Map([
  [0, enterPortada],
  [5, enterHallazgo3],
]);

const CHART_FACTORIES = {
  hallazgo1_sunburst: createSunburstChart,
  hallazgo2_treemap: createTreemapChart,
  hallazgo3_waterfall: createWaterfallChart,
  hallazgo4_sankey: createSankeyChart,
  hallazgo5_atlas: createAtlasChart,
};

const chartRecords = new Map();
let panels = [];
let data = null;
let navigationReady = false;

function setAppStatus(status) {
  state.appStatus = status;
  document.documentElement.dataset.appState = status;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForStableLayout() {
  await nextFrame();
  await nextFrame();
}

function waitForLoaderExit(loadingScreen) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      loadingScreen.removeEventListener("transitionend", finish);
      resolve();
    };
    loadingScreen.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 700);
  });
}

function showChartError(el, id, error) {
  console.error(error);
  el.dataset.chartState = "error";
  el.replaceChildren();
  const box = document.createElement("div");
  box.className = "chart-error";
  const title = document.createElement("strong");
  title.textContent = "No se pudo mostrar esta visualización.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "ghost-button";
  retry.textContent = "Reintentar";
  retry.addEventListener("click", async () => {
    chartRecords.delete(id);
    await ensureChart(el.closest(".panel"));
  });
  box.append(title, retry);
  el.appendChild(box);
}

async function ensureChart(panel) {
  const el = panel.querySelector("[data-chart-slot]");
  if (!el) return null;
  const id = el.dataset.chartSlot;
  const existing = chartRecords.get(id);
  if (existing?.status === "ready") return existing.chart;
  if (existing?.status === "loading") return existing.promise;

  const factory = CHART_FACTORIES[id];
  if (!factory) return null;

  if (existing?.status === "error") el.replaceChildren();
  el.dataset.chartState = "loading";
  const promise = (async () => {
    try {
      await waitForStableLayout();
      const chart = factory({ el, data, state, gsap });
      chart.mount();
      chart.resize?.();
      el.dataset.chartState = "ready";
      chartRecords.set(id, { status: "ready", chart });
      return chart;
    } catch (error) {
      chartRecords.set(id, { status: "error", error });
      showChartError(el, id, error);
      return null;
    }
  })();
  chartRecords.set(id, { status: "loading", promise });
  return promise;
}

async function enterChapter(index) {
  const panel = panels[index];
  if (!panel) return;
  buildEnterTimeline(panel).pause(0);
  await waitForStableLayout();
  if (state.chapter !== index) return;

  const chart = await ensureChart(panel);
  if (state.chapter !== index) return;

  SECTION_ENTER.get(index)?.({ panel, data });
  buildEnterTimeline(panel).restart();
  chart?.enter?.();
}

function leaveChapter(index) {
  const panel = panels[index];
  if (!panel) return;
  resetEnterTimeline(panel);
  const chartEl = panel.querySelector("[data-chart-slot]");
  if (chartEl) chartRecords.get(chartEl.dataset.chartSlot)?.chart?.leave?.();
  closePopover({ restoreFocus: false });
  document.querySelectorAll(".data-tooltip").forEach((tip) => { tip.style.display = "none"; });
}

function initMethodologyDrawer() {
  const backdrop = document.getElementById("method-backdrop");
  const drawer = backdrop.querySelector(".method-drawer");
  const shell = document.getElementById("story-shell");
  const openBtn = document.getElementById("open-methodology");
  const closeBtn = document.getElementById("method-close");
  let previousFocus = null;

  const focusable = () => [...drawer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && !el.hidden);

  const close = () => {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    shell.removeAttribute("inert");
    openBtn.setAttribute("aria-expanded", "false");
    previousFocus?.focus({ preventScroll: true });
  };

  const open = () => {
    closePopover({ restoreFocus: false });
    previousFocus = document.activeElement;
    backdrop.hidden = false;
    shell.setAttribute("inert", "");
    openBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus({ preventScroll: true });
  };

  openBtn.setAttribute("aria-expanded", "false");
  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  window.addEventListener("keydown", (event) => {
    if (backdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function showBootError(loadingScreen, error) {
  console.error(error);
  setAppStatus("error");
  loadingScreen.dataset.hidden = "false";
  loadingScreen.setAttribute("aria-hidden", "false");
  const message = loadingScreen.querySelector("p");
  message.textContent = "No se pudo cargar el dataset.";
  let retry = loadingScreen.querySelector("button");
  if (!retry) {
    retry = document.createElement("button");
    retry.type = "button";
    retry.className = "ghost-button loading-retry";
    retry.textContent = "Reintentar";
    loadingScreen.appendChild(retry);
  }
  retry.onclick = () => boot();
}

async function boot() {
  const loadingScreen = document.getElementById("loading-screen");
  const message = loadingScreen.querySelector("p");
  loadingScreen.querySelector("button")?.remove();
  loadingScreen.dataset.hidden = "false";
  loadingScreen.setAttribute("aria-hidden", "false");
  message.textContent = "Preparando el catastro tributario…";
  setAppStatus("loading");

  try {
    [data] = await Promise.all([
      loadDataset(),
      document.fonts?.ready ?? Promise.resolve(),
    ]);
  } catch (error) {
    showBootError(loadingScreen, error);
    return;
  }

  if (!navigationReady) {
    const navigation = initNavigation();
    panels = navigation.panels;
    navigationReady = true;
    on("chapter:leave", leaveChapter);
    on("chapter:enter", (index) => { void enterChapter(index); });
    initMethodologyDrawer();
  }

  const startPanel = panels[state.chapter];
  buildEnterTimeline(startPanel);
  await ensureChart(startPanel);
  await waitForStableLayout();

  setAppStatus("ready");
  loadingScreen.dataset.hidden = "true";
  loadingScreen.setAttribute("aria-hidden", "true");
  await waitForLoaderExit(loadingScreen);
  await enterChapter(state.chapter);
}

void boot();
