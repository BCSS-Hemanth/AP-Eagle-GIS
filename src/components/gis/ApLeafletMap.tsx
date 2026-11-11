import React, {
  createContext,
  Component,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L, { DivIcon, LatLngExpression } from 'leaflet';
import { BasemapId, DigitizedFeature, InspectableFeature, RasterBasemapId } from '../../types/gis';
import type { IngestedLayer } from '../../gis/ingest';
import { IngestedOverlays } from './IngestedOverlays';
import { MapLibreBasemap } from './MapLibreBasemap';
import { useApBoundaries } from '../../gis/useApBoundaries';
import { useApNetwork } from '../../gis/useApNetwork';
import { useApMandals, useVillagePolygons } from '../../gis/useApAdmin';
import { useGisSourceAdmin } from '../../gis/useGisSourceAdmin';
import { useGisSourceOps } from '../../gis/useGisSourceOps';
import { useGisPostgisRoadBbox } from '../../gis/useGisPostgisRoadBbox';
import type { GisPostgisRoadLayer } from '../../gis/gisPostgisRoads';
import {
  cleanOverviewLabelTier,
  isAndhraPradesh,
  shouldShowPermanentStateLabel,
  stateDisplayName,
  stateLabelLatLng,
  stateMapLabel,
  useIndiaStates,
} from '../../gis/useIndiaStates';
import { usePoliceStations } from '../../gis/usePoliceStations';
import type { PoliceStationProperties } from '../../gis/usePoliceStations';
import type { MandalProperties, VillageProperties } from '../../gis/useApAdmin';
import {
  type AdminDrill,
  asFeatureCollection,
  drillFocusFeature,
  featureBbox,
  filterByAdminName,
  filterCollectionToParent,
  filterFeaturesInParent,
  isApStateFocus,
  isIndiaOverview,
  isolateChildFeature,
  invertMaskLatLngs,
  pointInFeature,
} from '../../gis/adminHierarchy';
import {
  AP_BOUNDS,
  INDIA_BOUNDS,
  INDIA_CENTER,
  INDIA_DEFAULT_ZOOM,
  INDIA_OVERVIEW_UNDERLAY_TILES,
  BASEMAP_TILES,
  ESRI_PLACES_TILES,
  ESRI_TRANSPORT_TILES,
  OPENRAILWAY_TILES,
} from '../../data/apGeo';
import type { GeodesicBufferRing } from '../../gis/geodesicBuffer';
import { geodesicBufferCoordinates } from '../../gis/geodesicBuffer';
import {
  HEAVY_ROAD_MAX_FEATURES,
  mapAllowsHeavyRoadVectors,
  prepareClassifiedRoadFc,
  prepareHeavyRoadFc,
  preparePostgisFullNetworkFc,
} from '../../gis/mapRoadRenderSafety';
import { routeStrokeForProperties } from '../../gis/roadsRoutingNewLayers';
import type { ApDistrictProperties } from '../../gis/useApBoundaries';
import { GisSourceRasterOverlays } from './GisSourceRasterOverlays';
import {
  formatFeatureTooltip,
  type LayerNameFallback,
} from '../../gis/featureLabel';
import { classifyEntryExit, entryExitHoverLabel } from '../../gis/entryExitPoint';
import {
  opsCheckpostIcon,
  opsEntryPointIcon,
  opsExitPointIcon,
  opsPoliceStationIcon,
} from '../../gis/opsPointIcons';
import {
  coordsFromFeature,
  hotspotDetailsFromFeature,
  hotspotDetailsHtml,
  resolveHotspotAdminContext,
} from '../../gis/hotspotDetails';
import {
  formatRailTooltip,
  RAIL_CASING_COLOR,
  RAIL_DASH_ARRAY,
  RAIL_LINE_COLOR,
  railWeightForZoom,
  type RailFeatureProps,
} from '../../gis/railStyle';
import {
  MAP_CAMERA_MAX_ZOOM,
  MAP_CAMERA_MIN_ZOOM,
  MAP_ZOOM,
  clampMapZoom,
  findContainingFeature,
  formatIdentifyHtml,
  identifyAdminAtPoint,
  leafletOverzoom,
  shouldDrawMandals,
  shouldDrawVillages,
  shouldOverlayOsmRaster,
  shouldOverlayPlaces,
  shouldOverlayRoads,
  shouldOverlaySatellite,
} from '../../gis/mapDetail';
import {
  OPS_INTERNAL_ROADS_COLOR,
  OPS_INTERNAL_ROADS_OPACITY,
  OPS_INTERNAL_ROADS_WEIGHT,
} from '../../gis/opsRoadStyles';

export type { AdminDrill, AdminDrillLevel } from '../../gis/adminHierarchy';

export type MapClickMode = 'pan' | 'inspect' | 'dist' | 'area' | 'coord' | 'boxzoom' | 'buffer' | 'draw';

export const MapLayoutContext = createContext<string>('0');

function mapIsBusy(map: L.Map): boolean {
  const dragging = map.dragging as (L.Handler & { moving?: () => boolean }) | undefined;
  if (dragging?.moving?.()) return true;
  return Boolean((map as L.Map & { _animatingZoom?: boolean })._animatingZoom);
}

export function MapLayoutProvider({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  return <MapLayoutContext.Provider value={token}>{children}</MapLayoutContext.Provider>;
}

export interface ApLeafletMapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  fitState: () => void;
  fitFeature: (feature: GeoJSON.Feature) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  getView: () => { lat: number; lon: number; zoom: number } | null;
}

interface MarkerSpec {
  id: string;
  lat: number;
  lon: number;
  kind: 'checkpost' | 'hotspot' | 'station' | 'hq' | 'seizure' | 'city' | 'location';
  label: string;
  /** Short text drawn inside the pin. Defaults to the kind badge (HQ, PS, …). */
  badge?: string;
  /** Optional second line in the hover tooltip (e.g. case count). */
  detail?: string;
  selected?: boolean;
  /**
   * NDPS location pins only: 0–1 heat halo (radial red→orange→yellow glow).
   * Omitted / 0 keeps the plain red dot.
   */
  heatIntensity?: number;
}

interface ApLeafletMapProps {
  basemap: BasemapId;
  /**
   * Dashboard India overview only: white political map (no basemap tiles/watermarks).
   * Ignored once the user focuses Andhra Pradesh or drills further.
   */
  cleanIndiaOverview?: boolean;
  showStateBorder?: boolean;
  showDistricts?: boolean;
  districtOpacity?: number;
  stateOpacity?: number;
  choropleth?: boolean;
  showHighways?: boolean;
  showApRoadsFull?: boolean;
  showOpsVspRoads?: boolean;
  showApRoadsMajor?: boolean;
  showAgencyRoutes?: boolean;
  showRailways?: boolean;
  showGraticule?: boolean;
  showBorderPs?: boolean;
  showTalukGis?: boolean;
  showVspVillagePts?: boolean;
  showRivers?: boolean;
  showWaterbodies?: boolean;
  showHillshade?: boolean;
  showTrails?: boolean;
  showPlaces?: boolean;
  bufferRings?: GeodesicBufferRing[];
  showMandals?: boolean;
  showVillages?: boolean;
  showPoliceStations?: boolean;
  mandalOpacity?: number;
  villageOpacity?: number;
  policeStationOpacity?: number;
  selectedPoliceStationId?: string;
  showImageryOverlay?: boolean;
  /**
   * Auto-stack Esri / GIS-Source satellite AOIs on vector/topo at high zoom.
   * Set false for Atlas View 2 (OSM road map) so zoom-in stays sharp street tiles.
   */
  autoSatelliteOverlay?: boolean;
  showGoogleRoadmap?: boolean;
  showSoiTopo?: boolean;
  showDistrictsGisHist?: boolean;
  showStateGisHist?: boolean;
  /** @deprecated Prefer showAsrBoundary — kept for callers; renders ASR Dist-Admin KMZ polygon. */
  highlightAgency?: boolean;
  showAsrBoundary?: boolean;
  showHotspots?: boolean;
  showCheckPosts?: boolean;
  showTollPlazas?: boolean;
  showGanjaSeized?: boolean;
  showPharmaHubs?: boolean;
  showDdacs?: boolean;
  showEntryExit?: boolean;
  /**
   * When true (Dashboard), hover labels say Entry Point / Exit Point from feature
   * `name`, with distinct marker colours. Other workspaces keep the generic tip.
   */
  entryExitTypeLabels?: boolean;
  showStockPoints?: boolean;
  showOpsMainRoads?: boolean;
  showOpsInternalRoads?: boolean;
  /**
   * When true (Roads Routing / Roads Routing New only): viewport-gate and soft-cap
   * dense road vectors. Default false so Atlas, Locus, Map Viewer, Dashboard keep
   * their existing road-layer behaviour.
   */
  roadVectorSafety?: boolean;
  /**
   * Roads Routing only: Road Network layers stay visible at every zoom (no gate),
   * with brighter colours and stroke weight half of route alternatives (3).
   */
  roadNetworkAlwaysOn?: boolean;
  /**
   * Opt-in layer filter (Roads Routing New POI AOI). Replaces admin-drill clipping for
   * vector layers only — does not change camera framing. Default undefined keeps
   * Atlas / Locus / Dashboard / Map Viewer behaviour unchanged.
   */
  filterMapLayers?: (
    fc: GeoJSON.FeatureCollection
  ) => GeoJSON.FeatureCollection;
  /** Opt-in polygon used to filter police-station points (with filterMapLayers). */
  layerClipFeature?: GeoJSON.Feature | null;
  /**
   * When set with filterMapLayers (Roads Routing New corridor), skip unclipped Esri
   * transport tiles that would otherwise paint roads outside the corridor.
   */
  suppressUnclippedRoadTiles?: boolean;
  markers?: MarkerSpec[];
  selectedFeature?: InspectableFeature;
  digitizedFeatures?: DigitizedFeature[];
  ingestedLayers?: IngestedLayer[];
  draftPoints?: Array<{ lat: number; lon: number }>;
  draftType?: 'Point' | 'LineString' | 'Polygon';
  route?: Array<{ lat: number; lon: number }>;
  /** Multi-route overlays (e.g. Roads Routing alternatives). */
  overlayRoutes?: Array<{
    id: string;
    points: Array<{ lat: number; lon: number }>;
    color: string;
    weight?: number;
    opacity?: number;
    dashArray?: string;
    visible?: boolean;
  }>;
  /** Multi-layer GeoJSON overlays (e.g. Roads Routing New network visualisation). */
  geoJsonOverlays?: Array<{
    id: string;
    data: GeoJSON.FeatureCollection;
    color: string;
    weight?: number;
    opacity?: number;
    /** Polygon fill; default false (road lines). Set true for filled polys. */
    fill?: boolean;
    fillOpacity?: number;
    visible?: boolean;
    featureStyle?: (feature: GeoJSON.Feature) => { color: string; weight?: number } | null;
  }>;
  measurePoints?: Array<{ lat: number; lon: number }>;
  measureMode?: 'dist' | 'area' | null;
  droppedPin?: { lat: number; lon: number; elev?: number } | null;
  clickMode?: MapClickMode;
  onMapClick?: (lat: number, lon: number) => void;
  onMarkerClick?: (id: string) => void;
  onApStateFocus?: () => void;
  onDistrictClick?: (
    name: string,
    lat: number,
    lon: number,
    feature: GeoJSON.Feature
  ) => void;
  onMandalClick?: (
    name: string,
    lat: number,
    lon: number,
    district: string | undefined,
    feature: GeoJSON.Feature
  ) => void;
  onVillageClick?: (
    name: string,
    lat: number,
    lon: number,
    mandal: string | undefined,
    district: string | undefined,
    feature: GeoJSON.Feature
  ) => void;
  adminDrill?: AdminDrill | null;
  onPoliceStationClick?: (id: string, name: string, lat: number, lon: number) => void;
  onViewChange?: (lat: number, lon: number, zoom: number) => void;
  onCursorMove?: (lat: number, lon: number, zoom: number) => void;
  className?: string;
  initialZoom?: number;
  initialCenter?: [number, number];
  interactive?: boolean;
  /** District/mandal/village pointer identify tip. Disable for compact analytics maps. */
  adminHoverIdentify?: boolean;
  /** Soft cyan/blue fill on AP + districts when focused. Default on. */
  highlightApFill?: boolean;
  /**
   * Hide basemap detail outside Andhra Pradesh (flat mask).
   * Neighbor states keep outline + name only for context.
   */
  maskOutsideAp?: boolean;
  /**
   * When false, district/mandal drill still spatially filters layers but does not
   * paint an invert mask outside the focus polygon (Atlas keeps neighbors visible).
   */
  maskOutsideDrill?: boolean;
  /**
   * When false, mandal/village overlays follow only explicit show* flags
   * (Atlas Eye toggles) instead of auto-showing on district drill.
   */
  autoAdminOverlays?: boolean;
  /** Skip the permanent “Andhra Pradesh” state pill. Neighbor names stay. */
  hideApStateLabel?: boolean;
  /**
   * Atlas/Locus overview: keep only Andhra Pradesh permanently labeled;
   * other state names appear on hover over that state.
   */
  apOnlyPermanentStateLabels?: boolean;
  showScale?: boolean;
  showAttribution?: boolean;
  layoutRevision?: string | number;
  fitToState?: boolean;
  viewTarget?: { lat: number; lon: number; zoom: number; token: number };
  /**
   * Fit a box without clipping to a polygon mask.
   * With `lock: true`, maxBounds/minZoom keep the camera on that region
   * (neighbors may stay visible via pad, but pan/zoom-out beyond the lock is blocked).
   */
  boundsView?: {
    south: number;
    west: number;
    north: number;
    east: number;
    token: number | string;
    maxZoom?: number;
    /** Expand the fit box so surrounding geography stays in frame. */
    padRatio?: number;
    /** When true, prevent panning/zooming away from this box. */
    lock?: boolean;
    /** Extra pad on maxBounds so neighbors remain visible around the focus area. */
    lockPadRatio?: number;
  } | null;
  /**
   * Opt-in India state hit targets that do not start admin isolation.
   * `pick` — a state click reports the feature and does not reach the map.
   * `pass` — state polygons ignore clicks so the map can place points.
   */
  indiaStatePick?: 'pick' | 'pass';
  onIndiaStatePick?: (feature: GeoJSON.Feature, name: string) => void;
  selectedIndiaStateName?: string | null;
  viewActive?: boolean;
}

function markerIcon(
  kind: MarkerSpec['kind'],
  selected: boolean,
  badge?: string,
  heatIntensity = 0
): DivIcon {
  if (kind === 'location') {
    const heat = Math.max(0, Math.min(1, heatIntensity));
    if (heat > 0) {
      // Strong red core + wide orange/yellow falloff (reference NDPS heat styling).
      const halo = Math.round(56 + heat * 28);
      const core = selected ? 12 : 10;
      return L.divIcon({
        className: 'ap-gis-marker ap-gis-marker-location ap-gis-marker-location--heat',
        iconSize: [halo, halo],
        iconAnchor: [halo / 2, halo / 2],
        html: `<div style="position:relative;width:${halo}px;height:${halo}px;pointer-events:none;">
  <div style="position:absolute;inset:0;border-radius:999px;background:radial-gradient(circle closest-side,
    rgba(185,28,28,0.98) 0%,
    rgba(220,38,38,0.92) 12%,
    rgba(239,68,68,0.78) 22%,
    rgba(249,115,22,0.55) 38%,
    rgba(234,179,8,0.28) 55%,
    rgba(132,204,22,0.12) 70%,
    transparent 82%);"></div>
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${core}px;height:${core}px;border-radius:999px;background:#e11d48;border:1.5px solid #0f172a;box-shadow:0 0 0 1px rgba(255,255,255,0.35);"></div>
</div>`,
      });
    }
    const size = selected ? 16 : 12;
    return L.divIcon({
      className: 'ap-gis-marker ap-gis-marker-location',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:#e11d48;border:1.5px solid #1e293b;box-shadow:0 1px 2px rgba(15,23,42,0.35);"></div>`,
    });
  }
  const palette: Record<Exclude<MarkerSpec['kind'], 'location'>, string> = {
    checkpost: '#006a61',
    hotspot: '#ba1a1a',
    station: '#0f2942',
    hq: '#090051',
    seizure: '#4f46e5',
    city: '#111827',
  };
  const color = palette[kind];
  const size = selected ? 22 : 16;
  const label =
    badge ??
    (kind === 'checkpost' ? 'CP' : kind === 'hotspot' ? 'H' : kind === 'hq' ? 'HQ' : kind === 'station' ? 'PS' : '');
  return L.divIcon({
    className: 'ap-gis-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${selected ? 4 : 0}px rgba(0,106,97,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 8px Inter,sans-serif;">${label}</div>`,
  });
}

const INDIA_MAX_BOUNDS = L.latLngBounds(INDIA_BOUNDS[0], INDIA_BOUNDS[1]).pad(0.06);

function featureBounds(feature: GeoJSON.Feature): L.LatLngBounds | null {
  const bounds = L.geoJSON(feature as GeoJSON.GeoJsonObject).getBounds();
  return bounds.isValid() ? bounds : null;
}

function bindIsolateClick(layer: L.Layer, onClick: (e: L.LeafletMouseEvent) => void) {
  // Never disable map.dragging on hover: admin polygons often fill the viewport after
  // zoom-in, mouseout never fires, and pan stays dead while wheel-zoom still works.
  layer.on('click', (e: L.LeafletMouseEvent) => {
    const map = (layer as L.Layer & { _map?: L.Map })._map;
    if (map && mapIsBusy(map)) return;
    L.DomEvent.stopPropagation(e);
    onClick(e);
  });
}

/** Sticky hover/click name for any vector feature. */
function bindNamedTooltip(
  feature: GeoJSON.Feature,
  layer: L.Layer,
  fallback: LayerNameFallback = 'Feature'
) {
  const label = formatFeatureTooltip(
    (feature.properties ?? {}) as Record<string, unknown>,
    fallback
  );
  layer.bindTooltip(label, { sticky: true, direction: 'top', opacity: 0.96 });
}

function constrainToFeature(map: L.Map, feature: GeoJSON.Feature | null) {
  map.options.maxBoundsViscosity = feature ? 1 : 0.9;
  map.setMaxZoom(MAP_CAMERA_MAX_ZOOM);
  if (!feature) {
    map.setMinZoom(MAP_CAMERA_MIN_ZOOM);
    map.setMaxBounds(INDIA_MAX_BOUNDS);
    return null;
  }
  const bounds = featureBounds(feature);
  if (!bounds) return null;
  map.setMaxBounds(bounds.pad(0.22));
  const fitted = map.getBoundsZoom(bounds, false);
  const cap =
    feature.properties && 'village_name' in (feature.properties as object)
      ? 15
      : feature.properties && 'mandal_name' in (feature.properties as object)
        ? 13
        : 10;
  if (Number.isFinite(fitted) && fitted > 0) {
    map.setMinZoom(
      Math.min(MAP_CAMERA_MAX_ZOOM - 1, cap, Math.max(MAP_CAMERA_MIN_ZOOM, Math.floor(fitted) - 1))
    );
  } else {
    map.setMinZoom(MAP_CAMERA_MIN_ZOOM);
  }
  return bounds;
}

const MapController = forwardRef<
  ApLeafletMapHandle,
  {
    onViewChange?: ApLeafletMapProps['onViewChange'];
    layoutRevision?: string | number;
    fitToState?: boolean;
    clipFeature?: GeoJSON.Feature | null;
    clipKey?: string;
    apFocused?: boolean;
    viewTarget?: { lat: number; lon: number; zoom: number; token: number };
    boundsView?: ApLeafletMapProps['boundsView'];
    viewActive?: boolean;
  }
>(
  ({
    onViewChange,
    layoutRevision,
    fitToState,
    clipFeature = null,
    clipKey = '',
    apFocused = false,
    viewTarget,
    boundsView = null,
    viewActive = true,
  }, ref) => {
    const map = useMap();
    const layoutToken = useContext(MapLayoutContext);
    const revision = `${layoutToken}:${layoutRevision ?? ''}`;
    const hadClip = React.useRef(false);
    useImperativeHandle(ref, () => ({
      flyTo: (lat, lon, zoom = 12) => {
        map.invalidateSize({ animate: false });
        map.flyTo([lat, lon], clampMapZoom(zoom), { duration: 0.8 });
      },
      fitState: () => {
        map.invalidateSize({ animate: false });
        constrainToFeature(map, null);
        map.fitBounds(INDIA_BOUNDS, { padding: [20, 20] });
      },
      fitFeature: (feature) => {
        const bounds = featureBounds(feature);
        if (!bounds) return;
        map.invalidateSize({ animate: false });
        constrainToFeature(map, feature);
        const maxZoom =
          feature.properties && 'village_name' in (feature.properties as object)
            ? 16
            : feature.properties && 'mandal_name' in (feature.properties as object)
              ? 14
              : 11;
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: Math.min(maxZoom, MAP_CAMERA_MAX_ZOOM), animate: true });
      },
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      getView: () => {
        const c = map.getCenter();
        return { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      },
    }));
    useEffect(() => {
      let frame = 0;
      let lastW = 0;
      let lastH = 0;
      let fitted = false;
      const host =
        (map.getContainer().closest('.gis-map-host') as HTMLElement | null) ??
        map.getContainer().parentElement ??
        map.getContainer();

      const syncSize = () => {
        if (mapIsBusy(map)) return;
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          if (mapIsBusy(map)) return;
          const rw = host.clientWidth;
          const rh = host.clientHeight;
          if (rw < 40 || rh < 40) return;
          map.invalidateSize({ animate: false, pan: false });
          const size = map.getSize();
          if (size.x < 40 || size.y < 40) return;
          const grew =
            Math.abs(size.x - lastW) > 24 || Math.abs(size.y - lastH) > 24 || lastW === 0;
          lastW = size.x;
          lastH = size.y;
          if (fitToState && !fitted && grew && !boundsView) {
            fitted = true;
            map.fitBounds(apFocused ? AP_BOUNDS : INDIA_BOUNDS, {
              padding: apFocused ? [28, 28] : [20, 20],
              animate: false,
              maxZoom: apFocused ? 8 : undefined,
            });
          }
        });
      };

      const observer = new ResizeObserver(syncSize);
      observer.observe(host);
      const timers = [0, 80, 250].map((delay) => window.setTimeout(syncSize, delay));
      map.whenReady(syncSize);
      window.addEventListener('resize', syncSize);
      return () => {
        observer.disconnect();
        timers.forEach((id) => window.clearTimeout(id));
        if (frame) window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', syncSize);
      };
    }, [map, revision, fitToState, boundsView, apFocused]);
    const lastApFocus = React.useRef<boolean | null>(null);
    useEffect(() => {
      if (!viewActive) return;
      // Any active boundsView owns the camera frame (Atlas district fit, Routing New state zoom).
      // Do not yank the view back to statewide AP / India while it is set.
      if (boundsView) {
        lastApFocus.current = apFocused;
        return;
      }
      if (!clipFeature) {
        constrainToFeature(map, null);
        map.invalidateSize({ animate: false });
        if (hadClip.current) {
          hadClip.current = false;
          map.fitBounds(apFocused ? AP_BOUNDS : INDIA_BOUNDS, {
            padding: apFocused ? [40, 40] : [20, 20],
            animate: true,
          });
          lastApFocus.current = apFocused;
          return;
        }
        if (lastApFocus.current !== apFocused) {
          lastApFocus.current = apFocused;
          map.fitBounds(apFocused ? AP_BOUNDS : INDIA_BOUNDS, {
            padding: apFocused ? [40, 40] : [20, 20],
            animate: true,
            maxZoom: apFocused ? 8 : undefined,
          });
        }
        return;
      }
      const bounds = constrainToFeature(map, clipFeature);
      if (!bounds) return;
      hadClip.current = true;
      lastApFocus.current = true;
      map.invalidateSize({ animate: false });
      const maxZoom =
        clipFeature.properties && 'village_name' in (clipFeature.properties as object)
          ? 16
          : clipFeature.properties && 'mandal_name' in (clipFeature.properties as object)
            ? 14
            : 11;
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: Math.min(maxZoom, MAP_CAMERA_MAX_ZOOM), animate: true });
    }, [map, clipKey, clipFeature, viewActive, apFocused, boundsView]);
    const lastViewToken = React.useRef<number | null>(null);
    useEffect(() => {
      if (!viewTarget || clipFeature) return;
      if (lastViewToken.current === viewTarget.token) return;
      lastViewToken.current = viewTarget.token;
      map.invalidateSize({ animate: false });
      map.flyTo([viewTarget.lat, viewTarget.lon], clampMapZoom(viewTarget.zoom), { duration: 0 });
    }, [map, viewTarget, clipFeature]);
    const lastBoundsToken = React.useRef<string | number | null>(null);
    useEffect(() => {
      // boundsView owns framing (Atlas district majority fit) even when layers are clipped.
      if (!boundsView) return;
      if (lastBoundsToken.current === boundsView.token) return;
      lastBoundsToken.current = boundsView.token;
      const bounds = L.latLngBounds(
        [boundsView.south, boundsView.west],
        [boundsView.north, boundsView.east]
      );
      if (!bounds.isValid()) return;
      map.invalidateSize({ animate: false });
      // Modest pad keeps the focus geometry dominant while leaving neighbors in frame.
      const fitPad = boundsView.padRatio ?? 0.12;
      const fitTarget = bounds.pad(fitPad);
      if (boundsView.lock) {
        const lockPad = boundsView.lockPadRatio ?? Math.max(fitPad, 0.12);
        const lockBounds = bounds.pad(lockPad);
        map.setMaxBounds(lockBounds);
        map.options.maxBoundsViscosity = 1;
        const fitted = map.getBoundsZoom(fitTarget, false);
        if (Number.isFinite(fitted) && fitted > 0) {
          // Keep AP dominant: cannot zoom out past a near-fit of the focus box.
          map.setMinZoom(
            Math.min(
              MAP_CAMERA_MAX_ZOOM - 1,
              Math.max(MAP_CAMERA_MIN_ZOOM, Math.floor(fitted * 10) / 10)
            )
          );
        }
      } else {
        // Clear any prior isolation so surrounding geography stays pannable.
        constrainToFeature(map, null);
      }
      map.fitBounds(fitTarget, {
        padding: [36, 36],
        maxZoom: boundsView.maxZoom ?? 10,
        animate: true,
      });
    }, [map, boundsView]);
    useMapEvents({
      moveend: () => {
        if (!viewActive) return;
        const c = map.getCenter();
        onViewChange?.(c.lat, c.lng, map.getZoom());
      },
      zoomend: () => {
        if (!viewActive) return;
        const c = map.getCenter();
        onViewChange?.(c.lat, c.lng, map.getZoom());
      },
    });
    return null;
  }
);
MapController.displayName = 'MapController';

