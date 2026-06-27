import type { ReactNode } from "react";
import { ThemeProvider } from "../lib/theme";
import "./globals.css";

export const metadata = {
  title: "mewmo",
  description: "AI-powered knowledge workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
