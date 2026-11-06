// City layout constants. 1 world unit = 2 m = 16 texels/pixels. x = east, y = south, z = up.

export const T = 32; // texels (pixels) per world unit (2x pixel density)
export const K = T / 16; // scale factor for pixel-art sizes authored at 16 texels/unit
export const NB = 6; // blocks per side
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

// BLOCK_TYPES[by][bx]. Camera starts in the south-east, so tall stuff lives in the north-west.
// The middle 2x2 blocks (and the streets between them) are one big park; the outer ring is
// mostly red-brick residential with shopping blocks and a mini Times Square in the north-east.
export const BLOCK_TYPES = [
  ['walkups', 'tenements', 'redbrick', 'billboards', 'timessq', 'billboards'],
  ['redbrick', 'deco', 'glass', 'office', 'lofts', 'tenements'],
  ['shops', 'modern', 'park', 'park', 'commercial', 'shops'],
  ['shops', 'tenements', 'park', 'park', 'court', 'redbrick'],
  ['redbrick', 'firehouse', 'walkups', 'brownstones', 'bodega', 'walkups'],
  ['tenements', 'redbrick', 'shops', 'shops', 'brownstones', 'redbrick'],
];

// The big park: blocks bx0..bx1 x by0..by1 merged, swallowing the streets between them.
export const PARK = { bx0: 2, by0: 2, bx1: 3, by1: 3 };
// lot area inside the park wall
export const parkRect = () => ({ x0: lotStart(PARK.bx0), y0: lotStart(PARK.by0), x1: lotEnd(PARK.bx1), y1: lotEnd(PARK.by1) });
// raised area incl. the sidewalk ring around it
export const parkPlinth = () => ({ x0: roadEnd(PARK.bx0), y0: roadEnd(PARK.by0), x1: roadStart(PARK.bx1 + 1), y1: roadStart(PARK.by1 + 1) });
export const blockInPark = (bx, by) => bx >= PARK.bx0 && bx <= PARK.bx1 && by >= PARK.by0 && by <= PARK.by1;
// intersections swallowed by the park (strictly inside it)
export const isParkIntersection = (i, j) => i > PARK.bx0 && i <= PARK.bx1 && j > PARK.by0 && j <= PARK.by1;
// is the leg of intersection (i, j) heading in direction (dx, dy) a road?
export const roadLegOpen = (i, j, dx, dy) => {
  const ni = i + dx, nj = j + dy;
  if (ni < 0 || nj < 0 || ni > NB || nj > NB) return false;
  return !isParkIntersection(i, j) && !isParkIntersection(ni, nj);
};
// intersections round the park, for the bus loop: [west/north index, east/south index]
export const parkLoop = () => ({ i0: PARK.bx0, i1: PARK.bx1 + 1, j0: PARK.by0, j1: PARK.by1 + 1 });

export const AVENUE_NAMES = ['YORK AV', '1 AV', '2 AV', '3 AV', 'LEXINGTON', 'PARK AV', 'MADISON'];
export const STREET_NAMES = ['W 57 ST', 'W 56 ST', 'W 55 ST', 'W 54 ST', 'W 53 ST', 'W 52 ST', 'W 51 ST'];

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
