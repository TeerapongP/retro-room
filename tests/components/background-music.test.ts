import { describe, expect, it } from "vitest";
import {
  MUSIC_MUTED_KEY,
  MUSIC_VOLUME,
  createMusicController,
} from "../../components/BackgroundMusic";

function setup(options: { autoplayBlocked?: boolean; storedMuted?: boolean; hidden?: boolean } = {}) {
  const state = { blocked: options.autoplayBlocked ?? false, created: 0, plays: 0 };
  const audio = {
    loop: false,
    volume: 1,
    paused: true,
    play: () => {
      state.plays += 1;
      if (state.blocked) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
      audio.paused = false;
      return Promise.resolve();
    },
    pause: () => {
      audio.paused = true;
    },
  };
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const documentRef = {
    hidden: options.hidden ?? false,
    addEventListener: (type: string, listener: (event: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
  const store = new Map<string, string>();
  if (options.storedMuted) store.set(MUSIC_MUTED_KEY, "true");
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  const controller = createMusicController({
    createAudio: () => {
      state.created += 1;
      return audio;
    },
    storage,
    documentRef,
  });
  const fire = (type: string, event: Event = new Event(type)) =>
    listeners.get(type)?.forEach((listener) => listener(event));
  const listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { audio, controller, documentRef, fire, listenerCount, settle, state, store };
}

describe("background music controller", () => {
  it("reinstalls the unlock listener if resuming after a hidden tab is blocked", async () => {
    const { audio, controller, documentRef, fire, settle, state } = setup();
    controller.start();
    await settle();
    documentRef.hidden = true;
    fire("visibilitychange");
    state.blocked = true;
    documentRef.hidden = false;
    fire("visibilitychange");
    await settle();
    state.blocked = false;
    fire("click");
    await settle();
    expect(audio.paused).toBe(false);
    expect(state.plays).toBe(3);
  });

  it("does not install an unlock listener for unsupported media", async () => {
    const { audio, controller, fire, settle, state } = setup();
    audio.play = () => { state.plays += 1; return Promise.reject(new DOMException("unsupported", "NotSupportedError")); };
    controller.start();
    await settle();
    fire("click");
    await settle();
    expect(state.plays).toBe(1);
  });

  it("does not retry a media loading error on every interaction", async () => {
    const { audio, controller, fire, settle, state } = setup();
    audio.play = () => {
      state.plays += 1;
      return Promise.reject(new DOMException("media unavailable", "NetworkError"));
    };
    controller.start();
    await settle();
    fire("click");
    fire("keydown");
    await settle();
    expect(state.plays).toBe(1);
  });

  it("ignores an earlier successful play after a Strict Mode remount is blocked", async () => {
    const { audio, controller, fire, settle, state } = setup();
    let resolveFirst: () => void = () => {};
    audio.play = () => {
      state.plays += 1;
      if (state.plays === 1) return new Promise<void>((resolve) => { resolveFirst = resolve; });
      if (state.blocked) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
      audio.paused = false;
      return Promise.resolve();
    };
    controller.start();
    controller.stop();
    state.blocked = true;
    controller.start();
    await settle();
    resolveFirst();
    await settle();
    state.blocked = false;
    fire("keydown");
    await settle();
    expect(audio.paused).toBe(false);
    expect(state.created).toBe(1);
    expect(state.plays).toBe(3);
  });

  it("does not restore an unlock listener when an old attempt rejects after mute", async () => {
    const { audio, controller, fire, settle, state, listenerCount } = setup();
    let rejectFirst: (error: Error) => void = () => {};
    audio.play = () => {
      state.plays += 1;
      return new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    };
    controller.start();
    controller.setMuted(true);
    rejectFirst(new DOMException("blocked", "NotAllowedError"));
    await settle();
    fire("click");
    expect(state.plays).toBe(1);
    expect(listenerCount()).toBe(1);
  });

  it("retries when the tab becomes visible after an interrupted pending start", async () => {
    const { audio, controller, documentRef, fire, settle, state } = setup();
    audio.play = () => {
      state.plays += 1;
      if (state.plays === 1) return new Promise<void>(() => {});
      audio.paused = false;
      return Promise.resolve();
    };
    controller.start();
    documentRef.hidden = true;
    fire("visibilitychange");
    documentRef.hidden = false;
    fire("visibilitychange");
    await settle();
    expect(audio.paused).toBe(false);
    expect(state.plays).toBe(2);
  });

  it(`should loop one track at volume 0.15 and play it when autoplay is allowed`, async () => {
    const { audio, controller, settle, state } = setup();

    controller.start();
    await settle();

    expect(MUSIC_VOLUME).toBe(0.15);
    expect(audio.volume).toBe(0.15);
    expect(audio.loop).toBe(true);
    expect(audio.paused).toBe(false);
    expect(state.created).toBe(1);
  });

  it(`should create one audio element and no extra listeners when started twice or restarted`, async () => {
    const { controller, listenerCount, settle, state } = setup();

    controller.start();
    controller.start();
    await settle();
    const afterFirst = listenerCount();
    controller.stop();
    controller.start();
    await settle();

    expect(state.created).toBe(1);
    expect(listenerCount()).toBe(afterFirst);
  });

  it(`should swallow the rejected play and wait for the first click when autoplay is blocked`, async () => {
    const { audio, controller, fire, settle, state } = setup({ autoplayBlocked: true });

    controller.start();
    await settle();
    expect(audio.paused).toBe(true);
    expect(state.plays).toBe(1);

    state.blocked = false;
    fire("click");
    await settle();

    expect(audio.paused).toBe(false);
    expect(state.plays).toBe(2);
  });

  it(`should ignore the Escape key and stop listening once playback has started`, async () => {
    const { controller, fire, listenerCount, settle, state } = setup({ autoplayBlocked: true });
    controller.start();
    await settle();
    state.blocked = false;

    fire("keydown", Object.assign(new Event("keydown"), { key: "Escape" }));
    await settle();
    expect(state.plays).toBe(1);

    fire("keydown", Object.assign(new Event("keydown"), { key: "a" }));
    await settle();
    fire("click");
    await settle();

    expect(state.plays).toBe(2);
    expect(listenerCount()).toBe(1);
  });

  it(`should pause on mute, stay paused through gestures, and persist the preference`, async () => {
    const { audio, controller, fire, settle, state, store } = setup();
    controller.start();
    await settle();

    controller.setMuted(true);
    fire("click");
    await settle();

    expect(audio.paused).toBe(true);
    expect(state.plays).toBe(1);
    expect(store.get(MUSIC_MUTED_KEY)).toBe("true");
    expect(controller.getMuted()).toBe(true);
  });

  it(`should not play at start when the stored preference is muted, and play after unmute`, async () => {
    const { audio, controller, settle, state } = setup({ storedMuted: true });

    controller.start();
    await settle();
    expect(controller.getMuted()).toBe(true);
    expect(state.plays).toBe(0);

    controller.setMuted(false);
    await settle();

    expect(audio.paused).toBe(false);
  });

  it(`should pause when the tab is hidden and resume without restarting when it is visible again`, async () => {
    const { audio, controller, documentRef, fire, settle, state } = setup();
    controller.start();
    await settle();

    documentRef.hidden = true;
    fire("visibilitychange");
    expect(audio.paused).toBe(true);

    documentRef.hidden = false;
    fire("visibilitychange");
    await settle();

    expect(audio.paused).toBe(false);
    expect(state.created).toBe(1);
  });

  it(`should not resume on visible when the user muted while the tab was hidden`, async () => {
    const { audio, controller, documentRef, fire, settle } = setup();
    controller.start();
    await settle();
    documentRef.hidden = true;
    fire("visibilitychange");

    controller.setMuted(true);
    documentRef.hidden = false;
    fire("visibilitychange");
    await settle();

    expect(audio.paused).toBe(true);
  });

  it(`should not resume on visible when playback was never active`, async () => {
    const { audio, controller, documentRef, fire, settle } = setup({ autoplayBlocked: true });
    controller.start();
    await settle();

    documentRef.hidden = true;
    fire("visibilitychange");
    documentRef.hidden = false;
    fire("visibilitychange");
    await settle();

    expect(audio.paused).toBe(true);
  });
});
