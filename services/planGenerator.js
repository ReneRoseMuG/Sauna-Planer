const SVG_NS = "http://www.w3.org/2000/svg";
const SCALE = 10; // 1 cm = 10 SVG units

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
  const centers = [0];
  for (const distance of distances) {
    const innerGap = Math.max(0, Number(distance) || 0);
    // Innenabstand -> Mittelpunktabstand = Innenabstand + Fussdicke.
    centers.push(centers[centers.length - 1] + innerGap + footThickness);
  }
  return centers;
}

/**
 * @param {import("../domain/sauna.js").SaunaConfig} saunaConfig
 * @returns {PlanMetrics}
 */
export function computeDerivedDimensions(saunaConfig) {
  const centers = computeFootCenters(saunaConfig);
  const footThickness = Math.max(0, Number(saunaConfig.footThickness) || 0);
  const first = centers[0] ?? 0;
  const last = centers[centers.length - 1] ?? 0;
  const firstToLast = last - first; // Mittelpunkt erster zu Mittelpunkt letzter Fuss.
  const totalFootSpan = firstToLast + footThickness; // Aussenkante erster bis Aussenkante letzter Fuss.
  return {
    footCount: centers.length,
    totalFootSpan,
    firstToLast,
  };
}

/**
 * @param {import("../domain/sauna.js").SaunaConfig} saunaConfig
 * @param {{title?: string}=} options
 * @returns {{ svgElement: SVGSVGElement, metrics: PlanMetrics, warnings: string[] }}
 */
export function generatePlanSvg(saunaConfig, options = {}) {
  const warnings = [];
  const metrics = computeDerivedDimensions(saunaConfig);
  const centersRaw = computeFootCenters(saunaConfig);
  const centerShift = ((centersRaw[0] ?? 0) + (centersRaw[centersRaw.length - 1] ?? 0)) / 2;
  const footCenters = centersRaw.map((value) => value - centerShift);

  if (saunaConfig.barrelLength < metrics.totalFootSpan) {
    warnings.push("Warnung: Fasslaenge ist kleiner als die Gesamtausdehnung der Fuesse (Aussenkante bis Aussenkante).");
  }

  const barrelLength = cm(saunaConfig.barrelLength);
  const barrelWidth = cm(saunaConfig.barrelWidth);
  const footWidth = cm(saunaConfig.footWidth);
  const footThickness = cm(saunaConfig.footThickness);
  const foundationWidth = cm(saunaConfig.foundationWidth);
  // Keine separate Fundamentdicke im Modell vorhanden; die Fussdicke wird fuer die Draufsicht verwendet.
  const foundationThickness = footThickness;

  const svg = createEl("svg", {
    xmlns: SVG_NS,
    role: "img",
    "aria-label": options.title || "Fundamentplan",
  });

  const gFoundation = createEl("g", { class: "layer-foundation" });
  const gFeet = createEl("g", { class: "layer-feet" });
  const gBarrel = createEl("g", { class: "layer-barrel" });
  const gGuides = createEl("g", { class: "layer-guides" });
  const gDims = createEl("g", { class: "layer-dimensions" });
  const gText = createEl("g", { class: "layer-text" });
  const gNote = createEl("g", { class: "layer-note" });

  const style = createEl("style");
  style.textContent = `
    .layer-foundation rect { fill: #4b5563; stroke: #111827; stroke-width: ${2}; }
    .layer-feet rect { fill: #8b5a2b; stroke: #111827; stroke-width: ${2}; }
    .layer-barrel rect { fill: #f9fafb; stroke: #111827; stroke-width: ${2}; }
    .layer-guides line { stroke: #9ca3af; stroke-width: ${1.5}; stroke-dasharray: 8 6; }
    .layer-dimensions line { stroke: #111827; stroke-width: ${1.8}; }
    .layer-text text, .layer-note text {
      fill: #111827;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: ${14};
    }
  `;
  svg.appendChild(style);

  const barrelX = -barrelLength / 2;
  const barrelY = -barrelWidth / 2;
  const bodyHalfWidth = Math.max(barrelWidth, footWidth, foundationWidth) / 2;

  gBarrel.appendChild(
    createEl("rect", {
      x: barrelX,
      y: barrelY,
      width: barrelLength,
      height: barrelWidth,
    })
  );

  let minX = barrelX;
  let maxX = barrelX + barrelLength;
  let minY = -bodyHalfWidth;
  let maxY = bodyHalfWidth;

  for (const center of footCenters) {
    const centerX = cm(center);
    const footRect = createRectFromCenter(centerX, 0, footThickness, footWidth);
    gFeet.appendChild(footRect);

    const foundationRect = createRectFromCenter(centerX, 0, foundationThickness, foundationWidth);
    gFoundation.appendChild(foundationRect);

    minX = Math.min(minX, centerX - footThickness / 2);
    maxX = Math.max(maxX, centerX + footThickness / 2);
  }

  const dimStartY = bodyHalfWidth + cm(25);
  const segmentDimY = dimStartY;
  const totalDimY = dimStartY + cm(14);

  if (footCenters.length > 1) {
    for (let i = 0; i < footCenters.length - 1; i += 1) {
      const x1 = cm(footCenters[i] + saunaConfig.footThickness / 2);
      const x2 = cm(footCenters[i + 1] - saunaConfig.footThickness / 2);
      drawHorizontalDimension({
        guidesGroup: gGuides,
        dimGroup: gDims,
        textGroup: gText,
        x1,
        x2,
        y: segmentDimY,
        guideYStart: bodyHalfWidth,
        label: `${formatCm(saunaConfig.footDistances[i])} cm`,
      });
    }

    drawHorizontalDimension({
      guidesGroup: gGuides,
      dimGroup: gDims,
      textGroup: gText,
      x1: cm(footCenters[0] - saunaConfig.footThickness / 2),
      x2: cm(footCenters[footCenters.length - 1] + saunaConfig.footThickness / 2),
      y: totalDimY,
      guideYStart: bodyHalfWidth,
      label: `${formatCm(metrics.totalFootSpan)} cm`,
    });
  }

  const rightBodyX = Math.max(maxX, barrelX + barrelLength / 2);
  const crossX1 = rightBodyX + cm(20);
  const crossX2 = rightBodyX + cm(34);
  const crossX3 = rightBodyX + cm(48);

  drawVerticalDimension({
    guidesGroup: gGuides,
    dimGroup: gDims,
    textGroup: gText,
    x: crossX1,
    y1: -barrelWidth / 2,
    y2: barrelWidth / 2,
    guideXStart: rightBodyX,
    label: `${formatCm(saunaConfig.barrelWidth)} cm`,
  });
  drawVerticalDimension({
    guidesGroup: gGuides,
    dimGroup: gDims,
    textGroup: gText,
    x: crossX2,
    y1: -foundationWidth / 2,
    y2: foundationWidth / 2,
    guideXStart: rightBodyX,
    label: `${formatCm(saunaConfig.foundationWidth)} cm`,
  });
  drawVerticalDimension({
    guidesGroup: gGuides,
    dimGroup: gDims,
    textGroup: gText,
    x: crossX3,
    y1: -footWidth / 2,
    y2: footWidth / 2,
    guideXStart: rightBodyX,
    label: `${formatCm(saunaConfig.footWidth)} cm`,
  });

  minX = Math.min(minX, -barrelLength / 2, cm((footCenters[0] ?? 0) - saunaConfig.footThickness / 2));
  maxX = Math.max(maxX, crossX3 + cm(18));
  minY = Math.min(minY, -bodyHalfWidth - cm(20));
  maxY = Math.max(maxY, totalDimY + cm(20));

  const noteLines = [
    "Alle Masse in cm",
    "Zeichnung nicht bemasst abnehmen",
    "Fundamentempfehlung - Ausfuehrung bauseits",
    `Frosttiefe: ${formatCm(saunaConfig.foundationDepth)} cm`,
  ];
  const noteX = minX + cm(4);
  const noteTop = minY + cm(8);
  noteLines.forEach((line, index) => {
    gNote.appendChild(
      createEl("text", {
        x: noteX,
        y: noteTop + index * cm(6),
      }, line)
    );
  });

  maxY = Math.max(maxY, noteTop + cm(noteLines.length * 6 + 2));

  svg.setAttribute("viewBox", `${Math.floor(minX)} ${Math.floor(minY)} ${Math.ceil(maxX - minX)} ${Math.ceil(maxY - minY)}`);

  svg.appendChild(gFoundation);
  svg.appendChild(gFeet);
  svg.appendChild(gBarrel);
  svg.appendChild(gGuides);
  svg.appendChild(gDims);
  svg.appendChild(gText);
  svg.appendChild(gNote);

  return { svgElement: svg, metrics, warnings };
}

