from pathlib import Path

p = Path(r"c:\Users\HEMANTH\Downloads\blueprint-ai\src\components\MapViewerWorkspace.tsx")
lines = p.read_text(encoding="utf-8").splitlines(True)

telemetry = """  const measuredKm = geodesicPathKm(measurePoints);
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
      } else if (f.category === 'Police Station' && isLayerOn('lyr-pss')) {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'station', label: f.name, selected });
      } else if (f.category === 'Seizure Polygon' && isLayerOn('lyr-seizure-polys')) {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'seizure', label: f.name, selected });
      } else if (f.id === 'hq-amaravati') {
        out.push({ id: f.id, lat: f.lat, lon: f.lon, kind: 'hq', label: f.name, selected });
      }
    });
    if (isLayerOn('lyr-pss')) {
      psRows.forEach((row) => {
        if (out.some((m) => m.id === row.featureId && Math.abs(m.lat - row.lat) < 1e-6)) return;
        out.push({
          id: row.featureId + '-' + row.id,
          lat: row.lat,
          lon: row.lon,
          kind: 'station',
          label: row.name,
          selected: row.featureId === selectedFeatureId,
        });
      });
    }
    return out;
  }, [featuresMap, selectedFeatureId, layers, psRows]);

"""

start = 370
end = None
for i, ln in enumerate(lines):
    if ln.startswith("  return (") and i > 400:
        end = i
        break
if end is None:
    raise SystemExit("return not found")

print("telemetry replace", start + 1, "to", end)
text2 = "".join(lines[:start] + [telemetry] + lines[end:])

start_token = "          {/* MAP CANVAS */}\n"
end_token = "            {/* Live Measurement Readout Pill */}\n"
s = text2.find(start_token)
e = text2.find(end_token)
print("canvas pos", s, e)
if s < 0 or e < 0:
    raise SystemExit("canvas markers not found")

canvas = r"""          {/* MAP CANVAS — real OSM / Esri tiles + AP district GeoJSON */}
          <div ref={viewportRef} className="flex-1 relative overflow-hidden select-none">
            <ApLeafletMap
              ref={mapRef}
              className="absolute inset-0"
              basemap={basemap}
              showStateBorder={isLayerOn('lyr-state-border')}
              showDistricts={isLayerOn('lyr-districts')}
              districtOpacity={getLayerOpacity('lyr-districts')}
              stateOpacity={getLayerOpacity('lyr-state-border')}
              showHighways={isLayerOn('lyr-highways')}
              showAgencyRoutes={isLayerOn('lyr-drug-routes')}
              showRailways={isLayerOn('lyr-railways')}
              showGraticule={isLayerOn('lyr-soi-grid')}
              markers={mapMarkers}
              selectedFeature={selectedFeature}
              digitizedFeatures={digitizedFeatures}
              buffer={
                bufferVisible
                  ? { lat: selectedFeature.lat, lon: selectedFeature.lon, radiusKm: bufferRadiusKm }
                  : null
              }
              measurePoints={measurePoints}
              measureMode={activeTool === 'dist' || activeTool === 'area' ? activeTool : null}
              droppedPin={droppedPin}
              clickMode={activeTool as MapClickMode}
              onMapClick={handleLeafletClick}
              onMarkerClick={(id) => handleSelectTargetOnMap(id)}
              onViewChange={(lat, lon, zoom) => {
                setCursorLatLon({ lat, lon });
                setMapZoom(zoom);
                onUpdateCenterCoords(lat, lon);
              }}
            />

"""
text3 = text2[:s] + canvas + text2[e:]
text3 = text3.replace(
    "onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}",
    "onClick={() => mapRef.current?.zoomIn()}",
)
text3 = text3.replace(
    "onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.25).toFixed(2))))}",
    "onClick={() => mapRef.current?.zoomOut()}",
)
text3 = text3.replace(
    '<span className="text-primary font-bold">{(12.2 + zoom * 1.5).toFixed(1)}</span>',
    '<span className="text-primary font-bold">{mapZoom.toFixed(1)}</span>',
)

old_mini = """              <div className="flex-1 relative bg-surface-container-high/35 p-1 flex items-center justify-center">
                <svg viewBox="0 0 100 80" className="w-full h-full opacity-70">
                  <path d="M 10,10 L 80,10 L 90,40 L 70,75 L 30,70 L 10,40 Z" fill="#cbd5e1" />
                  <path d="M 40,18 L 76,26 L 68,58 L 42,66 Z" fill="#006a61" opacity="0.45" />
                </svg>
                <div
                  className="absolute border border-error bg-error/15 rounded-xs pointer-events-none transition-all duration-150"
                  style={{
                    width: `${Math.max(20, Math.round(48 / zoom))}px`,
                    height: `${Math.max(14, Math.round(32 / zoom))}px`,
                    top: `${Math.max(4, Math.min(54, 18 - pan.y * 0.04))}px`,
                    right: `${Math.max(6, Math.min(82, 16 + pan.x * 0.04))}px`,
                  }}
                />
              </div>"""
new_mini = """              <div className="flex-1 relative">
                <ApLeafletMap
                  className="absolute inset-0"
                  basemap="vector"
                  showStateBorder
                  showDistricts
                  interactive={false}
                  initialZoom={6}
                  clickMode="pan"
                />
              </div>"""
if old_mini not in text3:
    print("minimap block not found exact")
else:
    text3 = text3.replace(old_mini, new_mini)
    print("minimap replaced")

text3 = text3.replace("{Math.round(14 / zoom)}", "10")
text3 = text3.replace("{Math.round(35 / zoom)}", "25")
text3 = text3.replace("{Math.round(70 / zoom)} km", "50 km")
text3 = text3.replace("{Math.round(35000 / zoom).toLocaleString()}", "50,000")

p.write_text(text3, encoding="utf-8")
print("written", len(text3.splitlines()), "lines")
