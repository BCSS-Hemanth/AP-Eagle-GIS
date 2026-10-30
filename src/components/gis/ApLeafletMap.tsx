import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
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
import { MapLibreBasemap } from './MapLibreBasemap';
import { useApBoundaries } from '../../gis/useApBoundaries';
import { useApNetwork } from '../../gis/useApNetwork';
import { useApMandals, useVillagePolygons } from '../../gis/useApAdmin';
import { usePoliceStations } from '../../gis/usePoliceStations';
import type { PoliceStationProperties } from '../../gis/usePoliceStations';
import type { MandalProperties, VillageProperties } from '../../gis/useApAdmin';
import {
  type AdminDrill,
  asFeatureCollection,
  drillFocusFeature,
  featureBbox,
  filterByAdminName,
  filterFeaturesInParent,
  invertMaskLatLngs,
  pointInFeature,
} from '../../gis/adminHierarchy';
import {
  AGENCY_DISTRICT_NAMES,
  AP_BOUNDS,
  AP_CENTER,
  AP_DEFAULT_ZOOM,
  BASEMAP_TILES,
  ESRI_PLACES_TILES,
  ESRI_TRANSPORT_TILES,
  HIKING_TRAIL_TILES,
  OPENRAILWAY_TILES,
} from '../../data/apGeo';
import type { ApDistrictProperties } from '../../gis/useApBoundaries';

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
}

interface MarkerSpec {
  id: string;
  lat: number;
  lon: number;
  kind: 'checkpost' | 'hotspot' | 'station' | 'hq' | 'seizure' | 'city';
  label: string;
  selected?: boolean;
}

interface ApLeafletMapProps {
  basemap: BasemapId;
  showStateBorder?: boolean;
  showDistricts?: boolean;
  districtOpacity?: number;
  stateOpacity?: number;
  choropleth?: boolean;
  showHighways?: boolean;
  showAgencyRoutes?: boolean;
  showRailways?: boolean;
  showGraticule?: boolean;
  showRivers?: boolean;
  showTrails?: boolean;
  showPlaces?: boolean;
  showMandals?: boolean;
  showVillages?: boolean;
  showPoliceStations?: boolean;
  mandalOpacity?: number;
  villageOpacity?: number;
  policeStationOpacity?: number;
  selectedPoliceStationId?: string;
  showImageryOverlay?: boolean;
  highlightAgency?: boolean;
  markers?: MarkerSpec[];
  selectedFeature?: InspectableFeature;
  digitizedFeatures?: DigitizedFeature[];
  draftPoints?: Array<{ lat: number; lon: number }>;
  draftType?: 'Point' | 'LineString' | 'Polygon';
  route?: Array<{ lat: number; lon: number }>;
  measurePoints?: Array<{ lat: number; lon: number }>;
  measureMode?: 'dist' | 'area' | null;
  droppedPin?: { lat: number; lon: number; elev?: number } | null;
  clickMode?: MapClickMode;
  onMapClick?: (lat: number, lon: number) => void;
  onMarkerClick?: (id: string) => void;
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
  layoutRevision?: string | number;
  fitToState?: boolean;
}

function markerIcon(kind: MarkerSpec['kind'], selected: boolean): DivIcon {
  const palette: Record<MarkerSpec['kind'], string> = {
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
    kind === 'checkpost' ? 'CP' : kind === 'hotspot' ? 'H' : kind === 'hq' ? 'HQ' : kind === 'station' ? 'PS' : '';
  return L.divIcon({
    className: 'ap-gis-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 ${selected ? 4 : 0}px rgba(0,106,97,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 8px Inter,sans-serif;">${label}</div>`,
  });
}

const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

function featureBounds(feature: GeoJSON.Feature): L.LatLngBounds | null {
  const bounds = L.geoJSON(feature as GeoJSON.GeoJsonObject).getBounds();
  return bounds.isValid() ? bounds : null;
}

function bindIsolateClick(layer: L.Layer, onClick: (e: L.LeafletMouseEvent) => void) {
  layer.on('mouseover', () => {
    const map = (layer as L.Layer & { _map?: L.Map })._map;
    map?.dragging.disable();
  });
  layer.on('mouseout', () => {
    const map = (layer as L.Layer & { _map?: L.Map })._map;
    map?.dragging.enable();
  });
  layer.on('click', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    onClick(e);
  });
}

