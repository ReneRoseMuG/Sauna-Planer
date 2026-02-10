const MM_TO_PX = 96 / 25.4;
const SVG_NS = "http://www.w3.org/2000/svg";
const TARGET_FILL_RATIO = 0.98;
const MIN_DOMINANT_COVERAGE = 2 / 3;

/**
 * @param {{
 *  template:any,
 *  planSvg:SVGSVGElement,
 *  planGeometryBounds?: { xMin?:number, yMin?:number, minX?:number,minY?:number,maxX?:number,maxY?:number,width:number,height:number },
 *  planAnnotationBounds?: { xMin?:number, yMin?:number, minX?:number,minY?:number,maxX?:number,maxY?:number,width:number,height:number },
 *  meta?:{title?:string,modelName?:string},
 *  notes?:string[]
 * }} input
 * @returns {{
 *  svgElement: SVGSVGElement,
 *  templateId: string,
 *  pageMm:{width:number,height:number},
 *  slots: Record<string,{x:number,y:number,width:number,height:number}>,
 *  fit: {
 *    sourceBounds: { xMin:number,yMin:number,minX:number,minY:number,maxX:number,maxY:number,width:number,height:number },
 *    annotationBounds: { xMin:number,yMin:number,minX:number,minY:number,maxX:number,maxY:number,width:number,height:number } | null,
 *    targetSlot: { x:number,y:number,width:number,height:number },
 *    scale:number,
 *    warning:string,
 *    coverage:{ widthRatio:number,heightRatio:number,dominantRatio:number,dominantCoverage:number }
 *  }
 * }}
 */
