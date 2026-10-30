import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { ApLeafletMapHandle, MapClickMode } from './ApLeafletMap';
import { useApBoundaries } from '../../gis/useApBoundaries';
import { useApMandals, useVillagePolygons } from '../../gis/useApAdmin';
import type { MandalProperties, VillageProperties } from '../../gis/useApAdmin';
import { usePoliceStations } from '../../gis/usePoliceStations';
import type { PoliceStationProperties } from '../../gis/usePoliceStations';
import { useApNetwork } from '../../gis/useApNetwork';
import {
  type AdminDrill,
  adminNamesEqual,
  asFeatureCollection,
  drillFocusFeature,
  featureBbox,
  filterByAdminName,
  filterFeaturesInParent,
  isolateChildFeature,
  invertMaskLocalGeoJSON,
  pointInFeature,
} from '../../gis/adminHierarchy';
import type { ApDistrictProperties } from '../../gis/useApBoundaries';
import {
  AP_BOUNDS,
  AP_CENTER,
  AP_DEFAULT_ZOOM,
  BASEMAP_TILES,
  ESRI_PLACES_TILES,
  ESRI_TRANSPORT_TILES,
  HIKING_TRAIL_TILES,
  MAPLIBRE_3D_ATTRIBUTION,
  MAPLIBRE_TERRAIN_TILES,
  OPENRAILWAY_TILES,
} from '../../data/apGeo';
import {
  EMPTY_FC,
  MAP_VIEW_3D_LAYER_LIMITS,
  MAP_VIEW_3D_NOTE,
  probeTerrariumDem,
  webglIsAvailable,
} from '../../gis/mapLibre3d';
import {
  MAP_CAMERA_MAX_ZOOM,
  MAP_CAMERA_MIN_ZOOM,
  clampMapZoom,
  findContainingFeature,
  formatIdentifyHtml,
  formatIdentifyLines,
  identifyAdminAtPoint,
  shouldDrawMandals,
  shouldDrawVillages,
  shouldOverlayPlaces,
  shouldOverlayRoads,
  shouldOverlaySatellite,
} from '../../gis/mapDetail';

interface MarkerSpec {
  id: string;
  lat: number;
  lon: number;
  kind: 'checkpost' | 'hotspot' | 'station' | 'hq' | 'seizure' | 'city';
  label: string;
  selected?: boolean;
}

interface ApMapLibre3DMapProps {
  showStateBorder?: boolean;
  showDistricts?: boolean;
  districtOpacity?: number;
  stateOpacity?: number;
  showHighways?: boolean;
  showAgencyRoutes?: boolean;
  showRailways?: boolean;
  showRivers?: boolean;
  showTrails?: boolean;
  showMandals?: boolean;
  showVillages?: boolean;
  showPoliceStations?: boolean;
  mandalOpacity?: number;
  villageOpacity?: number;
  policeStationOpacity?: number;
  selectedPoliceStationId?: string;
  showImageryOverlay?: boolean;
  markers?: MarkerSpec[];
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
  onCursorMove?: (lat: number, lon: number, zoom: number, elevM?: number | null) => void;
  layoutRevision?: string | number;
  onTerrainStatus?: (status: 'ready' | 'flat' | 'blocked') => void;
  viewTarget?: { lat: number; lon: number; zoom: number; token: number };
  viewActive?: boolean;
  onInspectHit?: (hit: {
    name: string;
    kind: 'OSM Building' | 'Highway' | 'River';
    lat: number;
    lon: number;
    detail: string;
    heightM?: number;
  }) => void;
}

function setGeojson(map: MapLibreMap, id: string, data: GeoJSON.GeoJSON) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  source?.setData(data);
}

