-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "choices" ADD COLUMN     "rationaleI18n" JSONB,
ADD COLUMN     "textI18n" JSONB;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "explanationI18n" JSONB,
ADD COLUMN     "locales" TEXT[] DEFAULT ARRAY['en']::TEXT[],
ADD COLUMN     "stemI18n" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "language" TEXT;
