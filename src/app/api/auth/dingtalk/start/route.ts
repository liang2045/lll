import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildDingTalkAuthorizeUrl } from "@/lib/dingtalk";
import { env } from "@/lib/env";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (env.isMock) {
    const user = await prisma.user.upsert({
      where: { dingUserId: "mock-user" },
      update: { name: "Demo DingTalk User" },
      create: {
        dingUserId: "mock-user",
        name: "Demo DingTalk User",
        accessToken: "mock-access-token",
      },
    });
    await setSession(user.id);
    return NextResponse.redirect(new URL("/", request.url));
  }

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildDingTalkAuthorizeUrl(state));
  response.cookies.set("dta_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
