import type { Metadata } from "next";
import "./globals.css";
import { Nav, HonestyFooter } from "@/components/chrome";

export const metadata: Metadata = {
  title: "Proofline — proven once, settled everywhere",
  description:
    "Oracle-attested match-outcome settlement: TxLINE proofs verified on Solana, carried by Wormhole, finalized on Base — two lanes, one digest.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
        <HonestyFooter />
      </body>
    </html>
  );
}
