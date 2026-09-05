import type { Metadata } from "next";
import "./globals.css";
import "./consumer.css";
import "./idea.css";
import "./performance.css";
import "./typography.css";
import "./icons.css";
import "./modern.css";
import "./v19-bridge.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://laizao-next-experience.otis-long2002.chatgpt.site"),
  title: "来造 Next · 让 AI 想法真正发生",
  description: "发现、使用和创造 AI 作品，在一个清晰可信的平台完成想法、合作与交付。",
  icons: { icon: "/brand-icon.jpg", shortcut: "/brand-icon.jpg", apple: "/brand-icon.jpg" },
  openGraph: {
    title: "来造 Next · 让 AI 想法真正发生",
    description: "发现、使用和创造 AI 作品，在一个清晰可信的平台完成想法、合作与交付。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "来造 Next" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
