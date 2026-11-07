// City layout constants. 1 world unit = 2 m = 16 texels/pixels. x = east, y = south, z = up.

export const T = 32; // texels (pixels) per world unit (2x pixel density)
export const GT = 16; // ground texture texels per world unit (half of T: the big city's ground has to fit a GPU texture)
export const K = T / 16; // scale factor for pixel-art sizes authored at 16 texels/unit
export const NBX = 15; // block columns: New Jersey, the Hudson, Manhattan (up to 10 avenues wide), the East River, Queens and Brooklyn
export const NBY = 26; // block rows: the Bronx at the top, Inwood to the Battery, the harbour at the bottom
export const BLOCK = 18;
export const SIDEWALK = 2;
export const ROAD = 5;
export const STREET = SIDEWALK * 2 + ROAD; // 9
export const PERIOD = STREET + BLOCK; // 27
export const MAPX = NBX * PERIOD + STREET; // 414
export const MAPY = NBY * PERIOD + STREET; // 711
// world extent covered by the lamp light map (x, y in [0, LIGHT_EXT_X] x [0, LIGHT_EXT_Y])
export const LIGHT_EXT_X = MAPX + 5;
export const LIGHT_EXT_Y = MAPY + 5;
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

// BLOCK_TYPES[by][bx]: the whole of Manhattan, north at the top, squeezed along its length (each
// row stands for about ten real streets, each column for about one avenue): Inwood and the
// Cloisters, Washington Heights and the George Washington Bridge, Harlem and Columbia, Riverside
// Park all down the Hudson side, Central Park between the Upper West and Upper East Sides with the
// museums along it, Midtown with Times Square, the Village, SoHo, Chinatown and the Lower East
// Side, and the Financial District down to the Battery. '~' is water, or land that isn't Manhattan
// (New Jersey, the Bronx, Queens, Brooklyn and the islands: see BOROUGHS and ISLANDS).
const _ = '~';
export const BLOCK_TYPES = [
  //  0  1  2  3             4                5                6                7               8               9               10              11              12              13 14
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, 'inwoodhill', 'walkups', 'tenements', _, _, _, _, _, _, _, _],
  [_, _, _, _, 'cloisters', 'redbrick', 'walkups', 'tenements', _, _, _, _, _, _, _],
  [_, _, _, 'gwb', 'prewar', 'redbrick', 'shops', 'walkups', _, _, _, _, _, _, _],
  [_, _, _, 'riverside', 'redbrick', 'tenements', 'bodega', 'highbridge', _, _, _, _, _, _, _],
  [_, _, _, 'riverside', 'prewar', 'brownstones', 'walkups', 'shops', 'redbrick', _, _, _, _, _, _],
  [_, _, _, 'riverside', 'walkups', 'brownstones', 'apollo', 'brownstones', 'commercial', 'redbrick', _, _, _, _, _],
  [_, _, _, 'grantstomb', 'columbia', 'prewar', 'brownstones', 'shops', 'walkups', 'tenements', 'tbridge', _, _, _, _],
  [_, _, _, 'riverside', 'prewar', 'prewar', 'park', 'park', 'prewar', 'commercial', 'redbrick', _, _, _, _],
  [_, _, _, 'soldiers', 'brownstones', 'prewar', 'park', 'park', 'guggenheim', 'prewar', 'office', 'redbrick', _, _, _],
  [_, _, _, 'riverside', 'prewar', 'naturalhistory', 'park', 'park', 'museum', 'prewar', 'shops', 'glass', _, _, _],
  [_, _, _, 'riverside', 'glass', 'prewar', 'park', 'park', 'prewar', 'hotel', 'brownstones', 'modern', _, _, _],
  [_, _, _, 'glass', 'lincoln', 'prewar', 'park', 'park', 'prewar', 'office', 'commercial', 'deco', _, _, _],
  [_, _, _, 'glass', 'hotel', 'columbus', 'supertall', 'supertall', 'plazahotel', 'deco', 'office', 'qbridge', _, _, _],
  [_, _, _, 'modern', 'billboards', 'tsq', 'tsq', 'rockefeller', 'stpatricks', 'glass', 'office', 'un', _, _, _],
  [_, _, _, 'glass', 'commercial', 'tsq', 'tsq', 'library', 'office', 'grandcentral', 'chrysler', 'glass', _, _, _],
  [_, _, _, 'hudsonyards', 'glass', 'commercial', 'arena', 'empire', 'office', 'deco', 'glass', 'modern', _, _, _],
  [_, _, _, 'glass', 'lofts', 'commercial', 'shops', 'flatiron', 'office', 'brownstones', 'modern', 'glass', _, _, _],
  [_, _, _, 'lofts', 'commercial', 'shops', 'shops', 'office', 'unionsq', 'redbrick', 'redbrick', 'redbrick', _, _, _],
  [_, _, _, 'glass', 'brownstones', 'brownstones', 'court', 'washsq', 'walkups', 'shops', 'tenements', 'tenements', 'redbrick', _, _],
  [_, _, _, 'glass', 'lofts', 'lofts', 'lofts', 'shops', 'tenements', 'tenements', 'bodega', 'wbridge', _, _, _],
  [_, _, _, 'lofts', 'lofts', 'commercial', 'office', 'chinatown', 'chinatown', 'tenements', 'walkups', 'mbridge', _, _, _],
  [_, _, _, 'glass', 'wtc', 'memorial', 'cityhall', 'office', 'deco', 'glass', 'bridge', _, _, _, _],
  [_, _, _, 'battery', 'glass', 'exchange', 'deco', 'office', 'modern', _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
];
export const isManhattan = (bx, by) => bx >= 0 && by >= 0 && bx < NBX && by < NBY && BLOCK_TYPES[by][bx] !== _;

