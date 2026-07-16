let activePopover = null;

function ensureRoot() {
  let root = document.getElementById("overlay-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "overlay-root";
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  return root;
}

function positionPopover() {
  if (!activePopover) return;
  const { anchor, element } = activePopover;
  if (!anchor.isConnected || !element.isConnected) {
    closePopover({ restoreFocus: false });
    return;
  }

  const margin = 12;
  const gap = 8;
  const anchorRect = anchor.getBoundingClientRect();
  const availableBelow = window.innerHeight - anchorRect.bottom - margin - gap;
  const availableAbove = anchorRect.top - margin - gap;
  const openAbove = availableBelow < 220 && availableAbove > availableBelow;
  const available = Math.max(160, openAbove ? availableAbove : availableBelow);

  element.style.maxHeight = `${Math.min(320, available)}px`;
  element.style.visibility = "hidden";
  element.style.left = "0px";
  element.style.top = "0px";

  const menuRect = element.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, anchorRect.left),
    Math.max(margin, window.innerWidth - menuRect.width - margin),
  );
  const top = openAbove
    ? Math.max(margin, anchorRect.top - menuRect.height - gap)
    : Math.min(window.innerHeight - menuRect.height - margin, anchorRect.bottom + gap);

  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(Math.max(margin, top))}px`;
  element.style.visibility = "visible";
  element.dataset.side = openAbove ? "top" : "bottom";
}

function onDocumentPointerDown(event) {
  if (!activePopover) return;
  const { anchor, element } = activePopover;
  if (element.contains(event.target) || anchor.contains(event.target)) return;
  closePopover({ restoreFocus: false });
}

function onDocumentKeydown(event) {
  if (event.key === "Escape" && activePopover) {
    event.preventDefault();
    closePopover();
  }
}

function onViewportChange() {
  positionPopover();
}

export function openPopover({ anchor, element, id, focusSelector = null, onClose = null }) {
  if (!anchor || !element) return;
  closePopover({ restoreFocus: false });

  const root = ensureRoot();
  element.id = id;
  element.classList.add("overlay-popover");
  element.setAttribute("data-scroll-ok", "true");
  element.addEventListener("wheel", (event) => {
    const scrollArea = event.target.closest?.(".popover-options, [data-popover-scroll]")
      ?? element.querySelector(".popover-options, [data-popover-scroll]");
    if (scrollArea && scrollArea.scrollHeight > scrollArea.clientHeight + 1) {
      const before = scrollArea.scrollTop;
      scrollArea.scrollTop += event.deltaY;
      if (scrollArea.scrollTop !== before) event.preventDefault();
    }
    event.stopPropagation();
  }, { passive: false });
  root.appendChild(element);

  anchor.setAttribute("aria-expanded", "true");
  anchor.setAttribute("aria-controls", id);
  activePopover = { anchor, element, onClose };
  positionPopover();

  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeydown);
  window.addEventListener("resize", onViewportChange);

  if (focusSelector) element.querySelector(focusSelector)?.focus();
}

export function closePopover({ restoreFocus = true } = {}) {
  if (!activePopover) return;
  const { anchor, element, onClose } = activePopover;
  activePopover = null;

  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  document.removeEventListener("keydown", onDocumentKeydown);
  window.removeEventListener("resize", onViewportChange);

  anchor.setAttribute("aria-expanded", "false");
  anchor.removeAttribute("aria-controls");
  element.remove();
  onClose?.();
  if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
}

export function positionTooltip(element, event) {
  const margin = 12;
  element.style.display = "block";
  element.style.left = "0px";
  element.style.top = "0px";
  const rect = element.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin + rect.width / 2, event.clientX),
    window.innerWidth - margin - rect.width / 2,
  );
  const preferredTop = event.clientY - rect.height - 14;
  const top = preferredTop >= margin
    ? event.clientY
    : Math.min(window.innerHeight - margin, event.clientY + rect.height + 20);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.classList.toggle("is-below", preferredTop < margin);
}
