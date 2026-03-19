import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { OctopusBackground } from "@/components/layout/OctopusBackground";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Optive",
  description: "Optive AI Agent Platform",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${inter.className} bg-[#0B0914] text-white min-h-screen`}>
        <AuthProvider>
          <AppNavbar />
          <OctopusBackground />
          <div className="relative z-10">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
