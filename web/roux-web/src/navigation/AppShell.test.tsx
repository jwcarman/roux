// @vitest-environment jsdom
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ThemeProvider } from "../theme/ThemeProvider";
import { describe, expect, it, vi } from "vitest";
import { LuHouse, LuUsers } from "react-icons/lu";
import { rulesFor } from "../testing/css";
import { renderInRouter } from "../testing/router";
import { AppShell, useWidePage, type AccountLayout } from "./AppShell";
import { defineNav } from "./nav";

const nav = defineNav(["members.read"] as const, [
  { label: "Home", to: "/", icon: LuHouse, description: "A welcome page." },
  { label: "Members", to: "/members", icon: LuUsers, permission: "members.read", description: "Who can use the app." },
]);

function show(props: { account?: (layout: AccountLayout) => React.ReactNode; permissions?: string[] } = {}) {
  return renderInRouter(
    <AppShell
      nav={nav}
      permissions={props.permissions ?? ["members.read"]}
      appName="Dojo"
      logo={<i data-testid="logo" />}
      account={props.account}
    >
      <p>The page</p>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("frames the page with a sidebar carrying the name, the logo and the links", async () => {
    show();

    const sidebar = await screen.findByRole("complementary");
    expect(within(sidebar).getByRole("heading", { level: 1 })).toHaveTextContent("Dojo");
    expect(within(sidebar).getByTestId("logo")).toBeInTheDocument();
    expect(within(sidebar).getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("The page");
  });

  it("has a top bar for small screens with the name and a menu button", async () => {
    show();

    const banner = await screen.findByRole("banner", { hidden: true });
    expect(within(banner).getByRole("heading", { level: 1, hidden: true })).toHaveTextContent("Dojo");
    expect(within(banner).getByTestId("logo")).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "Open navigation", hidden: true })).toBeInTheDocument();
  });

  it("opens the same links as a drawer, and closes it after a link is followed", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Open navigation", hidden: true }));

    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    expect(within(drawer).getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("link", { name: "Members" }));

    expect(await screen.findByRole("heading", { name: "Members page" })).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Navigation", hidden: true })).toHaveAttribute("data-state", "closed"),
    );
  });

  it("closes the drawer with its close button", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Open navigation", hidden: true }));

    await userEvent.click(await screen.findByRole("button", { name: "Close navigation" }));

    await vi.waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Navigation", hidden: true })).toHaveAttribute("data-state", "closed"),
    );
  });

  it("draws the account area in the sidebar and in the drawer, telling each how to lay itself out", async () => {
    const layouts: boolean[] = [];
    show({
      account: ({ compact, close }) => {
        layouts.push(compact);
        return <button onClick={close}>Account tools</button>;
      },
    });

    const sidebar = await screen.findByRole("complementary");
    expect(within(sidebar).getByRole("region", { name: "Account" })).toHaveTextContent("Account tools");
    expect(layouts).toContain(true);

    await userEvent.click(screen.getByRole("button", { name: "Open navigation", hidden: true }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    expect(layouts).toContain(false);
    await userEvent.click(within(drawer).getByRole("button", { name: "Account tools" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Navigation", hidden: true })).toHaveAttribute("data-state", "closed"),
    );
  });

  it("draws no account area when the app has none", async () => {
    show();
    await screen.findByRole("complementary");

    expect(screen.queryByRole("region", { name: "Account" })).not.toBeInTheDocument();
  });

  it("only links the pages the person may open", async () => {
    show({ permissions: [] });

    const sidebar = await screen.findByRole("complementary");
    expect(within(sidebar).queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("leaves the page's background to the theme, so a raised theme's tinted page shows behind the content", async () => {
    show();

    const frame = (await screen.findByRole("complementary")).parentElement as HTMLElement;
    expect(rulesFor(frame)).not.toMatch(/background/);
  });

  it("is a 16-wide rail from md and a 60-wide sidebar from lg", async () => {
    show();

    const rules = rulesFor(await screen.findByRole("complementary"));
    expect(rules).toMatch(/min-width: 48rem\)[^}]*width:var\(--chakra-sizes-16\)/);
    expect(rules).toMatch(/min-width: 64rem\)[^}]*width:var\(--chakra-sizes-60\)/);
  });

  it("centers the name and the account area in the rail, and starts them in the sidebar and the drawer", async () => {
    show({ account: () => <span>Account tools</span> });
    const sidebar = await screen.findByRole("complementary");

    const rail = rulesFor(within(sidebar).getByRole("heading", { level: 1 }));
    expect(rail).toMatch(/min-width: 48rem\)[^}]*justify-content:center/);
    expect(rail).toMatch(/min-width: 64rem\)[^}]*justify-content:start/);
    const account = rulesFor(within(sidebar).getByRole("region", { name: "Account" }));
    expect(account).toMatch(/min-width: 48rem\)[^}]*align-items:center/);
    expect(account).toMatch(/min-width: 64rem\)[^}]*align-items:stretch/);

    await userEvent.click(screen.getByRole("button", { name: "Open navigation", hidden: true }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    const inDrawer = rulesFor(within(drawer).getByRole("heading", { level: 1 }));
    expect(inDrawer).toContain("justify-content:start");
    expect(inDrawer).not.toMatch(/min-width: 48rem\)[^}]*justify-content:center/);
    const drawerAccount = rulesFor(within(drawer).getByRole("region", { name: "Account" }));
    expect(drawerAccount).toContain("align-items:stretch");
    expect(drawerAccount).not.toMatch(/min-width: 48rem\)[^}]*align-items:center/);
  });

  describe("the page's width", () => {
    const widthOf = () => rulesFor(screen.getByRole("main"));

    function Wide({ name }: Readonly<{ name: string }>) {
      useWidePage();
      return <p>{name}</p>;
    }

    function Toggle() {
      const [first, setFirst] = useState(true);
      const [second, setSecond] = useState(true);
      return (
        <>
          <button onClick={() => setFirst(false)}>drop first</button>
          <button onClick={() => setSecond(false)}>drop second</button>
          {first && <Wide name="first" />}
          {second && <Wide name="second" />}
        </>
      );
    }

    const shell = (children: React.ReactNode) =>
      renderInRouter(
        <AppShell nav={nav} permissions={[]} appName="Dojo">
          {children}
        </AppShell>,
      );

    it("is the narrow column by default", async () => {
      shell(<p>plain</p>);
      await screen.findByText("plain");
      expect(widthOf()).toContain("max-width:var(--chakra-sizes-3xl)");
    });

    it("is the wide column while a page asks for it, and narrow again once it leaves", async () => {
      shell(<Toggle />);
      await screen.findByText("first");
      expect(widthOf()).toContain("max-width:var(--chakra-sizes-6xl)");
      expect(widthOf()).not.toContain("max-width:var(--chakra-sizes-3xl)");

      await userEvent.click(screen.getByRole("button", { name: "drop first" }));
      expect(widthOf()).toContain("max-width:var(--chakra-sizes-6xl)");

      await userEvent.click(screen.getByRole("button", { name: "drop second" }));
      expect(widthOf()).toContain("max-width:var(--chakra-sizes-3xl)");
    });

    it("is wide before anything can paint: the commit that mounts a caller is followed at once by the wide one", () => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      try {
        // flushSync renders what a layout effect asks for before it returns; a passive effect's update would wait.
        flushSync(() =>
          root.render(
            <ThemeProvider>
              <AppShell nav={defineNav([] as const, [])} permissions={[]} appName="Dojo">
                <Wide name="first" />
              </AppShell>
            </ThemeProvider>,
          ),
        );
        expect(rulesFor(host.querySelector("main") as Element)).toContain("max-width:var(--chakra-sizes-6xl)");
      } finally {
        flushSync(() => root.unmount());
        host.remove();
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
      }
    });

    it("is narrow again before anything can paint once the last caller has gone", async () => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      const page = (withCaller: boolean) => (
        <ThemeProvider>
          <AppShell nav={defineNav([] as const, [])} permissions={[]} appName="Dojo">
            {withCaller ? <Wide name="first" /> : <p>plain</p>}
          </AppShell>
        </ThemeProvider>
      );
      try {
        flushSync(() => root.render(page(true)));
        flushSync(() => root.render(page(false)));
        // Microtasks all run before the browser paints; a state update they schedule would render after it.
        await Promise.resolve();
        expect(rulesFor(host.querySelector("main") as Element)).toContain("max-width:var(--chakra-sizes-3xl)");
      } finally {
        flushSync(() => root.unmount());
        host.remove();
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
      }
    });

    it("costs the shell nothing when a caller re-renders", async () => {
      const renders = { account: 0 };
      function Typing() {
        const [text, setText] = useState("");
        useWidePage();
        return <input aria-label="Search" value={text} onChange={(event) => setText(event.target.value)} />;
      }
      renderInRouter(
        <AppShell
          nav={nav}
          permissions={[]}
          appName="Dojo"
          account={() => {
            renders.account++;
            return null;
          }}
        >
          <Typing />
        </AppShell>,
      );
      await screen.findByLabelText("Search");

      const before = renders.account;
      await userEvent.type(screen.getByLabelText("Search"), "milk");
      await act(async () => {
        await Promise.resolve();
      });
      expect(renders.account).toBe(before);
      expect(widthOf()).toContain("max-width:var(--chakra-sizes-6xl)");
    });

    it("does nothing outside an AppShell", async () => {
      renderInRouter(<Wide name="alone" />);
      expect(await screen.findByText("alone")).toBeInTheDocument();
    });
  });
});
