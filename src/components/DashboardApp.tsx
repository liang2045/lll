"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, Database, Link2, RefreshCw, Save, Table2, Zap } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CellValue, DashboardPoint, NormalizedColumn, NormalizedRow } from "@/lib/types";

type Source = {
  id: string;
  name: string;
  type: "DINGTALK_SHEET" | "DINGTALK_AI_TABLE";
  workbookId?: string | null;
  sheetId?: string | null;
  baseId?: string | null;
  tableId?: string | null;
  primaryKeyField?: string | null;
  syncIntervalSec: number;
  lastSyncedAt?: string | null;
  _count?: { rows: number; conflicts: number };
};

type Relation = {
  id: string;
  name: string;
  primarySourceId: string;
  secondarySourceId: string;
  primaryField: string;
  secondaryField: string;
  displayFields: string[];
  primarySource: Source;
  secondarySource: Source;
};

type TablePayload = { source: Source; table: { columns: NormalizedColumn[]; rows: NormalizedRow[] } };
type DashboardPayload = {
  points: DashboardPoint[];
  joined: Array<{ rowId: string; key: string; display: Record<string, CellValue>; related: Array<Record<string, CellValue>> }>;
};
type Conflict = { id: string; field: string; localValue: string | null; remoteValue: string | null; source: Source };

const sourceTypeLabel = { DINGTALK_SHEET: "钉钉表格", DINGTALK_AI_TABLE: "AI 表格" };

