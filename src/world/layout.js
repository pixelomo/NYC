// City layout constants. 1 world unit = 2 m = 16 texels/pixels. x = east, y = south, z = up.

export const T = 32; // texels (pixels) per world unit (2x pixel density)
export const GT = 16; // ground texture texels per world unit (half of T: the big city's ground has to fit a GPU texture)
export const K = T / 16; // scale factor for pixel-art sizes authored at 16 texels/unit
export const NB = 12; // blocks per side (water on three sides: the Hudson, the harbour and the East River)
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

// BLOCK_TYPES[by][bx]: a section of Manhattan, north at the top, river to river. The Hudson down the
// west side, the East River down the east with Brooklyn's shore beyond it, the harbour across the
// bottom. Central Park runs five blocks long between the Upper West and Upper East Sides, with the
// museums along its edges; Midtown below it (Columbus Circle, Billionaires' Row, the Plaza,
// Rockefeller Center, Times Square, St Patrick's, Grand Central, the Chrysler and Empire State
// towers, the UN, Hudson Yards); Chelsea, the Flatiron and Gramercy; the Village, SoHo and
// Chinatown; the Financial District and the Battery at the bottom, looking out at the Statue of
// Liberty. Mostly towers, hotels, offices, shops and museums: houses only here and there.
export const BLOCK_TYPES = [
  ['river', 'glass', 'shops', 'prewar', 'park', 'park', 'prewar', 'commercial', 'office', 'glass', 'river', 'river'],
  ['river', 'prewar', 'brownstones', 'prewar', 'park', 'park', 'guggenheim', 'shops', 'commercial', 'modern', 'river', 'river'],
  ['river', 'hotel', 'shops', 'naturalhistory', 'park', 'park', 'museum', 'prewar', 'shops', 'redbrick', 'river', 'river'],
  ['river', 'brownstones', 'commercial', 'prewar', 'park', 'park', 'prewar', 'hotel', 'firehouse', 'office', 'river', 'river'],
  ['river', 'lincoln', 'glass', 'prewar', 'park', 'park', 'prewar', 'office', 'commercial', 'modern', 'river', 'river'],
  ['river', 'modern', 'shops', 'columbus', 'supertall', 'rockefeller', 'plazahotel', 'supertall', 'office', 'deco', 'river', 'river'],
  ['river', 'commercial', 'shops', 'billboards', 'tsq', 'tsq', 'stpatricks', 'grandcentral', 'chrysler', 'un', 'river', 'river'],
  ['river', 'hudsonyards', 'glass', 'arena', 'tsq', 'tsq', 'library', 'commercial', 'glass', 'deco', 'river', 'river'],
  ['river', 'glass', 'lofts', 'commercial', 'shops', 'flatiron', 'shops', 'empire', 'brownstones', 'redbrick', 'river', 'river'],
  ['river', 'lofts', 'court', 'lofts', 'lofts', 'washsq', 'shops', 'tenements', 'chinatown', 'bridge', 'river', 'river'],
  ['river', 'battery', 'glass', 'wtc', 'memorial', 'exchange', 'deco', 'glass', 'office', 'modern', 'river', 'river'],
  ['river', 'river', 'river', 'river', 'river', 'river', 'river', 'river', 'river', 'river', 'river', 'river'],
];

// Blocks merged into one region, swallowing the streets between them: Central Park (one long
// landscape) and Times Square (four blocks of screens round a pedestrian plaza made of the old
// streets).
export const MERGES = [
  { kind: 'park', bx0: 4, by0: 0, bx1: 5, by1: 4 },
  { kind: 'tsq', bx0: 4, by0: 6, bx1: 5, by1: 7 },
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

// The water. Manhattan is land from the Hudson's quay (the west sidewalk of 12th Avenue) to the
// East River's (the east sidewalk of FDR Drive) and from the top edge down to the Battery's sea
// wall (the south sidewalk of Battery Place); Brooklyn's shore is a strip across the East River.
// Everything else is water, a little below the street, behind stone quays.
export const HUDSON_X = streetStart(1);
export const EAST_X = lotStart(NB - 2);
export const BROOKLYN_X = 319;
export const HARBOR_Y = lotStart(NB - 1);
export const LAND = [
  { x0: HUDSON_X, y0: -20, x1: EAST_X, y1: HARBOR_Y, name: 'manhattan' },
  { x0: BROOKLYN_X, y0: -20, x1: MAP + 20, y1: HARBOR_Y, name: 'brooklyn' },
];
export const WATERS = [
  { x0: 0, y0: 0, x1: HUDSON_X, y1: HARBOR_Y, name: 'hudson' },
  { x0: EAST_X, y0: 0, x1: BROOKLYN_X, y1: HARBOR_Y, name: 'east' },
  { x0: 0, y0: HARBOR_Y, x1: MAP, y1: MAP, name: 'harbor' },
];
export const WATER_Z = -0.45;
// is (x, y) water (or within m of it)?
export const inWater = (x, y, m = 0) => !LAND.some((r) => x > r.x0 + m && x < r.x1 - m && y > r.y0 + m && y < r.y1 - m);
// the road grid on Manhattan: avenue lines 1..NB-2, street lines 0..NB-1
export const AVE0 = 1, AVE1 = NB - 2, ST1 = NB - 1;
// (kept for the old name) the East River's quay
export const RIVER_X = EAST_X;

// intersections that are not there: swallowed by a merged region, or out in the water
export const isParkIntersection = (i, j) => i < AVE0 || i > AVE1 || j > ST1 || MERGES.some((m) => i > m.bx0 && i <= m.bx1 && j > m.by0 && j <= m.by1);
// is the leg of intersection (i, j) heading in direction (dx, dy) a road?
export const roadLegOpen = (i, j, dx, dy) => {
  const ni = i + dx, nj = j + dy;
  if (ni < 0 || nj < 0 || ni > NB || nj > NB) return false;
  return !isParkIntersection(i, j) && !isParkIntersection(ni, nj);
};
// intersections round the park, for the bus loop: [west/north index, east/south index]
export const parkLoop = () => ({ i0: PARK.bx0, i1: PARK.bx1 + 1, j0: PARK.by0, j1: PARK.by1 + 1 });

export const AVENUE_NAMES = ['HUDSON', '12 AV', '11 AV', '10 AV', '8 AV', '7 AV', '5 AV', 'PARK AV', 'LEXINGTON', '1 AV', 'FDR DR', 'EAST RIVER', 'BROOKLYN'];
export const STREET_NAMES = ['110 ST', '97 ST', '86 ST', '79 ST', '72 ST', '59 ST', '50 ST', '42 ST', '34 ST', '14 ST', 'CANAL ST', 'BATTERY PL', 'HARBOR'];

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
