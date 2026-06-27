export const env = {
  isMock: process.env.DINGTALK_MOCK !== "0",
  dingTalk: {
    clientId: process.env.DINGTALK_CLIENT_ID ?? "",
    clientSecret: process.env.DINGTALK_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.DINGTALK_REDIRECT_URI ??
      "http://localhost:3000/api/auth/dingtalk/callback",
    authorizeUrl:
      process.env.DINGTALK_OAUTH_AUTHORIZE_URL ??
      "https://login.dingtalk.com/oauth2/auth",
    apiBaseUrl: process.env.DINGTALK_API_BASE_URL ?? "https://api.dingtalk.com",
  },
};
