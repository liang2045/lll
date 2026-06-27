import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { patchRowWithConflictDetection } from "@/lib/sync";

export const runtime = "nodejs";

const patchSchema = z.object({
  patch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  expectedHash: z.string().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; rowId: string }> },
) {
  const user = await requireUser();
  const { id, rowId } = await context.params;
  const body = patchSchema.parse(await request.json());

  const source = await prisma.sourceConnection.findFirst({
    where: { id, authUserId: user.id },
  });

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (source.type === "DINGTALK_SHEET" && !source.primaryKeyField) {
    return NextResponse.json(
      { error: "普通钉钉表格需要配置稳定主键列后才能写入。" },
      { status: 422 },
    );
  }

  const result = await patchRowWithConflictDetection({
    source,
    user,
    rowId,
    patch: body.patch,
    expectedHash: body.expectedHash,
  });

  if (result.status === "conflict") {
    return NextResponse.json({ status: "conflict" }, { status: 409 });
  }

  return NextResponse.json(result);
}
