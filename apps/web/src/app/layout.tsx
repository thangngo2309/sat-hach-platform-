import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { MuiFontProvider } from "@/components/layouts/MuiFontProvider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Quản lý sát hạch lái xe",
  description: "Hệ thống quản lý học viên và kết quả sát hạch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={inter.variable}>
        <MuiFontProvider fontFamily={inter.style.fontFamily}>
          <AuthProvider>{children}</AuthProvider>
        </MuiFontProvider>
      </body>
    </html>
  );
}
