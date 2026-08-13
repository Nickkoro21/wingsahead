# WingsAhead — Spec (SDD)

> Student utilization recommendations for the Wing Commander brief.
> Separate product from FDMS. Draft 2026-08-12 — awaiting user approval («Εγκρίνεται») before implementation.

## 1. Mission

Each **student** self-reports their training record. Each **instructor** submits
utilization recommendations per student (Transport–Firefighting / Helicopters /
Fighters). The **squadron CO** gets a live aggregate + printable brief for the
Wing Commander. Shareable over the internet; every submission stored centrally
and editable by its owner until the brief.

## 2. Stack & hosting (all free tiers)

- **Frontend**: static, vanilla JS/CSS (FDMS discipline: English-only UI,
  esc() everywhere), public GitHub repo **wingsahead** → GitHub Pages.
  NO data ever in the repo. **Theme gallery like FDMS** (decision 2026-08-13):
  the same 8-palette system (Obsidian default, Slate, Summit, Ridgeline, Mesa,
  Tidal, Wilderness, Aegean) ported as-is — data-theme tokens, popover cards,
  pre-paint script, per-mode quick switch; print always monochrome.
- **Storage**: **Supabase** (EU region — Frankfurt), free tier. Server-enforced
  Row-Level Security (RLS). Weekly keep-alive ping (GitHub Action) so the free
  project never pauses.
- **Access — personalized links, no accounts**: every person gets a private URL
  `…/#t=<random-token>`. Token → row in `people` (role: student | instructor |
  admin). RLS: a student can read/write ONLY their record; an instructor ONLY
  their own proposals (+ read student records — decision Q2: instructors SEE
  student data); admin reads everything. Whoever holds a link IS that person —
  the CO distributes links privately (Viber/mail); a leaked link is revoked by
  regenerating the token.

## 3. Data model

**people**: id, token, role, mn (Military Number), rank, first_name, last_name,
class (students) · duty (**Squadron Commander | DO** (Director of Operations — ο ΑΕ) **|
Flight Commander | Evaluator | Instructor**) + leadership (**Wingman | 2-ship |
4-ship | Mission Commander**) + status (**Assigned | Attached | Departed** —
decision 2026-08-13) for instructors · active.

**Access ruling (2026-08-13): PERSONAL links only — no general link.** Rollout is
PHASED: Phase 1 = the 9 students (target: links out the NEXT MORNING), Phase 2 =
the ~15-20 instructors once their form is verified.

**student_records** (1:1 with student, `last_update` auto):
- counters & repeatable lists, every entry can be flagged **pending («εκκρεμεί»)**:
- **NFS**: count (+dates optional)
- **SMS**: entries [{entrance_date, exit_date?, pending?}]
- **FAIL** / **ALMOST GOOD**: entries [{item — which item missed the desired
  performance, date?, pending?}]
- **AIRSICKNESS**: entries [{date}] (counter + dates — decision Q5)
- **Evaluations**: [{with (instructor), grade, date, pending?}]
- **Solo flights**: [{date, graded?, instructor?, grade?}] — instructor+grade
  required only when graded
- **Progress tests**: [{date, by, result | pending}]
- **Aptitude exams**: [{date, by, result | pending}]

**proposals** (instructor × student, upsert-once-per-pair):
- ranks: {fighters: 1|2|3|null, helicopters: …, transport_ff: …} — **ranking,
  multiple allowed**: 1 to 3 branches, each with an order position (decision Q1)
- flew_with: bool («έχω πετάξει μαζί του»)
- comment: optional short free text

## 4. Screens

1. **Student form** (via personal link): sectioned, repeatable rows (+ add /
   remove), Save any time, shows own last_update. Re-entry always allowed.
2. **Instructor form**: student list; per student a **compact card of their
   self-reported data** (counters, evaluations, solos) beside the ranking
   pickers (1st/2nd/3rd) + flew-with checkbox. Save/edit any time.
3. **Admin dashboard** (CO) — THREE MODES (decision 2026-08-13):
   a. **Overview**: one row per student (key counters, mini proposal bars,
      pending flags, completion status) + who has not submitted yet ·
      people/token management (generate/copy/revoke links) · CSV/JSON export.
   b. **Student analysis** (click a row — each student examined SEPARATELY):
      - Identity header (MN, rank, name, class) + pending items highlighted.
      - **Comparison chart** (vanilla SVG, mifchart discipline): the selected
        metric shown as FOUR bars — **this student · class best · class worst ·
        class average**. Metric selected by CLICK on chips: mean evaluation
        grade · evaluations count · FAIL · ALMOST GOOD · NFS · SMS entries ·
        airsickness · solo flights · progress tests · aptitude exams. Plus a
        small chronological TREND line of the student's evaluation grades.
      - Proposals panel (decision 2026-08-13): THREE BRANCH BOXES always visible
        (Fighters · Helicopters · Transport–Firefighting). A rank selector
        (1st / 2nd / 3rd choice chips) applies to ALL three boxes and refreshes
        them SIMULTANEOUSLY; each box lists the SURNAMES of the instructors who
        gave the student that rank for that branch ("Koroniadis, Paloukos …").
        Under each box, every NON-proposal appears as a POLITELY WORDED bullet —
        e.g. "• Maj Koroniadis has not recommended Fighters for this student" and,
        for instructors with no submission at all, "• Capt X has not submitted a
        recommendation for this student yet". Weighted score per branch (default
        3/2/1, formula shown), count of 1st choices, % of proposers who flew
        with them; drill-down list (who, duty, leadership, status, flew_with,
        comment).
      - **Prev / Next student arrows (and keyboard ←/→)** — the CO walks
        student-by-student during the actual Wing Commander brief.
   c. **Brief mode**: presentation-friendly (large type, one student per
      screen, arrows) + **printable brief** (monochrome, one page per student
      + a summary ranking table per class).
4. **No/invalid token**: neutral landing, no data, contact-the-CO hint.

## 5. Non-negotiables

- RLS proven by adversarial tests (student token attempting to read another
  student / instructor tampering with someone else's proposal → server refusal).
- English UI (decision Q6). DD/MM/YYYY display, ISO storage.
- Honest constraint documented in-app footer: data hosted on Supabase EU.
- The repo holds code only; Supabase URL + anon key are config (safe to be
  public — RLS is the guard), tokens are NOT in the repo.

## 6. User setup (5', guided)

1. `gh repo create wingsahead --public` + Pages enable.
2. supabase.com → New project (EU) → run our provided `schema.sql` →
   copy URL + anon key into `config.js`.
3. Admin link generated → CO adds people → distributes links.

## 7. Open items

- Weighted-score formula visible & adjustable? (default 3/2/1)
- Deadline mechanism (freeze submissions before the brief)? — v2 unless asked.
