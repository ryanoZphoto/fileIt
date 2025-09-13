import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import App from "../src/App.jsx";

describe("App", () => {
  it("renders the header title", () => {
    render(<App />);
    const heading = screen.getByRole("heading", { name: /Financial Organizer/i });
    expect(heading).toBeInTheDocument();
  });
});
