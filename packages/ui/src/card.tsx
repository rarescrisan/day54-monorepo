import { type JSX, type ReactNode } from "react";

export interface CardProps {
  title: string;
  href: string;
  children: ReactNode;
}

export function Card({ title, href, children }: CardProps): JSX.Element {
  return (
    <a className="card" href={href} rel="noopener noreferrer" target="_blank">
      <h2>{title}</h2>
      <p>{children}</p>
    </a>
  );
}
