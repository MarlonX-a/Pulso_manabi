import { expect, test } from "@playwright/test";

const consoleErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page)).toEqual([]);
});

async function openReady(page) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("#loading-screen")).toHaveAttribute("data-hidden", "true");
}

async function goToChapter(page, label, id) {
  await page.getByRole("button", { name: `Ir a ${label}`, exact: true }).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute("data-active", "true");
}

test("monta gráficos bajo demanda y mantiene navegación e historial", async ({ page }) => {
  await openReady(page);
  await expect(page.locator("[data-chart-state='ready']")).toHaveCount(0);

  await goToChapter(page, "Atlas vivo", "hallazgo5");
  await expect(page.locator("#chart-atlas")).toHaveAttribute("data-chart-state", "ready");
  await expect(page).toHaveURL(/#hallazgo5$/);

  await page.goBack();
  await expect(page.locator("#portada")).toHaveAttribute("data-active", "true");
  await expect(page).toHaveURL(/#portada$/);
});

test("abre un hash directo sin duplicar el desplazamiento horizontal", async ({ page }) => {
  await page.goto("/#hallazgo2");
  await expect(page.locator("html")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("#hallazgo2")).toHaveAttribute("data-active", "true");
  const position = await page.locator("#hallazgo2").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, right: rect.right, scrollX: window.scrollX };
  });
  expect(Math.abs(position.left)).toBeLessThan(1);
  expect(Math.abs(position.right - 1280)).toBeLessThan(1);
  expect(position.scrollX).toBe(0);
});

test("los filtros aparecen sobre las tarjetas y consumen la rueda", async ({ page }) => {
  await openReady(page);
  await goToChapter(page, "Atlas vivo", "hallazgo5");

  await page.getByRole("button", { name: "Cantón", exact: true }).click();
  const menu = page.locator("#overlay-root .filter-popover-menu");
  const options = menu.locator(".popover-options");
  await expect(menu).toBeVisible();
  await expect(options.getByRole("option", { name: "MANTA", exact: true })).toBeVisible();

  const hitIsOverlay = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + 24, Math.min(rect.bottom - 14, rect.top + 150));
    return element.contains(hit);
  });
  expect(hitIsOverlay).toBe(true);

  await options.hover();
  await page.mouse.wheel(0, 420);
  await expect(page.locator("#hallazgo5")).toHaveAttribute("data-active", "true");
  await expect.poll(() => options.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  for (const filter of ["Sector", "Tipo"]) {
    await page.getByRole("button", { name: filter, exact: true }).click();
    await expect(page.locator("#overlay-root .filter-popover-menu")).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("el modo comparar usa dos segmentos independientes", async ({ page }) => {
  await openReady(page);
  await goToChapter(page, "Atlas vivo", "hallazgo5");
  await page.getByRole("button", { name: "Comparar", exact: true }).click();

  await expect(page.locator(".compare-segment-row")).toHaveCount(2);
  await expect(page.locator("#atlas-trend path")).toHaveCount(2);
  await expect(page.locator("#atlas-kpi")).toContainText("244.515");
  await expect(page.locator("#atlas-kpi")).toContainText("243.688");

  const segmentB = page.locator('.compare-segment-row[data-segment="B"]');
  await segmentB.locator("select").selectOption("2026-06");
  await segmentB.getByRole("button", { name: "Cantón", exact: true }).click();
  await page.locator("#overlay-root").getByRole("option", { name: "MANTA", exact: true }).click();
  await expect(page.locator("#atlas-kpi")).toContainText("64.812");
  await expect(page.locator("#atlas-narrative")).toContainText("segmento B");
});

test("el treemap agrupa la cola y no expone celdas ilegibles", async ({ page }) => {
  await openReady(page);
  await goToChapter(page, "Actividades", "hallazgo2");
  await expect(page.locator("#chart-treemap")).toHaveAttribute("data-chart-state", "ready");

  const blocks = page.locator("#chart-treemap .tree-block");
  await expect.poll(() => blocks.count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator("#chart-treemap").getByRole("button", { name: /Otros sectores/ })).toHaveCount(1);
  expect(await blocks.evaluateAll((elements) => elements.every((element) => element.textContent.trim().length > 0))).toBe(true);
  const clipped = await blocks.evaluateAll((elements) => elements.filter((element) => element.textContent.trim() && (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)).length);
  expect(clipped).toBe(0);

  await blocks.first().click();
  const detail = page.getByRole("region", { name: "Detalle de la actividad seleccionada" });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(detail).toBeHidden();
  await expect(blocks.first()).toBeFocused();
});

test("las zonas laterales no cubren metodología y el diálogo controla el foco", async ({ page }) => {
  await openReady(page);
  const method = page.getByRole("button", { name: "Ver metodología y fuentes", exact: true });
  await method.click();
  await expect(page.getByRole("dialog", { name: "Metodología" })).toBeVisible();
  await expect(page.locator("#story-shell")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Metodología" })).toBeHidden();
  await expect(method).toBeFocused();
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`mantiene capas y geometría en ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openReady(page);
    await goToChapter(page, "Atlas vivo", "hallazgo5");
    await page.getByRole("button", { name: "Sector", exact: true }).click();
    const menu = page.locator("#overlay-root .filter-popover-menu");
    await expect(menu).toBeVisible();
    const insideViewport = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    });
    expect(insideViewport).toBe(true);
    await page.keyboard.press("Escape");

    const activePanelAligned = await page.locator("#hallazgo5").evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return Math.abs(rect.left) < 1 && Math.abs(rect.right - innerWidth) < 1;
    });
    expect(activePanelAligned).toBe(true);
  });
}
