import { describe, expect, it } from "vitest";

import {
  defaultColumnLayout,
  isDefaultColumnLayout,
  moveColumn,
  neighbour,
  parseColumnLayout,
  serialiseColumnLayout,
  setColumnHidden,
} from "./column-layout";

const IDS = ["ga", "rating", "apps", "goals"];
const DEFAULTS = defaultColumnLayout(IDS);
/** The same table with "apps" hidden until asked. */
const APPS_HIDDEN = defaultColumnLayout(IDS, ["apps"]);

function stored(order: string[], hidden: string[] = []): string {
  return serialiseColumnLayout({ order, hidden });
}

describe("parseColumnLayout", () => {
  it("round-trips a stored layout", () => {
    const layout = {
      order: ["apps", "ga", "rating", "goals"],
      hidden: ["goals"],
    };
    expect(parseColumnLayout(serialiseColumnLayout(layout), DEFAULTS)).toEqual(
      layout,
    );
  });

  it("gives the default for nothing stored or anything malformed", () => {
    for (const raw of [
      null,
      "",
      "not json",
      "[]",
      "null",
      JSON.stringify({ order: IDS, hidden: [] }),
      JSON.stringify({ v: 2, order: IDS, hidden: [] }),
      JSON.stringify({ v: 1, order: "ga", hidden: [] }),
      JSON.stringify({ v: 1, order: IDS, hidden: [1] }),
    ]) {
      expect(parseColumnLayout(raw, DEFAULTS)).toEqual(DEFAULTS);
      expect(parseColumnLayout(raw, APPS_HIDDEN)).toEqual(APPS_HIDDEN);
    }
  });

  it("drops ids the table no longer has, and duplicates", () => {
    expect(
      parseColumnLayout(
        stored(["gone", "goals", "goals", "apps", "rating", "ga"], ["gone"]),
        DEFAULTS,
      ),
    ).toEqual({ order: ["goals", "apps", "rating", "ga"], hidden: [] });
  });

  it("puts a new column back after its default predecessor", () => {
    // "apps" is new: by default it follows "rating".
    expect(
      parseColumnLayout(stored(["goals", "rating", "ga"]), DEFAULTS).order,
    ).toEqual(["goals", "rating", "apps", "ga"]);
    // A new first column goes first.
    expect(
      parseColumnLayout(stored(["goals", "apps", "rating"]), DEFAULTS).order,
    ).toEqual(["ga", "goals", "apps", "rating"]);
  });

  it("keeps a new column hidden when the table hides it by default", () => {
    expect(
      parseColumnLayout(stored(["goals", "rating", "ga"], ["ga"]), APPS_HIDDEN),
    ).toEqual({
      order: ["goals", "rating", "apps", "ga"],
      hidden: ["ga", "apps"],
    });
  });

  it("keeps a default-hidden column the viewer chose to show", () => {
    expect(parseColumnLayout(stored(IDS, []), APPS_HIDDEN).hidden).toEqual([]);
  });
});

describe("moveColumn", () => {
  it("moves earlier, landing before the target", () => {
    expect(moveColumn(IDS, "apps", "ga")).toEqual([
      "apps",
      "ga",
      "rating",
      "goals",
    ]);
  });

  it("moves later, landing after the target", () => {
    expect(moveColumn(IDS, "ga", "apps")).toEqual([
      "rating",
      "apps",
      "ga",
      "goals",
    ]);
  });

  it("leaves the order alone for itself or an unknown id", () => {
    expect(moveColumn(IDS, "ga", "ga")).toBe(IDS);
    expect(moveColumn(IDS, "gone", "ga")).toBe(IDS);
    expect(moveColumn(IDS, "ga", "gone")).toBe(IDS);
  });
});

describe("neighbour", () => {
  it("finds the column either side, or none at the ends", () => {
    expect(neighbour(IDS, "rating", -1)).toBe("ga");
    expect(neighbour(IDS, "rating", 1)).toBe("apps");
    expect(neighbour(IDS, "ga", -1)).toBeUndefined();
    expect(neighbour(IDS, "goals", 1)).toBeUndefined();
    expect(neighbour(IDS, "gone", 1)).toBeUndefined();
  });
});

describe("setColumnHidden / isDefaultColumnLayout", () => {
  it("hides and shows a column once", () => {
    const base = defaultColumnLayout(IDS);
    const hidden = setColumnHidden(
      setColumnHidden(base, "apps", true),
      "apps",
      true,
    );
    expect(hidden.hidden).toEqual(["apps"]);
    expect(isDefaultColumnLayout(hidden, DEFAULTS)).toBe(false);
    const shown = setColumnHidden(hidden, "apps", false);
    expect(shown.hidden).toEqual([]);
    expect(isDefaultColumnLayout(shown, DEFAULTS)).toBe(true);
  });

  it("counts a reordered layout as changed", () => {
    expect(
      isDefaultColumnLayout(
        { order: moveColumn(IDS, "apps", "ga"), hidden: [] },
        DEFAULTS,
      ),
    ).toBe(false);
  });

  it("measures against the table's own hidden columns, in any order", () => {
    const both = defaultColumnLayout(IDS, ["apps", "goals"]);
    expect(
      isDefaultColumnLayout({ order: IDS, hidden: ["goals", "apps"] }, both),
    ).toBe(true);
    expect(isDefaultColumnLayout(DEFAULTS, APPS_HIDDEN)).toBe(false);
  });
});
