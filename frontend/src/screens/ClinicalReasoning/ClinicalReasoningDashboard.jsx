import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { BASE_URL } from "../../constants";
import { readLoginData } from "../../loginData";
import MicButton from "../../components/MicButton";

function toLocalISOString(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().split("T")[0];
}

function buildTranscriptFromHistory(hist) {
  if (!hist || hist.length === 0) return "";
  return hist.filter((m) => m.who !== "system").map((m) => {
    let label = m.who === "assistant" ? "AI Assistant" : m.speaker === "doctor" ? "Doctor" : m.speaker === "patient" ? "Patient" : "You";
    return label + ": " + m.text;
  }).join("\n\n");
}

function ClinicalResponseCard({ text }) {
  if (!text) return null;
  return (
    <div>
      {text.split("\n").map((line, i) => {
        const sec = line.match(/^\*\*(.+?)\*\*:?\s*$/);
        if (sec) return <div key={i} style={{ color: "#1d4ed8", fontWeight: 700, fontSize: 11, marginTop: 12, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #dbeafe", paddingBottom: 3 }}>{sec[1]}</div>;
        if (/^[⚠]/.test(line)) return <div key={i} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 5, padding: "5px 9px", color: "#dc2626", fontSize: 12, marginTop: 3 }}>{line}</div>;
        if (line.match(/^[-*•]\s+/) || line.match(/^\d+\.\s+/)) return <div key={i} style={{ display: "flex", gap: 7, padding: "2px 0", fontSize: 12, color: "#374151" }}><span style={{ color: "#1d4ed8", fontWeight: 700 }}>&bull;</span><span>{line.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "")}</span></div>;
        if (line.trim()) return <p key={i} style={{ margin: "3px 0", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{line}</p>;
        return null;
      })}
    </div>
  );
}

const MODES = [
  { key: "patient", label: "Patient Interview", desc: "AI conducts structured patient intake", color: "#7c3aed", lightBg: "#f5f3ff", orbGrad: "radial-gradient(circle at 30% 25%, rgba(167,139,250,0.85), rgba(124,58,237,0.5) 50%, rgba(109,40,217,0.15) 80%)", orbShadow: "0 0 70px rgba(124,58,237,0.35)" },
  { key: "listen",  label: "Passive Listen",    desc: "Transcribe doctor–patient conversation", color: "#0891b2", lightBg: "#ecfeff", orbGrad: "radial-gradient(circle at 30% 25%, rgba(103,232,249,0.85), rgba(8,145,178,0.5) 50%, rgba(7,89,133,0.15) 80%)", orbShadow: "0 0 70px rgba(8,145,178,0.35)" },
  { key: "doctor",  label: "Doctor Diagnostic", desc: "AI assists clinical reasoning", color: "#1d4ed8", lightBg: "#eff6ff", orbGrad: "radial-gradient(circle at 30% 25%, rgba(147,197,253,0.85), rgba(29,78,216,0.5) 50%, rgba(30,58,138,0.15) 80%)", orbShadow: "0 0 70px rgba(29,78,216,0.35)" },
];

export default function ClinicalReasoningDashboard() {
  const [searchParams] = useSearchParams();
  const login = readLoginData();
  const doctorId = login?.type === "Doctor" ? login.id : null;

  const [mode, setMode]                   = useState("patient");
  const [status, setStatus]               = useState("idle");
  const [userCaption, setUserCaption]     = useState("—");
  const [assistantCaption, setAssistantCaption] = useState("Select a mode above, then press Start.");
  const [history, setHistory]             = useState([]);
  const [errorMsg, setErrorMsg]           = useState("");
  const [currentSpeaker, setCurrentSpeaker] = useState("doctor");

  // Visit log fields
  const [patientIdInput, setPatientIdInput] = useState(() => searchParams.get("patientId") || "");
  const [visitDate, setVisitDate]   = useState(() => toLocalISOString(new Date()));
  const [startTime, setStartTime]   = useState("");
  const [endTime, setEndTime]       = useState("");
  const [reasonForVisit, setReasonForVisit] = useState("Clinical reasoning interview");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [saveLoading, setSaveLoading]       = useState(false);

  // Doctor review (Patient Interview mode)
  const [doctorVerdict, setDoctorVerdict] = useState(null); // "agree"|"partial"|"disagree"
  const [doctorNotes, setDoctorNotes]     = useState("");

  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg,  setSnackMsg]  = useState("");

  const pcRef           = useRef(null);
  const dcRef           = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteAudioRef  = useRef(null);
  const userLiveRef     = useRef("");
  const assistantLiveRef = useRef("");
  const assistantFinalRef = useRef("");
  const userFinalRef    = useRef("");
  const speakerRef      = useRef("doctor");
  const bottomRef       = useRef(null);

  useEffect(() => { speakerRef.current = currentSpeaker; }, [currentSpeaker]);
  useEffect(() => {
    const fromUrl = searchParams.get("patientId");
    if (fromUrl) setPatientIdInput(fromUrl);
  }, [searchParams]);
  useEffect(() => () => safeDisconnect(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const API_BASE = (
    import.meta.env.VITE_CLINICAL_REASONING_API_BASE || BASE_URL || "http://localhost:8080"
  ).replace(/\/$/, "");

  const isSupported = useMemo(() => (
    typeof RTCPeerConnection !== "undefined" &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  ), []);

  const showSnack = (msg) => { setSnackMsg(msg); setSnackOpen(true); };
  const setError  = (msg) => { setErrorMsg(msg); setStatus("error"); };

  const safeDisconnect = async () => {
    try {
      setStatus("idle");
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      try { dcRef.current?.close(); } catch {}
      dcRef.current = null;
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    } catch {}
  };

  const resetSession = () => {
    userLiveRef.current = assistantLiveRef.current = assistantFinalRef.current = userFinalRef.current = "";
    setUserCaption("—");
    setAssistantCaption("Ready. Press Start to begin.");
    setHistory([]);
    setErrorMsg("");
    setClinicalSummary("");
    setDoctorVerdict(null);
    setDoctorNotes("");
  };

  const handleModeChange = (newMode) => {
    if (status === "live" || status === "connecting") return;
    setMode(newMode);
    resetSession();
  };

  const startRealtime = async () => {
    if (!isSupported) { setError("Your browser doesn't support WebRTC microphone streaming."); return; }
    setStatus("connecting"); setErrorMsg("");
    try {
      const secretRes = await fetch(API_BASE + "/api/chat/realtime/client-secret?mode=" + encodeURIComponent(mode), { method: "GET", credentials: "include" });
      if (!secretRes.ok) throw new Error("Failed to get client secret: " + await secretRes.text());
      const secretJson = await secretRes.json();
      const ephemeralKey = secretJson?.client_secret?.value || secretJson?.value;
      if (!ephemeralKey) throw new Error("Backend did not return client_secret.value");

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (remoteAudioRef.current && stream) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.muted = mode === "listen";
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      const instrRes = await fetch(API_BASE + "/api/chat/get-instructions?mode=" + mode, { credentials: "include" });
      if (!instrRes.ok) throw new Error("Failed to fetch instructions");
      const { instructions } = await instrRes.json();

      dc.onopen = () => {
        setStatus("live");
        setHistory([{ who: "system", text: "Session started — " + (MODES.find((m2) => m2.key === mode)?.label) + "." }]);
        setAssistantCaption(mode === "listen" ? "Recording… Toggle speaker before each turn." : "Connected. Start speaking — I'm listening.");
        sendEvent({ type: "session.update", session: { type: "realtime", instructions, audio: { input: { turn_detection: { type: "server_vad" }, transcription: { model: "gpt-4o-mini-transcribe" } } } } });
      };
      dc.onmessage = (e) => { try { handleRealtimeEvent(JSON.parse(e.data)); } catch {} };
      dc.onerror = () => setError("Data channel error. Try again.");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(API_BASE + "/api/chat/realtime/sdp?model=gpt-realtime&mode=" + encodeURIComponent(mode), { method: "POST", headers: { "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!sdpRes.ok) throw new Error("SDP exchange failed: " + await sdpRes.text());
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
    } catch (err) {
      console.error(err);
      await safeDisconnect();
      setError(err?.message || "Failed to start realtime session.");
    }
  };

  const endRealtime  = async () => { await safeDisconnect(); setAssistantCaption("Session ended. Press Start to connect again."); };
  const sendEvent    = (obj) => { const dc = dcRef.current; if (dc?.readyState === "open") dc.send(JSON.stringify(obj)); };
  const commitToHistory = (who, text, extra = {}) => { const c = (text || "").trim(); if (!c) return; setHistory((h) => [...h, { who, text: c, ...extra }]); };

  const handleRealtimeEvent = (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "error") { setError(msg?.error?.message || "Unknown realtime error"); return; }
    if (msg.type === "input_audio_transcription.delta" || msg.type === "conversation.item.input_audio_transcription.delta") {
      const d = msg.delta || msg?.transcription?.delta || "";
      if (d) { userLiveRef.current += d; setUserCaption(userLiveRef.current.trim() || "—"); }
      return;
    }
    if (msg.type === "input_audio_transcription.completed" || msg.type === "conversation.item.input_audio_transcription.completed") {
      const t = msg.text || msg.transcript || msg?.transcription?.text || userLiveRef.current || "";
      if (t.trim()) { userFinalRef.current = t.trim(); commitToHistory("you", t.trim(), { speaker: speakerRef.current }); setUserCaption(t.trim()); }
      userLiveRef.current = "";
      return;
    }
    if (msg.type === "response.output_audio_transcript.delta" || msg.type === "response.audio_transcript.delta") {
      const d = msg.delta || "";
      if (d) { assistantLiveRef.current += d; setAssistantCaption(assistantLiveRef.current.trim() || "…"); }
      return;
    }
    if (msg.type === "response.output_audio_transcript.done" || msg.type === "response.audio_transcript.done" || msg.type === "response.completed") {
      const t = msg.transcript || msg.text || assistantLiveRef.current || assistantFinalRef.current || "";
      if (t.trim()) { assistantFinalRef.current = t.trim(); commitToHistory("assistant", t.trim()); setAssistantCaption(t.trim()); }
      assistantLiveRef.current = "";
      return;
    }
  };

  const handleGenerateSummary = async () => {
    const transcript = buildTranscriptFromHistory(history);
    if (!transcript.trim()) { showSnack("Run a session first — nothing to summarize."); return; }
    setSummaryLoading(true);
    try {
      const res = await fetch(API_BASE + "/api/chat/clinical-interview/summary", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ transcript }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.details || res.statusText);
      if (data.summary) setClinicalSummary(data.summary);
      else throw new Error("No summary returned");
    } catch (e) { console.error(e); showSnack(e?.message || "Could not generate summary."); }
    finally { setSummaryLoading(false); }
  };

  const handleSaveVisit = async () => {
    if (!doctorId) { showSnack("Only logged-in doctors can save a visit record."); return; }
    const patientId = String(patientIdInput || "").trim();
    if (!patientId) { showSnack("Enter a Patient ID to save."); return; }

    let notes;
    if (mode === "patient") {
      if (doctorVerdict === "agree")    notes = clinicalSummary;
      else if (doctorVerdict === "partial") notes = "AI Recommendation:\n" + clinicalSummary + "\n\nDoctor's Additional Notes:\n" + doctorNotes;
      else if (doctorVerdict === "disagree") notes = doctorNotes;
      else notes = clinicalSummary;
    } else {
      notes = clinicalSummary;
    }

    if (!notes.trim()) { showSnack("Add observations or generate a summary before saving."); return; }
    setSaveLoading(true);
    try {
      const backendBase = (BASE_URL || "").replace(/\/$/, "");
      await axios.post(backendBase + "/saveVisit", { doctorId, patientId, visitDate, startTime, endTime, reasonForVisit: reasonForVisit || "Clinical reasoning interview", notes }, { withCredentials: false, headers: { "Content-Type": "application/json" } });
      showSnack("Visit saved to patient record.");
    } catch (e) { showSnack(e?.response?.data?.error || e.message || "Save failed."); }
    finally { setSaveLoading(false); }
  };

  const activeMode = MODES.find((m) => m.key === mode);
  const isLive = status === "live", isConnecting = status === "connecting";
  const orbClass = isConnecting ? "orb orb-pulse" : isLive ? "orb orb-wobble" : status === "error" ? "orb orb-error" : "orb";

  // ── Shared voice controls ──────────────────────────────────────────────────
  const VoiceControls = ({ captionYouLabel = "You", showAssistantCaption = true }) => (
    <>
      <div className={orbClass} style={{ background: activeMode.orbGrad, boxShadow: activeMode.orbShadow }} />
      <div className="status-badge">{status === "idle" ? "Ready" : status === "connecting" ? "Connecting…" : status === "live" ? "Live" : "Error"}</div>
      {errorMsg && <div className="error-banner">{errorMsg}</div>}
      <div className="caption-block" style={{ borderLeftColor: activeMode.color }}>
        <div className="caption-label">{captionYouLabel}</div>
        <div className="caption-text">{userCaption || "—"}</div>
      </div>
      {showAssistantCaption && (
        <div className="caption-block" style={{ borderLeftColor: "#1d4ed8" }}>
          <div className="caption-label">AI Response</div>
          <div className="caption-text">{assistantCaption}</div>
        </div>
      )}
      <div className="btn-row">
        <button className="btn-primary" style={{ background: isLive ? "#dc2626" : activeMode.color }} onClick={isLive || isConnecting ? endRealtime : startRealtime} disabled={!isSupported || isConnecting}>
          {isConnecting ? "Connecting…" : isLive ? "End Session" : "Start Session"}
        </button>
        <button className="btn-secondary" onClick={resetSession} disabled={isConnecting || isLive}>Reset</button>
      </div>
    </>
  );

  // ── Visit Log / Observations panel ────────────────────────────────────────
  const VisitLogPanel = () => {
    const isDocMode = mode === "doctor";
    const isPatMode = mode === "patient";

    const isListenMode = mode === "listen";
    const unsupported = () => showSnack("Voice dictation not supported in this browser.");

    return (
      <div className="panel panel-scroll">
        <div className="panel-header">Visit Log</div>

        <label className="form-label">Patient ID</label>
        <input className="form-input" type="number" placeholder="e.g. 132" value={patientIdInput} onChange={(e) => setPatientIdInput(e.target.value)} />

        <label className="form-label">Date of visit</label>
        <input className="form-input" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><label className="form-label">Start</label><input className="form-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label className="form-label">End</label><input className="form-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
        </div>

        <label className="form-label">Reason for visit</label>
        <input className="form-input" type="text" value={reasonForVisit} onChange={(e) => setReasonForVisit(e.target.value)} />

        {/* Generate AI Summary — only for patient and listen modes */}
        {!isDocMode && (
          <button className="btn-outline" style={{ color: "#1d4ed8", borderColor: "#1d4ed8", marginTop: 6 }}
            onClick={handleGenerateSummary}
            disabled={summaryLoading || history.filter((m) => m.who !== "system").length === 0}>
            {summaryLoading ? "Generating…" : "Generate AI Summary"}
          </button>
        )}

        {/* Observations (doctor mode) / Summary (passive listen) label row with mic button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          <label className="form-label">{isDocMode ? "Observations" : "Summary (editable)"}</label>
          {(isDocMode || isListenMode) && (
            <MicButton className="dictate-btn" title="Click to dictate" onUnsupported={unsupported}
              onResult={(t) => setClinicalSummary((prev) => (prev ? prev + " " + t : t))} />
          )}
        </div>
        <textarea className="form-textarea" rows={isDocMode ? 9 : 6}
          value={clinicalSummary} onChange={(e) => setClinicalSummary(e.target.value)}
          placeholder={isDocMode ? "Type or click the mic to dictate observations…" : isListenMode ? "Click Generate AI Summary, type notes, or use the mic…" : "Click Generate AI Summary or type notes…"} />

        {/* Save button — patient mode uses Doctor Review's Send button instead */}
        {!isPatMode && (
          <button className="btn-primary" style={{ background: "#16a34a", marginTop: 4 }} onClick={handleSaveVisit} disabled={saveLoading || !doctorId}>
            {saveLoading ? "Saving…" : "Save to Record"}
          </button>
        )}
        {!doctorId && <div className="form-hint">Log in as Doctor to save.</div>}
        {doctorId && <div className="form-hint">Doctor ID: {doctorId}</div>}
      </div>
    );
  };

  // ── Doctor Review panel (Patient Interview only) ───────────────────────────
  const VERDICTS = [
    { key: "agree",    label: "Agree",           color: "#16a34a" },
    { key: "partial",  label: "Partially Agree", color: "#d97706" },
    { key: "disagree", label: "Disagree",        color: "#dc2626" },
  ];

  const DoctorReviewPanel = () => {
    const canSend = doctorVerdict === "agree" || ((doctorVerdict === "partial" || doctorVerdict === "disagree") && doctorNotes.trim());
    return (
      <div className="panel" style={{ borderTop: "3px solid #7c3aed", gap: 10, flexShrink: 0 }}>
        <div className="panel-header">Doctor Review</div>

        {/* Verdict selector */}
        <div className="verdict-row">
          {VERDICTS.map((v) => (
            <button key={v.key} className="verdict-btn"
              style={doctorVerdict === v.key ? { background: v.color, color: "#fff", borderColor: v.color } : {}}
              onClick={() => { setDoctorVerdict(v.key); if (v.key === "agree") setDoctorNotes(""); }}>
              {v.label}
            </button>
          ))}
        </div>

        {/* AI recommendation — shown for agree and partial */}
        {(doctorVerdict === "agree" || doctorVerdict === "partial") && (
          <div className="ai-rec-box">
            <div className="form-label" style={{ color: "#1d4ed8", marginBottom: 6 }}>AI Recommendation</div>
            <ClinicalResponseCard text={clinicalSummary} />
          </div>
        )}

        {/* Doctor's own notes — shown for partial and disagree */}
        {(doctorVerdict === "partial" || doctorVerdict === "disagree") && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label className="form-label">
                {doctorVerdict === "partial" ? "Doctor's Additional Notes" : "Doctor's Recommendation"}
              </label>
              <MicButton className="dictate-btn" title="Click to dictate"
                onUnsupported={() => showSnack("Voice dictation not supported in this browser.")}
                onResult={(t) => setDoctorNotes((prev) => (prev ? prev + " " + t : t))} />
            </div>
            <textarea className="form-textarea" rows={4} value={doctorNotes} onChange={(e) => setDoctorNotes(e.target.value)}
              placeholder={doctorVerdict === "partial" ? "Add your additional clinical notes… or use the mic" : "Enter your clinical recommendation… or use the mic"} />
          </>
        )}

        {/* Send to dataset */}
        {doctorVerdict && (
          <button className="btn-primary" style={{ background: canSend ? "#16a34a" : "#94a3b8" }}
            onClick={handleSaveVisit} disabled={saveLoading || !doctorId || !canSend}>
            {saveLoading ? "Saving…" : "Send to eHospital"}
          </button>
        )}
        {!doctorId && doctorVerdict && <div className="form-hint">Log in as Doctor to send.</div>}
      </div>
    );
  };

  // ── Mode: Patient Interview ────────────────────────────────────────────────
  const renderPatient = () => (
    <div className="grid-3col">
      {/* Voice */}
      <div className="panel panel-voice-area">
        <VoiceControls captionYouLabel="Patient (You)" />
      </div>

      {/* Conversation */}
      <div className="panel panel-scroll">
        <div className="panel-header">Conversation</div>
        <div className="log-scroll">
          {history.length === 0
            ? <div className="log-empty">Your conversation will appear here once the session begins.</div>
            : history.map((m, i) => {
                if (m.who === "system") return <div key={i} className="msg msg-system"><span>{m.text}</span></div>;
                return (
                  <div key={i} className={"msg " + (m.who === "assistant" ? "msg-ai" : "msg-patient")}>
                    <div className="msg-who">{m.who === "assistant" ? "AI" : "Patient"}</div>
                    <div className="msg-text">{m.text}</div>
                  </div>
                );
              })
          }
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Right column: Visit Log + Doctor Review */}
      <div className="right-col-stack">
        <VisitLogPanel />
        <DoctorReviewPanel />
      </div>
    </div>
  );

  // ── Mode: Passive Listen ───────────────────────────────────────────────────
  const renderListen = () => {
    const doctorLines  = history.filter((m) => m.speaker === "doctor");
    const patientLines = history.filter((m) => m.speaker === "patient");
    const hasContent   = history.filter((m) => m.who !== "system").length > 0;
    return (
      <div className="grid-listen-outer">
        {/* Left: controls + two-column transcript + generate button */}
        <div className="grid-listen-inner">
          {/* Controls */}
          <div className="panel listen-controls-panel">
            <div className="listen-top-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={"record-dot" + (isLive ? " record-dot-live" : "")} />
                <span className="panel-header" style={{ margin: 0 }}>{isLive ? "Recording in progress…" : "Ready to record"}</span>
              </div>
              <div className="btn-row" style={{ margin: 0 }}>
                <button className="btn-primary" style={{ background: isLive ? "#dc2626" : activeMode.color }}
                  onClick={isLive || isConnecting ? endRealtime : startRealtime} disabled={!isSupported || isConnecting}>
                  {isConnecting ? "Connecting…" : isLive ? "Stop Recording" : "Start Recording"}
                </button>
                <button className="btn-secondary" onClick={resetSession} disabled={isConnecting || isLive}>Clear</button>
              </div>
            </div>
            {errorMsg && <div className="error-banner">{errorMsg}</div>}
            {isLive && (
              <>
                <div className="speaker-toggle-row">
                  <span className="form-label" style={{ margin: 0 }}>Who is speaking now?</span>
                  <div className="speaker-pills">
                    <button className={"speaker-pill" + (currentSpeaker === "doctor" ? " speaker-pill-active" : "")}
                      style={currentSpeaker === "doctor" ? { background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" } : {}}
                      onClick={() => setCurrentSpeaker("doctor")}>🩺 Doctor</button>
                    <button className={"speaker-pill" + (currentSpeaker === "patient" ? " speaker-pill-active" : "")}
                      style={currentSpeaker === "patient" ? { background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" } : {}}
                      onClick={() => setCurrentSpeaker("patient")}>👤 Patient</button>
                  </div>
                </div>
                <div className="live-strip">
                  <span className="caption-label">Live:</span>
                  <span className="live-text">{userCaption !== "—" ? userCaption : "…listening…"}</span>
                </div>
              </>
            )}
          </div>

          {/* Two-column transcript */}
          <div className="listen-cols">
            <div className="panel panel-scroll" style={{ borderTop: "3px solid #1d4ed8" }}>
              <div className="panel-header" style={{ color: "#1d4ed8" }}>🩺 Doctor Transcript</div>
              <div className="log-scroll">
                {doctorLines.length === 0
                  ? <div className="log-empty">Doctor speech will appear here.<br />Toggle "Doctor" before speaking.</div>
                  : doctorLines.map((m, i) => <div key={i} className="transcript-row transcript-doctor"><div className="msg-text">{m.text}</div></div>)
                }
              </div>
            </div>
            <div className="panel panel-scroll" style={{ borderTop: "3px solid #7c3aed" }}>
              <div className="panel-header" style={{ color: "#7c3aed" }}>👤 Patient Transcript</div>
              <div className="log-scroll">
                {patientLines.length === 0
                  ? <div className="log-empty">Patient speech will appear here.<br />Toggle "Patient" before speaking.</div>
                  : patientLines.map((m, i) => <div key={i} className="transcript-row transcript-patient"><div className="msg-text">{m.text}</div></div>)
                }
              </div>
            </div>
          </div>

          {/* Generate summary strip */}
          <div className="panel" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: "12px 14px" }}>
            <button className="btn-primary" style={{ background: activeMode.color }}
              onClick={handleGenerateSummary} disabled={summaryLoading || !hasContent}>
              {summaryLoading ? "Generating…" : "Generate Clinical Summary"}
            </button>
            {clinicalSummary && <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>✓ Summary ready — see Visit Log</span>}
          </div>
        </div>

        {/* Right: Visit Log */}
        <VisitLogPanel />
      </div>
    );
  };

  // ── Mode: Doctor Diagnostic ────────────────────────────────────────────────
  const renderDoctor = () => (
    <div style={{ maxWidth: 640, height: "100%" }}>
      <VisitLogPanel />
    </div>
  );

  // ── Root render ─────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo"><span style={{ color: "#fff", fontWeight: 900 }}>e</span><span style={{ color: "#93c5fd", fontWeight: 900 }}>Hospital</span></div>
          <div className="header-sep" />
          <span className="header-title">Clinical AI Assistant</span>
        </div>
        <div className="header-right">
          <div className={"hdr-dot " + (isLive ? "hdr-dot-live" : isConnecting ? "hdr-dot-connecting" : "hdr-dot-idle")} />
          <span className="hdr-status-text">{isLive ? "Session Live" : isConnecting ? "Connecting…" : "Ready"}</span>
          {login?.name && <span className="hdr-user">{login.name}</span>}
        </div>
      </header>

      <nav className="mode-bar">
        {MODES.map((m) => (
          <button key={m.key} className={"mode-tab" + (mode === m.key ? " mode-tab-active" : "")}
            style={mode === m.key ? { "--tc": m.color, "--tb": m.lightBg } : {}}
            onClick={() => handleModeChange(m.key)} disabled={isLive || isConnecting}
            title={isLive ? "End the session first to switch modes" : ""}>
            <div className="mode-tab-title">{m.label}</div>
            <div className="mode-tab-sub">{m.desc}</div>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {mode === "patient" && renderPatient()}
        {mode === "listen"  && renderListen()}
        {mode === "doctor"  && renderDoctor()}
      </main>

      <audio ref={remoteAudioRef} autoPlay playsInline />
      {snackOpen && (
        <div className="snackbar" onClick={() => setSnackOpen(false)}>
          {snackMsg}<button className="snack-close">×</button>
        </div>
      )}
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f0f4f8; }
.app-shell { min-height: 100vh; height: 100vh; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif; color: #0f172a; background: #f0f4f8; overflow: hidden; }

/* Header */
.app-header { flex-shrink: 0; height: 52px; background: #1e3a8a; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; box-shadow: 0 2px 8px rgba(30,58,138,0.35); }
.header-brand { display: flex; align-items: center; gap: 14px; }
.header-logo { background: rgba(255,255,255,0.15); border-radius: 7px; padding: 3px 10px; font-size: 15px; letter-spacing: -0.3px; }
.header-sep { width: 1px; height: 18px; background: rgba(255,255,255,0.18); }
.header-title { color: #bfdbfe; font-size: 14px; font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 10px; }
.hdr-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.hdr-dot-live { background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: blink 1.6s ease-in-out infinite; }
.hdr-dot-connecting { background: #f59e0b; animation: blink 0.8s ease-in-out infinite; }
.hdr-dot-idle { background: #64748b; }
.hdr-status-text { color: #bfdbfe; font-size: 12px; font-weight: 500; }
.hdr-user { color: #93c5fd; font-size: 12px; margin-left: 6px; }
@keyframes blink { 0%,100%{ opacity:1 } 50%{ opacity:0.35 } }

/* Mode bar */
.mode-bar { flex-shrink: 0; display: flex; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 0 20px; }
.mode-tab { padding: 12px 22px; border: none; background: none; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; text-align: left; transition: background 0.12s; border-right: 1px solid #f1f5f9; }
.mode-tab:hover:not(:disabled) { background: #f8fafc; }
.mode-tab:disabled { opacity: 0.45; cursor: not-allowed; }
.mode-tab-active { border-bottom-color: var(--tc); background: var(--tb) !important; }
.mode-tab-title { font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1.3; }
.mode-tab-active .mode-tab-title { color: var(--tc); }
.mode-tab-sub { font-size: 11px; color: #94a3b8; margin-top: 1px; white-space: nowrap; }

/* Main */
.app-main { flex: 1; padding: 14px 18px; overflow: hidden; min-height: 0; }

/* Grids */
.grid-3col { display: grid; grid-template-columns: 300px minmax(0,1fr) 290px; gap: 14px; height: 100%; }
.grid-2col { display: grid; grid-template-columns: 300px minmax(0,1fr); gap: 14px; height: 100%; }
.grid-listen-outer { display: grid; grid-template-columns: minmax(0,1fr) 290px; gap: 14px; height: 100%; }
.grid-listen-inner { display: grid; grid-template-rows: auto 1fr auto; gap: 14px; min-height: 0; }
.listen-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; min-height: 0; }

/* Right column stack (patient mode) */
.right-col-stack { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; min-height: 0; }

/* Panel */
.panel { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.06); padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.panel-scroll { overflow-y: auto; }
.panel-voice-area { align-items: center; justify-content: center; gap: 12px; }
.panel-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; flex-shrink: 0; }

/* Orb */
.orb { width: 148px; height: 148px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.5); flex-shrink: 0; }
@keyframes orbPulse { 0%,100%{transform:scale(1);filter:brightness(1)} 50%{transform:scale(1.05);filter:brightness(1.15)} }
@keyframes orbWobble { 0%,100%{transform:scale(1) rotate(0deg)} 25%{transform:scale(1.025) rotate(-0.5deg)} 75%{transform:scale(1.025) rotate(0.5deg)} }
.orb-pulse { animation: orbPulse 1.4s ease-in-out infinite; }
.orb-wobble { animation: orbWobble 1.1s ease-in-out infinite; }
.orb-error { filter: hue-rotate(150deg) brightness(0.75); }

.status-badge { font-size: 12px; color: #64748b; font-weight: 500; }
.error-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; color: #dc2626; font-size: 12px; width: 100%; text-align: center; }
.caption-block { background: #f8fafc; border: 1px solid #e2e8f0; border-left-width: 3px; border-radius: 8px; padding: 10px 12px; width: 100%; }
.caption-label { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.caption-text { font-size: 13px; color: #1e293b; line-height: 1.45; white-space: pre-wrap; }

/* Buttons */
.btn-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 2px; }
.btn-primary { background: #1d4ed8; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 700; cursor: pointer; transition: filter 0.12s, transform 0.1s; }
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-outline { background: transparent; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; }
.btn-outline:hover:not(:disabled) { background: #eff6ff; }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

/* Log */
.log-scroll { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; min-height: 0; }
.log-empty { color: #94a3b8; font-size: 12px; padding: 18px; border: 1px dashed #e2e8f0; border-radius: 8px; text-align: center; line-height: 1.6; }
.msg { border-radius: 8px; padding: 9px 11px; }
.msg-who { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
.msg-text { font-size: 13px; line-height: 1.45; color: #1e293b; white-space: pre-wrap; }
.msg-ai { background: #eff6ff; border: 1px solid #bfdbfe; }
.msg-ai .msg-who { color: #1d4ed8; }
.msg-patient { background: #f5f3ff; border: 1px solid #ddd6fe; }
.msg-patient .msg-who { color: #7c3aed; }
.msg-system { background: #f8fafc; border: 1px solid #e2e8f0; }
.msg-system span { font-size: 11px; color: #94a3b8; font-style: italic; }

/* Forms */
.form-label { font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.03em; }
.form-hint  { font-size: 11px; color: #9ca3af; }
.form-input { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; color: #0f172a; width: 100%; outline: none; font-family: inherit; }
.form-input:focus { border-color: #93c5fd; box-shadow: 0 0 0 2px rgba(147,197,253,0.25); }
.form-textarea { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 13px; color: #0f172a; width: 100%; resize: vertical; outline: none; font-family: inherit; line-height: 1.45; }
.form-textarea:focus { border-color: #93c5fd; box-shadow: 0 0 0 2px rgba(147,197,253,0.25); }

/* Voice dictation buttons */
.dictate-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 10px; font-size: 13px; font-weight: 700; cursor: pointer; color: #475569; transition: background 0.12s; white-space: nowrap; }
.dictate-btn:hover:not(:disabled) { background: #dbeafe; border-color: #93c5fd; color: #1d4ed8; }
.dictate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.dictate-btn.mic-btn-active { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

/* Listen mode */
.listen-controls-panel { flex-direction: column; gap: 10px; }
.listen-top-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.record-dot { width: 10px; height: 10px; border-radius: 50%; background: #94a3b8; flex-shrink: 0; }
.record-dot-live { background: #ef4444; box-shadow: 0 0 8px #ef4444; animation: blink 0.7s ease-in-out infinite; }
.speaker-toggle-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.speaker-pills { display: flex; gap: 8px; }
.speaker-pill { border: 1px solid #e2e8f0; background: #f1f5f9; color: #475569; border-radius: 20px; padding: 6px 16px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
.speaker-pill:hover { background: #e2e8f0; }
.live-strip { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
.live-text { color: #1e293b; font-style: italic; flex: 1; }
.transcript-row { border-radius: 7px; padding: 8px 10px; margin-bottom: 6px; }
.transcript-doctor { background: #eff6ff; border-left: 3px solid #1d4ed8; }
.transcript-patient { background: #f5f3ff; border-left: 3px solid #7c3aed; }

/* Doctor mode hint */
.mode-hint { font-size: 12px; color: #64748b; text-align: center; line-height: 1.5; padding: 10px 4px 0; border-top: 1px solid #e2e8f0; }

/* Doctor Review panel */
.verdict-row { display: flex; gap: 8px; flex-wrap: wrap; }
.verdict-btn { flex: 1; min-width: 80px; border: 1px solid #e2e8f0; background: #f8fafc; color: #374151; border-radius: 8px; padding: 8px 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s; text-align: center; }
.verdict-btn:hover { background: #f1f5f9; }
.ai-rec-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px; max-height: 180px; overflow-y: auto; }

/* Snackbar */
.snackbar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #f1f5f9; padding: 11px 18px; border-radius: 8px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.28); z-index: 9999; cursor: pointer; max-width: 440px; }
.snack-close { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; }

/* Scrollbars */
.log-scroll::-webkit-scrollbar, .panel-scroll::-webkit-scrollbar, .right-col-stack::-webkit-scrollbar { width: 4px; }
.log-scroll::-webkit-scrollbar-thumb, .panel-scroll::-webkit-scrollbar-thumb, .right-col-stack::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }

/* Responsive */
@media (max-width: 1100px) {
  .grid-3col, .grid-2col, .grid-listen-outer { grid-template-columns: 1fr; overflow-y: auto; height: auto; }
  .listen-cols { grid-template-columns: 1fr; }
  .app-shell, .app-main { overflow-y: auto; height: auto; }
}
`;
