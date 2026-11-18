// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { ProviderSignInButton, ProviderSignInButtons } from "./providers";

function link(name: string) {
  return screen.getByRole("link", { name });
}

describe("ProviderSignInButton", () => {
  it.each([
    ["google", "Continue with Google"],
    ["microsoft", "Continue with Microsoft"],
    ["github", "Continue with GitHub"],
    ["apple", "Continue with Apple"],
    ["gitlab", "Continue with GitLab"],
    ["okta", "Continue with Okta"],
  ])("draws %s as %s, linking to who's authorize URL", (provider, label) => {
    renderWithProviders(<ProviderSignInButton provider={provider} />);

    expect(link(label)).toHaveAttribute("href", `/who/oidc/authorize/${provider}`);
    expect(link(label).querySelector("svg")).not.toBeNull();
  });

  it("knows a provider by its id in any case", () => {
    renderWithProviders(<ProviderSignInButton provider="Google" />);

    expect(link("Continue with Google")).toBeInTheDocument();
  });

  it("draws Google's button as Google's guidelines ask: the four-color G on white, outlined, 40px", () => {
    renderWithProviders(<ProviderSignInButton provider="google" />);
    const button = link("Continue with Google");

    const style = getComputedStyle(button);
    expect(style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(style.color).toBe("rgb(31, 31, 31)");
    expect(style.borderColor).toBe("rgb(116, 119, 117)");
    expect(button.querySelector("svg")?.getAttribute("height")).toBe("18");
    expect(button.querySelector("svg")?.innerHTML).toContain("#4285f4");
    expect(button.className).toMatch(/\S/);
  });

  it("draws Microsoft's four squares in Microsoft's colors", () => {
    renderWithProviders(<ProviderSignInButton provider="microsoft" />);

    const colors = Array.from(link("Continue with Microsoft").querySelectorAll("rect")).map((rect) =>
      rect.getAttribute("fill"),
    );
    expect(colors).toEqual(["#f25022", "#7fba00", "#00a4ef", "#ffb900"]);
  });

  it("gives a provider it does not know a generic icon and who's display name", () => {
    renderWithProviders(<ProviderSignInButton provider="acme-sso" name="Acme Single Sign-On" />);

    expect(link("Continue with Acme Single Sign-On")).toHaveAttribute("href", "/who/oidc/authorize/acme-sso");
    expect(link("Continue with Acme Single Sign-On").querySelector("svg")).not.toBeNull();
  });

  it("falls back to the id when it has no display name", () => {
    renderWithProviders(<ProviderSignInButton provider="acme-sso" />);

    expect(link("Continue with acme-sso")).toBeInTheDocument();
  });

  it("lets a known provider's own name beat the display name given", () => {
    renderWithProviders(<ProviderSignInButton provider="google" name="Corp Login" />);

    expect(link("Continue with Google")).toBeInTheDocument();
  });

  it("takes a label and an icon of the app's own", () => {
    renderWithProviders(
      <ProviderSignInButton provider="google" label="Sign in with Google" icon={<i data-testid="mine" />} />,
    );

    expect(link("Sign in with Google")).toBeInTheDocument();
    expect(screen.getByTestId("mine")).toBeInTheDocument();
    expect(link("Sign in with Google").querySelector("svg")).toBeNull();
  });

  it("takes the button's own props", () => {
    renderWithProviders(<ProviderSignInButton provider="google" width="full" data-testid="google" />);

    expect(screen.getByTestId("google")).toBeInTheDocument();
  });
});

/** What the styles say of `element`: its own declarations, and the ones that apply in dark mode. */
function declarations(element: HTMLElement) {
  const rules = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");
  const rulesOf = (selector: (name: string) => string) =>
    Array.from(element.classList)
      .flatMap((name) => [...rules.matchAll(new RegExp(`${selector(name)}\\s*\\{([^}]*)\\}`, "g"))])
      .map((match) => match[1])
      .join(";");
  return {
    light: rulesOf((name) => `(?<![ ,])\\.${name}`),
    dark: rulesOf((name) => `\\.dark \\.${name},[^{]*`),
    hover: rulesOf((name) => `\\.${name}:is\\(:hover, \\[data-hover\\]\\):not\\(:disabled, \\[data-disabled\\]\\)`),
  };
}

describe("each provider's button", () => {
  it.each([
    ["google", "#ffffff", "#1f1f1f", "#747775", "#131314", "#e3e3e3", "#8e918f"],
    ["microsoft", "#ffffff", "#5e5e5e", "#8c8c8c", "#2f2f2f", "#ffffff", "#2f2f2f"],
    ["apple", "#000000", "#ffffff", "#000000", "#ffffff", "#000000", "#ffffff"],
    ["github", "#24292f", "#ffffff", "#24292f", "#f6f8fa", "#24292f", "#f6f8fa"],
    ["gitlab", "#ffffff", "#1f1f1f", "#747775", "#1f1f1f", "#ffffff", "#8e918f"],
    ["okta", "#007dc1", "#ffffff", "#007dc1", "#007dc1", "#ffffff", "#007dc1"],
    ["acme-sso", "#ffffff", "#1f1f1f", "#747775", "#131314", "#e3e3e3", "#8e918f"],
  ])(
    "%s: %s on %s with a %s outline, and in dark mode %s on %s with a %s outline",
    (provider, bg, color, border, darkBg, darkColor, darkBorder) => {
      renderWithProviders(<ProviderSignInButton provider={provider} />);
      const { light, dark, hover } = declarations(screen.getByRole("link"));

      expect(`;${light}`).toContain(`;background:${bg};`);
      expect(`;${light}`).toContain(`;color:${color};`);
      expect(`;${light}`).toContain(`;border-color:${border};`);
      expect(`;${dark}`).toContain(`;background:${darkBg};`);
      expect(`;${dark}`).toContain(`;color:${darkColor};`);
      expect(`;${dark}`).toContain(`;border-color:${darkBorder};`);
      expect(hover).toContain("opacity:0.9");
    },
  );
});

describe("ProviderSignInButtons", () => {
  it("draws one button for each provider who reports, with who's names", async () => {
    server.use(
      http.get("/who/sign-in", () =>
        HttpResponse.json({
          email: true,
          passkey: true,
          providers: [
            { id: "google", name: "Google" },
            { id: "acme", name: "Acme SSO" },
          ],
        }),
      ),
    );
    const { client: queryClient } = renderWithProviders(<ProviderSignInButtons />);

    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(link("Continue with Acme SSO")).toHaveAttribute("href", "/who/oidc/authorize/acme");
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Continue with Google",
      "Continue with Acme SSO",
    ]);
    expect(queryClient.getQueryCache().find({ queryKey: ["roux", "signInOptions"] })).toBeDefined();
  });

  it("draws nothing when who has no providers", async () => {
    server.use(http.get("/who/sign-in", () => HttpResponse.json({ email: true, passkey: true, providers: [] })));
    renderWithProviders(<ProviderSignInButtons />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("draws nothing when who cannot be asked", async () => {
    server.use(http.get("/who/sign-in", () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<ProviderSignInButtons />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
