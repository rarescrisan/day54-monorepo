import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Counter } from "./counter";

describe("Counter", () => {
  it("starts at zero", () => {
    render(<Counter />);

    expect(screen.getByText("Clicked 0 times")).toBeInTheDocument();
  });

  it("counts each click the user makes", async () => {
    render(<Counter />);
    const increment = screen.getByRole("button", { name: "Increment" });

    await userEvent.click(increment);
    await userEvent.click(increment);

    expect(screen.getByText("Clicked 2 times")).toBeInTheDocument();
  });
});
