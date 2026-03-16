import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: "国会ラボ – 今日の国会2分まとめ",
    template: "%s | 国会ラボ",
  },
  description:
    "国立国会図書館の会議録検索システムを汻用し、毎日の国会審議をAIが構造化要約します。根拨・影響・未解決点を明示。",
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "国会ラボ",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <NavBar />
        <main className="min-h-screen bg-slate-50">{children}</main>
        <footer className="border-t bg-white py-8 text-center text-sm text-slate-500">
          <div className="max-w-5xl mx-auto px-4">
            <p>
              データ出具:{" "}
              <a
                href="https://kokkai.ndl.go.jp/"
                className="underline hover:text-slate-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                国朋国会囸書館 国会会議録検索システム              </a>
            </p>
            <p className="mt-1">
              要約はAIが自動生成。原文は各リンクよりご確認ください。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
