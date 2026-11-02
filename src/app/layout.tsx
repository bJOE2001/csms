import type { Metadata, Viewport } from "next";
import "./tokens.css";
import "./globals.css";
import "./workspace.css";
import "./workspace-shell.css";
import "./menu.css";
import "./receipt.css";
import { FeedbackProvider } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Coffee POS",
  description: "Simple point of sale and sales tracking for your coffee shop.",
  icons: { icon: "/icons/coffee.svg" },
};

export const viewport: Viewport = { themeColor: "#f7f7f7" };

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
