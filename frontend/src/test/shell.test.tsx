import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/layout/Footer";
import { TopNav, initials, shortName } from "@/components/layout/TopNav";
import { GlobalFilterBar } from "@/components/shell/GlobalFilterBar";
import { Hero } from "@/components/shell/Hero";
import { updatedLabel } from "@/components/shell/ScreenHeader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionContext } from "@/hooks/useSession";
import type { Meta, Role } from "@/types/api";

afterEach(() => vi.restoreAllMocks());

const weeks = [23, 24, 25].map((w, i) => ({
  week: w, start: `2026-09-${14 + 7 * i}`, end: `2026-09-${20 + 7 * i}`, iso_week: 38 + i, label: "", iso_label: `ISO W${38 + i} · label`,
}));
weeks[2] = { ...weeks[2], start: "2026-09-28", end: "2026-10-04", iso_label: "ISO W40 · 28 Sep–04 Oct" };

function meta(role: Role): Meta {
  return {
    app: { name: "IRIS", full_name: "", tagline: "", prototype_notice: "" }, as_of: "2026-10-08T09:00:00", demo_dataset_id: "DS-DEMO-FACILITY",
    actor: { user_id: role === "rhu_staff" ? "U-RHU" : "U-RESU", role, display_name: role === "rhu_staff" ? "Hiraya RHU Encoder (demo)" : "RESU Surveillance Analyst (demo)", reporting_unit_id: null, province: null, permissions: [] },
    roles: [], units: [], provinces: ["Malaya", "Masagana"], weeks,
    users: [
      { id: "U-RESU", display_name: "RESU Surveillance Analyst (demo)", role: "resu_analyst", reporting_unit_id: null, province: null },
      { id: "U-RHU", display_name: "Hiraya RHU Encoder (demo)", role: "rhu_staff", reporting_unit_id: "RHU-HIRAYA", province: "Masagana" },
    ],
    categories: [
      { code: "DENGUE", name: "Dengue", description: "", frequency: "weekly" },
      { code: "LEPTO", name: "Leptospirosis", description: "", frequency: "weekly" },
      { code: "MCS", name: "Monthly consultation summary", description: "", frequency: "monthly" },
    ],
    labels: { status: {} as Meta["labels"]["status"], concern_type: {} as Meta["labels"]["concern_type"], method: {} as Meta["labels"]["method"], action_type: {}, scenario_kind: {} },
  };
}

function Location() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname}{loc.search}</output>;
}

