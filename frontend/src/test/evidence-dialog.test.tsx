import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDialog } from "@/features/investigations/ActionDialogs";

describe("EvidenceDialog", () => {
  it("rejects non-http links and sends title, description and link", async () => {
    const onSubmit = vi.fn();
    render(<EvidenceDialog open onOpenChange={() => {}} onSubmit={onSubmit} pending={false} error={null} />);
    await userEvent.type(screen.getByLabelText("Title"), "Register scan");
    await userEvent.type(screen.getByLabelText("What it shows"), "Register shows three dengue cases in W39.");
    await userEvent.type(screen.getByLabelText(/Link/), "ftp://files/scan");
    await userEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByText(/must start with http/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/Link/));
    await userEvent.type(screen.getByLabelText(/Link/), "https://example.org/scan");
    await userEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: "Register scan", detail: "Register shows three dengue cases in W39.", link: "https://example.org/scan" }));
  });
});
