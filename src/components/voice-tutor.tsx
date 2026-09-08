'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, MicOff, Send, BrainCircuit, Volume2, VolumeX } from 'lucide-react';
import type { SpeechRecognitionLike } from '@/types/speech';

type Correction = { wrong: string; right: string; note: string };
type Msg = { role: 'user' | 'tutor'; text: string; corrections?: Correction[] };
type MemoryItem = { id: string; key: string; value: string };

export default function VoiceTutor() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [typing, setTyping] = useState('');
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [micSupported, setMicSupported] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshMemory = useCallback(async () => {
    try {
      const sid = typeof window !== 'undefined' ? localStorage.getItem('voxtutor_sid') ?? '' : '';
      const r = await fetch(`/api/memory?sessionId=${encodeURIComponent(sid)}`);
      const j = await r.json();
      setMemory(j.memory ?? []);
    } catch {}
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }, []);

  const send = useCallback(
    async (text: string, sidOverride?: string) => {
      const clean = text.trim();
      if (!clean) return;
      const isKickoff = clean === '[start]';
      if (!isKickoff) setMessages((m) => [...m, { role: 'user', text: clean }]);
      setThinking(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sidOverride ?? sessionId, text: clean }),
        });
        const j = await res.json();
        if (j.sessionId) setSessionId(j.sessionId);
        const corrections: Correction[] = j.corrections ?? [];
        setMessages((m) => [...m, { role: 'tutor', text: j.reply ?? '…', corrections }]);
        setDemoMode(j.mode === 'local');
        if (autoSpeak && j.reply) speak(j.reply);
        refreshMemory();
      } catch {
        setMessages((m) => [...m, { role: 'tutor', text: 'Hubo un error de conexión. Intenta de nuevo.' }]);
      } finally {
        setThinking(false);
        setInterim('');
      }
    },
    [sessionId, autoSpeak, speak, refreshMemory]
  );

  // Kickoff: id estable por navegador (localStorage) → memoria aislada por usuario y persistente
  useEffect(() => {
    let sid = '';
    try {
      sid = localStorage.getItem('voxtutor_sid') ?? '';
    } catch {}
    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(sid)) {
      sid =
        'vt_' +
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
      try {
        localStorage.setItem('voxtutor_sid', sid);
      } catch {}
    }
    setSessionId(sid);
    send('[start]', sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interim, thinking]);

  const startListening = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      setMicSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = '';
      let partial = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else partial += r[0].transcript;
      }
      setInterim(final || partial);
      if (final) send(final);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setMicSupported(false);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopListening = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const t = (m: Msg) =>
    m.role === 'tutor'
      ? 'mr-auto max-w-[85%] bg-zinc-800/90 text-zinc-50 rounded-2xl rounded-bl-sm'
      : 'ml-auto max-w-[85%] bg-emerald-500 text-zinc-950 font-medium rounded-2xl rounded-br-sm';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="AliceLabs" className="w-9 h-9 rounded-xl shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold leading-tight">
              VoxTutor{" "}
              <span className="text-sm font-normal text-zinc-500">
                by <span className="font-semibold text-emerald-400">AliceLabs</span>
              </span>
            </h1>
            <p className="text-xs text-zinc-400 truncate">Tu tutor de inglés por voz · con memoria</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demoMode && (
            <Badge
              variant="outline"
              title="Tutor heurístico local. Agrega NEBIUS_API_KEY en Vercel para IA completa (Nemotron)."
              className="border-amber-500/40 text-amber-400 hidden md:inline-flex"
            >
              Modo demo básico
            </Badge>
          )}
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 hidden sm:inline-flex">
            Best Apps & Agents Track
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label={autoSpeak ? 'Silenciar voz' : 'Activar voz'}
            onClick={() => {
              setAutoSpeak((v) => !v);
              window.speechSynthesis?.cancel();
            }}
          >
            {autoSpeak ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-zinc-500" />}
          </Button>
        </div>
      </header>

      {/* Transcript */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className={`px-4 py-3 text-[15px] leading-relaxed ${t(m)}`}>{m.text}</div>
              {m.corrections?.map((c, k) => (
                <Card key={k} className="mr-auto max-w-[85%] bg-amber-950/40 border-amber-500/30">
                  <CardContent className="p-3 text-sm space-y-1">
                    <p className="text-red-300/90 line-through decoration-red-400/60">{c.wrong}</p>
                    <p className="text-emerald-300 font-semibold">→ {c.right}</p>
                    <p className="text-amber-200/80 text-xs">{c.note}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
          {interim && (
            <div className="ml-auto max-w-[85%] px-4 py-3 rounded-2xl rounded-br-sm bg-emerald-500/20 text-emerald-200/80 italic">
              {interim}
            </div>
          )}
          {thinking && (
            <div className="mr-auto px-4 py-3 rounded-2xl rounded-bl-sm bg-zinc-800/90 text-zinc-400">
              <span className="animate-pulse">VoxTutor está pensando…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Memoria persistente */}
      {memory.length > 0 && (
        <div className="px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <Card className="bg-zinc-900/70 border-zinc-800">
              <CardContent className="p-3 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-zinc-400 flex items-center gap-1 mr-1">
                  <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" /> Lo que sé de ti:
                </span>
                {memory.map((m) => (
                  <Badge key={m.id} variant="secondary" className="bg-zinc-800 text-zinc-300 font-normal">
                    <span className="text-emerald-400/80 mr-1">{m.key}:</span> {m.value}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Controles */}
      <footer className="border-t border-zinc-800/80 px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            size="lg"
            onClick={listening ? stopListening : startListening}
            className={`w-14 h-14 rounded-full p-0 shrink-0 transition-transform ${
              listening ? 'bg-red-500 hover:bg-red-500 scale-110 animate-pulse' : 'bg-emerald-500 hover:bg-emerald-400'
            }`}
            aria-label={listening ? 'Detener grabación' : 'Hablar'}
          >
            {listening ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-zinc-950" />}
          </Button>

          {micSupported ? (
            <p className="text-sm text-zinc-400 flex-1">
              {listening ? 'Escuchando… habla en inglés' : 'Toca el micro y habla en inglés (Chrome/Edge)'}
            </p>
          ) : (
            <div className="flex-1 flex gap-2">
              <Input
                value={typing}
                onChange={(e) => setTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    send(typing);
                    setTyping('');
                  }
                }}
                placeholder="Tu navegador no soporta voz — escribe aquí"
                className="bg-zinc-900 border-zinc-800"
              />
              <Button
                size="icon"
                onClick={() => {
                  send(typing);
                  setTyping('');
                }}
                aria-label="Enviar"
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        <p className="max-w-3xl mx-auto mt-3 text-[11px] text-zinc-600 text-center">
          © 2026 <span className="text-zinc-500 font-medium">AliceLabs</span> · VoxTutor · Hecho en Ecuador 🇪🇨
        </p>
      </footer>
    </div>
  );
}
