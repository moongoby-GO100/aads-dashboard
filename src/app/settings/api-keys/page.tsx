"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api, type UserApiKeyItem } from "@/lib/api";
import { getMe } from "@/lib/auth";
import {
  ApiKeysView,
  providerLabel,
  saveAndVerify,
  verifyKey,
  type ConnectMethod,
  type StatusMessage,
} from "./ApiKeysView";

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function UserApiKeysPage() {
  const [keys, setKeys] = useState<UserApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [method, setMethod] = useState<ConnectMethod | null>(null);
  const [provider, setProvider] = useState("anthropic");
  const [keyValue, setKeyValue] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [formStatus, setFormStatus] = useState<StatusMessage | null>(null);
  const [listStatus, setListStatus] = useState<StatusMessage | null>(null);
  const [loadError, setLoadError] = useState<StatusMessage | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setKeys(await api.getUserApiKeys());
    } catch (e) {
      setLoadError({ kind: "error", text: errText(e, "API 키 목록을 불러오지 못했습니다.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void getMe().then((user) => setIsAdmin(Boolean(user?.is_internal_admin)));
  }, []);

  const save = async () => {
    setSaving(true);
    setFormStatus(null);
    try {
      const result = await saveAndVerify(api, { provider, displayName, key: keyValue });
      setKeyValue(result.keyValue);
      setFormStatus(result.status);
      if (result.saved) await load();
    } finally {
      setSaving(false);
    }
  };

  const test = async (key: UserApiKeyItem) => {
    setTestingId(key.id);
    setListStatus(await verifyKey(api, key.id, providerLabel(key.provider)));
    setTestingId("");
    await load();
  };

  const remove = async (key: UserApiKeyItem) => {
    if (!window.confirm(`${providerLabel(key.provider)} 키를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteUserApiKey(key.id);
      setListStatus({ kind: "ok", text: "삭제했습니다." });
      await load();
    } catch (e) {
      setListStatus({ kind: "error", text: `삭제하지 못했습니다: ${errText(e, "알 수 없는 오류")}` });
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="AI API" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <ApiKeysView
          method={method}
          onSelectMethod={setMethod}
          provider={provider}
          onProviderChange={(value) => { setProvider(value); setFormStatus(null); }}
          keyValue={keyValue}
          onKeyChange={setKeyValue}
          displayName={displayName}
          onDisplayNameChange={setDisplayName}
          saving={saving}
          onSave={() => void save()}
          formStatus={formStatus}
          isAdmin={isAdmin}
          keys={keys}
          loading={loading}
          listStatus={listStatus}
          loadError={loadError}
          testingId={testingId}
          onRefresh={() => void load()}
          onTest={(key) => void test(key)}
          onDelete={(key) => void remove(key)}
        />
      </div>
    </div>
  );
}
