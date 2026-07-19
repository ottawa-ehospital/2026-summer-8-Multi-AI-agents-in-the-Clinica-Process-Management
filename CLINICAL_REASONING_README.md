# Clinical Reasoning Dashboard — README

A realtime, voice-driven clinical interview assistant for the E-Hospital platform.
The doctor (or patient) speaks into the browser, OpenAI's Realtime API streams
back voice + live transcripts, and the conversation can be summarized and saved
into the patient's visit record.

This README covers **two files** that together implement the feature:

| Layer    | Repo                  | File                                                                  |
| -------- | --------------------- | --------------------------------------------------------------------- |
| Frontend | `E-react-frontend`    | `src/screens/ClinicalReasoning/ClinicalReasoningDashboard.jsx`        |
| Backend  | `E-react-node-backend`| `app/routes/chatRouter.js` (mounted at `/api/chat`)                   |

---

## 1. Architecture at a glance

```
 Browser (React)                Node/Express Backend                OpenAI
 ──────────────                  ───────────────────                ──────
 ClinicalReasoningDashboard.jsx     chatRouter.js  (/api/chat)
        │                                  │
        │  1) GET /realtime/client-secret  │  ──► POST /v1/realtime/client_secrets
        │ ◄──── { client_secret.value }    │ ◄── ephemeral key
        │                                  │
        │  2) GET /get-instructions        │  reads prompts/*.txt
        │ ◄──── { instructions }           │
        │                                  │
        │  3) POST /realtime/sdp           │  ──► POST /v1/realtime?model=…
        │      (SDP offer)                 │ ◄── SDP answer
        │ ◄──── SDP answer                 │
        │                                  │
        │  4) WebRTC peer connection ──────┼──────► OpenAI Realtime (audio + events)
        │                                  │
        │  5) POST /clinical-interview/    │  ──► POST /v1/chat/completions
        │      summary  (transcript)       │ ◄── chart-ready summary
        │ ◄──── { summary }                │
        │                                  │
        │  6) POST /saveVisit  ────────────┼─► writes doctor_patient_visits row (MySQL)
```

**Key idea:** The Node backend never proxies audio. It only (a) mints an
ephemeral OpenAI key, (b) relays the WebRTC SDP handshake, and (c) loads the
right system prompt. After the handshake the browser talks **directly** to
OpenAI Realtime over WebRTC.

---

## 2. What the frontend does — `ClinicalReasoningDashboard.jsx`

A single-screen React component (MUI + plain CSS) built around three columns:

1. **Center stage** — animated orb, status line, live "You / Assistant" captions,
   and the `Start / End / Reset` controls.
2. **Conversation log** — running transcript of the session (`history` state).
3. **Visit summary panel** — patient ID, date / time, reason for visit, editable
   AI summary, and a **Save to patient record** button.

### Modes

`mode` is either `"doctor"` or `"patient"`. The mode is sent to the backend so
the correct system prompt (`prompts/doctor_instructions.txt` or
`prompts/patient_instructions.txt`) is injected into the Realtime session.

### Session flow (inside `startRealtime`)

1. **Fetch ephemeral key** — `GET /api/chat/realtime/client-secret?mode=…`.
2. **Create `RTCPeerConnection`** with a public STUN server, attach the local
   microphone track, and create a data channel `oai-events` for events /
   transcripts.
3. **Fetch instructions** — `GET /api/chat/get-instructions?mode=…`.
4. **Create SDP offer**, send it to `POST /api/chat/realtime/sdp?model=gpt-realtime`,
   and apply the SDP answer.
5. When the data channel opens, send a `session.update` event with
   `turn_detection: { type: "server_vad" }` so the assistant replies whenever the
   user pauses, plus `input_audio_transcription` for live captions.
6. As Realtime events arrive (`input_audio_transcription.*`,
   `response.audio_transcript.*`), the component updates the live captions and
   appends finalized turns to the `history` state.
7. `endRealtime` (or unmount) closes the data channel, the peer connection, and
   stops all microphone tracks (`safeDisconnect`).

### Summary & save

- **Generate AI summary** → `POST /api/chat/clinical-interview/summary` with the
  joined transcript. The backend asks `gpt-4o-mini` for a chart-style summary
  (Chief concerns / Key points / Assessment / Plan).
