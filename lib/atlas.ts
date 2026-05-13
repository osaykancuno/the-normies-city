// Atlas lookup. Atlas is a 100x100 grid of 40x40 cells = 4000x4000 PNG.
// id N occupies cell (N % 100, floor(N / 100)).

export const ATLAS_SIZE = 4000;
export const ATLAS_CELL = 40;
export const ATLAS_COLS = 100;
export const ATLAS_ROWS = 100;

export const NORMIE_COLOR_ON = "#48494b";
export const NORMIE_COLOR_OFF = "#e3e5e4";

/** Returns the top-left UV (in normalized [0,1]) of the atlas cell for the given Normie id. */
export function atlasOffsetUv(id: number): [number, number] {
  const col = id % ATLAS_COLS;
  const row = Math.floor(id / ATLAS_COLS);
  // Note: image coords are top-down; we'll flip in the shader if needed.
  return [(col * ATLAS_CELL) / ATLAS_SIZE, (row * ATLAS_CELL) / ATLAS_SIZE];
}

export const ATLAS_CELL_UV = ATLAS_CELL / ATLAS_SIZE;
