import gsap from "gsap";
import { state, emit } from "./store.js";
import { MOTION, prefersReducedMotion } from "./motion.js";
import { closePopover } from "./overlay.js";

let panels = [];
let track = null;
let shell = null;
let bgLayers = [];
let watermarks = [];
let railButtons = [];
let prevBtn = null;
let nextBtn = null;
let edgeLeft = null;
let edgeRight = null;
let chapterName = null;
let count = 0;
let focusAfterTransition = false;

const CHAPTER_LABELS = [
  "Portada", "Contexto", "Objetivos", "Territorio", "Actividades",
  "Evolución", "Calidad", "Atlas vivo", "Conclusiones", "Recomendaciones", "Créditos",
];

function setActiveDom(index) {
  panels.forEach((panel, i) => {
    if (i === index) {
      panel.removeAttribute("aria-hidden");
      panel.removeAttribute("inert");
      panel.dataset.active = "true";
    } else {
      panel.setAttribute("aria-hidden", "true");
      panel.setAttribute("inert", "");
      delete panel.dataset.active;
    }
  });
  railButtons.forEach((btn, i) => {
    btn.classList.toggle("is-current", i === index);
    if (i === index) btn.setAttribute("aria-current", "step");
    else btn.removeAttribute("aria-current");
  });
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === count - 1;
  if (edgeLeft) edgeLeft.disabled = index === 0;
  if (edgeRight) edgeRight.disabled = index === count - 1;
  if (chapterName) chapterName.textContent = `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")} · ${CHAPTER_LABELS[index] ?? ""}`;
}

function crossfadeBackdrop(accent, reduced) {
  const incoming = bgLayers.find((layer) => !layer.classList.contains("is-visible")) ?? bgLayers[0];
  const outgoing = bgLayers.find((layer) => layer !== incoming);
  incoming.style.background = `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${accent} 24%, transparent), transparent 55%), linear-gradient(120deg, #0b0c20, #070a1a 70%)`;

  if (reduced) {
    incoming.classList.add("is-visible");
    outgoing?.classList.remove("is-visible");
    return;
  }
  incoming.classList.add("is-visible");
  gsap.delayedCall(MOTION.chapter * 0.72, () => outgoing?.classList.remove("is-visible"));
}

export function goTo(requestedIndex) {
  return navigateTo(requestedIndex);
}

function focusPanelHeading(panel) {
  const target = panel.querySelector("h1, h2") ?? panel;
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
}

function updateHistory(panel, mode) {
  const hash = `#${panel.id}`;
  if (mode === "push") window.history.pushState({ chapter: panel.id }, "", hash);
  else if (mode === "replace") window.history.replaceState({ chapter: panel.id }, "", hash);
}

function resetNativeScroll() {
  window.scrollTo({ left: 0, top: 0, behavior: "instant" });
  if (shell) {
    shell.scrollLeft = 0;
    shell.scrollTop = 0;
  }
  document.documentElement.scrollLeft = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollLeft = 0;
  document.body.scrollTop = 0;
}

export function navigateTo(requestedIndex, { history = "push", focus = false } = {}) {
  const next = Math.max(0, Math.min(count - 1, requestedIndex));
  if (state.transitioning) return;
  if (next === state.chapter) {
    if (focus) focusPanelHeading(panels[next]);
    return;
  }

  const reduced = prefersReducedMotion();
  const previous = state.chapter;
  const direction = next > previous ? 1 : -1;
  state.direction = direction;
  state.transitioning = true;
  focusAfterTransition = focus;
  resetNativeScroll();

  closePopover({ restoreFocus: false });
  emit("chapter:leave", previous);

  const accent = panels[next].dataset.accent ?? "#2f80ed";
  document.documentElement.style.setProperty("--accent-target", accent);
  crossfadeBackdrop(accent, reduced);

  const finish = () => {
    state.chapter = next;
    state.transitioning = false;
    setActiveDom(next);
    if (history !== "none") updateHistory(panels[next], history);
    resetNativeScroll();
    emit("chapter:enter", next);
    if (focusAfterTransition) focusPanelHeading(panels[next]);
    focusAfterTransition = false;
  };

  if (reduced) {
    gsap.set(track, { x: -window.innerWidth * next });
    gsap.set(shell, { "--accent": accent });
    finish();
    return;
  }

  const tl = gsap.timeline({ onComplete: finish });
  tl.to(shell, { "--accent": accent, duration: MOTION.chapter, ease: MOTION.chapterEase }, 0);
  tl.to(track, { x: -window.innerWidth * next, duration: MOTION.chapter, ease: MOTION.chapterEase }, 0);
}

function canConsumeWheel(target, delta) {
  const scrollable = target.closest?.("[data-scroll-ok]");
  if (!scrollable) return false;
  if (scrollable.dataset.scrollLock === "true") return true;
  if (scrollable.scrollHeight <= scrollable.clientHeight + 1) return true;
  if (delta < 0) return scrollable.scrollTop > 0;
  return scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1;
}

