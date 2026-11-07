// City layout constants. 1 world unit = 2 m = 16 texels/pixels. x = east, y = south, z = up.

export const T = 32; // texels (pixels) per world unit (2x pixel density)
export const GT = 16; // ground texture texels per world unit (half of T: the big city's ground has to fit a GPU texture)
export const K = T / 16; // scale factor for pixel-art sizes authored at 16 texels/unit
export const NB = 12; // blocks per side (the easternmost column is the East River)
export const BLOCK = 18;
export const SIDEWALK = 2;
export const ROAD = 5;
export const STREET = SIDEWALK * 2 + ROAD; // 9
export const PERIOD = STREET + BLOCK; // 27
export const MAP = NB * PERIOD + STREET; // 171
// world extent covered by the lamp light map (x, y in [0, LIGHT_EXT])
export const LIGHT_EXT = MAP + 5;
export const CURB = 0.125; // sidewalk height (2 px)
export const LANE_OFF = 0.7; // travel lane centre offset from road centre
export const PARK_OFF = 1.85; // parking lane centre offset
export const BASE_DEPTH = 7; // diorama slab depth

export const streetStart = (k) => k * PERIOD;
export const roadStart = (k) => k * PERIOD + SIDEWALK;
export const roadEnd = (k) => k * PERIOD + SIDEWALK + ROAD;
export const roadCenter = (k) => k * PERIOD + SIDEWALK + ROAD / 2;
export const lotStart = (b) => b * PERIOD + STREET;
export const lotEnd = (b) => b * PERIOD + STREET + BLOCK;

// BLOCK_TYPES[by][bx]: a slice of Manhattan, north at the top. Brownstone and walk-up streets
// round Central Park; Midtown with Times Square, Rockefeller Center, the Public Library and Bryant
// Park, Grand Central and the Chrysler and Empire State towers; the Flatiron, Washington Square,
// SoHo lofts and Chinatown below; the Financial District at the bottom; the East River down the
// east side with the Brooklyn Bridge and the Statue of Liberty.
export const BLOCK_TYPES = [
  ['brownstones', 'walkups', 'redbrick', 'brownstones', 'walkups', 'redbrick', 'brownstones', 'walkups', 'redbrick', 'tenements', 'walkups', 'river'],
  ['walkups', 'tenements', 'brownstones', 'redbrick', 'park', 'park', 'redbrick', 'brownstones', 'shops', 'walkups', 'redbrick', 'river'],
  ['redbrick', 'shops', 'walkups', 'court', 'park', 'park', 'brownstones', 'bodega', 'walkups', 'redbrick', 'tenements', 'river'],
  ['tenements', 'firehouse', 'commercial', 'deco', 'office', 'rockefeller', 'glass', 'office', 'commercial', 'shops', 'walkups', 'river'],
  ['walkups', 'billboards', 'tsq', 'tsq', 'modern', 'library', 'grandcentral', 'chrysler', 'office', 'redbrick', 'brownstones', 'river'],
  ['redbrick', 'billboards', 'tsq', 'tsq', 'glass', 'deco', 'office', 'modern', 'commercial', 'walkups', 'redbrick', 'river'],
  ['shops', 'arena', 'commercial', 'office', 'shops', 'empire', 'glass', 'walkups', 'tenements', 'bodega', 'walkups', 'river'],
  ['brownstones', 'walkups', 'lofts', 'flatiron', 'office', 'shops', 'tenements', 'redbrick', 'walkups', 'shops', 'tenements', 'river'],
  ['tenements', 'redbrick', 'lofts', 'washsq', 'lofts', 'chinatown', 'chinatown', 'tenements', 'walkups', 'brownstones', 'walkups', 'river'],
  ['walkups', 'shops', 'lofts', 'modern', 'lofts', 'chinatown', 'tenements', 'redbrick', 'shops', 'walkups', 'redbrick', 'river'],
  ['redbrick', 'glass', 'wtc', 'office', 'deco', 'exchange', 'glass', 'office', 'commercial', 'bodega', 'walkups', 'river'],
  ['shops', 'commercial', 'modern', 'glass', 'office', 'deco', 'modern', 'glass', 'shops', 'redbrick', 'tenements', 'river'],
];

