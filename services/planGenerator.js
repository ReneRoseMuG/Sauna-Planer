const SVG_NS = "http://www.w3.org/2000/svg";
const SCALE = 10; // 1 cm = 10 SVG units
const DEFAULT_DIM_TEXT_FONT_SIZE_PX = 13;

/**
 * @typedef {Object} PlanMetrics
 * @property {number} footCount
 * @property {number} totalFootSpan
 * @property {number} firstToLast
 */

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
 * @returns {PlanMetrics}
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

/**
 * @param {import("../domain/sauna.js").SaunaConfig} saunaConfig
 * @param {{title?: string, typography?: { dimTextFontSizePx?: number }}=} options
 * @returns {{
 *   svgElement: SVGSVGElement,
 *   metrics: PlanMetrics,
 *   warnings: string[],
 *   geometryBounds: { xMin:number, yMin:number, minX:number, minY:number, maxX:number, maxY:number, width:number, height:number },
 *   annotationBounds: { xMin:number, yMin:number, minX:number, minY:number, maxX:number, maxY:number, width:number, height:number }
 * }}
 */
export function generatePlanSvg(saunaConfig, options = {}) {
  const warnings = [];
  const metrics = computeDerivedDimensions(saunaConfig);

  // Verbindliche Achsensemantik (SizeX/SizeY)
  const barrelSizeX = cm(Math.max(0, Number(saunaConfig.barrelWidth) || 0));
  const barrelSizeY = cm(Math.max(0, Number(saunaConfig.barrelLength) || 0));
  const footSizeX = cm(Math.max(0, Number(saunaConfig.footWidth) || 0));
  const footSizeY = cm(Math.max(0, Number(saunaConfig.footThickness) || 0));
  // Fachregel:
  // - foundationWidth beschreibt die Ausdehnung auf der Y-Achse.
  // - Auf der X-Achse entspricht der Fundamentstreifen exakt der Fussbreite.
  const foundationSizeX = footSizeX;
  const foundationSizeY = cm(Math.max(0, Number(saunaConfig.foundationWidth) || 0));

  if (barrelSizeX <= 0 || barrelSizeY <= 0) {
    warnings.push("Warnung: Fassgroesse ist ungueltig (Breite/Laenge <= 0).");
  }
  if (footSizeX <= 0 || footSizeY <= 0) {
    warnings.push("Warnung: Fussgroesse ist ungueltig (footSizeX/footSizeY <= 0).");
  }
  if (foundationSizeY <= 0) {
    warnings.push("Warnung: Fundamentbreite ist ungueltig (foundationSizeY <= 0).");
  }

  const rawDistances = Array.isArray(saunaConfig.footDistances) ? saunaConfig.footDistances : [];
  const footDistancesCm = rawDistances.map((value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      return 0;
    }
    return n;
  });
  if (rawDistances.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
    warnings.push("Warnung: footDistances enthaelt ungueltige Werte. Diese wurden auf 0 gesetzt.");
  }
  if (footDistancesCm.length < 2) {
    warnings.push("Hinweis: Fuer die Reihen-Variante werden mindestens 3 Fuesse (footDistances.length >= 2) empfohlen.");
  }

  const dimTextFontSizePx = Math.max(9, Number(options.typography?.dimTextFontSizePx) || DEFAULT_DIM_TEXT_FONT_SIZE_PX);

  const svg = createEl("svg", {
    xmlns: SVG_NS,
    role: "img",
    "aria-label": options.title || "Fundamentplan",
  });

  svg.appendChild(createDefs());
  svg.appendChild(createStyle(dimTextFontSizePx));

  const gGeometry = createEl("g", { class: "geometry-group layer-geometry", "data-group": "geometry" });
  const gAnnotation = createEl("g", { class: "annotation-group layer-annotation", "data-group": "annotation" });

  const gBarrel = createEl("g", { class: "layer-barrel" });
  const gFoundation = createEl("g", { class: "layer-foundation" });
  const gFeet = createEl("g", { class: "layer-feet" });
  const gGuides = createEl("g", { class: "layer-guides" });
  const gDims = createEl("g", { class: "layer-dimensions" });
  const gText = createEl("g", { class: "layer-text" });

  gGeometry.appendChild(gBarrel);
  gGeometry.appendChild(gFoundation);
  gGeometry.appendChild(gFeet);

  gAnnotation.appendChild(gGuides);
  gAnnotation.appendChild(gDims);
  gAnnotation.appendChild(gText);

  const barrelX = -barrelSizeX / 2;
  const barrelY = -barrelSizeY / 2;
  const barrelMaxX = barrelX + barrelSizeX;
  const barrelMaxY = barrelY + barrelSizeY;

  gBarrel.appendChild(
    createEl("rect", {
      x: barrelX,
      y: barrelY,
      width: barrelSizeX,
      height: barrelSizeY,
    })
  );

  let geometryMinX = barrelX;
  let geometryMaxX = barrelMaxX;
  let geometryMinY = barrelY;
  let geometryMaxY = barrelMaxY;

  const footCount = footDistancesCm.length + 1;
  // Interne Konstruktionslogik in Y-up, mit Bezug auf die untere Fasskante als Null-Referenz:
  // - "Y=0" fuer die Streifenreihe entspricht der unteren Fasskante.
  // - erster Fundamentstreifen: Unterkante bei dieser Referenz.
  const barrelBottomYUp = -barrelSizeY / 2;
  const foundationCenterYUp = [barrelBottomYUp + foundationSizeY / 2];
  /** @type {number[]} */
  const footCenterYUp = [foundationCenterYUp[0]];
  for (let i = 1; i < footCount; i += 1) {
    const gapY = cm(footDistancesCm[i - 1]);
    footCenterYUp.push(footCenterYUp[i - 1] + footSizeY / 2 + gapY + footSizeY / 2);
    foundationCenterYUp.push(footCenterYUp[i]);
  }

  for (let i = 0; i < footCenterYUp.length; i += 1) {
    const foundationCenterYSvg = yUpToSvg(foundationCenterYUp[i]);
    const footCenterYSvg = yUpToSvg(footCenterYUp[i]);

    const foundationRect = createRectFromCenter(0, foundationCenterYSvg, foundationSizeX, foundationSizeY);
    const footRect = createRectFromCenter(0, footCenterYSvg, footSizeX, footSizeY);
    gFoundation.appendChild(foundationRect);
    gFeet.appendChild(footRect);

    geometryMinX = Math.min(geometryMinX, -foundationSizeX / 2, -footSizeX / 2);
    geometryMaxX = Math.max(geometryMaxX, foundationSizeX / 2, footSizeX / 2);
    geometryMinY = Math.min(geometryMinY, foundationCenterYSvg - foundationSizeY / 2, footCenterYSvg - footSizeY / 2);
    geometryMaxY = Math.max(geometryMaxY, foundationCenterYSvg + foundationSizeY / 2, footCenterYSvg + footSizeY / 2);
  }

  let annotationMinX = Number.POSITIVE_INFINITY;
  let annotationMaxX = Number.NEGATIVE_INFINITY;
  let annotationMinY = Number.POSITIVE_INFINITY;
  let annotationMaxY = Number.NEGATIVE_INFINITY;

  const trackAnnotation = (bounds) => {
    if (!bounds) return;
    annotationMinX = Math.min(annotationMinX, bounds.minX);
    annotationMaxX = Math.max(annotationMaxX, bounds.maxX);
    annotationMinY = Math.min(annotationMinY, bounds.minY);
    annotationMaxY = Math.max(annotationMaxY, bounds.maxY);
  };

  const rightDimRefX = Math.max(geometryMaxX, barrelMaxX);
  const rightSegmentOffsetX = cm(22);
  const rightBarrelLengthOffsetX = cm(50); // ganz rechts aussen
  const leftDimRefX = -foundationSizeX / 2;
  const leftDetailOffsetX = -cm(30);
  const leftOverallOffsetX = -cm(44);
  const leftMostDimX = leftDimRefX + Math.min(leftDetailOffsetX, leftOverallOffsetX);
  const leftTextX = leftMostDimX - cm(6);
  const leftOverallTextX = leftTextX - cm(7);

  // Fuer jeden Fuss links eine Aussen-Bemassung:
  // Randabstand oben, Fussdicke, Randabstand unten, Gesamtbreite des Fundamentstreifens.
  for (let i = 0; i < footCenterYUp.length; i += 1) {
    const yFoundationTopUp = foundationCenterYUp[i] + foundationSizeY / 2;
    const yFootTopUp = footCenterYUp[i] + footSizeY / 2;
    const yFootBottomUp = footCenterYUp[i] - footSizeY / 2;
    const yFoundationBottomUp = foundationCenterYUp[i] - foundationSizeY / 2;
    const marginUpCm = ((foundationSizeY - footSizeY) / 2) / SCALE;

    trackAnnotation(
      drawDimension({
        x1: leftDimRefX,
        y1: yUpToSvg(yFoundationTopUp),
        x2: leftDimRefX,
        y2: yUpToSvg(yFootTopUp),
        offset: leftDetailOffsetX,
        text: `${formatCm(marginUpCm)}`,
        orientation: "vertical",
        guidesGroup: gGuides,
        dimGroup: gDims,
        textGroup: gText,
        textXOverride: leftTextX,
        textAnchorOverride: "end",
        rotateText: false,
        fontSizePx: dimTextFontSizePx,
      })
    );

    trackAnnotation(
      drawDimension({
        x1: leftDimRefX,
        y1: yUpToSvg(yFootTopUp),
        x2: leftDimRefX,
        y2: yUpToSvg(yFootBottomUp),
        offset: leftDetailOffsetX,
        text: `${formatCm(Number(saunaConfig.footThickness) || 0)}`,
        orientation: "vertical",
        guidesGroup: gGuides,
        dimGroup: gDims,
        textGroup: gText,
        textXOverride: leftTextX,
        textAnchorOverride: "end",
        rotateText: false,
        fontSizePx: dimTextFontSizePx,
      })
    );

    trackAnnotation(
      drawDimension({
        x1: leftDimRefX,
        y1: yUpToSvg(yFootBottomUp),
        x2: leftDimRefX,
        y2: yUpToSvg(yFoundationBottomUp),
        offset: leftDetailOffsetX,
        text: `${formatCm(marginUpCm)}`,
        orientation: "vertical",
        guidesGroup: gGuides,
        dimGroup: gDims,
        textGroup: gText,
        textXOverride: leftTextX,
        textAnchorOverride: "end",
        rotateText: false,
        fontSizePx: dimTextFontSizePx,
      })
    );

    trackAnnotation(
      drawDimension({
        x1: leftDimRefX,
        y1: yUpToSvg(yFoundationTopUp),
        x2: leftDimRefX,
        y2: yUpToSvg(yFoundationBottomUp),
        offset: leftOverallOffsetX,
        text: `${formatCm(Number(saunaConfig.foundationWidth) || 0)}`,
        orientation: "vertical",
        guidesGroup: gGuides,
        dimGroup: gDims,
        textGroup: gText,
        textXOverride: leftOverallTextX,
        textAnchorOverride: "end",
        rotateText: false,
        fontSizePx: dimTextFontSizePx,
      })
    );
  }

  // Rechts: Segmentmasse (Innenkante zu Innenkante) entlang der Y-Achse
  for (let i = 0; i < footCenterYUp.length - 1; i += 1) {
    const yInnerUpperCurrentUp = footCenterYUp[i] + footSizeY / 2;
    const yInnerLowerNextUp = footCenterYUp[i + 1] - footSizeY / 2;

    trackAnnotation(
      drawDimension({
        x1: rightDimRefX,
        y1: yUpToSvg(yInnerUpperCurrentUp),
        x2: rightDimRefX,
        y2: yUpToSvg(yInnerLowerNextUp),
        offset: rightSegmentOffsetX,
        text: `${formatCm(footDistancesCm[i])}`,
        orientation: "vertical",
        guidesGroup: gGuides,
        dimGroup: gDims,
        textGroup: gText,
        fontSizePx: dimTextFontSizePx,
      })
    );
  }

  // Fussbreite (X) ueber der Fassbreiten-Bemassung
  trackAnnotation(
    drawDimension({
      x1: -footSizeX / 2,
      y1: barrelMaxY,
      x2: footSizeX / 2,
      y2: barrelMaxY,
      offset: cm(20),
      text: `${formatCm(Number(saunaConfig.footWidth) || 0)}`,
      orientation: "horizontal",
      guidesGroup: gGuides,
      dimGroup: gDims,
      textGroup: gText,
      fontSizePx: dimTextFontSizePx,
    })
  );

  // Fassmasse weiterhin technisch zugeordnet
  trackAnnotation(
    drawDimension({
      x1: barrelX,
      y1: barrelMaxY,
      x2: barrelMaxX,
      y2: barrelMaxY,
      offset: cm(42),
      text: `${formatCm(Number(saunaConfig.barrelWidth) || 0)}`,
      orientation: "horizontal",
      guidesGroup: gGuides,
      dimGroup: gDims,
      textGroup: gText,
      textOffsetOverride: cm(6),
      fontSizePx: dimTextFontSizePx,
    })
  );

  // Rechts ganz aussen: Fasslaenge
  trackAnnotation(
    drawDimension({
      x1: rightDimRefX,
      y1: barrelY,
      x2: rightDimRefX,
      y2: barrelMaxY,
      offset: rightBarrelLengthOffsetX,
      text: `${formatCm(Number(saunaConfig.barrelLength) || 0)}`,
      orientation: "vertical",
      guidesGroup: gGuides,
      dimGroup: gDims,
      textGroup: gText,
      fontSizePx: dimTextFontSizePx,
    })
  );

  const geometryBounds = createBounds(geometryMinX, geometryMinY, geometryMaxX, geometryMaxY);
  const annotationBounds = Number.isFinite(annotationMinX)
    ? createBounds(annotationMinX, annotationMinY, annotationMaxX, annotationMaxY)
    : { ...geometryBounds };

  const fullMinX = Math.min(geometryBounds.minX, annotationBounds.minX);
  const fullMinY = Math.min(geometryBounds.minY, annotationBounds.minY);
  const fullMaxX = Math.max(geometryBounds.maxX, annotationBounds.maxX);
  const fullMaxY = Math.max(geometryBounds.maxY, annotationBounds.maxY);

  svg.setAttribute("viewBox", `${Math.floor(fullMinX)} ${Math.floor(fullMinY)} ${Math.ceil(fullMaxX - fullMinX)} ${Math.ceil(fullMaxY - fullMinY)}`);

  svg.appendChild(gGeometry);
  svg.appendChild(gAnnotation);

  return { svgElement: svg, metrics, warnings, geometryBounds, annotationBounds };
}