- **Save to patient record** → `POST {BASE_URL}/saveVisit` with the visit
  metadata + summary, identical payload to the existing "Log a Visit" flow in
  `DoctorViewPatient`.

### Configurable endpoints

```js
const API_BASE = (
  process.env.REACT_APP_CLINICAL_REASONING_API_BASE
  || BASE_URL
  || "http://localhost:8080"
).replace(/\/$/, "");
```

`BASE_URL` is defined in `src/constants.js` and currently points at the
AWS App Runner deployment of the Node backend.

---

## 3. What the backend does — `chatRouter.js`

Express router mounted in `server.js`:

```js
app.use("/api/chat", chatRoutes);
```

It also serves an unrelated WebSocket chat (`/sendMessage`) and a few helper
endpoints used elsewhere in the app. The endpoints relevant to the Clinical
Reasoning Dashboard are:

| Method | Path                                  | Purpose                                                                                  |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/chat/realtime/client-secret`    | Reads the right prompt, calls `POST https://api.openai.com/v1/realtime/client_secrets`, returns the ephemeral `client_secret` JSON to the browser. Requires `OPENAI_API_KEY`. |
| GET    | `/api/chat/get-instructions`          | Returns `{ instructions }` from `prompts/<mode>_instructions.txt`.                        |
| POST   | `/api/chat/realtime/sdp`              | Relays the WebRTC SDP offer (`Content-Type: application/sdp`) to `https://api.openai.com/v1/realtime` and streams back the SDP answer. |
| POST   | `/api/chat/clinical-interview/summary`| Takes `{ transcript }`, calls `gpt-4o-mini` via `/v1/chat/completions`, returns `{ summary }`. |
| POST   | `/api/chat/sentiment/inference`       | Optional Hugging Face sentiment proxy (CORS workaround). Needs `HF_SENTIMENT_TOKEN`.      |

Other endpoints in the file (`/getConversationIdByUserIdentity`,
`/getChatHistoryByConversationId`, `/getCurrentId`, `/getInfo`,
`/getDoctorIDByPatientID`, and the `/sendMessage` WebSocket) belong to the
patient-doctor messaging feature and are **not** used by the dashboard.

### Required prompt files

```
E-react-node-backend/
└── prompts/
    ├── doctor_instructions.txt
    └── patient_instructions.txt
```

Both files **must be non-empty** — the client-secret endpoint throws otherwise.

### CORS

The router has a custom CORS middleware that allows `http://localhost:3000` with
credentials. The app-level CORS in `server.js` also allows the production
domains (`e-hospital.ca`, the Heroku frontend, etc.).

---

## 4. Prerequisites

| Tool         | Version    | Notes                                                       |
| ------------ | ---------- | ----------------------------------------------------------- |
| Node.js      | 18.x       | Pinned in `E-react-frontend/package.json`                   |
| npm          | 7.x+       |                                                             |
| MySQL        | any 8.x    | Backend uses `mysql2`; needed for `/saveVisit` and chat     |
| OpenAI key   | —          | Must have Realtime API + `gpt-4o-mini` access               |
| Browser      | Chrome / Edge / Firefox latest | Must support WebRTC + `getUserMedia`     |

---

## 5. Running locally

### 5.1 Backend (`E-react-node-backend`)

```bash
cd E-react-node-backend
npm install
```

Create a `.env` in the repo root:

```env
OPENAI_API_KEY=sk-...your-key...
PORT=8080

# MySQL (matches app/config/db.config.js)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=...
DB_NAME=ehospital
DB_PORT=3306

# Optional — only if you use the sentiment proxy
HF_SENTIMENT_TOKEN=hf_...
```

Make sure the two prompt files exist and are non-empty:

```
prompts/doctor_instructions.txt
prompts/patient_instructions.txt
```

Start the server:

```bash
npm run dev          # nodemon, recommended for development
# or
node server.js
```

You should see `Server is running on port 8080.` and a DB connection log line.

Quick sanity check:

```bash
curl "http://localhost:8080/api/chat/get-instructions?mode=doctor"
# -> { "instructions": "..." }
```

### 5.2 Frontend (`E-react-frontend`)

```bash
cd E-react-frontend
npm install
```

