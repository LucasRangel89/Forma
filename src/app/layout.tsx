import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
export const metadata: Metadata = {
  title: "Forma — Treino com intenção",
  description: "Seu treino, em equilíbrio. Planeje, registre e evolua com um catálogo por facetas, volume ponderado e recuperação inteligente. A decisão é sempre sua.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body className={`${dmSans.variable} ${manrope.variable}`}><a className="skip-link" href="#main-content">Pular para o conteúdo</a>{children}</body></html>;
}
