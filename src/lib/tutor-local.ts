/**
 * Tutor heurístico local (sin LLM externo).
 * Se activa cuando no hay NEBIUS_API_KEY configurada, para que la app
 * funcione de inmediato: detecta nombre/objetivo, corrige errores comunes
 * de hispanohablantes y hace preguntas de práctica por etapas.
 *
 * Contrato de salida idéntico al del LLM: {reply, corrections[], memoryUpdates[]}.
 */

import type { MemoryEntry } from './store';

export type TutorTurn = {
  reply: string;
  corrections: Array<{ wrong: string; right: string; note: string }>;
  memoryUpdates: Array<{ key: string; value: string }>;
  nextStage: number;
};

const NAME_RE = /\b(?:my name is|i am called|call me|me llamo|mi nombre es)\s+([a-zA-Z]{2,20})\b/i;
const IM_RE = /\b(?:i'?m|i am)\s+([a-zA-Z]{2,20})\b/i;
const NAME_BLOCK = new Set([
  'tired', 'happy', 'sad', 'hungry', 'fine', 'ok', 'okay', 'good', 'great', 'bad', 'here', 'back', 'sorry',
  'confused', 'ready', 'bored', 'late', 'new', 'learning', 'studying', 'interested', 'from', 'not',
  'trying', 'going', 'done', 'lost', 'sick', 'angry', 'busy', 'free', 'nervous', 'excited',
  'worried', 'sure', 'thirsty', 'sleepy', 'very', 'so', 'just', 'really', 'home', 'student',
  'working', 'coming', 'looking', 'beginner', 'intermediate', 'advanced', 'serious', 'kidding',
  'joking', 'dreaming', 'thinking', 'practicing', 'practising', 'speaking', 'reading', 'writing',
  'listening', 'watching', 'playing', 'agree', 'agreed', 'glad', 'afraid', 'curious', 'doubt',
  'a', 'an', 'the', 'in', 'on', 'at', 'and', 'or', 'but', 'because', 'that', 'this', 'it',
]);

const GOAL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(work|job|jobs|business|office|boss|company|interview|employ\w*)\b/i, 'mejorar su inglés para el trabajo'],
  [/\b(travel|trip|vacation|airport|abroad|tourist)\b/i, 'viajar'],
  [/\btravel(?:ing|ling)? to ([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)\b/, 'viajar a $1'],
  [/\b(exam|exams|toefl|ielts|test|university|school|college)\b/i, 'un examen o sus estudios'],
  [/\b(friend|friends|family|girlfriend|boyfriend|partner|wife|husband)\b/i, 'hablar con amigos o familia'],
  [/\b(music|movies|series|games|youtube)\b/i, 'su entretenimiento en inglés'],
];

/* ---------- Escenarios de práctica ---------- */

export type Scenario = 'free' | 'interview' | 'travel' | 'standup';

export const SCENARIOS: Record<Scenario, { label: string; ack: string; prompts: string[] }> = {
  free: {
    label: 'Free talk',
    ack: "Let's keep chatting!",
    prompts: [
      'What did you do yesterday?',
      'Tell me about your job or your studies.',
      'What are your plans for the weekend?',
      'Describe your best friend to me.',
      'What do you usually do in the morning?',
      'What kind of music do you like, and why?',
      'If you could travel anywhere, where would you go?',
    ],
  },
  interview: {
    label: 'Job interview',
    ack: "Great — mock job interview mode! I'll be your interviewer.",
    prompts: [
      'Tell me about yourself and your professional background.',
      'Tell me about a time you faced a tight deadline. Use the STAR method: Situation, Task, Action, Result.',
      'Why do you want to work with us?',
      'What is your greatest professional strength, and how have you used it?',
      'Describe a conflict with a coworker and how you solved it.',
      'Where do you see yourself in five years?',
      'Walk me through how you would negotiate your salary.',
    ],
  },
  travel: {
    label: 'Travel & daily life',
    ack: "Travel mode! Let's practice real situations abroad.",
    prompts: [
      "You are at the airport and your flight is delayed. What do you say to the agent?",
      'Order breakfast at a hotel restaurant and ask what they recommend.',
      'Ask a stranger for directions to the train station, politely.',
      'Your hotel room is too noisy. Complain politely and ask for a change.',
      'You want to buy a metro pass. Ask about prices and schedules.',
      'You lost your wallet in a busy market. Explain it to a police officer and ask for help.',
      'Book a taxi by phone: say where you are and where you need to go.',
    ],
  },
  standup: {
    label: 'Tech standup',
    ack: "Tech standup mode! You are in the daily meeting with your English-speaking team.",
    prompts: [
      'What did you work on yesterday? Give a quick update.',
      'What are you working on today?',
      'Any blockers? Explain the technical problem you are facing.',
      'Explain a bug you fixed recently: what was wrong and how did you fix it?',
      'Give an update on your current project: progress, next steps, and risks.',
      'Your deploy failed in production. Explain the situation to your team lead.',
      'Propose a new feature to your team and justify why it matters.',
    ],
  },
};