function constrainToFeature(map: L.Map, feature: GeoJSON.Feature | null) {
  map.options.maxBoundsViscosity = feature ? 1 : 0;
  if (!feature) {
    map.setMinZoom(3);
    map.setMaxBounds(WORLD_BOUNDS);
    return null;
  }
  const bounds = featureBounds(feature);
  if (!bounds) return null;
  map.setMaxBounds(bounds.pad(0.16));
  const fitted = map.getBoundsZoom(bounds, false);
  if (Number.isFinite(fitted)) map.setMinZoom(Math.max(3, fitted - 1));
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
  }
>(
  ({ onViewChange, layoutRevision, fitToState, clipFeature = null, clipKey = '' }, ref) => {
    const map = useMap();
    const layoutToken = useContext(MapLayoutContext);
    const revision = `${layoutToken}:${layoutRevision ?? ''}`;
    const hadClip = React.useRef(false);
    useImperativeHandle(ref, () => ({
      flyTo: (lat, lon, zoom = 12) => {
        map.invalidateSize({ animate: false });
        map.flyTo([lat, lon], zoom, { duration: 0.8 });
      },
      fitState: () => {
        map.invalidateSize({ animate: false });
        constrainToFeature(map, null);
        map.fitBounds(AP_BOUNDS, { padding: [24, 24] });
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
        map.fitBounds(bounds, { padding: [24, 24], maxZoom, animate: true });
      },
      zoomIn: () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
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
          if (fitToState && !fitted && grew) {
            fitted = true;
            map.fitBounds(AP_BOUNDS, { padding: [24, 24], animate: false });
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
    }, [map, revision, fitToState]);
    useEffect(() => {
      if (!clipFeature) {
        constrainToFeature(map, null);
        if (hadClip.current) {
          map.invalidateSize({ animate: false });
          map.fitBounds(AP_BOUNDS, { padding: [24, 24], animate: true });
        }
        hadClip.current = false;
        return;
      }
      const bounds = constrainToFeature(map, clipFeature);
      if (!bounds) return;
      hadClip.current = true;
      map.invalidateSize({ animate: false });
      const maxZoom =
        clipFeature.properties && 'village_name' in (clipFeature.properties as object)
          ? 16
          : clipFeature.properties && 'mandal_name' in (clipFeature.properties as object)
            ? 14
            : 11;
      map.fitBounds(bounds, { padding: [24, 24], maxZoom, animate: true });
    }, [map, clipKey, clipFeature]);
    useMapEvents({
      moveend: () => {
        const c = map.getCenter();
        onViewChange?.(c.lat, c.lng, map.getZoom());
      },
      zoomend: () => {
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
  onMapClick?: (lat: number, lon: number) => void;
  onCursorMove?: ApLeafletMapProps['onCursorMove'];
}> = ({ mode, interactive, onMapClick, onCursorMove }) => {
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
    if (level === 'village' && adminDrill?.mandalFeature) {
      return asFeatureCollection([adminDrill.mandalFeature]);
    }
    if (level === 'mandal' && adminDrill?.mandalName) {
      const named = filterByAdminName(mandals.features, 'mandal_name', adminDrill.mandalName);
      return asFeatureCollection(named.length ? named : adminDrill.mandalFeature ? [adminDrill.mandalFeature] : []);
    }
    if ((level === 'district' || level === 'mandal') && adminDrill?.districtFeature) {
      const inside = filterFeaturesInParent(mandals.features, adminDrill.districtFeature);
      return asFeatureCollection(inside);
    }
    return mandals;
  }, [mandals, adminDrill]);

  const villageCollection = useMemo(() => {
    if (!villages) return null;
    const level = adminDrill?.level ?? 'state';
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
    return villages;
  }, [villages, adminDrill]);

  return (
    <>
      {showMandals && mandalCollection && (
        <div
          data-testid="mandal-layer-ready"
          data-count={mandalCollection.features.length}
          hidden
        />
      )}
      {showVillages && villageCollection && (adminDrill || zoom >= 9) && (
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
            color: '#475569',
            weight: zoom >= 9 ? 1.1 : 0.6,
            fillColor: '#94a3b8',
            fillOpacity: adminDrill && adminDrill.level !== 'state' ? 0 : 0.12 * mandalOpacity,
            opacity: mandalOpacity,
          }}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as MandalProperties;
            layer.bindTooltip(
              `${props.mandal_name}${props.district_name ? ` • ${props.district_name}` : ''}`,
              { sticky: true }
            );
            bindIsolateClick(layer, (e) => {
              onMandalClick?.(
                props.mandal_name,
                e.latlng.lat,
                e.latlng.lng,
                props.district_name,
                feature
              );
            });
          }}
        />
      )}
      {showVillages && villageCollection && (adminDrill || zoom >= 9) && (
        <GeoJSON
          key={`villages-${villageOpacity}-${villageCollection.features.length}-${adminDrill?.villageName ?? adminDrill?.mandalName ?? 'all'}`}
          pane="admin-vectors"
          data={villageCollection}
          style={{
            color: '#334155',
            weight: 0.6,
            fillColor: '#cbd5e1',
            fillOpacity: adminDrill && adminDrill.level !== 'state' ? 0 : 0.18 * villageOpacity,
            opacity: villageOpacity,
          }}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as VillageProperties;
            layer.bindTooltip(
              `${props.village_name}${props.mandal_name ? ` • ${props.mandal_name}` : ''}`,
              { sticky: true }
            );
            bindIsolateClick(layer, (e) => {
              onVillageClick?.(
                props.village_name,
                e.latlng.lat,
                e.latlng.lng,
                props.mandal_name,
                props.district_name,
                feature
              );
            });
          }}
        />
      )}
    </>
  );
};

