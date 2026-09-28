import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Archivo, Anton } from "next/font/google";
import Nav from "./nav";
import AssistantWidget from "@/components/AssistantWidget";

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
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <Nav />
        {children}
        <AssistantWidget />
      </body>
    </html>
  );
}
