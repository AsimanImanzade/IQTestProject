import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { TestRunner } from "@/components/test/test-runner";
import { resolveOwnerForPage } from "@/server/page-helpers";
import { resumeAttempt } from "@/server/services/attempts";
import { AttemptError } from "@/server/services/attempts";

export const metadata: Metadata = {
  title: "Test in progress",
  // A results/test page must never be indexed or cached by a shared proxy.
  robots: { index: false, follow: false },
};

export default async function TestPage({
  // Next.js 16: params is a Promise.
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const owner = await resolveOwnerForPage();
  if (!owner) notFound();

  // The fetch is wrapped, the render is not. Constructing JSX inside try/catch is misleading:
  // React renders components lazily, so a render-time error escapes the catch entirely and only
  // an error boundary would see it.
  let attempt;
  try {
    attempt = await resumeAttempt(attemptId, owner);
  } catch (error) {
    if (error instanceof AttemptError) {
      // Already submitted → send them to the result rather than a dead end.
      if (error.code === "not-in-progress") redirect(`/results/${attemptId}`);
      if (error.status === 404) notFound();
    }
    throw error;
  }

  return <TestRunner attempt={attempt} />;
}
