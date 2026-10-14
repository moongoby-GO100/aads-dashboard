import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/features/chat/**/*.test.ts", "src/lib/goalMilestoneGrouping.test.ts", "src/lib/chatDeepLink.test.ts", "src/lib/canonicalProjects.test.ts", "src/app/docs/CanonicalDocuments.test.tsx"],
  },
});