export function DashboardApp() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [table, setTable] = useState<TablePayload | null>(null);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [relationId, setRelationId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [status, setStatus] = useState("初始化");
  const [newSource, setNewSource] = useState({ name: "", type: "DINGTALK_SHEET" as Source["type"], workbookId: "", sheetId: "", baseId: "", tableId: "", primaryKeyField: "" });

  const api = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }, []);

  const loadSources = useCallback(async () => {
    const data = await api<{ sources: Source[] }>("/api/sources");
    setSources(data.sources);
    setSourceId((current) => current || data.sources[0]?.id || "");
  }, [api]);

  const loadRows = useCallback(async (id: string) => {
    if (!id) return;
    const data = await api<TablePayload>(`/api/sources/${id}/rows`);
    setTable(data);
    setStatus(`同步于 ${formatTime(data.source.lastSyncedAt)}`);
  }, [api]);

  const loadRelations = useCallback(async () => {
    const data = await api<{ relations: Relation[] }>("/api/relations");
    setRelations(data.relations);
    setRelationId((current) => current || data.relations[0]?.id || "");
  }, [api]);

  const loadDashboard = useCallback(async (id: string) => {
    if (!id) return;
    setDashboard(await api<DashboardPayload>(`/api/dashboard/${id}`));
  }, [api]);

  const loadConflicts = useCallback(async () => {
    const data = await api<{ conflicts: Conflict[] }>("/api/conflicts");
    setConflicts(data.conflicts);
  }, [api]);

  useEffect(() => { void Promise.all([loadSources(), loadRelations(), loadConflicts()]).catch((e) => setStatus(String(e))); }, [loadConflicts, loadRelations, loadSources]);
  useEffect(() => { void loadRows(sourceId).catch((e) => setStatus(String(e))); }, [loadRows, sourceId]);
  useEffect(() => { void loadDashboard(relationId).catch(() => undefined); }, [loadDashboard, relationId]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (sourceId) void loadRows(sourceId);
      if (relationId) void loadDashboard(relationId);
      void loadConflicts();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadConflicts, loadDashboard, loadRows, relationId, sourceId]);

  const activeColumns = table?.table.columns ?? [];
  const activeRows = table?.table.rows ?? [];
  const selectedSource = sources.find((item) => item.id === sourceId);
  const counts = useMemo(() => ({ rows: sources.reduce((sum, s) => sum + (s._count?.rows ?? 0), 0), conflicts: conflicts.length }), [conflicts.length, sources]);

  async function createSource() {
    const missingSheet = newSource.type === "DINGTALK_SHEET" && (!newSource.workbookId || !newSource.sheetId || !newSource.primaryKeyField);
    const missingAi = newSource.type === "DINGTALK_AI_TABLE" && (!newSource.baseId || !newSource.tableId);
    if (!newSource.name || missingSheet || missingAi) {
      setStatus("请填写名称和当前类型需要的钉钉表格标识");
      return;
    }
    const created = await api<{ source: Source }>("/api/sources", { method: "POST", body: JSON.stringify({ ...newSource, documentId: newSource.workbookId, syncIntervalSec: 20 }) });
    setNewSource({ name: "", type: "DINGTALK_SHEET", workbookId: "", sheetId: "", baseId: "", tableId: "", primaryKeyField: "" });
    await loadSources();
    setSourceId(created.source.id);
    await loadRows(created.source.id);
  }

  async function editCell(row: NormalizedRow, column: NormalizedColumn, raw: string) {
    const value = parseCellValue(raw, column.type);
    setTable((current) => current && ({ ...current, table: { ...current.table, rows: current.table.rows.map((item) => item.id === row.id ? { ...item, values: { ...item.values, [column.id]: value } } : item) } }));
    try {
      await api(`/api/sources/${sourceId}/rows/${row.id}`, { method: "PATCH", body: JSON.stringify({ patch: { [column.id]: value }, expectedHash: row.hash }) });
      await loadRows(sourceId);
      await loadConflicts();
      if (relationId) await loadDashboard(relationId);
      setStatus("写入已同步");
    } catch (error) {
      await loadRows(sourceId);
      await loadConflicts();
      setStatus(error instanceof Error ? error.message : "写入失败");
    }
  }

  async function simulateRemote() {
    if (!sourceId) return;
    await api(`/api/sources/${sourceId}/simulate-remote`, { method: "POST" });
    await loadRows(sourceId);
  }

  async function resolveConflict(id: string, strategy: "useLocal" | "useRemote") {
    await api(`/api/conflicts/${id}`, { method: "PATCH", body: JSON.stringify({ strategy }) });
    await loadConflicts();
    if (sourceId) await loadRows(sourceId);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr_360px]">
        <aside className="border-b border-white/10 bg-[#080808] p-4 lg:border-b-0 lg:border-r">
          <div className="mb-6 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-md bg-white text-black"><Bot size={18} /></div><div><p className="text-sm font-semibold">Table AI</p><p className="text-xs text-zinc-500">DingTalk Sync</p></div></div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Metric label="数据源" value={sources.length} /><Metric label="缓存行" value={counts.rows} /><Metric label="关联" value={relations.length} /><Metric label="冲突" value={counts.conflicts} />
          </div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Database size={15} />数据源</h2>
          <div className="space-y-2">
            {sources.map((source) => <button key={source.id} onClick={() => setSourceId(source.id)} className={`w-full rounded-md border p-3 text-left ${sourceId === source.id ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.02]"}`}><div className="flex justify-between"><span>{source.name}</span><span className="font-mono text-xs">{source._count?.rows ?? 0}</span></div><p className="text-xs opacity-60">{sourceTypeLabel[source.type]}</p></button>)}
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">新数据源</div>
            <div className="space-y-2">
              <input className="field" placeholder="名称" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
              <select className="field" value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value as Source["type"] })}><option value="DINGTALK_SHEET">钉钉表格</option><option value="DINGTALK_AI_TABLE">AI 表格</option></select>
              {newSource.type === "DINGTALK_SHEET" ? <><input className="field" placeholder="workbookId" value={newSource.workbookId} onChange={(e) => setNewSource({ ...newSource, workbookId: e.target.value })} /><input className="field" placeholder="sheetId" value={newSource.sheetId} onChange={(e) => setNewSource({ ...newSource, sheetId: e.target.value })} /><input className="field" placeholder="主键列" value={newSource.primaryKeyField} onChange={(e) => setNewSource({ ...newSource, primaryKeyField: e.target.value })} /></> : <><input className="field" placeholder="baseId" value={newSource.baseId} onChange={(e) => setNewSource({ ...newSource, baseId: e.target.value })} /><input className="field" placeholder="tableId" value={newSource.tableId} onChange={(e) => setNewSource({ ...newSource, tableId: e.target.value })} /></>}
              <button className="command-button w-full" onClick={createSource}><Save size={14} />保存</button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 p-4 lg:p-6">
          <header className="mb-5 flex items-center justify-between border-b border-white/10 pb-5"><div><h1 className="text-2xl font-semibold">关联表格工作台</h1><p className="mt-1 font-mono text-xs text-zinc-500">{status}</p></div><div className="flex gap-2"><button className="command-button" onClick={simulateRemote}><Zap size={14} />模拟远端</button><button className="command-button" onClick={() => sourceId && loadRows(sourceId)}><RefreshCw size={14} />同步</button></div></header>
          <section className="mb-5 rounded-md border border-white/10 bg-white/[0.025]"><div className="flex justify-between border-b border-white/10 p-4"><h2 className="flex items-center gap-2 text-sm font-medium"><Table2 size={16} />{selectedSource?.name ?? "数据表"}</h2><span className="font-mono text-xs text-zinc-500">{activeRows.length} rows</span></div><div className="max-h-[420px] overflow-auto"><table className="w-full min-w-[720px] text-sm"><thead className="sticky top-0 bg-[#0b0b0b] text-xs text-zinc-500"><tr><th className="px-3 py-2 text-left">rowId</th>{activeColumns.map((c) => <th key={c.id} className="px-3 py-2 text-left">{c.name}</th>)}</tr></thead><tbody>{activeRows.map((row) => <tr key={row.id} className="border-t border-white/5"> <td className="px-3 py-2 font-mono text-xs text-zinc-500">{row.id}</td>{activeColumns.map((c) => <td key={c.id} className="px-2 py-2"><input className="h-8 w-full min-w-[120px] rounded border border-transparent bg-transparent px-2 outline-none hover:border-white/10 focus:border-white/40" defaultValue={row.values[c.id] == null ? "" : String(row.values[c.id])} onBlur={(e) => editCell(row, c, e.currentTarget.value)} /></td>)}</tr>)}</tbody></table></div></section>
          <section className="mb-5 rounded-md border border-white/10 bg-white/[0.025] p-4"><h2 className="mb-4 flex items-center gap-2 text-sm font-medium"><Activity size={16} />可视化</h2><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard?.points ?? []}><CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} /><XAxis dataKey="label" stroke="#71717a" fontSize={11} /><YAxis stroke="#71717a" fontSize={11} /><Tooltip contentStyle={{ background: "#080808", border: "1px solid rgba(255,255,255,.16)", borderRadius: 6 }} /><Bar dataKey="numericTotal" fill="#fff" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
          <section className="rounded-md border border-white/10 bg-white/[0.025] p-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Link2 size={16} />关联</h2><select className="field mb-3 max-w-md" value={relationId} onChange={(e) => setRelationId(e.target.value)}>{relations.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><table className="w-full text-sm"><tbody>{(dashboard?.joined ?? []).map((item) => <tr key={item.rowId} className="border-t border-white/5"><td className="px-3 py-2 font-medium">{item.key}</td><td className="px-3 py-2 font-mono text-zinc-400">{item.related.length}</td><td className="px-3 py-2 font-mono text-xs text-zinc-300">{JSON.stringify(item.display)}</td></tr>)}</tbody></table></section>
        </main>
        <aside className="border-t border-white/10 bg-[#080808] p-4 lg:border-l lg:border-t-0"><h2 className="mb-4 flex items-center gap-2 text-sm font-medium"><AlertTriangle size={16} />冲突 <span className="ml-auto font-mono text-xs text-zinc-500">{conflicts.length} open</span></h2>{conflicts.length === 0 ? <div className="rounded-md border border-white/10 p-4 text-sm text-zinc-500">Clean</div> : conflicts.map((c) => <div key={c.id} className="mb-3 rounded-md border border-white/10 bg-white/[0.03] p-3"><div className="mb-2 flex justify-between text-sm"><span>{c.source.name}</span><span className="font-mono text-xs text-zinc-500">{c.field}</span></div><p className="break-all text-xs text-zinc-400">本地: {c.localValue ?? "null"}</p><p className="break-all text-xs text-zinc-400">远端: {c.remoteValue ?? "null"}</p><div className="mt-3 grid grid-cols-2 gap-2"><button className="command-button justify-center" onClick={() => resolveConflict(c.id, "useLocal")}>本地</button><button className="command-button justify-center" onClick={() => resolveConflict(c.id, "useRemote")}>远端</button></div></div>)}</aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-white/10 bg-white/[0.03] p-3"><p className="text-[11px] uppercase text-zinc-500">{label}</p><p className="mt-1 font-mono text-xl">{value}</p></div>;
}

function parseCellValue(value: string, type: NormalizedColumn["type"]): CellValue {
  if (value === "") return null;
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "boolean") return value === "true";
  return value;
}

function formatTime(value?: string | null) {
  if (!value) return "未同步";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