// Blocks merged into one region, swallowing the streets between them: Central Park (one long
// landscape, 59th to 110th Street) and Times Square (four blocks of screens round a pedestrian
// plaza made of the old streets).
export const MERGES = [
  { kind: 'park', bx0: 6, by0: 8, bx1: 7, by1: 12 },
  { kind: 'tsq', bx0: 5, by0: 14, bx1: 6, by1: 15 },
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

// The roads: an intersection is there if any of the four blocks round it is Manhattan (and it isn't
// swallowed by a merged region); a stretch of road between two intersections is there if a block
// on either side of it is Manhattan. So the island is ringed by its riverside drives.
const inMergeInterior = (i, j) => MERGES.some((m) => i > m.bx0 && i <= m.bx1 && j > m.by0 && j <= m.by1);
export const interExists = (i, j) => i >= 0 && j >= 0 && i <= NBX && j <= NBY && !inMergeInterior(i, j)
  && (isManhattan(i - 1, j - 1) || isManhattan(i, j - 1) || isManhattan(i - 1, j) || isManhattan(i, j));
export const legOpen = (i, j, dx, dy) => {
  const ni = i + dx, nj = j + dy;
  if (!interExists(i, j) || !interExists(ni, nj)) return false;
  const ai = Math.min(i, ni), aj = Math.min(j, nj);
  return dx ? isManhattan(ai, aj - 1) || isManhattan(ai, aj) : isManhattan(ai - 1, aj) || isManhattan(ai, aj);
};
// (the old names)
export const isParkIntersection = (i, j) => !interExists(i, j);
export const roadLegOpen = legOpen;
// intersections round the park, for the bus loop: [west/north index, east/south index]
export const parkLoop = () => ({ i0: PARK.bx0, i1: PARK.bx1 + 1, j0: PARK.by0, j1: PARK.by1 + 1 });

// The water and the land that isn't Manhattan. The water is a little below the street, behind
// stone quays. BOROUGHS are the edges of the other boroughs and New Jersey: regions they may fill,
// kept at least SHORE units from Manhattan so a river always runs between (the Harlem River, the
// East River, Spuyten Duyvil); they're scenery, built but not walked (Queens and Brooklyn, across
// the East River, have painted ground and promenades like Manhattan's). ISLANDS are land like
// Manhattan's sidewalks (Roosevelt, Randall's and Governors Islands); Liberty and Ellis Islands
// are built by their own builders on the water (GROUND_EXTRA: they paint the ground there).
export const WATER_Z = -0.45;
export const SHORE = 12;
export const BROOKLYN_X = 384;
export const BOROUGHS = [
  { name: 'nj', x0: 0, y0: 0, x1: 22, y1: MAPY },
  { name: 'bronx', x0: 81, y0: 0, x1: MAPX, y1: 186 },
  { name: 'queens', x0: BROOKLYN_X, y0: 189, x1: MAPX, y1: 459, ground: true },
  { name: 'brooklyn', x0: BROOKLYN_X, y0: 466, x1: MAPX, y1: MAPY, ground: true },
];
export const ISLANDS = [
  { name: 'randalls', x0: 318, y0: 192, x1: 360, y1: 230 },
  { name: 'roosevelt', x0: 349, y0: 286, x1: 360, y1: 404 },
  { name: 'governors', x0: 228, y0: 672, x1: 292, y1: 706 },
];
export const LIBERTY = { x: 44, y: 676, rx: 9.6, ry: 6.6 };
export const ELLIS = { x0: 34, y0: 618, x1: 52, y1: 634 };
export const GROUND_EXTRA = [
  { x0: LIBERTY.x - 11, y0: LIBERTY.y - 8, x1: LIBERTY.x + 15, y1: LIBERTY.y + 8 },
  ELLIS,
];

// (west to east / north to south, roughly where each line falls)
export const AVENUE_NAMES = ['NJ', 'HUDSON', 'HUDSON', '12 AV', '11 AV', '9 AV', '8 AV', '6 AV', '5 AV', 'PARK AV', 'LEXINGTON', '1 AV', 'FDR DR', 'EAST RIVER', 'QUEENS', 'BROOKLYN'];
export const STREET_NAMES = ['SPUYTEN DUYVIL', '207 ST', '190 ST', '175 ST', '155 ST', '140 ST', '125 ST', '110 ST', '97 ST', '86 ST', '77 ST', '68 ST', '59 ST', '50 ST', '45 ST', '38 ST', '30 ST', '23 ST', '14 ST', 'HOUSTON ST', 'CANAL ST', 'CHAMBERS ST', 'FULTON ST', 'BATTERY PL', 'UPPER BAY', 'UPPER BAY', 'UPPER BAY'];

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
