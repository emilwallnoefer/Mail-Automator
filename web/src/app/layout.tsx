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
// Glacier/Sky are light-skin variants: they set data-theme="light" (so the full
// light CSS applies) plus data-mode for the cool-blue paper + accent tint.
const themeBootstrapScript = `try{var t=localStorage.getItem("ma_theme");var d=document.documentElement;if(t==="light"){d.dataset.theme="light";}else if(t==="glacier"||t==="sky"){d.dataset.theme="light";d.dataset.mode=t;}var a=localStorage.getItem("ma_accent_light");d.dataset.accent=(a==="blue")?"blue":"amber";}catch(e){}`;

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
