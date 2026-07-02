import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

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

// Browser-chrome tint follows the account's saved skin (page-bg tokens:
// dark #020617, light paper #fcfaf5, glacier-blue page #f7fafd).
export async function generateViewport(): Promise<Viewport> {
  const { theme } = await resolveServerAppearance();
  return {
    themeColor: theme === "blue" ? "#f7fafd" : theme === "light" ? "#fcfaf5" : "#020617",
  };
}

// Pre-hydration fallback for signed-out pages (and signed-in users who never saved
// a preference): read the device-local cache and apply before first paint so light
// users don't flash dark. When the server already applied the account preference
// (data-appearance-source="server"), this instead syncs the localStorage cache to
// the server truth so the two never drift.
const themeBootstrapScript = `try{var d=document.documentElement;if(d.getAttribute("data-appearance-source")==="server"){var t=d.dataset.mode==="blue"?"blue":(d.dataset.theme==="light"?"light":"dark");localStorage.setItem("ma_theme",t);if(d.dataset.accent)localStorage.setItem("ma_accent_light",d.dataset.accent);}else{var s=localStorage.getItem("ma_theme");if(s==="glacier"||s==="sky")s="blue";if(s==="light"){d.dataset.theme="light";}else if(s==="blue"){d.dataset.theme="light";d.dataset.mode="blue";}var a=localStorage.getItem("ma_accent_light");d.dataset.accent=(a==="blue")?"blue":"amber";}}catch(e){}`;

type Appearance = { theme: "dark" | "light" | "blue" | null; accent: "amber" | "blue" };

// Resolve the signed-in user's saved appearance from the JWT claims (no Auth-server
// round-trip — middleware already validated the session for this request).
async function resolveServerAppearance(): Promise<Appearance> {
  const fallback: Appearance = { theme: null, accent: "amber" };
  if (!isSupabaseConfigured()) return fallback;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const meta = data?.claims?.user_metadata;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return fallback;
    const m = meta as Record<string, unknown>;
    const t = m.appearance_theme;
    const a = m.appearance_accent;
    return {
      theme: t === "dark" || t === "light" || t === "blue" ? t : null,
      accent: a === "blue" ? "blue" : "amber",
    };
  } catch {
    return fallback;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { theme, accent } = await resolveServerAppearance();

  // When the account has a saved theme, apply it as data-* on <html> at SSR time
  // (authoritative, no flash) and flag the source so the bootstrap reconciles
  // localStorage instead of overriding. Otherwise leave it to the bootstrap.
  const htmlProps: Record<string, string> = { lang: "en" };
  if (theme) {
    htmlProps["data-appearance-source"] = "server";
    htmlProps["data-accent"] = accent;
    if (theme === "light") {
      htmlProps["data-theme"] = "light";
    } else if (theme === "blue") {
      htmlProps["data-theme"] = "light";
      htmlProps["data-mode"] = "blue";
    }
    // dark = absence of data-theme/data-mode
  }

  return (
    <html {...htmlProps} suppressHydrationWarning>
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
