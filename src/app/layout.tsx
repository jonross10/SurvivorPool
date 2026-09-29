import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo, Anton } from "next/font/google";
import { TopNav, BottomNav } from "./nav";

// Athletic broadcast pairing: Anton for big scoreboard display, Archivo for UI/body.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-sans" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Survivor Assistant",
  description: "NFL survivor pool picks, win probabilities, and results",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0d12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${anton.variable}`}>
      {/* App shell: fixed-height flex column so the nav bars stay put and the content
          area scrolls internally. Avoids the mobile 100dvh/padding math that broke the
          full-height chat page. */}
      <body className="flex h-dvh flex-col overflow-hidden bg-bg font-sans text-fg antialiased">
        <TopNav />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
