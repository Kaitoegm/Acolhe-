import type { Metadata } from "next";
import "./globals.css";
import "./instructor.css";
import "./evaluation.css";
export const metadata: Metadata = {
  title: "Acolhe+ | Simulação de acolhimento",
  description:
    "Ambiente de aprendizagem de escuta inicial na atenção primária.",
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
