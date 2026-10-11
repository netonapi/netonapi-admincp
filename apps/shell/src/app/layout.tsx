import type { Metadata } from "next";
import { BuildUpdateGuard } from "@/components/build-update-guard";
import { Providers } from "@/components/providers";
import "./globals.css";

// 构建期品牌（NEXT_PUBLIC_NETON_BRAND_*）；运行期的站点名由 useBrand() 读取后覆盖浏览器标题。
const brandName = process.env.NEXT_PUBLIC_NETON_BRAND_NAME?.trim() || "Neton";
export const metadata: Metadata = {
  title: { default: brandName, template: `%s · ${brandName}` },
  description: process.env.NEXT_PUBLIC_NETON_BRAND_DESCRIPTION?.trim() || undefined,
};
const defaultLocale = process.env.NEXT_PUBLIC_NETON_DEFAULT_LOCALE?.trim() || "zh-CN";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang 先给默认语言，I18nProvider 挂载后按用户选择更新。
    <html lang={defaultLocale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('neton-front-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <Providers>
          {children}
          <BuildUpdateGuard />
        </Providers>
      </body>
    </html>
  );
}