function drawDimension({
  x1,
  y1,
  x2,
  y2,
  offset,
  text,
  orientation,
  guidesGroup,
  dimGroup,
  textGroup,
  textXOverride,
  textAnchorOverride,
  textOffsetOverride,
  rotateText = true,
  fontSizePx = DEFAULT_DIM_TEXT_FONT_SIZE_PX,
}) {
  const extensionOvershoot = cm(0.8); // 8 mm
  const objectGap = cm(0.4); // 4 mm
  const defaultTextOffset = cm(2.8);
  const textOffset = Number.isFinite(Number(textOffsetOverride)) ? Number(textOffsetOverride) : defaultTextOffset;
  const markerPad = cm(1.8);
  const fontSize = Math.max(9, Number(fontSizePx) || DEFAULT_DIM_TEXT_FONT_SIZE_PX);

  if (orientation === "horizontal") {
    const direction = offset >= 0 ? 1 : -1;
    const baseY = (y1 + y2) / 2;
    const dimY = baseY + offset;
    const extStartY = baseY + direction * objectGap;
    const extEndY = dimY + direction * extensionOvershoot;

    guidesGroup.appendChild(createEl("line", { x1, y1: extStartY, x2: x1, y2: extEndY }));
    guidesGroup.appendChild(createEl("line", { x1: x2, y1: extStartY, x2, y2: extEndY }));
    dimGroup.appendChild(createEl("line", { x1, y1: dimY, x2, y2: dimY }));

    const textX = (x1 + x2) / 2;
    // Horizontale Massbeschriftung immer unter der Masslinie platzieren.
    const textY = dimY + textOffset;
    textGroup.appendChild(
      createEl(
        "text",
        { x: textX, y: textY, "text-anchor": textAnchorOverride || "middle", "dominant-baseline": "hanging" },
        text
      )
    );

    const textWidth = estimateTextWidth(text, fontSize);
    return {
      minX: Math.min(x1, x2, textX - textWidth / 2) - markerPad,
      minY: Math.min(extStartY, extEndY, dimY, textY - fontSize) - markerPad,
      maxX: Math.max(x1, x2, textX + textWidth / 2) + markerPad,
      maxY: Math.max(extStartY, extEndY, dimY, textY) + markerPad,
    };
  }

  const direction = offset >= 0 ? 1 : -1;
  const baseX = (x1 + x2) / 2;
  const dimX = baseX + offset;
  const extStartX = baseX + direction * objectGap;
  const extEndX = dimX + direction * extensionOvershoot;

  guidesGroup.appendChild(createEl("line", { x1: extStartX, y1, x2: extEndX, y2: y1 }));
  guidesGroup.appendChild(createEl("line", { x1: extStartX, y1: y2, x2: extEndX, y2 }));
  dimGroup.appendChild(createEl("line", { x1: dimX, y1, x2: dimX, y2 }));

  const textX = dimX + direction * textOffset;
  const textY = (y1 + y2) / 2;
  const finalTextX = Number.isFinite(Number(textXOverride)) ? Number(textXOverride) : textX;
  const finalTextAnchor = textAnchorOverride || "middle";
  textGroup.appendChild(
    rotateText
      ? createEl(
          "text",
          {
            x: finalTextX,
            y: textY,
            transform: `rotate(90 ${finalTextX} ${textY})`,
            "text-anchor": finalTextAnchor,
          },
          text
        )
      : createEl(
          "text",
          {
            x: finalTextX,
            y: textY,
            "text-anchor": finalTextAnchor,
            "dominant-baseline": "middle",
          },
          text
        )
  );

  const textWidth = estimateTextWidth(text, fontSize);
  const textHalfSpanY = rotateText ? textWidth / 2 : fontSize / 2;
  const textHalfSpanX = rotateText ? fontSize / 2 : textWidth / 2;
  return {
    minX: Math.min(extStartX, extEndX, dimX, finalTextX - textHalfSpanX) - markerPad,
    minY: Math.min(y1, y2, textY - textHalfSpanY) - markerPad,
    maxX: Math.max(extStartX, extEndX, dimX, finalTextX + textHalfSpanX) + markerPad,
    maxY: Math.max(y1, y2, textY + textHalfSpanY) + markerPad,
  };
}

