# LMC status

Phase 0 in progress on lmc/v1. Installation with pinned pnpm 10.30.3 passed. Lint passed with 17 warnings; typecheck passed. Initial tests failed resolving an unbuilt workspace package; initial build failed on a Windows file URL conversion.

Added a failing widget-entry regression test, repaired file URL conversion, and verified both the test and widget build pass. Full build retry is running. Main tests will be retried after compilation.

Recon covers 81 tables and static FORCE RLS evidence. Live database tests remain pending. Audit reports 72 vulnerabilities. No product rebrand/email functionality or hosted fork is complete. Existing voice code and tests remain intact.
