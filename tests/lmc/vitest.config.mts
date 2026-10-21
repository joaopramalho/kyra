import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  resolve: { alias: {
    "@lobbystack/agent-core": `${root}/packages/agent-core/src/index.ts`,
    "@lobbystack/domain": `${root}/packages/domain/src/index.ts`,
    "@lobbystack/contracts": `${root}/packages/contracts/src/index.ts`,
    "@lobbystack/db": `${root}/packages/db/src/index.ts`,
    "@lobbystack/providers/crypto/secretBox": `${root}/packages/providers/src/crypto/secretBox.ts`,
    "@lobbystack/providers": `${root}/packages/providers/src/index.ts`,
    "@lobbystack/shared": `${root}/packages/shared/src/index.ts`,
    "@lobbystack/telemetry/node": `${root}/packages/telemetry/src/node.ts`,
    "@lobbystack/telemetry": `${root}/packages/telemetry/src/index.ts`,
  } },
  test: { include: ["tests/lmc/**/*.acceptance.ts"], fileParallelism: false, testTimeout: 15_000, hookTimeout: 15_000 },
});
