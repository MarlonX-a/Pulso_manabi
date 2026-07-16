# Pulso Manabí — V3

Trabajo Autónomo N.º 2, **Categoría A: Web Interactiva con Scroll Horizontal**, de la materia IS-604
Visualización de Datos. Convierte el análisis del Catastro Tributario del Servicio de Rentas Internas
(mismo dataset del Trabajo Autónomo N.º 1) en una experiencia web narrada con **11 paneles horizontales**,
navegables con clic en los bordes, flechas del teclado, rueda del mouse, swipe táctil o el riel de progreso.

## Descripción

El sitio recorre el comportamiento tributario de los contribuyentes de la provincia de Manabí entre
enero de 2022 y junio de 2026: contexto, objetivos, cinco hallazgos con gráficos avanzados en D3.js
(sunburst, treemap, cascada/waterfall, sankey y un explorador interactivo tipo dashboard), conclusiones,
recomendaciones y créditos. La referencia visual y de interacción es el sitio de GTA VI
(rockstargames.com/VI), adaptada a un desplazamiento horizontal por capítulos con transiciones de color,
tipografía display gigante y revelados animados.

## Datos

Los 6 CSV originales (`Fact_Activos`, `Fact_Inscripciones`, `Fact_Cierres`, `Dim_Actividad`, `Dim_Ubicacion`,
`Dim_Fecha`) están en `data/raw/`. `scripts/prepare-data.mjs` valida su esquema, agrega y compacta la
información en `data/dataset.json`, el único archivo que consume el navegador.

- 244.515 contribuyentes activos en junio de 2026 (desde 173.313 en enero de 2022).
- 22 cantones, 102 parroquias y 25 sectores económicos (CIIU).
- Balance del primer semestre de 2026: 12.691 inscripciones − 15.169 cierres = **−2.478**.
- Vacíos documentados: noviembre de 2024 y diciembre de 2025.

## Ejecución

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev
```

`npm run dev` y `npm run build` regeneran automáticamente `data/dataset.json` a partir de los CSV
(`predev` / `prebuild`). Para producción:

```bash
npm run build
npm run preview
```

Las comprobaciones automatizadas de navegación, filtros, capas y gráficos de escritorio se ejecutan con:

```bash
npm run test:e2e
npm run check
```

## Estructura

```
index.html                  ← página principal, scroll horizontal, copy de las 11 secciones
assets/css/styles.css       ← tokens de diseño, layout, navegación, componentes
assets/js/main.js           ← arranque, carga de datos, lógica de scroll y navegación
assets/js/core/             ← store, motor de navegación, animación, formato, datos, sectores
assets/js/sections/         ← hooks de entrada para secciones con contadores animados
assets/js/charts/           ← una carpeta por gráfico avanzado (hallazgo1_sunburst … hallazgo5_atlas)
data/raw/                   ← CSV originales del SRI
data/dataset.json           ← dataset compacto generado (no editar a mano)
scripts/prepare-data.mjs    ← genera y valida data/dataset.json
```

## Gráficos avanzados

| Sección | Gráfico | Interacción |
|---|---|---|
| Hallazgo 1 · Territorio | Sunburst (cantón → parroquia) | Clic para drill-down, hover con tooltip, ranking vinculado |
| Hallazgo 2 · Actividades | Treemap por sector | Dropdown de periodo (54 meses) + toggle por tipo de contribuyente |
| Hallazgo 3 · Evolución | Cascada (waterfall) mensual | Botones de año 2022–2026, tooltip por mes |
| Hallazgo 4 · Calidad | Diagrama de flujo (Sankey) | Hover resalta rutas del pipeline de datos |
| Hallazgo 5 · Atlas vivo | Dashboard coordinado | Filtros globales, reproducción y comparación A/B de dos segmentos completos |

## Herramientas y recursos

HTML · CSS · JavaScript (ES modules) · Vite · D3.js · d3-sankey · GSAP · lucide-static (iconos) ·
@fontsource (Archivo Black + Manrope). La composición toma como referencia el ritmo editorial e
inmersivo del sitio de Grand Theft Auto VI, sin reutilizar su identidad, plantillas ni recursos gráficos.

## Créditos

- Carrera: Ingeniería de Software, ULEAM.
- Materia: IS-604 Visualización de Datos, período 2026-1.
- Docente: Legarda Albiño Anthony Christopher, Mgs.
- Integrantes: Alvia Mero Anderson Marlon, Delgado Párraga Rolando Jair y Cedeño Soledispa Derek Josue.
- Fuente: Servicio de Rentas Internas (SRI), Catastro Tributario, Datos Abiertos.
