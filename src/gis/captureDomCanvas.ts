/**
 * DOM → canvas for map exports.
 * Prefer modern-screenshot (supports oklab/oklch). Fall back to sanitized html2canvas.
 */
import {
  HTML2CANVAS_SAFE_OPTIONS,
  prepareHtml2CanvasClone,
} from './html2canvasSafe';

export async function captureDomToCanvas(
  el: HTMLElement,
  options?: { scale?: number; backgroundColor?: string | null }
): Promise<HTMLCanvasElement> {
  const scale = options?.scale ?? 2;
  const backgroundColor = options?.backgroundColor === undefined ? '#ffffff' : options.backgroundColor;

  try {
    const { domToCanvas } = await import('modern-screenshot');
    const canvas = await domToCanvas(el, {
      scale,
      backgroundColor: backgroundColor ?? undefined,
      // Let the library fetch tiles; return false to use its default fetch.
      fetchFn: async () => false,
      timeout: 45000,
    });
    if (canvas.width >= 32 && canvas.height >= 32) return canvas;
  } catch {
    // Fall through to sanitized html2canvas
  }

  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(el, {
    backgroundColor,
    scale,
    ...HTML2CANVAS_SAFE_OPTIONS,
    onclone: (clonedDoc, clonedEl) => {
      prepareHtml2CanvasClone(clonedDoc, el, clonedEl);
    },
  });
}
