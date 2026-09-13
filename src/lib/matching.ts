/**
 * Max-weight assignment. rows = tasks that must each get a distinct column.
 * A weight of -Infinity means the pairing is disallowed. Returns assignment[row] = col
 * (or -1 if a row has no finite option). Implemented via the Hungarian algorithm
 * on a square padded cost matrix (cost = finiteMax - weight; minimizing cost
 * maximizes weight).
 */
export function maxWeightAssignment(weights: number[][]): number[] {
  const nRows = weights.length;
  const nCols = weights[0]?.length ?? 0;
  if (nRows === 0 || nCols === 0) return new Array(nRows).fill(-1);
  const n = Math.max(nRows, nCols);

  const finiteMax = Math.max(
    1,
    ...weights.flat().filter((w) => Number.isFinite(w)),
  );
  const DISALLOWED = 1e9;
  const cost: number[][] = [];
  for (let r = 0; r < n; r++) {
    cost[r] = [];
    for (let c = 0; c < n; c++) {
      if (r < nRows && c < nCols) {
        const w = weights[r][c];
        cost[r][c] = Number.isFinite(w) ? finiteMax - w : DISALLOWED;
      } else {
        cost[r][c] = finiteMax; // padded neutral cell
      }
    }
  }

  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row assigned to col (1-indexed)
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array(nRows).fill(-1);
  for (let col = 1; col <= n; col++) {
    const row = p[col] - 1;
    if (row >= 0 && row < nRows && col - 1 < nCols) {
      if (Number.isFinite(weights[row][col - 1])) {
        assignment[row] = col - 1;
      }
    }
  }
  return assignment;
}
