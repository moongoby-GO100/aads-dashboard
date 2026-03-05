// AADS API 응답 타입 완전 정의 (v3.5)

export type ProjectStatusValue =
  | "pending"
  | "in_progress"
  | "checkpoint_pending"
  | "completed"
  | "failed"
  | "cancelled";

// 하위 호환성

export type CheckpointStage =
  | "requirements"
  | "plan_review"
  | "design_review"
  | "development"
  | "midpoint_review"
  | "final_review"
  | "completed"
  | "cancelled";

export type AgentName =
  | "pm"
  | "supervisor"
  | "architect"
  | "developer"
  | "qa"
  | "judge"
  | "devops"
  | "researcher";

export interface Project {
  id: string;
  description: string;
  status: ProjectStatusValue;
  created_at: string;
  updated_at?: string;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

export interface CreateProjectResponse {
  project_id: string;
  status: ProjectStatusValue;
  checkpoint_stage: CheckpointStage;
  interrupt_payload: InterruptPayload | null;
}

export interface InterruptPayload {
  stage: CheckpointStage;
  message: string;
  task_spec?: TaskSpec;
}

export interface TaskSpec {
  task_id: string;
  parent_task_id: string | null;
  description: string;
  assigned_agent: AgentName;
  success_criteria: string[];
  constraints: string[];
  input_artifacts: string[];
  output_artifacts: string[];
  max_iterations: number;
  max_llm_calls: number;
  budget_limit_usd: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked" | "cancelled";
}

export interface ProjectStatus {
  project_id: string;
  status: ProjectStatusValue;
  checkpoint_stage: CheckpointStage;
  current_agent: AgentName | null;
  progress_percent: number;
  checkpoints: Checkpoint[];
  costs: CostInfo;
  generated_files_count: number;
  created_at: string;
  error_log: string[];
}

export interface Checkpoint {
  stage: CheckpointStage;
  status: "pending" | "approved" | "rejected";
  timestamp: string;
  feedback?: string;
}

export interface AgentCost {
  cost_usd: number;
  tokens: number;
  calls: number;
}

export interface CostInfo {
  total_usd: number;
  llm_calls_count: number;
  by_agent: Partial<Record<string, AgentCost>>;
}

export interface HealthResponse {
  status: "ok" | "error";
  graph_ready: boolean;
  version: string;
}

export interface SSEEvent {
  type:
    | "agent_start"
    | "agent_complete"
    | "checkpoint"
    | "pipeline_complete"
    | "error"
    | "ping"
    | "done";
  data: Record<string, unknown>;
}

export interface LoginResponse {
  token: string;
  user_id: string;
  email: string;
}

export interface MeResponse {
  user_id: string;
  email: string;
}

// 하위 호환성을 위한 별칭


export interface AutoRunResponse {
  project_id: string;
  status: ProjectStatusValue | "max_iterations_reached";
  checkpoint_stage: CheckpointStage;
  iterations: number;
}
// api.ts 호환성을 위한 별칭
export type ProjectStatusResponse = ProjectStatus;

export interface Conversation {
  id: string; project: string; source: string; snapshot: string;
  full_text: string; logged_at: string; char_count: number; updated_at: string;
}
export interface ConversationsResponse {
  status: string; total: number; limit: number; offset: number;
  conversations: Conversation[];
}
export interface ConversationStatsResponse {
  status: string; total_conversations: number;
  projects: { project: string; count: number; last_updated: string }[];
}
export interface PublicSummaryResponse {
  status: string; memory_system: string; total_categories: number;
  category_list: string[]; data: Record<string, any[]>;
}
export interface MemorySearchResponse { status: string; count: number; data: any[]; }
export interface MemoryInboxResponse { status: string; agent_id: string; count: number; data: any[]; }
