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
import "./tables.css";
import "./receipt.css";
import "./sign-in.css";
import { LoadingProvider } from "@/components/ui/global-loading-bar";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { NotificationProvider } from "@/components/ui/notification-provider";
import { coffeeBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: coffeeBrand.name, template: `%s | ${coffeeBrand.name}` },
  description: coffeeBrand.description,
  applicationName: coffeeBrand.name,
  appleWebApp: { title: coffeeBrand.name },
  icons: {
    icon: [{ url: "/brand/favicon.ico", sizes: "16x16 32x32 48x48" }, { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
