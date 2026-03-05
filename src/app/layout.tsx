import type { Metadata } from "next";
import "./globals.css";
import { ReconciliationProvider } from "@/context/ReconciliationContext";

const siteUrl = "https://cdrcheck.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "CDRCheck - CDR Reconciliation Tool for VoIP Carriers",
    template: "%s | CDRCheck",
  },
  description:
    "Free CDR reconciliation tool for VoIP carriers. Compare call detail records, identify billing discrepancies, and detect missing calls in seconds. Process millions of records instantly.",
  keywords: [
    "CDR reconciliation",
    "call detail records",
    "VoIP billing",
    "telecom billing",
    "CDR comparison",
    "billing discrepancy",
    "VoIP carrier tools",
    "wholesale VoIP",
    "CDR matching",
    "telecom reconciliation",
  ],
  authors: [{ name: "CDRCheck" }],
  creator: "CDRCheck",
  publisher: "CDRCheck",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "CDRCheck",
    title: "CDRCheck - CDR Reconciliation Tool for VoIP Carriers",
    description:
      "Free CDR reconciliation tool for VoIP carriers. Compare call detail records, identify billing discrepancies, and detect missing calls in seconds.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "CDRCheck - CDR Reconciliation Tool",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CDRCheck - CDR Reconciliation Tool for VoIP Carriers",
    description:
      "Free CDR reconciliation tool for VoIP carriers. Compare call detail records and identify billing discrepancies in seconds.",
    images: ["/og-image.svg"],
  },
  alternates: {
    canonical: siteUrl,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "CDRCheck",
  description:
    "Free CDR reconciliation tool for VoIP carriers. Compare call detail records, identify billing discrepancies, and detect missing calls in seconds.",
  url: "https://cdrcheck.com",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "CDR comparison and matching",
    "Billing discrepancy detection",
    "Missing call identification",
    "Rate mismatch analysis",
    "Duration variance reporting",
    "CSV and XLSX file support",
    "Process millions of records",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">
        <ReconciliationProvider>
          {children}
        </ReconciliationProvider>
      </body>
    </html>
  );
}
