import { describe, expect, it } from "vitest";
import { appointmentTimesMatch, serviceNamesMatch, storedContactNameMatchesIfPresent, substantiveServiceNameFactMatches } from "./appointmentFacts";
describe("appointment fact verification", () => {
  it("requires the stored caller name when present", () => {
    expect(storedContactNameMatchesIfPresent("Alex Morgan", undefined)).toBe(false);
    expect(storedContactNameMatchesIfPresent("Alex Morgan", "Taylor")).toBe(false);
    expect(storedContactNameMatchesIfPresent("Alex Morgan", "Alex")).toBe(true);
    expect(storedContactNameMatchesIfPresent(undefined, undefined)).toBe(true);
  });
  it("matches localized service facts and rejects generic fragments", () => {
    const service = { name: "Dental examination", slug: "dental-exam", localizedNames: { fr: "Examen dentaire" } };
    expect(serviceNamesMatch(service, "Examen dentaire")).toBe(true);
    expect(substantiveServiceNameFactMatches(service, "exam")).toBe(true);
    expect(substantiveServiceNameFactMatches(service, "de")).toBe(false);
    expect(serviceNamesMatch(service, "Haircut")).toBe(false);
  });
  it("matches absolute and spoken local times within the reference tolerance", () => {
    const appointment = { startsAt: "2026-09-04T14:30:00Z", timezone: "America/Toronto" };
    expect(appointmentTimesMatch(appointment, "2026-09-04T14:45:00Z")).toBe(true);
    expect(appointmentTimesMatch(appointment, "Friday at 10:30 am")).toBe(true);
    expect(appointmentTimesMatch(appointment, "Friday at 15:30")).toBe(false);
    expect(appointmentTimesMatch(appointment, "Thursday at 10:30 am")).toBe(false);
    expect(appointmentTimesMatch(appointment, "morning")).toBe(false);
  });

  it("accepts a date as a partial fact and validates a supplied local date and time", () => {
    const appointment = { startsAt: "2026-11-30T20:30:00Z", timezone: "America/Toronto" };
    expect(appointmentTimesMatch(appointment, "November 30th")).toBe(true);
    expect(appointmentTimesMatch(appointment, "November 30")).toBe(true);
    expect(appointmentTimesMatch(appointment, "11/30")).toBe(true);
    expect(appointmentTimesMatch(appointment, "November 30th at 3:30 PM")).toBe(true);
    expect(appointmentTimesMatch(appointment, "November 30 at 3:30 pm")).toBe(true);
    expect(appointmentTimesMatch(appointment, "November 30th at 3:30 AM")).toBe(false);
    expect(appointmentTimesMatch(appointment, "October 30th at 3:30 PM")).toBe(false);
  });

  it("interprets spoken date/time facts in the appointment timezone", () => {
    const toronto = { startsAt: "2026-11-30T20:30:00Z", timezone: "America/Toronto" };
    const losAngeles = { startsAt: "2026-11-30T23:30:00Z", timezone: "America/Los_Angeles" };
    expect(appointmentTimesMatch(toronto, "November 30th at 3:30 PM")).toBe(true);
    expect(appointmentTimesMatch(losAngeles, "November 30th at 3:30 PM")).toBe(true);
    expect(appointmentTimesMatch(losAngeles, "November 30th at 12:30 PM")).toBe(false);
  });
});
