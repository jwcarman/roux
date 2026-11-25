// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../testing/server";
import { themeApi, themeSchema } from "./themeApi";

const THEME = {
  appName: "Dojo",
  palette: "gray",
  brandColor: "#3b82f6",
  shape: "medium",
  headingFont: "standard",
  bodyFont: "standard",
};

describe("themeSchema", () => {
  it("takes a theme the server would", () => {
    expect(themeSchema.safeParse(THEME).success).toBe(true);
    expect(themeSchema.safeParse({ ...THEME, brandColor: "#FF8800" }).success).toBe(true);
  });

  it.each(["x#ff8800", "#ff88001", "#ff880", "red", ""])(
    "refuses the brand color %j in the server's words",
    (brandColor) => {
      const result = themeSchema.safeParse({ ...THEME, brandColor });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Is not in the expected format"]);
    },
  );
});

describe("themeApi", () => {
  it("can be abandoned: the read takes an abort signal", async () => {
    server.use(http.get("/api/roux/theme", () => HttpResponse.json({ ...THEME, version: 1 })));
    const controller = new AbortController();
    controller.abort();

    await expect(themeApi.get(controller.signal)).rejects.toThrow();
  });
});
