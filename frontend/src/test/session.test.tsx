import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { setDemoUser } from "@/services/client";

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const { role, switchUser } = useSession();
  return (
    <>
      <p data-testid="role">{role ?? "loading"}</p>
      <button type="button" onClick={() => switchUser("U-RHU")}>switch</button>
    </>
  );
}

describe("SessionProvider", () => {
  it("re-reads the session when the demo user is switched, without a page reload", async () => {
    setDemoUser("U-RESU");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const user = new Headers(init?.headers).get("X-IRIS-User");
      const role = user === "U-RHU" ? "rhu_staff" : "resu_analyst";
      return new Response(JSON.stringify({ actor: { user_id: user, role, permissions: [] }, users: [], units: [], categories: [], weeks: [], provinces: [] }), { status: 200 });
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The provider element is created once and not re-rendered by its parent, as with a route element.
    const tree = <QueryClientProvider client={qc}><SessionProvider><Probe /></SessionProvider></QueryClientProvider>;
    render(tree);
    expect(await screen.findByText("resu_analyst")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(await screen.findByText("rhu_staff")).toBeInTheDocument();
  });
});
