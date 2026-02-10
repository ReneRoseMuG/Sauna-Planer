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