export function isScenario(v: unknown): v is Scenario {
  return v === 'free' || v === 'interview' || v === 'travel' || v === 'standup';
}

const REACT = ['Nice!', 'Interesting!', 'Good!', 'I see.', 'Great!', 'Cool!', 'That makes sense.'];

const FIXES: Array<{ re: RegExp; right: string; note: string }> = [
  { re: /\bi want (go|eat|drink|learn|sleep|buy|see|travel|work|speak|visit|practice)\b/i, right: 'I want to $1', note: 'Después de "want" va "to" + verbo: "I want to go".' },
  { re: /\bi need (go|eat|drink|learn|sleep|buy|see|travel|work|speak|visit)\b/i, right: 'I need to $1', note: '"need" también pide "to": "I need to study".' },
  { re: /\bi like (go|eat|play|watch|read|travel|listen)\b/i, right: 'I like $1ing', note: 'Tras "like" el verbo lleva -ing: "I like playing".' },
  { re: /\bgoed\b/i, right: 'went', note: '"go" es irregular: go - went - gone.' },
  { re: /\b(eated|ateed)\b/i, right: 'ate', note: '"eat" es irregular: eat - ate - eaten.' },
  { re: /\bruned\b/i, right: 'ran', note: '"run" es irregular: run - ran - run.' },
  { re: /\bfinded\b/i, right: 'found', note: '"find" es irregular: find - found.' },
  { re: /\bmaked\b/i, right: 'made', note: '"make" es irregular: make - made.' },
  { re: /\bbuyed\b/i, right: 'bought', note: '"buy" es irregular: buy - bought.' },
  { re: /\btaked\b/i, right: 'took', note: '"take" es irregular: take - took.' },
  { re: /\bwrited\b/i, right: 'wrote', note: '"write" es irregular: write - wrote.' },
  { re: /\bspeaked\b/i, right: 'spoke', note: '"speak" es irregular: speak - spoke.' },
  { re: /\bi am agree\b/i, right: 'I agree', note: '"agree" ya es verbo: "I agree", no "I am agree".' },
  { re: /\bexplain me\b/i, right: 'explain to me', note: 'Se dice "explain TO me" o "explain it to me".' },
  { re: /\bpeoples\b/i, right: 'people', note: '"people" ya es plural, no lleva "s".' },
  { re: /\binformations\b/i, right: 'information', note: '"information" es incontable: sin "s".' },
  { re: /\bmore better\b/i, right: 'better', note: '"better" ya es comparativo, sin "more".' },
  { re: /\bdepend of\b/i, right: 'depend on', note: 'El verbo es "depend ON".' },
  { re: /\bi have (\d+|one|two|three|\w+) years\b/i, right: 'I am $1 years old', note: 'La edad se dice con "be": "I am 25 years old".' },
  { re: /\bdidn'?t went\b/i, right: "didn't go", note: 'Tras "didn\'t" el verbo va en forma base.' },
  { re: /\bthere is (many|a lot of|lots of|two|three|four|five|\d+)\b/i, right: 'there are $1', note: 'Para plurales usa "there are".' },
  { re: /\bthe people is\b/i, right: 'the people are', note: '"people" es plural: "the people are".' },
];

function detectName(text: string, memory: MemoryEntry[], stage: number): string | null {
  const known = memory.find((m) => m.key === 'name');
  if (known) return null; // ya sabemos su nombre
  if (stage >= 3) return null; // en práctica libre no cazar nombres
  const m = text.match(NAME_RE) ?? text.match(IM_RE);
  if (m) {
    const candidate = m[1];
    const low = candidate.toLowerCase();
    if (!NAME_BLOCK.has(low) && !low.endsWith('ing') && !low.endsWith('ed')) return candidate;
  }
  return null;
}

function detectGoal(text: string, memory: MemoryEntry[]): string | null {
  if (memory.find((m) => m.key === 'goal')) return null;
  for (const [re, label] of GOAL_PATTERNS) {
    const m = text.match(re);
    if (m) {
      // El label puede traer $1 (ej: "viajar a $1") → sustituir por el grupo capturado
      return label.replace(/\$(\d)/g, (_, d) => m[Number(d)] ?? '');
    }
  }
  return null;
}

function findCorrection(text: string): { wrong: string; right: string; note: string } | null {
  for (const f of FIXES) {
    const m = text.match(f.re);
    if (m) {
      const right = f.right.replace(/\$(\d)/g, (_, d) => m[Number(d)] ?? '');
      const wrong = m[0];
      if (right.toLowerCase() === wrong.toLowerCase()) continue;
      return { wrong, right, note: f.note };
    }
  }
  return null;
}

