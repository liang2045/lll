import { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { syncSource } from "@/lib/sync";

export async function ensureDemoData(userId: string) {
  const existing = await prisma.sourceConnection.count({ where: { authUserId: userId } });
  if (existing > 0) return;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const sheet = await prisma.sourceConnection.create({
    data: {
      authUserId: userId,
      name: "销售漏斗表",
      type: SourceType.DINGTALK_SHEET,
      workbookId: "mock-workbook",
      sheetId: "mock-sheet",
      primaryKeyField: "customer",
    },
  });

  const aiTable = await prisma.sourceConnection.create({
    data: {
      authUserId: userId,
      name: "AI 风险跟进表",
      type: SourceType.DINGTALK_AI_TABLE,
      baseId: "mock-base",
      tableId: "mock-table",
    },
  });

  await syncSource(sheet, user);
  await syncSource(aiTable, user);

  await prisma.relationConfig.create({
    data: {
      name: "客户风险关联",
      primarySourceId: sheet.id,
      secondarySourceId: aiTable.id,
      primaryField: "customer",
      secondaryField: "customer",
      displayFieldsJson: JSON.stringify(["owner", "stage", "amount", "priority", "risk", "score"]),
    },
  });
}
