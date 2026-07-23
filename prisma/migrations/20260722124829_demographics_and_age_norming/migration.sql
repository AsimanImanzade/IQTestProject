-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('PRIMARY', 'SECONDARY', 'VOCATIONAL', 'BACHELORS', 'MASTERS', 'DOCTORATE', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "ageYears" INTEGER,
ADD COLUMN     "educationLevel" "EducationLevel",
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "iqUnadjusted" INTEGER,
ADD COLUMN     "normSource" TEXT,
ADD COLUMN     "thetaAdjusted" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "educationLevel" "EducationLevel",
ADD COLUMN     "gender" "Gender";
