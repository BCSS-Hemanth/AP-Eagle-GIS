import L from 'leaflet';

/**
 * OPS / admin point symbols as DivIcons (inline SVG only — no outer disc).
 * Name on hover. Selected PS uses a red drop-shadow.
 */

const SIZE = 22;
const SIZE_SEL = 26;

function makeIcon(svg: string, className: string, size: number): L.DivIcon {
  return L.divIcon({
    className: `ap-ops-point ${className}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 1],
    popupAnchor: [0, -(size - 4)],
    tooltipAnchor: [0, -(size - 6)],
    html: svg,
  });
}

/** Check-post booth + barrier (teal / magenta / amber). */
const CHECKPOST_SVG = `<svg class="ap-ops-point__svg" viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#7c3aed" d="M6 3h8l2 2H8z"/>
  <rect x="6.5" y="5" width="9" height="12" rx="1.2" fill="#0d9488"/>
  <rect x="8.2" y="7" width="5.6" height="4.2" rx="0.8" fill="#0f172a"/>
  <circle cx="11" cy="8.6" r="1.1" fill="#cbd5e1"/>
  <rect x="15.2" y="10.2" width="2.2" height="3" rx="0.4" fill="#f59e0b"/>
  <rect x="17.2" y="11" width="5.5" height="1.4" fill="#db2777"/>
  <path fill="#fff" d="M18.2 11h1.1v1.4H18.2zm2.2 0h1.1v1.4H20.4z"/>
  <rect x="5.5" y="16.5" width="11" height="2.2" rx="0.4" fill="#4c1d95"/>
</svg>`;

/** ENTRY label — teal ring is the icon itself. */
const ENTRY_SVG = `<svg class="ap-ops-point__svg" viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="12" cy="12" r="10" fill="#fff" stroke="#0f766e" stroke-width="2.2"/>
  <text x="12" y="15.2" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="6.2" font-weight="800" fill="#0f766e">ENTRY</text>
</svg>`;

/** EXIT label + arrow — red. */
const EXIT_SVG = `<svg class="ap-ops-point__svg" viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <text x="12" y="10" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="7" font-weight="800" fill="#dc2626">EXIT</text>
  <path fill="#dc2626" d="M4 14.5h11.5v-2.2L20 15.2l-4.5 2.9v-2.2H4z"/>
</svg>`;

/** Police badge with star. */
const PS_SVG = `<svg class="ap-ops-point__svg" viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#0b1c30" d="M12 2.2l3.2 1.4 3.4-.2-.2 4.2c-.3 4.8-2.8 8.4-6.4 10.4C8.4 16 5.9 12.4 5.6 7.6L5.4 3.4l3.4.2L12 2.2z"/>
  <path fill="#fff" d="M12 7.2l.95 2.05 2.2.2-1.7 1.45.55 2.15L12 11.9l-2 1.15.55-2.15-1.7-1.45 2.2-.2L12 7.2z"/>
  <path fill="none" stroke="#fff" stroke-width="1.2" d="M8.4 6.4c2.2-1.1 5-1.1 7.2 0"/>
</svg>`;

const PS_SVG_SEL = `<svg class="ap-ops-point__svg" viewBox="0 0 24 24" width="26" height="26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#0b1c30" d="M12 2.2l3.2 1.4 3.4-.2-.2 4.2c-.3 4.8-2.8 8.4-6.4 10.4C8.4 16 5.9 12.4 5.6 7.6L5.4 3.4l3.4.2L12 2.2z"/>
  <path fill="#fff" d="M12 7.2l.95 2.05 2.2.2-1.7 1.45.55 2.15L12 11.9l-2 1.15.55-2.15-1.7-1.45 2.2-.2L12 7.2z"/>
  <path fill="none" stroke="#fff" stroke-width="1.2" d="M8.4 6.4c2.2-1.1 5-1.1 7.2 0"/>
</svg>`;

let checkpostIcon: L.DivIcon | null = null;
let entryPointIcon: L.DivIcon | null = null;
let exitPointIcon: L.DivIcon | null = null;
let policeStationIcon: L.DivIcon | null = null;
let policeStationSelectedIcon: L.DivIcon | null = null;

export function opsCheckpostIcon(): L.DivIcon {
  if (!checkpostIcon) {
    checkpostIcon = makeIcon(CHECKPOST_SVG, 'ap-ops-checkpost-icon', SIZE);
  }
  return checkpostIcon;
}

export function opsEntryPointIcon(): L.DivIcon {
  if (!entryPointIcon) {
    entryPointIcon = makeIcon(ENTRY_SVG, 'ap-ops-entry-point-icon', SIZE);
  }
  return entryPointIcon;
}

export function opsExitPointIcon(): L.DivIcon {
  if (!exitPointIcon) {
    exitPointIcon = makeIcon(EXIT_SVG, 'ap-ops-exit-point-icon', SIZE);
  }
  return exitPointIcon;
}

export function opsPoliceStationIcon(selected = false): L.DivIcon {
  if (selected) {
    if (!policeStationSelectedIcon) {
      policeStationSelectedIcon = makeIcon(
        PS_SVG_SEL,
        'ap-ops-ps-icon ap-ops-ps-icon--selected',
        SIZE_SEL
      );
    }
    return policeStationSelectedIcon;
  }
  if (!policeStationIcon) {
    policeStationIcon = makeIcon(PS_SVG, 'ap-ops-ps-icon', SIZE);
  }
  return policeStationIcon;
}

/** Legacy URL exports (tests / docs); map markers use SVG DivIcons above. */
export const OPS_CHECKPOST_ICON_URL = '/geo/gis-source/ops/checkpost-marker.png';
export const OPS_ENTRY_POINT_ICON_URL = '/geo/gis-source/ops/entry-point-marker.png';
export const OPS_EXIT_POINT_ICON_URL = '/geo/gis-source/ops/exit-point-marker.png';
export const OPS_POLICE_STATION_ICON_URL = '/geo/gis-source/ops/police-station-marker.jpg';
