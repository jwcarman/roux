// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PRIMITIVES } from "../../a2ui";
import { surfaceComponents } from ".";

describe("surfaceComponents", () => {
  it("implements every primitive in the roux catalog", () => {
    expect([...surfaceComponents.components.keys()].sort()).toEqual(PRIMITIVES.map((p) => p.name).sort());
  });
});
