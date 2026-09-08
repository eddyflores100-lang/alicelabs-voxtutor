'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Mic, MicOff, Send, BrainCircuit, Volume2, VolumeX, Briefcase, Plane, Laptop,
  MessageCircle, X, Flame, Download, Sparkles, RefreshCw,
} from 'lucide-react';
import type { SpeechRecognitionLike } from '@/types/speech';

type Correction = { wrong: string; right: string; note: string };
type Msg = { role: 'user' | 'tutor'; text: string; corrections?: Correction[] };
type MemoryItem = { id: string; key: string; value: string };
type Scenario = 'free' | 'interview' | 'travel' | 'standup';
type Diagnosis = {
  level: string;
  summary: string;
  patterns: Array<{ pattern: string; count: number; advice: string }>;
  roadmap: Array<{ step: string; focus: string }>;
  mode: 'nebius-deep' | 'local';
};

const SCENARIO_META: Record<Scenario, { label: string; icon: typeof Briefcase }> = {
  free: { label: 'Conversación libre', icon: MessageCircle },
  interview: { label: 'Entrevista de trabajo', icon: Briefcase },
  travel: { label: 'Viajes y vida diaria', icon: Plane },
  standup: { label: 'Tech standup', icon: Laptop },
};
const SPEEDS = [0.8, 1, 1.2] as const;

