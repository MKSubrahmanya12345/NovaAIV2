import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { axiosInstance } from "../lib/axios.js";

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const DEFAULT_AUTO_SEND_DELAY_MS = 3000;
const HOLD_ONE_DELAY_MS = 10000;
const HOLD_ONE_PATTERN = /\bhold one\b/i;

const hasMediaRecorder = () => {
  if (typeof window === "undefined") return false;
  return Boolean(window.MediaRecorder) && Boolean(navigator?.mediaDevices?.getUserMedia);
};

const hasAudioPlayback = () => {
  if (typeof window === "undefined") return false;
  return typeof window.Audio !== "undefined";
};

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = String(reader.result || "");
      const commaIndex = value.indexOf(",");
      if (commaIndex === -1) {
        resolve(value);
        return;
      }

      resolve(value.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to encode audio payload"));
    reader.readAsDataURL(blob);
  });
};

const normalizeLanguage = (value = "en-US") => {
  const text = String(value || "").trim();
  if (!text) return "en";
  return text.split("-")[0] || "en";
};

const getRecorderMimeType = () => {
  if (typeof window === "undefined" || !window.MediaRecorder?.isTypeSupported) {
    return "";
  }

  const preferred = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];

  for (const type of preferred) {
    if (window.MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return "";
};

const extractErrorDetails = (event) => {
  const status = Number(event?.response?.status || 0);
  const message = String(
    event?.response?.data?.details ||
    event?.response?.data?.error ||
    event?.message ||
    "Unknown voice error"
  ).trim();

  return {
    status,
    message,
    code: String(event?.response?.data?.code || "voice_error")
  };
};

const uniqueChunks = (list) => {
  const seen = new Set();
  const output = [];

  for (const item of list) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    output.push(item);
  }

  return output;
};

const normalizeSpeechText = (value = "") => {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
};

const mergeTranscriptWindows = (previousText = "", nextText = "") => {
  const previous = normalizeSpeechText(previousText);
  const next = normalizeSpeechText(nextText);

  if (!previous) return next;
  if (!next) return previous;
  if (previous === next) return previous;

  // If one window fully contains the other, prefer the longer one.
  if (next.includes(previous)) return next;
  if (previous.includes(next)) return previous;

  // Otherwise join by the largest suffix/prefix overlap.
  const maxOverlap = Math.min(previous.length, next.length);
  for (let size = maxOverlap; size >= 1; size -= 1) {
    if (previous.slice(-size) === next.slice(0, size)) {
      return `${previous}${next.slice(size)}`.trim();
    }
  }

  return `${previous} ${next}`.trim();
};

const stripControlPhrases = (value = "") => {
  const next = String(value || "")
    .replace(/\bhold one\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:!?\-\s]+|[,.;:!?\-\s]+$/g, "")
    .trim();

  return next;
};

