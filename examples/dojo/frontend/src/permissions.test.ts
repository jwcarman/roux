/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import permissionsJson from "./permissions.json?raw";
import { PERMISSIONS } from "./api";

describe("permissions", () => {
  it("api.ts lists exactly the permissions in permissions.json, which the server's AppRoles is tested against", () => {
    const listed = JSON.parse(permissionsJson) as string[];

    expect([...PERMISSIONS].sort()).toEqual([...listed].sort());
  });
});
