"use server";

import { cookies } from "next/headers";
import { locales, type Locale } from "./routing";

export async function setLocaleAction(locale: string) {
  if (!locales.includes(locale as Locale)) return;
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
}
