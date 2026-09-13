import { describe, it, expect } from "vitest";
import { maxWeightAssignment } from "@/lib/matching";

describe("maxWeightAssignment", () => {
  it("picks the single best cell for a 1x1 matrix", () => {
    expect(maxWeightAssignment([[5]])).toEqual([0]);
  });

  it("maximizes total weight over a 2x2 matrix", () => {
    const m = [
      [2, 9],
      [1, 8],
    ];
    const a = maxWeightAssignment(m);
    const t = m[0][a[0]] + m[1][a[1]];
    expect(t).toBe(10);
    expect(new Set(a).size).toBe(2); // distinct columns
  });

  it("classic assignment example maximizes weight", () => {
    const m = [
      [7, 5, 3],
      [2, 6, 4],
      [3, 4, 5],
    ];
    const a = maxWeightAssignment(m);
    const total = m[0][a[0]] + m[1][a[1]] + m[2][a[2]];
    expect(total).toBe(18); // r0c0(7)+r1c1(6)+r2c2(5)
    expect(new Set(a).size).toBe(3);
  });

  it("never assigns a -Infinity cell", () => {
    const m = [
      [-Infinity, 4],
      [3, -Infinity],
    ];
    const a = maxWeightAssignment(m);
    expect(a[0]).toBe(1);
    expect(a[1]).toBe(0);
  });

  it("handles more cols than rows (weeks < teams)", () => {
    const m = [
      [1, 9, 2, 3],
      [4, 2, 8, 1],
    ];
    const a = maxWeightAssignment(m);
    expect(a.length).toBe(2);
    expect(new Set(a).size).toBe(2);
    expect(m[0][a[0]] + m[1][a[1]]).toBe(17); // r0c1(9)+r1c2(8)
  });

  it("matches brute-force optimum on random 4x4 matrices", () => {
    function brute(m: number[][]): number {
      const n = m.length;
      const cols = [...Array(n).keys()];
      let best = -Infinity;
      const perm = (arr: number[], k: number) => {
        if (k === arr.length) {
          let s = 0;
          for (let r = 0; r < n; r++) s += m[r][arr[r]];
          best = Math.max(best, s);
          return;
        }
        for (let i = k; i < arr.length; i++) {
          [arr[k], arr[i]] = [arr[i], arr[k]];
          perm(arr, k + 1);
          [arr[k], arr[i]] = [arr[i], arr[k]];
        }
      };
      perm(cols, 0);
      return best;
    }
    for (let trial = 0; trial < 50; trial++) {
      const m = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => Math.round(Math.random() * 20 - 10)),
      );
      const a = maxWeightAssignment(m);
      const total = m.reduce((s, row, r) => s + row[a[r]], 0);
      expect(total).toBe(brute(m));
    }
  });
});
