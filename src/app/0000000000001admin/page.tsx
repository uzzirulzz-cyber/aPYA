"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SecureLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        window.location.href = "/admin";
      }
    } catch (e) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <div style={styles.logoBox}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h1 style={styles.title}>Staff Portal</h1>
          <p style={styles.subtitle}>Global Operations Command Center</p>
        </div>

        {/* Login Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.iconBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h2 style={styles.cardTitle}>ADMINISTRATOR</h2>
              <p style={styles.cardSubtitle}>Secure authentication required</p>
            </div>
          </div>

          {error && (
            <div style={styles.errorBox}>{error}</div>
          )}

          <div style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                style={styles.input}
                placeholder="Enter username"
                autoComplete="off"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                style={styles.input}
                placeholder="Enter password"
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            onClick={handleSignIn}
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <span style={styles.buttonContent}>
                <span style={styles.spinner} />
                Authenticating…
              </span>
            ) : (
              <span style={styles.buttonContent}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Access Command Center
              </span>
            )}
          </button>
        </div>

        <p style={styles.footer}>
          Authorized personnel only. All access is logged and monitored.
        </p>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0e1a",
    position: "relative",
    overflow: "hidden",
    padding: "16px",
    boxSizing: "border-box",
  },
  content: {
    position: "relative",
    zIndex: 10,
    width: "100%",
    maxWidth: "380px",
  },
  logoSection: {
    textAlign: "center",
    marginBottom: "32px",
  },
  logoBox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "64px",
    height: "64px",
    borderRadius: "16px",
    backgroundColor: "rgba(20,184,166,0.1)",
    border: "1px solid rgba(20,184,166,0.3)",
    marginBottom: "16px",
  },
  title: {
    fontSize: "30px",
    fontWeight: 700,
    color: "#ffffff",
    letterSpacing: "-0.025em",
    margin: 0,
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    marginTop: "8px",
    margin: "8px 0 0 0",
  },
  card: {
    borderRadius: "16px",
    padding: "24px",
    backgroundColor: "rgba(17,24,39,0.95)",
    border: "1px solid rgba(30,58,95,0.5)",
    backdropFilter: "blur(16px)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    paddingBottom: "12px",
    borderBottom: "1px solid rgba(30,58,95,0.5)",
    marginBottom: "20px",
  },
  iconBox: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    backgroundColor: "rgba(20,184,166,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: 0,
  },
  cardSubtitle: {
    fontSize: "10px",
    color: "#64748b",
    margin: "2px 0 0 0",
  },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#ef4444",
    padding: "10px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#94a3b8",
  },
  input: {
    height: "44px",
    backgroundColor: "#0a0e1a",
    border: "1px solid rgba(30,58,95,0.6)",
    color: "#ffffff",
    borderRadius: "8px",
    padding: "0 12px",
    fontSize: "14px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    height: "44px",
    marginTop: "20px",
    backgroundColor: "#14b8a6",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "14px",
    borderRadius: "8px",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "background-color 0.2s",
  },
  buttonContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  spinner: {
    width: "16px",
    height: "16px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    display: "inline-block",
  },
  footer: {
    textAlign: "center",
    fontSize: "11px",
    color: "#475569",
    marginTop: "24px",
  },
};
