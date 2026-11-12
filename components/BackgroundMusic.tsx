"use client";

import { useEffect, useSyncExternalStore } from "react";

export const MUSIC_URL = "/sound/menu-sound.mp3";
export const MUSIC_VOLUME = 0.15;
export const MUSIC_MUTED_KEY = "retro-room:music-muted";

const UNLOCK_EVENTS = ["click", "touchend", "keydown"] as const;

type AudioLike = {
  loop: boolean;
  volume: number;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
};

type EventTargetLike = {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
};

type DocumentLike = EventTargetLike & { hidden: boolean };

type MusicDependencies = {
  createAudio: () => AudioLike;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  documentRef: DocumentLike;
};

export type MusicController = {
  start: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  getMuted: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

/**
 * One looping track for the whole app. Autoplay is attempted once and, if the browser blocks it,
 * retried on the first click, touch or key press. Muting and hiding the tab pause the same element,
 * so the track resumes from where it stopped.
 */
export function createMusicController({
  createAudio,
  storage,
  documentRef,
}: MusicDependencies): MusicController {
  const listeners = new Set<() => void>();
  let audio: AudioLike | null = null;
  let isStarted = false;
  let isMuted = false;
  let wasPlayingWhenHidden = false;
  let attempt = 0;
  let unlockListening = false;
  let needsActivation = false;
  let deferredStart = false;
  let playPending = false;
  const reportedErrors = new Set<string>();

  function readStoredMuted(): boolean {
    try {
      return storage?.getItem(MUSIC_MUTED_KEY) === "true";
    } catch {
      return false;
    }
  }

  isMuted = readStoredMuted();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function removeUnlockListeners() {
    if (!unlockListening) return;
    UNLOCK_EVENTS.forEach((eventName) => documentRef.removeEventListener(eventName, handleUnlock));
    unlockListening = false;
  }

  function addUnlockListeners() {
    if (unlockListening || !isStarted || isMuted || documentRef.hidden) return;
    UNLOCK_EVENTS.forEach((eventName) => documentRef.addEventListener(eventName, handleUnlock));
    unlockListening = true;
  }

  function tryPlay() {
    if (!audio || !isStarted || isMuted || documentRef.hidden) return;
    const currentAttempt = ++attempt;
    playPending = true;
    const fail = (error: unknown) => {
      if (currentAttempt !== attempt || !isStarted) return;
      playPending = false;
      const name = error instanceof Error ? error.name : "UnknownError";
      if (name === "NotAllowedError") {
        needsActivation = true;
        addUnlockListeners();
      } else {
        needsActivation = false;
        removeUnlockListeners();
      }
      if (process.env.NODE_ENV !== "production" && !reportedErrors.has(name)) {
        reportedErrors.add(name);
        console.warn(`Background music playback failed: ${name}`);
      }
    };
    try {
      audio.play().then(
        () => {
          if (currentAttempt !== attempt || !isStarted || isMuted || documentRef.hidden) return;
          playPending = false;
          needsActivation = false;
          removeUnlockListeners();
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  }

  function handleUnlock(event: Event) {
    if ("key" in event && (event as KeyboardEvent).key === "Escape") return;
    tryPlay();
  }

  function handleVisibilityChange() {
    if (!audio) return;
    if (documentRef.hidden) {
      wasPlayingWhenHidden = !audio.paused;
      deferredStart = playPending && !isMuted;
      playPending = false;
      attempt++;
      removeUnlockListeners();
      if (wasPlayingWhenHidden) audio.pause();
    } else if (wasPlayingWhenHidden && !isMuted) {
      wasPlayingWhenHidden = false;
      tryPlay();
    } else if (deferredStart && !isMuted) {
      deferredStart = false;
      tryPlay();
    } else if (needsActivation && !isMuted) {
      addUnlockListeners();
    }
  }

  return {
    start() {
      if (isStarted) return;
      isStarted = true;
      audio ??= createAudio();
      audio.loop = true;
      audio.volume = MUSIC_VOLUME;
      documentRef.addEventListener("visibilitychange", handleVisibilityChange);
      deferredStart = documentRef.hidden && !isMuted;
      tryPlay();
      notify();
    },
    stop() {
      if (!isStarted) return;
      isStarted = false;
      attempt++;
      playPending = false;
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      removeUnlockListeners();
      audio?.pause();
    },
    setMuted(muted) {
      isMuted = muted;
      attempt++;
      playPending = false;
      deferredStart = false;
      wasPlayingWhenHidden = false;
      try {
        storage?.setItem(MUSIC_MUTED_KEY, String(muted));
      } catch {}
      if (muted) {
        removeUnlockListeners();
        audio?.pause();
      }
      else tryPlay();
      notify();
    },
    getMuted: () => isMuted,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let sharedController: MusicController | null = null;

function getSharedController(): MusicController {
  sharedController ??= createMusicController({
    createAudio: () => {
      const element = new Audio(MUSIC_URL);
      element.preload = "auto";
      element.hidden = true;
      element.dataset.backgroundMusic = "true";
      document.body.appendChild(element);
      return element;
    },
    storage: (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })(),
    documentRef: document,
  });
  return sharedController;
}

const noopSubscribe = () => () => {};

function PixelSpeaker({ isMuted }: { isMuted: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      className="size-5"
      fill="currentColor"
    >
      <path d="M1 4h2l3-3h1v10H6L3 8H1z" />
      {isMuted ? (
        <path d="M8 4h1v1h1V4h1v1h-1v1h1v1h-1v1h-1V7H9v1H8V7h1V6H8z" />
      ) : (
        <path d="M8 4h1v4H8zM10 2h1v8h-1z" />
      )}
    </svg>
  );
}

/** Mounted once in the root layout. Owns the single audio element and the mute button. */
export function BackgroundMusic() {
  useEffect(() => {
    const controller = getSharedController();
    controller.start();
    return () => controller.stop();
  }, []);

  const isMuted = useSyncExternalStore(
    (listener) => (typeof window === "undefined" ? noopSubscribe() : getSharedController().subscribe(listener)),
    () => (typeof window === "undefined" ? false : getSharedController().getMuted()),
    () => false,
  );

  return (
    <button
      type="button"
      className="music-toggle btn btn-square btn-sm"
      aria-label={isMuted ? "เปิดเสียงเพลง" : "ปิดเสียงเพลง"}
      aria-pressed={isMuted}
      title={isMuted ? "เปิดเสียงเพลง" : "ปิดเสียงเพลง"}
      onClick={() => getSharedController().setMuted(!isMuted)}
    >
      <PixelSpeaker isMuted={isMuted} />
    </button>
  );
}
