import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import App from "../src/App.jsx";

describe("App", () => {
  it("renders the header title", () => {
    render(<App />);
    expect(screen.getByText(/Financial Organizer/i)).toBeInTheDocument();
  });
});
