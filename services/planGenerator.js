const SVG_NS = "http://www.w3.org/2000/svg";

// ============================================================================
// Layout-Konfiguration (aus Python LayoutConfig)
// ============================================================================
const LAYOUT = {
  xlimLeft: -40,
  xlimRightOffset: 62.4,
  ylimBottom: -60,
  ylimTopOffset: 175,
  headlineYOffset: 15,
  legendX: -35,
  legendY: 53,
  legendLineSpacing: 12,
  legendBoxTextGap: 5,
  massLinksAussenAbstand: -26.325,
  massLinksInnenAbstand: -14.175,
  massRechtsInnenAbstand: 14.175,
  massRechtsAussenAbstand: 26.325,
  massUntenAbstand: 20,
};

const WORK_AREA_HEIGHT = 75;
const HATCH_SPACING = 3;
const TEXT_OFFSET = 2.5;

// ============================================================================
// Exportierte Hilfsfunktionen (Signatur beibehalten)
// ============================================================================

/**
 * @param {import("../domain/sauna.js").SaunaConfig} saunaConfig
 * @returns {number[]}
 */
export function computeFootCenters(saunaConfig) {
  const distances = Array.isArray(saunaConfig.footDistances) ? saunaConfig.footDistances : [];
  const footThickness = Math.max(0, Number(saunaConfig.footThickness) || 0);
  const centers = [footThickness / 2];
  for (const distance of distances) {
    const innerGap = Math.max(0, Number(distance) || 0);
    centers.push(centers[centers.length - 1] + footThickness + innerGap);
  }
  return centers;
}

/**
 * @param {import("../domain/sauna.js").SaunaConfig} saunaConfig
 * @returns {{ footCount: number, totalFootSpan: number, firstToLast: number }}
 */
export function computeDerivedDimensions(saunaConfig) {
  const distances = Array.isArray(saunaConfig.footDistances) ? saunaConfig.footDistances : [];
  const footThickness = Math.max(0, Number(saunaConfig.footThickness) || 0);
  const footCount = distances.length + 1;
  const innerSum = distances.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const totalFootSpan = innerSum + footCount * footThickness;
  const firstToLast = Math.max(0, totalFootSpan - footThickness);
  return { footCount, totalFootSpan, firstToLast };
}

// ============================================================================
// Haupt-Generierungsfunktion
// ============================================================================

/**
 * @param {import("../domain/sauna.js").SaunaConfig} saunaConfig
 * @param {{ title?: string, typography?: { dimTextFontSizePx?: number } }} [options]
 * @returns {{
 *   svgElement: SVGSVGElement,
 *   metrics: { footCount: number, totalFootSpan: number, firstToLast: number },
 *   warnings: string[],
 *   geometryBounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number },
 *   annotationBounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }
 * }}
 */
