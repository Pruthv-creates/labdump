import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "LabDump — Zero-Trace File & Text Sharing",
  description: "Share files and notes instantly. No login. No trace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexMono.variable} h-full antialiased font-mono bg-[#E8E6E1] text-[#000000]`}
    >
      <body className="min-h-full flex flex-col font-mono bg-[#E8E6E1] text-[#000000]">{children}</body>
    </html>
  );
}
