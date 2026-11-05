/**
 * Explicit safety gates before replacing primary Admin map layers with GIS-Source Admin.
 *
 * GIS-Source Dists/districts filtered to STATE=Andhra Pradesh is the **pre-2014 undivided**
 * AP+Telangana district set (25 polygons; includes Hyderabad, Warangal, Adilabad, …).
 * IND_adm1 has 35 units and **no Telangana**. Replacing the live 2022 26-district drill or
 * DataMeet India overview with those products would break geographical accuracy for current AP.
 */

export const ADMIN_GIS_SOURCE_SAFETY = {
  primaryDistrictDrill: {
    currentPath: '/geo/ap-districts-2022.geojson',
    gisSourcePath: '/geo/gis-source/admin/ap_districts_gis_source.geojson',
    replaceAllowed: false as const,
    reason:
      'GIS-Source AP districts are pre-2014 undivided (25 features incl. Telangana districts). App drill requires 2022 26-district AP.',
  },
  primaryStateBorder: {
    currentPath: '/geo/ap-state.geojson',
    gisSourcePath: '/geo/gis-source/admin/ap_state_gis_source.geojson',
    replaceAllowed: false as const,
    reason:
      'GIS-Source IND_adm1 Andhra Pradesh polygon is undivided (pre-Telangana). Keep post-2014 AP state outline for lyr-state-border.',
  },
  indiaOverview: {
    currentSource: 'DataMeet India states (Telangana split)',
    gisSourcePath: 'STATES/IND_adm1.shp',
    replaceAllowed: false as const,
    reason: 'IND_adm1 has no Telangana feature (35 units). DataMeet remains India overview.',
  },
  fullApRoads: {
    sourceCount: 153655,
    convertedMajorPath: '/geo/gis-source/admin/ap_roads_major.geojson',
    postgisLayer: 'full' as const,
    replaceAllowed: false as const,
    reason:
      'Full ap_roads must not ship as one untiled GeoJSON. Serve via PostGIS bbox/MVT (`/api/gis-roads/...&layer=full`). Major subset remains a static catalog product.',
  },
  /** Layers where GIS-Source is already (or becomes) the authoritative legend source. */
  authoritativeGisSourceLayers: [
    'lyr-taluk-gis',
    'lyr-vsp-village-pts',
    'lyr-border-ps',
    'lyr-soi-grid',
    'lyr-railways',
    'lyr-ap-roads-major',
    'lyr-districts-gis-hist',
    'lyr-state-gis-hist',
  ] as const,
} as const;

export function assertAdminReplaceAllowed(target: keyof typeof ADMIN_GIS_SOURCE_SAFETY): void {
  const row = ADMIN_GIS_SOURCE_SAFETY[target];
  if (row && 'replaceAllowed' in row && row.replaceAllowed === false) {
    throw new Error(`Admin GIS-Source replacement blocked for ${String(target)}: ${row.reason}`);
  }
}