export function generatePlanSvg(saunaConfig, options = {}) {
  const warnings = [];
  const metrics = computeDerivedDimensions(saunaConfig);

  const breiteCm = Math.max(0, Number(saunaConfig.footWidth) || 0);
  const fussBreite = Math.max(0, Number(saunaConfig.footThickness) || 0);
  const fundamentBreite = Math.max(0, Number(saunaConfig.foundationWidth) || 0);
  const foundationDepth = Math.max(0, Number(saunaConfig.foundationDepth) || 80);
  const footDistances = (Array.isArray(saunaConfig.footDistances) ? saunaConfig.footDistances : [])
    .map((v) => Math.max(0, Number(v) || 0));

  if (breiteCm <= 0) warnings.push("Warnung: Fussbreite ist ungueltig (<= 0).");
  if (fussBreite <= 0) warnings.push("Warnung: Fussdicke ist ungueltig (<= 0).");
  if (fundamentBreite <= 0) warnings.push("Warnung: Fundamentbreite ist ungueltig (<= 0).");
  if (footDistances.length < 1) warnings.push("Hinweis: Mindestens 2 Fuesse (1 Abstand) empfohlen.");

  const dimFontSize = Math.max(8, Number(options.typography?.dimTextFontSizePx) || 9);
  const title = options.title || "Fundamentplan";

  // ------------------------------------------------------------------
  // 1. Fuß-Positionen berechnen (Python: _berechne_fuss_positionen)
  // ------------------------------------------------------------------
  const fussPositionen = []; // [{yStart, yEnd}]
  {
    let yCurrent = 0;
    fussPositionen.push({ yStart: yCurrent, yEnd: yCurrent + fussBreite });
    for (const abstand of footDistances) {
      yCurrent = fussPositionen[fussPositionen.length - 1].yEnd + abstand;
      fussPositionen.push({ yStart: yCurrent, yEnd: yCurrent + fussBreite });
    }
  }

  // ------------------------------------------------------------------
  // 2. Fundament-Positionen berechnen (Python: _berechne_fundament_positionen)
  // ------------------------------------------------------------------
  const fundamentPositionen = []; // [{yMitte, yStart, yEnd}]
  for (const fuss of fussPositionen) {
    const yMitte = (fuss.yStart + fuss.yEnd) / 2;
    const fundYStart = yMitte - fundamentBreite / 2;
    const fundYEnd = yMitte + fundamentBreite / 2;
    fundamentPositionen.push({ yMitte, yStart: fundYStart, yEnd: fundYEnd });
  }

  // ------------------------------------------------------------------
  // 3. Arbeitsbereich
  // ------------------------------------------------------------------
  const arbeitYStart = fundamentPositionen.length > 0
    ? fundamentPositionen[fundamentPositionen.length - 1].yEnd
    : 0;
  const arbeitYEnd = arbeitYStart + WORK_AREA_HEIGHT;

  // ------------------------------------------------------------------
  // 4. Diagramm-Grenzen berechnen (Python: _setup_axes)
  // ------------------------------------------------------------------
  const yMax = (fundamentPositionen.length > 0
    ? Math.max(fundamentPositionen[fundamentPositionen.length - 1].yEnd, arbeitYEnd)
    : 100) + LAYOUT.ylimTopOffset;

  const diagramXMin = LAYOUT.xlimLeft;
  const diagramXMax = breiteCm + LAYOUT.xlimRightOffset;
  const diagramYMin = LAYOUT.ylimBottom;
  const diagramYMax = yMax;

  // SVG uses Y-down, Python uses Y-up → flip Y
  const flipY = (y) => diagramYMax - y + diagramYMin;

  const svgWidth = diagramXMax - diagramXMin;
  const svgHeight = diagramYMax - diagramYMin;

  // ------------------------------------------------------------------
  // 5. SVG-Dokument erstellen
  // ------------------------------------------------------------------
  const svg = createEl("svg", {
    xmlns: SVG_NS,
    role: "img",
    "aria-label": title,
    viewBox: `${diagramXMin} 0 ${svgWidth} ${svgHeight}`,
  });

  svg.appendChild(createDefs());
  svg.appendChild(createStyleElement(dimFontSize));

  // Grid
  const gGrid = createEl("g", { class: "layer-grid" });
  svg.appendChild(gGrid);

  // Content layers
  const gFundamente = createEl("g", { class: "layer-foundation" });
  const gFuesse = createEl("g", { class: "layer-feet" });
  const gArbeitsbereich = createEl("g", { class: "layer-workarea" });
  const gMeasures = createEl("g", { class: "layer-measures" });
  const gLegend = createEl("g", { class: "layer-legend" });
  const gHeadline = createEl("g", { class: "layer-headline" });

  // ------------------------------------------------------------------
  // 6. Fundamente zeichnen
  // ------------------------------------------------------------------
  for (const fund of fundamentPositionen) {
    gFundamente.appendChild(createEl("rect", {
      x: 0,
      y: flipY(fund.yEnd),
      width: breiteCm,
      height: fund.yEnd - fund.yStart,
      class: "fundament",
    }));
  }

  // ------------------------------------------------------------------
  // 7. Füße zeichnen (mit Nummerierung)
  // ------------------------------------------------------------------
  for (let i = 0; i < fussPositionen.length; i++) {
    const fuss = fussPositionen[i];
    const fussH = fuss.yEnd - fuss.yStart;
    const fy = flipY(fuss.yEnd);

    gFuesse.appendChild(createEl("rect", {
      x: 0,
      y: fy,
      width: breiteCm,
      height: fussH,
      class: "saunafuss",
    }));

    // Fuß-Nummer
    gFuesse.appendChild(createEl("text", {
      x: breiteCm / 2,
      y: fy + fussH / 2,
      class: "fuss-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
    }, `Fu\u00DF ${i + 1}`));
  }

  // ------------------------------------------------------------------
  // 8. Arbeitsbereich zeichnen (rot, schraffiert)
  // ------------------------------------------------------------------
  {
    const aY = flipY(arbeitYEnd);
    const aH = arbeitYEnd - arbeitYStart;

    gArbeitsbereich.appendChild(createEl("rect", {
      x: 0,
      y: aY,
      width: breiteCm,
      height: aH,
      class: "arbeitsbereich",
    }));

    // Schraffur (horizontale rote Linien)
    for (let hatchY = arbeitYStart; hatchY < arbeitYEnd; hatchY += HATCH_SPACING) {
      const sy = flipY(hatchY);
      gArbeitsbereich.appendChild(createEl("line", {
        x1: 0,
        y1: sy,
        x2: breiteCm,
        y2: sy,
        class: "hatch-line",
      }));
    }
  }

  // ------------------------------------------------------------------
  // 9. Bemaßungen zeichnen (Python: _erstelle_massnahmen + Diagramm.zeichne)
  // ------------------------------------------------------------------
  const posLinksAussen = LAYOUT.massLinksAussenAbstand;
  const posLinksInnen = LAYOUT.massLinksInnenAbstand;
  const posRechtsInnen = breiteCm + LAYOUT.massRechtsInnenAbstand;
  const posRechtsAussen = breiteCm + LAYOUT.massRechtsAussenAbstand;
  const posUnten = (fundamentPositionen.length > 0 ? fundamentPositionen[0].yStart : 0) - LAYOUT.massUntenAbstand;

  // Links außen: Fundamentbreiten (darkgreen)
  for (const fund of fundamentPositionen) {
    const breite = fund.yEnd - fund.yStart;
    drawVerticalMeasure(gMeasures, posLinksAussen, fund.yStart, fund.yEnd, `${fmt(breite)}`, "darkgreen", "right", dimFontSize, flipY);
  }

  // Links innen: Fußdicken (darkred)
  for (const fuss of fussPositionen) {
    drawVerticalMeasure(gMeasures, posLinksInnen, fuss.yStart, fuss.yEnd, `${fmt(fussBreite)}`, "darkred", "right", dimFontSize, flipY);
  }

  // Rechts innen: Innenabstände (red)
  for (let i = 0; i < fussPositionen.length - 1; i++) {
    const yEnd1 = fussPositionen[i].yEnd;
    const yStart2 = fussPositionen[i + 1].yStart;
    const abstand = yStart2 - yEnd1;
    drawVerticalMeasure(gMeasures, posRechtsInnen, yEnd1, yStart2, `${fmt(abstand)}`, "red", "left", dimFontSize, flipY);
  }

  // Rechts außen: Gesamtmaß (blue)
  if (fundamentPositionen.length > 0) {
    const yStartFirst = fundamentPositionen[0].yStart;
    const yEndLast = fundamentPositionen[fundamentPositionen.length - 1].yEnd;
    drawVerticalMeasure(gMeasures, posRechtsAussen, yStartFirst, yEndLast, `${fmt(yEndLast - yStartFirst)}cm`, "blue", "left", 12, flipY);
  }

  // Rechts außen: Arbeitsbereich-Höhe (red)
  drawVerticalMeasure(gMeasures, posRechtsAussen, arbeitYStart, arbeitYEnd, `${fmt(WORK_AREA_HEIGHT)}`, "red", "left", 10, flipY);

  // Unten: Breite (purple)
  drawHorizontalMeasure(gMeasures, posUnten, 0, breiteCm, `${fmt(breiteCm)}`, "purple", "below", 11, flipY);

  // ------------------------------------------------------------------
  // 10. Legende (oben links, wie Python)
  // ------------------------------------------------------------------
  {
    const legendStartY = yMax - LAYOUT.legendY;
    const items = [
      { color: "lightgray", text: `Streifenfundament frostsichere Tiefe ${fmt(foundationDepth)}cm` },
      { color: "saddlebrown", text: "Saunafu\u00DF" },
      { color: "red", text: "Arbeitsbereich Monteur/Elektriker" },
    ];

    const boxW = 15;
    const boxH = 8;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const iy = flipY(legendStartY - i * LAYOUT.legendLineSpacing);

      gLegend.appendChild(createEl("rect", {
        x: LAYOUT.legendX,
        y: iy - boxH / 2,
        width: boxW,
        height: boxH,
        fill: item.color,
        stroke: "black",
        "stroke-width": 1,
        opacity: 0.8,
      }));

      gLegend.appendChild(createEl("text", {
        x: LAYOUT.legendX + boxW + LAYOUT.legendBoxTextGap,
        y: iy,
        class: "legend-text",
        "dominant-baseline": "central",
      }, item.text));
    }
  }

  // ------------------------------------------------------------------
  // 11. Überschrift (oben mittig)
  // ------------------------------------------------------------------
  {
    const headlineY = yMax - LAYOUT.headlineYOffset;
    gHeadline.appendChild(createEl("text", {
      x: breiteCm / 2,
      y: flipY(headlineY),
      class: "headline",
      "text-anchor": "middle",
      "dominant-baseline": "central",
    }, title));
  }

  // ------------------------------------------------------------------
  // 12. Reihenfolge: Grid → Fundamente → Füße → Arbeitsbereich → Maße → Legende → Headline
  // ------------------------------------------------------------------
  svg.appendChild(gFundamente);
  svg.appendChild(gFuesse);
  svg.appendChild(gArbeitsbereich);
  svg.appendChild(gMeasures);
  svg.appendChild(gLegend);
  svg.appendChild(gHeadline);

  // ------------------------------------------------------------------
  // 13. Bounds berechnen
  // ------------------------------------------------------------------
  const geometryBounds = {
    minX: 0,
    minY: flipY(arbeitYEnd),
    maxX: breiteCm,
    maxY: flipY(fundamentPositionen.length > 0 ? fundamentPositionen[0].yStart : 0),
    width: breiteCm,
    height: arbeitYEnd - (fundamentPositionen.length > 0 ? fundamentPositionen[0].yStart : 0),
  };

  const annotationBounds = {
    minX: diagramXMin,
    minY: 0,
    maxX: diagramXMax,
    maxY: svgHeight,
    width: svgWidth,
    height: svgHeight,
  };

  return { svgElement: svg, metrics, warnings, geometryBounds, annotationBounds };
}

