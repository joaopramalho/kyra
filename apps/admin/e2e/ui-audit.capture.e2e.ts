import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { accounts, businessMemberships, businesses, createDatabaseClient, users } from "@lobbystack/db";
import { hashReplacementPassword } from "../src/lib/password";
import { isolateAuthRateLimit } from "./fixtures/email-verification";

const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "laptop-1280x800", width: 1280, height: 800 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const emailLeadsOnly = process.env.UI_AUDIT_EMAIL_LEADS_ONLY === "1";
const routes = [
  ["dashboard", "/"],
  ["agent-settings", "/agent"],
  ["agent-basic-settings", "/agent/basic-settings"],
  ["agent-integrations", "/agent/integrations"],
  ["leads", "/leads"],
  ["calls", "/calls"],
  ["conversations", "/messages"],
  ["appointments", "/appointments"],
  ["contacts", "/contacts"],
  ["automations", "/agent/rules"],
  ["knowledge", "/agent/knowledge"],
  ["services", "/agent/services"],
  ["integrations", "/integrations"],
  ["webhooks", "/integrations/webhooks"],
  ["settings-usage", "/settings/usage"],
  ["settings-business", "/settings/business"],
  ["settings-team", "/settings/team"],
  ["settings-phone", "/settings/phone-number"],
  ["settings-email", "/settings/email"],
  ["settings-widget", "/settings/widget"],
  ["settings-plan", "/settings/plan"],
  ["settings-appearance", "/settings/appearance"],
  ["settings-notifications", "/settings/notifications"],
  ["settings-api-keys", "/settings/api-keys"],
  ["settings-connected-apps", "/settings/connected-apps"],
  ["settings-kyra", "/settings/kyra"],
  ["settings-account", "/settings/account"],
  ["analytics", "/analytics"],
] as const;
const denseText = "A homeowner is coordinating a full kitchen renovation across multiple vendors, accessibility requirements, and a narrow holiday deadline. Please confirm the preferred appointment window, parking and entry instructions, material delivery access, and whether a decision maker will be present. ".repeat(4);
const veryLongToken = "customer-reference-without-spaces-".repeat(8);
const leadId = "ui-audit-lead-001";
const lead = {
  id: leadId,
  name: `Morgan Chen ${veryLongToken}`,
  email: `${"morgan-chen-".repeat(8)}@example.invalid`,
  subject: `Planning a kitchen renovation — ${denseText}`,
  status: "new",
  aiPaused: false,
  consentFollowups: true,
  followupCount: 1,
  qualification: { service: `Kitchen renovation ${veryLongToken}`, timeframe: "Within 30 days" },
  appointmentId: "ui-audit-appointment-001",
  createdAt: "2026-11-22T14:00:00.000Z",
  updatedAt: "2026-11-23T14:30:00.000Z",
};
const detail = {
  lead,
  appointment: {
    id: "ui-audit-appointment-001",
    startsAt: "2026-12-03T15:00:00.000Z",
    endsAt: "2026-12-03T15:30:00.000Z",
    timezone: "America/New_York",
    status: "confirmed",
    calendarSyncState: "synced",
    serviceName: "Initial consultation",
    staffName: "Jamie Rivers",
  },
  messages: [
    { id: "ui-audit-message-1", direction: "lead", kind: "email", body: `${denseText}\n\n${veryLongToken}`, status: "received", createdAt: "2026-11-22T14:00:00.000Z" },
    { id: "ui-audit-message-2", direction: "assistant", kind: "email", body: `Thanks for reaching out, Morgan. ${denseText}`, status: "sent", createdAt: "2026-11-22T14:01:00.000Z" },
    { id: "ui-audit-message-3", direction: "lead", kind: "email", body: `A visit next week would work well. ${denseText}`, status: "received", createdAt: "2026-11-23T14:30:00.000Z" },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `ui-audit-message-${index + 4}`,
      direction: index % 2 === 0 ? "assistant" : "lead",
      kind: "email",
      body: index % 2 === 0
        ? `Thanks for sharing those details. I have noted the project scope, preferred timing, access requirements, and the follow-up questions for our team. ${"We will make sure the consultation covers each item you mentioned. ".repeat(3)}`
        : `One more detail about the project: ${"the existing cabinets and flooring will need careful coordination with the installation schedule. ".repeat(3)}`,
      status: index % 4 === 0 ? "queued" : index % 4 === 1 ? "received" : "sent",
      createdAt: new Date(Date.parse("2026-11-23T14:31:00.000Z") + index * 60_000).toISOString(),
    })),
  ],
  events: [],
  role: "business_owner",
  nextBefore: null,
};
const stamp = "2026-11-23T14:30:00.000Z";
const statusDistribution = [
  ...Array.from({ length: 13 }, () => "new"),
  ...Array.from({ length: 7 }, () => "qualifying"),
  ...Array.from({ length: 11 }, () => "qualified"),
  ...Array.from({ length: 5 }, () => "human_handoff"),
  ...Array.from({ length: 9 }, () => "booked"),
];
const leads = statusDistribution.map((status, index) => ({ ...lead, id: index === 0 ? leadId : `ui-audit-lead-${String(index + 1).padStart(3, "0")}`, name: index === 0 ? lead.name : `Customer ${String(index + 1).padStart(2, "0")} ${veryLongToken}`, email: `${"inquiry-".repeat(8)}${index + 1}@example.invalid`, subject: `Project request ${index + 1}: ${denseText}`, status, aiPaused: status === "human_handoff", updatedAt: new Date(Date.parse(stamp) - index * 60_000).toISOString() }));
const calls = Array.from({ length: 15 }, (_, index) => ({
  id: `ui-audit-call-${String(index + 1).padStart(3, "0")}`,
  providerCallId: `${"provider-call-ref-".repeat(7)}${index + 1}`,
  outcome: { kind: "none" },
  status: "completed",
  disposition: index % 2 ? "follow_up" : "completed",
  reason: `Consultation request ${index + 1}: ${denseText}`,
  startedAt: new Date(Date.parse(stamp) - index * 3_600_000).toISOString(),
  providerDurationSeconds: 420 + index * 31,
  contactName: `Customer ${String(index + 1).padStart(2, "0")} ${veryLongToken}`,
  contactPhone: `+1202555${String(index).padStart(4, "0")}`,
  recordingState: index % 3 === 0 ? "available" : "missing",
  transcriptPreview: denseText,
}));
const appointments = Array.from({ length: 15 }, (_, index) => ({
  id: `ui-audit-appointment-${String(index + 1).padStart(3, "0")}`,
  startsAt: new Date(Date.parse("2026-12-03T15:00:00.000Z") + index * 86_400_000).toISOString(),
  endsAt: new Date(Date.parse("2026-12-03T15:30:00.000Z") + index * 86_400_000).toISOString(),
  timezone: "America/New_York",
  status: "confirmed",
  sourceChannel: "web_chat",
  calendarSyncState: "synced",
  intakeCompletionStatus: "pending_follow_up",
  serviceLocation: { line1: `1200 ${veryLongToken}`, unit: "Suite 900, rear entrance", city: "Washington", region: "DC", postalCode: "20001", country: "US", instructions: denseText },
  intakeAnswers: { issueDescription: denseText, equipmentDetails: veryLongToken },
  contactName: `Morgan Chen ${veryLongToken}`,
  contactPhone: "+1 202-555-0142",
  serviceName: `Initial consultation ${index + 1}: ${veryLongToken}`,
  staffName: `Jamie Rivers ${veryLongToken}`,
}));
const contacts = Array.from({ length: 25 }, (_, index) => ({
  id: `ui-audit-contact-${String(index + 1).padStart(3, "0")}`,
  name: `Contact ${String(index + 1).padStart(2, "0")} ${veryLongToken}`,
  phone: `+1202555${String(index).padStart(4, "0")}`,
  email: `${"very-long-contact-address-".repeat(5)}${index}@example.invalid`,
  operatorBlockedAt: null,
  createdAt: new Date(Date.parse(stamp) - index * 86_400_000).toISOString(),
  updatedAt: stamp,
  lastInteractionAt: stamp,
  callCount: 18 + index,
  messageCount: 36 + index,
  appointmentCount: 4 + index,
}));

