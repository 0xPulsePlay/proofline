import type { Metadata } from "next";
import "./globals.css";
import { Legend } from "@/components/Legend";

export const metadata: Metadata = {
  title: "Proofline — Finality Control Room",
  description:
    "Sports results, proven once. Settled everywhere. TxLINE → Solana → Wormhole → Chainlink CRE → Base.",
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
