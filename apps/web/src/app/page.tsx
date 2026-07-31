import { Card } from "@repo/ui/card";
import type { JSX } from "react";

import { Counter } from "../components/counter";

export default function HomePage(): JSX.Element {
  return (
    <main>
      <h1>web-skeleton</h1>
      <p>
        A Server Component. It renders a Client Component (the counter) and a
        shared component from <code>@repo/ui</code>.
      </p>

      <Counter />

      <p>
        <Card href="https://turborepo.dev/docs" title="Turborepo docs">
          How the build pipeline and task caching work.
        </Card>
      </p>
    </main>
  );
}
