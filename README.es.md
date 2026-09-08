<div align="center">

<img src="public/logo.svg" alt="AliceLabs" width="72" />

# VoxTutor

**Tutor personal de inglés por voz con memoria persistente.**

*by AliceLabs* · Hecho en Ecuador 🇪🇨

![Next.js](https://img.shields.io/badge/Next.js-16-0a0a0a?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000?logo=vercel&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-34d399)

</div>

---

**VoxTutor** es un tutor de inglés conversacional que habla contigo por voz, corrige tus errores en vivo y **recuerda** quién eres entre sesiones: tu nombre, tu objetivo, tu nivel y los errores que sueles cometer, para reintroducirlos en contexto hasta que los domines.

## ✨ Qué lo hace distinto

- **Voz de punta a punta** — habla con el micro (Web Speech API) y el tutor te responde hablando (TTS). Selector de **voces intercambiables** (todas las voces en inglés de tu navegador, con preview y acento US/UK/AU), velocidad ajustable (0.8×/1×/1.2×) y re-escucha en cada corrección. Sin teclado.
- **Correcciones en vivo, sin romper la conversación** — detecta tus errores gramaticales y los explica en español, uno por turno, de forma amable.
- **Memoria persistente** — cada dato que descubre de ti (objetivo, trabajo, intereses, errores comunes) se guarda en el almacén persistente (Vercel Edge Config en producción) y se inyecta en las siguientes sesiones.
- **Memoria por navegador, aislada** — cada navegador tiene su propio espacio de memoria (id anónimo en `localStorage`): nadie más ve tus datos, y al borrar el storage empiezas de cero.
- **Método CEFR** — ajusta su vocabulario a tu nivel y reintroduce tus errores comunes en contexto para que los fijes.
- **Provider-agnostic** — diseñado para correr con **NVIDIA Nemotron** servido en **Nebius Token Factory**; incluye fallback de demo sin claves.

## 🧠 Cómo funciona

```
Navegador (voz: ASR/TTS nativo)
        │  texto
        ▼
API /api/chat ──► LLM (Nemotron en Nebius) ──► JSON estructurado
        │         ó tutor heurístico local            │ reply
        ▼                                             │ corrections
Vercel Edge Config                                    │ memoryUpdates
(memoria persistente por navegador) ◄────────────────────────┘
```

El tutor responde **exclusivamente JSON** (`reply` + `corrections[]` + `memoryUpdates[]`), lo que mantiene la UI estable y la memoria limpia. Sin `NEBIUS_API_KEY` corre un tutor heurístico local (badge "Modo demo básico").

## 🚀 Correr en local

```bash
# 1. Instalar dependencias (Node 20+)
npm install

# 2. Configurar entorno (opcional)
cp .env.example .env

# 3. Levantar
npm run dev
# → http://localhost:3000
```

Sin configuración extra, la memoria corre en modo local (se reinicia al parar el server).
Para memoria persistente: `EDGE_CONFIG_ID`, `EDGE_CONFIG_TOKEN`, `EDGE_CONFIG_TEAM_ID` (Vercel).

### Modo producción (Nemotron en Nebius)

1. Crea una cuenta gratis en [Nebius Token Factory](https://tokenfactory.nebius.com/) (incluye créditos de bienvenida).
2. Genera una API key y ponla en `.env`:

```env
NEBIUS_API_KEY=tu_api_key_aqui
```

Sin esa clave, la app corre en **modo demo** con un tutor heurístico local (sin LLM externo, sin claves): detecta nombre y objetivo, corrige errores comunes de hispanohablantes y mantiene memoria. Cualquiera que clone el repo puede probarlo de inmediato.

> ⚠️ Para usar el micrófono se necesita **Chrome o Edge** y servir la app sobre `localhost` o HTTPS.

## 📁 Estructura

```
src/
├── app/
│   ├── api/chat/route.ts    # Turno de conversación (JSON estructurado)
│   ├── api/memory/route.ts  # Memoria persistente del estudiante
│   └── layout.tsx           # Metadata AliceLabs
├── components/voice-tutor.tsx  # UI completa (voz, chat, memoria)
├── lib/
│   ├── llm.ts               # Nebius Nemotron (producción con API key)
│   ├── tutor-local.ts       # Tutor heurístico local (sin API key)
│   ├── store.ts             # Almacenamiento: Edge Config / in-memory
│   └── tutor.ts             # System prompt + método de enseñanza
└── types/speech.ts          # Tipado Web Speech API
```

**Deploy en Vercel:** https://alicelabs-voxtutor.vercel.app (demo en modo heurístico).

## 📄 Licencia

[MIT](LICENSE) © 2026 AliceLabs

---

🌐 *Documentación en otros idiomas:* [Español](README.es.md)
