import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AuthProvider } from "@/components/auth/AuthProvider";

import "./globals.css";

/**
 * Font Inter dùng chung cho toàn bộ website.
 *
 * Next.js tự quản lý font và cung cấp file font
 * từ ứng dụng khi triển khai production.
 *
 * Đồng bộ hiển thị giữa macOS và Windows.
 */
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