test("capture dense authenticated UI audit with isolated synthetic fixtures", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const root = resolve(process.cwd(), process.env.UI_AUDIT_OUTPUT_DIR ?? "test-results/ui-audit/before");
  await mkdir(root, { recursive: true });
  const email = `ui-audit-${randomUUID()}@example.invalid`;
  const password = `UI-Audit-${randomUUID()}!`;
  const userId = randomUUID();
  const businessId = randomUUID();
  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!databaseUrl || !baseURL) throw new Error("Missing isolated E2E database or application URL");
  await isolateAuthRateLimit(page, email, testInfo);
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  const passwordHash = await hashReplacementPassword(password);
  await database.db.insert(users).values({ id: userId, name: "UI Audit Operator", email, normalizedEmail: email.toLowerCase(), emailVerified: true, passwordHash });
  await database.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: passwordHash });
  await database.db.transaction(async (tx) => {
    await tx.insert(businesses).values({ id: businessId, slug: `ui-audit-${businessId}`, name: "Northstar Home Studio & Residential Design Collective — Greater Washington", timezone: "America/New_York", defaultLocale: "en", businessType: "service_company", deploymentMode: "self_hosted_standard", onboardingStage: "complete" });
    await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
    await tx.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId));
  });
  await database.pool.end();
  const signIn = await page.context().request.post(`${baseURL}/api/auth/sign-in/email`, { data: { email, password }, headers: { Origin: baseURL, "Sec-Fetch-Site": "same-origin", "x-real-ip": "198.18.42.17", "x-forwarded-for": "198.18.42.17" } });
  expect(signIn.ok(), await signIn.text()).toBe(true);
  const sessionResponse = await page.context().request.get(`${baseURL}/api/auth/get-session`);
  expect(sessionResponse.ok()).toBe(true);
  expect((await sessionResponse.json()).user.id).toBe(userId);

  let automationState = "ai_active";
  await page.route("**/api/messages*", async route => {
    if (route.request().method() === "PATCH") {
      automationState = JSON.parse(route.request().postData() ?? "{}").automationState;
      return await route.fulfill({ json: { success: true } });
    }
    return await route.fulfill({ json: { messages: [
      ...Array.from({ length: 18 }, (_, index) => ({ id: `ui-audit-chat-${index + 1}`, conversationId: index === 17 ? "ui-audit-chat-taylor" : `ui-audit-chat-${String(index % 8).padStart(2, "0")}`, contactName: index === 17 ? "Taylor Brooks" : `Morgan Chen ${String(index % 8 + 1).padStart(2, "0")}`, contactPhone: null, visitorName: index === 17 ? "Taylor Brooks" : `Morgan Chen ${String(index % 8 + 1).padStart(2, "0")}`, visitorEmail: `visitor-${index}@example.invalid`, channel: "web_chat", automationState, body: `${denseText}\n\n${veryLongToken}`, direction: index % 2 ? "outbound" : "inbound", status: index % 2 ? "sent" : "received", createdAt: new Date(Date.parse(stamp) - index * 60_000).toISOString() })),
    ] } });
  });
  let appointmentMode: "normal" | "loading" | "error" = "normal";
  const appointmentRelease: { current?: () => void } = {};
  await page.route("**/api/appointments?*", async route => {
    if (appointmentMode === "loading") await new Promise<void>(resolve => { appointmentRelease.current = resolve; });
    if (appointmentMode === "error") return await route.fulfill({ status: 503, json: { error: "synthetic fixture failure" } });
    return await route.fulfill({ json: { appointments } });
  });
  await page.route(/\/api\/appointments\/[^/?]+(?:\?.*)?$/, route => route.fulfill({ json: { success: true } }));
  await page.route("**/api/lmc/settings?*", route => route.fulfill({ json: { enabled: true, providerMode: "fake" } }));
  await page.route("**/api/dashboard", route => route.fulfill({ json: { businessId, kpis: { calls: { total: 1842, deltaPercent: 127.5 }, messages: { total: 9931, deltaPercent: 84.1 }, appointments: { total: 627, deltaPercent: 36.9 }, averageDuration: { totalSeconds: 593, deltaSeconds: 91 } }, monthlyCalls: Array.from({ length: 12 }, (_, index) => ({ monthStart: new Date(Date.UTC(2026, index, 1)).toISOString(), total: 110 + index * 73 })), recentCalls: calls.slice(0, 12).map(call => ({ id: call.id, startedAt: call.startedAt, status: call.status, durationSeconds: call.providerDurationSeconds, contactName: call.contactName, contactPhone: call.contactPhone })), actionRequired: Array.from({ length: 5 }, (_, index) => ({ id: `ui-audit-action-${index}`, kind: "follow_up", title: `Follow up with customer ${index + 1}`, body: denseText, createdAt: stamp, callId: calls[index]?.id })), upcoming: appointments.slice(0, 8).map(item => ({ id: item.id, startsAt: item.startsAt, timezone: item.timezone, status: item.status, sourceChannel: item.sourceChannel, contactName: item.contactName, serviceName: item.serviceName, staffName: item.staffName })) } }));
  await page.route("**/api/calls?*", route => route.fulfill({ json: { calls } }));
  await page.route("**/api/calls/active?*", route => route.fulfill({ json: { active: 3 } }));
  await page.route("**/api/contacts?*", route => route.fulfill({ json: { contacts, pagination: { total: contacts.length } } }));
  await page.route("**/api/analytics?*", route => route.fulfill({ json: { periodDays: 30, from: "2026-10-24T00:00:00.000Z", to: stamp, granularity: "week", calls: { current: 1842, previous: 810 }, appointments: { current: 627, previous: 458 }, messages: { current: 9931, previous: 5390 }, averageCallDurationSeconds: 593, agentResponseSeconds: { current: 28, previous: 49 }, series: Array.from({ length: 24 }, (_, index) => ({ bucket: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(), agentResponseSeconds: 20 + index, calls: 30 + index * 8, appointments: 10 + index * 2, messages: 150 + index * 27 })), channels: { voice: 1842, sms: 7100, other: 989 }, outcomes: [{ outcome: "booked", count: 627 }, { outcome: "message_taking", count: 218 }, { outcome: "follow_up", count: 390 }, { outcome: "other", count: 71 }], unitEconomics: { totalCostUsd: 1298.75, costPerVoiceCallUsd: 0.71, costPerActiveUserUsd: 18.44 } } }));
  await page.route("**/api/rules?*", route => route.fulfill({ json: Array.from({ length: 18 }, (_, index) => ({ id: `ui-audit-rule-${index}`, title: `Reception rule ${index + 1}: ${veryLongToken}`, content: denseText, active: index % 4 !== 0, sortOrder: index, createdAt: stamp })) }));
  await page.route("**/api/knowledge?*", route => route.fulfill({ json: { documents: Array.from({ length: 12 }, (_, index) => ({ id: `ui-audit-document-${index}`, title: `Home renovation guide ${index + 1} ${veryLongToken}`, sourceType: "website", sourceUrl: `https://example.invalid/${"long-path/".repeat(8)}${index}`, storageObjectId: null, status: "ready", processingProgress: 100, createdAt: stamp, updatedAt: stamp, textContent: denseText, active: true })), snippets: Array.from({ length: 12 }, (_, index) => ({ id: `ui-audit-snippet-${index}`, title: `Important answer ${index + 1} ${veryLongToken}`, content: denseText, active: true, priority: index, tags: ["renovation", "consultation", "service-area"], createdAt: stamp })) } }));
  await page.route("**/api/knowledge/snippets?*", route => route.fulfill({ json: { snippets: Array.from({ length: 12 }, (_, index) => ({ id: `ui-audit-snippet-${index}`, title: `Important answer ${index + 1} ${veryLongToken}`, content: denseText, active: true, priority: index, tags: ["renovation", "consultation", "service-area"], createdAt: stamp })) } }));
  await page.route("**/api/catalog?*", route => route.fulfill({ json: { services: Array.from({ length: 15 }, (_, index) => ({ id: `ui-audit-service-${index}`, name: `Residential consultation ${index + 1} ${veryLongToken}`, slug: `consultation-${index}`, durationMinutes: 45 + index * 5, description: denseText, active: true, createdAt: stamp, intakePolicy: { serviceType: "onsite", fields: { customerName: "required", serviceAddress: "required", postalCode: "optional", issueDescription: "required", equipmentDetails: "optional" }, serviceArea: { allowedCities: ["Washington", "Arlington", "Bethesda"], allowedPostalCodes: ["20001", "22201", "20814"] } } })), receptionistProfile: { intakePolicy: { serviceType: "onsite", fields: { serviceAddress: "required", postalCode: "optional", issueDescription: "required", equipmentDetails: "optional" } } } } }));
  await page.route("**/api/integrations?*", route => route.fulfill({ json: { calendarConnections: [{ id: "ui-audit-google", provider: "google", externalAccountId: "studio@example.invalid", status: "connected", staffId: null, selectedCalendarId: "primary", selectedCalendarSummary: "Northstar consultation calendar — Washington DC studio", lastSyncedAt: stamp, lastSyncError: null }], calendarOptions: Array.from({ length: 12 }, (_, index) => ({ id: `ui-audit-calendar-${index}`, summary: `Northstar location ${index + 1} — ${veryLongToken}`, primary: index === 0, selected: index === 0 })), calendarShareServiceAddress: true, staff: Array.from({ length: 15 }, (_, index) => ({ id: `ui-audit-staff-${index}`, name: `Jamie Rivers ${index + 1} ${veryLongToken}` })) } }));
  await page.route("**/api/leads?*", route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get("view");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.trim().toLowerCase();
    const filtered = leads.filter(item => (!status || item.status === status) && (view !== "needs_attention" || item.status === "human_handoff") && (view !== "booked" || item.status === "booked") && (view !== "ai_active" || (!item.aiPaused && ["new", "qualifying", "qualified"].includes(item.status))) && (!search || `${item.name} ${item.email} ${item.subject}`.toLowerCase().includes(search)));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const summary = { new: 13, qualifying: 7, qualified: 11, human_handoff: 5, booked: 9 };
    return route.fulfill({ json: { items: filtered.slice(offset, offset + 25), summary, aiActiveCount: 31, hasNext: offset + 25 < filtered.length, role: "business_owner" } });
  });
  await page.route(`**/api/leads/${leadId}?*`, route => route.fulfill({ json: detail }));

  for (const viewport of (emailLeadsOnly ? [viewports[0]!, viewports[3]!] : viewports)) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [name, path] of (emailLeadsOnly ? routes.filter(([name]) => name === "leads") : routes)) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText("Internal Server Error");
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("[data-slot=\"skeleton\"]")).toHaveCount(0, { timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.evaluate(() => document.fonts.ready);
      const pageOverflow = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(pageOverflow.document, `${name} overflows horizontally at ${viewport.width}px: ${JSON.stringify(pageOverflow)}`).toBeLessThanOrEqual(viewport.width + 1);
      expect(pageOverflow.body, `${name} body overflows horizontally at ${viewport.width}px: ${JSON.stringify(pageOverflow)}`).toBeLessThanOrEqual(viewport.width + 1);
      await page.screenshot({ path: resolve(root, `${name}-${viewport.name}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    }
  }
  if (emailLeadsOnly) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/leads");
    await page.getByRole("button", { name: /Morgan Chen/ }).click();
    await expect(page.getByRole("button", { name: "Pause AI" })).toBeVisible();
    await page.screenshot({ path: resolve(root, "interaction-email-lead-selected-mobile.png"), fullPage: true, animations: "disabled", caret: "hide" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: resolve(root, "interaction-email-lead-selected-desktop.png"), fullPage: true, animations: "disabled", caret: "hide" });
    return;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(page.getByRole("button", { name: /Email leads/ })).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-mobile-navigation-open.png"), fullPage: true, animations: "disabled", caret: "hide" });

  await page.goto("/leads");
  await page.getByRole("button", { name: /Morgan Chen/ }).click();
  await expect(page.getByRole("button", { name: "Pause AI" })).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-email-lead-selected-mobile.png"), fullPage: true, animations: "disabled", caret: "hide" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(root, "interaction-email-lead-selected-desktop.png"), fullPage: true, animations: "disabled", caret: "hide" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/messages");
  await page.getByRole("button", { name: /Morgan Chen/ }).first().click();
  await expect(page.getByText(denseText.slice(0, 100), { exact: false }).last()).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-selected-conversation-mobile.png"), fullPage: true, animations: "disabled", caret: "hide" });
  const draft = page.getByPlaceholder("Reply via Web...");
  await draft.fill("Draft response stays here");
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await page.getByRole("button", { name: /Taylor Brooks/ }).click();
  await expect(draft).toHaveValue("Draft response stays here");
  await page.screenshot({ path: resolve(root, "interaction-draft-preserved-switch.png"), fullPage: true, animations: "disabled", caret: "hide" });
  await page.getByRole("button", { name: "Take over" }).click();
  await expect(page.getByText("Pause AI", { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-human-takeover-mobile.png"), fullPage: true, animations: "disabled", caret: "hide" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/appointments");
  await page.getByText("Initial consultation", { exact: false }).last().click();
  await page.getByRole("button", { name: "Save corrected location" }).click();
  await page.screenshot({ path: resolve(root, "interaction-appointment-validation.png"), fullPage: true, animations: "disabled", caret: "hide" });

  appointmentMode = "loading";
  await page.goto("/appointments");
  await expect(page.locator("p.type-section-description")).toContainText("Northstar Home Studio");
  await expect(page.getByText("Loading appointments…")).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-appointments-loading.png"), fullPage: true, animations: "disabled", caret: "hide" });
  appointmentRelease.current?.();
  await expect(page.getByText("Initial consultation", { exact: false }).last()).toBeVisible();
  appointmentMode = "error";
  await page.goto("/appointments");
  await expect(page.locator("p.type-section-description")).toContainText("Northstar Home Studio");
  await expect(page.getByText("Appointments are unavailable.")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: resolve(root, "interaction-appointments-error.png"), fullPage: true, animations: "disabled", caret: "hide" });

  await page.goto("/");
  await page.getByRole("button", { name: "Feedback" }).click();
  await expect(page.getByRole("heading", { name: "Send feedback" })).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-feedback-popover.png"), fullPage: true, animations: "disabled", caret: "hide" });

  for (const viewport of [viewports[0]!, viewports[3]!]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/leads", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Morgan Chen" }).first().click({ timeout: 5_000 });
    await expect(page.getByText(/Planning a kitchen renovation/).last()).toBeVisible();
    await page.screenshot({ path: resolve(root, `lead-detail-selected-${viewport.name}.png`), fullPage: true, animations: "disabled", caret: "hide" });
  }
});
