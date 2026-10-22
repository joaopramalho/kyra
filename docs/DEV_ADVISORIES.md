# Dependency advisory triage — 2026-10-22

Release command: `pnpm audit --prod --audit-level high`. Latest local result: **exit 0; high 0, critical 0**. Production still reports one moderate and one low advisory. The full development graph has two high, two moderate and two low findings. These counts are a checkpoint, not a permanent exception: CI always refreshes the production gate.

| Dependency | Severity | Scope | Disposition |
| --- | --- | --- | --- |
| [http-cache-semantics](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | high | Development only | Astro build/preview tooling only. Static output is deployed without Astro or its HTTP cache. No patched version reported; build only trusted repository inputs and do not expose astro preview as the production server. |
| [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | high | Development only | Next ESLint plugin → fast-glob → micromatch, development lint tooling. No patched version reported; lint trusted repository files/globs, never external patterns. |
| [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | moderate | Production | Root Mammoth → argparse CLI dependency. Remains visible in the production audit as moderate; no suppression or claim of complete remediation. Pilot denies document/knowledge APIs; retain for separate CLI follow-up. |
| [katex](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | low | Development only | Mintlify documentation tooling; unused by pilot runtime. Defer major migration; do not render untrusted documents in the docs toolchain. |
| [postcss-selector-parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | moderate | Development only | Mintlify/Tailwind 6.x selector parser in documentation tooling. The patched 7.x line remains used where compatible; defer migration of this development-only chain. |
| [i18next-http-backend](https://github.com/advisories/GHSA-xvq9-wjp8-hwqf) | low | Production | Admin production dependency, low severity. Translation URLs are fixed same-origin paths; retain as a tracked runtime advisory. No major migration in this feature freeze. |

## Packaging boundary

The landing configuration explicitly uses `output: "static"` and has no server adapter. Astro and its compiler/integrations are development dependencies. Ship only its generated `dist` files on a separate static host; never ship a pruned Node installation as a landing server. Browser libraries remain declared as dependencies. This classification does not suppress advisories and the full development audit remains available.

The standalone `integrations/zapier` npm project is outside the pnpm workspace globs (`apps/*`, `packages/*`, `mintlify`), has no pilot runtime import, and is not invoked by the pilot build or dependency job. Its separate job and release dependency are removed from this workflow because the email pilot does not use it. Its previous 33 advisories (28 high, five moderate) are **not fixed**. Do not publish or enable that integration under this release; give it its own remediation/release gate if adopted. Preserve its source and license notices.

The inherited Railway project ID was removed. Production migrations require explicit `LMC_ENABLE_PRODUCTION_DEPLOY=true` and the user-owned `LMC_RAILWAY_PROJECT_ID` repository variables plus credentials; no automatic upstream deployment is configured. Hosted pilot integration execution and evidence remain pending.

## Local HTTP verification annotation

The production boundary runner binds its owned Next process to `127.0.0.1:3100` and sends only synthetic, credential-free loopback requests. Its literal local HTTP origin has one exact `react-insecure-request` Semgrep annotation. This is not a runtime transport exception: staging/public traffic still requires HTTPS. The script refuses non-local or mismatched database roles and requires a test/acceptance database. No scanner rules or parser checks were disabled.
