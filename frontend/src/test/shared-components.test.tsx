import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Donut } from "@/components/data-display/Donut";
import { Heatmap } from "@/components/data-display/Heatmap";
import { SchematicMap } from "@/components/data-display/SchematicMap";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CommandPalette } from "@/components/ui/command-palette";
import { DropdownMenu } from "@/components/ui/menu-popover";
import { Drawer, Modal } from "@/components/ui/overlay";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { DisabledReason, TooltipProvider } from "@/components/ui/tooltip";

afterEach(() => vi.restoreAllMocks());
const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("Callout", () => {
  it("names each kind of statement so a flag is never read as a finding", () => {
    wrap(<>
      <Callout variant="model-flag" by="Zero-case run">Three consecutive zero-case submissions.</Callout>
      <Callout variant="human-confirmed" by="RESU analyst">Receipt confirmed.</Callout>
      <Callout variant="info">Context only.</Callout>
    </>);
    const notes = screen.getAllByRole("note");
    expect(notes.map((n) => n.getAttribute("data-variant"))).toEqual(["model-flag", "human-confirmed", "info"]);
    expect(within(notes[0]).getByText(/Model flag · not a finding · Zero-case run/)).toBeInTheDocument();
    expect(within(notes[1]).getByText(/Human-confirmed · RESU analyst/)).toBeInTheDocument();
  });
});