export function composePlanDocument({ template, planSvg, planGeometryBounds, planAnnotationBounds, meta = {}, notes = [] }) {
  if (!(planSvg instanceof SVGSVGElement)) {
    throw new Error("Planinhalt fehlt fuer das Layout.");
  }

  const pageWidthPx = mmToPx(template.page.widthMm);
  const pageHeightPx = mmToPx(template.page.heightMm);
  const margins = template.margins;
  const regions = template.regions;

  const left = mmToPx(margins.leftMm);
  const top = mmToPx(margins.topMm);
  const right = pageWidthPx - mmToPx(margins.rightMm);
  const bottom = pageHeightPx - mmToPx(margins.bottomMm);
  const innerWidth = right - left;

  const headerHeight = mmToPx(regions.headerMm);
  const legendHeight = mmToPx(regions.legendMm);

  const contentTop = top + headerHeight;
  const contentHeight = Math.max(1, pageHeightPx - (top + mmToPx(margins.bottomMm) + headerHeight + legendHeight));
  const legendTop = contentTop + contentHeight;

  const svg = create("svg", {
    xmlns: SVG_NS,
    width: pageWidthPx,
    height: pageHeightPx,
    viewBox: `0 0 ${pageWidthPx} ${pageHeightPx}`,
    role: "img",
    "aria-label": meta.title || "Planlayout",
  });

  svg.appendChild(createStyle());
  cloneDefs(planSvg, svg);
  cloneInlineStyles(planSvg, svg);

  const slots = {
    header: { x: left, y: top, width: innerWidth, height: headerHeight },
    content: { x: left, y: contentTop, width: innerWidth, height: contentHeight },
    legend: { x: left, y: legendTop, width: innerWidth, height: legendHeight },
  };

  drawSeparatorLine(svg, slots.content.x, slots.content.x + slots.content.width, slots.content.y, "slot-divider");
  drawSeparatorLine(svg, slots.legend.x, slots.legend.x + slots.legend.width, slots.legend.y, "slot-divider");

  svg.appendChild(create("text", { x: slots.header.x + 12, y: slots.header.y + 26, class: "title" }, meta.title || "Fundamentplan"));
  svg.appendChild(
    create(
      "text",
      { x: slots.header.x + 12, y: slots.header.y + 46, class: "subtitle" },
      `Modell: ${meta.modelName || "Unbenannt"} | Schablone: ${template.label}`
    )
  );

  const legendLines = notes.length > 0
    ? notes
    : [
        "Alle Masse in cm (ca.-Angaben).",
        "Export basiert auf dem aktuell berechneten Planstand.",
        "Fundamentempfehlung - Ausfuehrung bauseits.",
      ];
  legendLines.slice(0, 4).forEach((line, index) => {
    svg.appendChild(
      create(
        "text",
        {
          x: slots.legend.x + 12,
          y: slots.legend.y + 22 + index * 16,
          class: "legend-text",
        },
        line
      )
    );
  });

  const fit = buildFitTransform(planSvg, slots.content, planGeometryBounds, planAnnotationBounds, template.page.orientation);

  const geometrySource = resolveGroup(planSvg, ".geometry-group", "geometry");
  const annotationSource = resolveGroup(planSvg, ".annotation-group", "annotation");

  if (geometrySource) {
    const geometryGroup = create("g", { transform: fit.transform });
    geometryGroup.appendChild(/** @type {Node} */ (geometrySource.cloneNode(true)));
    svg.appendChild(geometryGroup);
  } else {
    const fallbackGroup = create("g", { transform: fit.transform });
    fallbackGroup.appendChild(/** @type {Node} */ (planSvg.cloneNode(true)));
    svg.appendChild(fallbackGroup);
    fit.warning = prependWarning(fit.warning, "Geometriegruppe fehlt. Fallback auf gesamtes Plan-SVG verwendet.");
  }

  if (annotationSource) {
    const projectedAnnotation = projectAnnotationGroup(annotationSource, fit);
    svg.appendChild(projectedAnnotation);
  } else {
    fit.warning = prependWarning(fit.warning, "Annotationsgruppe fehlt. Keine separate Annotation-Overlay-Projektion moeglich.");
  }

  return {
    svgElement: svg,
    templateId: template.id,
    pageMm: { width: template.page.widthMm, height: template.page.heightMm },
    slots,
    fit: {
      sourceBounds: fit.sourceBounds,
      annotationBounds: fit.annotationBounds,
      targetSlot: fit.targetSlot,
      scale: fit.scale,
      warning: fit.warning,
      coverage: fit.coverage,
    },
  };
}

function buildFitTransform(planSvg, slot, planGeometryBounds, planAnnotationBounds, pageOrientation) {
  const fallbackBounds = getBoundsFromViewBox(planSvg);
  const geometryBounds = normalizeBounds(planGeometryBounds);
  let sourceBounds = geometryBounds;
  let warning = "";

  if (!sourceBounds) {
    sourceBounds = fallbackBounds;
    warning = "Geometrie-Bounds ungueltig. Fallback auf gesamte ViewBox verwendet.";
  }

  const annotationBounds = normalizeBounds(planAnnotationBounds);
  if (annotationBounds) {
    sourceBounds = unionBounds(sourceBounds, annotationBounds);
  }
  // Keine automatische 90°-Drehung im Hochformat:
  // Breite bleibt auf X-Achse, Laenge auf Y-Achse.
  const orientedWidth = sourceBounds.width;
  const orientedHeight = sourceBounds.height;

  const widthScale = slot.width / orientedWidth;
  const heightScale = slot.height / orientedHeight;
  let scale = TARGET_FILL_RATIO * Math.min(widthScale, heightScale);

  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
    warning = prependWarning(warning, "Skalierung ungueltig. Fallback-Skalierung 1 verwendet.");
  }

  const drawW = orientedWidth * scale;
  const drawH = orientedHeight * scale;
  const offsetX = slot.x + (slot.width - drawW) / 2;
  const offsetY = slot.y + (slot.height - drawH) / 2;

  const coverage = {
    widthRatio: drawW / slot.width,
    heightRatio: drawH / slot.height,
    dominantRatio: Math.max(drawW / slot.width, drawH / slot.height),
    dominantCoverage: Math.max(drawW / slot.width, drawH / slot.height),
  };

  if (coverage.dominantCoverage < MIN_DOMINANT_COVERAGE) {
    warning = prependWarning(warning, "Info: Dominante Containerabdeckung < 66,7%.");
  }

  const minX = sourceBounds.xMin;
  const minY = sourceBounds.yMin;
  const transform = `translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-minX} ${-minY})`;

  const projectX = (valueX) => offsetX + (valueX - sourceBounds.xMin) * scale;
  const projectY = (_valueX, valueY) => offsetY + (valueY - sourceBounds.yMin) * scale;

  return {
    transform,
    sourceBounds,
    annotationBounds,
    targetSlot: { ...slot },
    scale,
    rotationDeg: 0,
    warning,
    coverage,
    projectX,
    projectY,
  };
}

