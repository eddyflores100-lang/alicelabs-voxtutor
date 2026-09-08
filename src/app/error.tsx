'use client';

// Error boundary global: si algo explota en el cliente, la app nunca queda en
// pantalla blanca — muestra la marca y un botón de reintento.
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[voxtutor] error de cliente:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="AliceLabs" className="w-12 h-12 rounded-xl mx-auto" />
        <h1 className="font-bold text-lg">Algo se rompió — pero tu progreso está a salvo</h1>
        <p className="text-sm text-zinc-400">
          Tu memoria de aprendizaje sigue guardada (por navegador). Vuelve a intentar; si persiste, recarga la página.
        </p>
        <button
          onClick={reset}
          className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors"
        >
          Reintentar
        </button>
        <p className="text-[11px] text-zinc-600">
          © {new Date().getFullYear()} AliceLabs · VoxTutor
        </p>
      </div>
    </div>
  );
}
