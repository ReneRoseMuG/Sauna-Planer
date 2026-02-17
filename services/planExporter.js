import { exportSvgToPdf } from "./pdfExporter.js";

/**
 * @param {{ format:"pdf"|"svg", svgElement:SVGSVGElement, fileNameBase:string }} input
 * @returns {Promise<void>}
 */
export async function exportPlan({ format, svgElement, fileNameBase }) {
  if (!(svgElement instanceof SVGSVGElement)) {
    throw new Error("Es liegt kein gueltiges SVG fuer den Export vor.");
  }

  const normalizedBase = sanitizeBaseName(fileNameBase || "fundamentplan");

  if (format === "svg") {
    exportAsSvg(svgElement, `${normalizedBase}.svg`);
    return;
  }

  await exportSvgToPdf(svgElement, {
    fileName: `${normalizedBase}.pdf`,
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
