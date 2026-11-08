// City layout constants. 1 world unit = 2 m = 16 texels/pixels. x = east, y = south, z = up.

export const T = 32; // texels (pixels) per world unit (2x pixel density)
export const GT = 16; // ground texture texels per world unit (half of T: the big city's ground has to fit a GPU texture)
export const K = T / 16; // scale factor for pixel-art sizes authored at 16 texels/unit
export const NBX = 15; // block columns: New Jersey, the Hudson, Manhattan (up to 10 avenues wide), the East River, Queens and Brooklyn
export const NBY = 36; // block rows: the Bronx at the top, Inwood to the Battery (30 rows), the harbour at the bottom
export const BLOCK = 18;
export const SIDEWALK = 2;
export const ROAD = 5;
export const STREET = SIDEWALK * 2 + ROAD; // 9
export const PERIOD = STREET + BLOCK; // 27
export const MAPX = NBX * PERIOD + STREET; // 414
export const MAPY = NBY * PERIOD + STREET; // 981
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
// row stands for six to eleven real streets, each column for about one avenue), following the real
// shoreline: narrow at Inwood, widening through Washington Heights and Harlem (out to the Harlem
// River), full width from 110th Street down, the Lower East Side bulging into the East River, then
// tapering through Tribeca and the Financial District to the Battery. '~' is water, or land that
// isn't Manhattan (New Jersey, the Bronx, Queens, Brooklyn and the islands: see BOROUGHS, ISLANDS).
const _ = '~';
const row = (from, ...types) => { const r = new Array(15).fill(_); types.forEach((t, k) => { r[from + k] = t; }); return r; };
export const BLOCK_TYPES = [
  row(0),
  row(4, 'inwoodhill', 'walkups'), //                                                   218-207 St
  row(4, 'cloisters', 'walkups', 'tenements'), //                                        207-196
  row(3, 'riverside', 'redbrick', 'shops', 'walkups', 'walkups'), //                      196-185
  row(3, 'gwb', 'prewar', 'redbrick', 'shops', 'highbridge'), //                         185-174
  row(3, 'riverside', 'redbrick', 'tenements', 'bodega', 'walkups'), //                  174-163
  row(3, 'riverside', 'prewar', 'brownstones', 'walkups', 'shops', 'redbrick'), //       163-152
  row(3, 'riverside', 'walkups', 'brownstones', 'shops', 'redbrick', 'tenements'), //    152-142
  row(3, 'riverside', 'tenements', 'brownstones', 'brownstones', 'commercial', 'walkups', 'redbrick'), // 142-131
  row(3, 'grantstomb', 'columbia', 'prewar', 'apollo', 'brownstones', 'shops', 'tenements', 'tbridge'), // 131-120
  row(3, 'riverside', 'prewar', 'stjohn', 'brownstones', 'shops', 'walkups', 'tenements', 'redbrick'), // 120-110
  row(3, 'riverside', 'prewar', 'prewar', 'park', 'park', 'prewar', 'commercial', 'redbrick', 'tenements'), // 110-102
  row(3, 'soldiers', 'brownstones', 'prewar', 'park', 'park', 'guggenheim', 'prewar', 'office', 'redbrick'), // 102-93
  row(3, 'riverside', 'prewar', 'prewar', 'park', 'park', 'prewar', 'hotel', 'shops', 'gracie'), //       93-85
  row(3, 'riverside', 'prewar', 'naturalhistory', 'park', 'park', 'museum', 'prewar', 'brownstones', 'glass'), // 85-76
  row(3, 'riverside', 'brownstones', 'dakota', 'park', 'park', 'prewar', 'hotel', 'redbrick', 'modern'), // 76-68
  row(3, 'glass', 'lincoln', 'prewar', 'park', 'park', 'prewar', 'office', 'commercial', 'deco'), //      68-59
  row(3, 'glass', 'hearst', 'columbus', 'radiocity', 'plazahotel', 'supertall', 'citigroup', 'office', 'qbridge'), // 59-52
  row(3, 'intrepid', 'billboards', 'tsq', 'tsq', 'rockefeller', 'stpatricks', 'seagram', 'office', 'un'), // 52-46
  row(3, 'glass', 'nyt', 'tsq', 'tsq', 'library', 'vanderbilt', 'grandcentral', 'chrysler', 'glass'), //   46-40
  row(3, 'hudsonyards', 'glass', 'commercial', 'macys', 'empire', 'office', 'deco', 'glass', 'modern'), // 40-33
  row(3, 'glass', 'highline', 'arena', 'commercial', 'office', 'shops', 'brownstones', 'modern', 'glass'), // 33-26
  row(3, 'lofts', 'highline', 'shops', 'shops', 'flatiron', 'office', 'brownstones', 'redbrick', 'redbrick'), // 26-20
  row(3, 'littleisland', 'highline', 'commercial', 'shops', 'office', 'unionsq', 'redbrick', 'redbrick', 'redbrick'), // 20-14
  row(3, 'glass', 'brownstones', 'brownstones', 'court', 'washsq', 'walkups', 'shops', 'tenements', 'tenements', 'redbrick'), // 14-8
  row(3, 'glass', 'lofts', 'lofts', 'lofts', 'shops', 'tenements', 'tenements', 'bodega', 'tenements', 'walkups'), // 8-Houston
  row(3, 'lofts', 'lofts', 'lofts', 'shops', 'chinatown', 'tenements', 'walkups', 'tenements', 'tenements', 'wbridge'), // Houston-Grand
  row(3, 'lofts', 'leonard', 'office', 'chinatown', 'chinatown', 'tenements', 'walkups', 'tenements', 'mbridge'), // Grand-Chambers
  row(3, 'glass', 'office', 'cityhall', 'office', 'deco', 'spruce', 'bridge'), //                         Chambers-Fulton
  row(3, 'glass', 'wtc', 'memorial', 'trinity', 'fortywall', 'seventypine', 'seaport'), //               Fulton-Wall
  row(3, 'battery', 'bowlinggreen', 'exchange', 'deco', 'ferry'), //                                     Wall-Battery
  row(0), row(0), row(0), row(0), row(0),
];
export const isManhattan = (bx, by) => bx >= 0 && by >= 0 && bx < NBX && by < NBY && BLOCK_TYPES[by][bx] !== _;

