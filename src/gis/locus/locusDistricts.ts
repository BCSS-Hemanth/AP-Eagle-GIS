import type { LocusDistrictMeta } from './locusTypes';

/** Same readiness model as Atlas — only verified districts are selectable. */
export const LOCUS_DISTRICTS: readonly LocusDistrictMeta[] = [
  {
    id: 'asr',
    name: 'Alluri Sitharama Raju',
    code: 'ASR',
    districtName: 'Alluri Sitharama Raju',
    status: 'ready',
  },
  { id: 'anakapalli', name: 'Anakapalli', code: 'AKP', districtName: 'Anakapalli', status: 'pending' },
  { id: 'anantapur', name: 'Anantapur', code: 'ATP', districtName: 'Anantapur', status: 'pending' },
  { id: 'annamayya', name: 'Annamayya', code: 'ANY', districtName: 'Annamayya', status: 'pending' },
  { id: 'bapatla', name: 'Bapatla', code: 'BPT', districtName: 'Bapatla', status: 'pending' },
  { id: 'chittoor', name: 'Chittoor', code: 'CTR', districtName: 'Chittoor', status: 'pending' },
  {
    id: 'konaseema',
    name: 'Dr. B.R. Ambedkar Konaseema',
    code: 'KNM',
    districtName: 'Dr. B.R. Ambedkar Konaseema',
    status: 'pending',
  },
  { id: 'east-godavari', name: 'East Godavari', code: 'EG', districtName: 'East Godavari', status: 'pending' },
  { id: 'eluru', name: 'Eluru', code: 'ELR', districtName: 'Eluru', status: 'pending' },
  { id: 'guntur', name: 'Guntur', code: 'GNT', districtName: 'Guntur', status: 'pending' },
  { id: 'kakinada', name: 'Kakinada', code: 'KKD', districtName: 'Kakinada', status: 'pending' },
  { id: 'krishna', name: 'Krishna', code: 'KRI', districtName: 'Krishna', status: 'pending' },
  { id: 'kurnool', name: 'Kurnool', code: 'KNL', districtName: 'Kurnool', status: 'pending' },
  { id: 'nandyal', name: 'Nandyal', code: 'NDL', districtName: 'Nandyal', status: 'pending' },
  {
    id: 'nellore',
    name: 'Sri Potti Sriramulu Nellore',
    code: 'NLR',
    districtName: 'Sri Potti Sriramulu Nellore',
    status: 'pending',
  },
  { id: 'ntr', name: 'NTR', code: 'NTR', districtName: 'NTR', status: 'pending' },
  { id: 'palnadu', name: 'Palnadu', code: 'PLN', districtName: 'Palnadu', status: 'pending' },
  {
    id: 'parvathipuram',
    name: 'Parvathipuram Manyam',
    code: 'PVM',
    districtName: 'Parvathipuram Manyam',
    status: 'pending',
  },
  { id: 'prakasam', name: 'Prakasam', code: 'PKM', districtName: 'Prakasam', status: 'pending' },
  {
    id: 'sri-sathya-sai',
    name: 'Sri Sathya Sai',
    code: 'SSS',
    districtName: 'Sri Sathya Sai',
    status: 'pending',
  },
  { id: 'srikakulam', name: 'Srikakulam', code: 'SKL', districtName: 'Srikakulam', status: 'pending' },
  { id: 'tirupati', name: 'Tirupati', code: 'TPT', districtName: 'Tirupati', status: 'pending' },
  {
    id: 'visakhapatnam',
    name: 'Visakhapatnam',
    code: 'VSP',
    districtName: 'Visakhapatnam',
    status: 'pending',
  },
  { id: 'vizianagaram', name: 'Vizianagaram', code: 'VZM', districtName: 'Vizianagaram', status: 'pending' },
  {
    id: 'west-godavari',
    name: 'West Godavari',
    code: 'WG',
    districtName: 'West Godavari',
    status: 'pending',
  },
  { id: 'ysr', name: 'YSR', code: 'YSR', districtName: 'YSR', status: 'pending' },
] as const;

export const LOCUS_DEFAULT_DISTRICT_ID = 'asr';

export function locusDistrictById(id: string | null | undefined): LocusDistrictMeta | undefined {
  if (!id) return undefined;
  return LOCUS_DISTRICTS.find((d) => d.id === id);
}

export function isLocusDistrictSelectable(id: string): boolean {
  return locusDistrictById(id)?.status === 'ready';
}