// ============================================================================
// Bemaßungs-Zeichenfunktionen
// ============================================================================

function drawVerticalMeasure(parent, xPos, yStartUp, yEndUp, label, color, textSide, fontSize, flipY) {
  const y1 = flipY(yStartUp);
  const y2 = flipY(yEndUp);
  const yTop = Math.min(y1, y2);
  const yBottom = Math.max(y1, y2);

  // Hilfslinien (gestrichelt, von Objekt zur Maßlinie)
  parent.appendChild(createEl("line", {
    x1: 0, y1: yTop, x2: xPos, y2: yTop,
    class: "hilfs-line",
  }));
  parent.appendChild(createEl("line", {
    x1: 0, y1: yBottom, x2: xPos, y2: yBottom,
    class: "hilfs-line",
  }));

  // Doppelpfeil
  parent.appendChild(createEl("line", {
    x1: xPos, y1: yTop, x2: xPos, y2: yBottom,
    stroke: color,
    "stroke-width": 1.5,
    "marker-start": "url(#arrow-start)",
    "marker-end": "url(#arrow-end)",
  }));

  // Beschriftung
  const textY = (yTop + yBottom) / 2;
  const textX = textSide === "right" ? xPos - TEXT_OFFSET : xPos + TEXT_OFFSET;
  const anchor = textSide === "right" ? "end" : "start";

  // Hintergrund-Box
  const estWidth = String(label).length * fontSize * 0.6;
  const boxX = textSide === "right" ? textX - estWidth - 2 : textX - 2;
  parent.appendChild(createEl("rect", {
    x: boxX,
    y: textY - fontSize * 0.6,
    width: estWidth + 4,
    height: fontSize * 1.3,
    fill: "white",
    opacity: 0.8,
    rx: 2,
  }));

  parent.appendChild(createEl("text", {
    x: textX,
    y: textY,
    fill: color,
    "font-size": `${fontSize}px`,
    "font-weight": "bold",
    "text-anchor": anchor,
    "dominant-baseline": "central",
  }, label));
}