function unionBounds(a, b) {
  return createBounds(
    Math.min(a.minX, b.minX),
    Math.min(a.minY, b.minY),
    Math.max(a.maxX, b.maxX),
    Math.max(a.maxY, b.maxY)
  );
}

function resolveGroup(planSvg, selector, groupName) {
  const byClass = planSvg.querySelector(selector);
  if (byClass instanceof SVGGElement) {
    return byClass;
  }

  const byData = planSvg.querySelector(`g[data-group="${groupName}"]`);
  if (byData instanceof SVGGElement) {
    return byData;
  }

  return null;
}

function projectAnnotationGroup(sourceGroup, fit) {
  const projectedGroup = /** @type {SVGGElement} */ (sourceGroup.cloneNode(true));
  projectedGroup.querySelectorAll(".layer-note").forEach((node) => node.remove());

  const allElements = [projectedGroup, ...projectedGroup.querySelectorAll("*")];

  for (const element of allElements) {
    const tag = element.tagName.toLowerCase();
    if (tag === "line") {
      projectLineElement(element, fit);
    } else if (tag === "text") {
      projectTextElement(element, fit);
    } else {
      projectPointAttributesIfPresent(element, fit);
    }

    projectLengthAttribute(element, "width", fit.scale);
    projectLengthAttribute(element, "height", fit.scale);
    projectLengthAttribute(element, "rx", fit.scale);
    projectLengthAttribute(element, "ry", fit.scale);
    projectLengthAttribute(element, "r", fit.scale);

    const transform = element.getAttribute("transform");
    if (transform) {
      element.setAttribute("transform", projectTransformRotate(transform, fit));
    }
  }

  projectedGroup.removeAttribute("transform");
  return projectedGroup;
}

function projectLengthAttribute(element, attrName, scale) {
  if (!element.hasAttribute(attrName)) {
    return;
  }
  const raw = element.getAttribute(attrName);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return;
  }
  element.setAttribute(attrName, String(value * scale));
}

function projectPointAttributesIfPresent(element, fit) {
  const x = tryReadNumberAttr(element, "x");
  const y = tryReadNumberAttr(element, "y");
  if (x !== null && y !== null) {
    const point = projectPoint(x, y, fit);
    element.setAttribute("x", String(point.x));
    element.setAttribute("y", String(point.y));
  }

  const cx = tryReadNumberAttr(element, "cx");
  const cy = tryReadNumberAttr(element, "cy");
  if (cx !== null && cy !== null) {
    const point = projectPoint(cx, cy, fit);
    element.setAttribute("cx", String(point.x));
    element.setAttribute("cy", String(point.y));
  }
}

function projectLineElement(element, fit) {
  const x1 = tryReadNumberAttr(element, "x1");
  const y1 = tryReadNumberAttr(element, "y1");
  const x2 = tryReadNumberAttr(element, "x2");
  const y2 = tryReadNumberAttr(element, "y2");
  if (x1 === null || y1 === null || x2 === null || y2 === null) {
    return;
  }

  const p1 = projectPoint(x1, y1, fit);
  const p2 = projectPoint(x2, y2, fit);
  element.setAttribute("x1", String(p1.x));
  element.setAttribute("y1", String(p1.y));
  element.setAttribute("x2", String(p2.x));
  element.setAttribute("y2", String(p2.y));
}

