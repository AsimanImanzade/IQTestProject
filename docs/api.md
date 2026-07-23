# API reference

All routes are same-origin JSON. Errors use a consistent envelope:

```json
{ "error": { "code": "not-found", "message": "Attempt not found." } }
```

Unexpected failures return a generic `server-error` message — internal errors routinely contain
table names and query fragments, and returning those to a client is information disclosure. Detail
goes to the server log.

## Identity

Requests are authenticated by one of two httpOnly cookies:

| Cookie | Meaning |
|---|---|
| `iq_session` | A signed-in user. Opaque token; only its SHA-256 hash is stored server-side. |
| `iq_guest` | An anonymous test-taker. HMAC-signed, so a key cannot be forged to read someone else's attempt. |

A signed-in user always takes precedence. `POST /api/attempts` issues a guest identity if none
exists; every other route only reads.

Attempts belonging to another owner return **404, not 403** — confirming that an attempt exists
would leak that an id is real.

---

## `POST /api/attempts`

Assemble and start a test. Rate limited (20/hour). Abandons any attempt already in progress for
this owner.

**Body**

```json
{
  "mode": "TIMED",
  "demographics": { "ageYears": 34, "gender": "FEMALE", "educationLevel": "MASTERS" }
}
```

`mode` is `"TIMED"` (25 minutes) or `"UNTIMED"`.

`demographics` applies to **guests only**. For a signed-in user the stored profile is
authoritative and this object is ignored — otherwise a crafted request could score an attempt
against an age the person never claimed. Whatever applies is snapshotted onto the attempt, so a
later profile edit cannot retroactively change a completed result.

`ageYears` must be 12–100 (`400 age-out-of-range` otherwise). Only age affects the score; gender
and education level are recorded for reporting and bias monitoring and never enter a calculation.

**201**

```json
{
  "attemptId": "cmrv…",
  "mode": "TIMED",
  "startedAt": "2026-07-22T12:00:00.000Z",
  "expiresAt": "2026-07-22T12:25:00.000Z",
  "durationSeconds": 1500,
  "totalQuestions": 20,
  "questions": [
    {
      "id": "cmrv…",
      "position": 0,
      "category": { "slug": "matrix-reasoning", "name": "Matrix Reasoning" },
      "stem": "Which figure completes the matrix?",
      "svg": "<svg …>",
      "estimatedSeconds": 65,
      "choices": [{ "id": "cmrv…", "text": null, "svg": "<svg …>" }]
    }
  ]
}
```

> A choice object has exactly three keys: `id`, `text`, `svg`. It carries no `isCorrect`, no
> `rationale` and no `explanation`. An integration test asserts the serialised payload contains
> none of those strings anywhere.

**Errors** — `503 bank-too-small`, `429 rate-limited`, `403 cross-origin`.

---

## `GET /api/attempts/{id}/resume`

Reload an in-progress test after a refresh or a crash. Returns the same shape as above plus saved
answers:

```json
{ "responses": [{ "questionId": "cmrv…", "selectedChoiceId": "cmrv…", "flagged": true, "responseMs": 8000 }] }
```

The deadline is unchanged — it was fixed server-side when the attempt started, so resuming does not
restart the clock.

**Errors** — `409 not-in-progress` (already submitted), `404 not-found`.

---

## `PATCH /api/attempts/{id}/responses`

Autosave one answer.

**Body**

```json
{ "questionId": "cmrv…", "choiceId": "cmrv…", "responseMs": 12000, "flagged": false }
```

`choiceId: null` clears the answer.

**200** — `{ "saved": true }`

> The acknowledgement deliberately carries **no** indication of correctness. Returning it would
> turn the endpoint into an oracle that reveals the key one option at a time.

**Errors** — `400 bad-choice` (option belongs to a different question), `400 not-in-attempt`,
`409 expired` (past the deadline plus a 30s grace), `409 not-in-progress`, `404 not-found`.

---

## `POST /api/attempts/{id}/submit`

