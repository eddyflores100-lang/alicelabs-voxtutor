# Security policy

## Scope

VoxTutor is a learning prototype with per-browser session memory. It is not an account-authentication system, and its session identifier is a bearer identifier. Do not store passwords, financial details, identity documents, private health information, or other highly sensitive data in a tutoring session.

## Reporting

Report suspected vulnerabilities privately using GitHub's **Report a vulnerability** feature under the repository's Security tab. Do not publish tokens, session identifiers, personal data, or exploit details in public issues.

Include the affected route or file, impact, a minimal reproduction using synthetic data, and the commit or release.

## Deployment safeguards

- Keep Nebius, Tavily and Edge Config secrets in server-side environment variables only.
- Treat browser session IDs as secrets; never paste them into issues or support messages.
- Apply platform-level rate limits/WAF controls before exposing paid model endpoints publicly. The in-process limiter is best-effort and does not synchronize across serverless instances.
- Review retention, deletion, consent and privacy notices before collecting real student information.
- Do not treat the current browser-session model as authentication or authorization for sensitive records.

No response-time SLA is promised for this prototype.
