/** Flags a DNF Match: one side quit, so EA awarded the result to the side that stayed. */
export function DnfBadge() {
  return (
    <abbr
      title="Did not finish"
      className="clip-slant inline-flex h-6 items-center bg-ink px-2.5 font-display font-extrabold text-base text-shale-950 leading-none no-underline [--slant:0.3rem]"
    >
      DNF
    </abbr>
  );
}