const ClickSink: React.FC<{
  mode: MapClickMode;
  interactive: boolean;
  drillLevel: string;
  apFocused: boolean;
  districts: GeoJSON.FeatureCollection | null;
  onDistrictClick?: ApLeafletMapProps['onDistrictClick'];
  onMapClick?: (lat: number, lon: number) => void;
  onCursorMove?: ApLeafletMapProps['onCursorMove'];
}> = ({
  mode,
  interactive,
  drillLevel,
  apFocused,
  districts,
  onDistrictClick,
  onMapClick,
  onCursorMove,
}) => {
  const map = useMap();
  useEffect(() => {
    if (!interactive) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.keyboard.disable();
      return;
    }
    if (mode === 'boxzoom') {
      map.dragging.disable();
      map.boxZoom.disable();
    } else {
      map.dragging.enable();
    }
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoom.enable();
    map.keyboard.enable();
    return () => {
      map.dragging.enable();
    };
  }, [map, mode, interactive]);
  const lastCursor = React.useRef(0);
  useMapEvents({
    click: (e) => {
      if (mode === 'boxzoom' || mode === 'pan') return;
      // District isolation only after AP state focus — never from India overview.
      if (
        mode === 'inspect' &&
        drillLevel === 'state' &&
        apFocused &&
        onDistrictClick &&
        districts
      ) {
        const hit = findContainingFeature([e.latlng.lng, e.latlng.lat], districts.features);
        const name = String((hit?.properties as ApDistrictProperties | undefined)?.district_name ?? '');
        if (hit && name) {
          onDistrictClick(
            name,
            e.latlng.lat,
            e.latlng.lng,
            isolateChildFeature(hit, [e.latlng.lng, e.latlng.lat])
          );
          return;
        }
      }
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
    mousemove: (e) => {
      const now = Date.now();
      if (now - lastCursor.current < 120) return;
      lastCursor.current = now;
      onCursorMove?.(e.latlng.lat, e.latlng.lng, map.getZoom());
    },
  });
  return null;
};

