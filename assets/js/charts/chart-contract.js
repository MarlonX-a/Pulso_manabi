/**
 * Contrato común de los módulos de gráfico.
 *
 * createChart({ el, data, store, motion }) => {
 *   id: string,
 *   mount():   construye el SVG/DOM una sola vez, sin animar. Se llama de forma
 *              perezosa cuando el capítulo entra en el rango [activo-1, activo+1].
 *   enter():   anima la construcción del gráfico. Se invoca en cada chapter:enter
 *              del panel que lo contiene.
 *   update(state): reacciona a un cambio de filtros/controles propios o del store.
 *   resize():  vuelve a calcular dimensiones (debounced en window resize).
 *   destroy(): limpia listeners si el módulo lo requiere.
 * }
 */
export const CHART_CONTRACT_VERSION = 1;
