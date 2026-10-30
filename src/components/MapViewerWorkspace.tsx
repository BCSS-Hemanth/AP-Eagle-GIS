import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Crosshair,
  Download,
  Eraser,
  Eye,
  FileDown,
  Filter,
  Fingerprint,
  FolderOpen,
  Grid,
  Hand,
  Home,
  Layers,
  Lock,
  Map as MapIcon,
  Maximize2,
  Minus,
  Navigation,
  Palette,
  PanelBottom,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  PlusSquare,
  Ruler,
  Shield,
  Sliders,
  Square,
  Box,
  Table,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  AttributeTableMode,
  BasemapId,
  CrsId,
  DigitizedFeature,
  GisLayer,
  InspectableFeature,
  MapToolId,
  MapViewMode,
  PoliceStationRow,
  WorkspaceId,
} from '../types/gis';
import {
  downloadTextFile,
  formatCoordinates,
  geodesicPathKm,
  geodesicPolygonAreaSqKm,
  haversineKm,
} from '../utils/geoMath';
import { ApLeafletMap, ApLeafletMapHandle, MapClickMode } from './gis/ApLeafletMap';
import { ApMapLibre3DMap } from './gis/ApMapLibre3DMap';
import { MAP_VIEW_3D_LAYER_LIMITS, MAP_VIEW_3D_NOTE, webglIsAvailable } from '../gis/mapLibre3d';
import { AdminDrillBar } from './gis/AdminDrillBar';
import { type AdminDrill, STATE_ADMIN_DRILL, adminNamesEqual, featureCentroid } from '../gis/adminHierarchy';
import { useApBoundaries } from '../gis/useApBoundaries';
import { fetchSrtmElevation, nominatimSearch, osrmDrivingRoute } from '../gis/osmServices';
import {
  findLinkedStation,
  matchInspectableStation,
  namesMatch,
  policeStationsToRows,
  stationToInspectable,
  usePoliceStations,
} from '../gis/usePoliceStations';
import { featureToStationRow, placeToInspectable } from '../gis/searchTargets';
import { useAuth } from '../auth/AuthContext';

interface MapViewerWorkspaceProps {
  layers: GisLayer[];
  onToggleLayer: (id: string) => void;
  onChangeLayerOpacity: (id: string, opacity: number) => void;
  basemap: BasemapId;
  onChangeBasemap: (bm: BasemapId) => void;
  crs: CrsId;
  selectedFeatureId: string;
  onSelectFeature: (id: string) => void;
  selectedPsId: string | null;
  onSelectPsId: (id: string | null) => void;
  externalFocus: { lat: number; lon: number; zoom: number } | null;
  featuresMap: Record<string, InspectableFeature>;
  psRows: PoliceStationRow[];
  digitizedFeatures: DigitizedFeature[];
  onUpdateCenterCoords: (lat: number, lon: number) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onTriggerToast: (msg: string) => void;
  leftOpen: boolean;
  setLeftOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rightOpen: boolean;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bottomMode: 'expanded' | 'minimized' | 'closed';
  setBottomMode: React.Dispatch<React.SetStateAction<'expanded' | 'minimized' | 'closed'>>;
}

