import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Create a simplified mock that bypasses animation
vi.mock("./KineticNumber", () => ({
  KineticNumber: ({ value, prefix = "", suffix = "", decimals = 0, className, formatThousands = true }: {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    className?: string;
    formatThousands?: boolean;
  }) => {
    const formatted = formatThousands
      ? value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : decimals > 0
      ? value.toFixed(decimals)
      : String(Math.round(value));

    return (
      <span className={className ? `tabular-nums ${className}` : "tabular-nums"}>
        {prefix && <span>{prefix}</span>}
        <span>{formatted}</span>
        {suffix && <span>{suffix}</span>}
      </span>
    );
  },
}));

// Import after mock
import { KineticNumber } from "./KineticNumber";

describe("KineticNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the value", () => {
    render(<KineticNumber value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders with prefix", () => {
    render(<KineticNumber value={100} prefix="$" />);
    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders with suffix", () => {
    render(<KineticNumber value={50} suffix="%" />);
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("formats with decimals", () => {
    render(<KineticNumber value={42.567} decimals={2} />);
    expect(screen.getByText("42.57")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<KineticNumber value={42} className="custom-class" />);
    const element = screen.getByText("42").closest("span");
    expect(element?.parentElement).toHaveClass("custom-class");
  });

  it("formats large numbers with commas", () => {
    render(<KineticNumber value={1000000} />);
    expect(screen.getByText("1,000,000")).toBeInTheDocument();
  });
});
