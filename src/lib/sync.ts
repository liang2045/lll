import type { SourceConnection, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashValue, parseJson } from "@/lib/hash";
import { readRemoteRows, writeRemoteRow } from "@/lib/dingtalk";
import type { CellValue, NormalizedRow } from "@/lib/types";

export async function syncSource(source: SourceConnection, user: Pick<User, "accessToken">) {
  const cachedCount = await prisma.tableRowCache.count({ where: { sourceId: source.id } });
  if (env.isMock && cachedCount > 0) {
    await prisma.sourceConnection.update({
      where: { id: source.id },
      data: { lastSyncedAt: new Date() },
    });
    return;
  }

  const freshRows = await readRemoteRows(source, user.accessToken);

  for (const row of freshRows) {
    const hash = hashValue(row.values);
    await prisma.tableRowCache.upsert({
      where: { sourceId_rowId: { sourceId: source.id, rowId: row.id } },
      create: {
        sourceId: source.id,
        rowId: row.id,
        dataJson: JSON.stringify(row.values),
        remoteDataJson: JSON.stringify(row.values),
        hash,
        remoteHash: hash,
      },
      update:
        cachedCount === 0
          ? {
              dataJson: JSON.stringify(row.values),
              remoteDataJson: JSON.stringify(row.values),
              hash,
              remoteHash: hash,
            }
          : {
              remoteDataJson: JSON.stringify(row.values),
              remoteHash: hash,
            },
    });
  }

  await prisma.sourceConnection.update({
    where: { id: source.id },
    data: { lastSyncedAt: new Date() },
  });
}

export async function getCachedRows(sourceId: string): Promise<NormalizedRow[]> {
  const rows = await prisma.tableRowCache.findMany({
    where: { sourceId },
    orderBy: { rowId: "asc" },
  });

  return rows.map((row) => ({
    id: row.rowId,
    values: parseJson<Record<string, CellValue>>(row.dataJson, {}),
    hash: row.hash,
    remoteHash: row.remoteHash,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function patchRowWithConflictDetection({
  source,
  user,
  rowId,
  patch,
  expectedHash,
}: {
  source: SourceConnection;
  user: Pick<User, "accessToken">;
  rowId: string;
  patch: Record<string, CellValue>;
  expectedHash?: string;
}) {
  const cached = await prisma.tableRowCache.findUnique({
    where: { sourceId_rowId: { sourceId: source.id, rowId } },
  });

  if (!cached) {
    throw new Error("ROW_NOT_FOUND");
  }

  const currentValues = parseJson<Record<string, CellValue>>(cached.dataJson, {});
  const remoteValues = parseJson<Record<string, CellValue>>(cached.remoteDataJson, {});

  if (expectedHash && cached.hash !== expectedHash) {
    const [field, localValue] = Object.entries(patch)[0] ?? [];
    await prisma.conflict.create({
      data: {
        sourceId: source.id,
        rowId,
        field: field ?? "unknown",
        baseValue: stringifyValue(currentValues[field]),
        localValue: stringifyValue(localValue),
        remoteValue: stringifyValue(remoteValues[field]),
      },
    });
    return { status: "conflict" as const };
  }

  const conflictFields = Object.entries(patch).filter(([field, value]) => {
    return cached.remoteHash !== cached.hash && remoteValues[field] !== value;
  });

  if (conflictFields.length > 0) {
    for (const [field, localValue] of conflictFields) {
      await prisma.conflict.create({
        data: {
          sourceId: source.id,
          rowId,
          field,
          baseValue: stringifyValue(currentValues[field]),
          localValue: stringifyValue(localValue),
          remoteValue: stringifyValue(remoteValues[field]),
        },
      });
    }
    return { status: "conflict" as const };
  }

  await writeRemoteRow(source, rowId, patch, user.accessToken);
  const nextValues = { ...currentValues, ...patch };
  const nextHash = hashValue(nextValues);

  const updated = await prisma.tableRowCache.update({
    where: { sourceId_rowId: { sourceId: source.id, rowId } },
    data: {
      dataJson: JSON.stringify(nextValues),
      remoteDataJson: JSON.stringify(nextValues),
      hash: nextHash,
      remoteHash: nextHash,
    },
  });

  return {
    status: "ok" as const,
    row: {
      id: updated.rowId,
      values: parseJson<Record<string, CellValue>>(updated.dataJson, {}),
      hash: updated.hash,
      remoteHash: updated.remoteHash,
    },
  };
}

export async function simulateRemoteChange(sourceId: string) {
  const row = await prisma.tableRowCache.findFirst({
    where: { sourceId },
    orderBy: { updatedAt: "desc" },
  });

  if (!row) return null;

  const remoteValues = parseJson<Record<string, CellValue>>(row.remoteDataJson, {});
  const field = Object.keys(remoteValues).find((key) => typeof remoteValues[key] === "string");
  if (!field) return null;

  const nextRemoteValues = {
    ...remoteValues,
    [field]: `${remoteValues[field]} / 远端更新`,
  };
  const remoteHash = hashValue(nextRemoteValues);

  return prisma.tableRowCache.update({
    where: { id: row.id },
    data: {
      remoteDataJson: JSON.stringify(nextRemoteValues),
      remoteHash,
    },
  });
}

function stringifyValue(value: unknown) {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}