export const MapViewerWorkspace: React.FC<MapViewerWorkspaceProps> = ({
  layers,
  onToggleLayer,
  onChangeLayerOpacity,
  basemap,
  onChangeBasemap,
  crs,
  selectedFeatureId,
  onSelectFeature,
  selectedPsId,
  onSelectPsId,
  externalFocus,
  featuresMap,
  psRows,
  digitizedFeatures,
  onUpdateCenterCoords,
  onSwitchWorkspace,
  onTriggerToast,
  leftOpen,
  setLeftOpen,
  rightOpen,
  setRightOpen,
  bottomMode,
  setBottomMode,
}) => {
  const { can } = useAuth();
  const { districts } = useApBoundaries();
  const kmzStations = usePoliceStations(true);
  const stationRows = useMemo(() => policeStationsToRows(kmzStations), [kmzStations]);
  const pssRows = stationRows.length > 0 ? stationRows : psRows;
  const [adminInspect, setAdminInspect] = useState<InspectableFeature | null>(null);
  const [adminDrill, setAdminDrill] = useState<AdminDrill>(STATE_ADMIN_DRILL);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('2d');
  const [activeTool, setActiveTool] = useState<MapToolId>('inspect');
  const [spatialQuery, setSpatialQuery] = useState(
    ''
  );
  const [showSymbologySliders, setShowSymbologySliders] = useState(false);

  // Accordion open states
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'grp-admin': true,
    'grp-ops': true,
    'grp-transport': true,
    'grp-raster': true,
  });

  const [mapZoom, setMapZoom] = useState<number>(7);
  const [cursorLatLon, setCursorLatLon] = useState<{ lat: number; lon: number }>({
    lat: 18.3273,
    lon: 82.8775,
  });
  const [cursorElev, setCursorElev] = useState<number>(894);

  const [nearestRouteVisible, setNearestRouteVisible] = useState<boolean>(false);
  const [drivingRoute, setDrivingRoute] = useState<Array<{ lat: number; lon: number }>>([]);
  const [routeMeta, setRouteMeta] = useState<{ km: number; min: number; dest: string } | null>(null);
  const elevTimer = useRef<number | null>(null);

  const [measurePoints, setMeasurePoints] = useState<Array<{ lat: number; lon: number }>>([]);
  const [droppedPin, setDroppedPin] = useState<{
    lat: number;
    lon: number;
    elev: number;
  } | null>(null);

  // Case Dossier Modal
  const [caseModalOpen, setCaseModalOpen] = useState(false);

  // Attribute Table states
  const [tableDataset, setTableDataset] = useState<AttributeTableMode>('pss');
  const [tableFilter, setTableFilter] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const pageSize = 5;

  const viewportRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<ApLeafletMapHandle>(null);

  const selectedStation = useMemo(
    () => pssRows.find((row) => row.id === selectedPsId) ?? null,
    [pssRows, selectedPsId]
  );
  const selectedFeature = useMemo(() => {
    if (adminInspect) return adminInspect;
    if (selectedStation) {
      return stationToInspectable(
        selectedStation,
        matchInspectableStation(selectedStation, featuresMap)
      );
    }
    if (selectedFeatureId && featuresMap[selectedFeatureId]) {
      return featuresMap[selectedFeatureId];
    }
    return null;
  }, [adminInspect, selectedStation, featuresMap, selectedFeatureId]);

  const isLayerOn = (id: string) => layers.find((l) => l.id === id)?.enabled ?? false;
  const getLayerOpacity = (id: string) => (layers.find((l) => l.id === id)?.opacity ?? 100) / 100;

  const activeLayerCount = useMemo(() => layers.filter((l) => l.enabled).length, [layers]);

  const flyToLatLon = (lat: number, lon: number, zoom = 12) => {
    mapRef.current?.flyTo(lat, lon, zoom);
    onUpdateCenterCoords(lat, lon);
  };

  useEffect(() => {
    if (!externalFocus) return;
    flyToLatLon(externalFocus.lat, externalFocus.lon, externalFocus.zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFocus]);

  useEffect(() => {
    if (selectedPsId || adminInspect || externalFocus) return;
    const feat = featuresMap[selectedFeatureId];
    if (feat) flyToLatLon(feat.lat, feat.lon, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeatureId]);

  useEffect(() => {
    if (selectedPsId || adminInspect || pssRows.length === 0) return;
    const feat = featuresMap[selectedFeatureId];
    if (!feat) return;
    const linked = findLinkedStation(feat, pssRows);
    if (linked) onSelectPsId(linked.id);
  }, [pssRows, selectedFeatureId, selectedPsId, adminInspect, featuresMap, onSelectPsId]);

  const handleFlySearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = spatialQuery.trim();
    if (!q) return;

    const qLower = q.toLowerCase();
    const coordMatch = q.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/);

    const matchedStation = pssRows.find(
      (row) =>
        row.name.toLowerCase().includes(qLower) ||
        qLower.includes(row.name.toLowerCase()) ||
        namesMatch(row.name, q)
    );
    if (matchedStation && !coordMatch) {
      handleSelectStationRow(matchedStation);
      return;
    }

    const matchedDistrict = districts?.features.find((feature) => {
      const name = String((feature.properties as { district_name?: string } | null)?.district_name ?? '');
      return adminNamesEqual(name, q) || name.toLowerCase().includes(qLower);
    });
    if (matchedDistrict && !coordMatch) {
      const name = String(
        (matchedDistrict.properties as { district_name?: string } | null)?.district_name ?? q
      );
      const centroid = featureCentroid(matchedDistrict);
      setAdminDrill({
        level: 'district',
        districtName: name,
        districtFeature: matchedDistrict,
      });
      mapRef.current?.fitFeature(matchedDistrict);
      if (centroid) {
        handleInspectAdmin(
          placeToInspectable({
            id: `district:${name}`,
            kind: 'District',
            name,
            lat: centroid[1],
            lon: centroid[0],
            district: name,
          })
        );
      }
      onTriggerToast(`Isolated ${name} district`);
      return;
    }

    const matchedFeature = (Object.values(featuresMap) as InspectableFeature[]).find(
      (f) =>
        qLower.includes(f.code.toLowerCase()) ||
        qLower.includes(f.shortLabel.toLowerCase()) ||
        f.name.toLowerCase().includes(qLower)
    );

    if (matchedFeature) {
      handleSelectTargetOnMap(matchedFeature.id);
      return;
    }

    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[3]);
      flyToLatLon(lat, lon, 13);
      void sampleElevation(lat, lon).then((elev) => setDroppedPin({ lat, lon, elev }));
      onTriggerToast(`Centered viewport on coordinates ${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`);
      return;
    }

    void nominatimSearch(`${q}, Andhra Pradesh, India`).then((hit) => {
      if (!hit) {
        onTriggerToast(`No OSM geocode match for "${q}"`);
        return;
      }
      flyToLatLon(hit.lat, hit.lon, 12);
      void sampleElevation(hit.lat, hit.lon).then((elev) =>
        setDroppedPin({ lat: hit.lat, lon: hit.lon, elev })
      );
      onTriggerToast(`Nominatim: ${hit.label}`);
    });
  };

  const resetFullExtent = () => {
    setAdminDrill(STATE_ADMIN_DRILL);
    mapRef.current?.fitState();
    onUpdateCenterCoords(15.9129, 79.74);
    onTriggerToast('Reset map canvas to Andhra Pradesh State Full Extent (EPSG:4326)');
  };

  const canDrillAdmin =
    activeTool !== 'dist' && activeTool !== 'area' && activeTool !== 'boxzoom' && activeTool !== 'coord';

  const handleSelectTool = (tool: MapToolId) => {
    setActiveTool(tool);
    if (tool === 'dist' || tool === 'area') {
      setMeasurePoints([]);
    }
    const descriptions: Record<MapToolId, string> = {
      pan: 'Pan Tool Active: Drag anywhere on the map canvas to pan',
      boxzoom: 'Box Zoom Active: Click and drag a rectangle to zoom into sector',
      dist: 'Geodesic Distance Tool: Click points on map to measure distance in km',
      area: 'Geodesic Area Tool: Click 3+ vertices on map to compute sq km & Ha',
      inspect: 'Feature Inspector Active: Click vector targets on map to inspect attributes',
      buffer: 'Buffer rings are not drawn. No buffer dataset was supplied.',
      coord: 'Coordinate Inspector: Click anywhere on map to sample Lat/Lon & DEM elevation',
    };
    onTriggerToast(descriptions[tool]);
  };

  const handleClearSelection = () => {
    setNearestRouteVisible(false);
    setDrivingRoute([]);
    setRouteMeta(null);
    setMeasurePoints([]);
    setDroppedPin(null);
    onTriggerToast('Cleared routes and measurement geometries');
  };

  const sampleElevation = async (lat: number, lon: number): Promise<number> => {
    try {
      return await fetchSrtmElevation(lat, lon);
    } catch {
      return 0;
    }
  };

  const nearestStation = useMemo(() => {
    if (!selectedFeature) return null;
    let best: PoliceStationRow | null = null;
    let bestKm = Number.POSITIVE_INFINITY;
    for (const row of pssRows) {
      if (selectedStation && row.id === selectedStation.id) continue;
      const d = haversineKm(
        { lat: selectedFeature.lat, lon: selectedFeature.lon },
        { lat: row.lat, lon: row.lon }
      );
      if (d < 0.15) continue;
      if (d < bestKm) {
        bestKm = d;
        best = row;
      }
    }
    return best ? { row: best, km: Number(bestKm.toFixed(2)) } : null;
  }, [pssRows, selectedFeature, selectedStation]);

  const handleLeafletClick = async (lat: number, lon: number) => {
    if (activeTool === 'dist' || activeTool === 'area') {
      setMeasurePoints((prev) => [...prev, { lat, lon }]);
      return;
    }
    if (activeTool === 'coord') {
      const elev = await sampleElevation(lat, lon);
      setDroppedPin({ lat, lon, elev });
      onTriggerToast(
        `Sampled Point: ${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E • Elev ${elev} m MSL (SRTM)`
      );
    }
  };

  const handleSelectTargetOnMap = (featureId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const feat = featuresMap[featureId];
    if (!feat) return;
    const linked = findLinkedStation(feat, pssRows);
    setAdminInspect(null);
    onSelectPsId(linked?.id ?? null);
    onSelectFeature(featureId);
    const lat = linked?.lat ?? feat.lat;
    const lon = linked?.lon ?? feat.lon;
    setSpatialQuery(`${lat.toFixed(4)}, ${lon.toFixed(4)} (${linked?.name ?? feat.shortLabel})`);
    setRightOpen(true);
    flyToLatLon(lat, lon, 13);
    onTriggerToast(
      linked
        ? `Linked ${feat.name} → KMZ ${linked.name}`
        : `Selected Target: ${feat.name}`
    );
  };

  const handleSelectStationRow = (row: PoliceStationRow) => {
    setAdminInspect(null);
    onSelectPsId(row.id);
    setSpatialQuery(`${row.lat.toFixed(4)}, ${row.lon.toFixed(4)} (${row.name})`);
    flyToLatLon(row.lat, row.lon, 13);
    setRightOpen(true);
    const linked = matchInspectableStation(row, featuresMap);
    if (linked) onSelectFeature(linked.id);
    onTriggerToast(`Selected Police Station: ${row.name}`);
  };

  const handleInspectAdmin = (feature: InspectableFeature) => {
    if (activeTool === 'dist' || activeTool === 'area' || activeTool === 'boxzoom' || activeTool === 'coord') {
      return;
    }
    setAdminInspect(feature);
    onSelectPsId(null);
    setSpatialQuery(`${feature.lat.toFixed(4)}, ${feature.lon.toFixed(4)} (${feature.name})`);
    setRightOpen(true);
    onTriggerToast(`Identified ${feature.category}: ${feature.name}`);
  };

  // Filtered & paginated rows for Bottom Attribute Table
  const filteredRows = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    const inspectableRows = (category: InspectableFeature['category']) =>
      (Object.values(featuresMap) as InspectableFeature[])
        .filter((feature) => feature.category === category)
        .map(featureToStationRow);
    const source =
      tableDataset === 'pss'
        ? pssRows
        : tableDataset === 'checkposts'
          ? inspectableRows('Check Post')
          : tableDataset === 'hotspots'
            ? inspectableRows('Contraband Hotspot')
            : inspectableRows('Seizure Polygon');
    return source.filter((row) => {
      if (!q) return true;
      return (
        row.psCode.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.district.toLowerCase().includes(q) ||
        row.circle.toLowerCase().includes(q) ||
        row.stationType.toLowerCase().includes(q)
      );
    });
  }, [pssRows, featuresMap, tableFilter, tableDataset]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(tablePage, totalPages);
  const visibleRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleExportTableGeoJson = () => {
    if (!can('export')) {
      onTriggerToast('Export denied for your RBAC clearance');
      return;
    }
    const geojson = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: crs } },
      generatedAt: new Date().toISOString(),
      features: filteredRows.map((r) => ({
        type: 'Feature',
        properties: {
          psCode: r.psCode,
          name: r.name,
          district: r.district,
          circle: r.circle,
          contact: r.contact,
          stationType: r.stationType,
        },
        geometry: {
          type: 'Point',
          coordinates: [r.lon, r.lat],
        },
      })),
    };
    downloadTextFile(
      `eagle_ap_${tableDataset}_export.geojson`,
      JSON.stringify(geojson, null, 2),
      'application/geo+json'
    );
    onTriggerToast(`Exported ${filteredRows.length} spatial records as GeoJSON`);
  };

  const handleExportActiveFeature = () => {
    if (!can('export')) {
      onTriggerToast('Export denied for your RBAC clearance');
      return;
    }
    if (!selectedFeature) {
      onTriggerToast('Select a feature to export');
      return;
    }
    const geojson = {
      type: 'Feature',
      properties: {
        code: selectedFeature.code,
        name: selectedFeature.name,
        category: selectedFeature.category,
        district: selectedFeature.district,
        jurisdictionPs: selectedFeature.jurisdictionPs,
        roadClassification: selectedFeature.roadClassification,
        manningDetail: selectedFeature.manningDetail,
        sensorId: selectedFeature.sensorId,
        seizuresSummary: selectedFeature.seizuresSummary,
        inspectingOfficer: selectedFeature.inspectingOfficer,
      },
      geometry: {
        type: 'Point',
        coordinates: [selectedFeature.lon, selectedFeature.lat],
      },
    };
    downloadTextFile(
      `${selectedFeature.code.toLowerCase()}.geojson`,
      JSON.stringify(geojson, null, 2),
      'application/geo+json'
    );
    onTriggerToast(`Exported ${selectedFeature.code} vector package (.geojson)`);
  };

  const measuredKm = geodesicPathKm(measurePoints);
  const measuredAreaSqKm = geodesicPolygonAreaSqKm(measurePoints);

  const mapMarkers = useMemo(() => {
    const out: Array<{
      id: string;
      lat: number;
      lon: number;
      kind: 'checkpost' | 'hotspot' | 'station' | 'hq' | 'seizure' | 'city';
      label: string;
      selected?: boolean;
    }> = [];
    (Object.values(featuresMap) as InspectableFeature[]).forEach((f) => {
      const selected = f.id === selectedFeatureId;
      if (f.category === 'Check Post' && isLayerOn('lyr-checkposts')) {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'checkpost', label: f.name, selected });
      } else if (f.category === 'Contraband Hotspot' && isLayerOn('lyr-hotspots')) {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'hotspot', label: f.name, selected });
      } else if (f.category === 'Seizure Polygon' && isLayerOn('lyr-seizure-polys')) {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'seizure', label: f.name, selected });
      } else if (f.id === 'hq-amaravati') {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'hq', label: f.name, selected });
      }
    });
    return out;
  }, [featuresMap, selectedFeatureId, layers]);

  return (
    <div className="flex flex-col w-full h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden text-on-surface">
      {/* ================= TOP COMMAND & SPATIAL TOOLSTRIP ================= */}
      <div className="h-11 bg-surface-container-lowest border-b border-outline-variant/35 px-3 flex items-center justify-between gap-2 z-30 shrink-0 select-none">
        {/* Spatial Quick-Jump Search */}
        <form onSubmit={handleFlySearch} className="flex items-center w-72 xl:w-96 shrink-0">
          <div className="relative w-full flex items-center">
            <Compass className="w-3.5 h-3.5 absolute left-2.5 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              value={spatialQuery}
              onChange={(e) => setSpatialQuery(e.target.value)}
              placeholder="Search District, PS, NH/SH, or Lat, Lon..."
              className="w-full h-7.5 pl-8 pr-14 bg-surface-container-low rounded border border-outline-variant/45 font-mono text-[11px] text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary tabular-coord"
            />
            <button
              type="submit"
              className="absolute right-1 px-2 py-0.5 bg-primary text-on-primary rounded text-[10px] font-bold uppercase hover:bg-primary-container transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Fly</span>
              <Navigation className="w-2.5 h-2.5" />
            </button>
          </div>
        </form>

        {/* Map Manipulation Tool Palette */}
        <div className="flex items-center gap-0.5 bg-surface-container-low p-0.5 rounded border border-outline-variant/35 shrink-0">
          <button
            type="button"
            onClick={() => handleSelectTool('pan')}
            title="Pan Map (Drag)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
              activeTool === 'pan'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (mapViewMode === '3d') {
                onTriggerToast('Box zoom rectangle is 2D-only. Use scroll, pinch, or the pitch control in 3D.');
                return;
              }
              handleSelectTool('boxzoom');
            }}
            title={mapViewMode === '3d' ? 'Box zoom is 2D-only' : 'Box Zoom (Click & Drag)'}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
              activeTool === 'boxzoom'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            } ${mapViewMode === '3d' ? 'opacity-40' : ''}`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetFullExtent}
            title="AP State Full Extent"
            className="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-outline-variant/45 mx-0.5" />

          <button
            type="button"
            onClick={() => handleSelectTool('dist')}
            title="Measure Distance (km geodesic)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
              activeTool === 'dist'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSelectTool('area')}
            title="Measure Area (sq km / Ha)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
              activeTool === 'area'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Square className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSelectTool('inspect')}
            title="Identify / Inspect Vector Feature"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
              activeTool === 'inspect'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSelectTool('coord')}
            title="Coordinate & DEM Elevation Inspector"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer ${
              activeTool === 'coord'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-outline-variant/45 mx-0.5" />

          <button
            type="button"
            onClick={handleClearSelection}
            title="Clear Selection, Measurements & Buffers"
            className="flex items-center gap-1 px-2 h-7 rounded text-on-error-container hover:bg-error-container/50 text-[10.5px] font-bold transition-colors cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5 text-error" />
            <span>Clear</span>
          </button>
        </div>

        {/* Basemap Switcher & Panel Visibility Toggles */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div
            className="flex items-center rounded border border-outline-variant/40 overflow-hidden"
            role="group"
            aria-label="Map view mode"
          >
            <button
              type="button"
              data-testid="map-view-2d"
              onClick={() => {
                setMapViewMode('2d');
                onTriggerToast('2D layer restored. Leaflet GIS map is unchanged.');
              }}
              className={`flex items-center gap-1 h-7 px-2 text-[10.5px] font-bold cursor-pointer ${
                mapViewMode === '2d'
                  ? 'bg-secondary-container text-secondary'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              2D Layer
            </button>
            <button
              type="button"
              data-testid="map-view-3d"
              onClick={() => {
                if (!webglIsAvailable()) {
                  onTriggerToast('3D needs WebGL. Staying on the 2D layer.');
                  return;
                }
                if (activeTool === 'boxzoom') {
                  setActiveTool('pan');
                }
                setMapViewMode('3d');
                onTriggerToast(`${MAP_VIEW_3D_NOTE} ${MAP_VIEW_3D_LAYER_LIMITS}`);
              }}
              className={`flex items-center gap-1 h-7 px-2 text-[10.5px] font-bold cursor-pointer ${
                mapViewMode === '3d'
                  ? 'bg-secondary-container text-secondary'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              3D Layer
            </button>
          </div>
          <div className="hidden md:flex items-center gap-1.5 bg-surface-container-low px-2 py-1 rounded border border-outline-variant/40">
            <MapIcon className="w-3.5 h-3.5 text-secondary shrink-0" />
            <select
              value={basemap}
              disabled={mapViewMode === '3d'}
              title={mapViewMode === '3d' ? 'Basemap list applies to the 2D layer' : '2D basemap'}
              onChange={(e) => {
                const val = e.target.value as BasemapId;
                onChangeBasemap(val);
                onTriggerToast(`Basemap switched to ${e.target.options[e.target.selectedIndex].text}`);
              }}
              className="bg-transparent text-[11px] font-semibold text-on-surface focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value="maplibre">OSM Vector (MapLibre GL)</option>
              <option value="vector">OSM Raster (Leaflet)</option>
              <option value="topo">Survey of India Toposheet (1:50K)</option>
              <option value="satellite">High-Res Satellite (Esri imagery)</option>
              <option value="hybrid">Hybrid imagery + labels</option>
            </select>
          </div>

          <div className="flex items-center gap-0.5 border-l border-outline-variant/35 pl-2">
            <button
              type="button"
              onClick={() => setLeftOpen((v) => !v)}
              title="Toggle Layers & Legend (L)"
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                leftOpen
                  ? 'bg-surface-container text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setBottomMode((m) => (m === 'expanded' ? 'closed' : 'expanded'))
              }
              title="Toggle Attribute Table (T)"
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                bottomMode === 'expanded'
                  ? 'bg-surface-container text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <PanelBottom className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setRightOpen((v) => !v)}
              title="Toggle Feature Inspector (R)"
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                rightOpen
                  ? 'bg-surface-container text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ================= MAIN SPLIT-PANE GIS WORKSPACE ================= */}
      <div className="flex-1 flex min-h-0 min-w-0 relative overflow-hidden bg-surface-container">
        {/* 1. LEFT COLLAPSIBLE LAYER PANEL & LEGEND */}
        {leftOpen && (
          <aside className="w-72 bg-surface-container-lowest border-r border-outline-variant/35 flex flex-col z-20 shrink-0 select-none">
            {/* Panel Header */}
            <div className="p-2 border-b border-outline-variant/25 bg-surface-container-low/50 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-[12px] font-bold text-primary uppercase tracking-tight">
                    Active GIS Layers
                  </span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant tabular-coord">
                  {activeLayerCount} Active
                </span>
              </div>

              {/* Quick Action Bar */}
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => onSwitchWorkspace('vector-and-raster-data-import')}
                  className="px-1 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                >
                  <PlusSquare className="w-3.5 h-3.5 text-secondary" />
                  <span className="text-[9px] font-semibold">Add Layer</span>
                </button>
                <button
                  type="button"
                  onClick={resetFullExtent}
                  className="px-1 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[9px] font-semibold">Zoom Extent</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomMode('expanded')}
                  className="px-1 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
                >
                  <Table className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[9px] font-semibold">Attr Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSymbologySliders((s) => !s);
                    onTriggerToast(
                      !showSymbologySliders
                        ? 'Layer Opacity & Symbology controls enabled'
                        : 'Compact Layer Tree active'
                    );
                  }}
                  className={`px-1 py-1 rounded flex flex-col items-center gap-0.5 transition-colors cursor-pointer ${
                    showSymbologySliders
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-semibold">Symbology</span>
                </button>
              </div>
            </div>

            {/* Scrollable Layer Tree */}
            <div className="flex-1 overflow-y-auto gis-scroll p-2 space-y-2 text-xs">
              {(
                [
                  { id: 'grp-admin', title: 'Administrative Boundaries', isOps: false },
                  { id: 'grp-ops', title: 'Tactical Operations & Intelligence', isOps: true },
                  { id: 'grp-transport', title: 'Transportation Networks', isOps: false },
                  { id: 'grp-raster', title: 'Raster & Reference Grids', isOps: false },
                ] as const
              ).map((grp) => {
                const groupLayers = layers.filter((l) => l.groupId === grp.id);
                const enabledInGroup = groupLayers.filter((l) => l.enabled).length;
                const isOpen = openGroups[grp.id];

                return (
                  <div key={grp.id} className="border border-outline-variant/35 rounded overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenGroups((p) => ({ ...p, [grp.id]: !p[grp.id] }))}
                      className="w-full px-2 py-1.5 bg-surface-container hover:bg-surface-container-high flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div
                        className={`flex items-center gap-1 text-[11px] font-bold ${
                          grp.isOps ? 'text-error' : 'text-primary'
                        }`}
                      >
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="truncate">{grp.title}</span>
                      </div>
                      {grp.isOps ? (
                        <span className="px-1.5 py-0.2 rounded bg-error-container text-on-error-container text-[9px] font-bold tabular-coord shrink-0">
                          {enabledInGroup} LIVE
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-on-surface-variant tabular-coord shrink-0">
                          {enabledInGroup}/{groupLayers.length} on
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="p-1.5 space-y-1 bg-surface-container-lowest">
                        {groupLayers.map((lyr) => (
                          <div
                            key={lyr.id}
                            className={`rounded px-1 py-0.5 hover:bg-surface-container-low transition-colors ${
                              !lyr.enabled ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <label className="flex items-center gap-1.5 cursor-pointer min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  data-testid={`layer-toggle-${lyr.id}`}
                                  checked={lyr.enabled}
                                  onChange={() => onToggleLayer(lyr.id)}
                                  className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0"
                                />
                                {/* Layer Vector Swatch */}
                                {lyr.swatchType === 'line-navy' && (
                                  <span className="w-3 h-0.5 bg-primary rounded-full shrink-0" />
                                )}
                                {lyr.swatchType === 'poly-navy' && (
                                  <span className="w-3 h-2 bg-primary/15 border border-primary/60 shrink-0" />
                                )}
                                {lyr.swatchType === 'poly-slate' && (
                                  <span className="w-3 h-2 bg-surface-variant border border-outline-variant shrink-0" />
                                )}
                                {lyr.swatchType === 'poly-dotted' && (
                                  <span className="w-3 h-2 border border-dotted border-outline shrink-0" />
                                )}
                                {lyr.swatchType === 'point-ps' && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-secondary text-white text-[7px] flex items-center justify-center shrink-0">
                                    ★
                                  </span>
                                )}
                                {lyr.swatchType === 'pulse-red' && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-error shrink-0" />
                                )}
                                {lyr.swatchType === 'line-dashed-red' && (
                                  <span className="w-3.5 h-0 border-t-2 border-dashed border-error shrink-0" />
                                )}
                                {lyr.swatchType === 'icon-shield' && (
                                  <Shield className="w-3 h-3 text-primary shrink-0" />
                                )}
                                {lyr.swatchType === 'poly-indigo' && (
                                  <span className="w-2.5 h-2.5 rounded-xs bg-tertiary/20 border border-tertiary shrink-0" />
                                )}
                                {lyr.swatchType === 'poly-agency' && (
                                  <span className="w-3 h-2 bg-tertiary-fixed-dim/50 border border-tertiary shrink-0" />
                                )}
                                {lyr.swatchType === 'icon-factory' && (
                                  <Sliders className="w-3 h-3 text-on-surface-variant shrink-0" />
                                )}
                                {lyr.swatchType === 'line-highway' && (
                                  <span className="w-3 h-0.5 bg-[#e08434] shrink-0" />
                                )}
                                {lyr.swatchType === 'line-trail' && (
                                  <span className="w-3 h-0 border-t border-dotted border-secondary shrink-0" />
                                )}
                                {lyr.swatchType === 'line-rail' && (
                                  <span className="w-3 h-0.5 bg-outline shrink-0" />
                                )}
                                {lyr.swatchType === 'grid-topo' && (
                                  <Grid className="w-3 h-3 text-on-surface-variant shrink-0" />
                                )}
                                {lyr.swatchType === 'satellite-raster' && (
                                  <Eye className="w-3 h-3 text-on-surface-variant shrink-0" />
                                )}

                                <span
                                  className={`text-[11.5px] truncate ${
                                    lyr.highlightTone === 'secondary'
                                      ? 'font-semibold text-secondary'
                                      : lyr.highlightTone === 'error'
                                        ? 'font-semibold text-error'
                                        : 'text-on-surface'
                                  }`}
                                >
                                  {lyr.name}
                                </span>
                              </label>

                              <span className="text-[9.5px] font-mono text-on-surface-variant shrink-0 tabular-coord">
                                {lyr.id === 'lyr-asr-agency' ? (
                                  <Lock className="w-3 h-3 text-tertiary inline" />
                                ) : (
                                  lyr.metaRight
                                )}
                              </span>
                            </div>

                            {showSymbologySliders && lyr.enabled && (
                              <div className="pt-1 pb-0.5 pl-5 pr-1 flex items-center gap-2">
                                <input
                                  type="range"
                                  min={15}
                                  max={100}
                                  value={lyr.opacity}
                                  onChange={(e) => onChangeLayerOpacity(lyr.id, Number(e.target.value))}
                                  className="w-full h-1 accent-primary cursor-pointer"
                                />
                                <span className="text-[9px] font-mono text-outline w-7 text-right tabular-coord">
                                  {lyr.opacity}%
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Map Symbology Legend Footer */}
            <div className="p-2.5 border-t border-outline-variant/35 bg-surface-container-low/65 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                  Map Symbology Legend
                </span>
                <span className="text-[9.5px] font-mono text-on-surface-variant tabular-coord">
                  {crs}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10.5px] text-on-surface-variant">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded-full bg-error ring-2 ring-error-container shrink-0" />
                  <span className="truncate">Active Hotspot</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-3 h-3 rounded-xs bg-secondary text-[7.5px] text-white flex items-center justify-center font-bold shrink-0">
                    CP
                  </span>
                  <span className="truncate">Check Post</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-3.5 h-0 border-t-2 border-dashed border-error shrink-0" />
                  <span className="truncate">Agency Contraband</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* 2. CENTRAL CARTOGRAPHIC VIEWPORT + COORDINATE STRIP + ATTRIBUTE TABLE */}
        <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden flex flex-col bg-[#E6EFF8]">
          {/* MAP CANVAS — real OSM / Esri tiles + AP district GeoJSON */}
          <div ref={viewportRef} className="gis-map-host flex-1 min-h-0 min-w-0 select-none">
            {mapViewMode === '3d' ? (
            <ApMapLibre3DMap
              ref={mapRef}
              layoutRevision={`${leftOpen}-${rightOpen}-${bottomMode}`}
              showStateBorder={isLayerOn('lyr-state-border')}
              showDistricts={isLayerOn('lyr-districts')}
              districtOpacity={getLayerOpacity('lyr-districts')}
              stateOpacity={getLayerOpacity('lyr-state-border')}
              showHighways={isLayerOn('lyr-highways')}
              showAgencyRoutes={isLayerOn('lyr-drug-routes')}
              showRailways={isLayerOn('lyr-railways')}
              showRivers={isLayerOn('lyr-rivers')}
              showTrails={isLayerOn('lyr-forest-trails')}
              showMandals={isLayerOn('lyr-mandals')}
              showVillages={isLayerOn('lyr-villages')}
              showPoliceStations={isLayerOn('lyr-pss')}
              mandalOpacity={getLayerOpacity('lyr-mandals')}
              villageOpacity={getLayerOpacity('lyr-villages')}
              policeStationOpacity={getLayerOpacity('lyr-pss')}
              selectedPoliceStationId={selectedPsId ?? undefined}
              showImageryOverlay={isLayerOn('lyr-cartosat')}
              markers={mapMarkers}
              route={drivingRoute}
              measurePoints={measurePoints}
              measureMode={activeTool === 'dist' || activeTool === 'area' ? activeTool : null}
              droppedPin={droppedPin}
              clickMode={activeTool as MapClickMode}
              onMapClick={handleLeafletClick}
              onMarkerClick={(id) => {
                const fid =
                  (Object.keys(featuresMap) as string[]).find(
                    (k) => id === k || id.startsWith(`${k}-`)
                  ) ?? id;
                handleSelectTargetOnMap(fid);
              }}
              adminDrill={adminDrill}
              onDistrictClick={(name, lat, lon, feature) => {
                if (canDrillAdmin) {
                  setAdminDrill({
                    level: 'district',
                    districtName: name,
                    districtFeature: feature,
                  });
                }
                handleInspectAdmin(
                  placeToInspectable({
                    id: `district:${name}`,
                    kind: 'District',
                    name,
                    lat,
                    lon,
                    district: name,
                  })
                );
              }}
              onMandalClick={(name, lat, lon, district, feature) => {
                if (canDrillAdmin) {
                  setAdminDrill((prev) => ({
                    level: 'mandal',
                    districtName: prev.districtName ?? district,
                    districtFeature: prev.districtFeature,
                    mandalName: name,
                    mandalFeature: feature,
                  }));
                }
                handleInspectAdmin(
                  placeToInspectable({
                    id: `mandal:${name}`,
                    kind: 'Mandal',
                    name,
                    lat,
                    lon,
                    district: adminDrill.districtName ?? district,
                    parent: adminDrill.districtName ?? district,
                  })
                );
              }}
              onVillageClick={(name, lat, lon, mandal, district, feature) => {
                if (canDrillAdmin) {
                  setAdminDrill((prev) => ({
                    level: 'village',
                    districtName: prev.districtName ?? district,
                    districtFeature: prev.districtFeature,
                    mandalName: prev.mandalName ?? mandal,
                    mandalFeature: prev.mandalFeature,
                    villageName: name,
                    villageFeature: feature,
                  }));
                }
                handleInspectAdmin(
                  placeToInspectable({
                    id: `village:${name}`,
                    kind: 'Village',
                    name,
                    lat,
                    lon,
                    district: adminDrill.districtName ?? district,
                    parent: adminDrill.mandalName ?? mandal,
                  })
                );
              }}
              onPoliceStationClick={(id, name, lat, lon) => {
                const row = stationRows.find((r) => r.id === id);
                handleSelectStationRow(
                  row ?? {
                    id,
                    psCode: id,
                    name,
                    district: 'Unspecified',
                    circle: '—',
                    contact: '—',
                    stationType: 'Border PS',
                    lat,
                    lon,
                    svgX: 0,
                    svgY: 0,
                    featureId: id,
                  }
                );
              }}
              onViewChange={(lat, lon, zoom) => {
                setMapZoom(zoom);
                onUpdateCenterCoords(lat, lon);
              }}
              onCursorMove={(lat, lon) => {
                setCursorLatLon({ lat, lon });
                if (elevTimer.current) window.clearTimeout(elevTimer.current);
                elevTimer.current = window.setTimeout(() => {
                  void sampleElevation(lat, lon).then(setCursorElev);
                }, 700);
              }}
            />
            ) : (
            <ApLeafletMap
              ref={mapRef}
              layoutRevision={`${leftOpen}-${rightOpen}-${bottomMode}`}
              basemap={basemap}
              showStateBorder={isLayerOn('lyr-state-border')}
              showDistricts={isLayerOn('lyr-districts')}
              districtOpacity={getLayerOpacity('lyr-districts')}
              stateOpacity={getLayerOpacity('lyr-state-border')}
              showHighways={isLayerOn('lyr-highways')}
              showAgencyRoutes={isLayerOn('lyr-drug-routes')}
              showRailways={isLayerOn('lyr-railways')}
              showGraticule={isLayerOn('lyr-soi-grid')}
              showRivers={isLayerOn('lyr-rivers')}
              showTrails={isLayerOn('lyr-forest-trails')}
              showPlaces={isLayerOn('lyr-mandals') || isLayerOn('lyr-villages')}
              showMandals={isLayerOn('lyr-mandals')}
              showVillages={isLayerOn('lyr-villages')}
              showPoliceStations={isLayerOn('lyr-pss')}
              mandalOpacity={getLayerOpacity('lyr-mandals')}
              villageOpacity={getLayerOpacity('lyr-villages')}
              policeStationOpacity={getLayerOpacity('lyr-pss')}
              selectedPoliceStationId={selectedPsId ?? undefined}
              showImageryOverlay={isLayerOn('lyr-cartosat')}
              highlightAgency={isLayerOn('lyr-asr-agency')}
              markers={mapMarkers}
              digitizedFeatures={digitizedFeatures}
              route={drivingRoute}
              measurePoints={measurePoints}
              measureMode={activeTool === 'dist' || activeTool === 'area' ? activeTool : null}
              droppedPin={droppedPin}
              clickMode={activeTool as MapClickMode}
              onMapClick={handleLeafletClick}
              onMarkerClick={(id) => {
                const fid =
                  (Object.keys(featuresMap) as string[]).find(
                    (k) => id === k || id.startsWith(`${k}-`)
                  ) ?? id;
                handleSelectTargetOnMap(fid);
              }}
              adminDrill={adminDrill}
              onDistrictClick={(name, lat, lon, feature) => {
                if (canDrillAdmin) {
                  setAdminDrill({
                    level: 'district',
                    districtName: name,
                    districtFeature: feature,
                  });
                }
                handleInspectAdmin(
                  placeToInspectable({
                    id: `district:${name}`,
                    kind: 'District',
                    name,
                    lat,
                    lon,
                    district: name,
                  })
                );
              }}
              onMandalClick={(name, lat, lon, district, feature) => {
                if (canDrillAdmin) {
                  setAdminDrill((prev) => ({
                    level: 'mandal',
                    districtName: prev.districtName ?? district,
                    districtFeature: prev.districtFeature,
                    mandalName: name,
                    mandalFeature: feature,
                  }));
                }
                handleInspectAdmin(
                  placeToInspectable({
                    id: `mandal:${name}`,
                    kind: 'Mandal',
                    name,
                    lat,
                    lon,
                    district: adminDrill.districtName ?? district,
                    parent: adminDrill.districtName ?? district,
                  })
                );
              }}
              onVillageClick={(name, lat, lon, mandal, district, feature) => {
                if (canDrillAdmin) {
                  setAdminDrill((prev) => ({
                    level: 'village',
                    districtName: prev.districtName ?? district,
                    districtFeature: prev.districtFeature,
                    mandalName: prev.mandalName ?? mandal,
                    mandalFeature: prev.mandalFeature,
                    villageName: name,
                    villageFeature: feature,
                  }));
                }
                handleInspectAdmin(
                  placeToInspectable({
                    id: `village:${name}`,
                    kind: 'Village',
                    name,
                    lat,
                    lon,
                    district: adminDrill.districtName ?? district,
                    parent: adminDrill.mandalName ?? mandal,
                  })
                );
              }}
              onPoliceStationClick={(id, name, lat, lon) => {
                const row = stationRows.find((r) => r.id === id);
                handleSelectStationRow(
                  row ?? {
                    id,
                    psCode: id,
                    name,
                    district: 'Unspecified',
                    circle: '—',
                    contact: '—',
                    stationType: 'Border PS',
                    lat,
                    lon,
                    svgX: 0,
                    svgY: 0,
                    featureId: id,
                  }
                );
              }}
              onViewChange={(lat, lon, zoom) => {
                setMapZoom(zoom);
                onUpdateCenterCoords(lat, lon);
              }}
              onCursorMove={(lat, lon) => {
                setCursorLatLon({ lat, lon });
                if (elevTimer.current) window.clearTimeout(elevTimer.current);
                elevTimer.current = window.setTimeout(() => {
                  void sampleElevation(lat, lon).then(setCursorElev);
                }, 700);
              }}
            />
            )}

            <div className="absolute top-3 left-14 right-14 z-20 flex justify-center pointer-events-none">
              <AdminDrillBar
                drill={adminDrill}
                onChange={(next) => {
                  setAdminDrill(next);
                  if (next.level === 'state') {
                    onTriggerToast('Returned to Andhra Pradesh district view');
                    return;
                  }
                  const label =
                    next.level === 'village'
                      ? next.villageName
                      : next.level === 'mandal'
                        ? next.mandalName
                        : next.districtName;
                  onTriggerToast(`Showing ${next.level}: ${label ?? ''}`);
                }}
              />
            </div>

            {nearestRouteVisible && routeMeta && (
              <div className="absolute top-16 left-14 bg-secondary text-on-secondary px-3 py-1.5 rounded shadow-md border border-secondary/50 text-xs flex items-center gap-3 z-20 tabular-coord">
                <span className="font-semibold uppercase text-[10px]">OSM driving (OSRM)</span>
                <span className="font-mono font-bold">
                  {routeMeta.dest} • {routeMeta.km} km • {routeMeta.min} min
                </span>
              </div>
            )}

            {/* Live Measurement Readout Pill */}
            {(activeTool === 'dist' || activeTool === 'area') && (
              <div className="absolute top-16 left-14 bg-primary text-on-primary px-3 py-1.5 rounded shadow-md border border-secondary/50 text-xs flex items-center gap-3 z-20 tabular-coord">
                <span className="font-semibold text-secondary-fixed uppercase text-[10px]">
                  {activeTool === 'dist' ? 'Geodesic Path' : 'Polygon Area'}
                </span>
                <span className="font-mono font-bold">
                  {activeTool === 'dist'
                    ? `${measuredKm.toFixed(2)} km (${measurePoints.length} pts)`
                    : `${measuredAreaSqKm.toFixed(2)} sq km • ${(measuredAreaSqKm * 100).toFixed(0)} Ha`}
                </span>
                {measurePoints.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMeasurePoints([])}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 hover:bg-white/25 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            {/* FLOATING MAP CONTROLS DOCK (Top Left of Canvas) */}
            <div className="absolute top-3 left-3 flex flex-col bg-surface-container-lowest/95 backdrop-blur-xs rounded shadow-md border border-outline-variant/45 overflow-hidden z-10">
              <button
                type="button"
                data-testid="map-zoom-in"
                onClick={() => mapRef.current?.zoomIn()}
                title="Zoom In (+)"
                className="w-8 h-8 flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors border-b border-outline-variant/25 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => mapRef.current?.zoomOut()}
                title="Zoom Out (-)"
                className="w-8 h-8 flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors border-b border-outline-variant/25 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={resetFullExtent}
                title="AP State Full Extent"
                className="w-8 h-8 flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors border-b border-outline-variant/25 cursor-pointer"
              >
                <Home className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleLayer('lyr-soi-grid');
                  onTriggerToast('Toggled SOI 50K Topographic Graticule Grid');
                }}
                title="Toggle SOI 50K Topo Grid"
                className={`w-8 h-8 flex items-center justify-center transition-colors cursor-pointer ${
                  isLayerOn('lyr-soi-grid')
                    ? 'bg-secondary-container/40 text-secondary'
                    : 'text-on-surface hover:bg-surface-container'
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>

            {/* FLOATING TACTICAL NORTH ARROW & COMPASS (Top Right) */}
            <div className="absolute top-3 right-3 flex flex-col items-center bg-surface-container-lowest/92 backdrop-blur-xs px-2 py-1.5 rounded shadow-md border border-outline-variant/45 z-10">
              <div className="w-6 h-6 relative flex items-center justify-center">
                <svg viewBox="0 0 40 40" className="w-full h-full">
                  <polygon points="20,2 24,18 20,15 16,18" fill="#ba1a1a" />
                  <polygon points="20,38 24,22 20,25 16,22" fill="#74777e" />
                  <circle cx="20" cy="20" r="2" fill="#001428" />
                </svg>
              </div>
              <span className="text-[9px] font-bold text-primary -mt-0.5">N</span>
            </div>

            {/* GRAPHIC SCALE BAR & PROJECTION HUD (Bottom Left) */}
            <div className="absolute bottom-3 left-3 flex items-end gap-2.5 z-10 pointer-events-none">
              <div className="bg-surface-container-lowest/92 backdrop-blur-xs px-2.5 py-1.5 rounded shadow border border-outline-variant/45 flex flex-col">
                <div className="flex justify-between font-mono text-[9px] text-on-surface-variant mb-0.5 tabular-coord">
                  <span>0</span>
                  <span>10</span>
                  <span>25</span>
                  <span>50 km</span>
                </div>
                <div className="flex h-1.5 w-32 border border-primary">
                  <div className="w-1/4 bg-primary" />
                  <div className="w-1/4 bg-surface-container-lowest" />
                  <div className="w-1/4 bg-primary" />
                  <div className="w-1/4 bg-surface-container-lowest" />
                </div>
                <span className="font-mono text-[8.5px] text-outline mt-0.5 text-center tabular-coord">
                  1 : 50,000 (SOI Grid Zone 44P)
                </span>
              </div>

              <div className="hidden sm:flex bg-surface-container-lowest/92 backdrop-blur-xs px-2 py-1 rounded shadow border border-outline-variant/45 items-center gap-1.5 font-mono text-[10px] text-on-surface tabular-coord">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span>WGS84 • {crs}</span>
              </div>
            </div>

            {/* MINIMAP OVERVIEW INSET (Bottom Right) */}
            <div className="hidden sm:flex absolute bottom-3 right-3 w-36 h-24 bg-surface-container-lowest/95 backdrop-blur-xs rounded shadow-lg border border-outline-variant/50 overflow-hidden flex-col z-10">
              <div className="h-4 bg-surface-container px-1.5 flex items-center justify-between text-[8px] font-bold text-on-surface-variant border-b border-outline-variant/30">
                <span>OVERVIEW EXTENT</span>
                <span className="text-secondary font-mono">1:500K</span>
              </div>
              <div className="gis-map-host flex-1">
                <ApLeafletMap
                  basemap="vector"
                  showStateBorder
                  showDistricts
                  initialZoom={6}
                  clickMode="pan"
                />
              </div>
            </div>
          </div>

          {/* CARTOGRAPHIC COORDINATE & TELEMETRY BOTTOM STRIP */}
          <div className="h-6 bg-surface-container-lowest border-t border-outline-variant/35 px-3 flex items-center justify-between gap-4 font-mono text-[10.5px] text-on-surface-variant z-20 shrink-0 select-none overflow-x-auto whitespace-nowrap tabular-coord">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1">
                <Compass className="w-3 h-3 text-secondary shrink-0" />
                <span className="font-bold text-on-surface">Cursor:</span>
                <span>{formatCoordinates(cursorLatLon.lat, cursorLatLon.lon, crs, crs === 'EPSG:4326')}</span>
              </div>
              <span className="text-outline-variant">|</span>
              <div>
                <span>Elev: </span>
                <span className="text-on-surface font-semibold">{cursorElev} m MSL</span>
              </div>
              <span className="text-outline-variant">|</span>
              <div>
                <span>Grid: </span>
                <span>{selectedFeature?.soiGrid ?? '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1 text-secondary font-sans font-bold text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span>WMS FEED: ONLINE</span>
              </div>
              <span className="text-outline-variant">|</span>
              <div>
                <span>Zoom: </span>
                <span className="text-primary font-bold" data-testid="map-zoom">
                  {mapZoom.toFixed(1)}
                </span>
              </div>
              <span className="text-outline-variant hidden xl:inline">|</span>
              <span className="hidden xl:inline text-[10px] font-sans">
                Survey of India © AP GIS Center
              </span>
            </div>
          </div>

          {/* 3. BOTTOM COLLAPSIBLE ATTRIBUTE TABLE TRAY */}
          {bottomMode !== 'closed' && (
            <div
              className={`bg-surface-container-lowest border-t border-outline-variant/45 flex flex-col z-20 shrink-0 transition-all duration-150 ${
                bottomMode === 'expanded' ? 'h-52' : 'h-7'
              }`}
            >
              {/* Tray Header */}
              <div className="h-7 bg-surface-container-low px-3 flex items-center justify-between gap-2 border-b border-outline-variant/25 select-none shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Table className="w-3.5 h-3.5 text-secondary shrink-0" />
                  <select
                    value={tableDataset}
                    onChange={(e) => {
                      setTableDataset(e.target.value as AttributeTableMode);
                      setTablePage(1);
                    }}
                    className="bg-transparent text-[11px] font-bold text-primary uppercase tracking-tight focus:outline-none cursor-pointer truncate"
                  >
                    <option value="pss">ATTRIBUTE TABLE: Police Stations (KMZ)</option>
                    <option value="checkposts">ATTRIBUTE TABLE: Mapped Check Posts</option>
                    <option value="hotspots">ATTRIBUTE TABLE: Mapped Hotspots</option>
                    <option value="seizures">ATTRIBUTE TABLE: Seizure Polygons</option>
                  </select>
                  <span className="px-1.5 py-0.2 rounded bg-surface-container text-on-surface font-mono text-[10px] shrink-0 tabular-coord">
                    {tableDataset === 'pss' ? `${filteredRows.length} Records` : `${filteredRows.length} Active`}
                  </span>

                  {/* Filter Input */}
                  <div className="relative hidden sm:flex items-center ml-1">
                    <Filter className="w-2.5 h-2.5 absolute left-1.5 text-outline pointer-events-none" />
                    <input
                      type="text"
                      value={tableFilter}
                      onChange={(e) => {
                        setTableFilter(e.target.value);
                        setTablePage(1);
                      }}
                      placeholder="Filter rows in active view..."
                      className="h-5 w-44 pl-5 pr-2 bg-surface-container-lowest rounded text-[10.5px] border border-outline-variant/45 focus:outline-none focus:border-secondary"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="export-table"
                    disabled={!can('export')}
                    onClick={handleExportTableGeoJson}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export CSV/GeoJSON</span>
                  </button>
                  <div className="w-px h-3.5 bg-outline-variant/35" />
                  <button
                    type="button"
                    onClick={() =>
                      setBottomMode((m) => (m === 'expanded' ? 'minimized' : 'expanded'))
                    }
                    title={bottomMode === 'expanded' ? 'Minimize Table' : 'Expand Table'}
                    className="p-0.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        bottomMode === 'minimized' ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomMode('closed')}
                    title="Close Attribute Table"
                    className="p-0.5 rounded text-on-surface-variant hover:text-error hover:bg-error-container/35 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Grid Body */}
              {bottomMode === 'expanded' && (
                <>
                  <div className="flex-1 overflow-auto gis-scroll text-xs">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead className="sticky top-0 bg-surface-container text-on-surface-variant text-[10.5px] font-bold uppercase tracking-wider border-b border-outline-variant/35 z-10">
                        <tr>
                          <th className="py-1 px-2 w-8 text-center">#</th>
                          <th className="py-1 px-2">PS CODE</th>
                          <th className="py-1 px-3">POLICE STATION NAME</th>
                          <th className="py-1 px-3">DISTRICT</th>
                          <th className="py-1 px-3">SUB-DIVISION / CIRCLE</th>
                          <th className="py-1 px-2">CONTACT NO</th>
                          <th className="py-1 px-2">STATION TYPE</th>
                          <th className="py-1 px-2">LATITUDE</th>
                          <th className="py-1 px-2">LONGITUDE</th>
                          <th className="py-1 px-2 text-center">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20 text-[11.5px] tabular-coord">
                        {visibleRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-6 text-center text-on-surface-variant">
                              No police station records match &ldquo;{tableFilter}&rdquo;.
                            </td>
                          </tr>
                        ) : (
                          visibleRows.map((row, idx) => {
                            const isSelected = selectedPsId === row.id || selectedFeatureId === row.featureId;
                            const rowNum = (safePage - 1) * pageSize + idx + 1;
                            return (
                              <tr
                                key={row.id}
                                data-testid={`ps-row-${row.id}`}
                                onClick={() =>
                                  tableDataset === 'pss'
                                    ? handleSelectStationRow(row)
                                    : handleSelectTargetOnMap(row.featureId)
                                }
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-secondary-container/25 hover:bg-secondary-container/35'
                                    : idx % 2 === 1
                                      ? 'bg-surface-container-low/30 hover:bg-surface-container-low'
                                      : 'bg-surface-container-lowest hover:bg-surface-container-low'
                                }`}
                              >
                                <td className="py-1 px-2 text-center font-mono text-[10px]">
                                  {isSelected ? (
                                    <span className="text-secondary font-bold">●</span>
                                  ) : (
                                    <span className="text-outline">{rowNum}</span>
                                  )}
                                </td>
                                <td className="py-1 px-2 font-mono font-semibold text-primary">
                                  {row.psCode}
                                </td>
                                <td className="py-1 px-3 font-semibold text-primary">{row.name}</td>
                                <td className="py-1 px-3 text-on-surface">{row.district}</td>
                                <td className="py-1 px-3 text-on-surface-variant">{row.circle}</td>
                                <td className="py-1 px-2 font-mono text-on-surface-variant">
                                  {row.contact}
                                </td>
                                <td className="py-1 px-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                      row.stationType === 'High Contraband'
                                        ? 'bg-error-container text-on-error-container'
                                        : row.stationType === 'Hill Agency'
                                          ? 'bg-secondary/15 text-secondary'
                                          : row.stationType === 'Capital Command'
                                            ? 'bg-primary-fixed text-primary'
                                            : 'bg-surface-container text-on-surface-variant'
                                    }`}
                                  >
                                    {row.stationType}
                                  </span>
                                </td>
                                <td className="py-1 px-2 font-mono">{row.lat.toFixed(4)}° N</td>
                                <td className="py-1 px-2 font-mono">{row.lon.toFixed(4)}° E</td>
                                <td className="py-1 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (tableDataset === 'pss') {
                                        handleSelectStationRow(row);
                                      } else {
                                        handleSelectTargetOnMap(row.featureId);
                                        flyToLatLon(row.lat, row.lon, 13);
                                      }
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                                      isSelected
                                        ? 'bg-primary text-on-primary hover:bg-primary-container'
                                        : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                                    }`}
                                  >
                                    Zoom
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="h-6 bg-surface-container-low px-3 flex items-center justify-between border-t border-outline-variant/25 text-[10px] text-on-surface-variant shrink-0 tabular-coord">
                    <span className="truncate">
                      Showing {(safePage - 1) * pageSize + 1} to{' '}
                      {Math.min(safePage * pageSize, filteredRows.length)} of{' '}
                      {filteredRows.length} stations
                      {tableDataset === 'pss' ? ' from Police Stations.kmz' : ' from mapped operational layers'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        className="px-1.5 py-0.5 rounded bg-surface-container hover:bg-surface-container-high disabled:opacity-40 cursor-pointer"
                      >
                        Prev
                      </button>
                      <span className="px-1.5 font-semibold text-primary">
                        Page {safePage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                        className="px-1.5 py-0.5 rounded bg-surface-container hover:bg-surface-container-high disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 4. RIGHT COLLAPSIBLE FEATURE INSPECTOR & SPATIAL INTEL */}
        {rightOpen && (
          <aside className="w-80 bg-surface-container-lowest border-l border-outline-variant/35 flex flex-col z-20 shrink-0">
            {/* Drawer Header */}
            <div className="p-2.5 border-b border-outline-variant/25 bg-surface-container-low/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-secondary shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span className="text-[12px] font-bold text-primary uppercase tracking-tight">
                    Feature Inspector
                  </span>
                  <span className="text-[9.5px] font-medium text-on-surface-variant">
                    Active Geospatial Vector Target
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                title="Close Inspector"
                className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feature Content Scroll Area */}
            <div className="flex-1 overflow-y-auto gis-scroll p-2.5 space-y-3 text-xs">
              {!selectedFeature && (
                <p className="p-3 text-[12px] text-on-surface-variant leading-relaxed">
                  No operational record is selected. Click a KMZ police station or an administrative polygon. Case files, ANPR, and seizure fields stay empty until you provide that data.
                </p>
              )}
              {selectedFeature && (
              <>
              {/* Feature Summary Card */}
              <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/35 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide ${
                      selectedFeature.severity === 'critical'
                        ? 'bg-error-container text-on-error-container'
                        : selectedFeature.severity === 'warning'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-secondary-container/50 text-on-secondary-container'
                    }`}
                  >
                    {selectedFeature.statusBadge}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-[9.5px] font-bold whitespace-nowrap ${
                      selectedFeature.severity === 'critical' ? 'text-error' : 'text-secondary'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedFeature.severity === 'critical' ? 'bg-error' : 'bg-secondary'
                      }`}
                    />
                    {selectedFeature.liveIndicator}
                  </span>
                </div>

                <h2
                  className="text-[14.5px] font-bold text-primary leading-snug"
                  data-testid="inspector-title"
                >
                  {selectedFeature.name}
                </h2>
                <div className="flex items-center gap-1 text-on-surface-variant font-mono text-[10.5px] tabular-coord">
                  <Crosshair className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate">{selectedFeature.geometryLabel}</span>
                </div>
              </div>

              <div className="border border-outline-variant/35 rounded overflow-hidden">
                <div className="px-2.5 py-1.5 bg-surface-container text-primary text-[10.5px] font-bold uppercase tracking-wider border-b border-outline-variant/25">
                  Feature Attribute Record
                </div>
                <div className="divide-y divide-outline-variant/20 text-[11px] tabular-coord">
                  {(
                    [
                      { label: 'District', value: selectedFeature.district, bold: true },
                      { label: 'Source', value: selectedFeature.manningDetail, mono: true },
                      { label: 'Category', value: selectedFeature.category, bold: true },
                    ] as Array<{
                      label: string;
                      value: string;
                      bold?: boolean;
                      mono?: boolean;
                      accent?: 'error' | 'secondary';
                    }>
                  ).map((attr, i) => (
                    <div
                      key={attr.label}
                      className={`py-1.5 px-2.5 flex items-baseline justify-between gap-3 ${
                        i % 2 === 1 ? 'bg-surface-container-low/35' : 'bg-surface-container-lowest'
                      }`}
                    >
                      <span className="text-on-surface-variant font-medium shrink-0">
                        {attr.label}
                      </span>
                      <span
                        className={`text-right leading-snug ${attr.mono ? 'font-mono text-[10.5px]' : ''} ${
                          attr.accent === 'error'
                            ? 'font-bold text-error'
                            : attr.accent === 'secondary'
                              ? 'font-semibold text-secondary'
                              : attr.bold
                                ? 'font-semibold text-primary'
                                : 'text-on-surface'
                        }`}
                      >
                        {attr.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Geoprocessing Actions */}
              <div className="space-y-1.5 pt-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-outline block">
                  Geoprocessing Actions
                </span>

                <button
                  type="button"
                  onClick={() => {
                    if (!nearestStation) {
                      onTriggerToast('No other police station in the operational set');
                      return;
                    }
                    setNearestRouteVisible(true);
                    flyToLatLon(selectedFeature.lat, selectedFeature.lon, 12);
                    void osrmDrivingRoute(
                      { lat: selectedFeature.lat, lon: selectedFeature.lon },
                      { lat: nearestStation.row.lat, lon: nearestStation.row.lon }
                    ).then((route) => {
                      if (!route) {
                        onTriggerToast('OSRM could not resolve a driving path on the OSM road network');
                        return;
                      }
                      setDrivingRoute(route.points);
                      setRouteMeta({
                        km: route.distanceKm,
                        min: route.durationMin,
                        dest: nearestStation.row.name,
                      });
                      onTriggerToast(
                        `OSM driving route to ${nearestStation.row.name}: ${route.distanceKm} km / ${route.durationMin} min`
                      );
                    });
                  }}
                  className="w-full py-1.5 px-2.5 bg-surface-container hover:bg-surface-container-high rounded text-on-surface text-[11.5px] font-semibold transition-colors flex items-center justify-between border border-outline-variant/35 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    <span>Find Nearest Police Station</span>
                  </span>
                  <span className="font-mono text-[10px] text-on-surface-variant tabular-coord">
                    {nearestStation ? `${nearestStation.km} km` : `${selectedFeature.nearestPsDistanceKm} km`}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="export-feature"
                  disabled={!can('export')}
                  onClick={handleExportActiveFeature}
                  className="w-full py-1.5 px-2.5 bg-surface-container hover:bg-surface-container-high rounded text-on-surface text-[11.5px] font-semibold transition-colors flex items-center justify-between border border-outline-variant/35 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5 text-primary" />
                    <span>Export Feature (KML / GeoJSON)</span>
                  </span>
                  <Download className="w-3.5 h-3.5 text-on-surface-variant" />
                </button>

                <button
                  type="button"
                  onClick={() => setCaseModalOpen(true)}
                  className="w-full py-1.5 px-2.5 bg-error text-on-error rounded text-[11.5px] font-semibold hover:bg-error/90 transition-colors flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Interception Case Files</span>
                  </span>
                  <span className="text-[9.5px] font-bold bg-white/20 px-1.5 py-0.5 rounded tabular-coord">
                    {selectedFeature.cases.length} files
                  </span>
                </button>
              </div>
              </>
              )}
            </div>

            <div className="p-2.5 border-t border-outline-variant/25 bg-surface-container-low text-[10px] select-none">
              <span className="text-on-surface-variant font-semibold">No live sensor feed loaded</span>
            </div>
          </aside>
        )}
      </div>

      {/* INTERCEPTION CASE DOSSIER MODAL */}
      {caseModalOpen && selectedFeature && (
        <div className="fixed inset-0 bg-primary/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg shadow-2xl border border-outline-variant/50 w-full max-w-2xl overflow-hidden">
            <div className="px-4 py-3 bg-primary text-on-primary flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-secondary-fixed block">
                  EAGLE Force NDPS Spatial Case Register
                </span>
                <h3 className="text-sm font-bold">{selectedFeature.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCaseModalOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2.5 text-xs tabular-coord">
                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/30">
                  <div className="text-[10px] text-on-surface-variant uppercase font-bold">
                    Target Code
                  </div>
                  <div className="font-mono font-bold text-primary mt-0.5">
                    {selectedFeature.code}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/30">
                  <div className="text-[10px] text-on-surface-variant uppercase font-bold">
                    Cumulative Seizure
                  </div>
                  <div className="font-mono font-bold text-error mt-0.5">
                    {selectedFeature.seizuresSummary}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/30">
                  <div className="text-[10px] text-on-surface-variant uppercase font-bold">
                    Jurisdiction
                  </div>
                  <div className="font-semibold text-secondary mt-0.5 truncate">
                    {selectedFeature.jurisdictionPs}
                  </div>
                </div>
              </div>

              {selectedFeature.cases.length === 0 ? (
                <div className="p-6 text-center bg-surface-container-low/50 rounded border border-outline-variant/30 text-xs text-on-surface-variant">
                  No active NDPS highway contraband seizures logged at this command node in the past
                  30 days. Patrol telemetry nominal.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs tabular-coord">
                  <thead className="bg-surface-container text-[10px] font-bold uppercase text-on-surface-variant">
                    <tr>
                      <th className="py-2 px-2.5">FIR No. &amp; Date</th>
                      <th className="py-2 px-2.5">Contraband &amp; Qty</th>
                      <th className="py-2 px-2.5">Intercepted Vehicle</th>
                      <th className="py-2 px-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/25">
                    {selectedFeature.cases.map((c) => (
                      <tr key={c.firNumber} className="hover:bg-surface-container-low/50">
                        <td className="py-2 px-2.5">
                          <div className="font-mono font-bold text-primary">{c.firNumber}</div>
                          <div className="text-[10px] text-on-surface-variant font-mono">
                            {c.date}
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="font-semibold text-on-surface">{c.contrabandType}</div>
                          <div className="text-[10.5px] font-mono font-bold text-error">
                            {c.quantityKg} kg • {c.corridor}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-[11px]">{c.vehicleReg}</td>
                        <td className="py-2 px-2.5">
                          <span className="px-2 py-0.5 rounded bg-secondary-container/45 text-on-secondary-container text-[10px] font-bold">
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/30 flex justify-between items-center text-xs">
              <span className="text-[10.5px] text-on-surface-variant">
                Synced with CCTNS Andhra Pradesh &amp; EAGLE Narcotics Intelligence Cell
              </span>
              <button
                type="button"
                onClick={() => setCaseModalOpen(false)}
                className="px-3 py-1 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
