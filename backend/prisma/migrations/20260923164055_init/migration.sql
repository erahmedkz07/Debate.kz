-- CreateEnum
CREATE TYPE "Role" AS ENUM ('participant', 'organizer', 'judge', 'admin');

-- CreateEnum
CREATE TYPE "TournamentLevel" AS ENUM ('school', 'university');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('registration', 'ongoing', 'finished');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('draft', 'released', 'completed');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('proposition', 'opposition');

-- CreateEnum
CREATE TYPE "BallotStatus" AS ENUM ('pending', 'submitted', 'confirmed');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'participant',
    "institution" TEXT,
    "city" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "level" "TournamentLevel" NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'WSDC',
    "level" "TournamentLevel" NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'registration',
    "max_teams" INTEGER NOT NULL,
    "cover_url" TEXT,
    "organizer_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "preliminary_rounds" INTEGER NOT NULL,
    "break_size" INTEGER NOT NULL,
    "languages" TEXT[],
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "registration_open" BOOLEAN NOT NULL DEFAULT true,
    "require_approval" BOOLEAN NOT NULL DEFAULT true,
    "registration_deadline" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_organizers" (
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "tournament_organizers_pkey" PRIMARY KEY ("tournament_id","user_id")
);

-- CreateTable
CREATE TABLE "scoring_configs" (
    "tournament_id" TEXT NOT NULL,
    "speaker_min" DECIMAL(4,1) NOT NULL DEFAULT 60,
    "speaker_max" DECIMAL(4,1) NOT NULL DEFAULT 80,
    "reply_min" DECIMAL(4,1) NOT NULL DEFAULT 30,
    "reply_max" DECIMAL(4,1) NOT NULL DEFAULT 40,
    "step" DECIMAL(3,1) NOT NULL DEFAULT 0.5,

    CONSTRAINT "scoring_configs_pkey" PRIMARY KEY ("tournament_id")
);

-- CreateTable
CREATE TABLE "schedule_items" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "time" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution_id" TEXT,
    "city" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judges" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution_id" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "user_id" TEXT,

    CONSTRAINT "judges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "motion" TEXT NOT NULL DEFAULT '',
    "info_slide" TEXT,
    "status" "RoundStatus" NOT NULL DEFAULT 'draft',
    "date" DATE NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debates" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "proposition_team_id" TEXT NOT NULL,
    "opposition_team_id" TEXT NOT NULL,
    "winner" "Side",
    "ballot_status" "BallotStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "debates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debate_judges" (
    "debate_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "is_chair" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "debate_judges_pkey" PRIMARY KEY ("debate_id","judge_id")
);

-- CreateTable
CREATE TABLE "ballots" (
    "id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "winner" "Side" NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaker_scores" (
    "id" TEXT NOT NULL,
    "ballot_id" TEXT NOT NULL,
    "speaker_id" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "position" INTEGER NOT NULL,
    "score" DECIMAL(4,1) NOT NULL,

    CONSTRAINT "speaker_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_registrations" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "speakers" TEXT[],
    "contact_phone" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_name_key" ON "institutions"("name");

-- CreateIndex
CREATE INDEX "tournaments_status_start_date_idx" ON "tournaments"("status", "start_date");

-- CreateIndex
CREATE INDEX "schedule_items_tournament_id_idx" ON "schedule_items"("tournament_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tournament_id_name_key" ON "teams"("tournament_id", "name");

-- CreateIndex
CREATE INDEX "speakers_team_id_idx" ON "speakers"("team_id");

-- CreateIndex
CREATE INDEX "judges_tournament_id_idx" ON "judges"("tournament_id");

-- CreateIndex
CREATE INDEX "judges_user_id_idx" ON "judges"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_tournament_id_number_key" ON "rounds"("tournament_id", "number");

-- CreateIndex
CREATE INDEX "debates_round_id_idx" ON "debates"("round_id");

-- CreateIndex
CREATE INDEX "debate_judges_judge_id_idx" ON "debate_judges"("judge_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_debate_id_judge_id_key" ON "ballots"("debate_id", "judge_id");

-- CreateIndex
CREATE INDEX "speaker_scores_speaker_id_idx" ON "speaker_scores"("speaker_id");

-- CreateIndex
CREATE UNIQUE INDEX "speaker_scores_ballot_id_side_position_key" ON "speaker_scores"("ballot_id", "side", "position");

-- CreateIndex
CREATE INDEX "team_registrations_user_id_idx" ON "team_registrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_registrations_tournament_id_team_name_key" ON "team_registrations"("tournament_id", "team_name");

-- AddForeignKey
ALTER TABLE "tournament_organizers" ADD CONSTRAINT "tournament_organizers_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_organizers" ADD CONSTRAINT "tournament_organizers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_configs" ADD CONSTRAINT "scoring_configs_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judges" ADD CONSTRAINT "judges_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judges" ADD CONSTRAINT "judges_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judges" ADD CONSTRAINT "judges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debates" ADD CONSTRAINT "debates_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debates" ADD CONSTRAINT "debates_proposition_team_id_fkey" FOREIGN KEY ("proposition_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debates" ADD CONSTRAINT "debates_opposition_team_id_fkey" FOREIGN KEY ("opposition_team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_judges" ADD CONSTRAINT "debate_judges_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debate_judges" ADD CONSTRAINT "debate_judges_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_scores" ADD CONSTRAINT "speaker_scores_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaker_scores" ADD CONSTRAINT "speaker_scores_speaker_id_fkey" FOREIGN KEY ("speaker_id") REFERENCES "speakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_registrations" ADD CONSTRAINT "team_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_registrations" ADD CONSTRAINT "team_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
