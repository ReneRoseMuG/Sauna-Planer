/**
 * @typedef {Object} PlanTemplate
 * @property {string} id
 * @property {string} label
 * @property {{ widthMm:number, heightMm:number, orientation:"portrait"|"landscape" }} page
 * @property {{ topMm:number, rightMm:number, bottomMm:number, leftMm:number }} margins
 * @property {{ headerMm:number, legendMm:number, footerMm:number, gapMm:number }} regions
 */

/** @type {PlanTemplate[]} */
const templates = [
  {
    id: "A4_PORTRAIT_STANDARD",
    label: "A4 Hochformat Standard",
    page: { widthMm: 210, heightMm: 297, orientation: "portrait" },
    margins: { topMm: 2, rightMm: 2, bottomMm: 2, leftMm: 2 },
    regions: { headerMm: 22, legendMm: 30, footerMm: 0, gapMm: 4 },
  },
  {
    id: "A4_LANDSCAPE_STANDARD",
    label: "A4 Querformat Standard",
    page: { widthMm: 297, heightMm: 210, orientation: "landscape" },
    margins: { topMm: 2, rightMm: 2, bottomMm: 2, leftMm: 2 },
    regions: { headerMm: 20, legendMm: 24, footerMm: 0, gapMm: 4 },
  },
];

export function listTemplates() {
  return templates.map((template) => ({ ...template }));
}

export function getDefaultTemplate() {
  return { ...templates[0] };
}

export function getTemplateById(templateId) {
  const found = templates.find((template) => template.id === templateId);
  return found ? { ...found } : getDefaultTemplate();
}