// Blocks merged into one region, swallowing the streets between them: the park (one big
// landscape) and Times Square (four blocks of screens round a pedestrian plaza made of the old
// streets).
export const MERGES = [
  { kind: 'park', bx0: 4, by0: 1, bx1: 5, by1: 2 },
  { kind: 'tsq', bx0: 2, by0: 4, bx1: 3, by1: 5 },
];
export const PARK = MERGES[0];
export const TSQ = MERGES[1];
export const mergeOf = (bx, by) => MERGES.find((m) => bx >= m.bx0 && bx <= m.bx1 && by >= m.by0 && by <= m.by1) || null;
// lot area inside a merged region / the raised area incl. the sidewalk ring around it
export const mergeRect = (m) => ({ x0: lotStart(m.bx0), y0: lotStart(m.by0), x1: lotEnd(m.bx1), y1: lotEnd(m.by1) });
export const mergePlinth = (m) => ({ x0: roadEnd(m.bx0), y0: roadEnd(m.by0), x1: roadStart(m.bx1 + 1), y1: roadStart(m.by1 + 1) });
export const parkRect = () => mergeRect(PARK);
export const parkPlinth = () => mergePlinth(PARK);
export const blockInPark = (bx, by) => !!mergeOf(bx, by);

// The East River: everything east of the riverside avenue's sidewalk is water, a little below
// the street, behind a stone quay. Avenue line LAND_NI is the riverside drive; nothing east of it.
export const LAND_NI = NB - 1;
export const RIVER_X = lotStart(NB - 1);
export const WATER_Z = -0.45;
export const inRiver = (x) => x > RIVER_X;

// intersections that are not there: swallowed by a merged region, or out in the river
export const isParkIntersection = (i, j) => i > LAND_NI || MERGES.some((m) => i > m.bx0 && i <= m.bx1 && j > m.by0 && j <= m.by1);
// is the leg of intersection (i, j) heading in direction (dx, dy) a road?
export const roadLegOpen = (i, j, dx, dy) => {
  const ni = i + dx, nj = j + dy;
  if (ni < 0 || nj < 0 || ni > NB || nj > NB) return false;
  return !isParkIntersection(i, j) && !isParkIntersection(ni, nj);
};
// intersections round the park, for the bus loop: [west/north index, east/south index]
export const parkLoop = () => ({ i0: PARK.bx0, i1: PARK.bx1 + 1, j0: PARK.by0, j1: PARK.by1 + 1 });

export const AVENUE_NAMES = ['11 AV', '10 AV', '9 AV', '8 AV', '7 AV', '6 AV', '5 AV', 'MADISON', 'PARK AV', 'LEXINGTON', '2 AV', 'FDR DR', 'EAST RIVER'];
export const STREET_NAMES = ['W 59 ST', 'W 57 ST', 'W 53 ST', 'W 50 ST', 'W 47 ST', 'W 42 ST', 'W 34 ST', 'W 23 ST', 'W 14 ST', 'W 4 ST', 'CANAL ST', 'WALL ST', 'BATTERY PL'];

export function blockRect(bx, by) {
  return { x0: lotStart(bx), y0: lotStart(by), x1: lotEnd(bx), y1: lotEnd(by) };
}

// Which ground region is at (x, y)
export function zoneAt(x, y) {
  const kx = Math.floor(x / PERIOD), ky = Math.floor(y / PERIOD);
  const lx = x - kx * PERIOD, ly = y - ky * PERIOD;
  const inStreetX = lx < STREET, inStreetY = ly < STREET;
  const roadX = inStreetX && lx >= SIDEWALK && lx < SIDEWALK + ROAD;
  const roadY = inStreetY && ly >= SIDEWALK && ly < SIDEWALK + ROAD;
  if (roadX || roadY) {
    if (roadX && roadY) return { type: 'intersection', i: kx, j: ky };
    if (roadX && inStreetY) return { type: 'crosswalk', i: kx, j: ky, across: 'x' };
    if (roadY && inStreetX) return { type: 'crosswalk', i: kx, j: ky, across: 'y' };
    return { type: 'road', axis: roadX ? 'y' : 'x', k: roadX ? kx : ky };
  }
  if (inStreetX || inStreetY) return { type: 'sidewalk' };
  return { type: 'lot', bx: kx, by: ky };
}
