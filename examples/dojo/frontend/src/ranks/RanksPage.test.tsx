// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { RANKS_MANAGE, RANKS_READ } from "../permissions.gen";
import { invalidFields, server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../testing/route";
import { queryKeys } from "../queryKeys";
import { moveRankDown, moveRankUp, removeRank, updateRank, type Rank } from "./ranks";

const WHITE: Rank = { id: "r1", name: "White", colour: "WHITE", position: 1, version: 0 };
const YELLOW: Rank = { id: "r2", name: "Yellow", colour: "YELLOW", position: 2, version: 0 };

/** The rank names in the table, top to bottom, once it has rows. */
async function ladder(): Promise<string[]> {
  const table = await screen.findByRole("table", { name: "Ranks" });
  const names = await within(table).findAllByText(/^(White|Yellow)$/);
  return names.map((name) => name.textContent ?? "");
}

function ranks(...list: Rank[]) {
  server.use(http.get("/api/ranks", () => HttpResponse.json(list)));
}

describe("RanksPage", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("lists the ladder lowest first, read-only without ranks.manage", async () => {
    ranks(WHITE, YELLOW);
    renderRoute("/ranks", { permissions: [RANKS_READ] });

    expect(await ladder()).toEqual(["White", "Yellow"]);
    expect(screen.queryByRole("button", { name: "New rank" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("disables moving past either end of the ladder", async () => {
    ranks(WHITE, YELLOW);
    renderRoute("/ranks", { permissions: [RANKS_READ, RANKS_MANAGE] });

    expect(await screen.findByRole("button", { name: "Move White down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move White up" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Yellow up" })).toBeDisabled();
  });

  it("moves a rank up and shows the new order", async () => {
    let served = [WHITE, YELLOW];
    server.use(
      http.get("/api/ranks", () => HttpResponse.json(served)),
      http.post("/api/ranks/r1/move-up", () => {
        served = [
          { ...YELLOW, position: 1 },
          { ...WHITE, position: 2 },
        ];
        return HttpResponse.json(served);
      }),
    );
    renderRoute("/ranks", { permissions: [RANKS_READ, RANKS_MANAGE] });

    await userEvent.setup().click(await screen.findByRole("button", { name: "Move White up" }));

    await waitFor(async () => expect(await ladder()).toEqual(["Yellow", "White"]));
  });

  it("marks the students' cached lists and pages stale when a rank changes, so no old rank name lingers", async () => {
    ranks(WHITE, YELLOW);
    server.use(http.post("/api/ranks/r1/move-up", () => HttpResponse.json([YELLOW, WHITE])));
    const { client } = renderRoute("/ranks", { permissions: [RANKS_READ, RANKS_MANAGE] });
    const list = queryKeys.students.list({});
    const detail = queryKeys.students.detail("s1");
    client.setQueryData(list, { data: [] });
    client.setQueryData(detail, { id: "s1" });
    expect(client.getQueryState(list)?.isInvalidated).toBe(false);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Move White up" }));

    await waitFor(() => expect(client.getQueryState(list)?.isInvalidated).toBe(true));
    expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
  });

  it.each([
    ["updateRank", updateRank("r1", 0)],
    ["moveRankUp", moveRankUp],
    ["moveRankDown", moveRankDown],
    ["removeRank", removeRank],
  ])("%s refreshes the students too", (_, mutation) => {
    expect(mutation.meta?.refreshes).toEqual([queryKeys.ranks.lists(), queryKeys.students.all]);
  });

  it("shows the server's refusal of a name under the Name field", async () => {
    ranks(WHITE);
    server.use(http.post("/api/ranks", () => invalidFields({ name: "Another rank has this name" })));
    renderRoute("/ranks", { permissions: [RANKS_READ, RANKS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New rank" }));
    const dialog = await screen.findByRole("dialog", { name: "New rank" });
    await user.type(within(dialog).getByLabelText(/^Name/), "white");
    await user.selectOptions(within(dialog).getByLabelText(/^Colour/), "WHITE");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Another rank has this name")).toBeInTheDocument();
  });

  it("asks before removing, then removes", async () => {
    let removed = false;
    server.use(
      http.get("/api/ranks", () => HttpResponse.json(removed ? [] : [WHITE])),
      http.delete("/api/ranks/r1", () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute("/ranks", { permissions: [RANKS_READ, RANKS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove White?" });
    expect(removed).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("No ranks yet.")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("White was removed");
  });
});
