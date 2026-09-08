<div align="center">

<img src="public/logo.svg" alt="AliceLabs" width="72" />

# VoxTutor

**A voice-first English tutor that remembers who you are.**

*by AliceLabs* · Made in Ecuador 🇪🇨

**Live demo:** https://alicelabs-voxtutor.vercel.app

![Next.js](https://img.shields.io/badge/Next.js-16-0a0a0a?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Nebius](https://img.shields.io/badge/Runs%20on-Nebius%20Token%20Factory-6D5BF6)
![NVIDIA](https://img.shields.io/badge/Model-NVIDIA%20Nemotron-76B900)
![License](https://img.shields.io/badge/License-MIT-34d399)

</div>

---

**VoxTutor** is a conversational English tutor for Spanish speakers. You talk to it with your microphone, it replies out loud, corrects your grammar mistakes live (explained in Spanish), and **remembers you across sessions** — your name, your goal, your level, and the mistakes you make most often — so it can reintroduce them in context until you master them.

Most language apps start from zero every single day. VoxTutor doesn't: the persistent student profile is a first-class part of the product, not a session artifact.

## ✨ What makes it different

- **End-to-end voice** — speak with your mic (Web Speech API: `SpeechRecognition`) and the tutor answers out loud (`speechSynthesis` TTS). No keyboard needed; a text-input fallback keeps the app usable in browsers without speech support.
- **Live corrections without breaking the flow** — one grammar fix per turn, explained kindly in the learner's native language, delivered as a readable card in the UI.
- **Persistent, per-browser memory** — everything the tutor learns (name, goal, interests, common errors) is stored server-side (Vercel Edge Config in production) and re-injected into future sessions. Each browser gets an anonymous session id in `localStorage`, so different users never see each other's data — clear your storage and you start fresh.
- **CEFR-aware teaching method** — the tutor adapts its vocabulary to the student's level and deliberately reintroduces past mistakes in new contexts.
- **Provider-agnostic LLM layer** — built to run on **NVIDIA Nemotron** served by **Nebius Token Factory**, with an offline heuristic tutor as a zero-key fallback so anyone can clone and run the demo instantly.

## ⚡ Runs on Nebius Token Factory (NVIDIA Nemotron)

This project makes a **runtime call to the Nebius Token Factory inference API**, as required by the hackathon rules:

- **Endpoint:** `POST https://api.tokenfactory.nebius.com/v1/chat/completions`
- **Model:** `nvidia/llama-3.3-nemotron-super-49b-v1` (open source)
- **Integration:** [`src/lib/llm.ts`](src/lib/llm.ts) — plain `fetch` call with `NEBIUS_API_KEY` auth, invoked on every chat turn by `/api/chat`
- **Structured output:** the system prompt (in [`src/lib/tutor.ts`](src/lib/tutor.ts)) forces Nemotron to answer with a strict JSON contract, parsed and defensively validated server-side:

```json
{
  "reply": "natural spoken English response",
  "corrections": [{ "wrong": "I want go", "right": "I want to go", "note": "..." }],
  "memoryUpdates": [{ "key": "goal", "value": "English for work" }]
}
```

- `reply` is spoken aloud via TTS, `corrections` renders the grammar cards, and `memoryUpdates` is merged into the persistent student profile.

**Graceful fallback:** if `NEBIUS_API_KEY` is not configured, VoxTutor runs a local heuristic tutor ([`src/lib/tutor-local.ts`](src/lib/tutor-local.ts)) instead of crashing — it detects names/goals, fixes classic Spanish-speaker mistakes (`"I want go"` → `"I want to go"`, `"goed"` → `"went"`, `"I have 20 years"` → `"I am 20 years old"`), and keeps the same memory pipeline. Judges can try the app with zero setup; adding the API key instantly upgrades it to full Nemotron intelligence (the UI badge switches from "Modo demo básico" to `mode: "nebius"`).

## 🧠 How it works

```
Browser (native ASR/TTS via Web Speech API)
        │  text
        ▼
/api/chat ──► NVIDIA Nemotron (Nebius Token Factory) ──► strict JSON
        │         or local heuristic fallback               │ reply
        ▼                                                   │ corrections
Vercel Edge Config                                          │ memoryUpdates
(persistent, per-browser student memory) ◄──────────────────┘
```

One read per turn (memory + history + stage) and one batched write per turn (messages + memory upserts + stage), with automatic pruning (max 30 messages per session) to stay well within quotas. If the store is unreachable, the chat never fails — it just skips persistence for that turn.

## 🚀 Run it locally

```bash
# 1. Install dependencies (Node 20+)
npm install

# 2. (Optional) configure environment
cp .env.example .env

# 3. Start
npm run dev
# → http://localhost:3000
```

Production build works the standard way on macOS / Linux / Windows:

```bash
npm run build
npm start
```

### Environment variables (all optional)

| Variable | Purpose |
|---|---|
| `NEBIUS_API_KEY` | Enables full NVIDIA Nemotron responses via Nebius Token Factory |
| `NEBIUS_BASE_URL` | Defaults to `https://api.tokenfactory.nebius.com/v1` |
| `NEBIUS_MODEL` | Defaults to `nvidia/llama-3.3-nemotron-super-49b-v1` |
| `EDGE_CONFIG_ID` / `EDGE_CONFIG_TOKEN` / `EDGE_CONFIG_TEAM_ID` | Persistent memory via Vercel Edge Config (otherwise in-memory) |

Without any variables, the app runs in demo mode with local memory — nothing to configure, nothing to pay.

> ⚠️ Microphone input requires **Chrome or Edge** served over `localhost` or HTTPS. Other browsers automatically get the text-input fallback.

## 📁 Project structure

```
src/
├── app/
│   ├── api/chat/route.ts    # Conversation turn (strict JSON contract)
│   ├── api/memory/route.ts  # Persistent student memory (per browser)
│   └── layout.tsx           # AliceLabs metadata
├── components/voice-tutor.tsx  # Full UI (voice, chat, memory panel)
├── lib/
│   ├── llm.ts               # NVIDIA Nemotron via Nebius Token Factory
│   ├── tutor-local.ts       # Offline heuristic tutor (zero-key fallback)
│   ├── store.ts             # Storage: Vercel Edge Config / in-memory
│   └── tutor.ts             # System prompt + teaching method
└── types/speech.ts          # Web Speech API typings
```

## 🏆 Context

Built by **AliceLabs** for the *Nebius x NVIDIA Global AI Hackathon* — *Best Apps & Agents* track.

- **Live demo:** https://alicelabs-voxtutor.vercel.app
- **Repository:** https://github.com/eddyflores100-lang/alicelabs-voxtutor

## 📄 License

[MIT](LICENSE) © 2026 AliceLabs

---

🌐 *Other languages:* [Español](README.es.md)
