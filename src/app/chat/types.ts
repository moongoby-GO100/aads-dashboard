// AADS Chat Types — extracted from page.tsx (Phase 1)

export interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface ChatSession {
  id: string;
  workspace_id: string;
  title: string;
  current_model: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  message_count: number;
  cost_total?: string | number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model_used?: string;
  intent?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost?: string | number;
  created_at?: string;
  edited_at?: string;
  attachmentPreviews?: string[];
  attachments?: Array<{
    type?: string;
    file_id?: string;
    file_url?: string;
    thumbnail_url?: string;
    base64?: string;
    name?: string;
    mime?: string;
    mime_type?: string;
    media_type?: string;
  }>;
}

export interface Artifact {
  id: string;
  session_id: string;
  workspace_id?: string;
  artifact_type: "report" | "code" | "chart" | "dashboard" | "text" | "image" | "file" | "table";
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export type Theme = "dark" | "light";
export type ArtifactMode = "full" | "mini" | "hidden";
export type ArtifactTab = "report" | "code" | "chart" | "dashboard" | "tasks";
export type ScreenSize = "desktop" | "tablet" | "mobile";

// Theme CSS variables
export const DARK: Record<string, string> = {
  "--ct-bg": "#0f0f23",
  "--ct-sb": "#1a1a2e",
  "--ct-card": "#16213e",
  "--ct-input": "#1a1a2e",
  "--ct-border": "#2d2d4a",
  "--ct-accent": "#6C63FF",
  "--ct-accent-h": "#5A52E0",
  "--ct-text": "#e2e8f0",
  "--ct-text2": "#8892a4",
  "--ct-user": "#6C63FF",
  "--ct-ai": "#1e1e3a",
  "--ct-code": "#0a0a1a",
  "--ct-hover": "#232340",
};

export const LIGHT: Record<string, string> = {
  "--ct-bg": "#f8f9fa",
  "--ct-sb": "#ffffff",
  "--ct-card": "#ffffff",
  "--ct-input": "#ffffff",
  "--ct-border": "#e2e8f0",
  "--ct-accent": "#4A45B0",
  "--ct-accent-h": "#3c38a0",
  "--ct-text": "#1a202c",
  "--ct-text2": "#718096",
  "--ct-user": "#4A45B0",
  "--ct-ai": "#f0f0f8",
  "--ct-code": "#f1f5f9",
  "--ct-hover": "#e8e8f0",
};
