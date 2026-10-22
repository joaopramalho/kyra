# Security scanning and CI gates

## Implemented gates

CI now requires independent dependency-audit, secret-scan and SAST jobs before
release validation. Existing tests/builds and the standalone Zapier job are also
required. Jobs run on pull requests, use read-only repository permissions, require
no provider credentials and do not continue after scanner failures. The standalone
npm audit still runs if the workspace audit fails. Database CI configures the
dedicated System URL/password used by bootstrap and trusted System work.

Six configuration acceptance checks were red against the old workflow, then green.
The current build-config suite passes eight tests, including three Python installer
cases invoked by a Node test. These are local workflow/installer proofs, not a
claim that a hosted GitHub Actions run has succeeded.

Gitleaks 8.30.1 is downloaded from its fixed HTTPS release URL and verified against
the pinned SHA-256 before selecting the binary and license from the archive. The
installer rejects tampered bytes and unexpected existing files and never extracts
archive-controlled paths. Semgrep is pinned to 1.181.0. Security-audit rules are
fetched from the maintained registry; they can change independently of the CLI.
Semgrep telemetry/version checks are disabled. Strict mode and a 30-second per-rule
timeout make parser errors and unknown scan failures block the gate too.

## Reviewed historical Gitleaks results

The initial full-history scan found 30 matches over 396 commits / approximately
29 MB. Review inspected the exact historical source with values withheld:

- 20 generic-key matches were entirely base64 literals in historical OCR models.
- Public key IDs/prefixes, a fake SMS idempotency identifier and documentation
  format text were not authentication secrets.
- Analytics redaction and LMC environment validation used synthetic local fixtures.
- The legacy migration JWT had an invalid-length HS256 signature and was a test
  token. The historical TEST_JWT_PRIVATE_KEY was referenced only in its auth test,
  not production code; this public fixture must never become deployment material.

`docs/security/gitleaks-reviewed.json` records every fingerprint and reason without
secret/match values. `.gitleaksignore` contains exactly those historical commit,
path, rule and line fingerprints. There is no directory, test-file or rule-wide
exemption, baseline auto-acceptance, history rewrite or production-secret waiver.
A real scanner regression creates a disposable Git repository with these same
exceptions and a newly generated synthetic GitHub-shaped token at a previously
reviewed path. It proves the new commit is rejected and the report is fully
redacted. This regression runs in CI before the actual full-history scan.
With the reviewed exceptions, the local historical scan passes. New source is
also checked staged and after commit; results are recorded in STATUS.md.

## Semgrep status and precise exceptions

The first pass ran 101 rules and found two audit flags:

- The deliberately insecure HTTP URL in the OAuth negative test. The same test
  requires HTTPS rejection and verifies no network call occurs. Its assertion and
  behavior are unchanged; one exact-rule annotation documents the fixture.
- The installer urllib call. The URL is a literal fixed HTTPS artifact with no
  caller URL, and a pinned hash is checked before extraction. One exact-rule
  annotation documents this audit false positive; installer tests enforce the
  checksum and extraction boundary.

After review, there are zero findings, but the strict scan **still fails** on 38
partial-parsing warnings in TypeScript test files. Raising the rule timeout to
30 seconds removed the initial schema-rule timeout. Approximately 1,750 targets
were scanned; default ignore patterns and one file above the size limit remain
reported by the tool. Zero findings does not mean complete analysis or a green
SAST gate. Parser limitations and skipped-source coverage require further review;
no parser-error waiver or broad exclusion was added to turn this gate green.
The OAuth suite still passes all 21 tests, including the unchanged HTTP rejection.

## Dependency audit status

Fresh workspace audit remains red: 93 distinct advisories / 126 metadata findings,
with zero critical, 46 high, 65 moderate and 15 low metadata entries. The standalone
Zapier npm audit also fails: 33 findings (28 high, five moderate, zero critical).
These are unresolved work, not accepted release exceptions. The new CI gates
correctly prevent release validation while this work remains.

## Local commands

```sh
pnpm test:build-config
python3 scripts/security/install-gitleaks.py .tmp/security-tools
python3 scripts/security/verify-gitleaks-policy.py .tmp/security-tools/gitleaks
.tmp/security-tools/gitleaks git --redact=100 --log-opts=--all
semgrep scan --config p/security-audit --metrics=off --disable-version-check --timeout 30 --strict --error
pnpm audit
npm audit --prefix integrations/zapier
```

Run Semgrep from an isolated environment with version 1.181.0 installed, as in CI.
Keep raw scanner reports private/ignored; share only redacted metadata. Scanner
success never substitutes for the independent exhaustive tenant/API audit.
