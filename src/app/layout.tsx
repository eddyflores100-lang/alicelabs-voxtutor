import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VoxTutor — by AliceLabs · Tutor de inglés con IA por voz",
  description: "VoxTutor, desarrollado por AliceLabs: tutor personal de inglés por voz con memoria persistente. Habla, recibe correcciones en vivo y progresa sesión a sesión.",
  keywords: ["AliceLabs", "VoxTutor", "tutor de inglés", "AI", "voz", "Nemotron", "Nebius", "Next.js", "TypeScript"],
  authors: [{ name: "AliceLabs" }],
  creator: "AliceLabs",
  publisher: "AliceLabs",
  openGraph: {
    title: "VoxTutor — by AliceLabs",
    description: "Tutor personal de inglés por voz con memoria persistente, hecho por AliceLabs.",
    siteName: "AliceLabs",
    type: "website",
    locale: "es",
  },
  twitter: {
    card: "summary_large_image",
    title: "VoxTutor — by AliceLabs",
    description: "Tutor personal de inglés por voz con memoria persistente, hecho por AliceLabs.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
