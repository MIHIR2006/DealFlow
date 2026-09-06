"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speech in and speech out for the portal assistant.
 *
 * Both halves are the browser's own: SpeechRecognition for dictation and
 * speechSynthesis for playback. That is a deliberate choice over a streaming
 * voice API — it adds no dependency, no key, and no per-turn cost, it keeps the
 * customer's audio on their own device, and it degrades to a text-only dock on
 * a browser that lacks it rather than showing a control that cannot work.
 *
 * The assistant's replies are written as plain sentences for exactly this
 * reason (see the STYLE block in the service's system prompt), so what is read
 * aloud is what is on screen.
 */

// The vendor-prefixed constructor, and the handful of event fields actually
// read here. Typing them locally keeps this file free of a `lib.dom` version
// dependency for an API that is still prefixed in Chrome.
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceController {
  /** Whether this browser can dictate at all. */
  sttSupported: boolean;
  /** Whether this browser can read a reply aloud. */
  ttsSupported: boolean;

  listening: boolean;
  speaking: boolean;
  /** Words heard so far in the current utterance, before it is committed. */
  interim: string;
  /** Set when the microphone itself failed — permission, or no device. */
  error: string | null;

  /** Whether replies should be read aloud. Persisted per browser. */
  voiceReplies: boolean;
  setVoiceReplies: (on: boolean) => void;

  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
}

const VOICE_PREF_KEY = "df360.portal.voiceReplies";

/**
 * @param onTranscript called once per completed utterance, with the final text.
 */
export function useVoice(onTranscript: (text: string) => void): VoiceController {
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voiceReplies, setVoiceRepliesState] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Held in a ref so the recognition handlers, which are bound once, always
  // call the current submit function rather than the one from first render.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSttSupported(recognitionCtor() !== null);
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    try {
      setVoiceRepliesState(window.localStorage.getItem(VOICE_PREF_KEY) === "1");
    } catch {
      // A browser with site data blocked still gets a working dock; the
      // preference simply does not survive the session.
    }
  }, []);

  const setVoiceReplies = useCallback((on: boolean) => {
    setVoiceRepliesState(on);
    try {
      window.localStorage.setItem(VOICE_PREF_KEY, on ? "1" : "0");
    } catch {
      /* preference is a convenience, never a requirement */
    }
    if (!on && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const clean = text.trim();
    if (!clean) return;

    // Barge-in: a new reply replaces whatever is still being read.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "en-IN";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    // Prefer an Indian English voice to match the portal's currency and
    // phrasing, then any English voice, then whatever the platform defaults to.
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang === "en-IN") ??
      voices.find((v) => v.lang?.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    // Listening and speaking at once would feed the reply back into the
    // microphone, so playback stops the moment the customer starts talking.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }

    setError(null);
    setInterim("");

    const recognition = new Ctor();
    recognition.lang = "en-IN";
    // One question per press: the utterance is submitted when the speaker
    // stops, which is a clearer contract than an always-open microphone.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      setInterim(interimText);
      const trimmed = finalText.trim();
      if (trimmed) {
        setInterim("");
        onTranscriptRef.current(trimmed);
      }
    };

    recognition.onerror = (event) => {
      // "aborted" and "no-speech" are ordinary outcomes of pressing stop or
      // saying nothing; only a real fault is worth putting on screen.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow it in your browser to talk.");
      } else if (event.error && event.error !== "aborted" && event.error !== "no-speech") {
        setError("The microphone could not be used just now.");
      }
      setListening(false);
      setInterim("");
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if a previous session is still closing; the next press
      // succeeds, so this is not worth reporting.
      setListening(false);
    }
  }, []);

  // Leaving the page mid-sentence should not keep the browser talking.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    sttSupported,
    ttsSupported,
    listening,
    speaking,
    interim,
    error,
    voiceReplies,
    setVoiceReplies,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