export default function useVoiceGuidance({
  enabled,
  rate,
  handsFree,
  language = "en-US",
  onFinalTranscript,
  onInterimTranscript,
  onError,
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [diagnostics, setDiagnostics] = useState({
    sttAttempts: 0,
    sttSuccess: 0,
    sttFailures: 0,
    lastChunkBytes: 0,
    lastSttStatus: 0,
    lastTtsStatus: 0,
    lastError: "",
    recorderMimeType: ""
  });

  const enabledRef = useRef(enabled);
  const handsFreeRef = useRef(handsFree);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const chunkTranscribeLockRef = useRef(false);
  const lastCaptionTranscribeAtRef = useRef(0);
  const autoSendTimerRef = useRef(null);
  const latestInterimRef = useRef("");
  const shouldListenRef = useRef({ active: false, restartTimer: null });
  const ttsRef = useRef({ audio: null, url: "" });
  const ttsTokenRef = useRef(0);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  const onErrorRef = useRef(onError);
  const lastChunkErrorAtRef = useRef(0);

  const patchDiagnostics = useCallback((partial) => {
    setDiagnostics((prev) => {
      if (typeof partial === "function") {
        return partial(prev);
      }
      return { ...prev, ...partial };
    });
  }, []);

  const clearRestartTimer = useCallback(() => {
    const timerId = shouldListenRef.current.restartTimer;
    if (timerId) {
      window.clearTimeout(timerId);
      shouldListenRef.current.restartTimer = null;
    }
  }, []);

  const clearAutoSendTimer = useCallback(() => {
    const timerId = autoSendTimerRef.current;
    if (timerId) {
      window.clearTimeout(timerId);
      autoSendTimerRef.current = null;
    }
  }, []);

  const finalizeBufferedTranscript = useCallback(() => {
    const bufferedText = normalizeSpeechText(latestInterimRef.current);
    if (!bufferedText) return;

    const cleaned = stripControlPhrases(bufferedText);
    latestInterimRef.current = "";
    onInterimTranscriptRef.current?.("");

    if (!cleaned) {
      return;
    }

    onFinalTranscriptRef.current?.({
      text: cleaned,
      autoSend: Boolean(enabledRef.current)
    });
  }, []);

  const scheduleAutoSendFromSilence = useCallback((currentTranscript) => {
    clearAutoSendTimer();

    const delayMs = HOLD_ONE_PATTERN.test(String(currentTranscript || ""))
      ? HOLD_ONE_DELAY_MS
      : DEFAULT_AUTO_SEND_DELAY_MS;

    autoSendTimerRef.current = window.setTimeout(() => {
      finalizeBufferedTranscript();
    }, delayMs);
  }, [clearAutoSendTimer, finalizeBufferedTranscript]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onInterimTranscriptRef.current = onInterimTranscript;
  }, [onInterimTranscript]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const isSpeechSupported = useMemo(() => hasAudioPlayback(), []);
  const isRecognitionSupported = useMemo(() => hasMediaRecorder(), []);
  const isVoiceSupported = isSpeechSupported || isRecognitionSupported;

  const stopSpeaking = useCallback(() => {
    ttsTokenRef.current += 1;
    const current = ttsRef.current;

    if (current.audio) {
      try {
        current.audio.pause();
      } catch {
        // Ignore pause errors during cleanup.
      }
    }

    if (current.url) {
      URL.revokeObjectURL(current.url);
    }

    ttsRef.current = { audio: null, url: "" };
    setIsSpeaking(false);
  }, []);

  const releaseStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream) return;

    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore stop errors.
      }
    }

    mediaStreamRef.current = null;
  }, []);

  const transcribeChunkForCaption = useCallback(async (chunk) => {
    if (!chunk || chunk.size === 0) return;
    if (chunkTranscribeLockRef.current) return;

    const now = Date.now();
    if (now - lastCaptionTranscribeAtRef.current < 1200) return;

    const allChunks = chunksRef.current;
    if (allChunks.length === 0) return;

    const recorderMime = mediaRecorderRef.current?.mimeType || chunk.type || "audio/webm";

    // Use a complete accumulated recording window so container metadata remains valid.
    const stitchedBlob = new Blob(uniqueChunks(allChunks), {
      type: recorderMime
    });

    if (!stitchedBlob || stitchedBlob.size === 0) return;

    if (stitchedBlob.size > MAX_CHUNK_BYTES) {
      patchDiagnostics((prev) => ({
        ...prev,
        sttFailures: prev.sttFailures + 1,
        lastChunkBytes: stitchedBlob.size,
        lastSttStatus: 413,
        lastError: `Skipped oversized chunk (${Math.round(stitchedBlob.size / 1024)} KB)`
      }));

      const now = Date.now();
      if (now - lastChunkErrorAtRef.current > 2000) {
        lastChunkErrorAtRef.current = now;
        onErrorRef.current?.({
          code: "payload_too_large",
          recoverable: true,
          message: "Microphone chunk was too large. Continuing with smaller chunks."
        });
      }
      return;
    }

    chunkTranscribeLockRef.current = true;
    lastCaptionTranscribeAtRef.current = now;
    patchDiagnostics((prev) => ({
      ...prev,
      sttAttempts: prev.sttAttempts + 1,
      lastChunkBytes: stitchedBlob.size
    }));

    try {
      const audioBase64 = await blobToBase64(stitchedBlob);
      const res = await axiosInstance.post("/voice/stt", {
        audioBase64,
        mimeType: recorderMime,
        language: normalizeLanguage(language),
        smartFormat: true
      });

      const transcript = normalizeSpeechText(res.data?.transcript || "");
      if (!transcript) return;

      const previous = latestInterimRef.current;
      const next = mergeTranscriptWindows(previous, transcript);
      latestInterimRef.current = next;
      onInterimTranscriptRef.current?.(next);
      scheduleAutoSendFromSilence(next);
      patchDiagnostics((prev) => ({
        ...prev,
        sttSuccess: prev.sttSuccess + 1,
        lastSttStatus: 200,
        lastError: ""
      }));
    } catch (event) {
      const details = extractErrorDetails(event);
      patchDiagnostics((prev) => ({
        ...prev,
        sttFailures: prev.sttFailures + 1,
        lastSttStatus: details.status,
        lastError: details.message
      }));

      const now = Date.now();
      if (now - lastChunkErrorAtRef.current > 1500) {
        lastChunkErrorAtRef.current = now;
        onErrorRef.current?.({
          code: details.code,
          recoverable: true,
          message: `STT failed${details.status ? ` (${details.status})` : ""}: ${details.message}`
        });
      }
    } finally {
      chunkTranscribeLockRef.current = false;
    }
  }, [language, patchDiagnostics, scheduleAutoSendFromSilence]);

  const internalStopListening = useCallback((permanent = true) => {
    clearRestartTimer();
    clearAutoSendTimer();

    if (permanent) {
      shouldListenRef.current.active = false;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be stopping.
      }
      return;
    }

    releaseStream();
    setIsListening(false);
  }, [clearAutoSendTimer, clearRestartTimer, releaseStream]);

  const startListening = useCallback(async () => {
    if (!enabledRef.current || !isRecognitionSupported) return;

    const activeRecorder = mediaRecorderRef.current;
    if (activeRecorder && activeRecorder.state !== "inactive") {
      return;
    }

    clearRestartTimer();
    shouldListenRef.current.active = true;
    chunksRef.current = [];
    lastCaptionTranscribeAtRef.current = 0;
    latestInterimRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorderMimeType = getRecorderMimeType();
      const recorder = recorderMimeType
        ? new MediaRecorder(stream, { mimeType: recorderMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      patchDiagnostics({ recorderMimeType: recorderMimeType || "browser-default" });

      recorder.onstart = () => {
        setIsListening(true);
        onInterimTranscriptRef.current?.("Listening...");
      };

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        chunksRef.current.push(event.data);
        transcribeChunkForCaption(event.data);
      };

      recorder.onerror = (event) => {
        onErrorRef.current?.({
          code: "mic_error",
          recoverable: true,
          message: `Microphone capture failed: ${event?.error?.name || "unknown"}`
        });
      };

      recorder.onstop = async () => {
        const shouldRestart = Boolean(enabledRef.current && handsFreeRef.current && shouldListenRef.current.active);

        mediaRecorderRef.current = null;
        releaseStream();
        setIsListening(false);

        clearAutoSendTimer();
        finalizeBufferedTranscript();

        chunksRef.current = [];

        if (shouldRestart) {
          clearRestartTimer();
          shouldListenRef.current.restartTimer = window.setTimeout(() => {
            startListening();
          }, 250);
        }
      };

      // Collect chunks frequently to avoid huge memory spikes.
      recorder.start(900);
    } catch {
      shouldListenRef.current.active = false;
      setIsListening(false);
      releaseStream();
      patchDiagnostics({
        lastError: "Microphone access blocked"
      });
      onErrorRef.current?.({
        code: "not-allowed",
        recoverable: false,
        message: "Microphone access is blocked. Allow microphone permission and try again."
      });
    }
  }, [clearAutoSendTimer, clearRestartTimer, finalizeBufferedTranscript, isRecognitionSupported, releaseStream, transcribeChunkForCaption]);

  const stopListening = useCallback(() => {
    internalStopListening(true);
  }, [internalStopListening]);

  const pauseForTyping = useCallback(() => {
    stopSpeaking();
    internalStopListening(true);
  }, [internalStopListening, stopSpeaking]);

  const speakText = useCallback(async (text) => {
    const nextText = String(text || "").trim();

    if (!enabledRef.current || !isSpeechSupported || !nextText) return;

    stopSpeaking();
    const token = ttsTokenRef.current + 1;
    ttsTokenRef.current = token;
    setIsSpeaking(true);

    try {
      const res = await axiosInstance.post("/voice/tts", {
        text: nextText,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
        language: normalizeLanguage(language),
        rate: Number.isFinite(rate) ? rate : 0.9
      });

      if (token !== ttsTokenRef.current) {
        return;
      }

      const base64 = String(res.data?.audioBase64 || "");
      const contentType = String(res.data?.contentType || "audio/mpeg");
      if (!base64) {
        throw new Error("TTS returned empty audio payload");
      }

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: contentType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      ttsRef.current = { audio, url };

      audio.onended = () => {
        if (ttsRef.current.url) {
          URL.revokeObjectURL(ttsRef.current.url);
        }
        ttsRef.current = { audio: null, url: "" };
        setIsSpeaking(false);
      };

      audio.onerror = () => {
        if (ttsRef.current.url) {
          URL.revokeObjectURL(ttsRef.current.url);
        }
        ttsRef.current = { audio: null, url: "" };
        setIsSpeaking(false);
        onErrorRef.current?.({
          code: "tts_failed",
          recoverable: true,
          message: "Voice playback failed"
        });
      };

      await audio.play();
    } catch (event) {
      const details = extractErrorDetails(event);
      setIsSpeaking(false);
      patchDiagnostics({
        lastTtsStatus: details.status,
        lastError: details.message
      });
      onErrorRef.current?.({
        code: "tts_failed",
        recoverable: true,
        message: details.message || "Speech synthesis failed"
      });
    }
  }, [isSpeechSupported, language, patchDiagnostics, rate, stopSpeaking]);

  useEffect(() => {
    if (!enabled) {
      shouldListenRef.current.active = false;
      internalStopListening(true);
      stopSpeaking();
      return;
    }

    if (handsFree && isRecognitionSupported) {
      startListening();
    }
  }, [enabled, handsFree, internalStopListening, isRecognitionSupported, startListening, stopSpeaking]);

  useEffect(() => {
    return () => {
      shouldListenRef.current.active = false;
      clearRestartTimer();
      clearAutoSendTimer();
      stopSpeaking();
      releaseStream();
    };
  }, [clearAutoSendTimer, clearRestartTimer, releaseStream, stopSpeaking]);

  const status = useMemo(() => {
    if (!isVoiceSupported) return "unavailable";
    if (isSpeaking && isListening) return "duplex";
    if (isSpeaking) return "speaking";
    if (isListening) return "listening";
    return "idle";
  }, [isListening, isSpeaking, isVoiceSupported]);

  return {
    isVoiceSupported,
    isSpeechSupported,
    isRecognitionSupported,
    isListening,
    isSpeaking,
    status,
    diagnostics,
    speakText,
    stopSpeaking,
    startListening,
    stopListening,
    pauseForTyping,
  };
}