function drawHorizontalDimension({ guidesGroup, dimGroup, textGroup, x1, x2, y, guideYStart, label }) {
  guidesGroup.appendChild(createEl("line", { x1, y1: guideYStart, x2: x1, y2: y }));
  guidesGroup.appendChild(createEl("line", { x1: x2, y1: guideYStart, x2, y2: y }));

  dimGroup.appendChild(createEl("line", { x1, y1: y, x2, y2: y }));
  drawEndTick(dimGroup, x1, y, "vertical");
  drawEndTick(dimGroup, x2, y, "vertical");

  textGroup.appendChild(
    createEl("text", {
      x: (x1 + x2) / 2,
      y: y - cm(2.5),
      "text-anchor": "middle",
    }, label)
  );
}

function drawVerticalDimension({ guidesGroup, dimGroup, textGroup, x, y1, y2, guideXStart, label }) {
  guidesGroup.appendChild(createEl("line", { x1: guideXStart, y1, x2: x, y2: y1 }));
  guidesGroup.appendChild(createEl("line", { x1: guideXStart, y1: y2, x2: x, y2 }));

  dimGroup.appendChild(createEl("line", { x1: x, y1, x2: x, y2 }));
  drawEndTick(dimGroup, x, y1, "horizontal");
  drawEndTick(dimGroup, x, y2, "horizontal");

  textGroup.appendChild(
    createEl("text", {
      x: x + cm(2),
      y: (y1 + y2) / 2,
      transform: `rotate(90 ${x + cm(2)} ${(y1 + y2) / 2})`,
      "text-anchor": "middle",
    }, label)
  );
}

function drawEndTick(group, x, y, orientation) {
  const tick = cm(1.4);
  if (orientation === "vertical") {
    group.appendChild(createEl("line", { x1: x, y1: y - tick, x2: x, y2: y + tick }));
    return;
  }
  group.appendChild(createEl("line", { x1: x - tick, y1: y, x2: x + tick, y2: y }));
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

function cm(value) {
  return (Number(value) || 0) * SCALE;
}

function formatCm(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}
