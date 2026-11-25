import { describe, expect, it } from "vitest";

import { checkArrayLiteral } from "./support/isolation-fixtures";

describe("isolation fixture CHECK literals", () => {
  it("does not use an allowed status literal for another field in a compound check", () => {
    const checks = [
      {
        name: "commercial_commissions_amounts_check",
        expression:
          "CHECK (((amount_cents >= 0) AND ((commission_cents >= 0) OR ((status)::text = ANY ((ARRAY['reversed'::character varying, 'recovered'::character varying])::text[])))))",
      },
    ];

    expect(checkArrayLiteral(checks, "commission_cents")).toBeUndefined();
    expect(checkArrayLiteral(checks, "status")).toBe("reversed");
  });

  it("extracts a value when the CHECK directly restricts the requested field", () => {
    const checks = [
      {
        name: "commercial_commissions_status_check",
        expression:
          "CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'available'::character varying])::text[])))",
      },
    ];

    expect(checkArrayLiteral(checks, "status")).toBe("pending");
  });
});
