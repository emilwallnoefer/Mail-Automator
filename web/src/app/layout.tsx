import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flya Allrounder",
  description: "Flyability internal allround workspace for mail automation and time tracking.",
};

// Runs before hydration so light-mode users don't flash dark on first paint.
const themeBootstrapScript = `try{var t=localStorage.getItem("ma_theme");if(t==="light")document.documentElement.dataset.theme="light";var a=localStorage.getItem("ma_accent_light");document.documentElement.dataset.accent=(a==="blue")?"blue":"amber";}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
