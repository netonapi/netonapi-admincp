import type { Metadata } from "next";
import { BuildUpdateGuard } from "@/components/build-update-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Neton Control", template: "%s · Neton Control" },
  description: "Neton Application Front management surface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('neton-front-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        {children}
        <BuildUpdateGuard />
      </body>
    </html>
  );
}
