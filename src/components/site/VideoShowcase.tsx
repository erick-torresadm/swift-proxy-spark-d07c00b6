import { useRef, useState } from "react";
import { Volume2, VolumeX, Play, Pause } from "lucide-react";
import videoAsset from "@/assets/fastproxy-criativo.mp4.asset.json";
import posterAsset from "@/assets/fastproxy-criativo-poster.jpg.asset.json";

export function VideoShowcase() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  return (
    <section className="py-20 sm:py-28 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div className="order-2 lg:order-1 space-y-6">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/10 text-primary">
              FastProxy em ação
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Veja como é simples começar
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Em poucos segundos você compra, recebe seus proxies dedicados no painel e já começa
              a usar. Sem burocracia, sem espera — apenas conecte e rode.
            </p>
            <ul className="space-y-3 text-foreground/90">
              <li className="flex gap-3">
                <span className="text-primary font-bold">✓</span>
                Entrega imediata após pagamento
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">✓</span>
                Painel intuitivo, autenticação por usuário e senha
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold">✓</span>
                Reposição com 1 clique sempre que precisar
              </li>
            </ul>
          </div>

          <div className="order-1 lg:order-2 flex justify-center">
            <div className="relative">
              {/* Phone frame */}
              <div className="relative w-[280px] sm:w-[320px] aspect-[9/19.5] rounded-[2.5rem] bg-neutral-900 p-3 shadow-2xl ring-1 ring-white/10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-neutral-900 rounded-b-2xl z-10" />
                <video
                  ref={videoRef}
                  src={videoAsset.url}
                  poster={posterAsset.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover rounded-[2rem]"
                />
                {/* Controls */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"}
                    className="w-10 h-10 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? "Ativar som" : "Silenciar"}
                    className="w-10 h-10 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {/* Glow */}
              <div className="absolute inset-0 -z-10 blur-3xl bg-gradient-to-tr from-primary/30 to-accent/20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
