export type OutcomeSound = 'success' | 'fail';

export interface OutcomeAudioRuntime {
  resume(): Promise<void>;
  play(kind: OutcomeSound): Promise<void>;
}

export function createOutcomeAudioController(runtime: OutcomeAudioRuntime) {
  let unlockPromise: Promise<void> | null = null;

  function unlock(): Promise<void> {
    if (!unlockPromise) {
      unlockPromise = runtime.resume().catch((error) => {
        unlockPromise = null;
        throw error;
      });
    }
    return unlockPromise;
  }

  async function play(kind: OutcomeSound): Promise<void> {
    await unlock();
    await runtime.play(kind);
  }

  return { unlock, play };
}

const soundUrls: Record<OutcomeSound, string> = {
  success: new URL('../assets/sounds/success.mp3', import.meta.url).href,
  fail: new URL('../assets/sounds/fail.mp3', import.meta.url).href
};

function createBrowserAudioRuntime(): OutcomeAudioRuntime {
  let context: AudioContext | null = null;
  const buffers = new Map<OutcomeSound, Promise<AudioBuffer>>();

  function getContext(): AudioContext {
    if (!context || context.state === 'closed') {
      const AudioContextCtor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio API is not supported');
      context = new AudioContextCtor();
    }
    return context;
  }

  function load(kind: OutcomeSound): Promise<AudioBuffer> {
    const cached = buffers.get(kind);
    if (cached) return cached;
    const pending = fetch(soundUrls[kind])
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${kind} sound: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => getContext().decodeAudioData(data));
    buffers.set(kind, pending);
    return pending;
  }

  return {
    async resume() {
      const ctx = getContext();
      if (ctx.state === 'suspended') await ctx.resume();
      // Start loading while the run is in progress so playback is immediate.
      void load('success').catch(() => {});
      void load('fail').catch(() => {});
    },
    async play(kind) {
      const ctx = getContext();
      const source = ctx.createBufferSource();
      source.buffer = await load(kind);
      source.connect(ctx.destination);
      source.start();
    }
  };
}

let browserController: ReturnType<typeof createOutcomeAudioController> | null = null;

function getBrowserController() {
  if (typeof window === 'undefined') return null;
  if (!browserController) {
    browserController = createOutcomeAudioController(createBrowserAudioRuntime());
  }
  return browserController;
}

// Call synchronously from a user gesture (Run click) so browsers allow later
// result sounds after asynchronous Python execution and robot animation.
export function unlockOutcomeAudio(): void {
  void getBrowserController()?.unlock().catch(() => {});
}

export function playOutcomeAudio(kind: OutcomeSound): Promise<void> {
  return getBrowserController()?.play(kind) ?? Promise.resolve();
}
