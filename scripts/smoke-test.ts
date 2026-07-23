/**
 * End-to-end smoke test against a running server.
 *
 *   npm run build && npm run start &
 *   npm run smoke                       # or: BASE_URL=https://… npm run smoke
 *
 * Exercises the whole user journey over real HTTP — start, answer, submit, review, register,
 * dashboard — and asserts the invariants that matter most, above all that the answer key never
 * reaches the client before submission.
 *
 * This deliberately complements the Vitest suites rather than duplicating them: those test units
 * and services directly, this tests the deployed surface including cookies, headers and routing.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const cookies = new Map<string, string>();
const cookieHeader = (): string => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

let failures = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (!condition) failures += 1;
  const status = condition ? "PASS" : "FAIL";
  console.log(`  ${status}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function absorb(response: Response): void {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    // A cleared cookie arrives as an empty value or an expiry in the past.
    if (value === "" || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(raw)) cookies.delete(name);
    else cookies.set(name, value);
  }
}

async function api(
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; text: string; body: unknown }> {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      ...(cookies.size ? { Cookie: cookieHeader() } : {}),
      ...(options.headers ?? {}),
    },
  });
  absorb(response);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* HTML responses are fine here */
  }
  return { status: response.status, text, body };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to look up the answer key.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    console.log(`Smoke testing ${BASE}\n`);

    // --- health ---------------------------------------------------------
    console.log("Health");
    const health = await api("/api/health");
    check("health endpoint reports ok", health.status === 200, `status ${health.status}`);

    // --- start ----------------------------------------------------------
    console.log("\nStarting a test as a guest");
    const GUEST_AGE = 34;
    const started = await api("/api/attempts", {
      method: "POST",
      body: JSON.stringify({
        mode: "UNTIMED",
        demographics: {
          ageYears: GUEST_AGE,
          gender: "PREFER_NOT_TO_SAY",
          educationLevel: "BACHELORS",
        },
      }),
    });
    check("attempt created", started.status === 201, `status ${started.status}`);

    const attempt = started.body as {
      attemptId: string;
      questions: { id: string; svg: string | null; choices: { id: string }[] }[];
    };

    check("delivers 20 questions", attempt.questions.length === 20);
    check("answer key absent from payload", !/isCorrect|"rationale"|"explanation"/.test(started.text));
    check(
      "every question has at least four options",
      attempt.questions.every((q) => q.choices.length >= 4),
    );
    check("guest identity issued", cookies.has("iq_guest"));

    // --- answer ---------------------------------------------------------
    console.log("\nAnswering");
    const key = new Map(
      (
        await prisma.choice.findMany({
          where: { questionId: { in: attempt.questions.map((q) => q.id) }, isCorrect: true },
          select: { questionId: true, id: true },
        })
      ).map((c) => [c.questionId, c.id]),
    );

    let intendedCorrect = 0;
    let saveLeaked = false;
    for (const [i, question] of attempt.questions.entries()) {
      const right = key.get(question.id);
      const wantCorrect = i % 5 !== 0; // 16 of 20
      if (wantCorrect) intendedCorrect += 1;
      const choiceId = wantCorrect ? right : question.choices.find((c) => c.id !== right)?.id;

      const saved = await api(`/api/attempts/${attempt.attemptId}/responses`, {
        method: "PATCH",
        body: JSON.stringify({
          questionId: question.id,
          choiceId: choiceId ?? null,
          responseMs: 24_000 + i * 500,
          flagged: i === 3,
        }),
      });
      if (saved.status !== 200) throw new Error(`save ${i} failed: ${saved.status} ${saved.text}`);
      if (/isCorrect|correct/i.test(saved.text)) saveLeaked = true;
    }
    check("all answers saved", true, `${attempt.questions.length} responses`);
    check("save acknowledgement reveals nothing about correctness", !saveLeaked);

    // --- reject a foreign option ----------------------------------------
    const otherQuestion = attempt.questions[1];
    const foreign = key.get(otherQuestion!.id);
    const cross = await api(`/api/attempts/${attempt.attemptId}/responses`, {
      method: "PATCH",
      body: JSON.stringify({
        questionId: attempt.questions[0]!.id,
        choiceId: foreign,
        responseMs: 1000,
        flagged: false,
      }),
    });
    check("option from another question is rejected", cross.status === 400, `status ${cross.status}`);

    // --- submit ---------------------------------------------------------
    console.log("\nSubmitting");
    const submitted = await api(`/api/attempts/${attempt.attemptId}/submit`, { method: "POST" });
    check("submission accepted", submitted.status === 200, `status ${submitted.status}`);

    const result = submitted.body as {
      iq: number; iqUnadjusted: number; iqLower: number; iqUpper: number;
      correctCount: number; totalCount: number;
      percentile: number; confidence: string; categories: { totalCount: number }[];
      review: { explanation: string }[]; difficultyBreakdown: { band: string; totalCount: number }[];
      ageReference: { applied: boolean; ageYears: number | null; bandLabel: string | null; source: string };
    };

    check("scored the intended number correct", result.correctCount === intendedCorrect,
      `${result.correctCount}/${result.totalCount}`);
    check("interval contains the estimate",
      result.iqLower <= result.iq && result.iq <= result.iqUpper,
      `${result.iqLower} ≤ ${result.iq} ≤ ${result.iqUpper}`);
    check("score within reportable bounds", result.iq >= 55 && result.iq <= 145);
    check("percentile is a real percentage", result.percentile > 0 && result.percentile < 100);
    check("every category carries at least two items",
      result.categories.every((c) => c.totalCount >= 2));
    check("difficulty profile matches the blueprint",
      JSON.stringify(result.difficultyBreakdown.map((b) => [b.band, b.totalCount])) ===
        JSON.stringify([["easy", 4], ["medium", 8], ["hard", 6], ["very-hard", 2]]));
    check("review covers every question with explanations",
      result.review.length === 20 && result.review.every((r) => r.explanation.length > 10));

    // --- age referencing -------------------------------------------------
    check("age reference applied", result.ageReference.applied,
      `band ${result.ageReference.bandLabel}, source ${result.ageReference.source}`);
    check("age snapshotted onto the attempt", result.ageReference.ageYears === GUEST_AGE);
    check("unadjusted score reported alongside the adjusted one",
      Number.isFinite(result.iqUnadjusted), `raw ${result.iqUnadjusted} vs reported ${result.iq}`);

    // A younger test-taker must score higher for the same performance — the whole point of
    // age referencing.
    const youngCookies = new Map(cookies);
    cookies.clear();
    const youngStart = await api("/api/attempts", {
      method: "POST",
      body: JSON.stringify({ mode: "UNTIMED", demographics: { ageYears: 13 } }),
    });
    const young = youngStart.body as { attemptId: string; questions: { id: string; choices: { id: string }[] }[] };
    const youngKey = new Map(
      (await prisma.choice.findMany({
        where: { questionId: { in: young.questions.map((q) => q.id) }, isCorrect: true },
        select: { questionId: true, id: true },
      })).map((c) => [c.questionId, c.id]),
    );
    for (const [i, q] of young.questions.entries()) {
      await api(`/api/attempts/${young.attemptId}/responses`, {
        method: "PATCH",
        body: JSON.stringify({
          questionId: q.id,
          choiceId: i % 5 !== 0 ? youngKey.get(q.id) : q.choices.find((c) => c.id !== youngKey.get(q.id))?.id,
          responseMs: 24_000, flagged: false,
        }),
      });
    }
    const youngResult = (await api(`/api/attempts/${young.attemptId}/submit`, { method: "POST" }))
      .body as { iq: number; iqUnadjusted: number; ageReference: { bandLabel: string | null } };

    check("13-year-old scored above their raw performance",
      youngResult.iq > youngResult.iqUnadjusted,
      `raw ${youngResult.iqUnadjusted} → ${youngResult.iq} (band ${youngResult.ageReference.bandLabel})`);
    check("age out of range rejected",
      (await api("/api/attempts", { method: "POST", body: JSON.stringify({ mode: "UNTIMED", demographics: { ageYears: 6 } }) })).status === 400);

    cookies.clear();
    for (const [k, v] of youngCookies) cookies.set(k, v);

    const resubmitted = await api(`/api/attempts/${attempt.attemptId}/submit`, { method: "POST" });
    check("resubmission is idempotent",
      (resubmitted.body as { iq: number }).iq === result.iq);

    // --- results page ---------------------------------------------------
    console.log("\nResults page");
    const page = await fetch(`${BASE}/results/${attempt.attemptId}`, {
      headers: { Cookie: cookieHeader() },
    });
    const html = await page.text();
    check("renders", page.status === 200, `status ${page.status}`);
    check("shows the confidence interval",
      html.includes(String(result.iqLower)) && html.includes(String(result.iqUpper)));
    check("shows the estimate disclaimer", /not a clinically administered/i.test(html));
    check("renders figures", (html.match(/<svg/g) ?? []).length > 10);

    // --- account claiming -----------------------------------------------
    console.log("\nRegistering and claiming the guest attempt");
    const before = await api("/api/me/attempts");
    check("history refused while signed out", before.status === 401);

    const email = `smoke_${Date.now()}@example.test`;
    const password = "a-sufficiently-long-password";
    const registered = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    check("account created", registered.status === 201, `status ${registered.status}`);
    check("guest attempt claimed",
      (registered.body as { claimedAttempts: number }).claimedAttempts === 1);
    check("session issued and guest identity cleared",
      cookies.has("iq_session") && !cookies.has("iq_guest"));

    const history = await api("/api/me/attempts");
    check("history now returns the attempt",
      (history.body as { attempts: unknown[] }).attempts.length === 1);

    const dashboard = await fetch(`${BASE}/dashboard`, { headers: { Cookie: cookieHeader() } });
    check("dashboard renders", dashboard.status === 200);

    // --- session revocation ---------------------------------------------
    console.log("\nSession handling");
    await api("/api/auth/logout", { method: "POST" });
    check("logout revokes the session", (await api("/api/me/attempts")).status === 401);

    const relogin = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    check("can sign back in", relogin.status === 200);

    const wrong = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "not-the-right-password" }),
    });
    check("wrong password rejected", wrong.status === 401);
    check("rejection message is generic",
      /Email or password is incorrect/.test(wrong.text));

    console.log(
      failures === 0
        ? "\nAll smoke checks passed.\n"
        : `\n${failures} smoke check(s) FAILED.\n`,
    );
    if (failures > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("\nSmoke test failed to run:\n", error);
  process.exitCode = 1;
});
