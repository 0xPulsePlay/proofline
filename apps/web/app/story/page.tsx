"use client";
/**
 * /story — the flagship hackathon submission page: blog post × infographic ×
 * technical overview. Built to be read in ~3 minutes. Every data visual here
 * is real HTML/SVG driven by real values (apps/web/lib/story-data.ts,
 * evidence/mainnet/, README.md's honesty table); the generated images under
 * public/story/ are purely atmospheric.
 */
import { StoryTopBar } from "@/components/story/StoryTopBar";
import { Hero } from "@/components/story/Hero";
import { RiskTriad } from "@/components/story/RiskTriad";
import { HowItWorks } from "@/components/story/HowItWorks";
import { MainnetEvidence } from "@/components/story/MainnetEvidence";
import { LiveFinal } from "@/components/story/LiveFinal";
import { HonestyPanel } from "@/components/story/HonestyPanel";
import { Close } from "@/components/story/Close";
import { SectionImage } from "@/components/story/SectionImage";
import { Reveal } from "@/components/story/Reveal";

export default function StoryPage() {
  return (
    <div className="shell">
      <StoryTopBar />

      <Hero />
      <Reveal>
        <RiskTriad />
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <SectionImage
          src="/story/merkle.png"
          alt="A lattice of interlocking hexagonal Merkle-tree nodes branching upward into a single glowing root"
          caption="TxLINE's mainnet daily root — every proof this page cites traces back to one of these."
        />
      </Reveal>

      <Reveal>
        <MainnetEvidence />
      </Reveal>

      <Reveal>
        <SectionImage
          src="/story/guardian-ring.png"
          alt="A ring of nineteen glowing sentinel nodes around a central bright core"
          caption="The 19-key Wormhole guardian set — dev set today, same on-chain ecrecover math a real quorum would run."
        />
      </Reveal>

      <Reveal>
        <LiveFinal />
      </Reveal>

      <Reveal>
        <SectionImage
          src="/story/bridge.png"
          alt="An abstract bridge of glowing light beams connecting two distant chain-link towers"
          caption="Solana mainnet to Base — two chains, one attestation id."
        />
      </Reveal>

      <Reveal>
        <HonestyPanel />
      </Reveal>

      <Reveal>
        <Close />
      </Reveal>
    </div>
  );
}
