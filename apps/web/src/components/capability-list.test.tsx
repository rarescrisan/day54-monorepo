import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CapabilityList, type Capability } from "./capability-list";

const items: readonly Capability[] = [
  {
    name: "/verify-before-done",
    what: "Done means a check you ran passed.",
    guards: "Stops claiming success without evidence.",
  },
];

describe("CapabilityList", () => {
  it("renders each capability as a term with its description", () => {
    render(<CapabilityList items={items} />);

    const term = screen.getByText("/verify-before-done");

    expect(term).toBeInTheDocument();
    expect(term.closest("dt")).not.toBeNull();
    expect(
      screen.getByText("Done means a check you ran passed."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Stops claiming success without evidence."),
    ).toBeInTheDocument();
  });

  it("renders nothing but an empty list when given no items", () => {
    const { container } = render(<CapabilityList items={[]} />);

    expect(container.querySelectorAll(".capability")).toHaveLength(0);
  });
});
