import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  const conflicts = await prisma.conflict.findMany({
    where: {
      status: "OPEN",
      source: { authUserId: user.id },
    },
    orderBy: { createdAt: "desc" },
    include: { source: true },
  });

  return NextResponse.json({ conflicts });
}
