import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConcernStatusBadge, SeverityBadge, SlotStatusBadge } from "@/components/data-display/badges";
import { DataTable } from "@/components/data-display/DataTable";
import { FilterBar } from "@/components/data-display/FilterBar";
import { QueueTable } from "@/features/overview/QueueTable";
import { SessionContext } from "@/hooks/useSession";
import type { QueueRow } from "@/types/api";

const stubSession = {
  meta: undefined, isLoading: false, error: null, role: "resu_analyst" as const, userId: "U-RESU-1", can: () => true, switchUser: () => {},
  unitName: (id: string | null | undefined) => id ?? "—", categoryName: (c: string | null | undefined) => ({ DENGUE: "Dengue" } as Record<string, string>)[c ?? ""] ?? c ?? "—", refetch: () => {},
};

describe("status badges", () => {
  it("always carry a text label, never colour alone", () => {
    render(<><SeverityBadge severity="high" /><ConcernStatusBadge status="clarification_requested" /><SlotStatusBadge status="not_received" /></>);
    expect(screen.getByText("High priority")).toBeInTheDocument();
    expect(screen.getByText("Waiting for reply")).toBeInTheDocument();
    expect(screen.getByText("Not received")).toBeInTheDocument();
  });
});

describe("DataTable", () => {
  const rows = [{ id: "a", n: 2 }, { id: "b", n: 1 }];
  it("calls onSort when a sortable header is pressed and activates rows from the keyboard", async () => {
    const onSort = vi.fn();
    const onRow = vi.fn();
    render(<DataTable caption="T" rows={rows} rowKey={(r) => r.id} onRowClick={onRow} sort={{ key: "n", order: "desc" }} onSort={onSort}
      columns={[{ key: "id", header: "ID", cell: (r) => r.id }, { key: "n", header: "Count", sortKey: "n", cell: (r) => r.n }]} />);
    const table = screen.getByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: /Count/ }));
    expect(onSort).toHaveBeenCalledWith({ key: "n", order: "asc" });
    expect(within(table).getByRole("columnheader", { name: /Count/ })).toHaveAttribute("aria-sort", "descending");
    const firstRow = within(table).getAllByRole("row")[1];
    firstRow.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRow).toHaveBeenCalledWith(rows[0]);
  });
  it("shows the empty state when there are no rows", () => {
    render(<DataTable caption="T" rows={[]} rowKey={() => "x"} columns={[]} emptyState={<p>Nothing here</p>} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("FilterBar", () => {
  it("offers to clear filters only when some are active", async () => {
    const onReset = vi.fn();
    const { rerender } = render(<FilterBar activeCount={0} onReset={onReset}><span>f</span></FilterBar>);
    expect(screen.queryByRole("button", { name: /reset/i })).toBeNull();
    rerender(<FilterBar activeCount={2} onReset={onReset}><span>f</span></FilterBar>);
    await userEvent.click(screen.getAllByRole("button", { name: /reset/i })[0]);
    expect(onReset).toHaveBeenCalled();
  });
});

describe("QueueTable", () => {
  const row: QueueRow = {
    kind: "follow_up", id: "F-0004", investigation_id: "INV-0010", display_id: "F-0004", title: "Restore connection", units: ["RHU-KALINAW-1"], units_label: "Kalinaw RHU I + 1 more", province: "Malaya",
    category: null, period_start: "2026-08-31", period_end: "2026-09-20", concern_type: "shared_problem", concern_type_label: "Follow-up action",
    severity: "high", status: "in_progress", status_label: "In progress", verification: null, updated_at: "2026-09-02T09:00:00", assigned: "RESU Analyst",
    due: "2026-10-09", overdue: true, link: "/follow-up?assignment=F-0004",
  };
  it("shows overdue follow-ups with a text label and links to the item", () => {
    render(<SessionContext.Provider value={stubSession}><MemoryRouter><QueueTable rows={[{ ...row, category: "DENGUE" }]} /></MemoryRouter></SessionContext.Provider>);
    // The table and its phone card layout both render; each shows the same details.
    expect(screen.getAllByText(/Dengue/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: /Restore connection/ })) expect(link).toHaveAttribute("href", "/follow-up?assignment=F-0004");
  });
});
