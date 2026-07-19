import React from "react";
import { useVoiceDictation } from "../hooks/useVoiceDictation";

// Small reusable "speak to fill this field" button. Drop next to any
// input/textarea and hand it an onResult(transcript) callback.
export default function MicButton({ onResult, onUnsupported, className = "mic-btn", style, title = "Speak to fill this field" }) {
  const { listening, isSupported, start } = useVoiceDictation();

  const handleClick = () => {
    if (!isSupported) { onUnsupported?.(); return; }
    start(onResult);
  };

  return (
    <button type="button" className={className + (listening ? " mic-btn-active" : "")}
      style={style} onClick={handleClick} disabled={listening} title={title}>
      {listening ? "\u{1F534}" : "\u{1F399}\u{FE0F}"}
    </button>
  );
}
