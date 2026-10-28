import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/features/chat/**/*.test.ts", "src/lib/goalMilestoneGrouping.test.ts", "src/lib/chatDeepLink.test.ts", "src/lib/canonicalProjects.test.ts", "src/app/docs/CanonicalDocuments.test.tsx", "src/app/docs/ProjectFileFilters.test.tsx", "src/lib/canonicalHitPath.test.ts", "src/lib/docFileView.test.ts", "src/app/docs/ProjectFileViews.test.tsx", "src/components/GoalDocumentChips.test.tsx", "src/lib/goalPanelLoad.test.ts", "src/components/GoalPanel.test.tsx", "src/components/GoalProgressControls.test.tsx", "src/lib/goalProgress.test.ts", "src/components/chat/GoalStrip.test.tsx", "src/components/chat/GoalStrip.interaction.test.tsx", "src/lib/goalTriage.test.ts", "src/lib/goalOrder.test.ts", "src/lib/goalStrip.order.test.ts", "src/components/GoalOrderControls.test.tsx", "src/app/chat/runnerJobsLoader.test.ts", "src/lib/skillCatalog.test.ts", "src/components/skills/SkillDetail.test.tsx", "src/lib/approvalDecision.test.ts", "src/components/chat/ApprovalHighRisk.test.tsx", "src/lib/goalWorkStatus.test.tsx", "src/lib/clientEnv.test.ts"],
  },
});
