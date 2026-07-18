# Clinical Reasoning Dashboard

A realtime, voice-driven clinical interview assistant. The doctor or patient speaks into the browser; OpenAI's Realtime API streams back voice and live transcripts, and the conversation can be summarised and saved as a visit record.

---

## To run it

**Backend** (terminal 1):

```bash
cd backend
cp .env.example .env     # fill in OPENAI_API_KEY (+ DB vars if using MySQL)
npm run dev              # starts on http://localhost:8080
```

Required values in `backend/.env`:

```env
OPENAI_API_KEY=sk-...your-key...

PORT=8080
SESSION_SECRET=change-me-to-something-random

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=ehospital
DB_PORT=3306

# HF_SENTIMENT_TOKEN=hf_...   (optional)
```

**Frontend** (terminal 2):

```bash
cd frontend
npm run dev              # starts on http://localhost:3000
```

Open **http://localhost:3000** — redirects straight to the dashboard.

---

## Project structure

```
Ai triage/
├── backend/    Express + Node.js API
└── frontend/   React + Vite UI
```

---

## Quick start

### 1 — Backend

```bash
cd backend
cp .env.example .env      # then fill in OPENAI_API_KEY and DB_* values
npm install               # already done if you cloned fresh
npm run dev               # nodemon hot-reload  (or: npm start)
```

Server starts at **http://localhost:8080**

Sanity check:
```bash
curl "http://localhost:8080/api/chat/get-instructions?mode=doctor"
# → { "instructions": "..." }
```

### 2 — Frontend

```bash
cd frontend
cp .env.example .env      # optional — defaults to http://localhost:8080
npm install               # already done if you cloned fresh
npm run dev               # Vite dev server
```

App opens at **http://localhost:3000**

Go to **http://localhost:3000/clinical-reasoning** (or just `/` which redirects there).

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