Grade and score. No body — everything needed is already stored server-side, so there is nothing a
client could tamper with. Idempotent: resubmitting returns the stored result rather than rescoring.

**200** — the full result (also available from `GET …/result`):

```json
{
  "iq": 112, "iqUnadjusted": 104, "iqLower": 95, "iqUpper": 129,
  "ageReference": {
    "applied": true, "ageYears": 34, "bandLabel": "30–34",
    "source": "modelled-v1", "cautionYoungAge": false, "description": "…"
  },
  "demographics": { "ageYears": 34, "gender": "FEMALE", "educationLevel": "MASTERS" },
  "percentile": 78.2, "confidence": "MODERATE", "reasoningLevel": "Above Average",
  "theta": 0.81, "sem": 0.58, "reliability": 0.66, "clamped": false,
  "correctCount": 16, "totalCount": 20, "accuracy": 0.8,
  "meanResponseMs": 27400, "totalDurationMs": 548000,
  "rapidGuessing": false, "focusLossCount": 0,
  "categories": [{ "slug": "matrix-reasoning", "name": "Matrix Reasoning", "band": "ABOVE_AVERAGE", "correctCount": 3, "totalCount": 3, "accuracy": 1, "meanResponseMs": 31000 }],
  "difficultyBreakdown": [{ "band": "easy", "correctCount": 4, "totalCount": 4, "accuracy": 1 }],
  "strengths": ["…"], "weaknesses": ["…"], "recommendations": ["…"], "caveats": ["…"],
  "review": [{ "position": 0, "questionId": "cmrv…", "wasCorrect": true, "explanation": "…", "choices": [{ "isCorrect": true, "rationale": "…", "wasSelected": true }] }]
}
```

`categories` reports **bands, never per-category scores** — 2–4 items cannot support a point
estimate. See [`psychometrics.md`](psychometrics.md) §5.

---

## `GET /api/attempts/{id}/result`

The same payload, for an already-submitted attempt. Returns `409 not-submitted` before submission —
this is the route that first exposes the answer key and explanations.

---

## `POST /api/attempts/{id}/focus-loss`

Records that the test-taker left the tab. **200** — `{ "focusLossCount": 2 }`.

Stored and shown on the result; never used to void a test. Switching tabs has innocent
explanations, and a false accusation is worse than a noisy signal.

---

## Authentication

### `POST /api/auth/register`

Rate limited (5/hour).

```json
{ "email": "a@example.com", "password": "at-least-ten-chars", "displayName": "Optional" }
```

**201** — `{ "user": {…}, "claimedAttempts": 1 }`

Any guest attempts from this browser are moved onto the new account and the guest cookie is
cleared. A duplicate email returns `409` with the same wording used elsewhere, so registration
cannot be used to discover which addresses have accounts.

### `POST /api/auth/login`

Rate limited (8 per 15 minutes) — the strictest limit in the application.

**401** returns `"Email or password is incorrect."` for both an unknown address and a wrong
password. The handler also verifies against a dummy hash when no user exists, so response timing
does not distinguish the two.

### `POST /api/auth/logout`

Deletes the session row, not just the cookie — a stolen token stops working immediately. This is
the concrete advantage of server-side sessions over a stateless JWT.

---

## `GET /api/me/profile` · `PATCH /api/me/profile`

Read and update the signed-in user's profile: `displayName`, `birthYear`, `gender`,
`educationLevel`. Returns `401` for guests.

A birth **year** is stored rather than an age or a full date of birth — an age would silently go
stale, and a year is all the norming needs. The response includes the derived `ageYears`.

---

## `GET /api/me` · `GET /api/me/attempts`

Current user (`{ "user": null }` when signed out), and the signed-in user's history plus dashboard
statistics. `/api/me/attempts` returns `401` for guests.

---

## `GET /api/health`

Liveness and readiness.

```json
{ "status": "ok", "database": "connected", "questionCount": 600, "required": 20 }
```

Returns **503** when the database is unreachable or the bank is too small to assemble a test — a
container that answers requests but cannot deliver a test is not ready, and a load balancer should
know that.
