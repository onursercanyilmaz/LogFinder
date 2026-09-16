import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogFinder — AI Destekli Log Bulucu",
  description: "BYOK AI destekli Elasticsearch log arama",
};

// FOUC önleme: React hydration'dan önce kayıtlı/sistem temasını uygular.
const THEME_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem('logfinder-v1')||'{}');var m=(s.state&&s.state.theme)||'system';var r=m==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):m;document.documentElement.dataset.theme=r;document.documentElement.style.colorScheme=r;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
