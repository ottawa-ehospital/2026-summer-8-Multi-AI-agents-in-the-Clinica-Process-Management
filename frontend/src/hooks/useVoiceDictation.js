import { useRef, useState } from "react";

// Shared Web Speech API dictation hook. One instance per field so multiple
// mic buttons on the same page can listen independently.
export function useVoiceDictation() {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const isSupported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = (onResult) => {
    if (!isSupported || listening) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    recRef.current = rec;
    rec.onresult = (e) => onResult(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const stop = () => { try { recRef.current?.stop(); } catch {} };

  return { listening, isSupported, start, stop };
}
