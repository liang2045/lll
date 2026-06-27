import type { SourceConnection } from "@prisma/client";
import { env } from "@/lib/env";
import { hashValue } from "@/lib/hash";
import type { CellValue, NormalizedColumn, NormalizedRow } from "@/lib/types";

type DingTalkTokenResponse = {
  accessToken?: string;
  refreshToken?: string;
  expireIn?: number;
};

type DingTalkMeResponse = {
  nick?: string;
  unionId?: string;
  openId?: string;
};

const mockColumns: NormalizedColumn[] = [
  { id: "customer", name: "客户", type: "text", writable: true },
  { id: "owner", name: "负责人", type: "text", writable: true },
  { id: "stage", name: "阶段", type: "text", writable: true },
  { id: "amount", name: "金额", type: "number", writable: true },
  { id: "updatedAt", name: "更新时间", type: "date", writable: true },
];

const mockAiColumns: NormalizedColumn[] = [
  { id: "customer", name: "客户", type: "text", writable: true },
  { id: "priority", name: "优先级", type: "text", writable: true },
  { id: "risk", name: "风险", type: "text", writable: true },
  { id: "score", name: "评分", type: "number", writable: true },
];

const mockRows: NormalizedRow[] = [
  {
    id: "row-001",
    values: {
      customer: "星河制造",
      owner: "阿远",
      stage: "方案中",
      amount: 128000,
      updatedAt: "2026-06-24",
    },
  },
  {
    id: "row-002",
    values: {
      customer: "北辰零售",
      owner: "Lin",
      stage: "签约",
      amount: 86000,
      updatedAt: "2026-06-25",
    },
  },
  {
    id: "row-003",
    values: {
      customer: "曜石科技",
      owner: "Mira",
      stage: "跟进",
      amount: 42000,
      updatedAt: "2026-06-26",
    },
  },
];

const mockAiRows: NormalizedRow[] = [
  {
    id: "rec-001",
    values: {
      customer: "星河制造",
      priority: "P0",
      risk: "交付节点紧",
      score: 91,
    },
  },
  {
    id: "rec-002",
    values: {
      customer: "北辰零售",
      priority: "P1",
      risk: "采购审批",
      score: 78,
    },
  },
  {
    id: "rec-003",
    values: {
      customer: "曜石科技",
      priority: "P2",
      risk: "预算确认",
      score: 66,
    },
  },
];

function withHashes(rows: NormalizedRow[]): NormalizedRow[] {
  return rows.map((row) => ({
    ...row,
    hash: hashValue(row.values),
    remoteHash: hashValue(row.values),
  }));
}

