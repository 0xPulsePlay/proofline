import type { Metadata } from "next";
import "./story.css";

const title = "Proofline — The submission story";
const description =
  "How two independent lanes prove one sports result across chains — TxLINE, Solana mainnet, Wormhole, and Base, with every number on-chain checkable.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://proofline-app.vercel.app/story",
    siteName: "Proofline",
    images: [{ url: "/story/og.png", width: 1200, height: 630, alt: "Proofline — the submission story" }],
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/story/og.png"],
  },
};

export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return <div className="story">{children}</div>;
}
