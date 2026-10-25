// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

it.skipIf(process.env.LMC_FORM_INTEGRATION_TEST !== "1")(
  "persists one browser-form lead after a lost HTTP acknowledgment and processes its real queued job",
  async () => {
    const { lmcLeads } = await import("@lobbystack/db");
    const { createLmcHarness } =
      await import("../../../../tests/lmc/support/harness");
    const harness = await createLmcHarness({ now: "2030-01-09T03:40:00Z" });
    const realFetch = globalThis.fetch;
    const requests: string[] = [];
    let leadId = "";
    try {
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
      submit();
      await vi.waitFor(() =>
        expect(root.querySelector('[role="status"]')!.textContent).toContain(
          "couldn’t confirm",
        ),
      );
      submit();
      await vi.waitFor(() =>
        expect(root.querySelector('[role="status"]')!.textContent).toContain(
          "received",
        ),
      );
      expect(requests).toHaveLength(2);
      expect(requests[1]).toBe(requests[0]);
      expect(
        await harness.scoped((tx) => tx.select().from(lmcLeads)),
      ).toHaveLength(1);
      expect(await harness.lead(leadId)).toMatchObject({
        email: "form@example.invalid",
        consentFollowups: true,
      });
      await harness.work();
      expect(
        harness.mail.records.filter(
          (mail) => mail.to === "form@example.invalid",
        ),
      ).toHaveLength(1);
      expect(
        (await harness.history(leadId)).filter(
          (message) => message.direction === "assistant",
        ),
      ).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
      document.body.replaceChildren();
      await harness.close();
    }
  },
  20_000,
);
