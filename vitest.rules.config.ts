import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules.emulator.test.ts"],
    exclude: [],
    fileParallelism: false,
  },
});
