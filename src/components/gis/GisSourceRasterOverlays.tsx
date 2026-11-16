import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { ImageOverlay, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { RasterBasemapId } from '../../types/gis';
import { ESRI_WORLD_IMAGERY_TILES } from '../../data/apGeo';
import type { GisRasterManifest, GisRasterOverlay } from '../../gis/gisSourceCatalog';
import { leafletOverzoom } from '../../gis/mapDetail';
import { shouldOverlaySatellite } from '../../gis/mapDetail';
import {
  pickRasterOverlays,
  preloadRasterOverlayUrls,
  useGisSourceRaster,
  type GisRasterViewBox,
} from '../../gis/useGisSourceRaster';

function viewBoxFromMap(map: LeafletMap): GisRasterViewBox {
  const b = map.getBounds();
  return {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest(),
  };
}

/** Tiny expansion hides 1px seams between adjacent SOI sheets. */
function seamPadBounds(tile: GisRasterOverlay): [[number, number], [number, number]] {
  const dLat = Math.max(1e-5, (tile.north - tile.south) * 0.0015);
  const dLon = Math.max(1e-5, (tile.east - tile.west) * 0.0015);
  return [
    [tile.south - dLat, tile.west - dLon],
    [tile.north + dLat, tile.east + dLon],
  ];
}

const ProductOverlays: React.FC<{
  manifest: GisRasterManifest | null | undefined;
  opacity: number;
  zIndex: number;
  /** Raster module: stack coarser LOD + preload before swap (no sat flash). */
  stableComposition?: boolean;
}> = ({ manifest, opacity, zIndex, stableComposition = false }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [view, setView] = useState<GisRasterViewBox>(() => viewBoxFromMap(map));
  const [tiles, setTiles] = useState<GisRasterOverlay[]>([]);
  const genRef = useRef(0);
  const shownKeyRef = useRef('');
  const zoomTimer = useRef<number | null>(null);

  const refreshView = () => {
    setZoom(map.getZoom());
    setView(viewBoxFromMap(map));
  };

  useMapEvents({
    zoomend: refreshView,
    moveend: () => setView(viewBoxFromMap(map)),
    // Mid-zoom: debounce so LOD does not thrash every frame, but coverage updates sooner.
    zoom: () => {
      if (!stableComposition) return;
      if (zoomTimer.current != null) window.clearTimeout(zoomTimer.current);
      zoomTimer.current = window.setTimeout(() => {
        zoomTimer.current = null;
        refreshView();
      }, 80);
    },
  });

  useEffect(() => {
    setZoom(map.getZoom());
    setView(viewBoxFromMap(map));
  }, [map, manifest?.id]);

  useEffect(() => {
    return () => {
      if (zoomTimer.current != null) window.clearTimeout(zoomTimer.current);
    };
  }, []);

  const nextTiles = useMemo(
    () =>
      manifest
        ? pickRasterOverlays(manifest.overlays, view, zoom, {
            maxTiles: stableComposition ? 64 : 48,
            stackCoarser: stableComposition,
          })
        : [],
    [manifest, view, zoom, stableComposition]
  );

  const tilesKey = (list: GisRasterOverlay[]) =>
    list
      .map((t) => t.id)
      .sort()
      .join('|');

  useEffect(() => {
    if (!nextTiles.length) {
      shownKeyRef.current = '';
      setTiles((prev) => (prev.length ? [] : prev));
      return;
    }
    if (!stableComposition) {
      shownKeyRef.current = tilesKey(nextTiles);
      setTiles(nextTiles);
      return;
    }
    const nextKey = tilesKey(nextTiles);
    if (shownKeyRef.current === nextKey) return;
    // Keep previous sheets mounted until replacements are decoded — no sat flash.
    const gen = ++genRef.current;
    const urls = nextTiles.map((t) => t.url);
    void preloadRasterOverlayUrls(urls).then(() => {
      if (genRef.current !== gen) return;
      shownKeyRef.current = nextKey;
      setTiles(nextTiles);
    });
  }, [nextTiles, stableComposition]);

  if (!tiles.length) return null;

  // Sort coarser → finer so ImageOverlay z-order stacks correctly.
  const ordered = [...tiles].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));

  return (
    <>
      {ordered.map((tile) => (
        <ImageOverlay
          key={tile.id}
          url={tile.url}
          bounds={seamPadBounds(tile)}
          opacity={opacity}
          zIndex={zIndex + tile.level}
          className="ap-gis-source-raster"
        />
      ))}
    </>
  );
};

/** GIS-Source SOI topo overlays; optional Esri imagery gap-fill on vector/topo at high zoom. */
export const GisSourceRasterOverlays: React.FC<{
  rasterId: RasterBasemapId;
  drillLevel: string;
  showImageryOverlay?: boolean;
  /**
   * When false, do not auto-stack Esri satellite on vector/topo at high zoom
   * (Atlas View 2 must stay a clean OSM road map). Forced `showImageryOverlay` still wins.
   */
  autoSatelliteOverlay?: boolean;
  showSoiTopo?: boolean;
  soiOpacity?: number;
  /**
   * Raster module: mute sat/topo bleed under SOI, stack coarser LOD, preload sheets
   * so zoom stays a continuous topo surface instead of mixed sat rectangles.
   */
  soiStableComposition?: boolean;
}> = ({
  rasterId,
  drillLevel,
  showImageryOverlay = false,
  autoSatelliteOverlay = true,
  showSoiTopo = false,
  soiOpacity = 0.9,
  soiStableComposition = false,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const gisSatBasemap = rasterId === 'satellite' || rasterId === 'hybrid';
  const gisTopoBasemap = rasterId === 'topo';
  const showSoi = showSoiTopo || gisTopoBasemap;
  // Never gap-fill with Esri when Raster asks for a stable SOI composition.
  const showEsriImageryGapFill =
    !soiStableComposition &&
    !gisSatBasemap &&
    (showImageryOverlay ||
      (autoSatelliteOverlay && shouldOverlaySatellite(zoom, rasterId, drillLevel, false)));

  const pack = useGisSourceRaster({
    showSoiTopo: showSoi,
  });

  return (
    <>
      {showEsriImageryGapFill && (
        <TileLayer
          url={ESRI_WORLD_IMAGERY_TILES.url}
          attribution={ESRI_WORLD_IMAGERY_TILES.attribution}
          opacity={0.95}
          zIndex={240}
          pane="overlayPane"
          {...leafletOverzoom(ESRI_WORLD_IMAGERY_TILES.maxZoom)}
        />
      )}
      {showSoi && (
        <ProductOverlays
          manifest={pack.soiTopo}
          opacity={soiStableComposition ? Math.max(soiOpacity, 0.98) : soiOpacity}
          zIndex={260}
          stableComposition={soiStableComposition}
        />
      )}
    </>
  );
};
