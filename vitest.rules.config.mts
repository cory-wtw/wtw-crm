import { defineConfig } from "vitest/config";

// Security rules tests need the Firestore + Storage emulators running; see
// the test:rules script, which starts them around this run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["rules/**/*.rules-test.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
