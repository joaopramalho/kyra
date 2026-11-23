import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { businessMemberships, businesses, createDatabaseClient, users } from "@lobbystack/db";
import { completeSignupEmailVerification, isolateAuthRateLimit } from "./fixtures/email-verification";

const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "laptop-1280x800", width: 1280, height: 800 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const routes = [
  ["dashboard", "/"],
  ["leads", "/leads"],
  ["conversations", "/messages"],
  ["appointments", "/appointments"],
  ["automations", "/agent/rules"],
  ["integrations", "/integrations"],
  ["settings", "/settings"],
  ["analytics", "/analytics"],
] as const;
const leadId = "ui-audit-lead-001";
const lead = {
  id: leadId,
  name: "Morgan Chen",
  email: "morgan@example.invalid",
  subject: "Planning a kitchen renovation",
  status: "new",
  aiPaused: false,
  consentFollowups: true,
  followupCount: 1,
  qualification: { service: "Kitchen renovation", timeframe: "Within 30 days" },
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
    { id: "ui-audit-message-1", direction: "lead", kind: "email", body: "We are hoping to update our kitchen before the holidays. Do you have availability for a consultation?", status: "received", createdAt: "2026-11-22T14:00:00.000Z" },
    { id: "ui-audit-message-2", direction: "assistant", kind: "email", body: "Thanks for reaching out, Morgan. I can help arrange a consultation and gather a few details about the project.", status: "sent", createdAt: "2026-11-22T14:01:00.000Z" },
    { id: "ui-audit-message-3", direction: "lead", kind: "email", body: "A visit next week would work well. The kitchen is about 180 square feet.", status: "received", createdAt: "2026-11-23T14:30:00.000Z" },
  ],
  events: [],
  role: "business_owner",
  nextBefore: null,
};

 test("capture authenticated visual baseline with isolated synthetic fixtures", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const root = resolve(process.cwd(), process.env.UI_AUDIT_OUTPUT_DIR ?? "test-results/ui-audit/before");
  await mkdir(root, { recursive: true });
  const email = `ui-audit-${randomUUID()}@example.invalid`;
  const password = `UI-Audit-${randomUUID()}!`;
  await isolateAuthRateLimit(page, email, testInfo);
  await page.goto("/en/signup");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator("#verification-code")).toBeVisible();
  await completeSignupEmailVerification(page, email, password);

  const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing isolated E2E database URL");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: databaseUrl });
  const identity = (await database.db.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, email.toLowerCase())).limit(1))[0];
  if (!identity) throw new Error("Synthetic E2E operator was not created");
  const businessId = randomUUID();
  await database.db.transaction(async (tx) => {
    await tx.insert(businesses).values({ id: businessId, slug: `ui-audit-${businessId}`, name: "Northstar Home Studio", timezone: "America/New_York", defaultLocale: "en", businessType: "service_company", deploymentMode: "self_hosted_standard", onboardingStage: "complete" });
    await tx.insert(businessMemberships).values({ businessId, userId: identity.id, role: "business_owner", status: "active" });
    await tx.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, identity.id));
  });
  await database.pool.end();

  let automationState = "ai_active";
  await page.route("**/api/messages*", async route => {
    if (route.request().method() === "PATCH") {
      automationState = JSON.parse(route.request().postData() ?? "{}").automationState;
      return await route.fulfill({ json: { success: true } });
    }
    const stamp = "2026-11-23T14:30:00.000Z";
    return await route.fulfill({ json: { messages: [
      { id: "ui-audit-chat-1", conversationId: "ui-audit-chat", contactName: "Morgan Chen", contactPhone: null, visitorName: "Morgan Chen", visitorEmail: "morgan@example.invalid", channel: "web_chat", automationState, body: "Could you tell me more about the consultation?", direction: "inbound", status: "received", createdAt: stamp },
      { id: "ui-audit-chat-2", conversationId: "ui-audit-chat", contactName: "Morgan Chen", contactPhone: null, visitorName: "Morgan Chen", visitorEmail: "morgan@example.invalid", channel: "web_chat", automationState, body: "Of course. We can review the project and available dates together.", direction: "outbound", status: "sent", createdAt: stamp },
      { id: "ui-audit-chat-3", conversationId: "ui-audit-chat-taylor", contactName: "Taylor Brooks", contactPhone: null, visitorName: "Taylor Brooks", visitorEmail: "taylor@example.invalid", channel: "web_chat", automationState, body: "I would like to learn about your service options.", direction: "inbound", status: "received", createdAt: "2026-11-23T14:25:00.000Z" },
    ] } });
  });
  let appointmentMode: "normal" | "loading" | "error" = "normal";
  const appointmentRelease: { current?: () => void } = {};
  await page.route("**/api/appointments?*", async route => {
    if (appointmentMode === "loading") await new Promise<void>(resolve => { appointmentRelease.current = resolve; });
    if (appointmentMode === "error") return await route.fulfill({ status: 503, json: { error: "synthetic fixture failure" } });
    return await route.fulfill({ json: { appointments: [{ id: "ui-audit-appointment", startsAt: "2026-12-03T15:00:00.000Z", endsAt: "2026-12-03T15:30:00.000Z", timezone: "America/New_York", status: "confirmed", sourceChannel: "web_chat", calendarSyncState: "synced", intakeCompletionStatus: "pending_follow_up", serviceLocation: null, intakeAnswers: null, contactName: "Morgan Chen", contactPhone: "+1 202-555-0142", serviceName: "Initial consultation", staffName: "Jamie Rivers" }] } });
  });
  await page.route("**/api/lmc/settings?*", route => route.fulfill({ json: { enabled: true, providerMode: "fake" } }));
  await page.route("**/api/leads?*", route => route.fulfill({ json: { items: [lead], summary: { new: 1, qualifying: 0, qualified: 0, human_handoff: 0, booked: 1 }, hasNext: false, role: "business_owner" } }));
  await page.route(`**/api/leads/${leadId}?*`, route => route.fulfill({ json: detail }));

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [name, path] of routes) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).not.toContainText("Internal Server Error");
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("[data-slot=\"skeleton\"]")).toHaveCount(0, { timeout: 15_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(root, `${name}-${viewport.name}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(page.getByRole("button", { name: /Email leads/ })).toBeVisible();
  await page.screenshot({ path: resolve(root, "interaction-mobile-navigation-open.png"), fullPage: true, animations: "disabled", caret: "hide" });

  await page.goto("/messages");
  await page.getByRole("button", { name: /Morgan Chen/ }).click();
  await expect(page.getByText("Could you tell me more about the consultation?", { exact: true })).toBeVisible();
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
    await page.getByRole("button", { name: "Morgan Chen" }).click({ timeout: 5_000 });
    await expect(page.getByText("Planning a kitchen renovation", { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: resolve(root, `lead-detail-selected-${viewport.name}.png`), fullPage: true, animations: "disabled", caret: "hide" });
  }
});
