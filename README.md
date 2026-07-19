# 2026-summer-8-Multi-AI-agents-in-the-Clinica-Process-Management

Xiner Shen - 300462652

# Clinical Reasoning Dashboard

A realtime, voice-driven clinical interview assistant. The doctor or patient speaks into the browser; OpenAI's Realtime API streams back voice and live transcripts, and the conversation can be summarised and saved as a visit record.

---

## Prerequisites

- **Node.js** 18+ and npm
- An **OpenAI API key** with access to the Realtime API and `gpt-4o-mini`
- **MySQL** (optional — only needed if you want to save visit records to a database)

---

## Project structure

```
Ai triage/
├── backend/    Express + Node.js API
└── frontend/   React + Vite UI
```

---

## How to run it

### 1 — Backend

```bash
cd backend
cp .env.example .env      # fill in OPENAI_API_KEY (+ DB vars if using MySQL)
npm install                # first time only
npm run dev                # nodemon hot-reload  (or: npm start)
```

Server starts at **http://localhost:8080**

Sanity check:
```bash
curl "http://localhost:8080/api/chat/get-instructions?mode=doctor"
# → { "instructions": "..." }
```

### 2 — Frontend

Open a second terminal:

```bash
cd frontend
cp .env.example .env      # optional — defaults to http://localhost:8080
npm install                 # first time only
npm run dev                 # starts on http://localhost:3000
```

Open **http://localhost:3000** in your browser — it redirects straight to the dashboard at `/clinical-reasoning`.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI key with Realtime + gpt-4o-mini access |
| `PORT` | | Server port (default `8080`) |
| `SESSION_SECRET` | | Express session secret |
| `DB_HOST` | | MySQL host (default `localhost`) |
| `DB_USER` | | MySQL user (default `root`) |
| `DB_PASSWORD` | | MySQL password |
| `DB_NAME` | | MySQL database (default `ehospital`) |
| `DB_PORT` | | MySQL port (default `3306`) |
| `HF_SENTIMENT_TOKEN` | | Hugging Face token (optional sentiment proxy) |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE` | Backend URL override (default `http://localhost:8080`) |
| `VITE_CLINICAL_REASONING_API_BASE` | Dashboard-specific backend URL override |

---

## Features

- **Realtime voice** — WebRTC + OpenAI Realtime API (no audio proxied through backend)
- **Live transcripts** — server VAD detects pauses and auto-responds
- **Voice-to-text dictation** — mic buttons on the Doctor Review notes, Passive Listen summary, and Doctor Diagnostic observations fields
- **AI summary** — generates a chart-ready clinical summary from the transcript
- **Visit save** — stores summary to `doctor_patient_visits` via MySQL
- **Doctor / Patient modes** — different system prompts per role

---

## Prompt files

Edit the instructions the AI uses per role:

```
backend/prompts/doctor_instructions.txt
backend/prompts/patient_instructions.txt
```

Both files **must be non-empty** — the backend will error otherwise.
