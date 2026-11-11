"use client";

// 모델 레지스트리(llm_models) 공용 조회 훅.
// 채팅 모델 선택기 · 토론 패널이 같은 엔드포인트(/llm-models, 설정 화면의
// LlmRegistryWorkspacePanel 과 동일)를 쓰도록 한 곳에 모았다.
// 하드코딩 폴백은 두지 않는다: 실패 시 마지막 성공 목록(localStorage) → 없으면 오류 상태.

import { useCallback, useEffect, useRef, useState } from "react";

export interface RegistryModelRow {
  provider?: string;
  model_id?: string;
  display_name?: string | null;
  input_cost?: string | number | null;
  output_cost?: string | number | null;
  is_active?: boolean;
  is_selectable?: boolean;
  is_executable?: boolean;
  metadata?: Record<string, unknown> | string | null;
}

export type RegistryStatus = "loading" | "ready" | "cached" | "error";

const CACHE_KEY = "aads_model_registry_cache_v1";
const REFRESH_MS = 60_000;

const API_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) || "https://aads.newtalk.kr/api/v1";

/** is_executable=true 이고 별칭(alias) 행이 아닌 모델만 선택 가능. */
export function isExecutableRegistryModel(model: RegistryModelRow): boolean {
  const metadata =
    model.metadata && typeof model.metadata === "object" && !Array.isArray(model.metadata) ? model.metadata : {};
  if (metadata.alias_of || metadata.model_source === "accepted_alias") return false;
  return model.is_executable === true && model.is_active !== false && Boolean(String(model.model_id || "").trim());
}

export function formatRegistryCost(input?: string | number | null, output?: string | number | null): string {
  const i = Number(input);
  const o = Number(output);
  if (input == null || output == null || !Number.isFinite(i) || !Number.isFinite(o)) return "변동";
  if (i === 0 && o === 0) return "무료";
  return `$${i}/$${o}`;
}

export function registryDisplayName(model: RegistryModelRow): string {
  return String(model.display_name || "").trim() || String(model.model_id || "").trim();
}

/** 제공사별 그룹. 동일 model_id 가 여러 제공사에 있으면 option value 를 `provider:model_id` 로 구분. */
export interface RegistryOption {
  value: string;
  modelId: string;
  provider: string;
  label: string;
  cost: string;
}

export function buildRegistryOptions(rows: RegistryModelRow[]): RegistryOption[] {
  const usable = rows.filter(isExecutableRegistryModel);
  const counts = new Map<string, number>();
  for (const row of usable) {
    const id = String(row.model_id).trim();
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return usable.map((row) => {
    const modelId = String(row.model_id).trim();
    const provider = String(row.provider || "기타").trim().toLowerCase() || "기타";
    return {
      value: (counts.get(modelId) || 0) > 1 ? `${provider}:${modelId}` : modelId,
      modelId,
      provider,
      label: registryDisplayName(row),
      cost: formatRegistryCost(row.input_cost, row.output_cost),
    };
  });
}

export function groupByProvider(options: RegistryOption[]): Array<[string, RegistryOption[]]> {
  const map = new Map<string, RegistryOption[]>();
  for (const option of options) {
    const list = map.get(option.provider) || [];
    list.push(option);
    map.set(option.provider, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, list]) => [provider, [...list].sort((a, b) => a.label.localeCompare(b.label))]);
}

export function readCache(): RegistryModelRow[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCache(rows: RegistryModelRow[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* 용량 초과 등 — 캐시는 선택 사항 */
  }
}

async function fetchRows(): Promise<RegistryModelRow[]> {
  const token = localStorage.getItem("aads_token");
  const res = await fetch(`${API_BASE}/llm-models?view=selector`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`llm-models ${res.status}`);
  const data: { models?: RegistryModelRow[] } = await res.json();
  if (!Array.isArray(data.models)) throw new Error("llm-models: invalid payload");
  return data.models;
}

export function useModelRegistry(options: { autoRefresh?: boolean } = {}) {
  const { autoRefresh = false } = options;
  const [rows, setRows] = useState<RegistryModelRow[]>([]);
  const [status, setStatus] = useState<RegistryStatus>("loading");
  const requestRef = useRef(0);
  const rowsRef = useRef<RegistryModelRow[]>([]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const fresh = await fetchRows();
      if (request !== requestRef.current) return;
      writeCache(fresh);
      rowsRef.current = fresh;
      setRows(fresh);
      setStatus("ready");
    } catch {
      if (request !== requestRef.current) return;
      // 실패 시: 표시 중인 목록 유지 → localStorage 캐시 → 오류 상태(하드코딩 폴백 없음).
      if (rowsRef.current.length > 0) {
        setStatus("cached");
        return;
      }
      const cached = readCache();
      if (cached) {
        rowsRef.current = cached;
        setRows(cached);
        setStatus("cached");
      } else {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
    if (!autoRefresh) return;
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, REFRESH_MS);
    return () => {
      requestRef.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load, autoRefresh]);

  return { rows, status, retry: load };
}
