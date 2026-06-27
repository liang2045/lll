import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const relationSchema = z.object({
  name: z.string().min(1),
  primarySourceId: z.string().min(1),
  secondarySourceId: z.string().min(1),
  primaryField: z.string().min(1),
  secondaryField: z.string().min(1),
  displayFields: z.array(z.string()).default([]),
});

export async function GET() {
  const user = await requireUser();
  const relations = await prisma.relationConfig.findMany({
    where: {
      primarySource: { authUserId: user.id },
      secondarySource: { authUserId: user.id },
    },
    orderBy: { createdAt: "asc" },
    include: {
      primarySource: true,
      secondarySource: true,
    },
  });

  return NextResponse.json({
    relations: relations.map((relation) => ({
      ...relation,
      displayFields: JSON.parse(relation.displayFieldsJson) as string[],
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = relationSchema.parse(await request.json());

  const [primary, secondary] = await Promise.all([
    prisma.sourceConnection.findFirst({
      where: { id: body.primarySourceId, authUserId: user.id },
    }),
    prisma.sourceConnection.findFirst({
      where: { id: body.secondarySourceId, authUserId: user.id },
    }),
  ]);

  if (!primary || !secondary) {
    return NextResponse.json({ error: "Relation source not found" }, { status: 404 });
  }

  const relation = await prisma.relationConfig.create({
    data: {
      name: body.name,
      primarySourceId: body.primarySourceId,
      secondarySourceId: body.secondarySourceId,
      primaryField: body.primaryField,
      secondaryField: body.secondaryField,
      displayFieldsJson: JSON.stringify(body.displayFields),
    },
  });

  return NextResponse.json({ relation }, { status: 201 });
}
