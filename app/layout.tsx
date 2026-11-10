import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { EmulatorBanner } from "@/components/EmulatorBanner";
import { AuthProvider } from "@/lib/firebase/auth";
import "./globals.css";

const bodyFont = IBM_Plex_Sans_Thai({
  variable: "--font-body",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
});

/**
 * TA GBA monothai MAX (SIL OFL 1.1, TA Font; license in app/fonts/OFL.txt). A Thai and Latin pixel font drawn on a
 * 16 pixel grid per em, so it is sharp at font sizes that are multiples of 16 px (D125).
 */
const pixelFont = localFont({
  src: "./fonts/TA-GBA-monothai-MAX.ttf",
  variable: "--font-pixel",
  weight: "400",
  display: "swap",
  fallback: ["monospace"],
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
