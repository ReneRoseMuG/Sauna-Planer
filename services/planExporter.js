import { exportSvgToPdf } from "./pdfExporter.js";

/**
 * @param {{ format:"pdf"|"svg", composedDocument:{svgElement:SVGSVGElement,pageMm?:{width:number,height:number}}, fileNameBase:string }} input
 * @returns {Promise<void>}
 */
export async function exportPlan({ format, composedDocument, fileNameBase }) {
  if (!composedDocument || !(composedDocument.svgElement instanceof SVGSVGElement)) {
    throw new Error("Es liegt kein gueltiges Layout-Dokument fuer den Export vor.");
  }

  const normalizedBase = sanitizeBaseName(fileNameBase || "fundamentplan");

  if (format === "svg") {
    exportAsSvg(composedDocument.svgElement, `${normalizedBase}.svg`);
    return;
  }

  await exportSvgToPdf(composedDocument.svgElement, {
    fileName: `${normalizedBase}.pdf`,
    pageMm: composedDocument.pageMm,
  });
}

function exportAsSvg(svgElement, fileName) {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgElement);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeBaseName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "fundamentplan";
}
