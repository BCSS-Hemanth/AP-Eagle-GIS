/**
 * html2canvas 1.4.x cannot parse modern CSS color functions (oklab / oklch /
 * color-mix) used by Tailwind v4 and current browsers. Sanitize the cloned
 * document and rewrite those values to rgb() before capture.
 */

const UNSUPPORTED_COLOR_FN =
  /oklab\([^)]*\)|oklch\([^)]*\)|color-mix\([^)]*\)|lab\([^)]*\)|lch\([^)]*\)/gi;

const COLOR_STYLE_PROPS = [
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
  'text-decoration-color',
  'column-rule-color',
  'caret-color',
] as const;

let colorProbeCtx: CanvasRenderingContext2D | null = null;

/** Browser parses oklab/oklch; canvas fillStyle normalizes to rgb/rgba. */
export function cssColorToRgb(color: string): string {
  const trimmed = color.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'none') return trimmed;
  UNSUPPORTED_COLOR_FN.lastIndex = 0;
  if (!UNSUPPORTED_COLOR_FN.test(trimmed)) return trimmed;
  UNSUPPORTED_COLOR_FN.lastIndex = 0;
  try {
    if (!colorProbeCtx) {
      colorProbeCtx = document.createElement('canvas').getContext('2d');
    }
    if (!colorProbeCtx) return '#000000';
    colorProbeCtx.fillStyle = '#000000';
    colorProbeCtx.fillStyle = trimmed;
    return String(colorProbeCtx.fillStyle);
  } catch {
    return '#000000';
  }
}

export function stripUnsupportedColorFunctions(
  cssText: string,
  fallback = 'transparent'
): string {
  UNSUPPORTED_COLOR_FN.lastIndex = 0;
  return cssText.replace(UNSUPPORTED_COLOR_FN, fallback);
}

function rewriteElementColorStyles(source: Element, clone: Element): void {
  if (!(source instanceof Element) || !(clone instanceof HTMLElement || clone instanceof SVGElement)) {
    return;
  }
  const cs = window.getComputedStyle(source);
  // Always normalize through canvas so oklab/oklch never reach html2canvas.
  for (const prop of COLOR_STYLE_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (!val || val === 'none') continue;
    UNSUPPORTED_COLOR_FN.lastIndex = 0;
    if (
      UNSUPPORTED_COLOR_FN.test(val) ||
      prop === 'color' ||
      prop === 'background-color' ||
      prop === 'fill' ||
      prop === 'stroke'
    ) {
      UNSUPPORTED_COLOR_FN.lastIndex = 0;
      const safe = cssColorToRgb(val);
      if (safe) clone.style.setProperty(prop, safe);
    }
  }
  const shadow = cs.getPropertyValue('box-shadow');
  if (shadow && shadow !== 'none') {
    UNSUPPORTED_COLOR_FN.lastIndex = 0;
    if (UNSUPPORTED_COLOR_FN.test(shadow)) {
      clone.style.setProperty('box-shadow', 'none');
    }
  }
  // SVG presentation attributes
  if (clone instanceof SVGElement) {
    for (const attr of ['fill', 'stroke', 'stop-color'] as const) {
      const raw = clone.getAttribute(attr);
      if (!raw || raw === 'none') continue;
      UNSUPPORTED_COLOR_FN.lastIndex = 0;
      if (UNSUPPORTED_COLOR_FN.test(raw) || raw.includes('var(')) {
        UNSUPPORTED_COLOR_FN.lastIndex = 0;
        const csVal = cs.getPropertyValue(attr === 'stop-color' ? 'stop-color' : attr);
        clone.setAttribute(attr, cssColorToRgb(csVal || raw));
      }
    }
  }
}

function walkPaired(source: Element, clone: Element): void {
  rewriteElementColorStyles(source, clone);
  const sKids = source.children;
  const cKids = clone.children;
  const n = Math.min(sKids.length, cKids.length);
  for (let i = 0; i < n; i += 1) {
    walkPaired(sKids[i], cKids[i]);
  }
}

/**
 * Call from html2canvas `onclone` with the live source root and the cloned root.
 */
export function prepareHtml2CanvasClone(
  clonedDoc: Document,
  sourceRoot: HTMLElement,
  clonedRoot: HTMLElement
): void {
  clonedDoc.querySelectorAll('style').forEach((node) => {
    if (node.textContent) {
      node.textContent = stripUnsupportedColorFunctions(node.textContent);
    }
  });
  // Drop external sheets that still contain oklab after Tailwind build.
  clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
    node.remove();
  });
  clonedDoc.querySelectorAll('[style]').forEach((node) => {
    const el = node as HTMLElement;
    const raw = el.getAttribute('style');
    if (raw && UNSUPPORTED_COLOR_FN.test(raw)) {
      UNSUPPORTED_COLOR_FN.lastIndex = 0;
      el.setAttribute('style', stripUnsupportedColorFunctions(raw, '#000000'));
    }
  });
  walkPaired(sourceRoot, clonedRoot);
}

export const HTML2CANVAS_SAFE_OPTIONS = {
  useCORS: true,
  allowTaint: true,
  logging: false,
} as const;
