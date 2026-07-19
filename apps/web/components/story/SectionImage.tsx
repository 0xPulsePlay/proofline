export function SectionImage({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="story-figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
