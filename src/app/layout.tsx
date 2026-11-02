import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";
import "./overview.css";
import { ServiceWorkerRegistration } from "./sw-register";

export const metadata: Metadata = {
  title: "Coffee Shop Management System",
  description: "A careful, offline-ready workspace for preparing and operating your coffee shop.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/coffee.svg" },
};

export const viewport: Viewport = { themeColor: "#f6f4ef" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ServiceWorkerRegistration />{children}</body></html>;
}
