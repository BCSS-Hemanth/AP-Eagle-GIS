import React, { useEffect, useMemo, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { ImageOverlay, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { RasterBasemapId } from '../../types/gis';
import { ESRI_WORLD_IMAGERY_TILES } from '../../data/apGeo';
import type { GisRasterManifest } from '../../gis/gisSourceCatalog';
import { leafletOverzoom } from '../../gis/mapDetail';
import { shouldOverlaySatellite } from '../../gis/mapDetail';
import {
  pickRasterOverlays,
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

const ProductOverlays: React.FC<{
  manifest: GisRasterManifest | null | undefined;
  opacity: number;
  zIndex: number;
}> = ({ manifest, opacity, zIndex }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const [view, setView] = useState<GisRasterViewBox>(() => viewBoxFromMap(map));

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
      setView(viewBoxFromMap(map));
    },
    moveend: () => setView(viewBoxFromMap(map)),
  });

  useEffect(() => {
    setZoom(map.getZoom());
    setView(viewBoxFromMap(map));
  }, [map, manifest?.id]);

  const tiles = useMemo(
    () => (manifest ? pickRasterOverlays(manifest.overlays, view, zoom) : []),
    [manifest, view, zoom]
  );

  if (!tiles.length) return null;

  return (
    <>
      {tiles.map((tile) => (
        <ImageOverlay
          key={tile.id}
          url={tile.url}
          bounds={[
            [tile.south, tile.west],
            [tile.north, tile.east],
          ]}
          opacity={opacity}
          zIndex={zIndex}
          className="ap-gis-source-raster"
        />
      ))}
    </>
  );
};

/** GIS-Source Raster KMZ GroundOverlays on top of Esri / OSM underlays (AOI only). */
export const GisSourceRasterOverlays: React.FC<{
  rasterId: RasterBasemapId;
  drillLevel: string;
  showImageryOverlay?: boolean;
  /**
   * When false, do not auto-stack Esri / GIS-Source satellite AOIs on vector/topo at
   * high zoom (Atlas View 2 must stay a clean OSM road map). Forced `showImageryOverlay`
   * still wins.
   */
  autoSatelliteOverlay?: boolean;
  showHillshade?: boolean;
  showGoogleRoadmap?: boolean;
  showSoiTopo?: boolean;
  roadmapOpacity?: number;
  satelliteOpacity?: number;
  terrainOpacity?: number;
  soiOpacity?: number;
}> = ({
  rasterId,
  drillLevel,
  showImageryOverlay = false,
  autoSatelliteOverlay = true,
  showHillshade = false,
  showGoogleRoadmap = false,
  showSoiTopo = false,
  roadmapOpacity = 0.95,
  satelliteOpacity = 0.92,
  terrainOpacity = 0.7,
  soiOpacity = 0.9,
}) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const gisSatBasemap = rasterId === 'satellite' || rasterId === 'hybrid';
  const gisTopoBasemap = rasterId === 'topo';
  /**
   * Satellite/hybrid = Esri World Imagery only (no GIS-Source AOI rectangles).
   * GIS-Source google_sat / AOB / NT_CG stay available on vector/topo when imagery is
   * forced or auto-overlaid at high zoom / village drill.
   */
  const showSatellitePack =
    !gisSatBasemap &&
    (showImageryOverlay ||
      (autoSatelliteOverlay &&
        shouldOverlaySatellite(zoom, rasterId, drillLevel, false)));
  /** Esri gap-fill under GIS-Source AOIs on vector/topo — not needed when basemap is already Esri. */
  const showEsriImageryGapFill = showSatellitePack;
  const showTerrain = showHillshade;
  const showSoi = showSoiTopo || gisTopoBasemap;

  const pack = useGisSourceRaster({
    showGoogleRoadmap,
    showSatellitePack,
    showTerrain,
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
      {showTerrain && (
        <ProductOverlays manifest={pack.googleTerrain} opacity={terrainOpacity} zIndex={250} />
      )}
      {showSoi && <ProductOverlays manifest={pack.soiTopo} opacity={soiOpacity} zIndex={260} />}
      {showSatellitePack && (
        <>
          <ProductOverlays manifest={pack.googleSat} opacity={satelliteOpacity} zIndex={270} />
          <ProductOverlays manifest={pack.aob} opacity={satelliteOpacity} zIndex={280} />
          <ProductOverlays manifest={pack.ntCg} opacity={satelliteOpacity} zIndex={290} />
        </>
      )}
      {showGoogleRoadmap && (
        <ProductOverlays manifest={pack.googleRoadmap} opacity={roadmapOpacity} zIndex={300} />
      )}
    </>
  );
};
