/** Atlas download map chrome — drawn onto the export canvas only. */

export type AtlasExportDecorationFlags = {
  northArrow: boolean;
  legend: boolean;
};

export type AtlasExportLegendItem = {
  name: string;
  color: string;
  kind: 'line' | 'point' | 'poly';
};

export type AtlasExportMapView = {
  lat: number;
  lon: number;
  zoom: number;
};

export const DEFAULT_ATLAS_EXPORT_DECORATIONS: AtlasExportDecorationFlags = {
  northArrow: true,
  legend: true,
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Larger compass so N is readable on high-res exports. */
function drawNorthArrow(ctx: CanvasRenderingContext2D, canvasW: number, pad: number) {
  const boxW = 72;
  const boxH = 110;
  const cx = canvasW - pad - boxW / 2;
  const cy = pad + boxH / 2 + 4;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(15,41,66,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f2942';
  ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - 28);

  // Arrow (north up) — ~1.7× previous size
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx + 16, cy + 30);
  ctx.lineTo(cx, cy + 16);
  ctx.lineTo(cx - 16, cy + 30);
  ctx.closePath();
  ctx.fillStyle = '#111827';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx + 16, cy + 30);
  ctx.lineTo(cx, cy + 16);
  ctx.closePath();
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  items: AtlasExportLegendItem[],
  pad: number
) {
  if (!items.length) return;
  const rowH = 28;
  const titleH = 32;
  const boxPad = 14;
  const maxRows = Math.min(items.length, 16);
  const rows = items.slice(0, maxRows);
  const boxW = 280;
  const boxH = titleH + rows.length * rowH + boxPad * 2;
  const x = canvasW - pad - boxW;
  const y = canvasH - pad - boxH;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.strokeStyle = 'rgba(15,41,66,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f2942';
  ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Legend', x + boxPad, y + boxPad + 16);

  ctx.font = '13px "Segoe UI", Arial, sans-serif';
  rows.forEach((item, i) => {
    const iy = y + boxPad + titleH + i * rowH + 6;
    const swatchX = x + boxPad;
    const swatchY = iy;
    if (item.kind === 'point') {
      ctx.beginPath();
      ctx.fillStyle = item.color;
      ctx.arc(swatchX + 12, swatchY + 5, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'poly') {
      ctx.strokeStyle = item.color;
      ctx.fillStyle = `${item.color}33`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(swatchX + 1, swatchY - 2, 24, 14);
      ctx.fill();
      ctx.stroke();
    } else {
      // Coloured road / line sample — thick enough to match map strokes
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(swatchX + 1, swatchY + 5);
      ctx.lineTo(swatchX + 28, swatchY + 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#1f2937';
    const label =
      item.name.length > 32 ? `${item.name.slice(0, 30)}…` : item.name;
    ctx.fillText(label, swatchX + 36, swatchY + 10);
  });
  ctx.restore();
}

/** Paint selected map chrome onto an already-captured Atlas map canvas. */
export function paintAtlasExportDecorations(
  canvas: HTMLCanvasElement,
  options: {
    decorations: AtlasExportDecorationFlags;
    legendItems: AtlasExportLegendItem[];
    /** Retained for call-site compatibility; scale chrome was removed. */
    mapView?: AtlasExportMapView | null;
  }
): void {
  const { decorations, legendItems } = options;
  const any = decorations.northArrow || decorations.legend;
  if (!any) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pad = Math.max(16, Math.round(Math.min(canvas.width, canvas.height) * 0.018));

  if (decorations.northArrow) {
    drawNorthArrow(ctx, canvas.width, pad);
  }
  if (decorations.legend) {
    drawLegend(ctx, canvas.width, canvas.height, legendItems, pad);
  }
}
