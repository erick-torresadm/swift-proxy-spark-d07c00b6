import { useEffect } from "react";

/**
 * Toca um "ka-ching" de caixa registradora quando o service worker
 * sinaliza chegada de notificação de venda (admin PWA).
 * Sintetizado via Web Audio API — não depende de arquivo externo.
 */
export function SaleSoundListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let ctx: AudioContext | null = null;
    const getCtx = () => {
      if (!ctx) {
        const Ctor =
          (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) ctx = new Ctor();
      }
      return ctx;
    };

    const playKaching = () => {
      const audio = getCtx();
      if (!audio) return;
      if (audio.state === "suspended") audio.resume().catch(() => {});
      const now = audio.currentTime;

      // "ding" agudo (sino)
      const ding = (freq: number, start: number, dur = 0.45, gain = 0.22) => {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + start);
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(gain, now + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(g).connect(audio.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      };

      // sequência tipo caixa registradora: ding alto → ding baixo → chimes
      ding(1760, 0, 0.18, 0.18); // click
      ding(1318, 0.06, 0.5, 0.25); // E6
      ding(1760, 0.18, 0.55, 0.22); // A6
      ding(2093, 0.32, 0.6, 0.18); // C7 sparkle

      // "kerchunk" grave da gaveta abrindo
      const thump = audio.createOscillator();
      const tg = audio.createGain();
      thump.type = "sine";
      thump.frequency.setValueAtTime(140, now);
      thump.frequency.exponentialRampToValueAtTime(60, now + 0.18);
      tg.gain.setValueAtTime(0.0001, now);
      tg.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      thump.connect(tg).connect(audio.destination);
      thump.start(now);
      thump.stop(now + 0.3);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | undefined;
      if (data?.type === "PLAY_SALE_SOUND") playKaching();
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    // destrava o AudioContext na primeira interação do usuário
    const unlock = () => {
      const a = getCtx();
      if (a && a.state === "suspended") a.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
