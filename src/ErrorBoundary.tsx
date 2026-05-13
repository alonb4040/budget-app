import { Component, ErrorInfo, ReactNode } from "react";
import { Btn } from "./ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        direction: "rtl",
      }}>
        <div style={{
          maxWidth: 480,
          width: "100%",
          background: "var(--surface)",
          border: "1px solid rgba(192,57,43,0.2)",
          borderRadius: 16,
          padding: "32px 28px",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(192,57,43,0.08)",
        }}>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>
            אירעה שגיאה בלתי צפויה
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-dim)", marginBottom: 24 }}>
            משהו השתבש. ניתן לנסות לרענן את הדף.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 14,
              color: "var(--text-dim)",
              background: "var(--surface2)",
              borderRadius: 8,
              padding: "10px 14px",
              textAlign: "left",
              overflowX: "auto",
              marginBottom: 24,
              direction: "ltr",
            }}>
              {this.state.error.message}
            </pre>
          )}
          <Btn onClick={() => window.location.reload()} size="lg">
            רענן דף
          </Btn>
        </div>
      </div>
    );
  }
}