async function dingTalkFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${env.dingTalk.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DingTalk API ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export function buildDingTalkAuthorizeUrl(state: string) {
  const url = new URL(env.dingTalk.authorizeUrl);
  url.searchParams.set("redirect_uri", env.dingTalk.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.dingTalk.clientId);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeCodeForDingTalkUser(code: string) {
  if (env.isMock) {
    return {
      dingUserId: "mock-user",
      name: "Demo DingTalk User",
      accessToken: "mock-access-token",
    };
  }

  const token = await fetch(`${env.dingTalk.apiBaseUrl}/v1.0/oauth2/userAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: env.dingTalk.clientId,
      clientSecret: env.dingTalk.clientSecret,
      code,
      grantType: "authorization_code",
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`DingTalk OAuth failed: ${await response.text()}`);
    }
    return (await response.json()) as DingTalkTokenResponse;
  });

  if (!token.accessToken) {
    throw new Error("DingTalk OAuth did not return an access token.");
  }

  const me = await dingTalkFetch<DingTalkMeResponse>(
    "/v1.0/contact/users/me",
    token.accessToken,
  );

  return {
    dingUserId: me.unionId ?? me.openId ?? "unknown-dingtalk-user",
    name: me.nick ?? "DingTalk User",
    accessToken: token.accessToken,
  };
}

export async function readRemoteSchema(
  source: SourceConnection,
  accessToken?: string | null,
): Promise<NormalizedColumn[]> {
  if (env.isMock || !accessToken) {
    return source.type === "DINGTALK_AI_TABLE" ? mockAiColumns : mockColumns;
  }

  if (source.type === "DINGTALK_AI_TABLE") {
    type FieldResponse = { fields?: Array<{ name?: string; fieldId?: string; type?: string }> };
    const result = await dingTalkFetch<FieldResponse>(
      `/v1.0/wiki/workspaces/${source.baseId}/tables/${source.tableId}/fields`,
      accessToken,
    );
    return (result.fields ?? []).map((field) => ({
      id: field.fieldId ?? field.name ?? "field",
      name: field.name ?? field.fieldId ?? "未命名字段",
      type: normalizeFieldType(field.type),
      writable: true,
    }));
  }

  type SheetMeta = { columns?: Array<{ name?: string; columnId?: string; type?: string }> };
  const result = await dingTalkFetch<SheetMeta>(
    `/v1.0/doc/workbooks/${source.workbookId}/sheets/${source.sheetId}/metadata`,
    accessToken,
  );
  return (result.columns ?? []).map((column) => ({
    id: column.columnId ?? column.name ?? "column",
    name: column.name ?? column.columnId ?? "未命名列",
    type: normalizeFieldType(column.type),
    writable: true,
  }));
}

export async function readRemoteRows(
  source: SourceConnection,
  accessToken?: string | null,
): Promise<NormalizedRow[]> {
  if (env.isMock || !accessToken) {
    return withHashes(source.type === "DINGTALK_AI_TABLE" ? mockAiRows : mockRows);
  }

  if (source.type === "DINGTALK_AI_TABLE") {
    type RecordsResponse = {
      records?: Array<{ recordId?: string; fields?: Record<string, CellValue> }>;
    };
    const result = await dingTalkFetch<RecordsResponse>(
      `/v1.0/wiki/workspaces/${source.baseId}/tables/${source.tableId}/records`,
      accessToken,
    );
    return (result.records ?? []).map((record) => ({
      id: record.recordId ?? crypto.randomUUID(),
      values: record.fields ?? {},
    }));
  }

  type RowsResponse = {
    rows?: Array<{ rowIndex?: number; values?: Record<string, CellValue> }>;
  };
  const result = await dingTalkFetch<RowsResponse>(
    `/v1.0/doc/workbooks/${source.workbookId}/sheets/${source.sheetId}/rows`,
    accessToken,
  );

  return (result.rows ?? []).map((row) => {
    const values = row.values ?? {};
    const id =
      source.primaryKeyField && values[source.primaryKeyField] != null
        ? String(values[source.primaryKeyField])
        : `row-${row.rowIndex ?? crypto.randomUUID()}`;
    return { id, values };
  });
}

export async function writeRemoteRow(
  source: SourceConnection,
  rowId: string,
  patch: Record<string, CellValue>,
  accessToken?: string | null,
) {
  if (env.isMock || !accessToken) {
    return { ok: true };
  }

  if (source.type === "DINGTALK_AI_TABLE") {
    await dingTalkFetch(
      `/v1.0/wiki/workspaces/${source.baseId}/tables/${source.tableId}/records/${rowId}`,
      accessToken,
      { method: "PUT", body: JSON.stringify({ fields: patch }) },
    );
    return { ok: true };
  }

  if (!source.primaryKeyField) {
    throw new Error("普通钉钉表格需要配置稳定主键列后才能写入。");
  }

  await dingTalkFetch(
    `/v1.0/doc/workbooks/${source.workbookId}/sheets/${source.sheetId}/rows/${rowId}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ values: patch }) },
  );
  return { ok: true };
}

function normalizeFieldType(type?: string): NormalizedColumn["type"] {
  const normalized = (type ?? "").toLowerCase();
  if (normalized.includes("number") || normalized.includes("double")) return "number";
  if (normalized.includes("date") || normalized.includes("time")) return "date";
  if (normalized.includes("bool")) return "boolean";
  if (normalized.includes("text") || normalized.includes("string")) return "text";
  return "unknown";
}
