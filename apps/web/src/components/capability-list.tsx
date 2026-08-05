import { type JSX } from "react";

export interface Capability {
  name: string;
  what: string;
  /** Why this exists — the failure mode it prevents. */
  guards: string;
}

export interface CapabilityListProps {
  items: readonly Capability[];
}

export function CapabilityList({ items }: CapabilityListProps): JSX.Element {
  return (
    <dl className="capabilities">
      {items.map((item) => (
        <div className="capability" key={item.name}>
          <dt>
            <code>{item.name}</code>
          </dt>
          <dd>
            <span className="what">{item.what}</span>
            <span className="guards">{item.guards}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