// Blocks merged into one region, swallowing the streets between them: Central Park (one long
// landscape, 59th to 110th Street) and Times Square (four blocks of screens round a pedestrian
// plaza made of the old streets).
export const MERGES = [
  { kind: 'park', bx0: 6, by0: 11, bx1: 7, by1: 16 },
  { kind: 'tsq', bx0: 5, by0: 18, bx1: 6, by1: 19 },
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
// Brooklyn's shore comes further west below the Manhattan Bridge (DUMBO, Brooklyn Heights, Red Hook)
export const BK_SOUTH = { x0: 340, y0: 760 };
export const eastShoreX = (y) => (y >= BK_SOUTH.y0 ? BK_SOUTH.x0 : BROOKLYN_X);
export const BOROUGHS = [
  { name: 'nj', x0: 0, y0: 0, x1: 22, y1: MAPY },
  { name: 'bronx', x0: 81, y0: 0, x1: MAPX, y1: 240 },
  { name: 'queens', x0: BROOKLYN_X, y0: 250, x1: MAPX, y1: 567, ground: true },
  { name: 'brooklyn', x0: BROOKLYN_X, y0: 573, x1: MAPX, y1: BK_SOUTH.y0, ground: true },
  { name: 'brooklyn', x0: BK_SOUTH.x0, y0: BK_SOUTH.y0, x1: MAPX, y1: MAPY, ground: true },
];
export const ISLANDS = [
  { name: 'randalls', x0: 318, y0: 252, x1: 360, y1: 302 },
  { name: 'roosevelt', x0: 349, y0: 400, x1: 360, y1: 540 },
  { name: 'governors', x0: 240, y0: 864, x1: 300, y1: 900 },
];
export const LIBERTY = { x: 50, y: 934, rx: 9.6, ry: 6.6 };
export const ELLIS = { x0: 36, y0: 866, x1: 54, y1: 882 };
export const GROUND_EXTRA = [
  { x0: LIBERTY.x - 11, y0: LIBERTY.y - 8, x1: LIBERTY.x + 15, y1: LIBERTY.y + 8 },
  ELLIS,
];
// rows where things are across the rivers (for the boroughs' builders)
export const ROWS = { palisadesEnd: 19, hobokenEnd: 24, harbor: 31, lic: 17, gantry: 18 };

// (west to east / north to south, roughly where each line falls)
export const AVENUE_NAMES = ['NJ', 'HUDSON', 'HUDSON', '12 AV', '11 AV', '9 AV', '8 AV', '6 AV', '5 AV', 'PARK AV', 'LEXINGTON', '1 AV', 'FDR DR', 'EAST RIVER', 'QUEENS', 'BROOKLYN'];
export const STREET_NAMES = ['SPUYTEN DUYVIL', '218 ST', '207 ST', '196 ST', '185 ST', '174 ST', '163 ST', '152 ST', '142 ST', '131 ST', '120 ST', '110 ST', '102 ST', '93 ST', '85 ST', '76 ST', '68 ST', '59 ST', '52 ST', '46 ST', '40 ST', '33 ST', '26 ST', '20 ST', '14 ST', '8 ST', 'HOUSTON ST', 'GRAND ST', 'CHAMBERS ST', 'FULTON ST', 'WALL ST', 'BATTERY PL', 'UPPER BAY', 'UPPER BAY', 'UPPER BAY', 'UPPER BAY', 'UPPER BAY'];

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
