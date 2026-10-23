import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetDemo } from "@/features/data-management/ResetDemo";

afterEach(() => vi.restoreAllMocks());

function renderReset() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><ResetDemo /></MemoryRouter></QueryClientProvider>);
}

describe("ResetDemo", () => {
  it("keeps the destructive action disabled until RESET is typed, then sends the confirmation", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ concerns: 1, records: 2, scenarios: [] }), { status: 200 }));
    renderReset();
    await userEvent.click(screen.getByRole("button", { name: /reset demo data/i }));
    const dialog = await screen.findByRole("dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Reset demo data")!;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type RESET to confirm/), "reset");
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Type RESET to confirm/));
    await userEvent.type(screen.getByLabelText(/Type RESET to confirm/), "RESET");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toMatchObject({ confirm: "RESET" });
  });
});
