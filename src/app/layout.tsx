import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/manrope/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forma — Treino com intenção",
  description: "Seu treino, em equilíbrio. Planeje, registre e evolua com um catálogo por facetas, volume ponderado e recuperação inteligente. A decisão é sempre sua.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body><a className="skip-link" href="#main-content">Pular para o conteúdo</a>{children}</body></html>;
}
