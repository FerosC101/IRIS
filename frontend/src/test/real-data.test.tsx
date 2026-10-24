import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadReviewSection } from "@/features/real-data/LeadReview";
import { fmtChance, fmtMetric } from "@/features/real-data/format";
import { SessionContext } from "@/hooks/useSession";
import { ToastProvider } from "@/hooks/useToast";
import { canAccess } from "@/lib/navigation";
import type { Meta } from "@/types/api";

afterEach(() => vi.restoreAllMocks());

const STATUS = { source: "HDX", contract_dir: "/x", available: true, min_reason: 10, min_evidence: 5, outputs: {},
  review_statuses: { in_review: "In review", confirmed: "Confirmed reporting problem", not_a_problem: "Not a problem" } };

function session(permissions: string[]) {
  return { meta: { actor: { permissions }, roles: [] } as unknown as Meta, isLoading: false, error: null, role: "resu_analyst" as const, userId: "U",
    can: (p: string) => permissions.includes(p), switchUser: () => {}, unitName: (x: string | null | undefined) => x ?? "", categoryName: (x: string | null | undefined) => x ?? "", refetch: () => {} };
}

function mockApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/real/status")) return new Response(JSON.stringify(STATUS));
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      const review = { ...body, status_label: "Not a problem", by: "Analyst", role: "resu_analyst", at: "2026-10-24T00:00:00Z", model_run_id: "RUN" };
      return new Response(JSON.stringify({ lead_type: body.lead_type, lead_id: body.lead_id, review, history: [review] }));
    }
    return new Response(JSON.stringify([]));
  });
}

function renderReview(permissions: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><SessionContext.Provider value={session(permissions)}><ToastProvider>
    <LeadReviewSection leadType="zero_report" leadId="dengue|R1-A|2020-12-20|zero_priority" />
  </ToastProvider></SessionContext.Provider></QueryClientProvider>);
}

describe("real-data lead review", () => {
  it("will not close a lead without a reason and the evidence checked", async () => {
    const f = mockApi();
    renderReview(["real.view", "real.review"]);
    await userEvent.click(await screen.findByRole("button", { name: "Not a problem" }));
    await userEvent.click(screen.getByRole("button", { name: "Record review" }));
    expect(screen.getByText(/Give a reason/)).toBeInTheDocument();
    expect(f.mock.calls.some(([, i]) => i?.method === "POST")).toBe(false);
    await userEvent.type(screen.getByLabelText(/Reason/), "Genuine lull confirmed by the PESU");
    await userEvent.type(screen.getByLabelText(/Evidence checked/), "Call log 24 Oct");
    await userEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(f.mock.calls.some(([, i]) => i?.method === "POST")).toBe(true));
    const post = f.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toMatchObject({ lead_type: "zero_report", status: "not_a_problem", evidence: "Call log 24 Oct" });
  });

  it("shows no review form to roles that may only view", async () => {
    mockApi();
    renderReview(["real.view"]);
    expect(await screen.findByText(/Only RESU analysts and provincial coordinators/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record review" })).toBeNull();
  });
});

describe("real-data helpers", () => {
  it("formats small chances and pipeline intervals readably", () => {
    expect(fmtChance(1.2e-6)).toBe("< 0.01%");
    expect(fmtChance(0.146)).toBe("15%");
    expect(fmtMetric([0.089, 0.01, 0.175])).toBe("0.089 (0.010–0.175)");
    expect(fmtMetric(null)).toBe("—");
  });

  it("keeps RHU staff out of the real-data page", () => {
    expect(canAccess("/reports/dengue", "rhu_staff")).toBe(false);
    expect(canAccess("/reports/dengue", "resu_analyst")).toBe(true);
  });
});
