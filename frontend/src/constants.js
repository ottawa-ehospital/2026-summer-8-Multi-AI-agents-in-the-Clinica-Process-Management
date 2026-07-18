/**
 * BASE_URL — the root of the Node/Express backend.
 *
 * During local development Vite proxies /api/* to http://localhost:8080
 * so an empty string (same-origin) works perfectly.
 *
 * Override per-environment:
 *   VITE_API_BASE=https://your-backend.example.com
 */
export const BASE_URL = import.meta.env.VITE_API_BASE || "http://localhost:8080";