function onWheel(event) {
  if (state.transitioning) { event.preventDefault(); return; }
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (canConsumeWheel(event.target, delta)) return;
  if (Math.abs(delta) < 24) return;
  event.preventDefault();
  goTo(state.chapter + (delta > 0 ? 1 : -1));
}

function onKeydown(event) {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
  if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); goTo(state.chapter + 1); }
  else if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); goTo(state.chapter - 1); }
  else if (event.key === "Home") { event.preventDefault(); goTo(0); }
  else if (event.key === "End") { event.preventDefault(); goTo(count - 1); }
}

let touchStartX = null;
function onTouchStart(event) { touchStartX = event.touches[0].clientX; }
function onTouchEnd(event) {
  if (touchStartX == null) return;
  const delta = event.changedTouches[0].clientX - touchStartX;
  touchStartX = null;
  if (Math.abs(delta) < 60) return;
  goTo(state.chapter + (delta < 0 ? 1 : -1));
}

function onPointerMove(event) {
  const x = (event.clientX / window.innerWidth - 0.5) * 2;
  const y = (event.clientY / window.innerHeight - 0.5) * 2;
  shell.style.setProperty("--pointer-x", x.toFixed(3));
  shell.style.setProperty("--pointer-y", y.toFixed(3));
}

function onHistoryNavigation() {
  resetNativeScroll();
  const hash = window.location.hash.replace("#", "");
  const index = panels.findIndex((panel) => panel.id === hash);
  if (index > -1 && index !== state.chapter) navigateTo(index, { history: "none", focus: true });
}

function onResize() {
  resetNativeScroll();
  gsap.set(track, { x: -window.innerWidth * state.chapter });
}

let watermarkRaf = null;
function tickWatermarks() {
  const shift = -state.chapter * 100;
  watermarks.forEach((el) => {
    el.style.transform = `translate(calc(-50% + ${shift * 0.12}px), -50%)`;
  });
  watermarkRaf = requestAnimationFrame(tickWatermarks);
}

export function initNavigation() {
  shell = document.getElementById("story-shell");
  track = document.getElementById("track");
  panels = [...track.querySelectorAll(".panel")];
  bgLayers = [...document.querySelectorAll(".bg-layer")];
  watermarks = [...document.querySelectorAll(".panel-watermark")];
  railButtons = [];
  prevBtn = document.getElementById("nav-prev");
  nextBtn = document.getElementById("nav-next");
  edgeLeft = document.getElementById("edge-left");
  edgeRight = document.getElementById("edge-right");
  chapterName = document.getElementById("chapter-name");
  count = panels.length;
  shell.style.setProperty("--panel-count", String(count));
  track.style.setProperty("--panel-count", String(count));

  const rail = document.getElementById("progress-rail");
  panels.forEach((panel, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", `Ir a ${CHAPTER_LABELS[i] ?? panel.id}`);
    btn.innerHTML = `<span></span><small>${String(i + 1).padStart(2, "0")}</small>`;
    btn.addEventListener("click", () => navigateTo(i));
    rail.appendChild(btn);
    railButtons.push(btn);
  });

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => navigateTo(Number(el.dataset.goto)));
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href").slice(1);
      const index = panels.findIndex((panel) => panel.id === id);
      if (index < 0) return;
      event.preventDefault();
      navigateTo(index, { history: "push", focus: true });
    });
  });

  prevBtn.addEventListener("click", () => goTo(state.chapter - 1));
  nextBtn.addEventListener("click", () => goTo(state.chapter + 1));
  edgeLeft.addEventListener("click", () => goTo(state.chapter - 1));
  edgeRight.addEventListener("click", () => goTo(state.chapter + 1));

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("popstate", onHistoryNavigation);
  window.addEventListener("hashchange", onHistoryNavigation);
  window.addEventListener("resize", onResize);

  let startIndex = 0;
  const hash = window.location.hash.replace("#", "");
  const hashIndex = panels.findIndex((panel) => panel.id === hash);
  if (hashIndex > -1) startIndex = hashIndex;
  resetNativeScroll();

  bgLayers[0].classList.add("is-visible");
  bgLayers[0].style.background = `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${panels[startIndex].dataset.accent} 24%, transparent), transparent 55%), linear-gradient(120deg, #0b0c20, #070a1a 70%)`;
  gsap.set(shell, { "--accent": panels[startIndex].dataset.accent });
  gsap.set(track, { x: -window.innerWidth * startIndex });
  requestAnimationFrame(resetNativeScroll);
  state.chapter = startIndex;
  setActiveDom(startIndex);
  updateHistory(panels[startIndex], "replace");

  if (!prefersReducedMotion()) tickWatermarks();

  return { panels, goTo: navigateTo, startIndex };
}