function drawHorizontalMeasure(parent, yPosUp, xStart, xEnd, label, color, textSide, fontSize, flipY) {
  const yLine = flipY(yPosUp);
  const yTextOffset = textSide === "below" ? TEXT_OFFSET + 3 : -(TEXT_OFFSET + 3);
  const yArrow = yLine;

  // Hilfslinien
  parent.appendChild(createEl("line", {
    x1: xStart, y1: flipY(0), x2: xStart, y2: yLine,
    class: "hilfs-line",
  }));
  parent.appendChild(createEl("line", {
    x1: xEnd, y1: flipY(0), x2: xEnd, y2: yLine,
    class: "hilfs-line",
  }));

  // Doppelpfeil
  parent.appendChild(createEl("line", {
    x1: xStart, y1: yArrow, x2: xEnd, y2: yArrow,
    stroke: color,
    "stroke-width": 1.5,
    "marker-start": "url(#arrow-start)",
    "marker-end": "url(#arrow-end)",
  }));

  // Beschriftung
  const textX = (xStart + xEnd) / 2;
  const textY = yLine + yTextOffset;

  const estWidth = String(label).length * fontSize * 0.6;
  parent.appendChild(createEl("rect", {
    x: textX - estWidth / 2 - 2,
    y: textY - fontSize * 0.6,
    width: estWidth + 4,
    height: fontSize * 1.3,
    fill: "white",
    opacity: 0.8,
    rx: 2,
  }));

  parent.appendChild(createEl("text", {
    x: textX,
    y: textY,
    fill: color,
    "font-size": `${fontSize}px`,
    "font-weight": "bold",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  }, label));
}

