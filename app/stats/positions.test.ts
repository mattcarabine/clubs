import { describe, expect, it } from "vitest";

import type { PositionGroup } from "~/lib/domain";

import { inMainPosition, mainPosition } from "./positions";

const apps = (...groups: (PositionGroup | null)[]) =>
  groups.map((positionGroup, id) => ({ id, positionGroup }));

describe("mainPosition", () => {
  it("is the group with the most Appearances", () => {
    expect(
      mainPosition(
        apps("Forward", "Midfielder", "Midfielder", "Forward", "Midfielder"),
      ),
    ).toBe("Midfielder");
  });

  it("gives a tie to the group played most recently", () => {
    expect(mainPosition(apps("Forward", "Midfielder"))).toBe("Midfielder");
    expect(
      mainPosition(apps("Midfielder", "Forward", "Forward", "Midfielder")),
    ).toBe("Midfielder");
  });

  it("ignores Appearances with no position", () => {
    expect(mainPosition(apps(null, null, "Defender"))).toBe("Defender");
    expect(mainPosition(apps(null))).toBeNull();
    expect(mainPosition([])).toBeNull();
  });
});

describe("inMainPosition", () => {
  const rows = apps("Midfielder", "Forward", "Midfielder", null);

  it("keeps only the Main Position's Appearances when on", () => {
    expect(inMainPosition(rows, true).map((r) => r.id)).toEqual([0, 2]);
  });

  it("keeps everything when off", () => {
    expect(inMainPosition(rows, false)).toEqual(rows);
  });

  it("keeps everything when no Appearance has a position", () => {
    const unknown = apps(null, null);
    expect(inMainPosition(unknown, true)).toEqual(unknown);
  });
});
