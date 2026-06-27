import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readRemoteSchema } from "@/lib/dingtalk";

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

  const columns = await readRemoteSchema(source, user.accessToken);
  return NextResponse.json({ sourceId: source.id, columns });
}
