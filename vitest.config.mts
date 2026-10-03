import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/features/chat/**/*.test.ts", "src/lib/goalMilestoneGrouping.test.ts", "src/lib/chatDeepLink.test.ts"],
  },
});
