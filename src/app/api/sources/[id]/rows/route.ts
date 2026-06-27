import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readRemoteSchema } from "@/lib/dingtalk";
import { prisma } from "@/lib/db";
import { getCachedRows, syncSource } from "@/lib/sync";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const source = await prisma.sourceConnection.findFirst({
    where: { id, authUserId: user.id },
  });

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const now = Date.now();
  const lastSyncedAt = source.lastSyncedAt?.getTime() ?? 0;
  const shouldSync = now - lastSyncedAt > source.syncIntervalSec * 1000;
  const cachedCount = await prisma.tableRowCache.count({ where: { sourceId: source.id } });

  if (shouldSync || cachedCount === 0) {
    await syncSource(source, user);
  }

  const [columns, rows, freshSource] = await Promise.all([
    readRemoteSchema(source, user.accessToken),
    getCachedRows(source.id),
    prisma.sourceConnection.findUnique({ where: { id: source.id } }),
  ]);

  return NextResponse.json({
    source: freshSource,
    table: { sourceId: source.id, sourceType: source.type, columns, rows },
  });
}
