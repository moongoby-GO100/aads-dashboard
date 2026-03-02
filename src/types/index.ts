export interface Project {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  created_at: string;
  updated_at?: string;
}

export interface ProjectStatus {
  project_id: string;
  status: string;
  checkpoint_stage: string;
  current_agent: string | null;
  progress_percent: number;
  checkpoints: Checkpoint[];
  costs: CostInfo;
  generated_files_count: number;
  created_at: string;
  error_log: string[];
}

export interface Checkpoint {
  stage: string;
  status: "pending" | "approved" | "rejected";
  timestamp: string;
  feedback?: string;
}

export interface CostInfo {
  total_usd: number;
  llm_calls_count: number;
  by_agent: Record<string, AgentCost>;
}

export interface AgentCost {
  cost_usd: number;
  llm_calls: number;
  tokens_in?: number;
  tokens_out?: number;
}

export interface SSEEvent {
  type: "agent_start" | "agent_complete" | "checkpoint" | "pipeline_complete" | "error" | "ping";
  data: Record<string, unknown>;
}
