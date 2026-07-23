-- Constraints that the Prisma schema language cannot express, but which the domain requires.
--
-- 1. Every attempt belongs to exactly one owner: a registered user OR an anonymous guest,
--    never both and never neither. Guest-first testing makes this genuinely easy to get wrong
--    in application code, so the database enforces it.
ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_owner_exactly_one"
  CHECK (("userId" IS NOT NULL) <> ("guestKey" IS NOT NULL));

-- 2. "Prevent multiple simultaneous sessions" from the spec, at the data layer.
--    A user (or guest) may have at most one attempt IN_PROGRESS at a time. Partial unique
--    indexes are the correct tool: they constrain only live attempts, leaving any number of
--    historical SUBMITTED/ABANDONED/EXPIRED rows untouched.
CREATE UNIQUE INDEX "attempts_one_live_per_user"
  ON "attempts" ("userId")
  WHERE "status" = 'IN_PROGRESS' AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "attempts_one_live_per_guest"
  ON "attempts" ("guestKey")
  WHERE "status" = 'IN_PROGRESS' AND "guestKey" IS NOT NULL;

-- 3. Designed difficulty must stay on the 1..10 authoring scale. The IRT difficulty parameter
--    is derived from this column, so an out-of-range value would silently corrupt scoring.
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_difficulty_range"
  CHECK ("difficulty" >= 1 AND "difficulty" <= 10);

-- 4. The pseudo-guessing parameter is a probability, and discrimination must be positive:
--    a non-positive `irtA` would invert the item characteristic curve and make correct answers
--    lower the ability estimate.
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_irt_parameters_valid"
  CHECK ("irtC" >= 0 AND "irtC" < 1 AND "irtA" > 0);
