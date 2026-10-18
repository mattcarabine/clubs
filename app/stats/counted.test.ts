import { describe, expect, it } from "vitest";

import {
  isCountedAppearance,
  isPlayedAppearance,
  quitBy,
  weQuit,
} from "./counted";

describe("quitBy", () => {
  it("says who quit a DNF: us in a loss, the Opponent in a Win", () => {
    expect(quitBy({ dnf: true, outcome: "L" })).toBe("us");
    expect(quitBy({ dnf: true, outcome: "W" })).toBe("opponent");
    expect(weQuit({ dnf: true, outcome: "L" })).toBe(true);
    expect(weQuit({ dnf: true, outcome: "W" })).toBe(false);
  });

  it("is null for a Match played to the end", () => {
    expect(quitBy({ dnf: false, outcome: "L" })).toBeNull();
    expect(weQuit({ dnf: false, outcome: "L" })).toBe(false);
  });
});

describe("isCountedAppearance", () => {
  const full = { secondsPlayed: 5400, dnf: false, outcome: "L" } as const;

  it("counts an Appearance with minutes in a finished Match", () => {
    expect(isCountedAppearance(full)).toBe(true);
  });

  it("never counts a dropped-out player's 0 minutes", () => {
    expect(isPlayedAppearance({ secondsPlayed: 0 })).toBe(false);
    expect(isCountedAppearance({ ...full, secondsPlayed: 0 })).toBe(false);
  });

  it("leaves out our side of a DNF we quit, not one the Opponent quit", () => {
    expect(isCountedAppearance({ ...full, dnf: true })).toBe(false);
    expect(isCountedAppearance({ ...full, dnf: true, outcome: "W" })).toBe(
      true,
    );
  });
});
