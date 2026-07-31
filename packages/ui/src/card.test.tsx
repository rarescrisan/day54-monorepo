import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "./card";

describe("Card", () => {
  it("renders as a link labelled by its title", () => {
    render(
      <Card href="https://turborepo.dev" title="Turborepo">
        Build system docs
      </Card>,
    );

    const link = screen.getByRole("link", { name: /Turborepo/ });

    expect(link).toHaveAttribute("href", "https://turborepo.dev");
    expect(
      screen.getByRole("heading", { name: "Turborepo", level: 2 }),
    ).toBeInTheDocument();
  });
});
