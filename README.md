# SIM ITClub Learning Hub
The SIM ITClub Learning Hub is the website for ITCamp: Frontendamentals. Participants can find all the lesson materials here and to practice what they learn.
 
## Sections
 
- **Learning**: Lesson materials for each lesson.
- **Practice**: Exercises that help participants use their skills.
## Tech Stack
 
- Hosting: Vercel
- Database: Supabase
- Source control: GitHub
## About SIM ITClub
 
SIM ITClub helps SIM students learn and use IT skills.
 
Contact: it@mymail.sim.edu.sg
 

## Setup (ITCamp rules, Nov 2026)

1. **Database**: the SIM IT Club's Supabase project, shared with the club website. The hub's
   tables and functions are in its `learning_hub` schema, and logins are the club's. The schema
   is managed in the club website's repo (`supabase/migrations/`, documented in its
   `docs/SCHEMA.md` and `docs/LEARNING_HUB.md`), not here.
2. **Environment variables** (Vercel and `.env.local`): see `.env.example`, using the club
   project's URL and keys. `SUPABASE_SECRET_KEY` is required: the server grades answers and
   saves them with it, so members can't write scores. It's the club project's admin key, so
   keep it server-side only and guard it like the club website's.
3. **Groups**: set `GROUP_COUNT` in `src/lib/groups.ts` to the number of ITCamp groups.
4. **Admins**: club EXCO and above (offices are managed on the club website). They see every
   topic unlocked, are kept off the leaderboard, and can open `/admin/results`.

## Rules

- **ITCamp subcomms log in with their club account** (SIM IT Club email and password). On
  their first visit the club database makes their learner row and gives them the ITCamp group
  the club has for them, with a seat number in it (`learners.group_seat`). Anyone the club has
  no group for picks one once.
- **Anyone else can register** with a display name: a **guest account** that saves their
  challenge scores but has no ITCamp group, no club access and no place on the leaderboard.
- **Questions** live in `src/lib/quizzes.ts` (server only: it holds the answers). Each attempt
  draws 5 (`src/lib/draw.ts`). Teammates in the same group always get different sets, and the
  same member always gets the same set for the same attempt, so refreshing changes nothing.
  Never change or reuse a question `id`; add questions to reduce overlap.
- **2 attempts per quiz** (1 + 1 extra). Each answer is saved the moment it's picked and can't
  be changed. The best finished attempt is the member's score; points = correct answers in each
  quiz's best attempt, added up over every quiz. The quiz page shows every answer with its time.
- **Guest mode** ("Continue as a guest" on the login page) needs no account: read the notes and
  try any quiz, but nothing is saved. The notes (`/learn`) and quizzes need a login or guest mode.