function pointsToFc(
  points: Array<{ lat: number; lon: number }>,
  asLine: boolean
): GeoJSON.FeatureCollection {
  if (asLine && points.length >= 2) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: points.map((p) => [p.lon, p.lat]),
          },
        },
      ],
    };
  }
  return {
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature',
      properties: { i },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

export const ApMapLibre3DMap = forwardRef<ApLeafletMapHandle, ApMapLibre3DMapProps>(
  function ApMapLibre3DMap(
    {
      showStateBorder = true,
      showDistricts = true,
      districtOpacity = 1,
      stateOpacity = 1,
      showHighways = false,
      showAgencyRoutes = false,
      showRailways = false,
      showRivers = false,
      showTrails = false,
      showMandals = false,
      showVillages = false,
      showPoliceStations = false,
      mandalOpacity = 1,
      villageOpacity = 1,
      policeStationOpacity = 1,
      selectedPoliceStationId,
      showImageryOverlay = false,
      markers = [],
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
      adminDrill = null,
      onPoliceStationClick,
      onViewChange,
      onCursorMove,
      layoutRevision = 0,
      onTerrainStatus,
      viewTarget,
      viewActive = true,
      onInspectHit,
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const callbacksRef = useRef({
      onMapClick,
      onMarkerClick,
      onDistrictClick,
      onMandalClick,
      onVillageClick,
      onPoliceStationClick,
      onViewChange,
      onCursorMove,
      onTerrainStatus,
      onInspectHit,
      clickMode,
      viewActive,
    });
    callbacksRef.current = {
      onMapClick,
      onMarkerClick,
      onDistrictClick,
      onMandalClick,
      onVillageClick,
      onPoliceStationClick,
      onViewChange,
      onCursorMove,
      onTerrainStatus,
      onInspectHit,
      clickMode,
      viewActive,
    };
    const gisRef = useRef({
      maskData: EMPTY_FC as GeoJSON.FeatureCollection,
      stateData: EMPTY_FC as GeoJSON.GeoJSON,
      districtData: EMPTY_FC as GeoJSON.FeatureCollection,
      mandalData: EMPTY_FC as GeoJSON.FeatureCollection,
      villageData: EMPTY_FC as GeoJSON.FeatureCollection,
      stationData: EMPTY_FC as GeoJSON.FeatureCollection,
      markerData: EMPTY_FC as GeoJSON.FeatureCollection,
      highways: EMPTY_FC as GeoJSON.GeoJSON,
      rivers: EMPTY_FC as GeoJSON.GeoJSON,
      agency: EMPTY_FC as GeoJSON.GeoJSON,
      measure: EMPTY_FC as GeoJSON.FeatureCollection,
      route: EMPTY_FC as GeoJSON.FeatureCollection,
      pin: EMPTY_FC as GeoJSON.FeatureCollection,
      showHighways: false,
      showTrails: false,
      showRailways: false,
      showImageryOverlay: false,
      showPlaces: false,
      drillActive: false,
      districtOpacity: 1,
      mandalOpacity: 1,
      villageOpacity: 1,
      stateOpacity: 1,
      policeStationOpacity: 1,
      selectedPoliceStationId: undefined as string | undefined,
      parentDistrict: null as GeoJSON.Feature | null,
      parentMandal: null as GeoJSON.Feature | null,
    });
    const [webgl] = useState(() => webglIsAvailable());
    const [ready, setReady] = useState(false);
    const [zoom, setZoom] = useState(AP_DEFAULT_ZOOM);
    const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
    const [terrainStatus, setTerrainStatus] = useState<'ready' | 'flat' | 'blocked'>(
      webgl ? 'flat' : 'blocked'
    );

    const drillLevel = adminDrill?.level ?? 'state';
    const drillActive = drillLevel !== 'state';
    const showMandalsEffective = shouldDrawMandals(drillLevel) || showMandals;
    const showVillagesEffective = shouldDrawVillages(drillLevel) || showVillages;
    const showDistrictsEffective = drillActive ? drillLevel === 'district' : showDistricts;
    const clipFeature = adminDrill ? drillFocusFeature(adminDrill) : null;

    const { districts, state, ready: boundsReady } = useApBoundaries();
    const { highways, rivers, agency } = useApNetwork();
    const mandals = useApMandals(true);
    const stations = usePoliceStations(showPoliceStations);
    const parentBbox =
      (adminDrill?.mandalFeature && featureBbox(adminDrill.mandalFeature)) ||
      (adminDrill?.districtFeature && featureBbox(adminDrill.districtFeature)) ||
      bbox;
    const villages = useVillagePolygons(
      showVillagesEffective || zoom >= 9,
      parentBbox,
      zoom,
      drillActive ? 0 : 9
    );
    const identifyDataRef = useRef({
      districts: [] as GeoJSON.Feature[],
      mandals: [] as GeoJSON.Feature[],
      villages: [] as GeoJSON.Feature[],
    });
    identifyDataRef.current = {
      districts: districts?.features ?? [],
      mandals: mandals?.features ?? [],
      villages: villages?.features ?? [],
    };
    const identifyHostRef = useRef<HTMLDivElement>(null);
    const overlayImagery = shouldOverlaySatellite(zoom, 'vector', drillLevel, showImageryOverlay);
    const overlayRoads = shouldOverlayRoads(zoom, showHighways, true, drillActive);
    const overlayPlaces = shouldOverlayPlaces(zoom, showMandals || showVillages, drillActive);

    const districtData = useMemo(() => {
      if (!districts) return EMPTY_FC;
      if (drillActive && adminDrill?.districtFeature) {
        return asFeatureCollection([adminDrill.districtFeature]);
      }
      return showDistrictsEffective ? districts : EMPTY_FC;
    }, [districts, drillActive, adminDrill, showDistrictsEffective]);

    const mandalData = useMemo(() => {
      if (!mandals || !showMandalsEffective) return EMPTY_FC;
      const level = adminDrill?.level ?? 'state';
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
        return asFeatureCollection(filterFeaturesInParent(mandals.features, adminDrill.districtFeature));
      }
      return level === 'state' ? mandals : EMPTY_FC;
    }, [mandals, adminDrill, showMandalsEffective]);

    const villageData = useMemo(() => {
      if (!villages || !showVillagesEffective) return EMPTY_FC;
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
      return level === 'state' ? villages : EMPTY_FC;
    }, [villages, adminDrill, showVillagesEffective]);

    const stationData = useMemo(() => {
      if (!stations || !showPoliceStations) return EMPTY_FC;
      const features = clipFeature
        ? stations.features.filter((feature) => {
            if (feature.geometry?.type !== 'Point') return false;
            const [lon, lat] = feature.geometry.coordinates;
            return pointInFeature([lon, lat], clipFeature);
          })
        : stations.features;
      return asFeatureCollection(features);
    }, [stations, showPoliceStations, clipFeature]);

    const markerData = useMemo(() => {
      const list = clipFeature
        ? markers.filter((m) => pointInFeature([m.lon, m.lat], clipFeature))
        : markers;
      return asFeatureCollection(
        list.map((m) => ({
          type: 'Feature',
          properties: { id: m.id, label: m.label, kind: m.kind, selected: Boolean(m.selected) },
          geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
        }))
      );
    }, [markers, clipFeature]);

    const maskData = useMemo(() => {
      if (!clipFeature) return EMPTY_FC;
      const mask = invertMaskLocalGeoJSON(clipFeature);
      return mask ? asFeatureCollection([mask]) : EMPTY_FC;
    }, [clipFeature]);

    const stateData = showStateBorder && state && !drillActive ? state : EMPTY_FC;
    const highwayData = showHighways && highways ? highways : EMPTY_FC;
    const riverData = showRivers && rivers ? rivers : EMPTY_FC;
    const agencyData = showAgencyRoutes && agency ? agency : EMPTY_FC;
    const measureData =
      measureMode && measurePoints.length ? pointsToFc(measurePoints, true) : EMPTY_FC;
    const routeData = route.length > 1 ? pointsToFc(route, true) : EMPTY_FC;
    const pinData = droppedPin
      ? asFeatureCollection([
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [droppedPin.lon, droppedPin.lat] },
          },
        ])
      : EMPTY_FC;

    gisRef.current = {
      maskData,
      stateData,
      districtData,
      mandalData,
      villageData,
      stationData,
      markerData,
      highways: highwayData,
      rivers: riverData,
      agency: agencyData,
      measure: measureData,
      route: routeData,
      pin: pinData,
      showHighways: overlayRoads,
      showTrails,
      showRailways,
      showImageryOverlay: overlayImagery,
      showPlaces: overlayPlaces,
      drillActive,
      districtOpacity,
      mandalOpacity,
      villageOpacity,
      stateOpacity,
      policeStationOpacity,
      selectedPoliceStationId,
      parentDistrict: adminDrill?.districtFeature ?? null,
      parentMandal: adminDrill?.mandalFeature ?? null,
    };

    const applyGisLayers = (map: MapLibreMap) => {
      const gis = gisRef.current;
      setGeojson(map, 'admin-mask', gis.maskData);
      setGeojson(map, 'admin-state', gis.stateData);
      setGeojson(map, 'admin-districts', gis.districtData);
      setGeojson(map, 'admin-mandals', gis.mandalData);
      setGeojson(map, 'admin-villages', gis.villageData);
      setGeojson(map, 'gis-stations', gis.stationData);
      setGeojson(map, 'gis-markers', gis.markerData);
      setGeojson(map, 'gis-highways', gis.highways);
      setGeojson(map, 'gis-rivers', gis.rivers);
      setGeojson(map, 'gis-agency', gis.agency);
      setGeojson(map, 'gis-measure', gis.measure);
      setGeojson(map, 'gis-route', gis.route);
      setGeojson(map, 'gis-pin', gis.pin);
      if (map.getLayer('admin-districts-fill')) {
        map.setPaintProperty(
          'admin-districts-fill',
          'fill-opacity',
          gis.drillActive ? 0.02 : 0.04 * gis.districtOpacity
        );
      }
      if (map.getLayer('admin-mandals-fill')) {
        map.setPaintProperty(
          'admin-mandals-fill',
          'fill-opacity',
          gis.drillActive ? 0.03 : 0.08 * gis.mandalOpacity
        );
      }
      if (map.getLayer('admin-villages-fill')) {
        map.setPaintProperty(
          'admin-villages-fill',
          'fill-opacity',
          gis.drillActive ? 0.04 : 0.1 * gis.villageOpacity
        );
      }
      if (map.getLayer('admin-state-line')) {
        map.setPaintProperty('admin-state-line', 'line-opacity', gis.stateOpacity);
      }
      if (map.getLayer('gis-stations-circle')) {
        map.setPaintProperty('gis-stations-circle', 'circle-opacity', gis.policeStationOpacity);
        map.setPaintProperty(
          'gis-stations-circle',
          'circle-color',
          gis.selectedPoliceStationId
            ? ['case', ['==', ['get', 'id'], gis.selectedPoliceStationId], '#f97316', '#0d9488']
            : '#0d9488'
        );
      }
      const vis = (id: string, on: boolean) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      };
      vis('overlay-roads-layer', gis.showHighways);
      vis('overlay-places-layer', gis.showPlaces);
      vis('overlay-trails-layer', gis.showTrails);
      vis('overlay-rail-layer', gis.showRailways);
      vis('overlay-imagery-layer', gis.showImageryOverlay);
    };

    useImperativeHandle(ref, () => ({
      flyTo: (lat, lon, zoomLevel = 12) => {
        mapRef.current?.easeTo({
          center: [lon, lat],
          zoom: clampMapZoom(zoomLevel),
          pitch: Math.max(mapRef.current.getPitch(), 45),
          duration: 800,
        });
      },
      fitState: () => {
        mapRef.current?.fitBounds(
          [
            [AP_BOUNDS[0][1], AP_BOUNDS[0][0]],
            [AP_BOUNDS[1][1], AP_BOUNDS[1][0]],
          ],
          { padding: 24, pitch: 45, bearing: -12, duration: 800 }
        );
      },
      fitFeature: (feature) => {
        const box = featureBbox(feature);
        if (!box || !mapRef.current) return;
        const maxZoom = feature.properties && 'village_name' in (feature.properties as object)
          ? 16
          : feature.properties && 'mandal_name' in (feature.properties as object)
            ? 14
            : 12;
        mapRef.current.fitBounds(
          [
            [box[0], box[1]],
            [box[2], box[3]],
          ],
          { padding: 40, pitch: 55, maxZoom, duration: 900 }
        );
      },
      zoomIn: () => {
        mapRef.current?.zoomIn({ duration: 250 });
      },
      zoomOut: () => {
        mapRef.current?.zoomOut({ duration: 250 });
      },
      getView: () => {
        const map = mapRef.current;
        if (!map) return null;
        const c = map.getCenter();
        return { lat: c.lat, lon: c.lng, zoom: map.getZoom() };
      },
    }));

    useEffect(() => {
      if (!webgl) {
        setTerrainStatus('blocked');
        callbacksRef.current.onTerrainStatus?.('blocked');
        return;
      }
      const host = hostRef.current;
      if (!host) return;
      let cancelled = false;

      const map = new maplibregl.Map({
        container: host,
        style: {
          version: 8,
          glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          sources: {
            'osm-raster': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
              maxzoom: 19,
            },
          },
          layers: [
            { id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' },
          ],
        },
        center: [AP_CENTER[1], AP_CENTER[0]],
        zoom: AP_DEFAULT_ZOOM,
        pitch: 45,
        bearing: -18,
        maxPitch: 85,
        minZoom: MAP_CAMERA_MIN_ZOOM,
        maxZoom: MAP_CAMERA_MAX_ZOOM,
        attributionControl: { compact: true },
        boxZoom: false,
        keyboard: true,
        doubleClickZoom: true,
        scrollZoom: true,
        dragPan: true,
        dragRotate: true,
        touchZoomRotate: true,
        touchPitch: true,
        pitchWithRotate: true,
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
      mapRef.current = map;

      const reportView = () => {
        const c = map.getCenter();
        setZoom(map.getZoom());
        const b = map.getBounds();
        setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        const terrainOn = Boolean(map.getTerrain());
        setTerrainStatus(terrainOn ? 'ready' : 'flat');
        if (!callbacksRef.current.viewActive) return;
        callbacksRef.current.onViewChange?.(c.lat, c.lng, map.getZoom());
        callbacksRef.current.onTerrainStatus?.(terrainOn ? 'ready' : 'flat');
      };

      const onMove = (e: MapMouseEvent) => {
        if (!callbacksRef.current.viewActive) return;
        let elevM: number | null = null;
        if (map.getTerrain()) {
          const sampled = (
            map.queryTerrainElevation as (
              ll: { lng: number; lat: number },
              opts?: { exaggerated?: boolean }
            ) => number | null
          )(e.lngLat, { exaggerated: false });
          if (typeof sampled === 'number' && Number.isFinite(sampled)) elevM = sampled;
        }
        callbacksRef.current.onCursorMove?.(e.lngLat.lat, e.lngLat.lng, map.getZoom(), elevM);
        const data = identifyDataRef.current;
        const hit = identifyAdminAtPoint(
          [e.lngLat.lng, e.lngLat.lat],
          map.getZoom(),
          data.districts,
          data.mandals,
          data.villages
        );
        const el = identifyHostRef.current;
        if (el) {
          const lines = formatIdentifyLines(hit);
          el.innerHTML = formatIdentifyHtml(hit);
          el.style.display = lines.length ? 'block' : 'none';
        }
      };

      map.on('load', () => {
        if (cancelled || mapRef.current !== map) return;
        void probeTerrariumDem(AP_CENTER[0], AP_CENTER[1]).then((ok) => {
          if (cancelled || mapRef.current !== map) return;
          if (!ok) {
            setTerrainStatus('flat');
            callbacksRef.current.onTerrainStatus?.('flat');
            return;
          }
          try {
            if (!map.getSource('terrain-dem')) {
              map.addSource('terrain-dem', {
                type: 'raster-dem',
                tiles: [MAPLIBRE_TERRAIN_TILES],
                encoding: 'terrarium',
                tileSize: 256,
                maxzoom: 15,
              });
            }
            map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 });
            if (!map.getLayer('terrain-hillshade')) {
              const before = map.getLayer('admin-mask-fill') ? 'admin-mask-fill' : undefined;
              map.addLayer(
                {
                  id: 'terrain-hillshade',
                  type: 'hillshade',
                  source: 'terrain-dem',
                  paint: { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#334155' },
                },
                before
              );
            }
            map.addControl(
              new maplibregl.TerrainControl({ source: 'terrain-dem', exaggeration: 1.2 }),
              'top-right'
            );
            setTerrainStatus('ready');
            callbacksRef.current.onTerrainStatus?.('ready');
          } catch {
            try {
              map.setTerrain(null);
            } catch {
              /* stay flat */
            }
            setTerrainStatus('flat');
            callbacksRef.current.onTerrainStatus?.('flat');
          }
        });

        try {
          const addRaster = (id: string, tiles: string, visible: boolean, maxzoom = 19) => {
            if (!map.getSource(id)) {
              map.addSource(id, { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom });
            }
            if (!map.getLayer(`${id}-layer`)) {
              map.addLayer({
                id: `${id}-layer`,
                type: 'raster',
                source: id,
                layout: { visibility: visible ? 'visible' : 'none' },
                paint: { 'raster-opacity': 0.85 },
              });
            }
          };
          addRaster('overlay-imagery', BASEMAP_TILES.satellite.url, false, 23);
          addRaster('overlay-roads', ESRI_TRANSPORT_TILES.url, false, ESRI_TRANSPORT_TILES.maxZoom);
          addRaster('overlay-places', ESRI_PLACES_TILES.url, false, ESRI_PLACES_TILES.maxZoom);
          addRaster('overlay-trails', HIKING_TRAIL_TILES.url, false, HIKING_TRAIL_TILES.maxZoom);
          addRaster('overlay-rail', OPENRAILWAY_TILES.url.replace('{s}', 'a'), false, OPENRAILWAY_TILES.maxZoom);
        } catch {
          /* overlay rasters are optional */
        }

        [
          'admin-mask',
          'admin-state',
          'admin-districts',
          'admin-mandals',
          'admin-villages',
          'gis-stations',
          'gis-markers',
          'gis-highways',
          'gis-rivers',
          'gis-agency',
          'gis-measure',
          'gis-route',
          'gis-pin',
        ].forEach((id) => {
          if (!map.getSource(id)) {
            map.addSource(id, { type: 'geojson', data: EMPTY_FC });
          }
        });

        const addLine = (
          id: string,
          source: string,
          color: string,
          width: number,
          dash?: number[]
        ) => {
          if (map.getLayer(id)) return;
          map.addLayer({
            id,
            type: 'line',
            source,
            paint: {
              'line-color': color,
              'line-width': width,
              ...(dash ? { 'line-dasharray': dash } : {}),
            },
          });
        };
        const addFill = (id: string, source: string, color: string, opacity: number) => {
          if (map.getLayer(id)) return;
          map.addLayer({
            id,
            type: 'fill',
            source,
            paint: { 'fill-color': color, 'fill-opacity': opacity },
          });
        };

        addFill('admin-mask-fill', 'admin-mask', '#cfe4f3', 1);
        addLine('admin-state-line', 'admin-state', '#001428', 1.5);
        addFill('admin-districts-fill', 'admin-districts', '#0f2942', 0.04);
        addLine('admin-districts-line', 'admin-districts', '#0f2942', 1.05);
        addFill('admin-mandals-fill', 'admin-mandals', '#94a3b8', 0.04);
        addLine('admin-mandals-line', 'admin-mandals', '#475569', 0.75);
        addFill('admin-villages-fill', 'admin-villages', '#cbd5e1', 0.05);
        addLine('admin-villages-line', 'admin-villages', '#334155', 0.6);
        const addLabel = (id: string, source: string, field: string, size: number, minzoom: number) => {
          if (map.getLayer(id)) return;
          try {
            map.addLayer({
              id,
              type: 'symbol',
              source,
              minzoom,
              layout: {
                'text-field': ['get', field],
                'text-size': size,
                'text-font': ['Noto Sans Regular'],
                'text-max-width': 10,
                'text-padding': 2,
                'symbol-placement': 'point',
              },
              paint: {
                'text-color': '#0f2942',
                'text-halo-color': '#f8fafc',
                'text-halo-width': 1.4,
              },
            });
          } catch {
            /* glyphs optional */
          }
        };
        addLabel('admin-districts-label', 'admin-districts', 'district_name', 13, 6);
        addLabel('admin-mandals-label', 'admin-mandals', 'mandal_name', 12, 8);
        addLabel('admin-villages-label', 'admin-villages', 'village_name', 11, 11);
        addLine('gis-highways-line', 'gis-highways', '#c2410c', 2.4);
        addLine('gis-rivers-line', 'gis-rivers', '#1565c0', 1.8);
        addLine('gis-agency-line', 'gis-agency', '#ba1a1a', 2.4, [2, 1]);
        addLine('gis-measure-line', 'gis-measure', '#006a61', 2.4, [2, 1]);
        addLine('gis-route-line', 'gis-route', '#0f766e', 4);

        try {
          if (!map.getSource('openmaptiles')) {
            map.addSource('openmaptiles', {
              type: 'vector',
              url: 'https://tiles.openfreemap.org/planet',
            });
          }
          if (!map.getLayer('osm-3d-buildings')) {
            map.addLayer({
              id: 'osm-3d-buildings',
              source: 'openmaptiles',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 13,
              filter: [
                'any',
                ['>', ['to-number', ['coalesce', ['get', 'render_height'], 0]], 0],
                ['>', ['to-number', ['coalesce', ['get', 'height'], 0]], 0],
              ],
              paint: {
                'fill-extrusion-color': '#d6d3d1',
                'fill-extrusion-height': [
                  'coalesce',
                  ['to-number', ['get', 'render_height']],
                  ['to-number', ['get', 'height']],
                ],
                'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0],
                'fill-extrusion-opacity': 0.9,
              },
            });
          }
        } catch {
          /* building source unavailable */
        }

        if (!map.getLayer('gis-stations-circle')) {
          map.addLayer({
            id: 'gis-stations-circle',
            type: 'circle',
            source: 'gis-stations',
            paint: {
              'circle-radius': 6,
              'circle-color': '#0d9488',
              'circle-stroke-color': '#001428',
              'circle-stroke-width': 1.2,
            },
          });
        }
        if (!map.getLayer('gis-stations-label')) {
          map.addLayer({
            id: 'gis-stations-label',
            type: 'symbol',
            source: 'gis-stations',
            minzoom: 9,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 11,
              'text-font': ['Noto Sans Regular'],
              'text-offset': [0, 1.1],
              'text-anchor': 'top',
            },
            paint: {
              'text-color': '#0f2942',
              'text-halo-color': '#fff',
              'text-halo-width': 1.2,
            },
          });
        }
        if (!map.getLayer('gis-markers-circle')) {
          map.addLayer({
            id: 'gis-markers-circle',
            type: 'circle',
            source: 'gis-markers',
            paint: {
              'circle-radius': 6,
              'circle-color': '#006a61',
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1.5,
            },
          });
        }
        if (!map.getLayer('gis-pin-circle')) {
          map.addLayer({
            id: 'gis-pin-circle',
            type: 'circle',
            source: 'gis-pin',
            paint: {
              'circle-radius': 7,
              'circle-color': '#111827',
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          });
        }

        map.fitBounds(
          [
            [AP_BOUNDS[0][1], AP_BOUNDS[0][0]],
            [AP_BOUNDS[1][1], AP_BOUNDS[1][0]],
          ],
          { padding: 24, pitch: 45, bearing: -18, duration: 0 }
        );
        applyGisLayers(map);
        map.resize();
        setReady(true);
        reportView();
      });


      map.on('error', (event) => {
        const err = event as unknown as { sourceId?: string };
        if (err.sourceId === 'terrain-dem') {
          try {
            map.setTerrain(null);
          } catch {
            /* already flat */
          }
          setTerrainStatus('flat');
          callbacksRef.current.onTerrainStatus?.('flat');
        }
      });

      map.on('moveend', reportView);
      map.on('zoomend', reportView);
      map.on('mousemove', onMove);
      map.on('click', (e: MapMouseEvent) => {
        const cb = callbacksRef.current;
        const adminLayers = [
          'admin-villages-fill',
          'admin-mandals-fill',
          'admin-districts-fill',
          'gis-stations-circle',
          'gis-markers-circle',
        ].filter((id) => Boolean(map.getLayer(id)));
        const hit = map.queryRenderedFeatures(e.point, { layers: adminLayers })[0];
        if (hit?.layer?.id === 'gis-stations-circle') {
          const props = (hit.properties ?? {}) as Partial<PoliceStationProperties>;
          const geom = hit.geometry.type === 'Point' ? hit.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat];
          cb.onPoliceStationClick?.(String(props.id ?? ''), String(props.name ?? 'PS'), geom[1], geom[0]);
          return;
        }
        if (hit?.layer?.id === 'gis-markers-circle') {
          cb.onMarkerClick?.(String(hit.properties?.id ?? ''));
          return;
        }
        const inspectExtra = () => {
          if (cb.clickMode !== 'inspect') return false;
          const extraLayers = ['osm-3d-buildings', 'gis-highways-line', 'gis-rivers-line'].filter((id) =>
            Boolean(map.getLayer(id))
          );
          const extra = extraLayers.length
            ? map.queryRenderedFeatures(e.point, { layers: extraLayers })[0]
            : undefined;
          if (!extra) return false;
          const props = (extra.properties ?? {}) as Record<string, unknown>;
          const heightRaw = Number(props.render_height ?? props.height);
          const heightM = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : undefined;
          const name = String(props.name ?? props.ref ?? extra.sourceLayer ?? extra.layer?.id ?? 'Feature');
          const kind: 'OSM Building' | 'Highway' | 'River' =
            extra.layer?.id === 'osm-3d-buildings'
              ? 'OSM Building'
              : extra.layer?.id === 'gis-rivers-line'
                ? 'River'
                : 'Highway';
          const detailParts = [
            kind,
            heightM != null ? `${heightM} m OSM height` : null,
            props.class ? String(props.class) : null,
            props.ref ? String(props.ref) : null,
          ].filter(Boolean);
          cb.onInspectHit?.({
            name: name === 'building' || name === 'osm-3d-buildings' ? 'OSM building' : name,
            kind,
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
            detail: detailParts.join(' • '),
            heightM,
          });
          return true;
        };
        if (map.getZoom() >= 13 && inspectExtra()) return;
        const resolveAdmin = (
          key: 'village_name' | 'mandal_name' | 'district_name',
          value: string,
          props: object,
          geom: GeoJSON.Geometry
        ): GeoJSON.Feature => {
          const gis = gisRef.current;
          const data =
            key === 'village_name'
              ? gis.villageData
              : key === 'mandal_name'
                ? gis.mandalData
                : gis.districtData;
          const parent =
            key === 'village_name'
              ? gis.parentMandal ?? gis.parentDistrict
              : key === 'mandal_name'
                ? gis.parentDistrict
                : null;
          const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (data && data.type === 'FeatureCollection') {
            const full = data.features.find((f) =>
              adminNamesEqual(String((f.properties as Record<string, unknown> | null)?.[key] ?? ''), value)
            );
            if (full) return isolateChildFeature(full, point, parent);
          }
          return isolateChildFeature(
            { type: 'Feature', properties: props, geometry: geom },
            point,
            parent
          );
        };
        if (hit?.layer?.id === 'admin-villages-fill') {
          const props = (hit.properties ?? {}) as VillageProperties;
          const feature = resolveAdmin(
            'village_name',
            props.village_name,
            props,
            hit.geometry as GeoJSON.Geometry
          );
          cb.onVillageClick?.(
            props.village_name,
            e.lngLat.lat,
            e.lngLat.lng,
            props.mandal_name,
            props.district_name,
            feature
          );
          return;
        }
        if (hit?.layer?.id === 'admin-mandals-fill') {
          const props = (hit.properties ?? {}) as MandalProperties;
          const feature = resolveAdmin(
            'mandal_name',
            props.mandal_name,
            props,
            hit.geometry as GeoJSON.Geometry
          );
          cb.onMandalClick?.(props.mandal_name, e.lngLat.lat, e.lngLat.lng, props.district_name, feature);
          return;
        }
        if (hit?.layer?.id === 'admin-districts-fill') {
          const props = (hit.properties ?? {}) as ApDistrictProperties;
          const feature = resolveAdmin(
            'district_name',
            props.district_name,
            props,
            hit.geometry as GeoJSON.Geometry
          );
          cb.onDistrictClick?.(props.district_name, e.lngLat.lat, e.lngLat.lng, feature);
          return;
        }
        if (inspectExtra()) return;
        if (cb.clickMode === 'boxzoom' || cb.clickMode === 'pan') return;
        if (!gis.drillActive && cb.onDistrictClick) {
          const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const districtHit = findContainingFeature(point, gis.districtData.features);
          const districtName = String(
            (districtHit?.properties as ApDistrictProperties | undefined)?.district_name ?? ''
          );
          if (districtHit && districtName) {
            cb.onDistrictClick(
              districtName,
              e.lngLat.lat,
              e.lngLat.lng,
              isolateChildFeature(districtHit, point)
            );
            return;
          }
        }
        cb.onMapClick?.(e.lngLat.lat, e.lngLat.lng);
      });

      const ro = new ResizeObserver(() => {
        if (!cancelled) map.resize();
      });
      ro.observe(host);

      return () => {
        cancelled = true;
        ro.disconnect();
        map.remove();
        if (mapRef.current === map) mapRef.current = null;
        setReady(false);
      };
      // Map is created once per mount; callbacks are read from the latest render via refs below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [webgl]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      map.resize();
    }, [layoutRevision, ready]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      applyGisLayers(map);
    }, [
      ready,
      maskData,
      stateData,
      districtData,
      mandalData,
      villageData,
      stationData,
      markerData,
      highwayData,
      riverData,
      agencyData,
      measureData,
      routeData,
      pinData,
      showHighways,
      overlayRoads,
      overlayPlaces,
      overlayImagery,
      showTrails,
      showRailways,
      showImageryOverlay,
      zoom,
      drillActive,
      districtOpacity,
      mandalOpacity,
      villageOpacity,
      stateOpacity,
      policeStationOpacity,
      selectedPoliceStationId,
      boundsReady,
      applyGisLayers,
    ]);

    const lastClipKey = useRef<string | null>(null);
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      const key = `${viewActive ? 'on' : 'off'}:${
        clipFeature
          ? `${adminDrill?.level ?? 'state'}:${adminDrill?.districtName ?? ''}:${adminDrill?.mandalName ?? ''}:${adminDrill?.villageName ?? ''}`
          : 'state'
      }`;
      if (lastClipKey.current === key) return;
      lastClipKey.current = key;
      if (!viewActive) return;
      if (!clipFeature) {
        map.setMaxBounds(null);
        map.setMinZoom(MAP_CAMERA_MIN_ZOOM);
        return;
      }
      const box = featureBbox(clipFeature);
      if (!box) return;
      const pad = 0.18;
      map.setMaxBounds([
        [box[0] - pad, box[1] - pad],
        [box[2] + pad, box[3] + pad],
      ]);
      const maxZoom =
        clipFeature.properties && 'village_name' in (clipFeature.properties as object)
          ? 16
          : clipFeature.properties && 'mandal_name' in (clipFeature.properties as object)
            ? 14
            : 12;
      map.stop();
      map.fitBounds(
        [
          [box[0], box[1]],
          [box[2], box[3]],
        ],
        { padding: 40, pitch: Math.max(map.getPitch(), 50), maxZoom, duration: 900 }
      );
    }, [ready, viewActive, adminDrill?.level, adminDrill?.districtName, adminDrill?.mandalName, adminDrill?.villageName, clipFeature]);

    const lastViewToken = useRef<number | null>(null);
    const viewToken = viewTarget?.token;
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready || !viewTarget || clipFeature) return;
      if (lastViewToken.current === viewTarget.token) return;
      lastViewToken.current = viewTarget.token;
      map.easeTo({
        center: [viewTarget.lon, viewTarget.lat],
        zoom: clampMapZoom(viewTarget.zoom),
        pitch: Math.max(map.getPitch(), 45),
        duration: 0,
      });
    }, [ready, viewToken, viewTarget, clipFeature]);

    if (!webgl) {
      return (
        <div
          className="ap-maplibre-3d-root flex items-center justify-center bg-[#d4e6f2] p-6 text-center"
          data-testid="maplibre-3d-blocked"
        >
          <div className="max-w-md space-y-2">
            <p className="text-sm font-bold text-primary">3D view needs WebGL</p>
            <p className="text-xs text-on-surface-variant">
              This browser cannot start a WebGL map. Stay on the 2D layer — the existing Leaflet map is unchanged.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="ap-maplibre-3d-root" data-testid="maplibre-3d-root">
        <div ref={hostRef} className="absolute inset-0" />
        <div
          ref={identifyHostRef}
          className="ap-admin-identify pointer-events-none absolute top-14 left-14 z-10"
          data-testid="admin-hover-identify-3d"
          style={{ display: 'none' }}
        />
        <div className="pointer-events-none absolute bottom-8 left-12 z-10 max-w-sm rounded bg-surface-container-lowest/90 px-2 py-1 text-[9px] leading-snug text-on-surface-variant shadow-sm">
          <p>
            {MAP_VIEW_3D_NOTE} Terrain: {terrainStatus === 'ready' ? 'elevation on' : terrainStatus === 'flat' ? 'DEM unavailable, tilt still works' : 'blocked'}.
          </p>
          <p>{MAP_VIEW_3D_LAYER_LIMITS}</p>
          <p dangerouslySetInnerHTML={{ __html: MAPLIBRE_3D_ATTRIBUTION }} />
        </div>
      </div>
    );
  }
);

ApMapLibre3DMap.displayName = 'ApMapLibre3DMap';
