"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { TopBar } from "../../../components/shell/TopBar";
import { useToast } from "../../../components/ui/ToastProvider";
import { setLocaleAction } from "../../../i18n/actions";

interface AccountSettingsUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

interface AccountSettingsClientProps {
  user: AccountSettingsUser;
  hasPassword: boolean;
  loginMethods: string[];
}

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";
type FieldErrors = Partial<Record<PasswordField, string>>;

interface PasswordResponse {
  ok?: boolean;
  error?: string;
  field?: string;
}

const currentPasswordErrorId = "account-current-password-error";
const newPasswordErrorId = "account-new-password-error";
const confirmPasswordErrorId = "account-confirm-password-error";

function isPasswordField(value: string | undefined): value is PasswordField {
  return value === "currentPassword" || value === "newPassword" || value === "confirmPassword";
}

export function AccountSettingsClient({
  user,
  hasPassword,
  loginMethods,
}: AccountSettingsClientProps) {
  const { showToast } = useToast();
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const [localePending, startLocaleTransition] = useTransition();
  const [hasLocalPassword, setHasLocalPassword] = useState(hasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const pendingRef = useRef(false);

  const initial =
    user.name?.charAt(0)?.toUpperCase() ??
    user.email?.charAt(0)?.toUpperCase() ??
    "U";
  const displayName = user.name ?? user.email?.split("@")[0] ?? t("unnamedUser");
  const displayEmail = user.email ?? t("noEmail");
  const passwordTitle = hasLocalPassword ? t("changePassword") : t("setPassword");
  const emailPasswordLabel = t("emailPasswordMethod");
  const displayedLoginMethods =
    hasLocalPassword && !loginMethods.includes(emailPasswordLabel)
      ? [...loginMethods, emailPasswordLabel]
      : loginMethods;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setFieldErrors({});
    setStatusMessage(t("savingPassword"));

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(hasLocalPassword ? { currentPassword } : {}),
          newPassword,
          confirmPassword,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as PasswordResponse;

      if (!response.ok) {
        const message = data.error ?? t("passwordSaveFailed");
        if (isPasswordField(data.field)) {
          setFieldErrors({ [data.field]: message });
        }
        setStatusMessage(message);
        showToast(message, "error");
        return;
      }

      const successMessage = hasLocalPassword ? t("passwordChanged") : t("passwordSet");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasLocalPassword(true);
      setStatusMessage(successMessage);
      showToast(successMessage, "success");
    } catch {
      const message = t("networkError");
      setStatusMessage(message);
      showToast(message, "error");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function handleLocaleChange(newLocale: string) {
    startLocaleTransition(async () => {
      await setLocaleAction(newLocale);
      router.refresh();
    });
  }

  return (
    <div className="mewmo-account-settings-page">
      <TopBar title={t("title")} />
      <main className="mewmo-account-settings">
        <section className="mewmo-account-settings__card" aria-labelledby="account-identity-title">
          <h2 id="account-identity-title">{t("accountInfo")}</h2>
          <div className="mewmo-account-settings__identity">
            <div className="mewmo-account-settings__avatar" aria-hidden="true">
              {user.image ? <img src={user.image} alt="" /> : <span>{initial}</span>}
            </div>
            <div className="mewmo-account-settings__identity-copy">
              <strong>{displayName}</strong>
              <span>{displayEmail}</span>
            </div>
          </div>
          <div className="mewmo-account-settings__methods" aria-label={t("loginMethods")}>
            <span className="mewmo-account-settings__methods-label">{t("loginMethods")}</span>
            <div className="mewmo-account-settings__chips">
              {displayedLoginMethods.map((method) => (
                <span className="mewmo-account-settings__chip" key={method}>
                  {method}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mewmo-account-settings__card" aria-labelledby="account-password-title">
          <div className="mewmo-account-settings__section-heading">
            <h2 id="account-password-title">{passwordTitle}</h2>
            <p>
              {hasLocalPassword
                ? t("changePasswordDesc")
                : t("setPasswordDesc")}
            </p>
          </div>

          <form className="mewmo-account-settings__form" onSubmit={handleSubmit}>
            {hasLocalPassword && (
              <label className="mewmo-account-settings__field">
                <span>{t("currentPassword")}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.currentPassword)}
                  aria-describedby={fieldErrors.currentPassword ? currentPasswordErrorId : undefined}
                  disabled={pending}
                />
                {fieldErrors.currentPassword && (
                  <small id={currentPasswordErrorId}>{fieldErrors.currentPassword}</small>
                )}
              </label>
            )}

            <label className="mewmo-account-settings__field">
              <span>{t("newPassword")}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                aria-describedby={fieldErrors.newPassword ? newPasswordErrorId : undefined}
                disabled={pending}
              />
              {fieldErrors.newPassword && (
                <small id={newPasswordErrorId}>{fieldErrors.newPassword}</small>
              )}
            </label>

            <label className="mewmo-account-settings__field">
              <span>{t("confirmNewPassword")}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? confirmPasswordErrorId : undefined}
                disabled={pending}
              />
              {fieldErrors.confirmPassword && (
                <small id={confirmPasswordErrorId}>{fieldErrors.confirmPassword}</small>
              )}
            </label>

            <button className="mewmo-account-settings__submit" type="submit" disabled={pending}>
              {pending ? t("savingPassword") : passwordTitle}
            </button>
            <p className="mewmo-account-settings__status" aria-live="polite">
              {statusMessage}
            </p>
          </form>
        </section>

        <section className="mewmo-account-settings__card" aria-labelledby="account-language-title">
          <div className="mewmo-account-settings__section-heading">
            <h2 id="account-language-title">{t("languageSection")}</h2>
            <p>{t("languageDesc")}</p>
          </div>
          <div className="mewmo-account-settings__locale-options">
            <button
              type="button"
              className={`mewmo-account-settings__locale-btn ${locale === "zh" ? "mewmo-account-settings__locale-btn--active" : ""}`}
              onClick={() => handleLocaleChange("zh")}
              disabled={localePending}
            >
              {t("languageZh")}
            </button>
            <button
              type="button"
              className={`mewmo-account-settings__locale-btn ${locale === "en" ? "mewmo-account-settings__locale-btn--active" : ""}`}
              onClick={() => handleLocaleChange("en")}
              disabled={localePending}
            >
              {t("languageEn")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
