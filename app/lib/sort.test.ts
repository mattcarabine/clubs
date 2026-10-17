import { describe, expect, it } from "vitest";
import { sortBy } from "./sort";

type Row = { name: string; goals: number | null };

const rows: Row[] = [
  { name: "Zed", goals: 3 },
  { name: "amy", goals: null },
  { name: "Bo", goals: 10 },
  { name: "Cal", goals: 3 },
];

describe("sortBy", () => {
  it("sorts numbers ascending and descending", () => {
    expect(sortBy(rows, (r) => r.goals, "asc").map((r) => r.name)).toEqual([
      "Zed",
      "Cal",
      "Bo",
      "amy",
    ]);
    expect(sortBy(rows, (r) => r.goals, "desc").map((r) => r.name)).toEqual([
      "Bo",
      "Zed",
      "Cal",
      "amy",
    ]);
  });

  it("keeps missing values last in both directions and ties stable", () => {
    const desc = sortBy(rows, (r) => r.goals, "desc");
    expect(desc.at(-1)?.name).toBe("amy");
    expect(desc.slice(1, 3).map((r) => r.name)).toEqual(["Zed", "Cal"]);
  });

  it("compares strings case-insensitively with natural numbers", () => {
    expect(sortBy(rows, (r) => r.name, "asc").map((r) => r.name)).toEqual([
      "amy",
      "Bo",
      "Cal",
      "Zed",
    ]);
    expect(
      sortBy(["Season 10", "Season 2", "Season 1"], (s) => s, "asc"),
    ).toEqual(["Season 1", "Season 2", "Season 10"]);
  });

  it("does not mutate its input", () => {
    const copy = [...rows];
    sortBy(rows, (r) => r.goals, "asc");
    expect(rows).toEqual(copy);
  });
});
