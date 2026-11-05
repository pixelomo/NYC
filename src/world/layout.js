// City layout constants. 1 world unit = 2 m = 16 texels/pixels. x = east, y = south, z = up.

export const T = 32; // texels (pixels) per world unit (2x pixel density)
export const K = T / 16; // scale factor for pixel-art sizes authored at 16 texels/unit
export const NB = 4; // blocks per side
export const BLOCK = 18;
export const SIDEWALK = 2;
export const ROAD = 5;
export const STREET = SIDEWALK * 2 + ROAD; // 9
export const PERIOD = STREET + BLOCK; // 27
export const MAP = NB * PERIOD + STREET; // 117
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
export const BLOCK_TYPES = [
  ['deco', 'glass', 'office', 'lofts'],
  ['modern', 'commercial', 'walkups', 'brownstones'],
  ['tenements', 'court', 'park', 'firehouse'],
  ['brownstones', 'brownstones', 'brownstones', 'bodega'],
];

export const AVENUE_NAMES = ['1 AV', '2 AV', '3 AV', 'LEXINGTON', 'PARK AV'];
export const STREET_NAMES = ['W 56 ST', 'W 55 ST', 'W 54 ST', 'W 53 ST', 'W 52 ST'];

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
