// Registers the jest-dom matchers (toBeInTheDocument, toHaveAttribute, …) with
// Vitest's expect, and their type augmentation with TypeScript.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only self-registers cleanup when Vitest's `globals` are on.
// We keep imports explicit, so unmount between tests explicitly too — without
// this, each render stacks in the same document and queries find duplicates.
afterEach(cleanup);
