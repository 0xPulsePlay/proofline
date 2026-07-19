import type { Metadata } from "next";
import "./globals.css";
import { Legend } from "@/components/Legend";

const title = "Proofline — Finality Control Room";
const description =
  "Sports results, proven once. Settled everywhere. TxLINE → Solana → Wormhole → Chainlink CRE → Base.";

export const metadata: Metadata = {
  metadataBase: new URL("https://proofline-app.vercel.app"),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://proofline-app.vercel.app",
    siteName: "Proofline",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Proofline — Sports results, proven once. Settled everywhere." }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Legend />
      </body>
    </html>
  );
}
