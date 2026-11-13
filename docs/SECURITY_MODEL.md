# VoxTutor security and privacy model

## Session identifier

- A browser stores a random session identifier in `localStorage`.
- The identifier is generated with the Web Crypto API; the server uses Node's `randomUUID` when it must create one.
- The identifier is a bearer capability for the session's memory and history, not a login credential or proof of identity.
- Anyone who obtains the identifier may be able to read or modify that session through the app's API. Treat it as a secret and do not store highly sensitive information.

## Storage modes

- Without Edge Config environment variables, data is kept in a process-local in-memory store and is lost when that process restarts.
- With Edge Config enabled, the server reads/writes the configured store using server-side credentials. The browser never receives the Edge Config token.
- Persistence is not equivalent to encryption, account isolation, backup, retention management or compliance certification.

## API protections

- Session identifiers are validated on chat, memory and diagnosis routes.
- API responses containing session data are marked `Cache-Control: no-store`.
- Chat input is capped at 4,000 characters.
- Chat and diagnosis routes have best-effort per-process rate limits and bounded in-memory limiter state.

## Remaining production requirements

- Add platform-level rate limiting/WAF rules; serverless in-memory limits are not shared across instances and are not sufficient against distributed abuse.
- Introduce real account authentication and server-side ownership checks before using session memory for sensitive or multi-device data.
- Define user-visible consent, retention, export and deletion flows.
- Review provider data handling and terms for Nebius, Tavily and Vercel.
- Add automated tests for session isolation, invalid IDs, abuse limits, storage failures and data deletion.