function setup(ui: ReactNode, { role = "resu_analyst" as Role, path = "/", switchUser = vi.fn() } = {}) {
  const m = meta(role);
  const session = {
    meta: m, isLoading: false, error: null, role, userId: m.actor.user_id, can: () => true, switchUser,
    unitName: (id: string | null | undefined) => id ?? "—", categoryName: (c: string | null | undefined) => c ?? "—", refetch: () => {},
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>
        <TooltipProvider><MemoryRouter initialEntries={[path]}>{ui}<Location /></MemoryRouter></TooltipProvider>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { switchUser };
}

describe("Hero", () => {
  it("shows the headline and falls back to the gradient alone if the photo fails", () => {
    setup(<Hero variant="deep" photo="maskedCloseup" eyebrow="Evidence workspace" title="From report to understanding." updated="Updated 08 Oct 2026 · 09:00 PHT" />);
    expect(screen.getByRole("heading", { level: 1, name: "From report to understanding." })).toBeInTheDocument();
    expect(screen.getByText("Updated 08 Oct 2026 · 09:00 PHT")).toBeInTheDocument();
    const img = document.querySelector(".iris-hero__photo img") as HTMLImageElement;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("eager");
    fireEvent.error(img);
    expect(document.querySelector(".iris-hero__photo")).toBeNull();
    expect(document.querySelector(".iris-hero__overlay")).not.toBeNull();
  });
  it("formats the backend snapshot time in PHT", () => {
    expect(updatedLabel("2026-10-08T09:00:00")).toBe("Updated 08 Oct 2026 · 09:00 PHT");
    expect(updatedLabel(undefined)).toBeUndefined();
  });
});

describe("GlobalFilterBar", () => {
  it("defaults to dengue and the latest ISO week, and writes choices to the URL", async () => {
    setup(<GlobalFilterBar />, { path: "/reports?tab=x" });
    expect(screen.getByText("Synthetic demo data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ISO week range: ISO W40 · 28 Sep–04 Oct/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Disease: Dengue/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByText("Monthly consultation summary")).toBeNull(); // weekly categories only
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Leptospirosis" }));
    expect(screen.getByTestId("location").textContent).toBe("/reports?tab=x&disease=LEPTO");
    await userEvent.click(screen.getByRole("button", { name: /^Region:/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Simulated region · Malaya" }));
    expect(screen.getByTestId("location").textContent).toContain("region=Malaya");
    await userEvent.click(screen.getByRole("button", { name: /^Unit group:/ }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "Hospitals" }));
    expect(screen.getByTestId("location").textContent).toContain("group=hospital");
  });
  it("sets a week range from the popover", async () => {
    setup(<GlobalFilterBar />, { path: "/" });
    await userEvent.click(screen.getByRole("button", { name: /ISO week range/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Last 4 weeks" }));
    expect(screen.getByTestId("location").textContent).toContain("from=22");
    await userEvent.selectOptions(screen.getByLabelText("From"), "24");
    expect(screen.getByTestId("location").textContent).toContain("from=24");
  });
});

describe("TopNav", () => {
  it("shows the sections a role can open and marks the current one", () => {
    setup(<TopNav />, { path: "/investigations/C-0021" });
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const links = within(nav).getAllByRole("link").map((l) => l.textContent);
    expect(links).toEqual(["Dashboard", "Reports & Analysis", "Reporting Network", "Investigations & Actions", "Data & Models"]);
    expect(within(nav).getByRole("link", { name: "Investigations & Actions" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
  it("hides sections an RHU user cannot open", () => {
    setup(<TopNav />, { role: "rhu_staff" });
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Dashboard", "Reports & Analysis", "Investigations & Actions"]);
  });
  it("switches the demo role from the account menu", async () => {
    const { switchUser } = setup(<TopNav />, { path: "/network" });
    await userEvent.click(screen.getByRole("button", { name: /Account menu: RESU Surveillance Analyst/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Settings and preferences/ })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "Hiraya RHU Encoder" }));
    expect(switchUser).toHaveBeenCalledWith("U-RHU");
    expect(screen.getByTestId("location").textContent).toBe("/"); // RHU staff cannot open the network
  });
  it("derives a short name and initials from demo display names", () => {
    expect(shortName("RESU Surveillance Analyst (demo)")).toBe("RESU Surveillance Analyst");
    expect(initials("Malaya Provincial Coordinator (demo)")).toBe("MP");
  });
});

describe("Footer", () => {
  it("keeps the disclaimer and opens the provenance drawer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{
      id: "DS-DEMO-FACILITY", name: "IRIS demo", description: "", source: "Generated by the IRIS simulator", designation: "synthetic", geographic_level: "facility",
      imported_at: "2026-10-08T09:00:00", imported_by: null, coverage_start: "2026-04-06", coverage_end: "2026-10-04", row_count: 1945,
      validation_status: "valid", known_limitations: ["All units are fictional."], has_expectations: true, has_timestamps: true, has_units: true, is_demo: true,
      checksum: "a".repeat(64), checksum_basis: "canonical_records", checksum_algorithm: "SHA-256",
    }]), { status: 200 }));
    setup(<Footer />);
    expect(screen.getByText(/Synthetic demo records · Not verified public-health statistics · PHT \(UTC\+8\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Data provenance/ }));
    const drawer = await screen.findByRole("dialog", { name: "Data provenance" });
    expect(await within(drawer).findByText("Generated by the IRIS simulator")).toBeInTheDocument();
    expect(within(drawer).getByText("All units are fictional.")).toBeInTheDocument();
  });
});

describe("Design preview (development only)", () => {
  it("shows the five screen heroes, both fallbacks, the filter bar and every photo surface", async () => {
    const { DesignPreviewPage } = await import("@/features/design-preview/DesignPreviewPage");
    setup(<DesignPreviewPage />, { path: "/design-preview" });
    const heroes = document.querySelectorAll(".iris-hero");
    expect(heroes).toHaveLength(7);
    expect([...heroes].filter((h) => !h.querySelector(".iris-hero__photo"))).toHaveLength(2); // gradient-only fallbacks
    expect(screen.getByRole("group", { name: "Screen filters" })).toBeInTheDocument();
    const variants = [...document.querySelectorAll(".iris-photo-surface")].map((s) => s.getAttribute("data-variant"));
    expect(new Set(variants)).toEqual(new Set(["deep", "light", "teal"]));
  });
});

describe("page filters and the global filter bar share the URL", () => {
  it("mergeSearch keeps other keys, removes empty ones and keeps deliberate empties", async () => {
    const { mergeSearch } = await import("@/lib/url");
    const p = new URLSearchParams("region=Malaya&disease=LEPTO&page=3&status=active");
    expect(mergeSearch(p, { search: "tala", page: null }).toString()).toBe("region=Malaya&disease=LEPTO&status=active&search=tala");
    expect(mergeSearch(p, { status: "" }).has("status")).toBe(false);
    expect(mergeSearch(p, { status: "" }, ["status"]).get("status")).toBe("");
  });
  it("changing an Investigations filter keeps the global filters", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/overview")
        ? { counts: { new: 1, under_review: 0, clarification_requested: 0, in_investigation: 0, overdue_follow_ups: 0, follow_ups_active: 0, tasks: 0 } }
        : { rows: [], total: 0, page: 1, page_size: 20, pages: 1 };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const { InvestigationsPage } = await import("@/features/investigations/InvestigationsPage");
    setup(<InvestigationsPage />, { path: "/investigations?region=Malaya&disease=LEPTO&from=23&to=25&page=2" });
    await userEvent.type(screen.getByPlaceholderText("Search by concern ID or keyword"), "zero");
    const loc = new URLSearchParams(screen.getByTestId("location").textContent!.split("?")[1]);
    expect(loc.get("search")).toBe("zero");
    expect([loc.get("region"), loc.get("disease"), loc.get("from"), loc.get("to")]).toEqual(["Malaya", "LEPTO", "23", "25"]);
    expect(loc.has("page")).toBe(false); // a new filter starts again at page 1
  });
});