const PoliceStationLayer: React.FC<{
  enabled: boolean;
  opacity: number;
  selectedId?: string;
  clipFeature?: GeoJSON.Feature | null;
  onPoliceStationClick?: ApLeafletMapProps['onPoliceStationClick'];
}> = ({ enabled, opacity, selectedId, clipFeature, onPoliceStationClick }) => {
  const stations = usePoliceStations(enabled);
  if (!enabled || !stations) return null;
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
      {features.map((feature, idx) => {
        if (!feature.geometry || feature.geometry.type !== 'Point') return null;
        const [lon, lat] = feature.geometry.coordinates;
        const props = (feature.properties ?? {}) as Partial<PoliceStationProperties>;
        const id = props.id || String(feature.id || `ps-${idx}`);
        const selected = Boolean(selectedId && id === selectedId);
        const label = [props.name, props.district, props.state].filter(Boolean).join(' • ');
        return (
          <CircleMarker
            key={id}
            center={[lat, lon]}
            radius={selected ? 8 : 5.5}
            pathOptions={{
              color: selected ? '#ba1a1a' : '#001428',
              weight: selected ? 2 : 1.3,
              fillColor: selected ? '#f97316' : '#0d9488',
              fillOpacity: 0.92 * opacity,
              opacity,
            }}
            eventHandlers={{
              click: () => onPoliceStationClick?.(id, props.name || id, lat, lon),
            }}
          >
            <Tooltip sticky>{label}</Tooltip>
          </CircleMarker>
        );
      })}
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
    />
  );
};

const AdminClipPanes: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('admin-clip')) {
      const clip = map.createPane('admin-clip');
      clip.style.zIndex = '450';
      clip.style.pointerEvents = 'none';
    }
    if (!map.getPane('admin-vectors')) {
      const vectors = map.createPane('admin-vectors');
      vectors.style.zIndex = '460';
    }
  }, [map]);
  return null;
};

