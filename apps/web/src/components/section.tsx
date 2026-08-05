import { type JSX, type ReactNode } from "react";

export interface SectionProps {
  id: string;
  title: string;
  lede: string;
  children: ReactNode;
}

export function Section({
  id,
  title,
  lede,
  children,
}: SectionProps): JSX.Element {
  return (
    <section aria-labelledby={`${id}-heading`} className="section">
      <h2 id={`${id}-heading`}>{title}</h2>
      <p className="lede">{lede}</p>
      {children}
    </section>
  );
}
