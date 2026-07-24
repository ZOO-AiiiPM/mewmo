import { redirect } from "next/navigation";

/**
 * 密码重置已统一到 /forgot-password 的单页两步流程（输邮箱 → 验证码 + 新密码）。
 * 验证码邮件不再包含 /reset-password 链接，此路由仅为兼容旧书签而保留，直接重定向。
 */
export default function ResetPasswordPage() {
  redirect("/forgot-password");
}