const BoxZoomTool: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    map.dragging.disable();
    let start: L.LatLng | null = null;
    let rect: L.Rectangle | null = null;

    const clearRect = () => {
      if (rect) {
        map.removeLayer(rect);
        rect = null;
      }
    };

    const onDown = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      start = e.latlng;
      clearRect();
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (!start) return;
      const bounds = L.latLngBounds(start, e.latlng);
      if (!rect) {
        rect = L.rectangle(bounds, {
          color: '#006a61',
          weight: 1,
          dashArray: '4 3',
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        rect.setBounds(bounds);
      }
    };
    const onUp = (e: L.LeafletMouseEvent) => {
      if (!start) return;
      const bounds = L.latLngBounds(start, e.latlng);
      clearRect();
      start = null;
      if (bounds.getSouthWest().distanceTo(bounds.getNorthEast()) > 120) {
        map.fitBounds(bounds.pad(0.04));
      }
    };

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
      clearRect();
      map.dragging.enable();
    };
  }, [map, enabled]);
  return null;
};

const AdminPolygonLayers: React.FC<{
  showMandals: boolean;
  showVillages: boolean;
  mandalOpacity: number;
  villageOpacity: number;
  adminDrill?: AdminDrill | null;
  onMandalClick?: ApLeafletMapProps['onMandalClick'];
  onVillageClick?: ApLeafletMapProps['onVillageClick'];
}> = ({
  showMandals,
  showVillages,
  mandalOpacity,
  villageOpacity,
  adminDrill,
  onMandalClick,
  onVillageClick,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);

  const refresh = () => {
    const b = map.getBounds();
    setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    setZoom(map.getZoom());
  };
  useMapEvents({ moveend: refresh, zoomend: refresh });
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  const parentBbox =
    (adminDrill?.mandalFeature && featureBbox(adminDrill.mandalFeature)) ||
    (adminDrill?.districtFeature && featureBbox(adminDrill.districtFeature)) ||
    bbox;
  const mandals = useApMandals(showMandals);
  const villages = useVillagePolygons(
    showVillages,
    parentBbox,
    zoom,
    adminDrill && adminDrill.level !== 'state' ? 0 : 9
  );

  const mandalCollection = useMemo(() => {
    if (!mandals) return null;
    const level = adminDrill?.level ?? 'state';
    if (level === 'state') return showMandals ? mandals : null;
    if (level === 'village' && adminDrill?.mandalFeature) {
      return asFeatureCollection([adminDrill.mandalFeature]);
    }
    if (level === 'mandal' && adminDrill?.mandalFeature) {
      return asFeatureCollection([adminDrill.mandalFeature]);
    }
    if (level === 'mandal' && adminDrill?.mandalName) {
      const named = filterByAdminName(mandals.features, 'mandal_name', adminDrill.mandalName);
      return asFeatureCollection(named);
    }
    if ((level === 'district' || level === 'mandal') && adminDrill?.districtFeature) {
      const inside = filterFeaturesInParent(mandals.features, adminDrill.districtFeature);
      return asFeatureCollection(inside);
    }
    return mandals;
  }, [mandals, adminDrill, showMandals]);

  const villageCollection = useMemo(() => {
    if (!villages) return null;
    const level = adminDrill?.level ?? 'state';
    if (level === 'state') return showVillages ? villages : null;
    if (level === 'village' && adminDrill?.villageFeature) {
      return asFeatureCollection([adminDrill.villageFeature]);
    }
    if ((level === 'mandal' || level === 'village') && adminDrill?.mandalFeature) {
      const inside = filterFeaturesInParent(villages.features, adminDrill.mandalFeature);
      if (adminDrill.mandalName) {
        const named = filterByAdminName(inside, 'mandal_name', adminDrill.mandalName);
        if (named.length) return asFeatureCollection(named);
      }
      return asFeatureCollection(inside);
    }
    if ((level === 'mandal' || level === 'village') && adminDrill?.mandalName) {
      return asFeatureCollection(filterByAdminName(villages.features, 'mandal_name', adminDrill.mandalName));
    }
    if (level === 'district' && adminDrill?.districtFeature) {
      return asFeatureCollection(
        filterFeaturesInParent(villages.features, adminDrill.districtFeature)
      );
    }
    return villages;
  }, [villages, adminDrill, showVillages]);

  return (
    <>
      {showMandals && mandalCollection && (
        <div
          data-testid="mandal-layer-ready"
          data-count={mandalCollection.features.length}
          hidden
        />
      )}
      {showVillages && villageCollection && (
        <div
          data-testid="village-layer-ready"
          data-count={villageCollection.features.length}
          data-zoom={zoom}
          hidden
        />
      )}
      {showMandals && mandalCollection && (
        <GeoJSON
          key={`mandals-${mandalOpacity}-${mandalCollection.features.length}-${adminDrill?.mandalName ?? adminDrill?.districtName ?? 'all'}`}
          pane="admin-vectors"
          data={mandalCollection}
          style={{
            color: '#000000',
            weight: zoom >= 9 ? 1.6 : 1.2,
            fillColor: '#000000',
            fillOpacity: 0,
            opacity: mandalOpacity,
          }}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as MandalProperties;
            bindNamedTooltip(feature, layer, 'Mandal');
            bindIsolateClick(layer, (e) => {
              onMandalClick?.(
                props.mandal_name,
                e.latlng.lat,
                e.latlng.lng,
                props.district_name,
                isolateChildFeature(feature, [e.latlng.lng, e.latlng.lat], adminDrill?.districtFeature)
              );
            });
          }}
        />
      )}
      {showVillages && villageCollection && (
        <GeoJSON
          key={`villages-${villageOpacity}-${villageCollection.features.length}-${adminDrill?.villageName ?? adminDrill?.mandalName ?? 'all'}`}
          pane="admin-vectors"
          data={villageCollection}
          style={{
            color: '#000000',
            weight: zoom >= 10 ? 1.1 : 0.85,
            fillColor: '#000000',
            fillOpacity: 0,
            opacity: villageOpacity,
          }}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as VillageProperties;
            bindNamedTooltip(feature, layer, 'Village');
            bindIsolateClick(layer, (e) => {
              onVillageClick?.(
                props.village_name,
                e.latlng.lat,
                e.latlng.lng,
                props.mandal_name,
                props.district_name,
                isolateChildFeature(
                  feature,
                  [e.latlng.lng, e.latlng.lat],
                  adminDrill?.mandalFeature ?? adminDrill?.districtFeature
                )
              );
            });
          }}
        />
      )}
    </>
  );
};

function ensurePsMarkersPane(map: L.Map) {
  if (!map.getPane('ps-markers')) {
    const pane = map.createPane('ps-markers');
    // Above imagery / admin vectors so dots stay visible when zoomed in.
    pane.style.zIndex = '620';
  }
}

/** OPS point markers above admin polygons so hotspot hover is not stolen by villages. */
function ensureOpsMarkersPane(map: L.Map) {
  if (!map.getPane('ops-markers')) {
    const pane = map.createPane('ops-markers');
    // Below hotspot tooltips (750) so markers never paint over the popup.
    pane.style.zIndex = '640';
  } else {
    map.getPane('ops-markers')!.style.zIndex = '640';
  }
}

/** Hotspot hover cards above markers / admin identify tips. */
function ensureHotspotTooltipPane(map: L.Map) {
  if (!map.getPane('hotspot-tooltips')) {
    const pane = map.createPane('hotspot-tooltips');
    pane.style.zIndex = '750';
    pane.style.pointerEvents = 'none';
  } else {
    map.getPane('hotspot-tooltips')!.style.zIndex = '750';
  }
}

function isEventOverOpsMarkers(ev: MouseEvent | undefined): boolean {
  const t = ev?.target;
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest('.leaflet-ops-markers-pane'));
}

