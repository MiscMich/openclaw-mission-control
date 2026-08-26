import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlassPanel } from "./GlassPanel";

describe("GlassPanel", () => {
  it("renders children correctly", () => {
    render(<GlassPanel>Test Content</GlassPanel>);
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("applies default padding", () => {
    render(<GlassPanel data-testid="panel">Content</GlassPanel>);
    const panel = screen.getByTestId("panel");
    expect(panel).toHaveClass("p-4");
  });

  it("applies small padding when specified", () => {
    render(
      <GlassPanel padding="sm" data-testid="panel">
        Content
      </GlassPanel>
    );
    const panel = screen.getByTestId("panel");
    expect(panel).toHaveClass("p-3");
  });

  it("applies large padding when specified", () => {
    render(
      <GlassPanel padding="lg" data-testid="panel">
        Content
      </GlassPanel>
    );
    const panel = screen.getByTestId("panel");
    expect(panel).toHaveClass("p-6");
  });

  it("applies no padding when specified", () => {
    render(
      <GlassPanel padding="none" data-testid="panel">
        Content
      </GlassPanel>
    );
    const panel = screen.getByTestId("panel");
    expect(panel).not.toHaveClass("p-3");
    expect(panel).not.toHaveClass("p-4");
    expect(panel).not.toHaveClass("p-6");
  });

  it("applies custom className", () => {
    render(
      <GlassPanel className="custom-class" data-testid="panel">
        Content
      </GlassPanel>
    );
    const panel = screen.getByTestId("panel");
    expect(panel).toHaveClass("custom-class");
  });

  it("forwards ref correctly", () => {
    const ref = { current: null };
    render(
      <GlassPanel ref={ref}>Content</GlassPanel>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
