"use client";

import { Button } from "@repo/ui/button";
import { type JSX, useState } from "react";

/**
 * The smallest honest example of the server/client boundary: the page is a
 * Server Component, this is not, because it needs state and an event handler.
 */
export function Counter(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p aria-live="polite">Clicked {count} times</p>
      <Button onClick={() => setCount((current) => current + 1)}>
        Increment
      </Button>
    </div>
  );
}
