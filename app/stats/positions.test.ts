import { describe, expect, it } from "vitest";

import {
  ALL_POSITIONS,
  describePositionGroups,
  filterByPositionGroups,
  inPositionGroups,
  parsePositionGroups,
  togglePositionGroup,
  writePositionGroups,
} from "./positions";

describe("parsePositionGroups", () => {
  it("reads EA's names in any case and order, canonically ordered", () => {
    expect(parsePositionGroups("forward,MIDFIELDER")).toEqual([
      "Midfielder",
      "Forward",
    ]);
  });

  it("ignores unknown names, abbreviations and repeats", () => {
    expect(parsePositionGroups("fwd,forward,forward,attack")).toEqual([
      "Forward",
    ]);
  });

  it("gives All Positions for a missing or wholly invalid value", () => {
    expect(parsePositionGroups(null)).toEqual(ALL_POSITIONS);
    expect(parsePositionGroups("")).toEqual(ALL_POSITIONS);
    expect(parsePositionGroups("striker")).toEqual(ALL_POSITIONS);
  });
});

describe("writePositionGroups", () => {
  it("writes lower-case names in Goalkeeper-to-Forward order", () => {
    expect(writePositionGroups(["Forward", "Defender"])).toBe(
      "defender,forward",
    );
  });

  it("leaves All Positions out of the URL", () => {
    expect(writePositionGroups(ALL_POSITIONS)).toBeNull();
  });

  it("round-trips", () => {
    const groups = ["Goalkeeper", "Midfielder"] as const;
    expect(parsePositionGroups(writePositionGroups(groups))).toEqual(groups);
  });
});

describe("togglePositionGroup", () => {
  it("adds and removes a group, keeping the canonical order", () => {
    expect(togglePositionGroup(["Forward"], "Defender")).toEqual([
      "Defender",
      "Forward",
    ]);
    expect(togglePositionGroup(["Defender", "Forward"], "Defender")).toEqual([
      "Forward",
    ]);
  });

  it("goes back to All Positions when the last group is removed", () => {
    expect(togglePositionGroup(["Forward"], "Forward")).toEqual(ALL_POSITIONS);
  });
});

describe("inPositionGroups", () => {
  it("counts everything, even an unknown position, under All Positions", () => {
    expect(inPositionGroups(ALL_POSITIONS, "Goalkeeper")).toBe(true);
    expect(inPositionGroups(ALL_POSITIONS, null)).toBe(true);
  });

  it("counts only the selected groups otherwise", () => {
    expect(inPositionGroups(["Forward"], "Forward")).toBe(true);
    expect(inPositionGroups(["Forward"], "Midfielder")).toBe(false);
    expect(inPositionGroups(["Forward"], null)).toBe(false);
  });
});

describe("filterByPositionGroups", () => {
  it("keeps the rows in the selected groups, in order", () => {
    const rows = [
      { id: 1, positionGroup: "Midfielder" as const },
      { id: 2, positionGroup: "Forward" as const },
      { id: 3, positionGroup: null },
      { id: 4, positionGroup: "Forward" as const },
    ];
    expect(filterByPositionGroups(rows, ["Forward"]).map((r) => r.id)).toEqual([
      2, 4,
    ]);
    expect(filterByPositionGroups(rows, ALL_POSITIONS)).toEqual(rows);
  });
});

describe("describePositionGroups", () => {
  it("names the selection in words", () => {
    expect(describePositionGroups(ALL_POSITIONS)).toBe("All Positions");
    expect(describePositionGroups(["Forward"])).toBe("Forward");
    expect(describePositionGroups(["Forward", "Midfielder"])).toBe(
      "Midfielder or Forward",
    );
    expect(describePositionGroups(["Forward", "Defender", "Goalkeeper"])).toBe(
      "Goalkeeper, Defender or Forward",
    );
  });
});