function projectTextElement(element, fit) {
  const x = tryReadNumberAttr(element, "x");
  const y = tryReadNumberAttr(element, "y");
  if (x !== null && y !== null) {
    const p = projectPoint(x, y, fit);
    element.setAttribute("x", String(p.x));
    element.setAttribute("y", String(p.y));
  }
}

function projectPoint(x, y, fit) {
  return {
    x: fit.projectX(x, y),
    y: fit.projectY(x, y),
  };
}

function projectTransformRotate(transform, fit) {
  const rotatePattern = /rotate\(\s*([-+]?\d*\.?\d+)(?:[ ,]+([-+]?\d*\.?\d+)[ ,]+([-+]?\d*\.?\d+))?\s*\)/g;
  return transform.replace(rotatePattern, (_match, angle, rawX, rawY) => {
    const numericAngle = Number(angle);
    const angleOut = Number.isFinite(numericAngle) ? numericAngle + (fit.rotationDeg || 0) : angle;

    if (rawX === undefined || rawY === undefined) {
      return `rotate(${angleOut})`;
    }

    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return `rotate(${angleOut})`;
    }
    const pivot = projectPoint(x, y, fit);
    return `rotate(${angleOut} ${pivot.x} ${pivot.y})`;
  });
}

function tryReadNumberAttr(element, attrName) {
  if (!element.hasAttribute(attrName)) {
    return null;
  }
  const parsed = Number(element.getAttribute(attrName));
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneInlineStyles(sourceSvg, targetSvg) {
  const styles = sourceSvg.querySelectorAll("style");
  for (const style of styles) {
    targetSvg.appendChild(style.cloneNode(true));
  }
}

function cloneDefs(sourceSvg, targetSvg) {
  const defsList = sourceSvg.querySelectorAll("defs");
  for (const defs of defsList) {
    targetSvg.appendChild(defs.cloneNode(true));
  }
}

function prependWarning(existing, message) {
  return existing ? `${existing} ${message}` : message;
}

function getBoundsFromViewBox(planSvg) {
  const vb = planSvg.viewBox && planSvg.viewBox.baseVal;
  const minX = vb && vb.width > 0 ? vb.x : 0;
  const minY = vb && vb.height > 0 ? vb.y : 0;
  const width = vb && vb.width > 0 ? vb.width : 1000;
  const height = vb && vb.height > 0 ? vb.height : 1000;
  return createBounds(minX, minY, minX + width, minY + height);
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }

  const minX = Number(bounds.xMin ?? bounds.minX);
  const minY = Number(bounds.yMin ?? bounds.minY);
  const width = Number(bounds.width);
  const height = Number(bounds.height);

  if (![minX, minY, width, height].every(Number.isFinite)) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }

  const maxX = Number.isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : minX + width;
  const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : minY + height;

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  return createBounds(minX, minY, maxX, maxY);
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

function drawSeparatorLine(svg, x1, x2, y, className) {
  svg.appendChild(create("line", {
    x1,
    y1: y,
    x2,
    y2: y,
    class: className,
  }));
}

function createStyle() {
  const style = create("style");
  style.textContent = `
    .slot-divider {
      stroke: #d1d5db;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .title {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: 18px;
      font-weight: 600;
      fill: #111827;
    }
    .subtitle, .legend-text {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      font-size: 12px;
      fill: #374151;
    }
  `;
  return style;
}

function create(name, attrs = {}, text = "") {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  if (text) {
    el.textContent = text;
  }
  return el;
}

function mmToPx(mm) {
  return mm * MM_TO_PX;
}