Point the dashboard at your local backend by either:

- editing `src/constants.js` so `BASE_URL = "http://localhost:8080"`, **or**
- creating a `.env` in the repo root:

```env
REACT_APP_CLINICAL_REASONING_API_BASE=http://localhost:8080
```

Start the dev server:

```bash
npm start
```

CRA will open `http://localhost:3000`. Navigate to the dashboard route used by
your app (e.g. `/ClinicalReasoning/dashboard` — see
`src/services/uiOrchestrator.js` for the fallback route). Optionally pre-fill a
patient ID with `?patientId=123`.

### 5.3 Using it

1. Pick a mode (default is `doctor`).
2. Click **Start** — the browser will ask for microphone permission.
3. Speak naturally. Pauses are detected by the server, and the assistant
   responds with voice + transcript.
4. Click **End** to stop the session.
5. (Optional) Click **Generate AI summary** to produce a chart-ready summary
   from the transcript, edit it, fill in the visit fields, and click
   **Save to patient record**.

---

## 6. Deploying

- **Backend:** the production deployment is on AWS App Runner at
  `https://tysnx3mi2s.us-east-1.awsapprunner.com`. Set the same env vars
  (`OPENAI_API_KEY`, DB creds, optional `HF_SENTIMENT_TOKEN`). Ensure the
  `prompts/` folder is included in the build artifact.
- **Frontend:** standard CRA build (`npm run build`). `BASE_URL` in
  `src/constants.js` already points at the App Runner backend; override per
  environment with `REACT_APP_CLINICAL_REASONING_API_BASE` if needed.

---

## 7. Troubleshooting

| Symptom                                                              | Likely cause / fix                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Failed to get client secret` / `Missing OPENAI_API_KEY`              | `OPENAI_API_KEY` not loaded on the backend. `.env` uses `override: true` so machine-level vars won't shadow it — restart the server after edits. |
| `Prompt file empty or missing`                                       | `prompts/doctor_instructions.txt` or `prompts/patient_instructions.txt` is missing / empty.                                                     |
| `OpenAI SDP exchange failed`                                         | Usually an invalid / unauthorized OpenAI key, wrong model name, or the backend can't reach `api.openai.com` (firewall / proxy).                  |
| `Browser doesn't support WebRTC voice`                               | Component checks for `RTCPeerConnection` + `navigator.mediaDevices.getUserMedia`. Use modern Chrome/Edge/Firefox over HTTPS or `localhost`.       |
| No microphone permission prompt                                      | The page must be served from `localhost` or HTTPS; insecure origins block `getUserMedia`.                                                       |
| CORS error from the browser                                          | The frontend origin is not in the allow-list. Add it to `corsOptions.origin` in `server.js` or to the router-level CORS in `chatRouter.js`.      |
| `Only logged-in doctors can save a visit record.`                    | `readLoginData()` must return `{ type: "Doctor", id }`. Log in as a doctor before saving.                                                       |
| Summary endpoint returns 502                                         | OpenAI returned a non-2xx — check the backend logs for the upstream error (rate limit, quota, model access).                                    |

---

## 8. Security notes

- `OPENAI_API_KEY` stays on the server. The browser only ever sees the short-lived
  `client_secret.value`.
- `chatRouter.js` currently builds some SQL with template literals
  (`/getConversationIdByUserIdentity`, `/getChatHistoryByConversationId`, etc.).
  These are unrelated to the dashboard but should be migrated to parameterized
  queries before exposure to untrusted input.
- `openaiAgent` is created with `rejectUnauthorized: false` to work around
  corporate TLS interception. Remove this in production environments where the
  certificate chain is trusted.

---

## 9. File map (quick reference)

```
E-react-frontend/
└── src/
    ├── constants.js                                    # BASE_URL
    ├── loginData.js                                    # readLoginData()
    └── screens/
        └── ClinicalReasoning/
            └── ClinicalReasoningDashboard.jsx          # ← the screen

E-react-node-backend/
├── server.js                                           # mounts /api/chat
├── prompts/
│   ├── doctor_instructions.txt
│   └── patient_instructions.txt
└── app/
    ├── models/dbConnection.js                          # mysql2 helper
    └── routes/
        └── chatRouter.js                               # ← the router
```

---

