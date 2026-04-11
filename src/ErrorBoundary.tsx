import { Component, ErrorInfo, ReactNode } from "react";

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
        background: "var(--bg, #f8f9fa)",
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
          background: "var(--surface, #fff)",
          border: "1px solid rgba(192,57,43,0.2)",
          borderRadius: 16,
          padding: "32px 28px",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(192,57,43,0.08)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--red, #c0392b)", marginBottom: 8 }}>
            אירעה שגיאה בלתי צפויה
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-dim, #888)", marginBottom: 24 }}>
            משהו השתבש. ניתן לנסות לרענן את הדף.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 14,
              color: "var(--text-dim, #888)",
              background: "var(--surface2, #f4f4f4)",
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
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "var(--green-mid, #2d6a4f)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 28px",
              fontSize: 17,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            רענן דף
          </button>
        </div>
      </div>
    );
  }
}
