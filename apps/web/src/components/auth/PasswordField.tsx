"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** 认证表单的密码输入框：内置「眼睛」按钮，可切换明文/密文显示。
 * 保持非受控（依赖 name + FormData），仅本地管理可见性状态。 */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="mewmo-auth-password">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="mewmo-auth-eye"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a15.5 15.5 0 0 1-3.4 4.1M6.3 6.8A15.7 15.7 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.2-.95" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
