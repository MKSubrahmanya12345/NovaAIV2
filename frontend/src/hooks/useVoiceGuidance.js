import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const getRecognitionCtor = () => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const hasSpeechSynthesis = () => {
  if (typeof window === "undefined") return false;
  return typeof window.speechSynthesis !== "undefined";
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

  const enabledRef = useRef(enabled);
  const handsFreeRef = useRef(handsFree);
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef({ active: false, restartTimer: null });
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  const onErrorRef = useRef(onError);

  const clearRestartTimer = useCallback(() => {
    const timerId = shouldListenRef.current.restartTimer;
    if (timerId) {
      window.clearTimeout(timerId);
      shouldListenRef.current.restartTimer = null;
    }
  }, []);

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

  const isSpeechSupported = useMemo(() => hasSpeechSynthesis(), []);
  const isRecognitionSupported = useMemo(() => Boolean(getRecognitionCtor()), []);
  const isVoiceSupported = isSpeechSupported || isRecognitionSupported;

  const stopSpeaking = useCallback(() => {
    if (!isSpeechSupported) return;

    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSpeechSupported]);

  const internalStopListening = useCallback((permanent = true) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    clearRestartTimer();

    if (permanent) {
      shouldListenRef.current.active = false;
    }

    try {
      recognition.stop();
    } catch {
      // Recognition can throw if stop is called while idle.
    }
  }, [clearRestartTimer]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!enabledRef.current || !recognition) return;

    shouldListenRef.current.active = true;

    try {
      recognition.start();
    } catch {
      // start() can throw InvalidStateError if recognition is already running.
    }
  }, []);

  const stopListening = useCallback(() => {
    internalStopListening(true);
  }, [internalStopListening]);

  const pauseForTyping = useCallback(() => {
    stopSpeaking();
    internalStopListening(true);
  }, [internalStopListening, stopSpeaking]);

  const speakText = useCallback((text) => {
    const nextText = String(text || "").trim();

    if (!enabledRef.current || !isSpeechSupported || !nextText) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.rate = Number.isFinite(rate) ? rate : 0.9;
    utterance.lang = language;

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      setIsSpeaking(false);
      onErrorRef.current?.(`Speech synthesis failed: ${event?.error || "unknown_error"}`);
    };

    window.speechSynthesis.speak(utterance);
  }, [isSpeechSupported, language, rate]);

  useEffect(() => {
    const RecognitionCtor = getRecognitionCtor();

    if (!RecognitionCtor) return undefined;

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);

      if (enabledRef.current && shouldListenRef.current.active) {
        clearRestartTimer();
        try {
          recognition.start();
        } catch {
          // start() can race with onend transitions.
        }
      }
    };

    recognition.onerror = (event) => {
      const errorCode = event?.error || "unknown_error";

      if (errorCode === "aborted" || errorCode === "no-speech") {
        return;
      }

      if (errorCode === "network") {
        setIsListening(false);

        if (enabledRef.current && shouldListenRef.current.active) {
          clearRestartTimer();
          shouldListenRef.current.restartTimer = window.setTimeout(() => {
            const activeRecognition = recognitionRef.current;
            if (!activeRecognition) return;

            try {
              activeRecognition.start();
            } catch {
              // Ignore race when recognition is already starting.
            }
          }, 1200);
        }

        onErrorRef.current?.({
          code: errorCode,
          recoverable: true,
          message: "Speech recognition hit a network error. Trying to reconnect microphone...",
        });
        return;
      }

      if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
        shouldListenRef.current.active = false;
        onErrorRef.current?.({
          code: errorCode,
          recoverable: false,
          message: "Microphone access is blocked. Allow microphone permission and try again.",
        });
        return;
      }

      onErrorRef.current?.({
        code: errorCode,
        recoverable: false,
        message: `Speech recognition failed: ${errorCode}`,
      });
    };

    recognition.onresult = (event) => {
      let interimText = "";
      const finalChunks = [];

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = (result?.[0]?.transcript || "").trim();

        if (!transcript) continue;

        if (result.isFinal) {
          finalChunks.push(transcript);
        } else {
          interimText += `${transcript} `;
        }
      }

      const nextInterim = interimText.trim();
      if (nextInterim) {
        onInterimTranscriptRef.current?.(nextInterim);
      }

      const finalText = finalChunks.join(" ").trim();
      if (finalText) {
        onFinalTranscriptRef.current?.({
          text: finalText,
          autoSend: Boolean(enabledRef.current && handsFreeRef.current),
        });
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current.active = false;
      clearRestartTimer();

      try {
        recognition.stop();
      } catch {
        // Ignore stop errors during cleanup.
      }

      recognitionRef.current = null;
    };
  }, [clearRestartTimer, language]);

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
    if (!enabled || !isRecognitionSupported) return;

    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognition.lang = language;
  }, [enabled, isRecognitionSupported, language]);

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
    speakText,
    stopSpeaking,
    startListening,
    stopListening,
    pauseForTyping,
  };
}
