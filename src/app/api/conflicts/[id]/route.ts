import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashValue, parseJson } from "@/lib/hash";
import type { CellValue } from "@/lib/types";

export const runtime = "nodejs";

const resolveSchema = z.object({
  strategy: z.enum(["useLocal", "useRemote"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = resolveSchema.parse(await request.json());

  const conflict = await prisma.conflict.findFirst({
    where: { id, source: { authUserId: user.id } },
  });

  if (!conflict) {
    return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  }

  const cached = await prisma.tableRowCache.findUnique({
    where: { sourceId_rowId: { sourceId: conflict.sourceId, rowId: conflict.rowId } },
  });

  if (cached) {
    const local = parseJson<Record<string, CellValue>>(cached.dataJson, {});
    const remote = parseJson<Record<string, CellValue>>(cached.remoteDataJson, {});
    const chosen = body.strategy === "useLocal" ? parseValue(conflict.localValue) : remote[conflict.field];
    const nextValues = { ...local, [conflict.field]: chosen };
    const nextRemote = body.strategy === "useLocal" ? { ...remote, [conflict.field]: chosen } : remote;
    await prisma.tableRowCache.update({
      where: { id: cached.id },
      data: {
        dataJson: JSON.stringify(nextValues),
        remoteDataJson: JSON.stringify(nextRemote),
        hash: hashValue(nextValues),
        remoteHash: hashValue(nextRemote),
      },
    });
  }

  await prisma.conflict.update({
    where: { id },
    data: { status: "RESOLVED" },
  });

  return NextResponse.json({ ok: true });
}

function parseValue(value: string | null) {
  if (value == null) return null;
  try {
    return JSON.parse(value) as CellValue;
  } catch {
    return value;
  }
}