// ============================================================================
// SVG-Hilfsfunktionen
// ============================================================================

function createStyleElement(dimFontSize) {
  const style = createEl("style");
  style.textContent = `
    .fundament {
      fill: lightgray;
      stroke: darkgray;
      stroke-width: 2;
      opacity: 0.6;
    }
    .saunafuss {
      fill: saddlebrown;
      stroke: black;
      stroke-width: 2;
      opacity: 0.8;
    }
    .fuss-label {
      fill: white;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: 9px;
      font-weight: bold;
      pointer-events: none;
    }
    .arbeitsbereich {
      fill: none;
      stroke: red;
      stroke-width: 2;
      opacity: 0.8;
    }
    .hatch-line {
      stroke: red;
      stroke-width: 0.5;
      opacity: 0.4;
    }
    .hilfs-line {
      stroke: black;
      stroke-width: 0.8;
      stroke-dasharray: 4 3;
      opacity: 0.5;
    }
    .legend-text {
      fill: #111;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: 9px;
    }
    .headline {
      fill: #111;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: 14px;
      font-weight: bold;
    }
    .layer-grid line {
      stroke: #ccc;
      stroke-width: 0.3;
      opacity: 0.3;
    }
  `;
  return style;
}

function createDefs() {
  const defs = createEl("defs");

  // Arrow marker - start (pointing backward)
  const markerStart = createEl("marker", {
    id: "arrow-start",
    viewBox: "0 0 10 10",
    refX: "1",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse",
    markerUnits: "strokeWidth",
  });
  markerStart.appendChild(createEl("path", { d: "M 10 0 L 0 5 L 10 10 z", fill: "currentColor" }));
  defs.appendChild(markerStart);

  // Arrow marker - end (pointing forward)
  const markerEnd = createEl("marker", {
    id: "arrow-end",
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto",
    markerUnits: "strokeWidth",
  });
  markerEnd.appendChild(createEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "currentColor" }));
  defs.appendChild(markerEnd);

  return defs;
}

function createEl(name, attrs = {}, textContent = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
  if (textContent) {
    element.textContent = textContent;
  }
  return element;
}

function fmt(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
