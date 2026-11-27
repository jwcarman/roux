import { describe, expect, it } from "vitest";
import { contract } from "../testing/contracts";
import { LOOKS } from "./looks";

describe("LOOKS", () => {
  it("offers the five ready-made looks, as contracts/looks.json has them", () => {
    const shared = contract<Record<string, object>>("looks.json");
    expect(LOOKS.map((look) => look.name)).toEqual(["Clean", "Friendly", "Bold", "Calm", "Classic"]);
    expect(Object.keys(shared).sort()).toEqual(LOOKS.map((look) => look.name).sort());
    for (const look of LOOKS) {
      expect(look.settings).toEqual(shared[look.name]);
    }
  });
});
