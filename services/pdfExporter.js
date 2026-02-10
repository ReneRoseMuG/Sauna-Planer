const MM_PER_PX_AT_96_DPI = 25.4 / 96;

/**
 * @param {SVGSVGElement} svgElement
 * @param {{ fileName?: string, pageMm?: { width:number, height:number } }=} meta
 * @returns {Promise<void>}
 */
export async function exportSvgToPdf(svgElement, meta = {}) {
  if (!(svgElement instanceof SVGSVGElement)) {
    throw new Error("Kein gueltiges SVG fuer den PDF-Export vorhanden.");
  }

  const jsPdfNamespace = window.jspdf;
  if (!jsPdfNamespace || !jsPdfNamespace.jsPDF) {
    throw new Error("jsPDF ist nicht geladen.");
  }

  const { jsPDF } = jsPdfNamespace;

  const pageMm = meta.pageMm && meta.pageMm.width > 0 && meta.pageMm.height > 0
    ? meta.pageMm
    : inferPageMm(svgElement);

  const orientation = pageMm.width > pageMm.height ? "landscape" : "portrait";

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: [pageMm.width, pageMm.height],
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 6;

  const cloned = /** @type {SVGSVGElement} */ (svgElement.cloneNode(true));
  flattenDimensionMarkersForPdf(cloned);
  const viewBox = cloned.viewBox?.baseVal;
  const vbWidth = viewBox && viewBox.width > 0 ? viewBox.width : parseFloat(cloned.getAttribute("width")) || 1000;
  const vbHeight = viewBox && viewBox.height > 0 ? viewBox.height : parseFloat(cloned.getAttribute("height")) || 1000;

  const sourceWidthMm = vbWidth * MM_PER_PX_AT_96_DPI;
  const sourceHeightMm = vbHeight * MM_PER_PX_AT_96_DPI;
  const drawWidth = pageWidth - margin * 2;
  const drawHeight = pageHeight - margin * 2;
  const scale = Math.min(drawWidth / sourceWidthMm, drawHeight / sourceHeightMm);
  const targetWidth = sourceWidthMm * scale;
  const targetHeight = sourceHeightMm * scale;
  const offsetX = (pageWidth - targetWidth) / 2;
  const offsetY = (pageHeight - targetHeight) / 2;

  if (typeof doc.svg === "function") {
    await doc.svg(cloned, {
      x: offsetX,
      y: offsetY,
      width: targetWidth,
      height: targetHeight,
    });
  } else if (typeof window.svg2pdf === "function") {
    doc.saveGraphicsState();
    doc.setCurrentTransformationMatrix(
      doc.Matrix(scale, 0, 0, scale, offsetX / MM_PER_PX_AT_96_DPI, offsetY / MM_PER_PX_AT_96_DPI)
    );
    window.svg2pdf(cloned, doc, { xOffset: 0, yOffset: 0, scale: 1 });
    doc.restoreGraphicsState();
  } else {
    throw new Error("Weder jsPDF.svg noch svg2pdf ist verfuegbar.");
  }

  const safeName = sanitizeFileName(meta.fileName || "fundamentplan.pdf");
  doc.save(safeName);
}

/**
 * svg2pdf/jsPDF verlieren teils Marker (marker-start/marker-end).
 * Daher werden Pfeile fuer Masslinien als echte Polygon-Geometrie erzeugt.
 * @param {SVGSVGElement} svg
 */
function flattenDimensionMarkersForPdf(svg) {
  const dimLines = svg.querySelectorAll(".layer-dimensions line");
  for (const line of dimLines) {
    const x1 = Number(line.getAttribute("x1"));
    const y1 = Number(line.getAttribute("y1"));
    const x2 = Number(line.getAttribute("x2"));
    const y2 = Number(line.getAttribute("y2"));
    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      continue;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1e-6) {
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;
    const strokeWidth = Number(line.getAttribute("stroke-width")) || 2;
    const arrowLen = Math.max(6, strokeWidth * 5);
    const arrowHalfWidth = Math.max(3, strokeWidth * 2);
    const arrowColor = line.getAttribute("stroke") || "#0f172a";

    const startArrow = buildArrowPolygon(x1, y1, -ux, -uy, arrowLen, arrowHalfWidth, arrowColor);
    const endArrow = buildArrowPolygon(x2, y2, ux, uy, arrowLen, arrowHalfWidth, arrowColor);

    line.parentNode?.appendChild(startArrow);
    line.parentNode?.appendChild(endArrow);

    const existingStyle = line.getAttribute("style") || "";
    line.setAttribute("style", `${existingStyle};marker-start:none;marker-end:none;`.trim());
    line.removeAttribute("marker-start");
    line.removeAttribute("marker-end");
  }
}

function buildArrowPolygon(tipX, tipY, dirX, dirY, arrowLen, arrowHalfWidth, color) {
  const baseCenterX = tipX - dirX * arrowLen;
  const baseCenterY = tipY - dirY * arrowLen;
  const nx = -dirY;
  const ny = dirX;
  const p1x = baseCenterX + nx * arrowHalfWidth;
  const p1y = baseCenterY + ny * arrowHalfWidth;
  const p2x = baseCenterX - nx * arrowHalfWidth;
  const p2y = baseCenterY - ny * arrowHalfWidth;

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`);
  polygon.setAttribute("fill", color);
  polygon.setAttribute("stroke", "none");
  return polygon;
}

function inferPageMm(svgElement) {
  const vb = svgElement.viewBox?.baseVal;
  const wPx = vb && vb.width > 0 ? vb.width : parseFloat(svgElement.getAttribute("width")) || 1000;
  const hPx = vb && vb.height > 0 ? vb.height : parseFloat(svgElement.getAttribute("height")) || 1400;
  return {
    width: wPx * MM_PER_PX_AT_96_DPI,
    height: hPx * MM_PER_PX_AT_96_DPI,
  };
}

function sanitizeFileName(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}
