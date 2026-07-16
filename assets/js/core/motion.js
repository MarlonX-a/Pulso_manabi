import gsap from "gsap";
import { formatValue } from "./format.js";

export const MOTION = {
  micro: 0.22,
  data: 0.46,
  chapter: 0.9,
  ease: "power3.out",
  chapterEase: "power3.inOut",
};

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const panelTimelines = new WeakMap();

export function buildEnterTimeline(panel) {
  if (panelTimelines.has(panel)) return panelTimelines.get(panel);

  const reduced = prefersReducedMotion();
  const tl = gsap.timeline({ paused: true });
  const nodes = panel.querySelectorAll("[data-animate]");

  nodes.forEach((node) => {
    const kind = node.dataset.animate;
    const stagger = node.dataset.stagger ? Number(node.dataset.stagger) : 0;
    const children = stagger ? [...node.children] : [node];
    const targets = stagger ? children : node;

    if (reduced) {
      tl.set(targets, { opacity: 1, y: 0, scale: 1, clearProps: "clipPath" }, 0);
      return;
    }

    if (kind === "mask-reveal") {
      const lines = node.querySelectorAll(".mask-line span");
      tl.to(lines, {
        clipPath: "inset(0 0% 0 0)",
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.1,
      }, 0.05);
    } else if (kind === "scale-in") {
      tl.fromTo(targets, { opacity: 0, scale: 0.9 }, {
        opacity: 1, scale: 1, duration: MOTION.data, ease: MOTION.ease, stagger,
      }, 0.1);
    } else {
      tl.fromTo(targets, { opacity: 0, y: 26 }, {
        opacity: 1, y: 0, duration: MOTION.data, ease: MOTION.ease, stagger,
      }, 0.08);
    }
  });

  panelTimelines.set(panel, tl);
  return tl;
}

export function resetEnterTimeline(panel) {
  const tl = panelTimelines.get(panel);
  if (tl) tl.progress(0).pause();
}

export function animateCountersIn(panel) {
  panel.querySelectorAll("[data-counter]").forEach((el) => {
    const target = Number(el.dataset.counter);
    const format = el.dataset.format ?? "int";
    animateCount(el, target, { format });
  });
}

export function animateCount(el, targetValue, { format = "int", duration = 1.4 } = {}) {
  const reduced = prefersReducedMotion();
  const obj = { value: 0 };
  const startValue = Number(el.dataset.currentValue ?? 0);
  obj.value = startValue;

  const render = () => {
    el.textContent = formatValue(obj.value, format);
  };

  if (reduced) {
    obj.value = targetValue;
    render();
    el.dataset.currentValue = String(targetValue);
    return;
  }

  gsap.to(obj, {
    value: targetValue,
    duration,
    ease: "power2.out",
    onUpdate: render,
    onComplete: () => {
      el.dataset.currentValue = String(targetValue);
    },
  });
}
