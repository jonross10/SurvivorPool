import "./globals.css";
import { Inter } from "next/font/google";
import Nav from "./nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
