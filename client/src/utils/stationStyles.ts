import type { Station } from '../types';

export interface StationDisplay {
  abbr: string;
  color: string;    // hex color e.g. '#8b5cf6'
  rgb: [number, number, number];
}

const DEFAULT_STYLES: Record<string, { abbr: string; color: string }> = {
  'Hematology/UA': { abbr: 'HM', color: '#8b5cf6' },
  'Chemistry':     { abbr: 'CH', color: '#d97706' },
  'Microbiology':  { abbr: 'MC', color: '#059669' },
  'Blood Bank':    { abbr: 'BB', color: '#dc2626' },
  'Admin':         { abbr: 'AD', color: '#0ea5e9' },
};

const FALLBACK_COLOR = '#9ca3af';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function getStationStyle(station: Station): StationDisplay;
export function getStationStyle(name: string, stations: Station[]): StationDisplay;
export function getStationStyle(nameOrStation: string | Station, stations?: Station[]): StationDisplay {
  let name: string;
  let color: string | undefined;
  let abbr: string | undefined;

  if (typeof nameOrStation === 'object') {
    name = nameOrStation.name;
    color = nameOrStation.color;
    abbr = nameOrStation.abbr;
  } else {
    name = nameOrStation;
    const found = stations?.find(s => s.name === name);
    color = found?.color;
    abbr = found?.abbr;
  }

  const defaults = DEFAULT_STYLES[name];
  const resolvedColor = (color && color !== '') ? color : (defaults?.color ?? FALLBACK_COLOR);
  const resolvedAbbr = (abbr && abbr !== '') ? abbr : (defaults?.abbr ?? name.substring(0, 2).toUpperCase());

  return {
    abbr: resolvedAbbr,
    color: resolvedColor,
    rgb: hexToRgb(resolvedColor),
  };
}

export function buildStationStyleMap(stations: Station[]): Record<string, StationDisplay> {
  const map: Record<string, StationDisplay> = {};
  for (const s of stations) {
    map[s.name] = getStationStyle(s);
  }
  return map;
}