const AdminClipMask: React.FC<{ feature: GeoJSON.Feature | null }> = ({ feature }) => {
  const rings = useMemo(() => (feature ? invertMaskLatLngs(feature) : []), [feature]);
  if (!feature || rings.length < 2) return null;
  return (
    <Polygon
      pane="admin-clip"
      positions={rings as LatLngExpression[][]}
      pathOptions={{
        fillColor: '#cfe4f3',
        fillOpacity: 1,
        fillRule: 'evenodd',
        color: '#0f2942',
        weight: 2.2,
        opacity: 1,
        interactive: false,
        stroke: true,
      }}
    />
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

export const ApLeafletMap = forwardRef<ApLeafletMapHandle, ApLeafletMapProps>(function ApLeafletMap(
  {
    basemap,
    showStateBorder = true,
    showDistricts = true,
    districtOpacity = 1,
    stateOpacity = 1,
    choropleth: _choropleth = false,
    showHighways = false,
    showAgencyRoutes = false,
    showRailways = false,
    showGraticule = false,
    showRivers = false,
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
    highlightAgency = false,
    markers = [],
    digitizedFeatures = [],
    draftPoints = [],
    draftType = 'Point',
    route = [],
    measurePoints = [],
    measureMode = null,
    droppedPin,
    clickMode = 'inspect',
    onMapClick,
    onMarkerClick,
    onDistrictClick,
    onMandalClick,
    onVillageClick,
    onPoliceStationClick,
    onViewChange,
    onCursorMove,
    className = '',
    initialZoom = AP_DEFAULT_ZOOM,
    initialCenter = AP_CENTER,
    interactive = true,
    layoutRevision = 0,
    fitToState = false,
    adminDrill = null,
  },
  ref
) {
  const { districts, state, ready } = useApBoundaries();
  const { highways, rivers, agency } = useApNetwork();
  const drillLevel = adminDrill?.level ?? 'state';
  const drillActive = drillLevel !== 'state';
  const showMandalsEffective = drillActive
    ? drillLevel === 'district' || drillLevel === 'mandal'
    : showMandals;
  const showVillagesEffective = drillActive
    ? drillLevel === 'mandal' || drillLevel === 'village'
    : showVillages;
  const showDistrictsEffective = drillActive ? drillLevel === 'district' : showDistricts;
  const districtData =
    districts && drillActive && adminDrill?.districtFeature
      ? asFeatureCollection([adminDrill.districtFeature])
      : districts;
  const clipFeature = adminDrill ? drillFocusFeature(adminDrill) : null;
  const clipStations = clipFeature;
  const rasterId: RasterBasemapId = basemap === 'maplibre' ? 'vector' : basemap;
  const tiles = BASEMAP_TILES[rasterId];
  const useMapLibre = basemap === 'maplibre';
  const controllerRef = React.useRef<ApLeafletMapHandle>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom) => controllerRef.current?.flyTo(lat, lon, zoom),
    fitState: () => controllerRef.current?.fitState(),
    fitFeature: (feature) => controllerRef.current?.fitFeature(feature),
    zoomIn: () => controllerRef.current?.zoomIn(),
    zoomOut: () => controllerRef.current?.zoomOut(),
  }));

  const districtStyle = (feature?: GeoJSON.Feature) => {
    const name = (feature?.properties as ApDistrictProperties | undefined)?.district_name ?? '';
    const isAgency = highlightAgency && AGENCY_DISTRICT_NAMES.includes(name);
    return {
      color: isAgency ? '#5b21b6' : '#0f2942',
      weight: isAgency ? 1.6 : 0.9,
      fillColor: isAgency ? '#7c3aed' : '#0f2942',
      fillOpacity: isAgency ? 0.22 * districtOpacity : 0.02 * districtOpacity,
      opacity: districtOpacity,
    };
  };

  const draftLatLngs = draftPoints.map((p) => [p.lat, p.lon] as LatLngExpression);
  const measureLatLngs = measurePoints.map((p) => [p.lat, p.lon] as LatLngExpression);
  const routeLatLngs = route.map((p) => [p.lat, p.lon] as LatLngExpression);

  return (
    <div className={`ap-leaflet-root ${drillActive ? 'is-admin-drill' : ''} ${className}`}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        minZoom={3}
        maxZoom={19}
        zoomControl={false}
        attributionControl
        worldCopyJump
        keyboard={interactive}
        boxZoom={false}
        style={{ height: '100%', width: '100%' }}
        dragging={interactive}
        inertia={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        bounceAtZoomLimits={false}
      >
        <AdminClipPanes />
        {useMapLibre ? (
          <>
            {drillActive && (
              <TileLayer
                attribution={BASEMAP_TILES.vector.attribution}
                url={BASEMAP_TILES.vector.url}
                maxZoom={BASEMAP_TILES.vector.maxZoom}
                pane="overlayPane"
              />
            )}
            <MapLibreBasemap
              viewSync={`${adminDrill?.level ?? 'state'}:${adminDrill?.districtName ?? ''}:${adminDrill?.mandalName ?? ''}:${adminDrill?.villageName ?? ''}`}
            />
          </>
        ) : (
          <TileLayer attribution={tiles.attribution} url={tiles.url} maxZoom={tiles.maxZoom} />
        )}
        {tiles.labelsUrl && !useMapLibre && (
          <TileLayer url={tiles.labelsUrl} pane="overlayPane" />
        )}
        {showImageryOverlay && (
          <TileLayer
            url={BASEMAP_TILES.satellite.url}
            attribution={BASEMAP_TILES.satellite.attribution}
            opacity={0.72}
            pane={drillActive ? 'overlayPane' : undefined}
          />
        )}
        <ZoomAwarePlaces
          enabled={useMapLibre || showPlaces || showMandals || showVillages || drillActive}
          minZoom={6}
          pane="overlayPane"
        />
        {(showHighways || useMapLibre || drillActive) && (
          <TileLayer
            url={ESRI_TRANSPORT_TILES.url}
            attribution={ESRI_TRANSPORT_TILES.attribution}
            opacity={0.85}
            pane="overlayPane"
          />
        )}
        {showTrails && (
          <TileLayer
            url={HIKING_TRAIL_TILES.url}
            attribution={HIKING_TRAIL_TILES.attribution}
            opacity={0.85}
            pane={drillActive ? 'overlayPane' : undefined}
          />
        )}
        {showRailways && (
          <TileLayer
            attribution={OPENRAILWAY_TILES.attribution}
            url={OPENRAILWAY_TILES.url}
            opacity={0.85}
            pane={drillActive ? 'overlayPane' : undefined}
          />
        )}
        {showGraticule && <Graticule />}
        {rivers && showRivers && (
          <GeoJSON
            data={rivers}
            style={{ color: '#1565c0', weight: 1.6, opacity: 0.75 }}
            onEachFeature={(feature, layer) => {
              const name = (feature.properties as { name?: string } | null)?.name;
              if (name) layer.bindTooltip(name, { sticky: true });
            }}
          />
        )}
        {ready && state && showStateBorder && (
          <GeoJSON
            data={state}
            style={{ color: '#001428', weight: 2.2, fill: false, opacity: stateOpacity }}
          />
        )}
        <AdminClipMask
          key={`clip-${adminDrill?.level ?? 'state'}-${adminDrill?.villageName ?? adminDrill?.mandalName ?? adminDrill?.districtName ?? 'none'}`}
          feature={clipFeature}
        />
        {ready && districtData && showDistrictsEffective && (
          <GeoJSON
            key={`districts-${districtOpacity}-${highlightAgency ? 'ag' : 'std'}-${adminDrill?.districtName ?? 'all'}`}
            pane="admin-vectors"
            data={districtData}
            style={(feature) => {
              const base = districtStyle(feature);
              if (drillLevel === 'district') {
                return { ...base, fillOpacity: 0, weight: 2.4 };
              }
              return base;
            }}
            interactive={!drillActive}
            onEachFeature={(feature, layer) => {
              const name = (feature.properties as ApDistrictProperties).district_name;
              layer.bindTooltip(name, { sticky: true });
              bindIsolateClick(layer, (e) => {
                onDistrictClick?.(name, e.latlng.lat, e.latlng.lng, feature);
              });
            }}
          />
        )}
        {ready && (
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
        <PoliceStationLayer
          enabled={showPoliceStations}
          opacity={policeStationOpacity}
          selectedId={selectedPoliceStationId}
          clipFeature={clipStations}
          onPoliceStationClick={onPoliceStationClick}
        />
        {highways && showHighways && (
          <GeoJSON
            data={highways}
            style={(feature) => ({
              color: feature?.properties?.name === 'NH-16' ? '#c2410c' : '#b45309',
              weight: feature?.properties?.name === 'NH-16' ? 3 : 2.2,
              opacity: 0.95,
            })}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { name?: string; length_km?: number };
              layer.bindTooltip(
                `${props.name ?? 'NH'}${props.length_km ? ` • ${props.length_km} km (OSM)` : ''}`,
                { sticky: true }
              );
            }}
          />
        )}
        {agency && showAgencyRoutes && (
          <GeoJSON
            data={agency}
            style={{ color: '#ba1a1a', weight: 2.6, dashArray: '7 4', opacity: 0.95 }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { name?: string; length_km?: number };
              layer.bindTooltip(
                `${props.name ?? 'Agency corridor'}${props.length_km ? ` • ${props.length_km} km OSM driving` : ''}`,
                { sticky: true }
              );
            }}
          />
        )}
        {routeLatLngs.length > 1 && (
          <Polyline positions={routeLatLngs} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.95 }} />
        )}
        {(clipFeature
          ? markers.filter((m) => pointInFeature([m.lon, m.lat], clipFeature))
          : markers
        ).map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lon]}
            icon={markerIcon(m.kind, Boolean(m.selected))}
            eventHandlers={{ click: () => onMarkerClick?.(m.id) }}
          >
            <Popup>
              <div className="text-xs font-semibold">{m.label}</div>
              <div className="font-mono text-[10px] tabular-coord">
                {m.lat.toFixed(4)}° N, {m.lon.toFixed(4)}° E
              </div>
            </Popup>
          </Marker>
        ))}
        {digitizedFeatures.map((df) => {
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
        {draftType === 'Polygon' && draftLatLngs.length >= 3 && (
          <Polygon
            positions={draftLatLngs}
            pathOptions={{ color: '#006a61', weight: 2, fillColor: '#006a61', fillOpacity: 0.2 }}
          />
        )}
        {draftType === 'LineString' && draftLatLngs.length >= 2 && (
          <Polyline positions={draftLatLngs} pathOptions={{ color: '#006a61', weight: 2, dashArray: '4 3' }} />
        )}
        {draftPoints.map((p, i) => (
          <Circle
            key={`draft-${i}`}
            center={[p.lat, p.lon]}
            radius={40}
            pathOptions={{ color: '#ba1a1a', fillColor: '#ba1a1a', fillOpacity: 1 }}
          />
        ))}
        {measureMode && measureLatLngs.length >= 2 && (
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
        {droppedPin && (
          <Marker position={[droppedPin.lat, droppedPin.lon]} icon={markerIcon('city', true)}>
            <Popup>
              <div className="font-mono text-[11px] tabular-coord">
                {droppedPin.lat.toFixed(4)}° N, {droppedPin.lon.toFixed(4)}° E
                {droppedPin.elev != null ? ` • ${droppedPin.elev} m MSL (SRTM)` : ''}
              </div>
            </Popup>
          </Marker>
        )}
        <ScaleControl position="bottomleft" metric imperial={false} />
        <MapController
          ref={controllerRef}
          onViewChange={onViewChange}
          layoutRevision={layoutRevision}
          fitToState={fitToState}
          clipFeature={clipFeature}
          clipKey={`${adminDrill?.level ?? 'state'}:${adminDrill?.districtName ?? ''}:${adminDrill?.mandalName ?? ''}:${adminDrill?.villageName ?? ''}`}
        />
        <ClickSink
          mode={clickMode}
          interactive={interactive}
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
