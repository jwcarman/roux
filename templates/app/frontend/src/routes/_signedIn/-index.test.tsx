// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { USERS_READ } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";

describe("Home", () => {
  it("welcomes the signed-in user by name", async () => {
    renderRoute("/", { permissions: [] });

    expect(await screen.findByText("Welcome, Test User")).toBeInTheDocument();
  });

  it("links to Users for someone who may see them", async () => {
    renderRoute("/", { permissions: [USERS_READ] });

    await screen.findByText("Welcome, Test User");
    expect(screen.getByRole("main").querySelector('a[href="/users"]')).toHaveTextContent("Users");
  });

  it("does not link to Users for someone who may not see them", async () => {
    renderRoute("/", { permissions: [] });

    await screen.findByText("Welcome, Test User");
    expect(screen.getByRole("main").querySelector('a[href="/users"]')).toBeNull();
  });
});
