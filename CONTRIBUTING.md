# Contributing to VoxTutor

## Requirements

- Node.js 22 or newer
- npm and the committed `package-lock.json`

## Local setup

```bash
npm ci
cp .env.example .env
npm run dev
```

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## Pull request checklist

- [ ] TypeScript validation passes.
- [ ] ESLint passes.
- [ ] Production build passes.
- [ ] No provider secrets, session IDs or real student data are committed.
- [ ] API changes preserve session validation and no-store response headers.
- [ ] Documentation reflects the actual implementation and known limitations.

Use synthetic student profiles in examples and tests. Do not claim account-level privacy or authentication unless those controls have been implemented and verified.
