import type { Metadata, Viewport } from "next";
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

const SITE = "https://alicelabs-voxtutor.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "VoxTutor — by AliceLabs · Tutor de inglés con IA por voz",
  description:
    "VoxTutor, desarrollado por AliceLabs: tutor personal de inglés por voz con memoria persistente. Habla, recibe correcciones en vivo, elige tu voz favorita y progresa sesión a sesión. NVIDIA Nemotron en Nebius Token Factory + Tavily.",
  keywords: [
    "AliceLabs", "VoxTutor", "tutor de inglés", "AI", "voz", "Nemotron", "Nemotron 3",
    "Nebius", "Token Factory", "Tavily", "Next.js", "TypeScript", "speech",
  ],
  authors: [{ name: "AliceLabs" }],
  creator: "AliceLabs",
  publisher: "AliceLabs",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "VoxTutor — by AliceLabs",
    description:
      "Tutor de inglés por voz con memoria persistente: corrige tus errores en vivo, se adapta a tu nivel CEFR y recuerda quién eres. NVIDIA Nemotron en Nebius Token Factory.",
    siteName: "AliceLabs",
    type: "website",
    locale: "es",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "VoxTutor — by AliceLabs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VoxTutor — by AliceLabs",
    description: "Tutor de inglés por voz con memoria persistente. NVIDIA Nemotron + Nebius Token Factory + Tavily.",
    images: ["/og.png"],
  },
  appleWebApp: {
    capable: true,
    title: "VoxTutor",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
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
        {/* Service worker: PWA instalable (solo producción; cachea solo estáticos inmutables) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator && location.protocol === 'https:') {window.addEventListener('load', function () {navigator.serviceWorker.register('/sw.js').catch(function () {});});}",
          }}
        />
      </body>
    </html>
  );
}
