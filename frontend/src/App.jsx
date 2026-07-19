import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import ClinicalReasoningDashboard from "./screens/ClinicalReasoning/ClinicalReasoningDashboard";
import LoginPage from "./screens/Login/LoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/clinical-reasoning" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/clinical-reasoning" element={<ClinicalReasoningDashboard />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#3f376a",
        color: "#f2f5ff",
        gap: 16,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
      <p style={{ opacity: 0.7 }}>Page not found</p>
      <Link
        to="/clinical-reasoning"
        style={{
          color: "rgba(120,120,255,0.9)",
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        ← Go to Dashboard
      </Link>
    </div>
  );
}
