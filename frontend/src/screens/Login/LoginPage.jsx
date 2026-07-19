import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { writeLoginData } from "../../loginData";

export default function LoginPage() {
  const navigate = useNavigate();
  const [type, setType] = useState("Doctor");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    if (!id.trim()) return;
    writeLoginData({ type, id: Number(id), name, email });
    navigate("/clinical-reasoning");
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoRow}>
          <div style={S.logo}>
            <span style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>e</span>
            <span style={{ color: "#93c5fd", fontWeight: 900, fontSize: 16 }}>Hospital</span>
          </div>
          <div style={S.appName}>Clinical AI Assistant</div>
        </div>

        <p style={S.sub}>Sign in to save visit records and access patient data</p>

        <form onSubmit={handleLogin} style={S.form}>
          <label style={S.label}>Role</label>
          <div style={S.toggle}>
            {["Doctor", "Patient"].map((r) => (
              <button key={r} type="button" onClick={() => setType(r)}
                style={{ ...S.toggleBtn, ...(type === r ? S.toggleActive : {}) }}>
                {r === "Doctor" ? "\u{1FA7A} Doctor" : "\u{1F464} Patient"}
              </button>
            ))}
          </div>

          <label style={S.label}>ID <span style={{ color: "#ef4444" }}>*</span></label>
          <input style={S.input} type="number" placeholder="e.g. 58" value={id}
            onChange={(e) => setId(e.target.value)} required />

          <label style={S.label}>Name</label>
          <input style={S.input} type="text" placeholder="Your full name" value={name}
            onChange={(e) => setName(e.target.value)} />

          <label style={S.label}>Email</label>
          <input style={S.input} type="email" placeholder="you@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} />

          <button type="submit" style={S.submit} disabled={!id.trim()}>
            Sign In
          </button>
        </form>

        <p style={S.skip}>
          <a href="/clinical-reasoning" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>
            Continue without signing in →
          </a>
        </p>
      </div>
    </div>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #e0e7ff 0%, #f0f4f8 50%, #dbeafe 100%)",
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Inter\", sans-serif",
    padding: 16,
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: "36px 32px",
    width: 380,
    maxWidth: "100%",
    boxShadow: "0 4px 24px rgba(30,58,138,0.10), 0 1px 4px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  logo: {
    background: "#1e3a8a",
    borderRadius: 8,
    padding: "4px 10px",
    letterSpacing: -0.3,
  },
  appName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1e293b",
  },
  sub: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 24,
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    letterSpacing: "0.02em",
    marginTop: 10,
  },
  input: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    color: "#0f172a",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  toggle: {
    display: "flex",
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    color: "#475569",
    padding: "9px 0",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  toggleActive: {
    background: "#1e3a8a",
    borderColor: "#1e3a8a",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(30,58,138,0.25)",
  },
  submit: {
    marginTop: 18,
    background: "#1e3a8a",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    padding: "12px 0",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    letterSpacing: 0.2,
    boxShadow: "0 2px 8px rgba(30,58,138,0.25)",
    fontFamily: "inherit",
    width: "100%",
    transition: "filter 0.15s",
  },
  skip: {
    textAlign: "center",
    marginTop: 20,
  },
};
