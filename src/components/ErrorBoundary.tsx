"use client";
import { Component, ReactNode } from "react";
import { toast } from "sonner";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    const description =
      error?.message?.trim() || "A view crashed unexpectedly. Reload to continue.";
    toast.error("Interface error", { description });
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ background: "var(--bg-base)" }}
        >
          <div className="text-center p-8 max-w-lg">
            <div
              className="text-6xl mb-6"
              style={{ color: "var(--accent-error)" }}
              aria-hidden="true"
            >
              ⚠
            </div>
            <h1
              className="text-2xl font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Something went wrong
            </h1>
            <p
              className="mb-6 font-mono text-sm"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg font-medium transition-colors"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg font-medium transition-colors"
                style={{
                  background: "var(--accent-primary)",
                  color: "white",
                }}
              >
                Reload Page
              </button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.errorInfo && (
              <details
                className="mt-6 text-left"
                style={{
                  background: "var(--bg-elevated)",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <summary
                  className="cursor-pointer font-medium mb-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Stack trace (dev only)
                </summary>
                <pre
                  className="text-xs overflow-auto"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
