import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "dta_session";

export async function setSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionUserId) {
    const user = await prisma.user.findUnique({ where: { id: sessionUserId } });
    if (user) return user;
  }

  if (process.env.DINGTALK_MOCK === "0") {
    return null;
  }

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
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
