import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/hash";
import type { CellValue, DashboardPoint } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ relationId: string }> },
) {
  const user = await requireUser();
  const { relationId } = await context.params;
  const relation = await prisma.relationConfig.findFirst({
    where: {
      id: relationId,
      primarySource: { authUserId: user.id },
      secondarySource: { authUserId: user.id },
    },
    include: { primarySource: true, secondarySource: true },
  });

  if (!relation) {
    return NextResponse.json({ error: "Relation not found" }, { status: 404 });
  }

  const [primaryRows, secondaryRows] = await Promise.all([
    prisma.tableRowCache.findMany({ where: { sourceId: relation.primarySourceId } }),
    prisma.tableRowCache.findMany({ where: { sourceId: relation.secondarySourceId } }),
  ]);

  const secondaryByKey = new Map<string, Record<string, CellValue>[]>();
  for (const row of secondaryRows) {
    const values = parseJson<Record<string, CellValue>>(row.dataJson, {});
    const key = String(values[relation.secondaryField] ?? "");
    const bucket = secondaryByKey.get(key) ?? [];
    bucket.push(values);
    secondaryByKey.set(key, bucket);
  }

  const displayFields = parseJson<string[]>(relation.displayFieldsJson, []);
  const joined = primaryRows.map((row) => {
    const values = parseJson<Record<string, CellValue>>(row.dataJson, {});
    const key = String(values[relation.primaryField] ?? "");
    const related = secondaryByKey.get(key) ?? [];
    return {
      rowId: row.rowId,
      key,
      values,
      related,
      display: buildDisplay(values, related[0] ?? {}, displayFields),
    };
  });

  const points: DashboardPoint[] = joined.map((item) => ({
    label: item.key || item.rowId,
    primaryCount: 1,
    relatedCount: item.related.length,
    numericTotal: numericTotal(item.values, item.related[0] ?? {}),
  }));

  return NextResponse.json({
    relation: {
      ...relation,
      displayFields,
    },
    joined,
    points,
    summary: {
      primaryRows: primaryRows.length,
      secondaryRows: secondaryRows.length,
      matchedRows: joined.filter((item) => item.related.length > 0).length,
    },
  });
}

function buildDisplay(
  primary: Record<string, CellValue>,
  secondary: Record<string, CellValue>,
  fields: string[],
) {
  const merged = { ...secondary, ...primary };
  return Object.fromEntries(fields.map((field) => [field, merged[field] ?? null]));
}

function numericTotal(
  primary: Record<string, CellValue>,
  secondary: Record<string, CellValue>,
) {
  let total = 0;
  for (const value of Object.values({ ...primary, ...secondary })) {
    if (typeof value === "number") total += value;
  }
  return total;
}