export function localTutorTurn(
  text: string,
  memory: MemoryEntry[],
  stage: number,
  scenario: Scenario = 'free'
): TutorTurn {
  const isKickoff = text.trim() === '[start]';
  const isScenarioSwitch = text.trim() === '[scenario]';
  const clean = isKickoff || isScenarioSwitch ? '' : text.trim();
  const name = memory.find((m) => m.key === 'name')?.value ?? null;
  const goal = memory.find((m) => m.key === 'goal')?.value ?? null;

  const memoryUpdates: Array<{ key: string; value: string }> = [];
  const corrections: Array<{ wrong: string; right: string; note: string }> = [];
  let reply = '';
  let nextStage = stage;

  /* Saludo inicial */
  if (isKickoff) {
    if (name) {
      reply = goal
        ? `Welcome back, ${name}! Last time you told me you want ${goal}. ${SCENARIOS[scenario].prompts[stage % SCENARIOS[scenario].prompts.length]}`
        : `Welcome back, ${name}! ${SCENARIOS[scenario].prompts[stage % SCENARIOS[scenario].prompts.length]}`;
      nextStage = Math.max(stage + 1, 3);
    } else {
      reply = "Hello! I'm VoxTutor, your personal English tutor. What's your name?";
      nextStage = 1;
    }
    return { reply, corrections, memoryUpdates, nextStage };
  }

  /* Cambio de escenario (token interno [scenario], oculto en la UI) */
  if (isScenarioSwitch) {
    const sc = SCENARIOS[scenario];
    if (scenario !== 'free' && stage >= 2) {
      reply = `${sc.ack} ${sc.prompts[0]}`;
      nextStage = 3;
    } else if (scenario !== 'free') {
      reply = `${sc.ack} First things first: what's your name?`;
      nextStage = 1;
    } else {
      reply = `Back to free conversation, ${name ?? 'friend'}! ${sc.prompts[stage % sc.prompts.length]}`;
      nextStage = Math.max(stage, 3);
    }
    return { reply, corrections, memoryUpdates, nextStage };
  }

  /* Solicitud de práctica de un error concreto (botón "Practicar este error") */
  const practiceMatch = clean.match(/^i want to practice:?\s*["“]?(.+?)["”]?$/i);
  if (practiceMatch) {
    const fragment = practiceMatch[1].trim();
    const known = memory.find((m) => m.key === 'common_errors')?.value ?? '';
    const pair = known
      .split(';')
      .map((p) => p.split('->').map((s) => s.trim()))
      .find(([wrong]) => wrong.toLowerCase().includes(fragment.toLowerCase()) || fragment.toLowerCase().includes(wrong.toLowerCase()));
    if (pair) {
      reply = `Let's fix that one! The correct form is "${pair[1]}". Now say a full sentence using it.`;
    } else {
      reply = `Sure! Try answering this one: ${SCENARIOS[scenario].prompts[(stage + 1) % SCENARIOS[scenario].prompts.length]}`;
    }
    nextStage = stage + 1;
    return { reply, corrections, memoryUpdates, nextStage };
  }

  /* Detecciones universales (nombre puede llegar en cualquier momento temprano) */
  const newName = detectName(clean, memory, stage);
  if (newName) memoryUpdates.push({ key: 'name', value: newName });
  const newGoal = detectGoal(clean, memory);
  if (newGoal) memoryUpdates.push({ key: 'goal', value: newGoal });

  const effName = name ?? newName;
  const corr = findCorrection(clean);
  if (corr) corrections.push(corr);

  /* Máquina de etapas */
  if (stage <= 1) {
    // Esperando el nombre
    if (effName) {
      reply = `Nice to meet you, ${effName}! Why do you want to improve your English?`;
      nextStage = 2;
    } else {
      reply = "Sorry, I didn't catch your name. What is your name?";
      nextStage = 1;
    }
  } else if (stage === 2) {
    // Esperando el objetivo
    if (newGoal) {
      reply = `That's a great reason to practice, ${effName ?? 'friend'}! Let's start easy: ${SCENARIOS[scenario].prompts[0]}`;
    } else {
      reply = `No problem! Let's practice anyway, ${effName ?? 'friend'}: ${SCENARIOS[scenario].prompts[0]}`;
    }
    nextStage = 3;
  } else {
    // Práctica libre (banco de prompts del escenario activo)
    const bank = SCENARIOS[scenario].prompts;
    const react = REACT[(stage + clean.length) % REACT.length];
    const reactWord = react.replace(/[!.]$/, '');
    const prompt = bank[(stage - 3 + 1) % bank.length];
    const personal = effName ? `, ${effName}` : '';
    reply = corr
      ? `${react} Small fix${personal}: you wrote it, now say it right — "${corr.right}". Next: ${prompt}`
      : `${reactWord}${personal}! ${prompt}`;
    nextStage = stage + 1;
  }

  // Mantén la corrección también como refuerzo de memoria de errores comunes
  if (corr) {
    const known = memory.find((m) => m.key === 'common_errors');
    const merged = known ? `${known.value}; ${corr.wrong} -> ${corr.right}` : `${corr.wrong} -> ${corr.right}`;
    memoryUpdates.push({ key: 'common_errors', value: merged.slice(0, 180) });
  }

  return { reply, corrections, memoryUpdates, nextStage };
}
