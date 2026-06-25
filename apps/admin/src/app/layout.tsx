import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "mewmo admin",
  description: "mewmo admin app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