const PoliceStationLayer: React.FC<{
  enabled: boolean;
  opacity: number;
  selectedId?: string;
  clipFeature?: GeoJSON.Feature | null;
  onPoliceStationClick?: ApLeafletMapProps['onPoliceStationClick'];
}> = ({ enabled, opacity, selectedId, clipFeature, onPoliceStationClick }) => {
  const map = useMap();
  const [paneReady, setPaneReady] = useState(() => Boolean(map.getPane('ps-markers')));

  // Pane must exist before markers mount (missing pane → Leaflet throw → blank page).
  useLayoutEffect(() => {
    ensurePsMarkersPane(map);
    setPaneReady(true);
  }, [map]);

  const stations = usePoliceStations(true);
  if (!paneReady || !stations) return null;

  const features = clipFeature
    ? stations.features.filter((feature) => {
        if (!feature.geometry || feature.geometry.type !== 'Point') return false;
        const [lon, lat] = feature.geometry.coordinates;
        return pointInFeature([lon, lat], clipFeature);
      })
    : stations.features;

  return (
    <>
      <div data-testid="ps-layer-ready" data-count={features.length} hidden />
      {enabled &&
        features.map((feature, idx) => {
          if (!feature.geometry || feature.geometry.type !== 'Point') return null;
          const [lon, lat] = feature.geometry.coordinates;
          const props = (feature.properties ?? {}) as Partial<PoliceStationProperties>;
          const id = props.id || String(feature.id || `ps-${idx}`);
          const selected = Boolean(selectedId && id === selectedId);
          const name = (props.name || id).trim();
          const detail = [props.district, props.state].filter(Boolean).join(' • ');
          return (
            <Marker
              key={`${id}-${selected ? 'sel' : 'n'}`}
              position={[lat, lon]}
              icon={opsPoliceStationIcon(selected)}
              pane="ps-markers"
              opacity={opacity}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  onPoliceStationClick?.(id, props.name || id, lat, lon);
                },
              }}
            >
              <Tooltip sticky direction="top" opacity={0.96} offset={[0, -8]}>
                <div className="text-[11px] leading-snug">
                  <div className="font-semibold">{name}</div>
                  {detail ? <div className="text-slate-600 font-medium">{detail}</div> : null}
                </div>
              </Tooltip>
              <Popup className="ap-ps-popup" closeButton autoClose closeOnClick>
                <div className="ap-ps-label">
                  <div className="ap-ps-label__name">{name}</div>
                  {detail ? <div className="ap-ps-label__meta">{detail}</div> : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
    </>
  );
};

const bindIndianRailwayTooltip = (feature: GeoJSON.Feature, layer: L.Layer) => {
  layer.bindTooltip(formatRailTooltip(feature.properties as RailFeatureProps), {
    sticky: true,
    className: 'ap-rail-tooltip',
  });
};

/** Violet casing + dashed track, zoom-scaled; rendered above road layers. */
const IndianRailwayLayer: React.FC<{ data: GeoJSON.FeatureCollection }> = ({ data }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    zoom: () => setZoom(map.getZoom()),
  });
  const { casing, line } = railWeightForZoom(zoom);
  return (
    <>
      <GeoJSON
        key={`rail-casing-${casing}`}
        data={data}
        interactive={false}
        style={{
          color: RAIL_CASING_COLOR,
          weight: casing,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <GeoJSON
        key={`rail-line-${line}`}
        data={data}
        style={{
          color: RAIL_LINE_COLOR,
          weight: line,
          opacity: 1,
          dashArray: RAIL_DASH_ARRAY,
          lineCap: 'butt',
          lineJoin: 'round',
        }}
        onEachFeature={bindIndianRailwayTooltip}
      />
    </>
  );
};

const ZoomAwarePlaces: React.FC<{ enabled: boolean; minZoom?: number; pane?: string }> = ({
  enabled,
  minZoom = 10,
  pane,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (!enabled || zoom < minZoom) return null;
  return (
    <TileLayer
      url={ESRI_PLACES_TILES.url}
      attribution={ESRI_PLACES_TILES.attribution}
      opacity={0.95}
      pane={pane}
      {...leafletOverzoom(ESRI_PLACES_TILES.maxZoom)}
    />
  );
};

const ZoomAwareDetailStack: React.FC<{
  useMapLibre: boolean;
  rasterId: RasterBasemapId;
  drillActive: boolean;
  drillLevel: string;
  showImageryOverlay: boolean;
  showHighways: boolean;
  showPlaces: boolean;
}> = ({
  useMapLibre,
  rasterId,
  drillActive,
  drillLevel,
  showImageryOverlay,
  showHighways,
  showPlaces,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const osmBoost = shouldOverlayOsmRaster(zoom, useMapLibre, drillActive);
  const imagery = shouldOverlaySatellite(zoom, rasterId, drillLevel, showImageryOverlay);
  const roads = shouldOverlayRoads(zoom, showHighways, useMapLibre, drillActive);
  const overlayPane = useMapLibre || drillActive || imagery ? 'overlayPane' : undefined;

  return (
    <>
      {osmBoost && (
        <TileLayer
          attribution={BASEMAP_TILES.vector.attribution}
          url={BASEMAP_TILES.vector.url}
          pane="overlayPane"
          opacity={imagery ? 0.35 : 1}
          {...leafletOverzoom(BASEMAP_TILES.vector.maxZoom)}
        />
      )}
      {roads && (
        <TileLayer
          url={ESRI_TRANSPORT_TILES.url}
          attribution={ESRI_TRANSPORT_TILES.attribution}
          opacity={0.9}
          pane={overlayPane ?? 'overlayPane'}
          {...leafletOverzoom(ESRI_TRANSPORT_TILES.maxZoom)}
        />
      )}
      <ZoomAwarePlaces
        enabled={shouldOverlayPlaces(zoom, showPlaces, drillActive)}
        minZoom={6}
        pane="overlayPane"
      />
    </>
  );
};

const AdminHoverIdentify: React.FC<{
  adminDrill?: AdminDrill | null;
  enabled?: boolean;
}> = ({ adminDrill, enabled = true }) => {
  const map = useMap();
  const { districts } = useApBoundaries();
  const mandals = useApMandals(enabled);
  const [zoom, setZoom] = useState(map.getZoom());
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const tooltipRef = React.useRef<L.Tooltip | null>(null);
  const lastAt = React.useRef(0);
  const parentBbox =
    (adminDrill?.mandalFeature && featureBbox(adminDrill.mandalFeature)) ||
    (adminDrill?.districtFeature && featureBbox(adminDrill.districtFeature)) ||
    bbox;
  const villages = useVillagePolygons(
    enabled && zoom >= MAP_ZOOM.villagePolygons,
    parentBbox,
    zoom,
    adminDrill && adminDrill.level !== 'state' ? 0 : MAP_ZOOM.villagePolygons
  );

  const refreshView = () => {
    const b = map.getBounds();
    setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    setZoom(map.getZoom());
  };
  useMapEvents({
    moveend: refreshView,
    zoomend: refreshView,
    mouseout: () => {
      tooltipRef.current?.remove();
    },
    mousemove: (e) => {
      if (!enabled) return;
      // OPS hotspots sit above admin fills; suppress village tip while over them.
      if (isEventOverOpsMarkers(e.originalEvent)) {
        tooltipRef.current?.remove();
        return;
      }
      const now = Date.now();
      if (now - lastAt.current < 90) return;
      lastAt.current = now;
      const z = map.getZoom();
      const point: [number, number] = [e.latlng.lng, e.latlng.lat];
      const clipParent =
        adminDrill?.mandalFeature ??
        (adminDrill?.level === 'district' || adminDrill?.level === 'mandal' || adminDrill?.level === 'village'
          ? adminDrill.districtFeature
          : null) ??
        null;
      // Ignore pointer outside the active district/mandal frame (neighbor districts).
      if (clipParent && !pointInFeature(point, clipParent)) {
        tooltipRef.current?.remove();
        return;
      }
      const districtFeats = clipParent
        ? adminDrill?.districtFeature
          ? [adminDrill.districtFeature]
          : districts?.features ?? []
        : districts?.features ?? [];
      const mandalFeats = clipParent
        ? filterFeaturesInParent(mandals?.features ?? [], clipParent)
        : mandals?.features ?? [];
      const villageFeats = clipParent
        ? filterFeaturesInParent(villages?.features ?? [], clipParent)
        : villages?.features ?? [];
      const hit = identifyAdminAtPoint(point, z, districtFeats, mandalFeats, villageFeats);
      if (adminDrill?.districtName) hit.district = adminDrill.districtName;
      const html = formatIdentifyHtml(hit);
      if (!html) {
        tooltipRef.current?.remove();
        return;
      }
      if (!tooltipRef.current) {
        tooltipRef.current = L.tooltip({
          sticky: true,
          opacity: 0.96,
          className: 'ap-admin-identify-tip',
          direction: 'top',
          offset: [0, -8],
        });
      }
      tooltipRef.current.setLatLng(e.latlng).setContent(html);
      if (!map.hasLayer(tooltipRef.current as unknown as L.Layer)) {
        tooltipRef.current.addTo(map);
      }
    },
  });
  useEffect(() => {
    refreshView();
    return () => {
      tooltipRef.current?.remove();
      tooltipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return <div data-testid="admin-hover-identify" data-zoom={zoom} hidden />;
};

const AdminClipPanes: React.FC = () => {
  const map = useMap();
  useLayoutEffect(() => {
    // Clip mask sits above admin vectors so vintage mandal/village strokes cannot
    // spill outside the active 2022 district/mandal frame.
    if (!map.getPane('admin-vectors')) {
      const vectors = map.createPane('admin-vectors');
      vectors.style.zIndex = '460';
    }
    const clip = map.getPane('admin-clip') ?? map.createPane('admin-clip');
    clip.style.zIndex = '470';
    clip.style.pointerEvents = 'none';
    ensurePsMarkersPane(map);
    ensureOpsMarkersPane(map);
    ensureHotspotTooltipPane(map);
  }, [map]);
  return null;
};

function hotspotCollectionBbox(
  data: GeoJSON.FeatureCollection
): [number, number, number, number] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of data.features) {
    const c = coordsFromFeature(feature);
    if (!c) continue;
    west = Math.min(west, c[0]);
    east = Math.max(east, c[0]);
    south = Math.min(south, c[1]);
    north = Math.max(north, c[1]);
  }
  if (!Number.isFinite(west)) return null;
  const pad = 0.05;
  return [west - pad, south - pad, east + pad, north + pad];
}

/** Check posts on `ops-markers` with booth icon + hover name. */
const CheckPostsLayer: React.FC<{ data: GeoJSON.FeatureCollection }> = ({ data }) => {
  const map = useMap();
  const [paneReady, setPaneReady] = useState(() => Boolean(map.getPane('ops-markers')));

  useLayoutEffect(() => {
    ensureOpsMarkersPane(map);
    setPaneReady(true);
  }, [map]);

  if (!paneReady) return null;

  return (
    <GeoJSON
      key={`checkposts-${data.features.length}`}
      data={data}
      pane="ops-markers"
      pointToLayer={(_feature, latlng) =>
        L.marker(latlng, {
          icon: opsCheckpostIcon(),
          pane: 'ops-markers',
          interactive: true,
          bubblingMouseEvents: false,
        })
      }
      onEachFeature={(feature, layer) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const label = formatFeatureTooltip(props, 'Check Post');
        layer.bindTooltip(label, {
          sticky: true,
          direction: 'top',
          opacity: 0.96,
          offset: [0, -8],
        });
      }}
    />
  );
};

/**
 * Entry/Exit points must sit on `ops-markers` (above admin/ASR fills).
 * Otherwise polygon hit-testing steals hover and tooltips never appear.
 */
const EntryExitPointsLayer: React.FC<{
  data: GeoJSON.FeatureCollection;
  typeLabels: boolean;
  onEachGeneric: (feature: GeoJSON.Feature, layer: L.Layer) => void;
}> = ({ data, typeLabels, onEachGeneric }) => {
  const map = useMap();
  const [paneReady, setPaneReady] = useState(() => Boolean(map.getPane('ops-markers')));

  useLayoutEffect(() => {
    ensureOpsMarkersPane(map);
    setPaneReady(true);
  }, [map]);

  if (!paneReady) return null;

  return (
    <GeoJSON
      key={`entry-exit-${typeLabels ? 'typed' : 'generic'}-${data.features.length}`}
      data={data}
      pane="ops-markers"
      pointToLayer={(feature, latlng) => {
        const kind = classifyEntryExit(feature.properties);
        const icon = kind === 'exit' ? opsExitPointIcon() : opsEntryPointIcon();
        return L.marker(latlng, {
          icon,
          pane: 'ops-markers',
          interactive: true,
          bubblingMouseEvents: false,
        });
      }}
      onEachFeature={(feature, layer) => {
        if (typeLabels) {
          layer.bindTooltip(entryExitHoverLabel(feature.properties), {
            className: 'ap-entry-exit-tooltip',
            sticky: true,
            direction: 'top',
            offset: [0, -8],
            opacity: 1,
          });
          return;
        }
        onEachGeneric(feature, layer);
      }}
    />
  );
};

const OpsHotspotsLayer: React.FC<{
  data: GeoJSON.FeatureCollection;
  clipFeature?: GeoJSON.Feature | null;
}> = ({ data, clipFeature = null }) => {
  const map = useMap();
  const { districts, state } = useApBoundaries();
  const mandals = useApMandals(true);
  const visible = useMemo(() => {
    if (!clipFeature) return data;
    const features = data.features.filter((feature) => {
      const coords = coordsFromFeature(feature);
      return coords ? pointInFeature(coords, clipFeature) : false;
    });
    return { type: 'FeatureCollection' as const, features };
  }, [data, clipFeature]);
  const hotspotBbox = useMemo(() => hotspotCollectionBbox(visible), [visible]);
  const villages = useVillagePolygons(Boolean(hotspotBbox), hotspotBbox, 20, 0);
  const [paneReady, setPaneReady] = useState(
    () => Boolean(map.getPane('ops-markers') && map.getPane('hotspot-tooltips'))
  );

  useLayoutEffect(() => {
    ensureOpsMarkersPane(map);
    ensureHotspotTooltipPane(map);
    setPaneReady(Boolean(map.getPane('ops-markers') && map.getPane('hotspot-tooltips')));
  }, [map]);

  const tooltipHtmlByIndex = useMemo(() => {
    const stateFt = state?.features?.[0] ?? null;
    const districtFeats = districts?.features ?? [];
    const mandalFeats = mandals?.features ?? [];
    const villageFeats = villages?.features ?? [];
    return visible.features.map((feature, index) => {
      const coords = coordsFromFeature(feature);
      const admin =
        coords && (districtFeats.length || mandalFeats.length)
          ? resolveHotspotAdminContext(
              coords,
              districtFeats,
              mandalFeats,
              villageFeats,
              stateFt
            )
          : null;
      return hotspotDetailsHtml(
        hotspotDetailsFromFeature(feature, { serial: index + 1, admin })
      );
    });
  }, [visible, districts, mandals, villages, state]);

  if (!paneReady) return null;

  return (
    <GeoJSON
      key={`ops-hotspots-${visible.features.length}-${clipFeature ? 'clip' : 'all'}-${districts ? 'd' : ''}-${mandals ? 'm' : ''}-${villages ? 'v' : ''}`}
      data={visible}
      pane="ops-markers"
      pointToLayer={(_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 7,
          color: '#7f1d1d',
          weight: 2,
          fillColor: '#ba1a1a',
          fillOpacity: 0.95,
          pane: 'ops-markers',
          bubblingMouseEvents: false,
        })
      }
      onEachFeature={(feature, layer) => {
        const index = visible.features.indexOf(feature);
        const html =
          tooltipHtmlByIndex[index] ??
          hotspotDetailsHtml(hotspotDetailsFromFeature(feature, { serial: index + 1 }));
        layer.bindTooltip(html, {
          className: 'ap-hotspot-tooltip',
          pane: 'hotspot-tooltips',
          direction: 'right',
          offset: [12, 0],
          opacity: 1,
          sticky: false,
          interactive: false,
        });
      }}
    />
  );
};

const AdminClipMask: React.FC<{
  feature: GeoJSON.Feature | null;
  /** Outside-India fill (dashboard clean overview uses pure white). */
  fillColor?: string;
  strokeColor?: string;
  strokeWeight?: number;
}> = ({ feature, fillColor = '#cfe4f3', strokeColor = '#0f2942', strokeWeight }) => {
  const rings = useMemo(() => (feature ? invertMaskLatLngs(feature) : []), [feature]);
  if (!feature || rings.length < 2) return null;
  const weight = strokeWeight ?? (fillColor === '#ffffff' ? 1 : 1.5);
  return (
    <Polygon
      pane="admin-clip"
      positions={rings as LatLngExpression[][]}
      pathOptions={{
        fillColor,
        fillOpacity: 1,
        fillRule: 'evenodd',
        color: strokeColor,
        weight,
        opacity: 1,
        interactive: false,
        // weight 0 → fill-only mask so state/outline strokes are not double-drawn.
        stroke: weight > 0,
      }}
    />
  );
};

/** Permanent state names for dashboard overview — anchored at curated label points. */
const IndiaCleanStateLabels: React.FC<{
  states: GeoJSON.FeatureCollection;
  zoom: number;
}> = ({ states, zoom }) => (
  <>
    {states.features.map((feature, idx) => {
      const ll = stateLabelLatLng(feature);
      if (!ll) return null;
      const name = stateMapLabel(feature) || 'State';
      const ap = isAndhraPradesh(feature);
      const area = Number(
        (feature.properties as { area_deg2?: number } | null)?.area_deg2 ?? 0
      );
      const tier = cleanOverviewLabelTier(zoom, { ap, areaDeg2: area });
      const icon = new DivIcon({
        className: `india-state-name-marker india-state-name-marker--${tier}${
          ap ? ' india-state-name-marker--ap' : ''
        }`,
        html: `<span class="india-state-name-marker__text">${name
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      return (
        <Marker
          key={`clean-label-${name}-${idx}`}
          position={ll}
          icon={icon}
          interactive={false}
          keyboard={false}
        />
      );
    })}
  </>
);

const IndiaStatesLayer: React.FC<{
  states: GeoJSON.FeatureCollection;
  apFocused?: boolean;
  onApStateFocus?: () => void;
  /** Outline-only so satellite / hybrid imagery stays readable nationwide. */
  imageryBasemap?: boolean;
  /** Dashboard India overview: beige fills, visible borders, aligned state names. */
  politicalClean?: boolean;
  /** Soft cyan fill over Andhra when focused. */
  highlightApFill?: boolean;
  /** Flat neighbor states (name only) when AP is the focus frame. */
  simplifyNeighbors?: boolean;
  /** Omit the Andhra Pradesh name pill. */
  hideApStateLabel?: boolean;
  /** Only AP keeps a permanent label; neighbors are hover-only. */
  apOnlyPermanentStateLabels?: boolean;
  statePick?: 'pick' | 'pass';
  onStatePick?: (feature: GeoJSON.Feature, name: string) => void;
  selectedStateName?: string | null;
}> = ({
  states,
  apFocused = false,
  onApStateFocus,
  imageryBasemap = false,
  politicalClean = false,
  highlightApFill = true,
  simplifyNeighbors = false,
  hideApStateLabel = false,
  apOnlyPermanentStateLabels = false,
  statePick,
  onStatePick,
  selectedStateName = null,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [map]);

  return (
    <>
      <GeoJSON
        key={`india-states-${apFocused ? 'ap' : 'in'}-${highlightApFill ? 'fill' : 'outline'}-${simplifyNeighbors ? 'simple' : 'full'}-${hideApStateLabel ? 'noap' : 'ap'}-${apOnlyPermanentStateLabels ? 'aponly' : 'alllbl'}-${politicalClean ? 'clean' : `z${zoom.toFixed(0)}-${imageryBasemap ? 'sat' : 'vec'}`}-${statePick ?? 'drill'}-${selectedStateName ?? ''}`}
        pane="admin-vectors"
        data={states}
        style={(feature) => {
          const ap = isAndhraPradesh(feature);
          const name = stateDisplayName(feature);
          const selected = Boolean(selectedStateName && name === selectedStateName);
          const picking = statePick === 'pick';
          // Clean overview: clear, uniform internal borders; AP keeps stronger highlight.
          const base = politicalClean
            ? {
                color: ap ? '#9a3412' : '#57534e',
                weight: ap ? 2.1 : 1.15,
                fillColor: ap ? '#e8c98a' : '#efe6d0',
                fillOpacity: 1,
                opacity: 1,
                lineJoin: 'round' as const,
                lineCap: 'round' as const,
              }
            : simplifyNeighbors
              ? {
                  color: ap ? '#0f2942' : '#94a3b8',
                  weight: ap ? 2.6 : 1.1,
                  fillColor: ap ? '#ffffff' : '#e2e8f0',
                  fillOpacity: ap ? 0 : 1,
                  opacity: 1,
                  lineJoin: 'round' as const,
                  lineCap: 'round' as const,
                }
            : imageryBasemap
              ? {
                  color: selected ? '#fef08a' : ap ? '#0f2942' : '#cbd5e1',
                  weight: selected ? 2.8 : ap ? (apFocused ? 2.8 : 1.8) : 0.6,
                  // Keep a near-invisible fill so hover tooltips work on Esri satellite
                  // (outline-only paths are almost impossible to hit).
                  fill: true,
                  fillColor: ap ? '#93c5fd' : '#ffffff',
                  fillOpacity:
                    ap && apFocused && highlightApFill
                      ? 0.32
                      : picking
                        ? 0.08
                        : 0.01,
                  opacity: selected ? 1 : ap ? 0.98 : 0.45,
                }
              : {
                  color: selected ? '#ca8a04' : ap ? '#0f2942' : '#64748b',
                  weight: selected ? 2.8 : ap ? (apFocused ? 2.8 : 2.1) : 0.95,
                  fillColor: ap ? (highlightApFill ? '#93c5fd' : '#ffffff') : '#f1f5f9',
                  fillOpacity: ap
                    ? highlightApFill
                      ? apFocused
                        ? 0.34
                        : 0.22
                      : 0
                    : 0.08,
                  opacity: 1,
                };
          if (statePick === 'pick') {
            return { ...base, interactive: true, className: 'india-state-pick-hit' };
          }
          if (statePick === 'pass') {
            return { ...base, interactive: false };
          }
          return base;
        }}
        onEachFeature={(feature, layer) => {
          const name = stateDisplayName(feature) || 'State';
          const ap = isAndhraPradesh(feature);
          const area = Number(
            (feature.properties as { area_deg2?: number } | null)?.area_deg2 ?? 99
          );
          if (hideApStateLabel && ap) {
            // NDPS heat map: keep neighbor names, drop the AP pill.
          } else if (politicalClean) {
            // Hover still shows full official name; permanent labels use map anchors.
            layer.bindTooltip(name, {
              sticky: true,
              direction: 'top',
              opacity: 0.96,
              className: ap
                ? 'india-state-label india-state-label--hover india-state-label--ap'
                : 'india-state-label india-state-label--hover',
            });
            // Prevent the thick black SVG focus rectangle on click.
            layer.on('add', () => {
              const el = (layer as L.Path).getElement?.();
              el?.setAttribute('focusable', 'false');
              if (el instanceof SVGElement) el.style.outline = 'none';
            });
            layer.on('click', () => {
              const el = (layer as L.Path).getElement?.();
              if (el instanceof HTMLElement) el.blur();
              else if (el instanceof SVGElement) (el as SVGElement & { blur?: () => void }).blur?.();
            });
          } else {
            const showPermanent = apOnlyPermanentStateLabels
              ? ap
              : simplifyNeighbors && !ap
                ? true
                : shouldShowPermanentStateLabel(zoom, {
                    ap,
                    areaDeg2: area,
                    name,
                  });
            if (showPermanent) {
              layer.bindTooltip(name, {
                permanent: true,
                direction: 'center',
                className: ap
                  ? 'india-state-label india-state-label--ap'
                  : 'india-state-label',
                opacity: 1,
              });
            } else {
              layer.bindTooltip(name, {
                sticky: true,
                direction: 'top',
                opacity: 0.96,
                className: ap
                  ? 'india-state-label india-state-label--hover india-state-label--ap'
                  : 'india-state-label india-state-label--hover',
              });
            }
          }
          if (statePick === 'pick' && onStatePick) {
            layer.on('click', (e) => {
              L.DomEvent.stop(e);
              onStatePick(feature, name);
            });
            return;
          }
          if (!statePick && ap && !apFocused && onApStateFocus) {
            layer.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              onApStateFocus();
            });
            if (layer instanceof L.Path) {
              layer.setStyle({ className: 'india-state-ap-hit' });
            }
          }
        }}
      />
      {politicalClean && <IndiaCleanStateLabels states={states} zoom={zoom} />}
    </>
  );
};

const Graticule: React.FC = () => {
  const lines = useMemo(() => {
    const result: LatLngExpression[][] = [];
    for (let lat = 12.5; lat <= 19.5; lat += 0.5) {
      result.push([
        [lat, 76.5],
        [lat, 85],
      ]);
    }
    for (let lon = 76.5; lon <= 85; lon += 0.5) {
      result.push([
        [12.5, lon],
        [19.5, lon],
      ]);
    }
    return result;
  }, []);
  return (
    <>
      {lines.map((latlngs, i) => (
        <Polyline
          key={`grat-${i}`}
          positions={latlngs}
          pathOptions={{ color: '#64748b', weight: 0.6, opacity: 0.45, dashArray: '2 4' }}
        />
      ))}
    </>
  );
};

/**
 * Isolates a single Leaflet overlay crash so the workspace shell stays up
 * (classic symptom: Cannot read properties of undefined (reading 'appendChild')).
 */
class LeafletLayerErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string | number },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[LeafletLayerErrorBoundary]', error.message, info.componentStack);
  }

  componentDidUpdate(prevProps: { resetKey?: string | number }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

type MapCameraSnapshot = {
  zoom: number;
  west: number;
  south: number;
  east: number;
  north: number;
  token: number;
};

function useMapCameraSnapshot(): MapCameraSnapshot {
  const map = useMap();
  const [snap, setSnap] = useState<MapCameraSnapshot>(() => {
    const b = map.getBounds();
    return {
      zoom: map.getZoom(),
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
      token: 0,
    };
  });
  const refresh = () => {
    const b = map.getBounds();
    setSnap((prev) => ({
      zoom: map.getZoom(),
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
      token: prev.token + 1,
    }));
  };
  useMapEvents({ zoomend: refresh, moveend: refresh });
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return snap;
}

/** Viewport-filter + zoom gate + feature cap + local error boundary for dense road GeoJSON. */
const SafeHeavyRoadGeoJSON: React.FC<{
  data: GeoJSON.FeatureCollection;
  style: L.PathOptions | ((feature?: GeoJSON.Feature) => L.PathOptions);
  onEachFeature?: (feature: GeoJSON.Feature, layer: L.Layer) => void;
  layerKey: string;
}> = ({ data, style, onEachFeature, layerKey }) => {
  const cam = useMapCameraSnapshot();
  const prepared = useMemo(
    () =>
      prepareHeavyRoadFc(data, cam.zoom, {
        west: cam.west,
        south: cam.south,
        east: cam.east,
        north: cam.north,
      }),
    [data, cam.zoom, cam.west, cam.south, cam.east, cam.north]
  );
  if (!prepared) return null;
  const resetKey = `${layerKey}:${prepared.features.length}:${cam.west.toFixed(2)}:${cam.zoom}`;
  return (
    <LeafletLayerErrorBoundary resetKey={resetKey}>
      <GeoJSON
        key={resetKey}
        data={prepared}
        style={style as never}
        onEachFeature={onEachFeature}
      />
    </LeafletLayerErrorBoundary>
  );
};

const SafeIndianRailwayLayer: React.FC<{ data: GeoJSON.FeatureCollection }> = ({ data }) => {
  const cam = useMapCameraSnapshot();
  const prepared = useMemo(
    () =>
      prepareHeavyRoadFc(data, cam.zoom, {
        west: cam.west,
        south: cam.south,
        east: cam.east,
        north: cam.north,
      }),
    [data, cam.zoom, cam.west, cam.south, cam.east, cam.north]
  );
  if (!prepared) return null;
  const resetKey = `rail:${prepared.features.length}:${cam.west.toFixed(2)}:${cam.zoom}`;
  return (
    <LeafletLayerErrorBoundary resetKey={resetKey}>
      <IndianRailwayLayer data={prepared} />
    </LeafletLayerErrorBoundary>
  );
};

/** Bbox-clipped PostGIS roads (full network / VSP) — never load statewide GeoJSON. */
const PostgisBboxRoadLayer: React.FC<{
  layer: GisPostgisRoadLayer;
  enabled: boolean;
  color: string;
  weight: number;
  label: string;
  clipFeature?: GeoJSON.Feature | null;
  /** Routing-only: classify NH/SH/district + soft-cap. Other modules draw bbox result as-is. */
  roadVectorSafety?: boolean;
  /** Roads Routing: fetch/draw at every zoom (user accepts clutter). */
  alwaysOn?: boolean;
  /** Opt-in (Roads Routing New): replace admin clip with corridor filter. */
  filterLayers?: (fc: GeoJSON.FeatureCollection) => GeoJSON.FeatureCollection;
}> = ({
  layer,
  enabled,
  color,
  weight,
  label,
  clipFeature = null,
  roadVectorSafety = false,
  alwaysOn = false,
  filterLayers,
}) => {
  const map = useMap();
  const [bbox, setBbox] = useState<{
    west: number;
    south: number;
    east: number;
    north: number;
  } | null>(null);

  const refresh = () => {
    if (!enabled) {
      setBbox(null);
      return;
    }
    const b = map.getBounds();
    let bounds = {
      west: b.getWest(),
      south: b.getSouth(),
      east: b.getEast(),
      north: b.getNorth(),
    };
    // Corridor filter: fetch the pin AOI, not India-wide LIMIT samples that miss the spine.
    if (filterLayers && clipFeature) {
      const env = featureBbox(clipFeature);
      if (env) {
        const [west, south, east, north] = env;
        const hit = {
          west: Math.max(west, bounds.west),
          south: Math.max(south, bounds.south),
          east: Math.min(east, bounds.east),
          north: Math.min(north, bounds.north),
        };
        bounds =
          hit.west < hit.east && hit.south < hit.north
            ? hit
            : { west, south, east, north };
      }
    }
    // Default modules: skip India-wide cameras. Roads Routing alwaysOn bypasses this.
    if (!alwaysOn && !mapAllowsHeavyRoadVectors(map.getZoom(), bounds)) {
      setBbox(null);
      return;
    }
    setBbox(bounds);
  };
  useMapEvents({ moveend: refresh, zoomend: refresh });
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled, alwaysOn, filterLayers, clipFeature]);

  const fc = useGisPostgisRoadBbox(
    layer,
    enabled,
    bbox,
    0.05,
    alwaysOn || filterLayers ? 25000 : roadVectorSafety ? HEAVY_ROAD_MAX_FEATURES : 12000
  );
  const clipped = useMemo(() => {
    if (!fc) return fc;
    if (filterLayers) return filterLayers(fc);
    return filterCollectionToParent(fc, clipFeature) ?? fc;
  }, [fc, clipFeature, filterLayers]);
  const zoom = map.getZoom();
  const prepared = useMemo(() => {
    if (!enabled || !bbox || !clipped?.features.length) return null;
    // Full / VSP: always classify + soft-cap. alwaysOn used to return raw extracts
    // (~10k+ village tracks) and crash Leaflet SVG (appendChild).
    if (layer === 'full' || layer === 'vsp') {
      if (alwaysOn || filterLayers) {
        return prepareClassifiedRoadFc(clipped, HEAVY_ROAD_MAX_FEATURES);
      }
      if (!roadVectorSafety) return clipped;
      return preparePostgisFullNetworkFc(clipped, zoom, bbox);
    }
    if (alwaysOn || !roadVectorSafety) return clipped;
    return prepareHeavyRoadFc(clipped, zoom, bbox);
  }, [enabled, bbox, clipped, layer, zoom, roadVectorSafety, alwaysOn, filterLayers]);
  if (!prepared) return null;
  const resetKey = `${layer}-${prepared.features.length}-${bbox!.west.toFixed(3)}-${alwaysOn ? 'a' : roadVectorSafety ? 's' : 'n'}-${filterLayers ? 'f' : 'n'}`;
  return (
    <LeafletLayerErrorBoundary resetKey={resetKey}>
      <GeoJSON
        key={resetKey}
        data={prepared}
        style={(feature) => {
          if (layer === 'full' || layer === 'vsp') {
            const stroke = routeStrokeForProperties(feature?.properties ?? null);
            return {
              color: stroke?.color ?? color,
              weight: alwaysOn ? Math.max(weight, stroke?.weight ?? weight) : stroke?.weight ?? weight,
              opacity: alwaysOn ? 1 : 0.88,
              fill: false,
            };
          }
          if (alwaysOn || !roadVectorSafety) {
            return { color, weight, opacity: alwaysOn ? 1 : 0.82, fill: false };
          }
          const stroke = routeStrokeForProperties(feature?.properties ?? null);
          return {
            color: stroke?.color ?? color,
            weight: stroke?.weight ?? weight,
            opacity: 0.88,
            fill: false,
          };
        }}
        onEachFeature={(feature, lyr) => bindNamedTooltip(feature, lyr, label)}
      />
    </LeafletLayerErrorBoundary>
  );
};

export const ApLeafletMap = forwardRef<ApLeafletMapHandle, ApLeafletMapProps>(function ApLeafletMap(
  {
    basemap,
    cleanIndiaOverview = false,
    showStateBorder = true,
    showDistricts = true,
    districtOpacity = 1,
    stateOpacity = 1,
    choropleth: _choropleth = false,
    showHighways = false,
    showApRoadsFull = false,
    showOpsVspRoads = false,
    showApRoadsMajor = false,
    roadVectorSafety = false,
    roadNetworkAlwaysOn = false,
    filterMapLayers,
    layerClipFeature = null,
    suppressUnclippedRoadTiles = false,
    showAgencyRoutes = false,
    showRailways = false,
    showGraticule = false,
    showBorderPs = false,
    showTalukGis = false,
    showVspVillagePts = false,
    showRivers = false,
    showWaterbodies = false,
    showHillshade = false,
    showTrails = false,
    showPlaces = false,
    showMandals = false,
    showVillages = false,
    showPoliceStations = false,
    mandalOpacity = 1,
    villageOpacity = 1,
    policeStationOpacity = 1,
    selectedPoliceStationId,
    showImageryOverlay = false,
    autoSatelliteOverlay = true,
    showGoogleRoadmap = false,
    showSoiTopo = false,
    showDistrictsGisHist = false,
    showStateGisHist = false,
    highlightAgency = false,
    showAsrBoundary = false,
    showHotspots = false,
    showCheckPosts = false,
    showTollPlazas = false,
    showGanjaSeized = false,
    showPharmaHubs = false,
    showDdacs = false,
    showEntryExit = false,
    entryExitTypeLabels = false,
    showStockPoints = false,
    showOpsMainRoads = false,
    showOpsInternalRoads = false,
    markers = [],
    digitizedFeatures = [],
    ingestedLayers = [],
    draftPoints = [],
    draftType = 'Point',
    route = [],
    overlayRoutes = [],
    geoJsonOverlays = [],
    measurePoints = [],
    measureMode = null,
    bufferRings = [],
    droppedPin,
    clickMode = 'inspect',
    onMapClick,
    onMarkerClick,
    onApStateFocus,
    onDistrictClick,
    onMandalClick,
    onVillageClick,
    onPoliceStationClick,
    onViewChange,
    onCursorMove,
    className = '',
    initialZoom = INDIA_DEFAULT_ZOOM,
    initialCenter = INDIA_CENTER,
    interactive = true,
    adminHoverIdentify = true,
    highlightApFill = true,
    maskOutsideAp = false,
    maskOutsideDrill = true,
    autoAdminOverlays = true,
    hideApStateLabel = false,
    apOnlyPermanentStateLabels = false,
    showScale = true,
    showAttribution = true,
    layoutRevision = 0,
    fitToState = false,
    adminDrill = null,
    viewTarget,
    boundsView = null,
    indiaStatePick,
    onIndiaStatePick,
    selectedIndiaStateName = null,
    viewActive = true,
  },
  ref
) {
  const { districts, state, ready } = useApBoundaries();
  const { states: indiaStates, outline: indiaOutline, ready: indiaReady } = useIndiaStates();
  const { highways, rivers, water } = useApNetwork();
  const apFocused = isApStateFocus(adminDrill);
  const indiaOverview = isIndiaOverview(adminDrill);
  /** Dashboard-only white political India (before AP click). */
  const politicalClean = Boolean(cleanIndiaOverview && indiaOverview);
  const {
    taluk: talukGis,
    vspVillages,
    borderPs,
    soiGrid,
    rail: railVector,
    roadsMajor,
    districtsHist,
    stateHist,
  } = useGisSourceAdmin({
    showTaluk: showTalukGis,
    showVspVillages: showVspVillagePts,
    showBorderPs,
    showSoiGrid: showGraticule,
    showRailVector: showRailways,
    showRoadsMajor: showApRoadsMajor,
    showDistrictsHist: showDistrictsGisHist,
    showStateHist: showStateGisHist,
  });
  const asrOn = showAsrBoundary || highlightAgency;
  const {
    asrBoundary,
    pharmaHubs,
    checkPosts,
    dRoutes,
    ddacs,
    entryExit,
    ganjaSeized,
    hotspots: opsHotspots,
    footTracks,
    internalRoads,
    mainRoads,
    stockPoints,
    tollPlazas,
  } = useGisSourceOps({
    showAsrBoundary: asrOn,
    showPharmaHubs,
    showCheckPosts,
    showDRoutes: showAgencyRoutes,
    showDdacs,
    showEntryExit,
    showGanjaSeized,
    showHotspots,
    showFootTracks: showTrails,
    showInternalRoads: showOpsInternalRoads,
    showMainRoads: showOpsMainRoads,
    showStockPoints,
    showTollPlazas,
  });
  const drillLevel = adminDrill?.level ?? 'state';
  const drillActive = drillLevel !== 'state';
  const showMandalsEffective =
    (autoAdminOverlays && shouldDrawMandals(drillLevel)) || showMandals;
  const showVillagesEffective =
    (autoAdminOverlays && shouldDrawVillages(drillLevel)) || showVillages;
  // India overview: no districts. AP state focus: districts visible for next-level pick (no isolation).
  // Deeper drill: isolation as before. Atlas (autoAdminOverlays=false) follows Eye flags only.
  const showDistrictsEffective = autoAdminOverlays
    ? drillActive
      ? drillLevel === 'district' || showDistricts
      : apFocused
    : showDistricts;
  const districtData =
    districts && drillActive && adminDrill?.districtFeature
      ? asFeatureCollection([adminDrill.districtFeature])
      : districts;
  const adminClip = adminDrill ? drillFocusFeature(adminDrill) : null;
  /** Camera / drill clip — never use Routing New corridor here (keeps viewTarget/boundsView). */
  const clipFeature = adminClip;
  const clipStations = layerClipFeature ?? adminClip;
  const corridorFilterActive = Boolean(filterMapLayers && layerClipFeature);
  const corridorRevision = corridorFilterActive
    ? `${layerClipFeature?.properties?.pins ?? 0}:${Number((layerClipFeature?.properties as { halfWidthKm?: number } | null)?.halfWidthKm ?? 0)}`
    : 'off';
  const layerClip = useMemo(
    () => (fc: GeoJSON.FeatureCollection | null | undefined) => {
      if (!fc) return null;
      if (filterMapLayers) return filterMapLayers(fc);
      return filterCollectionToParent(fc, adminClip);
    },
    [filterMapLayers, adminClip]
  );
  const highwaysClipped = useMemo(() => layerClip(highways), [layerClip, highways]);
  const riversClipped = useMemo(() => layerClip(rivers), [layerClip, rivers]);
  const waterClipped = useMemo(() => layerClip(water), [layerClip, water]);
  const talukGisClipped = useMemo(() => layerClip(talukGis), [layerClip, talukGis]);
  const borderPsClipped = useMemo(() => layerClip(borderPs), [layerClip, borderPs]);
  const vspVillagesClipped = useMemo(() => layerClip(vspVillages), [layerClip, vspVillages]);
  const soiGridClipped = useMemo(() => layerClip(soiGrid), [layerClip, soiGrid]);
  const railVectorClipped = useMemo(() => layerClip(railVector), [layerClip, railVector]);
  const roadsMajorClipped = useMemo(() => layerClip(roadsMajor), [layerClip, roadsMajor]);
  const districtsHistClipped = useMemo(() => layerClip(districtsHist), [layerClip, districtsHist]);
  const stateHistClipped = useMemo(() => layerClip(stateHist), [layerClip, stateHist]);
  const asrBoundaryClipped = useMemo(() => layerClip(asrBoundary), [layerClip, asrBoundary]);
  const pharmaHubsClipped = useMemo(() => layerClip(pharmaHubs), [layerClip, pharmaHubs]);
  const checkPostsClipped = useMemo(() => layerClip(checkPosts), [layerClip, checkPosts]);
  const dRoutesClipped = useMemo(() => layerClip(dRoutes), [layerClip, dRoutes]);
  const ddacsClipped = useMemo(() => layerClip(ddacs), [layerClip, ddacs]);
  const entryExitClipped = useMemo(() => layerClip(entryExit), [layerClip, entryExit]);
  const ganjaSeizedClipped = useMemo(() => layerClip(ganjaSeized), [layerClip, ganjaSeized]);
  const opsHotspotsClipped = useMemo(() => layerClip(opsHotspots), [layerClip, opsHotspots]);
  const footTracksClipped = useMemo(() => layerClip(footTracks), [layerClip, footTracks]);
  const internalRoadsClipped = useMemo(() => layerClip(internalRoads), [layerClip, internalRoads]);
  const mainRoadsClipped = useMemo(() => layerClip(mainRoads), [layerClip, mainRoads]);
  const stockPointsClipped = useMemo(() => layerClip(stockPoints), [layerClip, stockPoints]);
  const tollPlazasClipped = useMemo(() => layerClip(tollPlazas), [layerClip, tollPlazas]);
  const stateBorderClipped = useMemo(() => layerClip(state), [layerClip, state]);
  const rasterId: RasterBasemapId = basemap === 'maplibre' ? 'vector' : basemap;
  const tiles = BASEMAP_TILES[rasterId];
  const useMapLibre = basemap === 'maplibre';
  /**
   * Satellite/hybrid: Esri World Imagery statewide (no GIS-Source sat AOI rectangles).
   * Topo: OSM underlay + GIS-Source SOI AOI overlays (coverage is local).
   */
  const gisSatBasemap = rasterId === 'satellite' || rasterId === 'hybrid';
  const gisTopoBasemap = rasterId === 'topo';
  const gisRasterBasemap = gisSatBasemap || gisTopoBasemap;
  /** India overview: label-free underlay so OSM/Carto city names do not fight state tooltips. */
  const underlayTiles =
    indiaOverview && !useMapLibre && rasterId === 'vector'
      ? INDIA_OVERVIEW_UNDERLAY_TILES
      : gisTopoBasemap
        ? BASEMAP_TILES.vector
        : tiles;
  const underlayOpacity = gisTopoBasemap ? 0.35 : 1;
  const controllerRef = React.useRef<ApLeafletMapHandle>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom) => controllerRef.current?.flyTo(lat, lon, zoom),
    fitState: () => controllerRef.current?.fitState(),
    fitFeature: (feature) => controllerRef.current?.fitFeature(feature),
    zoomIn: () => controllerRef.current?.zoomIn(),
    zoomOut: () => controllerRef.current?.zoomOut(),
    getView: () => controllerRef.current?.getView() ?? null,
  }));

  const districtStyle = (_feature?: GeoJSON.Feature) => ({
    color: '#0f2942',
    weight: drillActive ? 0.8 : apFocused ? 1.15 : 1.4,
    fillColor: highlightApFill ? '#93c5fd' : '#0f2942',
    fillOpacity: drillActive
      ? 0
      : highlightApFill
        ? apFocused
          ? 0.04 * districtOpacity
          : 0.05 * districtOpacity
        : 0,
    opacity: districtOpacity,
  });

  const bindOpsName =
    (fallback: LayerNameFallback = 'Feature') =>
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      bindNamedTooltip(feature, layer, fallback);
    };

  const pointCircle =
    (color: string, radius = 6) =>
    (_feature: GeoJSON.Feature, latlng: L.LatLng) =>
      L.circleMarker(latlng, {
        radius,
        color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.85,
      });

  const draftLatLngs = draftPoints.map((p) => [p.lat, p.lon] as LatLngExpression);
  const measureLatLngs = measurePoints.map((p) => [p.lat, p.lon] as LatLngExpression);
  const routeLatLngs = route.map((p) => [p.lat, p.lon] as LatLngExpression);

  return (
    <div
      className={`ap-leaflet-root ${drillActive ? 'is-admin-drill' : ''} ${politicalClean ? 'is-political-clean' : ''} ${className}`}
    >
      <MapContainer
        key={politicalClean ? 'political-clean' : 'basemap'}
        center={initialCenter}
        zoom={initialZoom}
        minZoom={MAP_CAMERA_MIN_ZOOM}
        maxZoom={MAP_CAMERA_MAX_ZOOM}
        maxBounds={INDIA_MAX_BOUNDS}
        maxBoundsViscosity={0.9}
        zoomSnap={0}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={80}
        zoomControl={false}
        attributionControl={!politicalClean && showAttribution}
        worldCopyJump={false}
        keyboard={interactive}
        boxZoom={false}
        style={{
          height: '100%',
          width: '100%',
          background: politicalClean ? '#ffffff' : undefined,
        }}
        dragging={interactive}
        inertia={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        bounceAtZoomLimits={false}
      >
        <AdminClipPanes />
        {!politicalClean && useMapLibre && (
          <MapLibreBasemap
            viewSync={`${adminDrill?.level ?? 'state'}:${adminDrill?.districtName ?? ''}:${adminDrill?.mandalName ?? ''}:${adminDrill?.villageName ?? ''}`}
          />
        )}
        {!politicalClean && !useMapLibre && (
          <TileLayer
            key={`basemap-tiles-${rasterId}-${underlayTiles.url}`}
            attribution={
              gisRasterBasemap
                ? `${underlayTiles.attribution} · GIS-Source Raster overlays`
                : underlayTiles.attribution
            }
            url={underlayTiles.url}
            opacity={underlayOpacity}
            {...leafletOverzoom(underlayTiles.maxZoom)}
          />
        )}
        {!politicalClean && rasterId === 'hybrid' && !useMapLibre && tiles.labelsUrl && (
          <TileLayer url={tiles.labelsUrl} pane="overlayPane" {...leafletOverzoom(tiles.maxZoom)} />
        )}
        {!politicalClean && (
          <GisSourceRasterOverlays
            rasterId={rasterId}
            drillLevel={drillLevel}
            showImageryOverlay={showImageryOverlay}
            autoSatelliteOverlay={autoSatelliteOverlay}
            showHillshade={showHillshade}
            showGoogleRoadmap={showGoogleRoadmap}
            showSoiTopo={showSoiTopo}
          />
        )}
        {!politicalClean && (
          <ZoomAwareDetailStack
            useMapLibre={useMapLibre}
            rasterId={rasterId}
            drillActive={drillActive}
            drillLevel={drillLevel}
            showImageryOverlay={showImageryOverlay && autoSatelliteOverlay}
            showHighways={
              showHighways && !(suppressUnclippedRoadTiles || corridorFilterActive)
            }
            showPlaces={showPlaces}
          />
        )}
        {!politicalClean && (
          <AdminHoverIdentify adminDrill={adminDrill} enabled={adminHoverIdentify} />
        )}
        {!politicalClean && showGraticule && soiGridClipped && soiGridClipped.features.length > 0 && (
          <GeoJSON
            data={soiGridClipped}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 4,
                color: '#78716c',
                weight: 1,
                fillColor: '#a8a29e',
                fillOpacity: 0.85,
              })
            }
            onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'SOI Map No')}
          />
        )}
        {!politicalClean && showGraticule && (!soiGridClipped || soiGridClipped.features.length === 0) && (
          <Graticule />
        )}
        {!politicalClean && showStateGisHist && stateHistClipped && stateHistClipped.features.length > 0 && (
          <GeoJSON
            data={stateHistClipped}
            style={{
              color: '#9a3412',
              weight: 2.2,
              fill: false,
              opacity: 0.9,
              dashArray: '6 4',
            }}
            onEachFeature={(feature, layer) => {
              const name = (feature.properties as { NAME_1?: string } | null)?.NAME_1;
              layer.bindTooltip(name ? `${name} (GIS-Source undivided)` : 'GIS-Source AP state', {
                sticky: true,
                direction: 'top',
                opacity: 0.96,
              });
            }}
          />
        )}
        {!politicalClean && showDistrictsGisHist && districtsHistClipped && districtsHistClipped.features.length > 0 && (
          <GeoJSON
            data={districtsHistClipped}
            style={{
              color: '#b45309',
              weight: 1,
              fillColor: '#f59e0b',
              fillOpacity: 0.12,
              opacity: 0.85,
            }}
            onEachFeature={(feature, layer) => {
              const props = (feature.properties ?? {}) as Record<string, unknown>;
              const base = formatFeatureTooltip(props, 'District');
              layer.bindTooltip(`${base} · pre-2014`, {
                sticky: true,
                direction: 'top',
                opacity: 0.96,
              });
            }}
          />
        )}
        {!politicalClean && showTalukGis && talukGisClipped && (
          <GeoJSON
            data={talukGisClipped}
            style={{ color: '#475569', weight: 0.9, fillColor: '#94a3b8', fillOpacity: 0.12 }}
            onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'Taluk')}
          />
        )}
        {!politicalClean && showBorderPs && borderPsClipped && (
          <GeoJSON
            data={borderPsClipped}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 4,
                color: '#0f766e',
                weight: 1.2,
                fillColor: '#14b8a6',
                fillOpacity: 0.9,
              })
            }
            onEachFeature={(feature, layer) =>
              bindNamedTooltip(feature, layer, 'Border Police Station')
            }
          />
        )}
        {!politicalClean && showVspVillagePts && vspVillagesClipped && (
          <GeoJSON
            data={vspVillagesClipped}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 2.2,
                color: '#64748b',
                weight: 0.6,
                fillColor: '#cbd5e1',
                fillOpacity: 0.85,
              })
            }
            onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'Village')}
          />
        )}
        {!politicalClean && waterClipped && showWaterbodies && (
          <GeoJSON
            data={waterClipped}
            style={{ color: '#0e7490', weight: 0.8, fillColor: '#38bdf8', fillOpacity: 0.28 }}
            onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'Water body')}
          />
        )}
        {!politicalClean && riversClipped && showRivers && (
          <GeoJSON
            data={riversClipped}
            style={{ color: '#1565c0', weight: 1.6, opacity: 0.75 }}
            onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'River')}
          />
        )}
        {indiaReady && indiaStates && !drillActive && (
          <IndiaStatesLayer
            states={indiaStates}
            apFocused={apFocused}
            imageryBasemap={!politicalClean && gisSatBasemap}
            politicalClean={politicalClean}
            highlightApFill={highlightApFill}
            simplifyNeighbors={maskOutsideAp}
            hideApStateLabel={hideApStateLabel}
            apOnlyPermanentStateLabels={apOnlyPermanentStateLabels}
            onApStateFocus={indiaStatePick ? undefined : indiaOverview ? onApStateFocus : undefined}
            statePick={indiaStatePick}
            onStatePick={onIndiaStatePick}
            selectedStateName={selectedIndiaStateName}
          />
        )}
        {politicalClean && indiaReady && indiaOutline && (
          <GeoJSON
            key="india-outer-boundary-clean"
            pane="admin-vectors"
            data={indiaOutline}
            style={{
              color: '#292524',
              weight: 2.2,
              fill: false,
              opacity: 1,
              interactive: false,
              lineJoin: 'round',
              lineCap: 'round',
            }}
            interactive={false}
          />
        )}
        {!politicalClean &&
          ready &&
          stateBorderClipped &&
          showStateBorder &&
          drillActive &&
          stateBorderClipped.features.length > 0 && (
          <GeoJSON
            data={stateBorderClipped}
            style={{ color: '#001428', weight: 1.5, fill: false, opacity: stateOpacity }}
            onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'State')}
          />
        )}
        <AdminClipMask
          key={`clip-${adminDrill?.level ?? 'state'}-${adminDrill?.villageName ?? adminDrill?.mandalName ?? adminDrill?.districtName ?? 'none'}-${politicalClean ? 'w' : 'b'}-${maskOutsideAp ? 'apmask' : 'in'}-${highlightApFill ? 'c' : 'n'}-${maskOutsideDrill ? 'dm' : 'dn'}`}
          feature={
            (maskOutsideDrill ? clipFeature : null) ??
            (maskOutsideAp && state?.features[0]
              ? state.features[0]
              : indiaReady
                ? indiaOutline
                : null)
          }
          fillColor={
            politicalClean
              ? '#ffffff'
              : maskOutsideAp
                ? '#e2e8f0'
                : highlightApFill
                  ? '#cfe4f3'
                  : '#e8eef2'
          }
          strokeColor={politicalClean ? '#57534e' : '#0f2942'}
          strokeWeight={politicalClean || maskOutsideAp ? 0 : undefined}
        />
        {!politicalClean && ready && districtData && showDistrictsEffective && (
          <GeoJSON
            key={`districts-${districtOpacity}-${asrOn ? 'asr' : 'std'}-${adminDrill?.districtName ?? 'all'}`}
            pane="admin-vectors"
            data={districtData}
            style={(feature) => {
              const base = districtStyle(feature);
              if (drillLevel === 'district') {
                return { ...base, fillOpacity: 0, weight: 1.6 };
              }
              return base;
            }}
            interactive={!drillActive && adminHoverIdentify}
            onEachFeature={(feature, layer) => {
              if (!adminHoverIdentify) return;
              const name = (feature.properties as ApDistrictProperties).district_name;
              bindNamedTooltip(feature, layer, 'District');
              bindIsolateClick(layer, (e) => {
                onDistrictClick?.(
                  name,
                  e.latlng.lat,
                  e.latlng.lng,
                  isolateChildFeature(feature, [e.latlng.lng, e.latlng.lat])
                );
              });
            }}
          />
        )}
        {!politicalClean && ready && (
          <AdminPolygonLayers
            showMandals={showMandalsEffective}
            showVillages={showVillagesEffective}
            mandalOpacity={mandalOpacity}
            villageOpacity={villageOpacity}
            adminDrill={adminDrill}
            onMandalClick={onMandalClick}
            onVillageClick={onVillageClick}
          />
        )}
        {!politicalClean && (
          <PoliceStationLayer
            enabled={showPoliceStations}
            opacity={policeStationOpacity}
            selectedId={selectedPoliceStationId}
            clipFeature={clipStations}
            onPoliceStationClick={onPoliceStationClick}
          />
        )}
        {!politicalClean && highwaysClipped && showHighways && (
          <GeoJSON
            key={`highways-corridor-${corridorRevision}-${highwaysClipped.features.length}`}
            data={highwaysClipped}
            style={() => ({
              color: roadNetworkAlwaysOn ? '#ef4444' : '#c2410c',
              weight: roadNetworkAlwaysOn ? 3 : 2.6,
              opacity: roadNetworkAlwaysOn ? 1 : 0.95,
            })}
            onEachFeature={(feature, layer) => {
              const props = (feature.properties ?? {}) as Record<string, unknown>;
              const sub = String(props.rd_sub_typ ?? props.name ?? 'National Highway');
              layer.bindTooltip(sub, { sticky: true, direction: 'top', opacity: 0.96 });
            }}
          />
        )}
        {!politicalClean && showApRoadsFull && (
          <PostgisBboxRoadLayer
            layer="full"
            enabled={showApRoadsFull}
            color={roadNetworkAlwaysOn ? '#60a5fa' : '#1e3a8a'}
            weight={roadNetworkAlwaysOn ? 3 : 1.1}
            label="AP Road"
            clipFeature={layerClipFeature ?? clipFeature}
            filterLayers={filterMapLayers}
            roadVectorSafety={roadVectorSafety && !roadNetworkAlwaysOn}
            alwaysOn={roadNetworkAlwaysOn}
          />
        )}
        {!politicalClean && showOpsVspRoads && (
          <PostgisBboxRoadLayer
            layer="vsp"
            enabled={showOpsVspRoads}
            color={roadNetworkAlwaysOn ? '#2dd4bf' : '#0f766e'}
            weight={roadNetworkAlwaysOn ? 3 : 1.4}
            label="VSP Road"
            clipFeature={layerClipFeature ?? clipFeature}
            filterLayers={filterMapLayers}
            roadVectorSafety={roadVectorSafety && !roadNetworkAlwaysOn}
            alwaysOn={roadNetworkAlwaysOn}
          />
        )}
        {!politicalClean && showApRoadsMajor && roadsMajorClipped && (
          roadVectorSafety && !roadNetworkAlwaysOn ? (
            <SafeHeavyRoadGeoJSON
              layerKey={`ap-roads-major-${corridorRevision}-${roadsMajorClipped.features.length}`}
              data={roadsMajorClipped}
              style={(feature) => {
                const rd = String(
                  (feature?.properties as { RD_TYPE?: string; RD_SUB_TYP?: string } | null)?.RD_TYPE ??
                    (feature?.properties as { RD_SUB_TYP?: string } | null)?.RD_SUB_TYP ??
                    ''
                ).toUpperCase();
                const isNh = /\bNH\b|NATIONAL/.test(rd);
                return {
                  color: isNh ? '#c2410c' : '#a16207',
                  weight: isNh ? 2.2 : 1.4,
                  opacity: 0.85,
                };
              }}
              onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'Major Road')}
            />
          ) : (
            <GeoJSON
              key={`ap-roads-major-corridor-${corridorRevision}-${roadsMajorClipped.features.length}`}
              data={roadsMajorClipped}
              style={(feature) => {
                const rd = String(
                  (feature?.properties as { RD_TYPE?: string; RD_SUB_TYP?: string } | null)?.RD_TYPE ??
                    (feature?.properties as { RD_SUB_TYP?: string } | null)?.RD_SUB_TYP ??
                    ''
                ).toUpperCase();
                const isNh = /\bNH\b|NATIONAL/.test(rd);
                return {
                  color: roadNetworkAlwaysOn
                    ? isNh
                      ? '#ef4444'
                      : '#facc15'
                    : isNh
                      ? '#c2410c'
                      : '#a16207',
                  weight: roadNetworkAlwaysOn ? 3 : isNh ? 2.2 : 1.4,
                  opacity: roadNetworkAlwaysOn ? 1 : 0.85,
                };
              }}
              onEachFeature={(feature, layer) => bindNamedTooltip(feature, layer, 'Major Road')}
            />
          )
        )}
        {!politicalClean && showOpsMainRoads && mainRoadsClipped && mainRoadsClipped.features.length > 0 && (
          roadVectorSafety && !roadNetworkAlwaysOn ? (
            <SafeHeavyRoadGeoJSON
              layerKey={`ops-main-roads-${corridorRevision}`}
              data={mainRoadsClipped}
              style={{ color: '#9a3412', weight: 2.1, opacity: 0.9 }}
              onEachFeature={bindOpsName('Main Road')}
            />
          ) : (
            <GeoJSON
              key={`ops-main-roads-corridor-${corridorRevision}-${mainRoadsClipped.features.length}`}
              data={mainRoadsClipped}
              style={{
                color: roadNetworkAlwaysOn ? '#fb923c' : '#9a3412',
                weight: roadNetworkAlwaysOn ? 3 : 2.1,
                opacity: roadNetworkAlwaysOn ? 1 : 0.9,
              }}
              onEachFeature={bindOpsName('Main Road')}
            />
          )
        )}
        {!politicalClean && showOpsInternalRoads && internalRoadsClipped && internalRoadsClipped.features.length > 0 && (
          roadVectorSafety && !roadNetworkAlwaysOn ? (
            <SafeHeavyRoadGeoJSON
              layerKey={`ops-internal-roads-${corridorRevision}-${internalRoadsClipped.features.length}`}
              data={internalRoadsClipped}
              style={{
                color: OPS_INTERNAL_ROADS_COLOR,
                weight: OPS_INTERNAL_ROADS_WEIGHT,
                opacity: OPS_INTERNAL_ROADS_OPACITY,
              }}
              onEachFeature={bindOpsName('Internal Road')}
            />
          ) : (
            <GeoJSON
              key={`ops-internal-roads-corridor-${corridorRevision}-${internalRoadsClipped.features.length}`}
              data={internalRoadsClipped}
              style={{
                color: roadNetworkAlwaysOn ? '#a78bfa' : OPS_INTERNAL_ROADS_COLOR,
                weight: roadNetworkAlwaysOn ? 3 : OPS_INTERNAL_ROADS_WEIGHT,
                opacity: roadNetworkAlwaysOn ? 1 : OPS_INTERNAL_ROADS_OPACITY,
              }}
              onEachFeature={bindOpsName('Internal Road')}
            />
          )
        )}
        {!politicalClean && showTrails && footTracksClipped && footTracksClipped.features.length > 0 && (
          roadVectorSafety && !roadNetworkAlwaysOn ? (
            <SafeHeavyRoadGeoJSON
              layerKey={`foot-tracks-${corridorRevision}-${footTracksClipped.features.length}`}
              data={footTracksClipped}
              style={{ color: '#65a30d', weight: 2.2, opacity: 0.95, dashArray: '5 3' }}
              onEachFeature={bindOpsName('Foot Track')}
            />
          ) : (
            <GeoJSON
              key={`foot-tracks-corridor-${corridorRevision}-${footTracksClipped.features.length}`}
              data={footTracksClipped}
              style={{
                color: roadNetworkAlwaysOn ? '#a3e635' : '#65a30d',
                weight: roadNetworkAlwaysOn ? 3 : 2.2,
                opacity: roadNetworkAlwaysOn ? 1 : 0.95,
                dashArray: '5 3',
              }}
              onEachFeature={bindOpsName('Foot Track')}
            />
          )
        )}
        {!politicalClean && showAgencyRoutes && dRoutesClipped && dRoutesClipped.features.length > 0 && (
          roadVectorSafety && !roadNetworkAlwaysOn ? (
            <SafeHeavyRoadGeoJSON
              layerKey="drug-routes"
              data={dRoutesClipped}
              style={{ color: '#ba1a1a', weight: 2.4, dashArray: '7 4', opacity: 0.95 }}
              onEachFeature={bindOpsName('Drug Route')}
            />
          ) : (
            <GeoJSON
              data={dRoutesClipped}
              style={{ color: '#ba1a1a', weight: 2.4, dashArray: '7 4', opacity: 0.95 }}
              onEachFeature={bindOpsName('Drug Route')}
            />
          )
        )}
        {/* Rail above roads: violet casing + dash so IR stays distinct from NH/SH/metal. */}
        {!politicalClean && showRailways && railVectorClipped && railVectorClipped.features.length > 0 && (
          roadVectorSafety && !roadNetworkAlwaysOn ? (
            <SafeIndianRailwayLayer data={railVectorClipped} />
          ) : (
            <IndianRailwayLayer data={railVectorClipped} />
          )
        )}
        {!politicalClean && showRailways && (!railVectorClipped || railVectorClipped.features.length === 0) && (
          <TileLayer
            attribution={OPENRAILWAY_TILES.attribution}
            url={OPENRAILWAY_TILES.url}
            opacity={0.85}
            pane={drillActive ? 'overlayPane' : undefined}
            {...leafletOverzoom(OPENRAILWAY_TILES.maxZoom)}
          />
        )}
        {!politicalClean && asrOn && asrBoundaryClipped && asrBoundaryClipped.features.length > 0 && (
          <GeoJSON
            data={asrBoundaryClipped}
            style={{
              color: '#5b21b6',
              weight: 2,
              fillColor: '#7c3aed',
              fillOpacity: 0.18,
              opacity: 0.95,
            }}
            onEachFeature={bindOpsName('ASR Boundary')}
          />
        )}
        {!politicalClean && showHotspots && opsHotspotsClipped && (
          <OpsHotspotsLayer data={opsHotspotsClipped} clipFeature={clipFeature} />
        )}
        {!politicalClean && showCheckPosts && checkPostsClipped && (
          <CheckPostsLayer data={checkPostsClipped} />
        )}
        {!politicalClean && showTollPlazas && tollPlazasClipped && (
          <GeoJSON
            data={tollPlazasClipped}
            style={{ color: '#0f766e', weight: 1.2, fillColor: '#14b8a6', fillOpacity: 0.35 }}
            pointToLayer={pointCircle('#0f766e', 6)}
            onEachFeature={bindOpsName('Toll Plaza')}
          />
        )}
        {!politicalClean && showGanjaSeized && ganjaSeizedClipped && (
          <GeoJSON
            data={ganjaSeizedClipped}
            pointToLayer={pointCircle('#4338ca', 7)}
            onEachFeature={bindOpsName('Seizure')}
          />
        )}
        {!politicalClean && showPharmaHubs && pharmaHubsClipped && (
          <GeoJSON
            data={pharmaHubsClipped}
            pointToLayer={pointCircle('#a16207', 7)}
            onEachFeature={bindOpsName('Pharma Hub')}
          />
        )}
        {!politicalClean && showDdacs && ddacsClipped && (
          <GeoJSON
            data={ddacsClipped}
            pointToLayer={pointCircle('#7c2d12', 7)}
            onEachFeature={bindOpsName('DDAC')}
          />
        )}
        {!politicalClean && showEntryExit && entryExitClipped && (
          <EntryExitPointsLayer
            data={entryExitClipped}
            typeLabels={entryExitTypeLabels}
            onEachGeneric={bindOpsName('Entry / Exit')}
          />
        )}
        {!politicalClean && showStockPoints && stockPointsClipped && (
          <GeoJSON
            data={stockPointsClipped}
            pointToLayer={pointCircle('#9f1239', 7)}
            onEachFeature={bindOpsName('Stock Point')}
          />
        )}
        {!politicalClean && routeLatLngs.length > 1 && (
          <LeafletLayerErrorBoundary resetKey={`route-${routeLatLngs.length}`}>
            <Polyline positions={routeLatLngs} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.95 }} />
          </LeafletLayerErrorBoundary>
        )}
        {!politicalClean &&
          overlayRoutes
            .filter((r) => r.visible !== false && r.points.length > 1)
            .map((r) => (
              <LeafletLayerErrorBoundary key={r.id} resetKey={`${r.id}-${r.points.length}`}>
                <Polyline
                  positions={r.points.map((p) => [p.lat, p.lon] as LatLngExpression)}
                  pathOptions={{
                    color: r.color,
                    weight: r.weight ?? 4,
                    opacity: r.opacity ?? 0.92,
                    dashArray: r.dashArray,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </LeafletLayerErrorBoundary>
            ))}
        {!politicalClean &&
          geoJsonOverlays
            .filter((o) => o.visible !== false && o.data.features.length > 0)
            .map((o) => (
              <GeoJSON
                key={`gj-${o.id}-${o.data.features.length}`}
                data={o.data}
                interactive={false}
                style={(feature) => {
                  const stroke = o.featureStyle?.(feature as GeoJSON.Feature);
                  const fill = o.fill === true;
                  return {
                    color: stroke?.color ?? o.color,
                    weight: stroke?.weight ?? o.weight ?? 1.6,
                    opacity: o.opacity ?? 0.9,
                    fill,
                    fillOpacity: fill ? (o.fillOpacity ?? 0.2) : 0,
                    lineCap: 'round',
                    lineJoin: 'round',
                  };
                }}
              />
            ))}
        {!politicalClean &&
          (clipFeature
            ? markers.filter((m) => pointInFeature([m.lon, m.lat], clipFeature))
            : markers
          ).map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lon]}
            icon={markerIcon(m.kind, Boolean(m.selected), m.badge, m.heatIntensity)}
            eventHandlers={{ click: () => onMarkerClick?.(m.id) }}
          >
            <Tooltip sticky direction="top" opacity={0.96}>
              <div className="text-[11px] leading-snug">
                <div className="font-semibold">{m.label}</div>
                {m.detail ? <div className="text-slate-600 font-medium">{m.detail}</div> : null}
              </div>
            </Tooltip>
            <Popup>
              <div className="text-xs font-semibold">{m.label}</div>
              {m.detail ? <div className="text-[11px] text-slate-600">{m.detail}</div> : null}
              <div className="font-mono text-[10px] tabular-coord">
                {m.lat.toFixed(4)}° N, {m.lon.toFixed(4)}° E
              </div>
            </Popup>
          </Marker>
        ))}
        {!politicalClean && <IngestedOverlays layers={ingestedLayers} />}
        {!politicalClean &&
          digitizedFeatures.map((df) => {
          const latlngs = df.points.map((p) => [p.lat, p.lon] as LatLngExpression);
          if (df.type === 'Point' && df.points[0]) {
            return (
              <Circle
                key={df.id}
                center={[df.points[0].lat, df.points[0].lon]}
                radius={80}
                pathOptions={{ color: '#090051', fillColor: '#090051', fillOpacity: 0.85 }}
              />
            );
          }
          if (df.type === 'LineString' && latlngs.length > 1) {
            return (
              <Polyline
                key={df.id}
                positions={latlngs}
                pathOptions={{ color: '#090051', weight: 3, dashArray: '5 3' }}
              />
            );
          }
          if (df.type === 'Polygon' && latlngs.length > 2) {
            return (
              <Polygon
                key={df.id}
                positions={latlngs}
                pathOptions={{ color: '#090051', weight: 2, fillColor: '#090051', fillOpacity: 0.2 }}
              />
            );
          }
          return null;
        })}
        {!politicalClean && draftType === 'Polygon' && draftLatLngs.length >= 3 && (
          <Polygon
            positions={draftLatLngs}
            pathOptions={{ color: '#006a61', weight: 2, fillColor: '#006a61', fillOpacity: 0.2 }}
          />
        )}
        {!politicalClean && draftType === 'LineString' && draftLatLngs.length >= 2 && (
          <Polyline positions={draftLatLngs} pathOptions={{ color: '#006a61', weight: 2, dashArray: '4 3' }} />
        )}
        {!politicalClean &&
          draftPoints.map((p, i) => (
            <Circle
              key={`draft-${i}`}
              center={[p.lat, p.lon]}
              radius={40}
              pathOptions={{ color: '#ba1a1a', fillColor: '#ba1a1a', fillOpacity: 1 }}
            />
          ))}
        {!politicalClean && measureMode && measureLatLngs.length >= 2 && (
          measureMode === 'area' && measureLatLngs.length >= 3 ? (
            <Polygon
              positions={measureLatLngs}
              pathOptions={{ color: '#006a61', weight: 2, dashArray: '5 3', fillColor: '#006a61', fillOpacity: 0.16 }}
            />
          ) : (
            <Polyline
              positions={measureLatLngs}
              pathOptions={{ color: '#006a61', weight: 2, dashArray: '5 3' }}
            />
          )
        )}
        {!politicalClean &&
          bufferRings.map((ring) => (
          <Polygon
            key={ring.id}
            positions={geodesicBufferCoordinates(ring.lat, ring.lon, ring.radiusKm).map(
              ([lon, lat]) => [lat, lon] as LatLngExpression
            )}
            pathOptions={{
              color: '#0f766e',
              weight: 1.2,
              dashArray: '4 3',
              fillColor: '#14b8a6',
              fillOpacity: 0.08,
            }}
          >
            <Tooltip sticky>{ring.label}</Tooltip>
          </Polygon>
        ))}
        {!politicalClean && droppedPin && (
          <Marker position={[droppedPin.lat, droppedPin.lon]} icon={markerIcon('city', true)}>
            <Popup>
              <div className="font-mono text-[11px] tabular-coord">
                {droppedPin.lat.toFixed(4)}° N, {droppedPin.lon.toFixed(4)}° E
                {droppedPin.elev != null ? ` • ${droppedPin.elev} m MSL (SRTM)` : ''}
              </div>
            </Popup>
          </Marker>
        )}
        {!politicalClean && showScale && (
          <ScaleControl position="bottomleft" metric imperial={false} />
        )}
        <MapController
          ref={controllerRef}
          onViewChange={onViewChange}
          layoutRevision={layoutRevision}
          fitToState={fitToState}
          clipFeature={clipFeature}
          clipKey={`${viewActive ? 'on' : 'off'}:${adminDrill?.level ?? 'state'}:${adminDrill?.apFocused ? 'ap' : 'in'}:${adminDrill?.districtName ?? ''}:${adminDrill?.mandalName ?? ''}:${adminDrill?.villageName ?? ''}`}
          apFocused={apFocused}
          viewTarget={viewTarget}
          boundsView={boundsView}
          viewActive={viewActive}
        />
        <ClickSink
          mode={clickMode}
          interactive={interactive}
          drillLevel={drillLevel}
          apFocused={apFocused}
          districts={districts}
          onDistrictClick={onDistrictClick}
          onMapClick={onMapClick}
          onCursorMove={onCursorMove}
        />
        <BoxZoomTool enabled={clickMode === 'boxzoom'} />
      </MapContainer>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#d4e6f2]/80 text-xs font-semibold text-primary z-[500]">
          Loading OpenStreetMap administrative boundaries (EPSG:4326)…
        </div>
      )}
    </div>
  );
});
