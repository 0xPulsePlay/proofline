/**
 * Inline SVG icon set — one consistent 1.5px stroke, 24 viewBox.
 * Drawn for this build; no emoji, no icon dependency.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** brand glyph — two lanes converging into a single point */
export function GlyphConverge(p: P) {
  return base(
    { size: 22, ...p },
    <>
      <path d="M3 5 L15 12" />
      <path d="M3 19 L15 12" />
      <path d="M15 12 L21 12" strokeWidth={2.2} />
      <circle cx="21" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>,
  );
}

export function IconPlay(p: P) {
  return base(p, <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" stroke="none" />);
}
export function IconPause(p: P) {
  return base(
    p,
    <>
      <path d="M7 4.5 V19.5" strokeWidth={2.4} />
      <path d="M17 4.5 V19.5" strokeWidth={2.4} />
    </>,
  );
}
export function IconRestart(p: P) {
  return base(
    p,
    <>
      <path d="M4 12 a8 8 0 1 1 2.3 5.7" />
      <path d="M6 18.5 V13 H11.5" />
    </>,
  );
}
export function IconShield(p: P) {
  return base(
    p,
    <>
      <path d="M12 3 L20 6 V11 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 11 V6 Z" />
      <path d="M8.5 11.5 L11 14 L15.5 9.5" />
    </>,
  );
}
export function IconTree(p: P) {
  return base(
    p,
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M12 7.2 L6.8 16 M12 7.2 L17.2 16" />
    </>,
  );
}
export function IconRing(p: P) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 2.6" />
      <circle cx="12" cy="12" r="2.4" />
    </>,
  );
}
export function IconBlocks(p: P) {
  return base(
    p,
    <>
      <rect x="3" y="8" width="7" height="7" rx="1" />
      <rect x="14" y="8" width="7" height="7" rx="1" />
      <path d="M10 11.5 H14" />
    </>,
  );
}
export function IconHammer(p: P) {
  return base(
    p,
    <>
      <path d="M14.5 3.5 L20.5 9.5 L18 12 L12 6 Z" />
      <path d="M12 6 L4.5 13.5 L7.5 16.5 L15 9" />
      <path d="M4 20 H14" />
    </>,
  );
}
export function IconCircuit(p: P) {
  return base(
    p,
    <>
      <rect x="8" y="8" width="8" height="8" rx="1.5" />
      <path d="M12 3 V8 M12 16 V21 M3 12 H8 M16 12 H21" />
      <circle cx="12" cy="3" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="21" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>,
  );
}
export function IconDoc(p: P) {
  return base(
    p,
    <>
      <path d="M6 3 H14 L19 8 V21 H6 Z" />
      <path d="M14 3 V8 H19" />
      <path d="M9 13 H16 M9 16.5 H14" />
    </>,
  );
}
export function IconExternal(p: P) {
  return base(
    p,
    <>
      <path d="M9 5 H5 V19 H19 V15" />
      <path d="M13 4 H20 V11" />
      <path d="M20 4 L11 13" />
    </>,
  );
}
export function IconCopy(p: P) {
  return base(
    p,
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15 H4 V4 H15 V5" />
    </>,
  );
}
export function IconCheck(p: P) {
  return base(p, <path d="M4.5 12.5 L10 18 L19.5 6.5" />);
}
export function IconCross(p: P) {
  return base(p, <path d="M6 6 L18 18 M18 6 L6 18" />);
}
export function IconSeal(p: P) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" strokeDasharray="2.5 2.2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>,
  );
}
export function IconPulse(p: P) {
  return base(p, <path d="M3 12 H7 L9.5 6 L13 18 L15.5 12 H21" />);
}