function createStyle(dimTextFontSizePx) {
  const style = createEl("style");
  style.textContent = `
    .layer-barrel rect {
      fill: #f3f4f6;
      stroke: #111827;
      stroke-width: 2.4;
      vector-effect: non-scaling-stroke;
    }
    .layer-foundation rect {
      fill: #374151;
      stroke: #000000;
      stroke-width: 3.6;
      vector-effect: non-scaling-stroke;
      opacity: 0.96;
    }
    .layer-feet rect {
      fill: #f59e0b;
      stroke: #78350f;
      stroke-width: 2.8;
      vector-effect: non-scaling-stroke;
      opacity: 0.98;
    }
    .layer-guides line {
      stroke: #4b5563;
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
    }
    .layer-dimensions line {
      stroke: #0f172a;
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      marker-start: url(#dim-arrow);
      marker-end: url(#dim-arrow);
    }
    .layer-text text {
      fill: #111827;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: ${dimTextFontSizePx}px;
      font-weight: 600;
    }
  `;
  return style;
}

function createDefs() {
  const defs = createEl("defs");
  const marker = createEl("marker", {
    id: "dim-arrow",
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse",
    markerUnits: "strokeWidth",
  });
  marker.appendChild(createEl("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#0f172a" }));
  defs.appendChild(marker);
  return defs;
}

function createRectFromCenter(cx, cy, width, height) {
  return createEl("rect", {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  });
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

function createBounds(minX, minY, maxX, maxY) {
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    xMin: minX,
    yMin: minY,
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
  };
}

function estimateTextWidth(text, fontSize = 14) {
  return String(text || "").length * (fontSize * 0.56);
}

function cm(value) {
  return (Number(value) || 0) * SCALE;
}

function yUpToSvg(valueYUp) {
  return -valueYUp;
}

function formatCm(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}
