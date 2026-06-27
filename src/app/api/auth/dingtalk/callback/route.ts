import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeCodeForDingTalkUser } from "@/lib/dingtalk";
import { env } from "@/lib/env";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "mock-code";
  const state = url.searchParams.get("state");

  if (!env.isMock) {
    const cookieState = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("dta_oauth_state="))
      ?.split("=")[1];
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
    }
  }

  const dingUser = await exchangeCodeForDingTalkUser(code);
  const user = await prisma.user.upsert({
    where: { dingUserId: dingUser.dingUserId },
    update: { name: dingUser.name, accessToken: dingUser.accessToken },
    create: {
      dingUserId: dingUser.dingUserId,
      name: dingUser.name,
      accessToken: dingUser.accessToken,
    },
  });

  await setSession(user.id);
  return NextResponse.redirect(new URL("/", request.url));
}
