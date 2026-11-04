import type { Metadata, Viewport } from "next";
import "./tokens.css";
import "./globals.css";
import "./select.css";
import "./calendar.css";
import "./workspace.css";
import "./dialogs.css";
import "./notifications.css";
import "./loading.css";
import "./workspace-shell.css";
import "./menu.css";
import "./libraries.css";
import "./sales.css";
import "./dashboard.css";
import "./expenses.css";
import "./tables.css";
import "./receipt.css";
import { LoadingProvider } from "@/components/ui/global-loading-bar";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { NotificationProvider } from "@/components/ui/notification-provider";

export const metadata: Metadata = {
  title: "Logo",
  description: "Logo Coffee point of sale, menu management, and business reporting.",
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
        <NotificationProvider>
          <LoadingProvider><WorkspaceFrame>{children}</WorkspaceFrame></LoadingProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
