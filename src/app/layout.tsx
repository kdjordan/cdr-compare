import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CDR Reconciliation Tool",
  description: "Professional CDR reconciliation for VoIP carriers - identify billing discrepancies with precision",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
