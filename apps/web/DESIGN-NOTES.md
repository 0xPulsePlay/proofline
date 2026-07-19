# DESIGN-NOTES — Proofline K3 blank-slate rebuild

**Information architecture.** Every page is an archival exhibit: a numbered
`SectionIndex` (01, 02, 03…) divides `Plate`s — engraved evidence plates with
corner ticks. Chrome is a single fixed `Nav` + a permanent `HonestyFooter`
carrying the REAL/SIMULATED legend verbatim on every page.

**Novel components (all bespoke, drawn for this domain):**
- `ConvergingRails` — dual-lane finality race: two tracks converge on one
  digest seal; lit nodes are real RelayEvents, dashed = simulated legs.
- `SealChain` — attestation timeline as a chain of sealed blocks whose links
  draw themselves; simulated blocks get dashed seals (honesty is structural).
- `MerkleCollapse` — Merkle verification as an animated tree collapse to the
  root (score leaves → root hash).
- `SigningRing` — guardian signatures as a ring that fills seat by seat to
  the 13-of-19 quorum.
- `ProofPathDraw` — the proof path draws itself: bundle → instruction → root
  → the TRUE stamp (mainnet exhibit).
- `RecordSpine` — TxLINE's deterministic recording as a vertical spine that
  seals downward; the FINAL record lands as a wax-seal node.
- `LaneFork` — two derivation lanes converge onto one digest node (dual
  finality) on the attestation dossier.
- `DigestResolve` — the attestation id crystallizes out of hex noise.
- `ByteDissect`, `LoomDiagram`, `GateCascade` — payload dissection, the
  five-stage wiring loom, and the tamper-lab check cascade that slams shut
  on the contract's real revert.

**Motion system.** framer-motion (already in package.json). Springs
(stiffness 160–300, damping 14–28) for seals/stamps landing; `pathLength`
draws for rails/spines; staggered `Reveal` on scroll (`whileInView`, once).
Everything is transform/opacity — 60fps-cheap. `useReducedMotion()` per
component plus a global `prefers-reduced-motion` CSS kill-switch: all motion
becomes instant, never absent (content is never motion-gated).

**Why.** Rich ≠ busy: each animation explains one real thing — convergence
= digest equality, drawing = sequencing, dashed = simulated. The honesty
labels are the visual system, not a footnote.