describe("Modal and Drawer", () => {
  it("open from their trigger, close with Escape and return focus", async () => {
    wrap(<>
      <Modal title="Send reminder" trigger={<Button>Open modal</Button>} footer={<Button>Send</Button>}><p>Body</p></Modal>
      <Drawer title="Inspect dataset" trigger={<Button>Open drawer</Button>}><p>Schema</p></Drawer>
    </>);
    const open = screen.getByRole("button", { name: "Open modal" });
    await userEvent.click(open);
    expect(screen.getByRole("dialog", { name: "Send reminder" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(open).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Open drawer" }));
    expect(within(screen.getByRole("dialog", { name: "Inspect dataset" })).getByText("Schema")).toBeInTheDocument();
  });
  it("can refuse to close while work is saving", async () => {
    function Saving() {
      const [open, setOpen] = useState(true);
      return <Modal title="Saving" open={open} onOpenChange={setOpen} dismissible={false}><p>Please wait</p></Modal>;
    }
    wrap(<Saving />);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Saving" })).toBeInTheDocument();
  });
});

describe("Stepper", () => {
  it("marks the current step and lets completed steps be revisited", async () => {
    const onStepClick = vi.fn();
    wrap(<Stepper steps={[{ label: "Units" }, { label: "Evidence" }, { label: "Review" }]} current={1} onStepClick={onStepClick} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(within(items[2]).queryByRole("button")).toBeNull(); // future steps are not reachable
    await userEvent.click(within(items[0]).getByRole("button"));
    expect(onStepClick).toHaveBeenCalledWith(0);
  });
});

describe("DropdownMenu", () => {
  it("runs the chosen action and skips disabled ones", async () => {
    const reassign = vi.fn(), note = vi.fn();
    wrap(<DropdownMenu items={[{ label: "Reassign", onSelect: reassign }, { label: "Add note", onSelect: note, disabled: true, hint: "Not available for this role" }]} />);
    await userEvent.click(screen.getByRole("button", { name: /More actions/ }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Add note/ })).toHaveAttribute("data-disabled");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Reassign" }));
    expect(reassign).toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
  });
});

describe("Switch", () => {
  it("toggles, and a locked switch keeps its value and says why", async () => {
    function S() {
      const [a, setA] = useState(false);
      return <>
        <Switch label="Include simulated inputs" checked={a} onCheckedChange={setA} />
        <Switch label="Human verification required" checked locked="Always on: every flag needs a person to confirm it." onCheckedChange={() => { throw new Error("must not change"); }} />
      </>;
    }
    wrap(<S />);
    const sim = screen.getByRole("switch", { name: "Include simulated inputs" });
    await userEvent.click(sim);
    expect(sim).toHaveAttribute("aria-checked", "true");
    const locked = screen.getByRole("switch", { name: "Human verification required" });
    await userEvent.click(locked);
    expect(locked).toHaveAttribute("aria-checked", "true");
    expect(locked).toHaveAccessibleDescription(/Always on/);
  });
});

describe("DisabledReason", () => {
  it("keeps a disabled action reachable by keyboard with its reason", async () => {
    wrap(<DisabledReason reason="Attach evidence and record a confirmed finding first."><Button disabled>Resolve investigation</Button></DisabledReason>);
    await userEvent.tab();
    expect(document.activeElement?.textContent).toContain("Attach evidence and record a confirmed finding first.");
  });
});

describe("CommandPalette", () => {
  it("filters as you type and chooses with the keyboard", async () => {
    const onSelect = vi.fn();
    function P() {
      const [open, setOpen] = useState(false);
      return <CommandPalette open={open} onOpenChange={setOpen} title="Find a unit" onSelect={onSelect}
        items={[{ id: "RHU-TALA-1", label: "Tala RHU I", group: "Masagana" }, { id: "RHU-TALA-2", label: "Tala RHU II", group: "Masagana" }, { id: "HOSP-MLY", label: "Malaya District Hospital" }]} />;
    }
    wrap(<P />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Find a unit" });
    await userEvent.type(input, "tala");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "RHU-TALA-2" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Donut", () => {
  it("lists every value, exposes each segment to the keyboard and has a table", async () => {
    const onSelect = vi.fn();
    wrap(<Donut title="Submissions" centerValue={15} centerLabel="received" onSelect={onSelect} segments={[
      { key: "reported", label: "With cases", value: 11, color: "var(--color-chart-reported)" },
      { key: "zero", label: "Zero cases", value: 4, color: "var(--color-chart-zero)" },
      { key: "missing", label: "Missing", value: 3, color: "var(--color-chart-missing)" },
      { key: "blank", label: "Blank", value: 0, color: "", pattern: "hatch" },
    ]} />);
    const legend = screen.getByRole("list", { name: "Submissions legend" });
    expect(within(legend).getByRole("button", { name: /Zero cases\s*04/ })).toBeInTheDocument();
    const seg = screen.getByRole("button", { name: "Missing: 3 (16.7%)" });
    fireEvent.keyDown(seg, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("missing");
    expect(screen.queryByRole("button", { name: /^Blank:/ })).toBeNull(); // empty segments draw nothing
    await userEvent.click(screen.getByRole("button", { name: "Show data table" }));
    expect(screen.getByRole("cell", { name: "16.7%" })).toBeInTheDocument();
  });
});

describe("Heatmap", () => {
  it("shows each state as text as well as colour and reports the chosen cell", async () => {
    const onSelect = vi.fn();
    wrap(<Heatmap caption="Submission history" onSelect={onSelect} columns={[{ key: "38", label: "W38" }, { key: "39", label: "W39" }, { key: "40", label: "W40" }]}
      rows={[{ key: "RHU-TALA-2", label: "Tala RHU II", cells: [
        { column: "38", state: "reported", value: 4 }, { column: "39", state: "zero", value: 0 }, { column: "40", state: "missing", value: null },
      ] }]} />);
    expect(screen.getByRole("table", { name: "Submission history" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tala RHU II, W39: Zero cases submitted" })).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Tala RHU II, W40: Missing submission" })).toHaveTextContent("—");
    await userEvent.click(screen.getByRole("button", { name: "Tala RHU II, W38: Cases reported, 4 cases" }));
    expect(onSelect).toHaveBeenCalledWith("RHU-TALA-2", "38");
  });
});

describe("SchematicMap", () => {
  it("selects units from the map or the list view", async () => {
    const onSelect = vi.fn();
    wrap(<SchematicMap title="Reporting coverage" onSelect={onSelect} provinces={[{ name: "Masagana", outline: [[0, 0], [100, 0], [100, 100]] }]}
      points={[{ id: "RHU-TALA-2", label: "Tala RHU II", x: 50, y: 40, state: "zero" }, { id: "RHU-SILANGAN", label: "Silangan RHU", x: 70, y: 60, state: "missing" }]} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Silangan RHU: missing submission" }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("RHU-SILANGAN");
    await userEvent.click(screen.getByRole("button", { name: "Show as list" }));
    await userEvent.click(screen.getByRole("button", { name: /Tala RHU II/ }));
    expect(onSelect).toHaveBeenLastCalledWith("RHU-TALA-2");
  });
});

describe("ErrorBoundary", () => {
  it("contains a rendering error and recovers when the screen changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("chart exploded"); };
    const { rerender } = wrap(<ErrorBoundary resetKey="/a"><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("chart exploded");
    rerender(<TooltipProvider><ErrorBoundary resetKey="/b"><p>Recovered</p></ErrorBoundary></TooltipProvider>);
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
