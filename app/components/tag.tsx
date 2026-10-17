import type { ReactNode } from "react";

type TagProps = {
  children: ReactNode;
  /** `label` names a factor or stat; `warning` flags a caveat such as "Small sample". */
  tone?: "label" | "warning";
};

const TONE = {
  label: "bg-shale-800 text-ink-soft",
  warning: "bg-shale-700 text-ink",
} as const;

/** A small slanted tag beside a finding: its factor or stat, or a caveat. */
export function Tag({ children, tone = "label" }: TagProps) {
  return (
    <span
      className={`clip-slant px-2 py-0.5 font-display font-bold text-xs uppercase tracking-wide [--slant:0.2rem] ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Says in words that a figure rests on few Matches or Appearances. */
export function SmallSampleTag() {
  return <Tag tone="warning">Small sample</Tag>;
}
