import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ActiveSessionBar } from "@/components/ActiveSessionBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gym Bro",
  description: "Your workout routine, tracked set by set.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Gym Bro" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Installed on iOS there is no browser chrome, and viewportFit:"cover"
          lets us draw under the status bar — so every page needs the top inset
          or the first row of controls sits beneath the clock. */}
      <body className="flex min-h-full flex-col pt-[env(safe-area-inset-top)] text-zinc-100">
        <ServiceWorkerRegistrar />
        {children}
        <ActiveSessionBar />
      </body>
    </html>
  );
}
