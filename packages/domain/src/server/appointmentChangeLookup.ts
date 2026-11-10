import { and, eq, ilike, or } from "drizzle-orm";

import { appointments, contacts, services, type DatabaseTransaction } from "@lobbystack/db";

import { appointmentTimesMatch, serviceNamesMatch, storedContactNameMatchesIfPresent, substantiveServiceNameFactMatches } from "./appointmentFacts";
import { contactPhoneMatchesCaller, contactPhoneMatchesCallerValue } from "./contactPhone";

export type AppointmentChangeLookupInput = {
  businessId: string;
  callerPhone: string;
  callerName?: string;
  appointmentStartsAt?: string;
  serviceName?: string;
  appointmentId?: string;
};

export async function findAppointmentChangeMatches(tx: DatabaseTransaction, input: AppointmentChangeLookupInput) {
  const name = input.callerName?.trim();
  const hasAnotherFact = Boolean(input.appointmentStartsAt?.trim() || input.serviceName?.trim());
  const factsSearch = name && hasAnotherFact
    ? ilike(contacts.name, `%${escapeLikePattern(name)}%`)
    : undefined;

  const rows = await tx.select({
    id: appointments.id,
    contactId: appointments.contactId,
    startsAt: appointments.startsAt,
    timezone: appointments.timezone,
    name: contacts.name,
    phone: contacts.phone,
    serviceName: services.name,
    serviceSlug: services.slug,
    localizedNames: services.localizedNames,
  }).from(appointments)
    .innerJoin(contacts, and(eq(appointments.contactId, contacts.id), eq(contacts.businessId, input.businessId)))
    .innerJoin(services, and(eq(appointments.serviceId, services.id), eq(services.businessId, input.businessId)))
    .where(and(
      input.appointmentId ? eq(appointments.id, input.appointmentId) : undefined,
      eq(appointments.businessId, input.businessId),
      eq(appointments.status, "confirmed"),
      input.appointmentId ? undefined : (factsSearch ? or(contactPhoneMatchesCaller(input.callerPhone), factsSearch) : contactPhoneMatchesCaller(input.callerPhone)),
    ));

  const factMatches = rows.filter((row) =>
    storedContactNameMatchesIfPresent(row.name ?? undefined, input.callerName)
      && (!input.appointmentStartsAt?.trim() || appointmentTimesMatch({ startsAt: row.startsAt.toISOString(), timezone: row.timezone }, input.appointmentStartsAt))
      && (!input.serviceName?.trim() || (input.appointmentId ? serviceNamesMatch : substantiveServiceNameFactMatches)({ name: row.serviceName, slug: row.serviceSlug, localizedNames: row.localizedNames }, input.serviceName)),
  );
  const callerPhoneMatches = factMatches.filter((row) => contactPhoneMatchesCallerValue(row.phone, input.callerPhone));

  // Prefer the incoming number when its facts identify a booking. Search by
  // name plus a second fact is a fallback for callers using another phone.
  const matches = callerPhoneMatches.length > 0 ? callerPhoneMatches : factMatches;
  const callerPhoneAppointmentCount = rows.filter((row) => contactPhoneMatchesCallerValue(row.phone, input.callerPhone)).length;
  return {
    matches,
    callerPhoneAppointmentCount,
    matchSource: matches.length === 1 && contactPhoneMatchesCallerValue(matches[0]!.phone, input.callerPhone)
      ? "caller_phone" as const
      : matches.length === 1 ? "appointment_facts" as const : undefined,
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
