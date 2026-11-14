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
import "./inventory.css";
import "./users.css";
import "./tables.css";
import "./receipt.css";
import "./sign-in.css";
import { LoadingProvider } from "@/components/ui/global-loading-bar";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { NotificationProvider } from "@/components/ui/notification-provider";
import { coffeeBrand } from "@/lib/brand";
import { OfflineIdentityGuard } from "@/components/pos/offline-identity-guard";

export const metadata: Metadata = {
  title: coffeeBrand.name,
  description: coffeeBrand.description,
  applicationName: coffeeBrand.name,
  appleWebApp: { title: coffeeBrand.name },
  icons: {
    icon: [{ url: "/brand/text-icon.svg", type: "image/svg+xml", sizes: "any" }, { url: "/brand/text-icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/brand/text-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#121212" };

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
        <OfflineIdentityGuard />
        <NotificationProvider>
          <LoadingProvider><WorkspaceFrame>{children}</WorkspaceFrame></LoadingProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
