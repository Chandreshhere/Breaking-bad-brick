/**
 * Formation templates — pure functions from (grid size, seeded rng) to a
 * 0/1 matrix. Row 0 is the farthest row. Templates are deterministic for a
 * given rng, so level seeds replay exactly.
 */

export type FormationName =
  | 'PYRAMID'
  | 'DIAMOND'
  | 'SPIRAL'
  | 'TUNNEL'
  | 'FORTRESS'
  | 'WINGS'
  | 'SNAKE'
  | 'RINGS'
  | 'COLUMNS'
  | 'CHECKERBOARD'
  | 'RANDOM_CLUSTER';

export type Rng = () => number;

const empty = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

type Builder = (rows: number, cols: number, rng: Rng) => number[][];

const BUILDERS: Record<FormationName, Builder> = {
  PYRAMID: (rows, cols) => {
    const m = empty(rows, cols);
    for (let r = 0; r < rows; r++) {
      const half = Math.min(Math.floor(cols / 2), r + 1);
      for (let c = 0; c < cols; c++) {
        if (Math.abs(c - (cols - 1) / 2) <= half - 0.5) m[r][c] = 1;
      }
    }
    return m;
  },

  DIAMOND: (rows, cols) => {
    const m = empty(rows, cols);
    const midR = (rows - 1) / 2;
    const midC = (cols - 1) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.abs(r - midR) / midR + Math.abs(c - midC) / midC <= 1.05) m[r][c] = 1;
      }
    }
    return m;
  },

  SPIRAL: (rows, cols) => {
    const m = empty(rows, cols);
    let top = 0;
    let bottom = rows - 1;
    let left = 0;
    let right = cols - 1;
    let draw = true;
    while (top <= bottom && left <= right) {
      if (draw) {
        for (let c = left; c <= right; c++) m[top][c] = 1;
        for (let r = top; r <= bottom; r++) m[r][right] = 1;
      }
      draw = !draw;
      top += 1;
      right -= 1;
      bottom -= 1;
      left += 1;
    }
    return m;
  },

  TUNNEL: (rows, cols) => {
    const m = empty(rows, cols);
    const wallW = Math.max(2, Math.floor(cols * 0.3));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || c < wallW || c >= cols - wallW) m[r][c] = 1;
      }
    }
    return m;
  },

  FORTRESS: (rows, cols, rng) => {
    const m = empty(rows, cols);
    for (let r = 0; r < rows - 2; r++) {
      for (let c = 1; c < cols - 1; c++) m[r][c] = 1;
    }
    // battlements on the near face + a few gates
    for (let c = 1; c < cols - 1; c += 2) m[rows - 2][c] = 1;
    for (let i = 0; i < 2; i++) {
      const gate = 2 + Math.floor(rng() * (cols - 4));
      for (let r = 1; r < rows - 2; r++) m[r][gate] = 0;
    }
    return m;
  },

  WINGS: (rows, cols) => {
    const m = empty(rows, cols);
    for (let r = 0; r < rows; r++) {
      const span = rows - r;
      for (let c = 0; c < cols; c++) {
        if (c < span || c >= cols - span) m[r][c] = 1;
      }
    }
    return m;
  },

  SNAKE: (rows, cols, rng) => {
    const m = empty(rows, cols);
    let dir = rng() > 0.5 ? 1 : -1;
    for (let r = 0; r < rows; r += 2) {
      for (let c = 0; c < cols; c++) m[r][c] = 1;
      const joint = dir > 0 ? cols - 1 : 0;
      if (r + 1 < rows) m[r + 1][joint] = 1;
      dir = -dir;
    }
    return m;
  },

  RINGS: (rows, cols) => {
    const m = empty(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ring = Math.min(r, rows - 1 - r, c, cols - 1 - c);
        if (ring % 2 === 0) m[r][c] = 1;
      }
    }
    return m;
  },

  COLUMNS: (rows, cols) => {
    const m = empty(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c % 3 !== 2) m[r][c] = 1;
      }
    }
    return m;
  },

  CHECKERBOARD: (rows, cols) => {
    const m = empty(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) m[r][c] = 1;
      }
    }
    return m;
  },

  RANDOM_CLUSTER: (rows, cols, rng) => {
    const m = empty(rows, cols);
    const blobs = 3 + Math.floor(rng() * 3);
    for (let b = 0; b < blobs; b++) {
      const cr = Math.floor(rng() * rows);
      const cc = Math.floor(rng() * cols);
      const radius = 1.2 + rng() * 1.6;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.hypot(r - cr, c - cc) <= radius) m[r][c] = 1;
        }
      }
    }
    return m;
  },
};

export function buildFormation(
  name: FormationName,
  rows: number,
  cols: number,
  rng: Rng
): number[][] {
  return BUILDERS[name](rows, cols, rng);
}
