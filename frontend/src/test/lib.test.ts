import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateTime, fmtPct, fmtPeriod, fmtSigned, setDateStyle } from "@/lib/format";
import { canAccess, navFor, sectionTabs, topNavFor } from "@/lib/navigation";
import { reportSchema } from "@/features/overview/SubmitReportDialog";
import { metaSchema } from "@/features/data-management/ImportWizard";
import { reasonSchema } from "@/features/investigations/ActionDialogs";

describe("format", () => {
  it("shows a dash for a missing or unreadable timestamp, never 'undefined' or 'NaN'", () => {
    for (const v of [null, undefined, "", "NaT", "not a date"]) {
      expect(fmtDate(v)).toBe("—");
      expect(fmtDateTime(v)).toBe("—");
    }
    expect(fmtDateTime("2026-10-06T05:27:00")).toMatch(/2026 05:27$/);
  });

  it("formats proportions and missing values", () => {
    expect(fmtPct(0.934)).toBe("93%");
    expect(fmtPct(0.934, 1)).toBe("93.4%");
    expect(fmtPct(null)).toBe("—");
  });
  it("formats periods compactly", () => {
    setDateStyle("readable");
    expect(fmtPeriod("2026-09-28", "2026-10-04")).toBe("Sep 28 – Oct 4, 2026");
    expect(fmtPeriod("2026-08-03", "2026-08-09")).toBe("Aug 3–9, 2026");
    setDateStyle("iso");
    expect(fmtPeriod("2026-08-03", "2026-08-09")).toBe("2026-08-03 – 2026-08-09");
    setDateStyle("readable");
  });
  it("formats signed point changes", () => {
    expect(fmtSigned(0.123)).toBe("+12.3 pts");
    expect(fmtSigned(-0.05)).toBe("−5.0 pts");
  });
});

describe("role-aware navigation", () => {
  it("restricts pages by role, using the most specific route", () => {
    expect(canAccess("/investigations/plan", "rhu_staff")).toBe(false);
    expect(canAccess("/investigations/plan", "provincial_coordinator")).toBe(true);
    expect(canAccess("/investigations/follow-up", "rhu_staff")).toBe(true);
    expect(canAccess("/data/evaluation", "admin")).toBe(true);
    expect(canAccess("/investigations/C-0001", "admin")).toBe(false);
    expect(canAccess("/data/import", "rhu_staff")).toBe(false);
    expect(canAccess("/data", "provincial_coordinator")).toBe(false);
    expect(canAccess("/reports", "rhu_staff")).toBe(true);
    expect(canAccess("/reports/analysis", "rhu_staff")).toBe(false);
    expect(canAccess("/", "rhu_staff")).toBe(true);
  });
  it("gives every role the dashboard, settings and help", () => {
    for (const r of ["rhu_staff", "provincial_coordinator", "resu_analyst", "admin"] as const) {
      const labels = navFor(r).map((n) => n.label);
      expect(labels).toEqual(expect.arrayContaining(["Dashboard", "Settings", "Help"]));
    }
  });
  it("shows the five main sections only to roles that can open them", () => {
    expect(topNavFor("resu_analyst").map((n) => n.label)).toEqual(["Dashboard", "Reports & Analysis", "Reporting Network", "Investigations & Actions", "Data & Models"]);
    expect(topNavFor("rhu_staff").map((n) => n.label)).toEqual(["Dashboard", "Reports & Analysis", "Investigations & Actions"]);
    expect(sectionTabs("investigations", "rhu_staff").map((n) => n.to)).toEqual(["/investigations", "/investigations/follow-up"]);
  });
});

describe("form validation", () => {
  it("distinguishes blank from zero in report submission", () => {
    expect(reportSchema.safeParse({ value: "", blank: false }).success).toBe(false);
    expect(reportSchema.safeParse({ value: "0", blank: false }).success).toBe(true);
    expect(reportSchema.safeParse({ value: "", blank: true }).success).toBe(true);
    expect(reportSchema.safeParse({ value: "2.5", blank: false }).success).toBe(false);
    expect(reportSchema.safeParse({ value: "-1", blank: false }).success).toBe(false);
  });
  it("requires a declared data origin on import", () => {
    const base = { name: "My data", source: "Unit test", geographic_level: "province" };
    expect(metaSchema.safeParse(base).success).toBe(false);
    expect(metaSchema.safeParse({ ...base, designation: "real" }).success).toBe(true);
  });
  it("requires a meaningful reason for consequential decisions", () => {
    expect(reasonSchema.safeParse({ text: "ok" }).success).toBe(false);
    expect(reasonSchema.safeParse({ text: "   short   " }).success).toBe(false);
    expect(reasonSchema.safeParse({ text: "Unit confirmed by phone call." }).success).toBe(true);
  });
});
