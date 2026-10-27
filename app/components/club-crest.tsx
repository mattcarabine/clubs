import { useEffect, useRef, useState } from "react";

/**
 * An Opponent's crest from EA's CDN, a touch larger than Our Club's
 * `CrestMark` since EA's image pads the shield. The URL is undocumented, so a
 * crest that fails to load takes its slot with it: the panel then shows the
 * name alone, never a broken image.
 */
export function ClubCrest({ src }: { src: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);

  // An image can fail before hydration attaches `onError`; catch that too.
  useEffect(() => {
    const img = image.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return null;
  return (
    <img
      ref={image}
      src={src}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      referrerPolicy="no-referrer"
      data-testid="club-crest"
      onError={() => setFailed(true)}
      className="block size-12 shrink-0 object-contain"
    />
  );
}
