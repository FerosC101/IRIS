import { describe, expect, it } from "vitest";
import { fmtPct, fmtPeriod, fmtSigned, setDateStyle } from "@/lib/format";
import { canAccess, navFor } from "@/lib/navigation";
import { reportSchema } from "@/features/overview/SubmitReportDialog";
import { metaSchema } from "@/features/data-management/ImportWizard";
import { reasonSchema } from "@/features/investigations/ActionDialogs";

describe("format", () => {
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
  it("restricts analysis pages by role", () => {
    expect(canAccess("/planner", "rhu_staff")).toBe(false);
    expect(canAccess("/planner", "provincial_coordinator")).toBe(true);
    expect(canAccess("/evaluation", "admin")).toBe(true);
    expect(canAccess("/investigations/C-0001", "admin")).toBe(false);
    expect(canAccess("/data/import", "rhu_staff")).toBe(true); // route-level; the API still refuses the import
    expect(canAccess("/", "rhu_staff")).toBe(true);
  });
  it("gives every role a home page, settings and help", () => {
    for (const r of ["rhu_staff", "provincial_coordinator", "resu_analyst", "admin"] as const) {
      const labels = navFor(r).map((n) => n.label);
      expect(labels).toEqual(expect.arrayContaining(["Home", "Settings", "Help"]));
    }
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
