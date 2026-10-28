import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Press_Start_2P } from "next/font/google";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { EmulatorBanner } from "@/components/EmulatorBanner";
import { AuthProvider } from "@/lib/firebase/auth";
import "./globals.css";

const bodyFont = IBM_Plex_Sans_Thai({
  variable: "--font-body",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
});

const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Retro Room",
  description: "Sprint retrospective board for your team",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${bodyFont.variable} ${pixelFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <EmulatorBanner />
        <BackgroundMusic />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