export default function VoiceTutor() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [typing, setTyping] = useState('');
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [streak, setStreak] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [micSupported, setMicSupported] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('free');
  const [speed, setSpeed] = useState<number>(1);
  const [showProgress, setShowProgress] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshMemory = useCallback(async () => {
    try {
      const sid = typeof window !== 'undefined' ? localStorage.getItem('voxtutor_sid') ?? '' : '';
      const r = await fetch(`/api/memory?sessionId=${encodeURIComponent(sid)}`);
      const j = await r.json();
      setMemory(j.memory ?? []);
      setStreak(j.streak ?? 0);
      if (j.scenario && j.scenario !== 'free') setScenario(j.scenario as Scenario);
      if (j.lastDiagnosis?.level) setDiagnosis(j.lastDiagnosis as Diagnosis);
    } catch {}
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = speed;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [speed]
  );

  const send = useCallback(
    async (text: string, sidOverride?: string, scenarioOverride?: Scenario) => {
      const clean = text.trim();
      if (!clean) return;
      const isKickoff = clean === '[start]';
      const isScenarioSwitch = clean === '[scenario]';
      if (!isKickoff && !isScenarioSwitch) setMessages((m) => [...m, { role: 'user', text: clean }]);
      setThinking(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sidOverride ?? sessionId,
            text: clean,
            scenario: scenarioOverride ?? scenario,
          }),
        });
        const j = await res.json();
        if (j.sessionId) setSessionId(j.sessionId);
        const corrections: Correction[] = j.corrections ?? [];
        setMessages((m) => [...m, { role: 'tutor', text: j.reply ?? '…', corrections }]);
        setDemoMode(j.mode === 'local');
        if (typeof j.streak === 'number') setStreak(j.streak);
        if (autoSpeak && j.reply) speak(j.reply);
        refreshMemory();
      } catch {
        setMessages((m) => [...m, { role: 'tutor', text: 'Hubo un error de conexión. Intenta de nuevo.' }]);
      } finally {
        setThinking(false);
        setInterim('');
      }
    },
    [sessionId, scenario, autoSpeak, speak, refreshMemory]
  );

  // Kickoff: sid estable + escenario + velocidad desde localStorage (memoria por navegador)
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
    let storedScenario: Scenario = 'free';
    try {
      const s = localStorage.getItem('voxtutor_scenario');
      if (s === 'interview' || s === 'travel' || s === 'standup' || s === 'free') storedScenario = s;
    } catch {}
    try {
      const sp = Number(localStorage.getItem('voxtutor_speed'));
      if (SPEEDS.includes(sp as 0.8 | 1 | 1.2)) setSpeed(sp);
    } catch {}
    setScenario(storedScenario);
    setSessionId(sid);
    send('[start]', sid, storedScenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interim, thinking]);

  const pickScenario = (s: Scenario) => {
    if (s === scenario) return;
    setScenario(s);
    try {
      localStorage.setItem('voxtutor_scenario', s);
    } catch {}
    send('[scenario]', undefined, s);
  };

  const pickSpeed = (sp: number) => {
    setSpeed(sp);
    try {
      localStorage.setItem('voxtutor_speed', String(sp));
    } catch {}
  };

  const generateDiagnosis = async () => {
    if (!sessionId || diagLoading) return;
    setDiagLoading(true);
    try {
      const r = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const j = await r.json();
      if (j.level) setDiagnosis(j as Diagnosis);
    } catch {} finally {
      setDiagLoading(false);
    }
  };

  const exportStudyNote = () => {
    const name = memory.find((m) => m.key === 'name')?.value ?? 'Estudiante';
    const goal = memory.find((m) => m.key === 'goal')?.value;
    const errs = memory.find((m) => m.key === 'common_errors')?.value ?? '';
    const words = messages.filter((m) => m.role === 'user').reduce((n, m) => n + m.text.split(/\s+/).filter(Boolean).length, 0);
    const corrections = messages.reduce((n, m) => n + (m.corrections?.length ?? 0), 0);
    const lines: string[] = [
      `# VoxTutor — Nota de estudio`,
      ``,
      `**Estudiante:** ${name}`,
      goal ? `**Objetivo:** ${goal}` : '',
      `**Nivel estimado:** ${diagnosis?.level ?? 'sin diagnóstico aún'}  ·  **Racha:** ${streak} día(s)  ·  **Esta sesión:** ${words} palabras, ${corrections} corrección(es)`,
      ``,
      `## Errores comunes detectados`,
      ...(errs ? errs.split(';').map((e) => `- ${e.trim()}`) : ['- (aún no hay errores registrados)']),
    ];
    if (diagnosis) {
      lines.push(``, `## Diagnóstico CEFR (${diagnosis.mode === 'nebius-deep' ? 'Nemotron Ultra' : 'heurístico'})`, diagnosis.summary);
      if (diagnosis.patterns.length) {
        lines.push(``, `### Patrones`);
        diagnosis.patterns.forEach((p) => lines.push(`- ${p.pattern} — ${p.advice}`));
      }
      if (diagnosis.roadmap.length) {
        lines.push(``, `### Plan de estudio`);
        diagnosis.roadmap.forEach((r) => lines.push(`- **${r.step}:** ${r.focus}`));
      }
    }
    lines.push(``, `---`, `Generado por VoxTutor · by AliceLabs · ${new Date().toLocaleDateString('es')}`);
    const blob = new Blob([lines.filter((l) => l !== '').join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voxtutor-study-note.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  const wordsSpoken = messages.filter((m) => m.role === 'user').reduce((n, m) => n + m.text.split(/\s+/).filter(Boolean).length, 0);
  const correctionsTotal = messages.reduce((n, m) => n + (m.corrections?.length ?? 0), 0);
  const errorsList = (memory.find((m) => m.key === 'common_errors')?.value ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [wrong, right] = pair.split('->').map((s) => s.trim());
      return { wrong, right: right ?? '' };
    });

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
          {/* Velocidad del tutor */}
          <div className="hidden sm:flex items-center rounded-lg border border-zinc-800 overflow-hidden" role="group" aria-label="Velocidad del tutor">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                onClick={() => pickSpeed(sp)}
                className={`px-2 py-1 text-[11px] transition-colors ${speed === sp ? 'bg-emerald-500/15 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                aria-pressed={speed === sp}
                title={sp < 1 ? 'Principiante: habla lento' : sp > 1 ? 'Desafío: habla rápido' : 'Velocidad normal'}
              >
                {sp}×
              </button>
            ))}
          </div>
          {demoMode && (
            <Badge
              variant="outline"
              title="Tutor heurístico local. Agrega NEBIUS_API_KEY en Vercel para IA completa (Nemotron)."
              className="border-amber-500/40 text-amber-400 hidden md:inline-flex"
            >
              Modo demo básico
            </Badge>
          )}
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 hidden lg:inline-flex">
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

      {/* Selector de escenarios */}
      <div className="border-b border-zinc-800/80 px-4 sm:px-6 py-2">
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto" role="tablist" aria-label="Escenarios de práctica">
          {(Object.keys(SCENARIO_META) as Scenario[]).map((s) => {
            const Icon = SCENARIO_META[s].icon;
            const active = scenario === s;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={active}
                onClick={() => pickScenario(s)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  active
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {SCENARIO_META[s].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transcript */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className={`px-4 py-3 text-[15px] leading-relaxed ${t(m)}`}>{m.text}</div>
              {m.corrections?.map((c, k) => (
                <Card key={k} className="mr-auto max-w-[85%] bg-amber-950/40 border-amber-500/30">
                  <CardContent className="p-3 text-sm space-y-1 flex items-start gap-2">
                    <div className="space-y-1 min-w-0">
                      <p className="text-red-300/90 line-through decoration-red-400/60">{c.wrong}</p>
                      <p className="text-emerald-300 font-semibold">→ {c.right}</p>
                      <p className="text-amber-200/80 text-xs">{c.note}</p>
                    </div>
                    <button
                      onClick={() => speak(c.right)}
                      aria-label={`Escuchar la forma correcta: ${c.right}`}
                      title="Escuchar la forma correcta"
                      className="ml-auto shrink-0 p-1.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
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
                <button
                  onClick={() => setShowProgress(true)}
                  className="ml-auto text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Mi progreso
                </button>
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

          {/* Visualizador de ondas (micrófono o voz del tutor) */}
          <div
            className={`shrink-0 flex items-end gap-[3px] h-6 w-14 transition-opacity ${listening || speaking ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden="true"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`eq-bar w-1 rounded-full ${listening ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{ height: `${8 + (i % 3) * 6}px`, animationDelay: `${i * 120}ms`, animationPlayState: listening || speaking ? 'running' : 'paused' }}
              />
            ))}
          </div>

          {micSupported ? (
            <p className="text-sm text-zinc-400 flex-1 min-w-0 truncate">
              {listening ? 'Escuchando… habla en inglés' : speaking ? 'VoxTutor está hablando…' : 'Toca el micro y habla en inglés (Chrome/Edge)'}
            </p>
          ) : (
            <div className="flex-1 flex gap-2 min-w-0">
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

      {/* Modal: Progreso del estudiante */}
      {showProgress && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6" onClick={() => setShowProgress(false)}>
          <div
            className="bg-zinc-900 border border-zinc-800 w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Progreso del estudiante"
          >
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold">Mi progreso</h2>
              <button onClick={() => setShowProgress(false)} aria-label="Cerrar" className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Métricas de sesión */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { v: messages.filter((m) => m.role === 'user').length, l: 'Turnos' },
                  { v: wordsSpoken, l: 'Palabras' },
                  { v: correctionsTotal, l: 'Correcciones' },
                  { v: streak, l: 'Racha (días)', flame: true },
                ].map((s) => (
                  <div key={s.l} className="bg-zinc-800/60 rounded-xl py-3 px-1">
                    <p className={`text-lg font-bold ${s.flame && s.v > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {s.flame ? <span className="inline-flex items-center gap-0.5"><Flame className="w-4 h-4" />{s.v}</span> : s.v}
                    </p>
                    <p className="text-[10px] text-zinc-500 leading-tight">{s.l}</p>
                  </div>
                ))}
              </div>

              {/* CEFR */}
              <div className="bg-zinc-800/40 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Nivel estimado</span>
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40" variant="outline">
                      {diagnosis?.level ?? '—'}
                    </Badge>
                  </div>
                  <Button size="sm" onClick={generateDiagnosis} disabled={diagLoading} className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 h-8 text-xs">
                    {diagLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Diagnóstico CEFR
                  </Button>
                </div>
                {diagnosis && (
                  <>
                    <p className="text-xs text-zinc-400">{diagnosis.summary}</p>
                    {diagnosis.patterns.length > 0 && (
                      <div className="space-y-1">
                        {diagnosis.patterns.map((p, i) => (
                          <div key={i} className="text-xs bg-zinc-900 rounded-lg px-2 py-1.5">
                            <span className="text-amber-300">{p.pattern}</span>
                            {p.advice && <span className="text-zinc-500"> — {p.advice}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {diagnosis.roadmap.length > 0 && (
                      <div className="space-y-1">
                        {diagnosis.roadmap.map((r, i) => (
                          <div key={i} className="text-xs flex gap-2">
                            <span className="text-emerald-400 font-medium shrink-0">{r.step}:</span>
                            <span className="text-zinc-400">{r.focus}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-zinc-600">
                      {diagnosis.mode === 'nebius-deep' ? 'Análisis profundo: Nemotron Ultra (Nebius Token Factory)' : 'Estimación heurística local'}
                    </p>
                  </>
                )}
              </div>

              {/* Errores con botón de práctica */}
              {errorsList.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-400">Errores comunes — practícalos ahora:</p>
                  {errorsList.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 bg-zinc-800/40 border border-zinc-800 rounded-lg px-2.5 py-2">
                      <div className="min-w-0 flex-1 text-xs">
                        <span className="text-red-300/80 line-through">{e.wrong}</span>
                        {e.right && <span className="text-emerald-300 font-medium"> → {e.right}</span>}
                      </div>
                      {e.right && (
                        <button onClick={() => speak(e.right)} aria-label="Escuchar forma correcta" className="p-1 text-zinc-500 hover:text-emerald-300">
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => {
                          setShowProgress(false);
                          send(`I want to practice: "${e.wrong}"`);
                        }}
                      >
                        Practicar
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Memoria */}
              {memory.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {memory.map((m) => (
                    <Badge key={m.id} variant="secondary" className="bg-zinc-800 text-zinc-300 font-normal">
                      <span className="text-emerald-400/80 mr-1">{m.key}:</span> {m.value}
                    </Badge>
                  ))}
                </div>
              )}

              <Button onClick={exportStudyNote} variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                <Download className="w-4 h-4 mr-2" /> Descargar nota de estudio (.md)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
