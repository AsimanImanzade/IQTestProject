-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "TestMode" AS ENUM ('TIMED', 'UNTIMED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "AbilityBand" AS ENUM ('BELOW_AVERAGE', 'AVERAGE', 'ABOVE_AVERAGE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "irtA" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "irtB" DOUBLE PRECISION NOT NULL,
    "irtC" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "stem" TEXT NOT NULL,
    "svg" TEXT,
    "imageUrl" TEXT,
    "explanation" TEXT NOT NULL,
    "estimatedSeconds" INTEGER NOT NULL DEFAULT 60,
    "generatorId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "choices" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT,
    "svg" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT,

    CONSTRAINT "choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_statistics" (
    "questionId" TEXT NOT NULL,
    "exposures" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "pValue" DOUBLE PRECISION,
    "rPointBiserial" DOUBLE PRECISION,
    "meanResponseMs" DOUBLE PRECISION,
    "sumResponseMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sumTotalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sumTotalScoreSq" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sumCorrectTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalibratedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_statistics_pkey" PRIMARY KEY ("questionId")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestKey" TEXT,
    "mode" "TestMode" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "durationSeconds" INTEGER,
    "seed" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "theta" DOUBLE PRECISION,
    "sem" DOUBLE PRECISION,
    "iqScore" INTEGER,
    "iqLower" INTEGER,
    "iqUpper" INTEGER,
    "percentile" DOUBLE PRECISION,
    "confidence" "ConfidenceLevel",
    "reliability" DOUBLE PRECISION,
    "correctCount" INTEGER,
    "totalCount" INTEGER,
    "focusLossCount" INTEGER NOT NULL DEFAULT 0,
    "rapidGuessing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_items" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "choiceOrder" INTEGER[],

    CONSTRAINT "attempt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" TEXT NOT NULL,
    "attemptItemId" TEXT NOT NULL,
    "selectedChoiceId" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "responseMs" INTEGER NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_scores" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL,
    "sem" DOUBLE PRECISION NOT NULL,
    "band" "AbilityBand" NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "meanResponseMs" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "category_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "questions_signature_key" ON "questions"("signature");

-- CreateIndex
CREATE INDEX "questions_status_difficulty_categoryId_idx" ON "questions"("status", "difficulty", "categoryId");

-- CreateIndex
CREATE INDEX "questions_categoryId_idx" ON "questions"("categoryId");

-- CreateIndex
CREATE INDEX "questions_generatorId_idx" ON "questions"("generatorId");

-- CreateIndex
CREATE INDEX "choices_questionId_idx" ON "choices"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "choices_questionId_ordinal_key" ON "choices"("questionId", "ordinal");

-- CreateIndex
CREATE INDEX "attempts_userId_submittedAt_idx" ON "attempts"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "attempts_guestKey_idx" ON "attempts"("guestKey");

-- CreateIndex
CREATE INDEX "attempts_status_idx" ON "attempts"("status");

-- CreateIndex
CREATE INDEX "attempt_items_questionId_idx" ON "attempt_items"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_items_attemptId_questionId_key" ON "attempt_items"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_items_attemptId_position_key" ON "attempt_items"("attemptId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "responses_attemptItemId_key" ON "responses"("attemptItemId");

-- CreateIndex
CREATE INDEX "responses_selectedChoiceId_idx" ON "responses"("selectedChoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "category_scores_attemptId_categoryId_key" ON "category_scores"("attemptId", "categoryId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "choices" ADD CONSTRAINT "choices_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_statistics" ADD CONSTRAINT "item_statistics_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_attemptItemId_fkey" FOREIGN KEY ("attemptItemId") REFERENCES "attempt_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_selectedChoiceId_fkey" FOREIGN KEY ("selectedChoiceId") REFERENCES "choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_scores" ADD CONSTRAINT "category_scores_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_scores" ADD CONSTRAINT "category_scores_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
