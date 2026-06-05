import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050505",
};

export const metadata: Metadata = {
  title: "ThoughtKeeper",
  description: "Your second brain for fleeting thoughts.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ThoughtKeeper",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);var c=localStorage.getItem('colorTheme')||'pink';var v={pink:{dark:{'--accent':'#f472b6','--accent-dim':'rgba(244,114,182,0.15)','--highlight':'rgba(244,114,182,0.06)','--user-bubble-bg':'rgba(244,114,182,0.08)','--user-bubble-border':'rgba(244,114,182,0.15)','--focus-color':'rgba(244,114,182,0.5)','--input-focus-border':'rgba(244,114,182,0.3)','--input-focus-glow':'rgba(244,114,182,0.07)'},light:{'--accent':'#db2777','--accent-dim':'rgba(219,39,119,0.12)','--highlight':'rgba(219,39,119,0.05)','--user-bubble-bg':'rgba(219,39,119,0.07)','--user-bubble-border':'rgba(219,39,119,0.18)','--focus-color':'rgba(219,39,119,0.5)','--input-focus-border':'rgba(219,39,119,0.4)','--input-focus-glow':'rgba(219,39,119,0.1)'}},mint:{dark:{'--accent':'#50dca5','--accent-dim':'rgba(80,220,165,0.15)','--highlight':'rgba(80,220,165,0.06)','--user-bubble-bg':'rgba(80,220,165,0.08)','--user-bubble-border':'rgba(80,220,165,0.15)','--focus-color':'rgba(80,220,165,0.5)','--input-focus-border':'rgba(80,220,165,0.3)','--input-focus-glow':'rgba(80,220,165,0.07)'},light:{'--accent':'#1a9960','--accent-dim':'rgba(26,153,96,0.12)','--highlight':'rgba(26,153,96,0.05)','--user-bubble-bg':'rgba(26,153,96,0.07)','--user-bubble-border':'rgba(26,153,96,0.18)','--focus-color':'rgba(26,153,96,0.5)','--input-focus-border':'rgba(26,153,96,0.4)','--input-focus-glow':'rgba(26,153,96,0.1)'}},plain:{dark:{'--accent':'#a0a0aa','--accent-dim':'rgba(160,160,170,0.15)','--highlight':'rgba(160,160,170,0.06)','--user-bubble-bg':'rgba(160,160,170,0.08)','--user-bubble-border':'rgba(160,160,170,0.15)','--focus-color':'rgba(160,160,170,0.5)','--input-focus-border':'rgba(160,160,170,0.3)','--input-focus-glow':'rgba(160,160,170,0.07)'},light:{'--accent':'#6b7280','--accent-dim':'rgba(107,114,128,0.12)','--highlight':'rgba(107,114,128,0.05)','--user-bubble-bg':'rgba(107,114,128,0.07)','--user-bubble-border':'rgba(107,114,128,0.18)','--focus-color':'rgba(107,114,128,0.5)','--input-focus-border':'rgba(107,114,128,0.4)','--input-focus-glow':'rgba(107,114,128,0.1)'}},sunset:{dark:{'--accent':'#f97316','--accent-dim':'rgba(249,115,22,0.15)','--highlight':'rgba(249,115,22,0.06)','--user-bubble-bg':'rgba(249,115,22,0.08)','--user-bubble-border':'rgba(249,115,22,0.15)','--focus-color':'rgba(249,115,22,0.5)','--input-focus-border':'rgba(249,115,22,0.3)','--input-focus-glow':'rgba(249,115,22,0.07)'},light:{'--accent':'#ea580c','--accent-dim':'rgba(234,88,12,0.12)','--highlight':'rgba(234,88,12,0.05)','--user-bubble-bg':'rgba(234,88,12,0.07)','--user-bubble-border':'rgba(234,88,12,0.18)','--focus-color':'rgba(234,88,12,0.5)','--input-focus-border':'rgba(234,88,12,0.4)','--input-focus-glow':'rgba(234,88,12,0.1)'}},sky:{dark:{'--accent':'#a855f7','--accent-dim':'rgba(168,85,247,0.15)','--highlight':'rgba(168,85,247,0.06)','--user-bubble-bg':'rgba(168,85,247,0.08)','--user-bubble-border':'rgba(168,85,247,0.15)','--focus-color':'rgba(168,85,247,0.5)','--input-focus-border':'rgba(168,85,247,0.3)','--input-focus-glow':'rgba(168,85,247,0.07)'},light:{'--accent':'#7c3aed','--accent-dim':'rgba(124,58,237,0.12)','--highlight':'rgba(124,58,237,0.05)','--user-bubble-bg':'rgba(124,58,237,0.07)','--user-bubble-border':'rgba(124,58,237,0.18)','--focus-color':'rgba(124,58,237,0.5)','--input-focus-border':'rgba(124,58,237,0.4)','--input-focus-glow':'rgba(124,58,237,0.1)'}},clouds:{dark:{'--accent':'#38bdf8','--accent-dim':'rgba(56,189,248,0.15)','--highlight':'rgba(56,189,248,0.06)','--user-bubble-bg':'rgba(56,189,248,0.08)','--user-bubble-border':'rgba(56,189,248,0.15)','--focus-color':'rgba(56,189,248,0.5)','--input-focus-border':'rgba(56,189,248,0.3)','--input-focus-glow':'rgba(56,189,248,0.07)'},light:{'--accent':'#0284c7','--accent-dim':'rgba(2,132,199,0.12)','--highlight':'rgba(2,132,199,0.05)','--user-bubble-bg':'rgba(2,132,199,0.07)','--user-bubble-border':'rgba(2,132,199,0.18)','--focus-color':'rgba(2,132,199,0.5)','--input-focus-border':'rgba(2,132,199,0.4)','--input-focus-glow':'rgba(2,132,199,0.1)'}}};var s=v[c]&&v[c][t]||v.pink[t];var d=document.documentElement;for(var k in s)d.style.setProperty(k,s[k])})()`,
          }}
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
