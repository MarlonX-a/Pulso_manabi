import gsap from "gsap";
import { state, emit } from "./store.js";
import { MOTION, prefersReducedMotion, buildEnterTimeline, resetEnterTimeline } from "./motion.js";

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
  railButtons.forEach((btn, i) => btn.classList.toggle("is-current", i === index));
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
  const next = Math.max(0, Math.min(count - 1, requestedIndex));
  if (state.transitioning || next === state.chapter) return;

  const reduced = prefersReducedMotion();
  const previous = state.chapter;
  const direction = next > previous ? 1 : -1;
  state.direction = direction;
  state.transitioning = true;

  emit("chapter:leave", previous);
  resetEnterTimeline(panels[previous]);

  const accent = panels[next].dataset.accent ?? "#2f80ed";
  document.documentElement.style.setProperty("--accent-target", accent);
  crossfadeBackdrop(accent, reduced);

  const finish = () => {
    state.chapter = next;
    state.transitioning = false;
    setActiveDom(next);
    window.history.replaceState(null, "", `#${panels[next].id}`);
    emit("chapter:enter", next);
    buildEnterTimeline(panels[next]).restart();
  };

  if (reduced) {
    gsap.set(track, { x: `${-100 * next}vw` });
    gsap.set(shell, { "--accent": accent });
    finish();
    return;
  }

  const tl = gsap.timeline({ onComplete: finish });
  tl.to(shell, { "--accent": accent, duration: MOTION.chapter, ease: MOTION.chapterEase }, 0);
  tl.to(track, { x: `${-100 * next}vw`, duration: MOTION.chapter, ease: MOTION.chapterEase }, 0);
}

function onWheel(event) {
  if (state.transitioning) { event.preventDefault(); return; }
  const target = event.target.closest("[data-scroll-ok]");
  if (target) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
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
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-label", `Ir a ${CHAPTER_LABELS[i] ?? panel.id}`);
    btn.innerHTML = `<span></span><small>${String(i + 1).padStart(2, "0")}</small>`;
    btn.addEventListener("click", () => goTo(i));
    rail.appendChild(btn);
    railButtons.push(btn);
  });

  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => goTo(Number(el.dataset.goto)));
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

  let startIndex = 0;
  const hash = window.location.hash.replace("#", "");
  const hashIndex = panels.findIndex((panel) => panel.id === hash);
  if (hashIndex > -1) startIndex = hashIndex;

  bgLayers[0].classList.add("is-visible");
  bgLayers[0].style.background = `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${panels[startIndex].dataset.accent} 24%, transparent), transparent 55%), linear-gradient(120deg, #0b0c20, #070a1a 70%)`;
  gsap.set(shell, { "--accent": panels[startIndex].dataset.accent });
  gsap.set(track, { x: `${-100 * startIndex}vw` });
  state.chapter = startIndex;
  setActiveDom(startIndex);

  if (!prefersReducedMotion()) tickWatermarks();

  return { panels, goTo };
}
