// The crest cropped to the face, which is all that reads at 40px.
import crestMarkUrl from "../../assets/crest-mark.png";

/** Our Club's mark: the cropped crest at 40px on a green slanted tab. Decorative. */
export function CrestMark() {
  return (
    <span className="clip-slant-r block shrink-0 bg-rave pr-2.5 [--slant:0.6rem]">
      <img
        src={crestMarkUrl}
        alt=""
        width={40}
        height={40}
        className="block size-10"
      />
    </span>
  );
}
