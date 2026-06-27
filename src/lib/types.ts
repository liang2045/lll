import type { SourceType } from "@prisma/client";

export type CellValue = string | number | boolean | null;

export type NormalizedColumn = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "boolean" | "unknown";
  writable: boolean;
};

export type NormalizedRow = {
  id: string;
  values: Record<string, CellValue>;
  hash?: string;
  remoteHash?: string;
  updatedAt?: string;
};

export type NormalizedTable = {
  sourceId: string;
  sourceType: SourceType;
  columns: NormalizedColumn[];
  rows: NormalizedRow[];
};

export type DashboardPoint = {
  label: string;
  primaryCount: number;
  relatedCount: number;
  numericTotal: number;
};
