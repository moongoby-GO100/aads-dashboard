import type { Artifact, ArtifactTab } from "./types";

export function isDirectiveDraftArtifact(artifact: Artifact): boolean {
  return artifact.metadata?.subtype === "directive_draft";
}

export function artifactMatchesTab(artifact: Artifact, tab: ArtifactTab): boolean {
  if (tab === "directive") return isDirectiveDraftArtifact(artifact);
  if (isDirectiveDraftArtifact(artifact)) return false;
  if (tab === "report") {
    return ["report", "text", "file", "table", "task_card"].includes(artifact.artifact_type);
  }
  if (tab === "dialog") return artifact.artifact_type === "full_response";
  if (tab === "code") return artifact.artifact_type === "code";
  if (tab === "chart") return artifact.artifact_type === "chart" || artifact.artifact_type === "image";
  if (tab === "html_preview") return artifact.artifact_type === "html_preview";
  return false;
}

export function artifactTabForArtifact(artifact: Artifact): ArtifactTab {
  if (isDirectiveDraftArtifact(artifact)) return "directive";
  if (artifact.artifact_type === "html_preview") return "html_preview";
  if (artifact.artifact_type === "code") return "code";
  if (artifact.artifact_type === "image" || artifact.artifact_type === "chart") return "chart";
  if (artifact.artifact_type === "full_response") return "dialog";
  return "report";
}
