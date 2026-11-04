import type { Metadata, Viewport } from "next";
import "./tokens.css";
import "./globals.css";
import "./select.css";
import "./workspace.css";
import "./workspace-shell.css";
import "./menu.css";
import "./libraries.css";
import "./sales.css";
import "./expenses.css";
import "./tables.css";
import "./receipt.css";
import { FeedbackProvider } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "LOGO Coffee POS System",
  description: "LOGO Coffee point of sale, menu management, and business reporting.",
  icons: { icon: "/images/LogoWithWhiteStoke.png" },
};

export const viewport: Viewport = { themeColor: "#3B1B12" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/manrope/Manrope-Variable.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
