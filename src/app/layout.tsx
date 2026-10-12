import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/lora";
import "@fontsource-variable/caveat";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bookit — Every chapter is yours",
  description:
    "A little space for your thoughts. Create personal books, collect life's lessons, and make every page your own.",
  applicationName: "Bookit",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bookit" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{document.documentElement.dataset.theme=localStorage.getItem("bookit-theme-v1")==="dark"?"dark":"light"}catch{}})()',
          }}
        />
        {children}
      </body>
    </html>
  );
}
