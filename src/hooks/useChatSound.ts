import { useCallback, useEffect, useRef } from "react";

/**
 * Som de dopamina sintetizado via Web Audio API.
 * - "incoming": dois bips ascendentes (nova mensagem recebida)
 * - "outgoing": bip curto e suave (mensagem enviada)
 * - "newChat": acorde tipo "level up" para fila admin
 */
type SoundKind = "incoming" | "outgoing" | "newChat";

export function useChatSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const playTone = useCallback(
    (
      ctx: AudioContext,
      freq: number,
      startOffset: number,
      duration: number,
      gain = 0.18,
      type: OscillatorType = "sine",
    ) => {
      const t0 = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    },
    [],
  );

  const play = useCallback(
    (kind: SoundKind) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      if (kind === "incoming") {
        playTone(ctx, 660, 0, 0.18, 0.22, "sine");
        playTone(ctx, 990, 0.09, 0.22, 0.2, "triangle");
      } else if (kind === "outgoing") {
        playTone(ctx, 880, 0, 0.1, 0.12, "sine");
      } else if (kind === "newChat") {
        playTone(ctx, 523.25, 0, 0.18, 0.18, "triangle");
        playTone(ctx, 659.25, 0.08, 0.2, 0.18, "triangle");
        playTone(ctx, 783.99, 0.16, 0.28, 0.2, "triangle");
      }
    },
    [ensureCtx, playTone],
  );

  // desbloqueia áudio no primeiro gesto do usuário
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => ensureCtx();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureCtx]);

  return { play };
}
