import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { PlatformAtmosphere } from "@/components/layout/PlatformAtmosphere";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      <body className={`${heebo.className} min-h-screen overflow-x-hidden`}>
        <ThemeProvider>
          <AuthProvider>
            <PlatformAtmosphere />
            <AppNavbar />
            <div className="relative z-10">
              {children}
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
