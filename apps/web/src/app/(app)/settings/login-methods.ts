function localizeProvider(provider: string) {
  if (provider === "google") return "Google 登录";
  if (provider === "password") return "邮箱密码";
  if (provider === "email" || provider === "resend") return "邮箱登录";
  return null;
}

export function getLocalizedLoginMethods({
  hasPassword,
  email,
  providers,
}: {
  hasPassword: boolean;
  email: string | null;
  providers: string[];
}) {
  const hasGoogle = providers.includes("google");
  const methods = [
    ...(hasPassword ? ["邮箱密码"] : []),
    ...providers.flatMap((provider) => {
      const method = localizeProvider(provider);
      return method ? [method] : [];
    }),
  ];

  // Auth.js Resend sign-in does not create an Account row.
  if (!hasPassword && !hasGoogle && providers.length === 0 && email) {
    methods.push("邮箱登录");
  }

  return Array.from(new Set(methods));
}
