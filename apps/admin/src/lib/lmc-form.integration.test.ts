// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { DatabaseTransaction } from "@lobbystack/db";

const enabled = (name: string, run: () => Promise<void>) =>
  it.skipIf(process.env.LMC_FORM_INTEGRATION_TEST !== "1")(name, run, 20_000);


enabled("shows a retry prompt after a lost HTTP acknowledgment", async () => {
  const scenario = await setupScenario();
  try {
    scenario.submit();
    await vi.waitFor(() =>
      expect(scenario.status()).toContain("couldn’t confirm"),
    );
    expect(scenario.requests).toHaveLength(1);
  } finally {
    await scenario.close();
  }
});

enabled("deduplicates the form retry after a lost HTTP acknowledgment", async () => {
  const scenario = await setupScenario();
  try {
    await scenario.retry();
    expect(scenario.requests).toHaveLength(2);
    expect(scenario.requests[1]).toBe(scenario.requests[0]);
    expect(
      await scenario.harness.scoped((tx: DatabaseTransaction) =>
        tx.select().from(scenario.lmcLeads),
      ),
    ).toHaveLength(1);
  } finally {
    await scenario.close();
  }
});

enabled("persists the lead created by the form retry", async () => {
  const scenario = await setupScenario();
  try {
    await scenario.retry();
    expect(await scenario.harness.lead(scenario.leadId)).toMatchObject({
      email: "form@example.invalid",
      consentFollowups: true,
    });
  } finally {
    await scenario.close();
  }
});

enabled("leaves the form lead process job ready for the worker", async () => {
  const scenario = await setupScenario();
  try {
    await scenario.retry();
    expect(
      await scenario.harness.scoped((tx: DatabaseTransaction) =>
        tx.select({ kind: scenario.lmcJobs.kind, status: scenario.lmcJobs.status }).from(scenario.lmcJobs),
      ),
    ).toEqual([expect.objectContaining({ kind: "process", status: "pending" })]);
  } finally {
    await scenario.close();
  }
});

enabled("sends a reply for the queued form lead", async () => {
  const scenario = await setupScenario();
  try {
    await scenario.retry();
    await scenario.harness.work();
    expect(
      scenario.harness.mail.records.filter(
        (mail: { to: string }) => mail.to === "form@example.invalid",
      ),
    ).toHaveLength(1);
  } finally {
    await scenario.close();
  }
});

enabled("does not duplicate the queued form lead reply", async () => {
  const scenario = await setupScenario();
  try {
    await scenario.retry();
    await scenario.harness.work();
    const replies = scenario.harness.mail.records.filter(
      (mail: { to: string }) => mail.to === "form@example.invalid",
    );
    expect(replies.length).toBeGreaterThan(0);
    expect(replies).toHaveLength(1);
  } finally {
    await scenario.close();
  }
});

enabled("records one assistant message for the queued form lead", async () => {
  const scenario = await setupScenario();
  try {
    await scenario.retry();
    await scenario.harness.work();
    expect(
      (await scenario.harness.history(scenario.leadId)).filter(
        (message: { direction: string }) => message.direction === "assistant",
      ),
    ).toHaveLength(1);
  } finally {
    await scenario.close();
  }
});

async function setupScenario() {
  const { lmcLeads, lmcJobs } = await import("@lobbystack/db");
  const { createLmcHarness } =
    await import("../../../../tests/lmc/support/harness");
  const harness = await createLmcHarness({ now: "2030-01-09T03:40:00Z" });
  const realFetch = globalThis.fetch;
  const requests: string[] = [];
  let leadId = "";
  const url = new URL(harness.captureUrl);
  const script = document.createElement("script");
  script.src = `${url.origin}/lmc-form.js`;
  script.dataset.captureToken = url.pathname.split("/").at(-1)!;
  document.body.append(script);
  Object.defineProperty(document, "currentScript", {
    value: script,
    configurable: true,
  });
  vi.stubGlobal("fetch", async (target: string, init: RequestInit) => {
    expect(target).toBe(harness.captureUrl);
    requests.push(init.body as string);
    const response = await realFetch(target, init);
    expect(response.status).toBe(202);
    leadId = (await response.clone().json()).id;
    if (requests.length === 1)
      throw new TypeError("Simulated lost HTTP acknowledgment");
    return response;
  });
  window.eval(readFileSync(resolve("public/lmc-form.js"), "utf8"));
  const root = document.querySelector("[data-lmc-form]")!.shadowRoot!;
  (root.querySelector('[name="email"]') as HTMLInputElement).value =
    "form@example.invalid";
  (root.querySelector('[name="message"]') as HTMLTextAreaElement).value =
    "Please help with my roof repair.";
  (
    root.querySelector('[name="consentToFollowUp"]') as HTMLInputElement
  ).checked = true;
  const submit = () =>
    root
      .querySelector("form")!
      .dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
  const status = () => root.querySelector('[role="status"]')!.textContent;
  const retry = async () => {
    submit();
    await vi.waitFor(() => expect(status()).toContain("couldn’t confirm"));
    submit();
    await vi.waitFor(() => expect(status()).toContain("received"));
  };
  return {
    harness,
    lmcLeads,
    lmcJobs,
    requests,
    get leadId() {
      return leadId;
    },
    submit,
    status,
    retry,
    async close() {
      vi.unstubAllGlobals();
      document.body.replaceChildren();
      await harness.close();
    },
  };
}
