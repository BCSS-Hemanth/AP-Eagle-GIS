import { describe, expect, it } from 'vitest';
import {
  HOTSPOT_POPUP,
  hotspotDetailsFromFeature,
  hotspotDetailsHtml,
  resolveHotspotAdminContext,
} from './hotspotDetails';

const square = (
  lon: number,
  lat: number,
  half = 0.2,
  props: Record<string, unknown>
): GeoJSON.Feature => ({
  type: 'Feature',
  properties: props,
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [lon - half, lat - half],
        [lon + half, lat - half],
        [lon + half, lat + half],
        [lon - half, lat + half],
        [lon - half, lat - half],
      ],
    ],
  },
});

describe('hotspotDetailsFromFeature', () => {
  it('parses KMZ HTML description fields for a detailed hotspot', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [82.485633, 18.059056] },
      properties: {
        name: 'Boddaputtu (Cultivation)',
        description: `<table>
<tr><td><strong>Sl.No</strong></td><td>4</td></tr>
<tr><td><strong>Hotspot Name</strong></td><td> Boddaputtu </td></tr>
<tr><td><strong>Hotspot Type</strong></td><td> Cultivation</td></tr>
<tr><td><strong>Near Land Mark</strong></td><td> Boddaputtu (v)</td></tr>
<tr><td><strong>Panchayat/Municipality/Ward</strong></td><td>Patakota (P)</td></tr>
<tr><td><strong>PS Limits</strong></td><td>Annavaram </td></tr>
<tr><td><strong>Mandal</strong></td><td>Annavaram</td></tr>
<tr><td><strong>District</strong></td><td>Allri Seetharama Raju</td></tr>
<tr><td><strong>City</strong></td><td> Boddaputtu Village</td></tr>
<tr><td><strong>State</strong></td><td>Andhra Pradesh</td></tr>
<tr><td><strong>Eagle Cell identified HS</strong></td><td> </td></tr>
<tr><td><strong>Latitude</strong></td><td>18.059056</td></tr>
<tr><td><strong>Longitude</strong></td><td>82.485633</td></tr>
</table>`,
      },
    };

    const d = hotspotDetailsFromFeature(feature);
    expect(d.title).toBe('Boddaputtu (Cultivation)');
    expect(d.slNo).toBe('4');
    expect(d.hotspotName).toBe('Boddaputtu');
    expect(d.hotspotType).toBe('Cultivation');
    expect(d.panchayat).toBe('Patakota (P)');
    expect(d.psLimits).toBe('Annavaram');
    expect(d.eagleCell).toBe('—');
    expect(d.latitude).toBe('18.059056');
    expect(d.longitude).toBe('82.485633');
  });

  it('fills District / Mandal / State from spatial admin for sparse KMZ points', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [82.6, 18.14] },
      properties: {
        name: 'Consumer',
        folder: 'Hotspots / Consumer',
      },
    };
    const admin = resolveHotspotAdminContext(
      [82.6, 18.14],
      [square(82.6, 18.14, 0.5, { district_name: 'Alluri Sitharama Raju' })],
      [square(82.6, 18.14, 0.2, { mandal_name: 'Gudem Kotha Veedhi', district_name: 'Alluri Sitharama Raju' })],
      [square(82.6, 18.14, 0.05, { village_name: 'Reserved Forest', mandal_name: 'Gudem Kotha Veedhi' })],
      square(82.6, 18.14, 2, { name: 'Andhra Pradesh' })
    );
    const d = hotspotDetailsFromFeature(feature, { serial: 7, admin });
    expect(d.slNo).toBe('7');
    expect(d.hotspotType).toBe('Consumer');
    expect(d.hotspotName).toBe('Reserved Forest');
    expect(d.nearLandMark).toBe('Reserved Forest');
    expect(d.mandal).toBe('Gudem Kotha Veedhi');
    expect(d.district).toBe('Alluri Sitharama Raju');
    expect(d.state).toBe('AP');
    expect(d.latitude).toBe('18.14');
    expect(d.longitude).toBe('82.6');
  });

  it('prefers spatial district/mandal over mismatched KMZ ExtendedData', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [82.5, 18.1] },
      properties: {
        name: 'Transport',
        Mandal: 'WrongMandal',
        _District: 'WrongDistrict',
        State_: 'XX',
      },
    };
    const admin = {
      district: 'Alluri Sitharama Raju',
      mandal: 'Ananthagiri',
      inAndhraPradesh: true,
    };
    const d = hotspotDetailsFromFeature(feature, { admin });
    expect(d.district).toBe('Alluri Sitharama Raju');
    expect(d.mandal).toBe('Ananthagiri');
    expect(d.state).toBe('AP');
  });
});

describe('hotspotDetailsHtml', () => {
  it('renders compact shared image, underlined admin names, and no links or directions', () => {
    const html = hotspotDetailsHtml({
      title: 'Damuku (Transport)',
      slNo: '12',
      hotspotName: 'Damuku',
      hotspotType: 'Transport',
      nearLandMark: 'Damuku',
      panchayat: 'Ananthagiri',
      psLimits: 'Ananthagiri',
      mandal: 'Ananthagiri',
      district: 'ASR',
      city: '—',
      state: 'AP',
      eagleCell: '—',
      latitude: '18.14402',
      longitude: '82.5996',
    });
    expect(html).toContain(`width:${HOTSPOT_POPUP.widthPx}px`);
    expect(html).toContain(`width="${HOTSPOT_POPUP.photoWidthPx}"`);
    expect(html).toContain(`height="${HOTSPOT_POPUP.photoHeightPx}"`);
    expect(html).toContain(HOTSPOT_POPUP.imageSrc);
    expect(html).toContain('ap-hotspot-card__u');
    expect(html).not.toContain('To here');
    expect(html).not.toContain('From here');
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toContain('href=');
  });
});
