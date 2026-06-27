import { NextResponse } from "next/server";
import { SourceType } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureDemoData } from "@/lib/seed";

export const runtime = "nodejs";

const createSourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum([SourceType.DINGTALK_SHEET, SourceType.DINGTALK_AI_TABLE]),
  documentId: z.string().optional().nullable(),
  workbookId: z.string().optional().nullable(),
  sheetId: z.string().optional().nullable(),
  baseId: z.string().optional().nullable(),
  tableId: z.string().optional().nullable(),
  primaryKeyField: z.string().optional().nullable(),
  syncIntervalSec: z.coerce.number().int().min(10).max(300).default(20),
});

export async function GET() {
  const user = await requireUser();
  await ensureDemoData(user.id);

  const sources = await prisma.sourceConnection.findMany({
    where: { authUserId: user.id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { rows: true, conflicts: true } } },
  });

  return NextResponse.json({ user: { id: user.id, name: user.name }, sources });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = createSourceSchema.parse(await request.json());

  const source = await prisma.sourceConnection.create({
    data: {
      ...body,
      authUserId: user.id,
    },
  });

  return NextResponse.json({ source }, { status: 201 });
}
