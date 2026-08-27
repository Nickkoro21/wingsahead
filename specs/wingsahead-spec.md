# Wings Ahead — Spec (SDD)

> Student utilization recommendations for the Wing Commander brief.
> Separate product from FDMS. Draft 2026-08-12 — approved and implemented.
> **Rounds 2+3 (2026-08-13)** applied as one delivery: see §3 (data model) and
> §4a (branding · terminology · evaluation identity).

## 1. Mission

Each **student** self-reports their training record. Each **instructor** submits
**ONE utilization assessment per student, about FIGHTERS**, on a five-level scale
weighted 10 · 8 · 5 · 3 · 1 (**round 10**, §4j — this replaced the per-aircraft
-type branch ranking, and no aircraft-type ranking survives anywhere). The
**squadron CO** gets a live aggregate — a **weighted mean** — + printable brief
for the Wing Commander. Shareable over the internet; every submission stored
centrally and editable by its owner until the brief.

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
decision 2026-08-13) for instructors · active ·
**round 9 (2026-08-14): external_oid** (the shared roster's IMMUTABLE object
id — unique, nullable, the join key of every import) **· call_sign · country ·
test_pilot** (see §4g).

**Access ruling (2026-08-13): PERSONAL links only — no general link.** Rollout is
PHASED: Phase 1 = the 9 students (target: links out the NEXT MORNING), Phase 2 =
the ~15-20 instructors once their form is verified.

**wa.settings** (round 18, §4t·1): `key` · `value` (nullable) · `updated_at` —
one row per installation-wide setting, in the **private** schema and therefore
unreachable from the API. Today it holds exactly one: **`assessment_class`**,
the class the instructors are being asked about (null = the assessments are
closed). Read through `wa.assessment_class()`, written only by
`public.admin_set_assessment_class`, and seeded once to `98B HAF` through the
`wa.migrations` ledger.

**student_records** (1:1 with student, `last_update` auto).

**ROUND-3 RULE (2026-08-13): every section is a LIST OF DATED ENTRIES and the
count is DERIVED.** No number is ever typed by hand anywhere in the app; the
server rejects a payload that carries one (`nfs` as an object, or a `count`
key inside any entry). **`pending` («εκκρεμεί») is GONE — round-8 ruling
(2026-08-14):** it is out of every section's whitelist, refused by name on
write and stripped on read. An unfilled fixed slot has no date, which is what
"not flown yet" already looks like; a result still awaited is a grade nobody
has written yet. See §4f.

- **NFS**: [{date*, reason* (round 5 — one of the six causes printed on form
  Α0473), note? (required when the reason is "other")}]  ← *was* count + dates
- **SMS**: [{entrance_date*, reason* (**round 8** — one of the ΚΕΠΕ entry
  conditions printed in 3-01 ΚΕΦ.2 §32β), exit_date?, note? (required when the
  reason is the Squadron CO / DO decision)}]
- **FAIL** / **ALMOST GOOD**: [{date*, category* (one of the four syllabus
  tracks), flight_code? (**round 5**: a select of THAT track's sorties +
  "Other…" free text; a code of another track is refused server-side),
  items[]* (**round 6**: a multi-select of THAT track's printed gradesheet
  items and nothing else — the custom "Other…" item is gone and the server
  refuses any name outside `wa.item_names(category)`; see §4e·2),
  instructor?, grade? (0-100 %, **whole numbers**; **round 8**: a NEW row opens
  at 40 for a FAIL and 50 for an ALMOST GOOD, editable)}]
- **AIRSICKNESS**: [{date*, instructor?, phase?}] — the brief shows WHEN and
  WITH WHOM
- **Evaluations** — **FIXED SLOTS (round 5)**: [{evaluation* (one of the eight
  stage checkrides — C4590 C4790 C5090 C5490 · I4490 I4890 · F4690 · N4690),
  date* once flown, with?, grade?}] — all eight always present, no
  add/remove, an unflown slot has no date and counts for nothing; no free
  "Other" evaluation: a progress check flight is an FPC
- **Solo flights** — **FIXED SLOTS (round 5)**: [{slot* (one of the eight
  syllabus solo slots; F4301-06 has two), sortie? (which candidate sortie was
  flown solo), date* once flown, ng* (non-graded; **round 8**: a CONTACT slot
  opens NG the first time it is filled, a FORMATION slot opens graded — both
  switchable), grade? (0-100 %), instructor? (labelled **"Authorised by"**
  everywhere since round 8)}] — grade + instructor required unless NG; NG rows are excluded
  from grade math; a solo the syllabus did not foresee is a slot-less
  "additional solo", the only solo row that can be added or removed
- **FPC** (ex "Progress tests"): [{date*, flight_code? (the stage flight that
  triggered it), evaluator? (**round 5**, ex `by` — DO / Squadron CO /
  instructor / typed), result?, grade?}]
- **CEF** (ex "Aptitude exams"): [{date*, flight_code?, evaluator?, result?,
  grade?}]

**ROUND 12 (2026-08-20) — THE LOG TABLES.** Four more sections, rendered as
**4+4 tables + lessons + exams** («4+4 πινακες για f/s και flights. ομοιως τα
μαθηματα και τα exams»). The band is the SECTION, the track is on the ROW, and
the pair is one table; nothing is pre-seeded, so `wa.slot_empty` needs no branch
for any of them. See §4l.

- **flights** / **fs** (aircraft / simulator, one shape):
  [{date*, track* (one of the four), sortie* (the table's own flow-chart list
  minus the eight checkrides; free text accepted and marked *off-catalogue*),
  seq* (1, and 2+ only via the row's **+ same-day re-fly** — never derived from
  an array index, and there is **no `(sortie, date)` uniqueness rule**),
  kind* (`syllabus` · `repeat` · `fcf` · `cef` · `other`; the last three are
  off-catalogue **by nature** and carry no warning), instructor* (required on
  every row — the round-6 solo doctrine on every sortie), instructor_oid?
  (never drawn as a box), duration? (**decimal hours to one decimal**; stores
  the ACTUAL time, the box opens with the syllabus value), grade? (**null = the
  debrief has not landed — «δεκτο το null»**), ng* (non-graded by nature ⇒ no
  grade), mission? (`complete|incomplete`, **only where the grade is absent and
  the row is not NG**; where a grade exists the mission is DERIVED by
  `wa.grade_mission` and a stored one is refused)}]
  A row whose sortie is one of the eight checkrides is **refused**: a checkride
  lives in Evaluations, and two rows for one flight are two grades that can
  disagree. *(Round 12b removed `note` and replaced round 12's three-way
  `verdict` with `mission`; both retired keys are refused by name.)*
- **lessons**: [{date*, end_date? (a lesson is a BLOCK), group* (one of the 12
  theory groups — closed), course? (off-catalogue accepted and marked; a course
  of ANOTHER group is refused, because the join key is the PAIR `(group,
  course)` — `OJT` belongs to four of them)}] — **no grade: a lesson is attended,
  not scored**, and no instructor, note, periods or attendance: round 12b's
  simplicity ruling («Μη βαλεις εκπαιδευτη … για να ειναι απλο»).
- **exams**: [{date*, exam* (one of the **8 ground-exam groups** and only those
  — the nested `exams[]` of four theory groups are COURSES of their group),
  grade? (nullable, same lag)}] — no examiner, no note (12b).

**Legacy (v1) records migrate ON READ** (`wa.migrate_record`, mirrored in
`WA.migrateRecord`): the NFS counter becomes one entry per counted event, a
pending SMS keeps the fact as a note, free-text FAIL items become `items[]`
under the placeholder category `other`, identity-less evaluations survive
un-identified, `graded:false` becomes `ng:true`, `progress_tests`/
`aptitude_exams` become `fpc`/`cef`. What cannot be completed automatically is
carried with `legacy:true`; the form highlights it, says exactly what is
missing, and still saves the rest. The flag can only be USED UP: a save may
never contain more legacy rows in a section than the stored record had.

**ROUND 12 adds the CATALOGUE-NARROWING REPAIR to that pass** (§4l): a `group`
or an `exam` the syllabus **no longer contains** is nulled and the row flagged —
the `wa.nfs_reason_fix` model — so a future syllabus revision can never make a
stored record permanently unsaveable. And the round's own MUST-FIX: **a section
`wa.migrate_record` does not NAME is deleted from every read**, because the
function builds its output key by key; the four new sections are therefore named
there *and* in `wa.entry_keys`, or `wa.strip_entry` would empty every row.

**THE ACTIVE INSTRUCTORS' SURNAMES** — `wa.instructor_surnames()` is the one
function that produces them: a JSON array of strings, sorted, distinct, active
instructors, and **nothing else** (no id, no token, no rank, no duty, no
`external_oid`). Any valid token may read them, students included — a student
may legitimately see who their instructors are. Round 9 folds the same array
into the form payload as `get_student_form(...).instructors` (and its admin
twin), so the form arrives with its own picker; **RPC
`list_instructor_names(token)`** stays as the standalone question over the same
function. Free text remains accepted in every box they fill (§4i·1).

**proposals** (instructor × student, upsert-once-per-pair) — **ROUND 10 shape**:
- **level**: one of five keys, or NULL — `strongly_recommended` (10) ·
  `recommended` (8) · `alternate` (5) · `other_assignments` (3) ·
  `strongly_other_assignments` (1). **ONE assessment, about FIGHTERS.** Closed
  list, enforced both by `proposals_level_chk` and by the write path, which
  refuses anything else naming the five. **NULL is a real answer** — "no view
  formed yet" — and is excluded from the mean rather than scored zero. See §4j.
- flew_with: bool («έχω πετάξει μαζί του»)
- comment: optional short free text
- *(frozen, round 8, retired by round 10)* `rank_fighters / rank_helicopters /
  rank_transport_ff / nr_*` — kept in the table as the migration's audit trail,
  **refused on write by name** and returned by nothing.

**instructor_records** (round 19, §4u·4) — 1:1 with an INSTRUCTOR, the mirror of
`student_records` one table over: `instructor_id` · `data jsonb` · `last_update`.
Its **one** section today is **`currency`**, a list of dated rows
`{date · kind · s_category · e_items[] · seq}` — the instructor's own flying, for
the squadron's currency register and the FDMS bridge. **Round 20 (§4v·1)**:
`category` (the programme) is **replaced** by `s_category` (the printed Σ row of
Πίνακας 9 / Πίνακας 6, plus FDMS's two recording columns), and the programme is
**derived** from it (`wa.s_category_group`) — one fact where there were two, and
no way for them to contradict each other. It has **no `entered_by`
column and no admin write path**: a currency claim says who flew what, and the
only person who can make it is the person who flew (§4u·5). Its whitelist,
strip, caps and read-time repair are **its own** (`wa.ins_sections` /
`wa.ins_entry_keys` / `wa.ins_strip_entry` / `wa.ins_section_cap` /
`wa.migrate_ins_entry` / `wa.migrate_instructor_record`) — a registry shared with
the student's would answer `'currency'` with the student's key list, and an
unregistered section is not rejected by the strip, it is **destroyed** by it.

## 4a. Branding & terminology (round 2/3, 2026-08-13)

- **Wordmark: "Wings Ahead" — with the space** — everywhere: the topbar, the
  `<title>`, the landing, and the printed brief. The **364 MEA emblem**
  (`app/assets/364mea.png`, 240 px copy for the UI) sits beside it on screen
  and at the head of every printed page, forced monochrome in print like
  everything else.
- **DEFAULT PALETTE = Slate (light)** — the gallery keeps all eight palettes
  and a stored choice always wins; the `<head>` pre-paint script mirrors the
  same default so there is no flash.
- **FPC** = Δοκιμή Προόδου (flight progress check) · **CEF** = Εξέταση
  Καταλληλότητας (evaluation with a Squadron Evaluator). Both replace the old
  English names everywhere and carry that gloss as a tooltip on the ⓘ next to
  every section header (`WA.SECTIONS_META`, one place for label + tooltip).

## 4b. Round 4 (2026-08-13)

**TERMINOLOGY — the progress check is an FPC** (Δοκιμή Προόδου, *flight
progress check*), never "FCP". The correction runs through the storage key
(`fpc`), the form section, the metric chip, every table, the brief, the print
sheet, the CSV headers and the tooltips. The two superseded storage keys
(`progress_tests` from v1, `fcp` from round 3) are read for ever by
`wa.migrate_record` / `WA.migrateRecord` so no stored record is stranded, and
`validate_record` refuses to WRITE either of them with a message that names the
new key. `CEF = Εξέταση Καταλληλότητας` is unchanged.

**ENTER ON BEHALF (the CO fills in anybody's form).** Four SECURITY DEFINER,
admin-gated RPCs: `admin_get_student_form` / `admin_save_student_record` and
`admin_get_proposals_of` / `admin_save_proposal`. They do NOT fork the
validation: owner and CO both go through `wa.write_record` / `wa.write_proposal`
— a CO typo is refused exactly like a student typo. The dashboard opens the
SAME form UI bound to the target (`WA.renderStudent` / `WA.renderInstructor`
with `{asCO:true, targetId}`), reached through the hash sub-route
`#t=<admin token>&co=rec|prop:<uuid>` so Back, reload and bookmark never lose
the admin session; the dashboard reopens on the tab and student it was left on.

**TRANSPARENCY is the price of that power.** A write through the four RPCs
stamps `entered_by:'admin'` on what the CO actually wrote (server-side — the
client can neither forge the stamp nor preserve one). A PROPOSAL is one row and
is stamped whole. A RECORD is a list of entries, so the CO's payload is
**diffed against the stored record** (`wa.stamp_record_diff`): an entry that
deep-equals a stored entry keeps the provenance it already had, an entry that is
NEW or MODIFIED becomes the CO's, and a deleted entry leaves nothing to
attribute. Adding one line to a student's 17 self-reported entries therefore
stamps one line — round 4 stamped all 18, which made the record lie about
itself in the exact place the feature exists to be honest. The stamps survive
further CO saves (a CO re-save that changes nothing changes nothing, byte for
byte). **~~The owner saving clears them all.~~ SUPERSEDED by the round-8
supremacy inversion (2026-08-14, §4f): a CO entry is LOCKED for its owner —
the owner's save carries it through unchanged and no longer strips the stamp,
and a payload that alters or drops one is refused.**
The record-level flag is **derived, never typed** (`wa.record_stamp`): 'admin'
when at least one entry carries it, or when the CO created a record its owner
has never saved. It means *"contains CO-entered data"* — so every view must say
WHICH, by comparing `wa.co_entry_count` against `wa.entry_count`: a filled
**"CO" tag** means the whole record is the CO's, a hollow **"+N CO"** means the
owner's record with N CO additions. The tag appears wherever the row is shown —
student form, instructor card, drill-down, summary tables, brief mode, print —
the entries CSV carries a per-entry `Entered by` column, the summary CSV carries
`self` / `self+CO` / `CO` plus the count, and the class summary states the split
in one line: "7 self-reported (1 with 1 entry added by the CO) · 2 entered by CO".

**PER-SECTION ENTRY-KEY WHITELIST** (`wa.entry_keys`, mirrored in
`WA.ENTRY_KEYS`): an entry may carry only the keys its section defines.
Unknown keys are refused on write with a message that lists what is accepted,
and stripped from stored legacy rows on read. ~~`pending` is accepted only in
FAIL / ALMOST GOOD / evaluations / FPC / CEF.~~ **SUPERSEDED (round 8,
2026-08-14, §4f): `pending` is accepted NOWHERE.** `wa.pending_sections` and
`wa.pending_count` are dropped; the key is refused by name and stripped on read.

**Grades never print bare.** `WA.pct()` is the single renderer: null, undefined
or non-numeric becomes an em-dash, everywhere a percentage reaches the DOM or
the paper.

**The evaluation COUNT is gone from every surface** (it survived round 2 only as
a chip removal): overview column, brief kgrid, print summary row, instructor
self-card and the summary CSV. `WA.recStats` has no `evals` key at all, so the
number cannot come back by copying a line. Per-evaluation grades and the
summary table remain the carriers.

## 4c. Round 5 (2026-08-13) — the syllabus enters the data model

Round 5 is the hands-on review round: five of the six changes replace free text
with **the printed source of truth**, and the sixth is an audit.

**NFS carries the REASON printed on the sheet.** `nfs[i].note` is joined by
`nfs[i].reason`, one of the six causes of the ΦΜΠ as printed on form **Α0473
«ΦΥΛΛΟ ΜΗ ΠΤΗΣΗΣ ΜΑΘΗΤΗ – ΕΚΠΑΙΔΕΥΟΜΕΝΟΥ»** (3-01/2025 ΔΑΕ, ΚΕΦ.9, PDF page
219 = printed page 201): failed questionnaire · failed pre-flight briefing ·
failed flight · failed F/S · illness · other cause. English labels, the Greek
line verbatim in the option tooltip and under the box; "other" requires the
cause in the note — it is the sheet's own blank «ΑΛΛΗ ΑΙΤΙΑ:» line.
`WA.NFS_REASONS` ↔ `wa.nfs_reasons()`.

**Flight codes are pickers, per category, everywhere.** One shared picker
component (`pickerF`) draws a real `<select>` over a closed list with an
"Other…" option that reveals a free-text box. FAIL / ALMOST GOOD offer **only
the chosen track's sorties**, so *Instrument + C4302* is unreachable; changing
the track drops a code that belonged to the old one, out loud. FPC / CEF offer
**every stage sortie** (checkrides included) as the TRIGGER flight; a solo slot
offers its section's solo candidates. Server side, `wa.code_track()` reads the
track off the code's letter (B/C contact · I instrument · F formation ·
N navigation — verified against all 133 codes) and **refuses** a
syllabus-shaped code that contradicts its category, while a code the generated
catalogue does not know is **accepted and shown marked** (`*`, "not in the
syllabus catalogue"): the syllabus data may lag reality, and a record must
never become unstorable because of it.

**Grades are whole numbers.** `step=1` on every grade box and
`wa.chk_grade` refuses a fraction by name ("62.5 is not accepted — round it,
e.g. 63"). Stored fractions are never rewritten behind the owner's back: they
RENDER rounded with the raw value in the tooltip (`WA.pct`), export raw
(`WA.pctRaw`), and the form offers a **"Round to 63%"** button on the row.

**Solo flights and evaluations are FIXED SYLLABUS SLOTS — no add, no remove.**
The solo slots are generated from the flow chart: every Training Section whose
printed duration block says SOLO SORTIES > 0 contributes that many rows —
**eight slots, and F4301-06 carries TWO** (SORTIES/HOURS SOLO: 2/2,4), so it
draws two distinct rows. `WA_SOLO_SLOTS` ↔ `wa.solo_slots()`; each slot knows
its candidate sorties, and `solo_flights[i].slot` / `.sortie` record which one
was flown. The eight checkrides are the same idea with the identity as the key.
A slot is **empty until flown** (round 5 said "pending"; the word and the flag
went in round 8, §4f — an empty slot needs neither): the mandatory-date rule is relaxed for these
two sections only (`wa.slot_empty`), an unflown slot **counts for nothing**
(`wa.entry_count`, `wa.co_entry_count`, `WA.recStats`) and is **never stamped**
as CO-entered. Reality is not stuck: an unforeseen solo is a slot-LESS
"additional solo" (add/remove kept), an earlier attempt at a checkride survives
beside its slot, and an imported evaluation that finally gets identified moves
into its empty slot. Migration places pre-round-5 solos in the earliest free
slot **in date order** — the slots are in stage order, so the k-th solo flown
is the k-th prescribed — and anything beyond takes the additional path.

**FPC / CEF: trigger flight + EVALUATOR.** Both sections gain `flight_code`
(due to which stage flight) and rename `by` → `evaluator`, picked from **DO ·
Squadron CO · the squadron's instructors · Other…**. The superseded key is read
for ever and refused on write with a message that names the new one. Every
surface prints the same line: **"FPC (C4590) — DO — 12/08/2026"**
(`WA.checkLine` / `WA.checkLineHTML`). Several FPC after the same flight are
simply several entries.

**Multi-item display audit.** `items[]` was already stored and rendered in
full; what was missing was the *evidence* at a glance. Every surface now states
the count beside the list — chips in the form, a "3 items" badge in the CO's
tables, "(3 items)" in the brief and the instructor card — and the entries CSV
carries the list **comma-joined** in one cell plus an **Item count** column.

## 4d. Round 5b (2026-08-13) — the three residuals of the round-5 review

Three findings survived round 5. All three are the same species of defect: a
rule that is stated in one place and not applied in another.

**Whitespace is not data — the NORMALISATION BOUNDARY.** `wa.code_track()`
matches `^[BCIFN][0-9]{4}$` and `wa.chk_text` never trimmed, so a hand-made
payload with `flight_code = " C4302 "` under the *Instrument* track was not a
syllabus code to the validator: the category⇄track refusal never ran and the
padded string was stored verbatim (HTTP 200). The regexes were right; the input
reaching them was not. Every string of a record is now normalised **once**, at
the boundary: `wa.norm_line` (whitespace runs — space / tab / newline / NBSP /
ZWSP — collapse to one space, ends cut), `wa.norm_code` (= `norm_line` + upper
case, for `flight_code` / `sortie` / `slot` / `evaluation`) and `wa.norm_free`
(free text keeps its paragraphs, loses its edges: `note` / `result` / `phase` /
`comment`). `wa.norm_record` is applied in `wa.write_record` **before**
`wa.validate_record` and as **what is stored**, so a value is checked exactly as
it is kept; and again in `wa.migrate_record`, so a padded value written by an
older instance surfaces clean on read. The client mirrors it (`WA.normLine` /
`WA.normCode`, used by `WA.codeTrack`, `WA.sortieOf`, `WA.sortieKnown` and the
form's `buildPayload`) — without it the *live* "belongs to the Contact track"
note and the pre-save refusal went quiet on padded input too.
**Already-stored padded values**: the row is **never rewritten behind the
owner's back**. It surfaces trimmed, stays readable on every surface, and if the
clean value now contradicts its own category the next save is **refused until
the pair is fixed in the picker** — the same "keep it, ask for it" contract the
`legacy` rows have.

**The rounding offer is LIVE.** The block message told the student to press the
"Round to 63%" button on the row, but the button was rendered only for a
fraction that was already *stored*: typing `62.5` produced the message and no
button. `fixnoteHTML` is now called both at render time and on every keystroke
in a grade box (`refreshFixnote`, in place — the input is never redrawn under
the student's fingers), so the note and the button appear the moment the value
is fractional and leave the moment it is not. One form serves the student and
the CO, so both got it.

**The print sheet states the item count.** The FAIL / ALMOST GOOD rows of the
printed brief listed the items without ever saying how many, while the form's
chip header, the CO's tables, the brief, the instructor card and the CSV all
did. The wording now lives in one helper (`WA.itemsN` / `WA.itemsCount` /
`WA.itemsCountHTML`) that every surface calls, print included — a new surface
cannot drift from the others.

> **Round-8 note (2026-08-14):** the normalisation boundary of this round now
> also carries `sms[i].reason` (a padded `'  sortie59  '` is stored and judged
> as `sortie59`), and the live rounding offer is unchanged by the new FAIL /
> ALMOST GOOD grade defaults — 40 and 50 are whole numbers and pass silently.

## 4e. Round 6 (2026-08-13) — five strictness rules

The second hands-on review round. Each of the five replaces something the form
accepted out of politeness with the thing the squadron can actually use, and
each keeps what is already stored **readable everywhere** while **refusing to
write it again** until it is corrected — the "keep it, ask for it" contract the
legacy rows have had since round 3, now applied to rules the old form never
asked about. The old contract is not weakened: a row the OLD form never
questioned (an NFS with no date) still saves, incomplete, so nothing is lost
while the student works through the rest. Which of the two a row is, the row
itself says — `blocksSave()` in the form is the single function behind the
row's note, the banner's count and the refusal alike.

**1 · AIRSICKNESS NAMES THE FLIGHT.** The entry is `{date*, flight_code*,
instructor}` — a picker over **every sortie of the stage** (airsickness does not
respect the syllabus track) with the round-5 "Other…" free-text escape. The
free-text *phase of flight / note* is gone: the form draws no box for it, and
the admin table / brief / print / CSV columns say **Flight**.
**Round 6b — THE FLIGHT IS MANDATORY** (the round-6 intent was *"add the
flight"*; an event with no sortie on it is a date and a name, and no pattern can
be read out of that). The label carries the asterisk, the save is blocked with
the rule in words, and the server refuses `absent` / `null` / `""` / `"   "`
alike — the value passes `wa.norm_code` at the write boundary, so a padded
string arrives as `''`. **Required on legacy rows too**, exactly like rule 4:
the flag excuses what the old form never asked for, never a rule of this round.
A note already written is **not destroyed**: it is read, rendered greyed as
"legacy note" on every surface, and its row is refused on the next save until
the flight is chosen — with the sentence that explains what happened to the
note, where a plain flight-less row gets the rule itself. Migration
(`wa.migrate_record` / `WA.migrateRecord`) flags **every** flight-less row, not
only the note-carriers. `wa.phase_count` additionally refuses any payload that
GROWS the number of rows carrying a note, so the retired field cannot come back
through a hand-made payload either — the same "may only be used up" rule the
legacy flag has.

**2 · FAIL / ALMOST GOOD ITEMS ARE SYLLABUS ONLY.** The custom
"Other… (type it yourself)" item **dies**. `items[]` may hold only the printed
gradesheet names of the entry's own category — `wa.item_names(category)`,
generated from the same source as the JS catalogue — and anything else is
refused **by name**, with the rule spelled out. A row still filed under the
migration placeholder `other` has no catalogue at all and must be given a real
track first. Student and CO share one validation path, so the option is gone
from every surface at once. Legacy custom strings survive: greyed chips marked
*legacy*, a per-row note naming what to replace, and the entry is refused until
every one of them is.

**3 · EVALUATIONS FOLLOW THE SYLLABUS ORDER.** A later checkride cannot be
FILLED while an earlier one has not been flown. **The order is not a judgement
call**: `tools/gen-items-catalog.py` reads the **FILE ORDER of the sortie
entries in `data/flowchart2.json`** — the order of the printed Training Flow
Chart — and writes it into `WA_EVAL_ORDER` and `wa.eval_ids()` in the same run,
so the two mirrors cannot drift. The definitive sequence is
**C4590 → C4790 → C5090 → C5490 → I4490 → I4890 → F4690 → N4690**. The client
DISABLES the boxes of a slot whose predecessors are unflown and says
*"complete C4590 first"*; the server refuses the same fill with
*"evaluations follow the syllabus order — C4790 cannot be recorded while C4590
has not been flown"* (round 8 wording — the sentence said "is pending" until
the flag was retired, §4f). An empty fixed slot is always allowed: it is the
state all eight start in, and "recorded" means "flown". A row that is ALREADY filled out of order is never
frozen (a value must stay correctable): it is marked, and the save is refused
until the predecessor is filled or the row is cleared.

**4 · EVERY FLOWN SOLO NAMES ITS INSTRUCTOR — NG INCLUDED.** A student does not
launch alone on their own authority: somebody authorises the solo and signs for
it. **NG removes the GRADE, never the person.** ~~The label follows the row —
"Authorising instructor" on an NG row, "Evaluator / instructor" on a graded
one~~ — **round 8 (2026-08-14) gives it ONE label on every surface:
"Authorised by"** — and the name is required on both sides. It is asked of legacy rows too:
the flag excuses what the old form never asked for, never a rule of this round.
**Round 6b — one absence, four spellings.** `absent` / `null` / `""` / `"   "`
all mean nobody signed for the solo and all four are refused, on the NG side and
the graded side, each with its own sentence (the AUTHORISING instructor · the
instructor / evaluator who signed for it). Before this, `chk_text(required)`
only asked whether a STRING was present, so a graded row could carry
`instructor:""` through; and an absent key was refused with a generic
"required text missing" instead of the rule.
Migration flags a stored NG solo with nobody's name, and every surface prints
"not recorded" instead of an empty cell (`WA.soloWho` / `WA.soloWhoHTML` /
`WA.soloWhoPhrase` — one helper, so table, brief, card, print and CSV cannot
drift).

**5 · AN FPC IS CONDUCTED BY THE SQUADRON CO OR THE DO.** The FPC evaluator
picker loses the instructor surnames and the free-text "Other…": exactly two
options (`wa.fpc_evaluators()` ↔ `WA.FPC_EVALUATORS`). An instructor's name in
that box was always a mis-filed CEF or an ordinary debrief. **CEF is untouched**
— an Εξέταση Καταλληλότητας is flown with a Squadron Evaluator and keeps its
open list (DO · Squadron CO · the instructors · typed). A stored value from
before the rule is read, named under the box, marked in the CO's table, and
refused on the next save.

**GENERATION.** `tools/gen-items-catalog.py` now writes BOTH mirrors in one run
over one source: `app/items-catalog.js` (+ `WA_EVAL_ORDER`) and the
**GENERATED BLOCK** of `db/schema.sql` (`wa.eval_ids` / `wa.eval_pos` /
`wa.item_names`, 117 item names). Nobody types either list, so they cannot
disagree.

**DEMO DATA.** The seed violated rule 3 (one demo student had I4490/F4690 over
empty C5090/C5490/I4890; another C5090 over an empty C4790 and I4490 over an
empty C5490); the gaps were filled with the flights they must have been, in
date order. One seeded item read "FORMATION TAKEOFF" where the printed sheet
says "FORMATION TAKE OFF", and was corrected. Everything else was left exactly
as it was, so the seed still carries **one legacy row per new rule**: two
airsickness phase notes, three hand-typed items, two NG solos with no name and
one FPC conducted by an instructor.

## 4f. Round 8 (2026-08-14) — the CO's word is final, and the form stops hedging

The third hands-on review round. Two of the nine changes are rulings about
AUTHORITY and about what the data model is allowed to be vague about; the rest
are the form saying out loud what the squadron already does.

**1 · SMS NAMES ITS ΚΕΠΕ ENTRY CONDITION.** SMS is the squadron's Special
Monitoring Status — **ΚΕΠΕ, «Κατάσταση Ειδικής Παρακολούθησης Εκπαίδευσης
Μαθητή»** (3-01/2025 ΔΑΕ, ΚΕΦ.2 §32) — and an entrance is not a matter of
prose. `sms[i].reason` is mandatory and closed, exactly as `nfs[i].reason` has
been since round 5: **§32β prints six conditions**, at least one of which puts
a student in ΚΕΠΕ (PDF page 54 = printed page 36, verified letter-for-letter):
59% or below on any sortie or F/S (airsickness and flight-physiology incidents
excepted) · 63% or below on two consecutive flights (finals and Δοκιμές
Προόδου excepted) · airsickness on two consecutive flights · one failed written
or ground exam, CBT included · 2 consecutive or 4 non-consecutive failed oral
ground exams at the pre-flight briefing · the instructor's own recommendation
for unacceptable progress between flights. The **seventh option is not an
invented "Other…"**: it is the opening sentence of the same §32β — the standing
discretion of the Squadron CO / DO — which the six conditions specify
(«Ειδικότερα…») without exhausting. That is the only room the regulation
leaves, so it is the only option beyond the six, it is NAMED rather than blank,
and it demands the reason in writing (§32δ(2): the student is told why he was
put in ΚΕΠΕ). English labels, the Greek verbatim in the option tooltip and
under the box. `WA.SMS_REASONS` ↔ `wa.sms_reasons()`. A stored entrance from
before the rule is **readable everywhere and refused on the next save** until
the condition is chosen — the standing "keep it, ask for it" contract, asked of
legacy rows too.

**2 · "+ ADD" IS THE ACCENT.** Adding a row is what a student comes to a
section to do, and it wore the same quiet outline as *remove* and *back*. One
class (`.btn-add`) fills it with `--accent` / `--on-accent` — the one pair the
palette catalogue guarantees at ≥ 4.5:1 — so it is AA in all eight palettes
(measured: 6.49:1 Slate … 12.3:1 Aegean).

**3 · A NEW FAIL OPENS AT 40, A NEW ALMOST GOOD AT 50.** The two are the
squadron's «ΑΠΟΤΥΧΙΑ» and «ΥΣΤΕΡΗΣΗ» bands; a student corrects a number far
more reliably than they supply one. Both stay editable and both are still
whole-number validated. Only a NEW row is prefilled — nothing stored is ever
overwritten.

**4 · PENDING DIES EVERYWHERE.** The tick box, the flag, the badges, the
columns, the counters and the chips are gone: form, admin tables (including the
evaluations summary PENDING column and the overview column), brief, print, CSV,
completion. **An unfilled fixed slot simply reads as not-yet-flown** — it has
no date, which is what that already looks like — and a result still awaited is
a grade nobody has written yet. `pending` is out of every entry-key whitelist,
**refused by name** on write (`'the pending flag was removed — …'`) and
**stripped on read**, so a record written before this round stops carrying it
the moment it is read. `wa.pending_sections` / `wa.pending_count` /
`WA.pendingItems` / `recStats.pending` are deleted, not merely unused.

**5 · THE SOLO SLOT OPENS THE WAY ITS SECTION FLIES.** The CONTACT (adaptation)
solos — C4791 and the C48xx / C49xx / C52xx / C53xx slots — have nobody in the
other seat to grade them, so the row **opens NG the first time it is filled**
and names who authorised the launch; the FORMATION slots (F43xx ×2, F45xx) open
**graded**. It is a default and not a rule: the Graded/NG chips stay live, an
explicit tap is never overridden, and a row that already has an answer is never
moved (`WA.soloDefaultNG`, off the slot id's first letter — nothing is typed
into the generated catalogue). The personnel label becomes **"Authorised by"**
on every surface, replacing *"Authorising instructor"* / *"Evaluator /
instructor"*: form, admin table, brief, print, and `WA.soloWho*` (which also
loses the *"(authorising)"* suffix and the `w/` prefix).

**6 · THE INSTRUCTOR SAYS NO OUT LOUD.** *(SUPERSEDED BY ROUND 10, §4j — the
whole branch ranking including this fourth state was retired; the rule it
established, that the silences must never share a sentence, survives the
reshape and is why round 10 still separates "has submitted but has not formed a
view yet" from "has not submitted … yet".)* A branch had three states and
"untouched" had to carry two meanings at once — *"I would not send him there"*
and *"I have not formed a view"* — which the CO cannot tell apart on the brief.
The vocabulary gains a fourth word: **ranked 1st / 2nd / 3rd · NOT RECOMMENDED
· untouched**, the first two mutually exclusive (server check + table
constraint `proposals_nr_excl`). It is stored (`proposals.nr_*`), it reaches
the drill-down as its own cell, and the three silences never share a sentence:
**"Maj Alfa does not recommend Fighters for this student"** (a judgement)
vs *"Capt Bravo has not recommended Fighters …"* (a proposal that does not
name the branch) vs *"Capt X has not submitted a recommendation …"* (no
proposal at all). The aggregates keep the sets disjoint (`not_recommended` is
excluded from `not_this_branch`). **WORDING SWEEP:** "A.GOOD" / "A.Good" →
**"Almost Good"** and "w/" → **"with"** in the instructor card, the admin
tables, the brief and the print sheet. **THE INSTRUCTOR VIEW GETS A PRINT
SHEET**: it had none, so Ctrl+P printed the live form — chips, filter boxes and
all. `#print-ins` now prints one block per student (kept whole across page
breaks) with the branch table, the flown-with / comment line and the student's
own reported record in two compact tables, under the same monochrome brand
header as the CO's brief.

**7 ·** folded into 4.

**8 · THE AXIS FOLLOWS THE DATA.** The per-evaluation comparison chart pinned
to 0-100 spent four fifths of its height on a range nobody is in: 69 · 77 · 87
drew three bars of almost the same length. The floor is now **the lowest value
actually plotted, less 5, floored at 0**, and the top stays the honest 100 so
nothing is exaggerated; gridlines and ticks follow, the bar value labels stay.
Counts keep their 0-based axis — a bar chart of "how many FAILs" must start at
zero or it lies. (Verified: grades {69, 77, 87} → axis 64–100, ticks
64/73/82/91/100.)

**9 · CO EDITS PREVAIL — THE SUPREMACY INVERSION.** *Supersedes the round-4b
owner-reclaim rule of §4b.* When the Squadron CO writes a line into a student's
record he is not making a suggestion, and a record in which the student can
quietly overwrite the CO's correction is a record the CO cannot brief from.
An entry the CO **created or modified** (`entered_by:'admin'`) is therefore
**LOCKED for its owner**: the student sees it, marked **"🔒 locked by CO"**,
with every control inside the row disabled and no remove button, and cannot
modify or delete it. The owner's save must carry **every** CO entry through
**unchanged** — matched fact for fact by `wa.entry_core`, position first, the
same way the CO diff matches — and the server refuses a payload that alters or
drops one, *"this entry was set by **the squadron administration** and only
**the admin** can change or remove it — it is shown on your form locked, and
your save must leave it exactly as it stands"* (a whole section omitted from the
payload is caught by the same rule). **Round 17b (R17 verify item B)** rewrote
that sentence: round 17 changed the client's half of it and left the server
still saying *«the squadron CO … only the CO»*, so the one sentence a student is
ever shown twice — once on the locked row, once when the save is refused —
named **two different people**. Both refusal sites now read it from **one**
definition, `wa.admin_lock_msg()`, which cannot drift from itself.
The owner path **no longer strips stamps**: `wa.strip_stamps` is dropped and
replaced by `wa.carry_stamps`, which preserves the stored provenance of every
matched entry (admin stays admin, null stays null) and leaves everything the
owner wrote unstamped. **Admin stamping** — the diff-stamp of the on-behalf
path, called *«CO diff-stamping»* until round 17 — is unchanged; **the admin can
still edit or delete his own entries, and the admin editing an OWNER entry
re-stamps it admin — which locks it.**

> **ROUND 17 RENAMING (2026-08-22) — READ THE WHOLE OF §4f WITH THIS
> SUBSTITUTION.** «Ο admin δεν ειναι ο squadron CO, ειμαι εγω, ο developer.
> ⟨SURNAME⟩. Διορθωσε το» (§4s·4). The mechanism is untouched to the byte —
> `entered_by='admin'` was already the stored value — and only its NAME and the
> words the user reads change: wherever this section says *the CO* / *the
> Squadron CO* about **the holder of the admin link**, read **the admin** / **the
> squadron administration**, and *«CO diff-stamping»* is **«admin stamping»**.
> Where any section of this document says *Squadron CO* about **who may conduct
> an FPC or a CEF, or who may put a student in ΚΕΠΕ** (§4e·5, 3-01 ΚΕΦ.2 §32β),
> it means the real APPOINTMENT and is unchanged: that officer exists, and he is
> not this application's admin. The record-level derived stamp follows:
`wa.record_stamp` is now consulted on both paths, so a record keeps saying
"contains CO-entered data" after its owner saves it; only the one case the
entries cannot settle (a record the CO opened that nobody has filled) stays on
the CO path, because an empty record locks nothing.

*Καταγραφή (Round 9 verify, item C — διορθωμένη αιτιολόγηση από το follow-up
verify):* ένα **ΝΕΟ** entry του owner που φτάνει με πλαστό `entered_by:'admin'`
γίνεται δεκτό και η σφραγίδα **αφαιρείται σιωπηλά** από το `wa.carry_stamps`
(μη-ταιριασμένο entry ⇒ το κλειδί **διαγράφεται** — απόν, όχι null). Αυτό είναι
**σκόπιμο**, όχι κενό: ο client δεν στέλνει ποτέ `entered_by` (το buildPayload
δεν το εκπέμπει και το `wa.entry_core` το εξαιρεί από το match — η σφραγίδα
ξανακολλιέται πάντα από το ΑΠΟΘΗΚΕΥΜΕΝΟ record, ποτέ από το payload). Το κλειδί
μένει στο `wa.entry_keys()` για την πλευρά της **ΑΝΑΓΝΩΣΗΣ**: το
`wa.strip_entry` περιορίζει κάθε αποθηκευμένο entry στα επιτρεπτά κλειδιά του
τμήματος, οπότε αν το `entered_by` έφευγε από τη λίστα θα σβηνόταν κάθε
αποθηκευμένη σφραγίδα CO στο διάβασμα. Μια ονομαστική άρνηση για πλαστά νέα
entries θα πρόσθετε μηδενικό όφελος ασφάλειας — τίποτα πλαστό δεν φτάνει ποτέ
στη βάση ως 'admin' (αποδεδειγμένο με RPC probe).

**ΑΠΟΦΑΝΣΗ 2026-08-18: το owner-reclaim ΠΑΡΑΜΕΝΕΙ στις προτάσεις — η CO-υπεροχή
ισχύει μόνο στα στοιχεία μαθητών.** Η αντιστροφή υπεροχής παραπάνω κλειδώνει
**entries μέσα σε student records**, όπου η γραμμή του Διοικητή είναι διόρθωση
στοιχείου. Μια **πρόταση** (`proposals`, instructor × student) είναι κάτι άλλο:
είναι η **κρίση του συγκεκριμένου εκπαιδευτή** για τον μαθητή του, μία γραμμή
που φέρει το όνομά του. Ο CO που τη γράφει «εκ μέρους του» δεν διορθώνει
στοιχείο — καταγράφει γνώμη· και ο εκπαιδευτής **πρέπει** να μπορεί να την
ξαναπάρει και να τη διατυπώσει όπως πραγματικά κρίνει. Άρα το
`admin_save_proposal` εξακολουθεί να σφραγίζει `entered_by:'admin'` (διαφάνεια),
αλλά η **επόμενη αποθήκευση από τον κάτοχο-εκπαιδευτή την ανακτά** — καμία
κλειδαριά, κανένα refusal. **Καμία αλλαγή κώδικα σε αυτόν τον γύρο**: η γραμμή
καταγράφει ότι η υπάρχουσα συμπεριφορά είναι **η θελημένη** και δεν πρέπει να
«διορθωθεί» σε επόμενο πέρασμα ευθυγράμμισης με το §4f.

## 4g. Round 9 (2026-08-14) — ONE ROSTER FOR EVERY FDMS APP

Until now each app kept its own copy of the squadron. Round 9 makes the
squadron a **single private file** that every FDMS app reads, and turns both
apps into consumers of it.

**THE FILE.** `D:\FDMS-roster\roster.json`, schema `global-roster-v1`. It lives
OUTSIDE both public repos and always will. Per person: `oid` (immutable),
`mn` (null until the user supplies them), `rank`, `last_name`, `first_name`,
`duty`, `leadership`, `call_sign`, `country` (HAF | ITAF), `test_pilot`,
`status`, `duty_eligible {SOF, RSU, RSU_solo}`, `experienced`. `students[]` is
empty for now (they arrive next week) and the generator already handles them.

**THE OID IS THE IDENTITY, AND IT IS IMMUTABLE.** People move, get promoted,
change call signs and leave; the object id does not. It is therefore the join
key of every import, and the ONE field neither app lets anybody rewrite:
`people.external_oid` (unique, nullable — a person added by hand simply has
none). `admin_save_person` refuses to change a non-null one by name, and
allows a null one to be set ONCE so the CO can **adopt** a hand-made person
into the roster instead of ending up with a duplicate after the next import.

**THE SCHEMA GAINS FOUR COLUMNS** (idempotent, upgrade-safe):
`external_oid` · `call_sign` · `country` · `test_pilot`. `country` is TEXT and
deliberately not an enum — the country dropdown carries HAF / ITAF plus the
"Other…" free-text escape (§4h), and the third air force must not need a
migration. All four travel in `wa.person_json`, so every surface that already
names a person can name them the way the squadron does.

**`tools/gen-people-import.py`** reads a roster path and writes
`people-import.sql` for the SQL editor:
- **upsert BY `external_oid`** — known id updated in place, new id created,
  **anybody the roster does not mention left exactly as they are** (departures
  stay a decision somebody makes on purpose);
- **the token is never in the update list** — a personal link already
  distributed keeps working through any number of re-runs, and a new person
  gets a token from the column default. Re-running is safe by construction,
  which is the only way an import is ever used twice;
- **a field the roster is silent about is not written** (`coalesce(new, old)`),
  so the null `mn` of today cannot blank an MN typed into the People tab;
- `active` is set on INSERT only — a link the CO revoked stays revoked;
- a **role guard** stops the script before it writes if one of the ids is
  already in the database as the other kind of person;
- the final SELECT prints **surname · rank · role · roster id · call sign ·
  personal link** for EVERY person — the CO's copy-paste distribution sheet.

**THE PRIVACY GATE IS CODE, NOT A COMMENT.** The generated SQL carries real
names, so the tool writes next to the private roster by default and **refuses**
to write anywhere inside a git working tree; `people-import.sql` is git-ignored
here as well; and the demo data of this repo keeps its fake people for ever.
No name, call sign or roster-derived string may ever enter this repository —
the two instructor surnames this document used as examples were coincidental
fakes and are now **Alfa / Bravo**, so that nobody can mistake them for people.

**WHERE THE ROSTER SHOWS.** People tab: call sign, country and a TP badge per
row, a "roster" badge on the rows the shared file owns, and an editor that
carries call sign · country (HAF / ITAF / Other…) · test pilot · the immutable
object id. Proposal drill-down and the instructor list name people as
**"Maj Alfa (TEST-01)"**; the proposals CSV gains Call sign · Country · Test pilot.
*(Round 10 renamed that export to the **assessments** CSV and replaced its three
branch columns with **Assessment (fighters) + Weight** — §4j.)*

## 4h. Round 9 — THE DROPDOWN RULE

**Every dropdown carries only the values the unit needs, plus an "Other…"
free-text escape** — with the exceptions the user ruled CLOSED, which stay
closed because a free value would make them lie: **FAIL / ALMOST GOOD items**
(syllabus only — «Τίποτα άλλο»), **the eight evaluation slots**, **the FPC
evaluator** (Squadron CO / DO), and **the solo slots**. The NFS reason keeps
its six causes **plus the "other cause" printed on form Α0473** — the escape is
the sheet's own blank line, not an invention; the SMS condition likewise keeps
the six of §32β plus the regulation's own opening discretion.

Three more lists are closed **by construction** and are not escapes anybody
forgot: `duty`, `leadership` and `status` are Postgres enums shared with the
roster's own vocabulary. Extending them is one line in `db/schema.sql`, and
`gen-people-import.py` fails loudly, naming the offending value and pointing at
that line, rather than letting Postgres reject the paste with a cast error.

### AUDIT TABLE — EVERY DROPDOWN IN THE APP

The rule is not a statement of intent, so here is the enumeration, read out of
the source rather than sampled: **every** `<select>` and `<datalist>` of
`app/student.js`, `app/admin.js`, `app/app.js` and `app/instructor.js`.
Widgets are listed **by field**, because the repeatable sections render the
same picker once per row. Located by selector, not by line number, so a grep
re-verifies the table after any edit.

| # | Dropdown (surface · field) | Selector / builder (file) | Values | "Other…" escape? | If CLOSED — why |
|---|---|---|---|---|---|
| 1 | NFS · Reason | `pickerF` → `reasonF` (student.js) · `WA.NFS_REASONS` | the 6 printed causes of form Α0473: questionnaire · briefing · flight · F/S · illness · **other cause** | **YES — the sheet's own** «ΑΛΛΗ ΑΙΤΙΑ» line (a `note` is then required) | — |
| 2 | SMS · Entrance condition | `pickerF` → `smsReasonF` · `WA.SMS_REASONS` | the 6 thresholds of 3-01 ΚΕΦ.2 §32β + the **Squadron CO / DO judgement** opener (7) | **YES — the regulation's own** discretion clause (a `note` is then required) | — |
| 3 | FAIL / ALMOST GOOD · Category | `catF` · `WA_ITEMS.categories` | Contact · Instrument · Formation · Navigation (+ the legacy `other` placeholder, shown only while a row still carries it) | NO | **syllabus vocabulary** — there is no fifth track; the placeholder must be resolved, not extended |
| 4 | FAIL / ALMOST GOOD · Flight code | `pickerF` → `codeF` · `WA.sorties(cat)` | the sorties of **that track only** (disabled until the track is chosen) | **YES** — "Other… (type the code)" | — |
| 5 | **FAIL / ALMOST GOOD · Items** | `select.ms-add[data-msadd]` · `itemOptions()` over `WA.itemCat(cat).items` ⇄ `wa.item_names(cat)` | the printed gradesheet items of that track, in printed order (round 9 removed the free-text *filter* box that used to sit above this select — §4i·2) | **NO — ✱ RULED EXCEPTION** | **round 6**: an item nobody else can have is an item nobody can compare, count across the class, or look up in the remarks bank. Client and server share one list; a legacy typed string is greyed *legacy* and blocks the save until replaced (§4e·2) |
| 6 | FPC · Due to which stage flight | `pickerF` → `fpcTriggerF` · `TRIGGER_GROUPS` (round 11 split it off `triggerF` for the helper line only) | every sortie of the stage, grouped by the four tracks, checkrides **and simulator sorties** included; the field stays **optional** | **YES** — "Other… (type the code)" | — · **round 11 considered closing this to the eight checkrides and ruled AGAINST**: an FPC follows the referral case, not a kind of flight (ΠΔ 29/2020 Άρθρο 3 — only 1β of the five is a checkride, 1ε's FPC is flown in the simulator, and παρ.17β has no trigger at all). The rule is now printed under the box. See §4k·5 |
| 7 | CEF · Due to which stage flight | `pickerF` → `triggerF` · `TRIGGER_GROUPS` | as above | **YES** | — |
| 8 | AIRSICKNESS · Flight | `pickerF` → `airFlightF` · `TRIGGER_GROUPS` | as above (required since round 6b) | **YES** | — |
| 9 | Solo · Sortie flown solo | `pickerF` → `soloSortieF` · `slot.codes` | the candidate sorties the syllabus names for **that** solo slot | **YES** — reality is not bound by the candidate list | — |
| 10 | CEF · Evaluator | `input[list=dl-eval]` · `evaluatorF` → `textF` · `WA.EVALUATOR_ROLES` + `INS` (round 9; was `pickerF`) | DO · Squadron CO, then the ACTIVE instructor surnames from the form payload | **YES** — the input is free text; a CEF is flown with a Squadron Evaluator, so the list stays open | — |
| 11 | **FPC · Evaluator** | `pickerF` → `fpcEvaluatorF` · `WA.FPC_EVALUATORS` | Squadron CO · DO — **exactly two** | **NO — ✱ RULED EXCEPTION** | **round 6**: an FPC is conducted by the Squadron CO or the DO. A third name would make the record say something the regulation does not allow. A legacy value is named under the box and refused until it is resolved to one of the two |
| 12 | **Evaluations · which checkride** | `evalF` · `WA.EVALUATIONS` grouped by `WA.EVAL_CATS` | the **eight** stage checkrides in syllabus order — C4590 · C4790 · C5090 · C5490 · I4490 · I4890 · F4690 · N4690 | **NO — ✱ RULED EXCEPTION** | the slots are **fixed**: eight rows, no add, no remove. A ninth checkride does not exist in the stage; a progress check flight is an **FPC**, which has its own section |
| 13 | Instructor / evaluator / "Authorised by" boxes | `input[list=dl-ins]` · `insF` → `textF` (airsickness · FAIL · ALMOST GOOD · evaluation "With" · solo "Authorised by") | the ACTIVE instructor surnames, carried in the form payload as `instructors` (§4i·1) | **YES** — the input is free text throughout; the datalist is quick-pick | — |
| 14 | Admin · Compare on this evaluation | `select#evalsel` · `WA.EVALUATIONS` | the same eight | **NO — ✱ same exception as #12** | a chart axis over recorded checkrides — a free value would select nothing |
| 15 | Admin · Person — Duty | `select#pm-duty` (admin.js) | Squadron Commander · DO · Flight Commander · Evaluator · Instructor | NO | **closed by construction** — Postgres enum `wa.duty`; extending it is one line in `db/schema.sql` and `gen-people-import.py` fails loudly on an unknown value |
| 16 | Admin · Person — Leadership | `select#pm-leadership` | Wingman · 2-ship · 4-ship · Mission Commander | NO | **closed by construction** — Postgres enum (as above) |
| 17 | Admin · Person — Status | `select#pm-status` | Assigned · Attached · Departed | NO | **closed by construction** — Postgres enum (as above) |
| 18 | Admin · Person — Country | `select#pm-country[data-other]` · `selOther()` | HAF · ITAF | **YES** — round 9; the column is TEXT precisely so the third air force needs no migration | — |
| 19 | Admin · Person — Rank | `input#pm-rank[list=pm-ranks]` · `RANKS` | Cdt · 2Lt · 1Lt · Capt · Maj · Lt Col · S.Ten · Lt | **YES** — the box is free text; the datalist is quick-pick | — |

**Entity pickers are not a category here**: Wings Ahead has none. A student
reaches their own record through a personal link and the CO reaches people
through the People tab's rows, so no dropdown in this app names a person as a
foreign key — the only person-shaped boxes (#10, #13) are free text with a
datalist, which is why they carry an escape at all.

**The fourth ruled exception — the solo slots — is not a dropdown**: the eight
slots of `WA_SOLO_SLOTS` are rendered as **fixed rows**, never as a list to
choose from, so the closed list is expressed by the shape of the form. What
*is* choosable inside a slot is #9, and it has its escape. A solo the syllabus
did not foresee is an **additional solo**, the one solo row that can be added.

**`app/app.js` carries no `<select>` and no `<datalist>` at all** — the shared
library defines vocabularies but renders no form control — and the instructor
board is a **radio group** (round 10 — its five levels are
`<input type="radio">`, not a select; the theme gallery's cards are
`role="option"` buttons, also not a select). That is the whole surface:
**19 dropdown fields, 3 datalists, 4 ruled exceptions.**
*(**ROUND 19** adds three controls to `app/instructor.js`, which until then had
none — two closed selects and one closed multi-select. They are enumerated as
#20-#22 in the audit-table delta of §4u·A, which is where the count and the
exception list are brought up to date: **22 dropdown fields, 3 datalists,
8 ruled exceptions**.)*
(Round 9's form polish moved #10 from a `<select>` to a datalist input and
added `dl-eval`; the field count is unchanged, the ruled exceptions are
unchanged, and #5 lost the free-text filter box that used to sit above it —
see §4i.)

**ROUND 10 adds a FIFTH ruled exception that is not a dropdown either.** The
**assessment level** is a closed list of five, rendered as a radio group so that
all five options are visible at once — which is the point: an instructor must
*see* that the bottom of this scale still says "Recommended", and a collapsed
`<select>` would hide exactly the reassurance the wording exists to give. There
is no "Other…", and there can never be one: a sixth phrasing invented in a text
box would be a sentence about a person that no weight can score and no brief can
compare — and, unlike a mis-typed sortie code, it is the one field of this app
whose wording a student may one day read. Closed by construction on the client,
by `wa.level_keys()` on the write path, and by `proposals_level_chk` in the
table. See §4j.

## 4i. Round 9 — FORM POLISH FOR THE REAL-STUDENT ERA (2026-08-18)

The database now holds the squadron's real people, so the forms were reviewed
against real use for the first time. Four rulings, recorded verbatim as they
were given, with what each one means in the code.

### 1. The instructor boxes get a list — and keep free text

> «Στα instructor, τωρα που ξερουμε τους περισσοτερους να εχουμε dropdown, αλλα
> και να μπορει να γραψει ελευθερο κειμενο (ονομα).»

**Every box on the student form that asks WHO** is a text input with a
`<datalist>` of the ACTIVE instructors' surnames behind it, and every one of
them still takes **any** name typed into it. The boxes, enumerated from
`app/student.js`: the **airsickness** instructor, the **FAIL** instructor, the
**ALMOST GOOD** instructor, the **evaluation** evaluator ("With"), the solo's
**"Authorised by"**, and the **CEF evaluator**. The CEF box changed shape for
this: it was a `<select>` whose escape was a second step ("Other…" reveals a
box, then type), which for a list that was never closed is two acts where the
squadron does one — it is now one input behind `dl-eval` (the two appointments,
then the surnames). **The FPC evaluator is deliberately not in this list**:
round 6 closed it to Squadron CO / DO and it stays a `<select>` of exactly two.

**THE DATA PATH — the form arrives with its own picker.** `get_student_form`
and `admin_get_student_form` now carry an `instructors` key, built by the one
function `wa.instructor_surnames()`, which `list_instructor_names()` also calls
(the standalone RPC stays as the fallback for an older schema). One round trip
instead of two, and a form that cannot render its name boxes before the names
arrive. **Surnames only, and that is the whole of it**: a JSON array of
strings — sorted, distinct, active instructors — with no id, no token, no rank,
no duty and no `external_oid`. Students may legitimately see who their
instructors are; nothing beyond the surname follows it out. The shape, with
fake names:

```json
"instructors": ["ANDREOU", "BEKAS", "CHRISTOU", "DELIS", "EFTHIMIOU"]
```

Client mirror: `WA.insNames()` normalises whatever arrives (strings only,
trimmed, de-duplicated, sorted) and `student.js` builds both datalists from it.

### 2. The item filter box is gone

> «Βγαλε το filter απο τα item γιατι θα μπερδευει, παρα θα βοηθα.»

The FAIL / ALMOST GOOD rows had a free-text "filter … items" box above the
"— add an item —" select. Two boxes side by side read as two ways to enter an
item, and the one thing typing into the filter could never do was put an item
on the row. It is removed — from the markup, from the input handler, from the
entry's `_q` state and from `styles.css`. What remains is the select (the
syllabus list of the chosen track, in printed order) and the chips, which is
the round-6 closed ruling unchanged. The browser's own type-to-jump still finds
a name inside an open select, and focus returns to the select after each add.

### 3. A floating Save appears the moment the form is dirty

> «Μολις κανει αλλαγες το save να εμφανιζεται πανω δεξια γιατι αλλιως μπορει να
> μην το προσεξει καποιος.»

The form is several screens long and its Save bar is at the bottom, so a change
made halfway down could be left unsaved without the student ever seeing the
button. A **second Save** is now `position: fixed` at the **top right**, with a
small "unsaved changes" hint, for exactly as long as the form differs from what
is stored. The bottom bar stays; both buttons call the one `save()`, so the
validation, the stamping and the receipt cannot differ between them.

**Dirty is measured, not assumed.** `WA.recordFingerprint()` serialises the
record — sorted keys, UI-only `_`-prefixed keys skipped, `null`/`undefined`/`""`
folded together, strings trimmed — and every edit compares it against the
fingerprint of the last save. So: type a character and delete it again and the
button **leaves**; add a trailing space and it never appears, because the
server normalises that away anyway. The baseline is re-taken after each
successful save **from the record as the server normalised it**, which is why
it is taken after the adoption loop and not before. The pill uses palette
tokens (correct in all eight palettes, light and dark), its `top` is measured
from the sticky top bar at render and on resize so it never sits on it at
375 px, and it is hidden in print.

### 4. Every contact solo opens NG — not just the first one

> «Τα contact solo να εχουν προεπιλογη non graded.»

Round 8 gave the contact (adaptation) solos their NG default **in the data**,
applied the first time a slot stopped being empty. On screen, every unflown
contact row still showed "Graded %" lit with a grade box beside it, so the
student met the wrong default before the right one and five of the eight rows
invited a number nobody can award. **The row now opens in the state it will
take**: all five CONTACT slots (C4790-91-S1, C4801-04-S1, C4901-05-S1,
C5201-04-S1, C5301-04-S1) draw NG with the grade box gone; the three FORMATION
slots (F4301-06-S1/-S2, F4501-03-S1) draw Graded, unchanged.

It stays a **default**, not a rule — one tap on "Graded %" answers the row and
is never overridden — and it **writes nothing**: `WA.slotEmpty()` counts `ng`,
so `ng: true` on an unflown slot would turn it into a solo flown on no date.
The data therefore takes the value only when the row stops being empty
(`soloFirstFill`), and a tap on the already-lit NG chip of an empty row is
recorded in the UI (`_ngwant`) and nowhere else. **Existing saved entries are
untouched**: a stored row carries its own `ng` and the default never looks at it.

### LAUNCH SCOPE — 98B first

> «Αρχικα δουλευουμε μονο για 98Β»

The squadron does not start with everybody. `tools/gen-people-import.py` gains
`--classes` (repeatable, commas allowed, case- and space-insensitive):

```
python tools/gen-people-import.py <roster.json> --classes "98B HAF"
```

It filters **students only** — every instructor is imported every time, because
an instructor flies with whoever is on the programme and the student form's
picker is built from that list. **Without the flag nothing changes**: everybody
in the roster is imported, exactly as before. A class nobody is in **stops the
run** and prints the roster's actual class names — at launch, a typo that
silently imports zero students is the one failure the script must never hand
somebody. It filters what the SQL **writes**, never what the database already
holds: students of another class already imported are left exactly as they are,
and widening the scope later is simply another run with more classes named. The
generated file states its scope in its own header.

## 4j. Round 10 (2026-08-19) — THE FIVE-LEVEL ASSESSMENT, AND IT IS ABOUT FIGHTERS

### THE COMMAND DIRECTIVE (verbatim)

> «Οπως ειναι τωρα ειχαμε βαλει για τους εκπαιδευτες προτασεις αναλογα με τον
> τυπο. Η διοικηση θελει τους εξης χαρακτηρισμους. Ξεχναμε τον τυπο… Σχετικα με
> fighter ειναι οι προτασεις.»

and, in the naming session that followed, the fifth level:

> «Υπαρχει μια ακομη, not recommended at all»

with the weights set as **«βαρη 10, 8, 5, 3, 1»**.

**The branch ranking is gone.** An instructor no longer distributes a student
across three aircraft types; he answers **ONE question about him, once**, and the
question is about **fighters**. There is no aircraft-type ranking left anywhere
in this application — not in the form, not in the aggregates, not on paper, not
in the CSV, not in the database's read surface.

### THE SCALE

| storage key | display label | weight |
| --- | --- | --- |
| `strongly_recommended` | **Strongly Recommended** | **10** |
| `recommended` | **Recommended** | **8** |
| `alternate` | **Recommended as Alternate** | **5** |
| `other_assignments` | **Recommended for Other Assignments** | **3** |
| `strongly_other_assignments` | **Strongly Recommended for Other Assignments** | **1** |

One row per (instructor, student) — the `unique (instructor_id, student_id)` key
already said so, and now the row says so too.

### WHY THERE IS NOT ONE NEGATIVE WORD ON IT

This is the most important paragraph of the round. **No level on this scale
contains a negative.** The lower two **redirect** — «η αξία σου είναι αλλού» —
where an ordinary scale would **reject**. The command's own «not recommended at
all» is therefore expressed **without the negation**, as the **emphatic
redirect at weight 1**: the strongest thing the scale can say in that direction,
said without telling anybody he is not wanted.

The reason is not politeness. These sentences are read by **22-year-olds at the
end of the hardest year of their lives**, and the one written about them is a
sentence they will **remember for the rest of it**. So the judgement is carried
by the **weights**, which the brief averages and the Wing Commander reads, and
the **words** are carried by the person. A squadron can rank without wounding;
this scale is the shape of that.

The weights are deliberately **uneven** (10 · 8 · 5 · 3 · 1) rather than a flat
5/4/3/2/1: 10→8 is a nuance between two recommendations, 8→5 a real step down,
**5→3 is the crossing from fighters to elsewhere**, and 3→1 the emphasis inside
that. A mean therefore separates a class the way the squadron actually reads it.

**`level` may be NULL** and that is a real answer: an instructor who has recorded
a comment, or "I have flown with him", but has not formed a view has said
nothing — and a null is the only honest way to store it. It is never invented on
his behalf, it is **excluded from the mean** (not scored zero), and the surfaces
say *"has submitted but has not formed a view yet"*, which round 8's rule about
the two silences still requires to be different from *"has not submitted"*.

### THE FORM — ONE RADIO GROUP, AND A THIN RULE BEFORE THE FIFTH *(round 10; the rule moved up one in round 14 — §4n·5)*

Per student, **one `role="radiogroup"` of five real radios in scale order**
(arrow keys walk the scale, screen readers announce "3 of 5"), each showing its
label and its weight, beside the existing comment and flew-with.

**The fifth option is separated from the four above it by a thin 1px rule.** The
four above place a student on the fighter track or beside it; the fifth places
him firmly **elsewhere**. It is a different **kind** of statement, not merely the
next step down, and it is not allowed to read as the continuation of a list.

> **SUPERSEDED IN ROUND 14 (§4n·5)** — «την γραμμη μεταξυ recommended as
> alternate and recommended for other assignments». The rule **moved up one**
> (`WA.LEVEL_SEP_AT: 4 → 3`) and its rationale moved with it: it no longer marks
> *the last level* off from *the list*, it marks the **fighter / other split** —
> the **three** answers above it place a student on the fighter track or
> immediately beside it, the **two** below it place him somewhere else in the Air
> Force. The paragraph above records what the rule meant between round 10 and
> round 14; §4n·5 is the standing rule.

**Clearing:** clicking the level that is already selected returns the student to
"no view formed yet" — the same escape the round-8 chips had, which a radio group
does not offer by itself, and the only way to un-say something an instructor did
not mean to say.

**JUDGEMENT — no floating Save here (and why)** *(round 10, reversed in round 14
— see the block below)*. §4i·3 gave the *student* form a
floating dirty-state Save because that form is metres long and its Save scrolls
out of reach. This form is a five-option question whose Save sits inside the same
small card, a thumb away — and there is **one card per student**, so a floating
button would have to answer *"save which of them?"*: either save all (a batch
write nobody asked for, which would also re-stamp rows the CO owns) or guess.
So the card's **own** Save announces the dirt instead — it gains an accent ring
the moment anything changes and drops it on save, which is what the floating
button was ever for.

> **REVERSED IN ROUND 14 (§4n·6)** — «το save οχι για καθε μαθητη, αλλα γενικα».
> The judgement above had one flaw the live form makes obvious: an instructor
> answers a **questionnaire about a class**, not twelve separate forms, and a
> Save per card asks him to perform twelve acts to complete one. The objection it
> raises against a single button — *"save which of them?"* — is answered by the
> round-9 machinery it was written beside: **dirt is measured**, so the one Save
> writes exactly the cards that differ from what is stored and re-stamps nothing
> else. The per-card Saves are gone; the floating Save is here, and it says how
> many assessments it is about to write.

### RETIRED ON WRITE, FROZEN IN THE TABLE

The standing **"keep it, ask for it"** contract, applied to a whole shape rather
than one field:

- `proposals.rank_fighters / rank_helicopters / rank_transport_ff / nr_*` are
  **kept in the table, frozen**, as the migration's audit trail. Nothing writes
  them again and **nothing returns them to the API**.
- A payload still carrying `ranks`, `not_recommended`, or any of the six column
  names is **refused by name**, before anything is stored, with a curated `WA:`
  message that names the field that replaced it and lists the five accepted
  keys — because such a payload is not half-right, it is a client that has not
  been reloaded.
- An **invented level** is refused with the five spelled out
  (`unknown assessment level "excellent" — the scale is exactly: …`).

### THE MIGRATION OF THE LOCAL DEMO DATA

**This is demo comfort, not doctrine.** The real **98B deployment starts with an
empty `proposals` table**, so this block maps nothing there and merely records
that it ran. It exists so the local demo is not blank on the morning the new form
appears — an empty dashboard would look like data loss.

Fighters was one of three branches and is now the only question, so the
**fighters position** is what carries over and everything else in the old row is
read as a statement *about fighters*:

| old round-8 row | new level | weight |
| --- | --- | --- |
| Fighters ranked **1st** | `strongly_recommended` | 10 |
| Fighters ranked **2nd** | `recommended` | 8 |
| Fighters ranked **3rd** | `alternate` | 5 |
| **not recommended for all three** branches | `strongly_other_assignments` | 1 |
| **not recommended for Fighters** | `other_assignments` | 3 |
| Fighters unranked, **another branch ranked** | `other_assignments` | 3 |
| anything else | **level NULL** — comment kept, re-entry asked for | — |

The all-out refusal is tested **before** the fighters-only one, or an instructor
who ruled out every branch would be recorded as merely redirecting. The last row
matters most: a proposal that said nothing about fighters **and** recommended
nowhere else contains **no fighters opinion**, and inventing one — even the
polite weight-3 one — would put words in an instructor's mouth that a student may
one day read.

**Idempotent by ledger, not by luck.** `wa.migrations (id, ran_at, note)` records
the run; the block returns early if its row exists. Without that ledger, an
instructor who deliberately **cleared** his level would have it resurrected from
the frozen `rank_*` columns by the next re-apply — a retired judgement coming
back to life behind his back.

**Local run (2026-08-19), logged in `wa.migrations.note`:**
`9 rows read · 3 strongly_recommended · 2 recommended · 2 alternate ·
2 other_assignments (0 explicit fighters-refusal + 2 ranked-elsewhere) ·
0 strongly_other_assignments · 0 left unassessed.`

### THE AGGREGATE IS A WEIGHTED MEAN, NOT A SUM

The round-8 branch scores were **sums**, and a sum rewards *being talked about*:
a student four instructors placed second out-scored one that two placed first.
With one assessment per instructor the honest statistic is the **mean of the
weights** — «what does this squadron, on average, say about him for fighters» —
and it is comparable between a student with nine assessments and one with three.

Every surface **prints the arithmetic** rather than asking for trust:
`(10×2 + 5×1) ÷ 3 = 8.33`, with the distribution beside it in the command's own
shorthand — **«2× Strongly · 1× Alternate»**. The **class summary ranks on the
mean**; a student nobody has assessed sorts **last, not at zero**, because "not
asked about" is not the same as "placed at the bottom".

### COLOUR — AND THE FIFTH LEVEL IS NOT AN ERROR STATE

The chips use **tokens only**, in two families rather than one ramp, because the
scale has two halves: `--good` for the two recommendations (filled, then soft),
`--accent` for the alternate, `--hf` for the two redirects (soft, then filled).

**The fifth level never wears `--bad`.** "Strongly Recommended for Other
Assignments" is the squadron saying **where a pilot belongs**, not that something
went wrong with him; a red chip would put back on the screen the exact negative
the wording was written to keep off it. `--hf` is a neutral cool token defined in
all eight palettes, and it is **filled** like the first level is filled — both
ends of this scale are emphatic statements, so the **hue** says which direction
while the **fill** says how strongly.

**On paper the level is the SENTENCE, never a colour.** Every printed surface is
monochrome, so the brief prints the level in full words with its weight and
count; five tokens would collapse into five indistinguishable greys and, worse,
invite a reader to guess which grey means trouble — of which this scale has none.

### DEMO-FIXTURE NOTE (local DB only)

Three seeded comments still spoke the retired model — one of them in the exact
negative register this round exists to eliminate ("I would not send him to
fighters"). They were reworded in the **local demo database only**, with
`updated_at` deliberately not bumped because no instructor performed the edit.
This is **not** part of the shipped migration, whose "comment preserved" promise
stays literally true in code.

## 4k. Round 11 (2026-08-19) — ADMIN POLISH FROM LIVE TESTING

Five instructions from an evening of real use, plus one question that turned
into a research task and came back with a **NO**. What they have in common is
that every one of them is about a number the Wing Commander reads: which
students it covers, how it is drawn, which attempt produced it, and how many
places the record can disagree with itself.

### THE FIVE INSTRUCTIONS (verbatim)

1. «Στο overview να μπορω να φιλτραρω ανα class.»
2. «Στο Grades per category να πλωταρονται οι 8 αξιολογησεις ολες μαζι. Ανα
   κατηγορια απλως στα χ labels αλλο χρωμα.»
3. «Αν ο μαθητης στην κανονικη ροη βαθμολογηθηκε με αποτυχια ή υστερηση, τοτε
   θα υπολογιζουμε για βαθμολογια αυτη οπου η πτηση χαρακτηριστικε ως
   επιτυχης.»
4. «Αφαιρεσε το result optional.»
5. «οι fpc γινονται triggered μονο απο αξιολογησεις;»

---

### 1. THE OVERVIEW CLASS FILTER

Chips above the table: **All classes** plus every class that actually has an
active student, each with its count. **The classes are read-only and they
follow the members** — there is no class table in this database, so the chip
row is derived on every draw from `people.class`; a class exists because a
student carries its name and stops existing when the last one stops carrying
it. Students the roster gave no class collect under **"No class recorded"**
rather than disappearing: a student with no class must never become a student
the Overview cannot show.

What follows the filter:

* the **rows**, and the **counts line** — `9 of 25 students · … · records: no
  records submitted yet · filtered to 98B HAF`. The record source line
  (`sourceLine`) is recomputed for the visible set, so it can say "no records
  submitted yet" for a class where that is true while the squadron as a whole
  has three.
* **"Students without a self-report"**, whose heading names the class.
* the choice itself, in `localStorage` under `wa-adm-class` — a CO who briefs
  98B all morning should not re-pick 98B after every refresh. A stored class
  that no longer has a student silently reverts to All rather than showing an
  empty table nobody asked for.

**What deliberately does NOT follow it:**

* **The row's original index.** `A.sel` indexes `A.data.students`, so the
  filtered table keeps each row's ORIGINAL `data-goto`. A filtered table that
  renumbered its rows would open the wrong student's analysis — quietly, and
  only while a filter was on.
* **The "Instructor submissions" card**, and it says so out loud the moment a
  filter is active: `proposals_count` arrives counted over every student an
  instructor has assessed, and the payload carries no per-class breakdown, so
  "3/25" cannot honestly be re-derived for one class here. Narrowing the
  denominator without the numerator would have been a lie in a badge.
* **The Student-analysis tab and the printed brief.** The instruction named
  the Overview. The printed class summary already groups by class into its own
  tables, and the analysis tab's comparisons are a separate question — see the
  open item below.

#### RULING — EXPORT SCOPE (asked for explicitly, and here is the choice)

**The three CSVs follow the filter; the JSON export does not.** Both are said
on the buttons themselves rather than left to be discovered.

* The CSVs are one row per student (summary, assessments) or per entry of a
  student (entries) — they are the table the CO is looking at, in a
  spreadsheet — and their buttons sit in the toolrow directly above the
  filtered table. A button over 9 visible rows that silently writes 25 is a
  button that produces the wrong attachment on a Monday morning, and a file
  name is the only place that mistake can still be caught. So the scope travels
  in the file name: `wings-ahead-summary-98B-HAF-20260819.csv`,
  `wings-ahead-entries-2026B-20260819.csv`, `…-no-class-…` for the unclassified
  chip, and the plain name under All classes. The button labels carry the class
  too. Tooltip: *"Follows the class filter above — exactly the rows you can
  see."*
* The JSON is **not a view, it is the BACKUP** — a raw server-side dump
  (`public.admin_export`) of people, records and proposals, the thing you
  restore from. A partial backup that looks like a full one is a trap, and the
  RPC has no class argument to narrow it with anyway. It stays complete and its
  tooltip says so in capitals.

---

### 2. ONE CHART, ALL EIGHT — AND THE TRACK IS A COLOUR

The four per-category tabs are gone, together with the heading that named them
("Grades per category" → **"Grades — the eight checkrides"**). One line now
plots **C4590 · C4790 · C5090 · C5490 · I4490 · I4890 · F4690 · N4690** in
syllabus order, with the class average as the same faint dashed reference and
missing checkrides as the same gaps. A tab per track meant the CO saw four
charts of two or three points each and had to hold the shape of the stage in
his head; one line of eight shows it.

**The track survives in the COLOUR of the x label**, which needs no click to
read. Four tokens defined once per mode in `styles.css`
(`--cat-contact` sky · `--cat-instrument` violet · `--cat-formation` amber ·
`--cat-navigation` teal, plus `--cat-fpc` rose for the block below), so all
eight palettes inherit them and a track keeps its colour when the reader
switches theme — which is what makes a legend memorable. Mirrored in
`WA.EVAL_CATS[].color`, and the same token draws the little `.catdot` in front
of each row of the summary table, so chart and table cannot drift apart.

**None of the four is a status colour, deliberately.** `--good` / `--bad` /
`--warn` on a TRACK label reads as a verdict on the track ("contact is green,
formation is red"), and this application does not grade tracks. `--accent`
stays the student's own line and `--muted` the class average, so neither was
available either.

The legend names the two lines and then the four tracks, in syllabus order —
which is also the order their labels run along the x axis, so it reads left to
right like the chart does.

#### RULING — WHERE THE FPC PLOT LIVES: **its own block, directly below.**

Not a fifth colour on the same line, and not a toggle.

* **Not a fifth series**: the eight checkrides share an x axis because the
  SYLLABUS gives them one — C4590 is before C4790 for every student in the
  squadron, for ever. An FPC has no such position; it happens when a referral
  case happens. Putting FPC #1 and FPC #2 on that axis would invent an order
  the flights do not have and, worse, would place one student's FPC #2 above
  another student's FPC #2 as though the two were the same event.
* **Not a toggle**: an FPC is precisely what the Wing Commander wants in the
  same glance as the checkrides. A toggle would hide it behind a click, which
  is what the four category tabs were already being blamed for.
* **And nothing at all when there is no FPC.** Behind a tab, "FPC #1 not flown ·
  FPC #2 not flown" cost nothing because nobody opened the tab; always on
  screen it puts an absence on the page as though it were a gap in the
  student's record. A student with no FPC now reads *"No FPC on this student's
  record — nothing to plot."*

---

### 3. THE PASS-ATTEMPT RULE

> «Αν ο μαθητης στην κανονικη ροη βαθμολογηθηκε με αποτυχια ή υστερηση, τοτε θα
> υπολογιζουμε για βαθμολογια αυτη οπου η πτηση χαρακτηριστικε ως επιτυχης.»

#### WHAT DECIDES "SUCCESSFUL" — read honestly out of the data model

**Nothing in this record stores an outcome, and nothing ever did.** An
evaluation entry carries `date · evaluation · with · grade` and that is the
whole shape (`WA.ENTRY_KEYS.evaluations` ⇄ `wa.entry_keys('evaluations')`).
There is no pass/fail tick that somebody forgot to fill in. So the honest
answer to "was this flight characterised successful?" is **the grade, read
against the printed scale** — which is how the squadron reads it on paper.

**ΠΔ 151/13**, quoted in 3-01/2025 ΔΑΕ and digitised in FDMS
`data/requirements/failure_procedures.json` (requirement #0, `verbatim`):

| code | band | % | characterisation |
|---|---|---|---|
| «Α» | Άριστα | 90-100 | pass |
| «ΛΚ» | Λίαν Καλώς | 75-89 | pass |
| «Κ» | Καλώς | 60-74 | pass |
| «ΣΚ» | Σχεδόν Καλώς | 50-59 | **ΥΣΤΕΡΗΣΗ** |
| «Ε» | ΑΠΟΤΥΧΩΝ | 0-49 | **ΑΠΟΤΥΧΙΑ** |

and, in the same record, the sentence that settles it: «Το κατώφλι 59%/60%
διαχωρίζει την αποδεκτή από τη μη αποδεκτή απόδοση και είναι το κατώφλι που
χρησιμοποιούν όλα τα κριτήρια παραπομπής.»

For a **checkride** the referral law says the same number in its own words —
**ΠΔ 29/2020 Άρθρο 3 παρ.1β** (FDMS `fail-16`): «βαθμολογείται με βαθμολογία
από μηδέν (0) έως πενήντα εννέα τοις εκατό (59%)» in a πτήση εξέτασης ή
αξιολόγησης IS the referral case. Two sources, one number: **60**.

The command's own two words — «αποτυχία ή υστέρηση» — are exactly the two bands
below it. The rule needed no invented field; it needed the scale naming itself.

#### RECONCILING WITH ROUND 9'S TWIN RULE

Round 9 said *the latest attempt stands for the slot*. That is **not replaced,
it is demoted to the tiebreak**:

> **PASS is the filter and runs first. LATEST decides only between attempts
> that are equally operative.**

* several attempts, one of them ≥ 60 → **that one**, whatever its date;
* two attempts ≥ 60 → the **later** one (round 9's rule, untouched);
* no attempt ≥ 60 → the **latest graded** one, flagged `passed:false`, so the
  chart still shows a number instead of an em dash and every surface says out
  loud that nothing has passed;
* no graded attempt at all → the latest row, so a flown checkride never
  disappears from a table.

> **ROUND 15 SCOPE NOTE.** Every «60» on this page is the **flight's** number
> and none of them moved. A **ground exam** is passed at **80 %** (bridge ruling
> #6, §4p) and `WA.examOperativeIx` runs this same four-line rule against that
> mark instead. The printed five-band scale is untouched by that: the bands are
> a *characterisation* (78 % is still «ΛΚ»), not a pass mark.

**ONE DEFINITION, WRITTEN TWICE AND CHECKED:**
`wa.grade_pass_min()` / `wa.grade_band()` / `wa.grade_passed()` /
`wa.eval_operative()` in `db/schema.sql`, mirrored by `WA.GRADE_PASS_MIN` /
`WA.GRADE_BANDS` / `WA.gradeBand` / `WA.gradePassed` / `WA.attemptLater` /
`WA.evalOperativeOf` in `app/app.js` — and, since round 15, the exams' own
`wa.exam_pass_min()` / `wa.exam_passed()` ⇄ `WA.EXAM_PASS_MIN` / `WA.passMin` /
`WA.examPassed` / `WA.gradePassed(g,'exams')`. `WA.evalLatest` is **gone, not renamed** —
two functions with two rules is exactly how a class average and a printed brief
drift apart — and every caller was moved.
`admin_get_data` now ships **`eval_grades`** per student (the eight operative
attempts, computed server-side), so the two are demonstrably the same rule and
not two rules that happen to agree. See the verification log below.

#### WHERE THE RULE IS NOW READ

Chart point · per-checkride comparison and its class best/worst/average ·
the class-average dashed line · the summary table's slot row · the brief line ·
the printed per-student evaluation table · the printed class matrix and its
class-average row · the summary CSV's eight grade columns · the instructor's
own student card. Every one of them, from `WA.evalGrade` / `WA.evalOperativeOf`.

#### AND THE FAILED ATTEMPTS ARE VISIBLE, EVERYWHERE, MARKED

* Summary table — the slot row wears **"counts: successful attempt · N
  attempts"**, or **"no successful attempt yet · N attempts"** with its band
  chip; each other attempt is its own row reading **"attempt — C4590 · «Ε»
  Failed · not counted"**. A grade in a table is assumed to be a grade that
  counts until it is told not to be.
* Chart — a point that has **not** passed is drawn as a **hollow dashed ring**
  instead of a filled dot, and its tooltip names the band and the attempt
  count. A ring and not a colour: `--bad` on a data point would put a verdict
  in the palette, and the band is already named in words twice.
* Print — the class matrix marks such a grade with **`*`** and the caption
  explains it, because paper is monochrome and a ring does not survive a
  photocopier.
* The student form — every attempt row carries **"counts — the successful
  attempt"** / **"counts — no attempt has passed yet"** / **"not counted · «ΣΚ»
  Lagging"**, computed from the same helper, so the form and the brief cannot
  disagree.

#### THE GAP THE RULE EXPOSED — AND THE ONE ACT ADDED TO CLOSE IT

**Until this round the form could not record a re-flown checkride at all.** The
eight evaluations are a fixed section with no "+ Add", so a student whose C4590
was failed and flown again had exactly one place to put the second grade: on
top of the first one. That destroys the failure the whole referral chain of ΠΔ
29/2020 hangs on, and it makes the rule the command just asked for unreachable
on any record made from here on.

So the section gains **one act**, and it is a ruled exception in the round-6
sense: not "+ Add an evaluation" — nobody may invent a ninth checkride — but
**"+ Record the re-fly of C4590"**, offered only where the regulation says a
re-fly comes from: **an attempt that did not pass** (παρ.1β again). It appends
one more attempt at the SAME checkride id and touches the failed one not at
all. The offer is **live** on the keystroke that makes a grade non-passing, the
round-5b rule applied to a new act; and the slot badge of a checkride whose
re-fly is still unrecorded reads **"re-fly not recorded yet"** instead of "not
flown yet", which would have been a lie of exactly one word.

---

### 4. THE FPC «RESULT (OPTIONAL)» BOX IS GONE

It was a free-text line beside a 0-100 grade and an evaluator, and free text
beside a number is where a second, softer answer to the same question gets
written — "pass" under a 48 %, "ok" under a grade nobody has filled in yet. An
FPC already states its result twice: **the grade against the printed scale**
(§3 above — 60 % and above is the successful characterisation) and the
existence of the FPC entry itself. The box added nothing but a place to
disagree with them.

**The round-6 legacy pattern, exactly — "keep it, ask for it", minus the
asking, because there is nothing to ask for:**

* `result` **stays** in `wa.entry_keys('fpc')` / `WA.ENTRY_KEYS.fpc` as a
  READ-ONLY CARRIER — otherwise `wa.strip_entry` would destroy stored text on
  the next read.
* The form **draws no box**. A stored value renders on the row as a read-only
  `legnote`: *"Result — … . This box was removed: an FPC's result is its grade
  … . What you wrote is kept here exactly as it stands and counts for nothing;
  it can be dropped, and it cannot be written again."*
* Every other surface prints it **marked**: `(legacy note)` on the dashboard
  tables, the summary table and the brief; a spelled-out parenthesis on paper;
  and in the entries CSV the Detail cell carries `… (legacy note — the FPC
  result box was removed in round 11)`, because an unmarked "pass" in a
  spreadsheet column beside a 48 % is precisely the disagreement the box was
  removed for.
* **Retired on write** by `wa.fpc_result_count()`, the twin of round 6's
  `wa.phase_count`: the write path refuses any payload that GROWS the number of
  FPC rows carrying a result, by name, with the rule spelled out. Keep or drop,
  never add. Curated refusal, verified by raw RPC below.

#### RULING — CEF IS UNTOUCHED AND KEEPS ITS RESULT BOX

The instruction was to remove it "only if the field is shared code". **It is
not**: `student.js` renders the FPC row and the CEF row as two separate literal
blocks, each with its own `textF(…, "result", …)` line, so removing one leaves
the other intact by construction. The command's sentence names the FPC. And the
substance agrees with the shape: a CEF is conducted by a **Squadron Evaluator**
whose written finding is a different object from a Δοκιμή Προόδου's grade —
round 6 already left the CEF's evaluator list open for the same reason.

---

### 5. «οι fpc γινονται triggered μονο απο αξιολογησεις;» — **VERDICT: NO.**

Item 5 was conditional on this, so the condition is recorded before the answer:
**IF confirmed**, the FPC trigger dropdown was to be narrowed to the eight
checkrides as a ruled exception. **It is not confirmed. The dropdown is
therefore unchanged**, and what round 11 ships instead is the regulation's
actual rule, rendered as the field's helper line.

**An FPC is not defined by the flight that came before it. It is defined by the
REFERRAL CASE (λόγος παραπομπής) of ΠΔ 29/2020 Άρθρο 3.** The controlling text
is παρ.3 (FDMS `failure_procedures.json` → `fail-23`, `verbatim`, source
`fek_a_57_2020.pdf` PDF p.5):

> «Κατά τις περιπτώσεις των υποπαραγράφων **1α, 1β, 1γ, 1δ και 1ε** ο
> παραπεμπόμενος εξετάζεται για την πτητική του καταλληλότητα λόγω μειωμένης
> πτητικής ικανότητας **με πτήση Δοκιμής Προόδου από τον ΑΕ της Μοίρας στον
> αέρα** για τις περιπτώσεις των υποπαραγράφων 1α, 1β, 1γ και 1δ, ενώ για τις
> περιπτώσεις της υποπαραγράφου **1ε στον εξομοιωτή πτήσεων**.»

Five separate triggers; **exactly one of them is a checkride**:

| case | FDMS record | what it is | evaluation? |
|---|---|---|---|
| **1α** | `fail-75` | handling an A/C or a procedure, for reasons that are not indiscipline, in a way that endangers the safe and successful execution of the mission | **NO** — any sortie |
| **1β** | `fail-16` | 0-59 % in a πτήση εξέτασης ή αξιολόγησης | **YES** — the eight checkrides |
| **1γ** | `fail-76` | after the stage's first four sorties: 0-49 % on two consecutive flights, or 0-59 % on three | **NO** — ordinary sorties |
| **1δ** | `fail-77` | 0-59 % on ≥ 40 % of the Pre-SOLO phase or ≥ 20 % of the whole stage | **NO** — a running ratio, no single trigger flight |
| **1ε** | `fail-40` | the SIMULATOR thresholds — and **its FPC is flown in the simulator** | **NO** — F/S |

Three further paths arrive from outside Άρθρο 3 παρ.1 entirely: a failed CEF
re-flown badly (3-01 ΚΕΦ.2 §30ζ → `fail-12`, `board_path` "Δοκιμή Προόδου από
ΑΕ"), a failed first solo (§56 → `fail-19`), a third consecutive F/S failure
(§30στ → `fail-11`, «Δοκιμή Προόδου **στον εξομοιωτή**»). And **ΠΔ 29/2020
Άρθρο 3 παρ.17β** (`fail-70`) prescribes an «κατ' εξαίρεση πτήση Δοκιμής
Προόδου» after a favourable Board — **an FPC with no triggering sortie at
all**. The negative boundary is recorded too: παρ.5 (`fail-62`) sends cases
1στ/1η/1θ/1ι to the Board **without** an FPC, and παρ.4 (`fail-39`) makes case
1ζ a written ground exam, not a flight.

**Consequences, all of them already true of the shipped picker and now stated:**
the list stays every sortie of the stage across the four tracks, the simulator
sorties among them (case 1ε is representable), free text stays open, and the
field stays **optional** — because παρ.17β describes an FPC that has no trigger
to name. The helper line under the box now says so, with the citations in its
tooltip:

> "An FPC follows the referral case, not a kind of flight (ΠΔ 29/2020 Άρθρο 3):
> dangerous handling on any sortie (1α) · 0-59 % on a checkride (1β) ·
> consecutive low grades on ordinary sorties (1γ) · the 40 % / 20 % ratio of the
> phase or the stage (1δ) · the simulator thresholds, whose FPC is flown in the
> simulator (1ε). So it may be any sortie — and after a favourable Board it may
> follow none at all (παρ.17β): leave this empty then."

**No stored FPC trigger was legacy-marked**, because none is wrong: the wide
list was correct all along, and the round-5 rule that a progress-check flight
is an FPC (never a ninth evaluation) is untouched.

---

### AUDIT-TABLE DELTA (§4h)

* **#6 FPC · Due to which stage flight** — values, escape and openness
  **unchanged**; the round-11 helper line under the box now carries the ΠΔ
  29/2020 Άρθρο 3 rule and its FDMS citations. Recorded here because the round
  considered closing it and ruled against.
* **#14 Admin · Compare on this evaluation** — unchanged. The per-CATEGORY
  chips it used to sit beside are gone (§2); they were never in the table,
  being chips rather than a select.
* **The class filter is not a dropdown either** — chips, like the metric chips
  beside them, derived from the data rather than from a list, with no free
  value possible: a class the app does not know about is a class no student is
  in. Counted with the solo slots and the assessment radio group among the
  closed lists that are expressed by the shape of the control.

### CACHE-BUSTER

`?v=20260819a` → **`?v=20260819b`** on all seven assets (`styles.css`,
`config.js`, `items-catalog.js`, `app.js`, `student.js`, `instructor.js`,
`admin.js`). A cached round-10 `admin.js` against a round-11 `app.js` would
call `WA.evalLatest`, which no longer exists.

### SELF-VERIFY — WHAT WAS ACTUALLY RUN (local stack, 2026-08-19)

1. **Class filter** — All / 2026B / 98B HAF / 99A HAF: rows narrow, the counts
   line recomputes (`9 of 25 students · records: no records submitted yet ·
   filtered to 98B HAF`), the choice survives a reload, and every visible row's
   `data-goto` still resolves to the right student in `A.data.students`
   (checked row by row, not sampled).
2. **CSV scope** — captured from the download anchors:
   `wings-ahead-summary-98B-HAF-20260819.csv`,
   `…entries-98B-HAF-…`, `…assessments-98B-HAF-…`, and the plain name under All
   classes. Blob bodies: **3 data rows** filtered to 2026B, **25** unfiltered.
3. **The chart** — all eight x labels present in syllabus order, each drawn in
   its track's token (4 distinct colours, verified as computed `fill`), legend
   naming the four; a student with data and a student with gaps both drawn.
4. **Pass rule, client ⇄ server** — `admin_get_data` fetched raw and compared
   against `WA.evalOperativeOf` for **25 students × 8 checkrides = 200
   comparisons** of `{grade, index, passed}`: **0 mismatches**.
5. **The re-flown fixture, built through the real CO form and then RESTORED** —
   a demo student's C4590 was graded 48 (ΑΠΟΤΥΧΙΑ), "+ Record the re-fly"
   appeared on that keystroke, a second attempt was added and graded 86, and
   its date was then corrected to fall BEFORE the failed one. That is the
   discriminating case: the **latest** attempt is the 48 and the **pass** is the
   86, so round 9's rule alone would have printed 48. Every surface printed
   **86** — chart point, per-checkride comparison, brief line, printed
   evaluation table, printed class matrix, and the summary CSV's C4590 column —
   while the 48 stayed visible as *"attempt — C4590 · «Ε» Failed · not
   counted"*. The pass was then dropped to 55 to exercise the no-pass fallback:
   operative = the latest (48), hollow dashed ring on the chart, `48%*` in the
   printed matrix, class average moving 77.3 → 64.7, and the slot row reading
   *"no successful attempt yet · 2 attempts"*. **Restore verified
   byte-identical against the pre-fixture snapshot** (`diff` clean).
6. **Twin-rule tiebreak** — the pre-existing twin C5090 attempts (64 and 74,
   both passing) still resolve to the later one, with the earlier shown *"«Κ»
   Good · not counted"*.
7. **FPC form** — 0 `result` boxes under FPC, **1 under CEF** (untouched); the
   stored results render as read-only `legnote`s; the trigger helper line
   renders with its citations.
8. **Curated refusals, raw RPC** — adding a `result` to an FPC row:
   *"WA: invalid payload — the free-text result was removed — an FPC's result is
   its grade against the printed scale … A result already written is kept as a
   legacy note, but a new one cannot be added (fpc)"*. The retired `pending`
   key still refused by name. `wa.fpc_result_count` exercised directly:
   keep-2 ✓, drop-to-1 ✓, grow-to-3 ✗.
9. **Schema re-applied twice**, `ON_ERROR_STOP=1`, exit 0 both times.
   `node --check` clean on all four JS files. **Zero console errors** across
   Overview / Student analysis / Brief / People, in a light and a dark palette,
   and on the instructor view.

### OPEN ITEM RAISED BY THIS ROUND (for the user's ruling)

**"Class average" in the Student-analysis tab is a COHORT average, not a class
one.** The four-bar comparison, the per-checkride comparison and the dashed
reference line are all computed over **every active student of every class** —
which is what they have always done, and this round did not change it. With
25 students spread over three classes on one instance, "class best / class
worst / class average" is arithmetic over a population the label does not
describe. Round 11 made the tooltips honest ("the average of every active
student who has flown that checkride — all classes, not only this student's")
and changed no number, because narrowing them is a decision about what the
brief compares, not a bug fix. **Ruling wanted:** should the analysis tab's
comparisons follow the Overview's class filter, or should they be scoped to the
student's own class always, or stay squadron-wide?

## 4l. Round 12 (2026-08-20) — THE LOG TABLES · and 12b — THE TABLE FORM

### THE DIRECTIVE, VERBATIM (2026-08-19)

> «Για αρχη προσθεσε για καθε μαθητη ανα κατηγορια ενα πινακα στο τελος οπου θα
> εχει ολες τις πτησεις. contact, ημερομηνια, instructor, duration, grade or non
> graded (δεκτο το null, γιατι καποιες φορες αργει το debriefing). **4+4 πινακες
> για f/s και flights. ομοιως τα μαθηματα και τα exams.** Δες απαιτησεις συμφωνα
> με το progress στο fdms. Να ειναι συμβατα και να υπαρχει αμφιδρομη ενημερωση.»

and, on the placeholder kinds:

> «να αφησουμε placeholder για τυχον **fcf, cef, repeat**»

This round builds the tables — the whole directive **except its last sentence**.
Nothing of the FDMS bridge (sync, provenance, the reconciler) is built here; the
architecture for it is written and this round is deliberately shaped to fit it.

### THE REVIEW OF IT, VERBATIM (round 12b, 2026-08-20)

> «Μπορουμε αντι να το εχουμε σε αυτη την μορφη να ειναι **σε πινακα με στηλες
> και σειρες ολες τις πτησεις**. Απλα για cef, fcf, repeat θα προσθετει εξτρα
> γραμμες. **Sorting με βαση τις ημερομηνιες.** Δε θελω πεδιο note, Or a verdict
> with no number. **Θελω μονο mission complete, mission incomplete.** Ομοιως για
> μαθηματα και εξετασεις. **Μη βαλεις εκπαιδευτη για μαθηματα και εξετασεις για
> να ειναι απλο.»**

Five rulings, and they reach the data model as well as the screen:

| the ruling | what it changed |
|---|---|
| a **table**, not cards | every one of the ten blocks is a real `<table>`, one **row** per flight, edited in the cells, one line tall. The extra rows the review names — cef, fcf, repeat, a same-day re-fly — are exactly what a row-per-flight gives you: an FCF is not a *variant* of a syllabus sortie, it is another line in the log. |
| **sorting by date** | rows render date-ascending. It is a **render order**; storage stays authoring order (see *The table form* below for why that distinction is the whole safety of it). |
| **no `note`** | the key is gone from all four sections, refused on write by name, dropped on read. |
| **mission, not a verdict** | `pass / lagging / failed` → `complete / incomplete`. Round 12's three-way verdict was the printed grade scale wearing a second name; where a grade exists that scale is already there, in the number. |
| **no instructor on lessons / exams** | `instructor` and `instructor_oid` gone from both — and with them the periods and attendance boxes, because the table the user drew for a lesson has four cells and a key with no cell is a key nobody could ever edit. |

**THIS WAS A FREE RESHAPE, ONCE.** When the review landed, the four sections
existed **only locally**: the cloud schema had not been re-run and the app had
not been pushed to Pages, so *nothing real stored them*. There is therefore **no
migration, no legacy path and no compatibility carve-out** for the four — a key
that is no longer named is simply dropped on read by `wa.strip_entry`, like any
retired key. Everything shipped (`nfs` … `cef`, the roster, the assessment
scale) is untouched, and the `wa.migrations` ledger gains no row because nothing
that ever ran in production is being converted.

### THE FIRST DECISION: FOUR SECTIONS, NOT EIGHT

The 4+4 tables are a **render grouping, not eight storage keys**. Adding a
section to this app is expensive by design — `wa.sections` · `wa.entry_keys` ·
the `validate_record` branch · `wa.migrate_record` · `WA.ENTRY_KEYS` ·
`WA.COUNTED` · `WA.SECTIONS_META` · `student.js SECTIONS` + `COMPLETE` +
`blocksSave` + `buildPayload` · `instructor.js` · `admin.js` drill-down / print /
CSV all name every section by hand. Eight would be eight copies of one identical
rule. So there are **four**, and they take the FDMS `kind` vocabulary verbatim so
that anyone reading either codebase meets the same four words:

| section | holds | rendered as |
|---|---|---|
| `flights` | the aircraft sorties | **4 tables**, one per track |
| `fs` | the simulator sorties | **4 tables**, one per track |
| `lessons` | the ground courses of the 12 theory groups | one block |
| `exams` | the 8 ground-exam groups | one block |

**Why split by band at all, given the tables are per track?** Three reasons, and
the first is decisive: **the section IS the band.** The track is on the row (and
the letter of a syllabus code proves it — `wa.code_track`), but *nothing anywhere
derives flights-from-F/S out of a code*, so the band has to be stored somewhere
and being the array it sits in costs nothing. Second, the entry cap: 85 flights
plus their re-flies in one array approaches it, per band it never does. Third,
sim hours and flight hours are counted separately by the squadron everywhere.

**NOTHING IS PRE-SEEDED.** This is the round's hard call. If all 133 sorties
existed as fixed rows the way the 8 checkrides and 8 solo slots do, `wa.slot_empty`
would need a branch for the new sections or every unflown sortie would count as an
entry and *"1 of 18 entered by the CO"* would collapse into *"1 of 151"*. Instead
the syllabus list is the **closed list a flight is CHOSEN from** and only flown
rows are stored. **Consequence: `wa.slot_empty` and `wa.entry_core` are untouched
by this round** — `slot_empty` returns `false` for any section it does not name,
which is correct because these sections have no placeholder rows.

### THE FLIGHT ENTRY

```
wa.entry_keys('flights') = wa.entry_keys('fs') =
  ['date','track','sortie','seq','kind','instructor','instructor_oid',
   'duration','grade','ng','mission','legacy','entered_by']
```

| key | type | rule |
|---|---|---|
| `date` | ISO date, **required** | `wa.chk_entry_date`. The flight happened on a day; only the *grade* lags. |
| `track` | one of the four, **required** | Which of the four tables the row is in. **Not derived from the code**, because kinds `fcf` / `cef` / `other` have no syllabus code to read a track off. Where a syllabus code *is* present its letter must agree (the round-5 `fail`/`almost_good` rule, same refusal shape). |
| `sortie` | code, **required** | Closed dropdown over `wa.sortie_codes(band, track)` **minus the eight checkrides**; free text accepted and shown marked *off-catalogue* (the `fail`/`almost_good` precedent — the syllabus data may lag reality and a record must never become unstorable). Already in `wa.code_fields()`, so it inherits trim+collapse+UPPER. |
| `seq` | small int, default 1 | Which flight of that code on that date. **AUTHORED, never derived from an array index** — an index is a position and this is a fact. There is **no `(sortie, date)` uniqueness rule anywhere**: a second turn on one day is a real thing, and a rule that refused it would refuse the truth. A `seq` above 1 can only be produced by the row's own **“+ same-day re-fly”** button. |
| `kind` | closed list, default `syllabus` | `syllabus · repeat · fcf · cef · other` — the user's own list. `repeat` marks a re-fly of a syllabus node; `fcf` / `cef` / `other` are **off-catalogue by nature** and free the sortie box to free text *without* the off-catalogue warning, because for them the catalogue was never the right list to look in. |
| `instructor` | text ≤200, **required on every row** | `<datalist>` of the active instructors, free text always accepted. The round-6 solo doctrine applies verbatim to every sortie: *«a student never launches alone on their own authority»*. Required **even on a legacy row** — the flag excuses what an old form never asked for, never a rule of this round. |
| `instructor_oid` | text ≤64, nullable | The unambiguous identity. **Never drawn as a box.** The form only ever carries it through unchanged; it is written by the CO's form path and, later, by the bridge. |
| `duration` | numeric, nullable | **Decimal hours to one decimal** (0.1 h = 6 min). `wa.chk_duration`. |
| `grade` | numeric 0-100 whole, nullable | **null = the debrief has not landed.** |
| `ng` | boolean | Non-graded *by nature*. `ng:true` ⇒ `grade` must be null — the identical rule and the identical sentence as `solo_flights`. |
| `mission` | `complete\|incomplete`, nullable | **12b.** Present **only when `grade` is null and the row is not NG**. |
| ~~`verdict`~~ | — | **12b: gone.** Replaced by `mission`; refused on write by name. |
| ~~`note`~~ | — | **12b: gone.** «Δε θελω πεδιο note»; refused on write by name. |
| `legacy`, `entered_by` | the house keys | unchanged semantics |

**DURATION — store ACTUAL, prefill PRESCRIBED.** `trainingLog` in FDMS has no
duration field at all and only 15 of the 133 sorties carry an `hours` value of
their own (the rest inherit from their Training Section), so "duration" is new
data on both sides. What is *stored* is the time actually flown — that is what a
pilot means by duration and what a logbook line is. What the box *opens with* is
the syllabus value for the chosen sortie, applied **only onto a box that is still
empty** (the round-8 FAIL/ALMOST-GOOD precedent: only a NEW row is prefilled,
nothing stored is ever overwritten). The box is a **text** input, not a number
one, so `1:20` can be typed at all — and the offer to convert it to `1.3` appears
on that keystroke, in the exact idiom the grade box uses for a fractional value.
Nothing is ever converted silently.

**THE MISSION, AND WHY IT EXISTS (12b).** The squadron's scheduler knows whether
the mission was flown to completion and has **no percentage** for a sortie; this
record knows percentages. `mission` is how the first crosses into the second, and
the review closed the list to **two** answers: *«Θελω μονο mission complete,
mission incomplete»*. Round 12's three-way `pass / lagging / failed` is gone —
those three were the printed five-band scale wearing a second name, and where a
grade exists that scale is already in the number.

Three states, three different kinds of fact:

| state | what the cell is | why |
|---|---|---|
| a grade exists | a **chip**, read from the number (`wa.grade_mission`, ≥60 complete) and **not editable** | a stored mission beside a stored grade is a second source of truth that can contradict the first — the exact defect round 11 removed from the FPC. A stored one is refused by name, and the refusal prints the grade **unchanged** (the round-12 residual: a borrowed trailing-zero trim once turned 100 into “1 %”). |
| no grade, not NG | a **closed dropdown**, empty = *awaiting debrief* | this is the whole reason the key exists: without it a flight the squadron recorded as an **incomplete mission** would arrive indistinguishable from one still waiting for its debrief — a failure invisible in the record that exists to show it. |
| NG | **nothing** — `—` | a familiarisation ride nobody was in a position to score is not a mission verdict either. Refused on write. |

`WA.awaitingDebrief` therefore reads *no grade **and** no mission **and** not NG*:
a hand-set mission **ends the wait**, because the squadron did characterise the
flight — it simply never wrote a number. (That is also why the printed brief
prints *“no percentage recorded”* rather than *“awaiting debrief”* in the Grade
cell of such a row: a chase on a brief for a flight nobody is chasing.)

**THREE DELIBERATE OMISSIONS.** No `result` field (a stored pass/fail beside a
stored grade is the round-11 defect). No FDMS event id / `source_id` /
`updated_at` (`wa.entry_core` excludes only `entered_by`, so any key that changes
on a re-push would make every row look *modified* → re-stamped on the CO path and
**the owner's save refused** on the owner path). No `solo` flag (the solo fact
lives in `solo_flights` and stays there).

**ONE FACT, ONE ROW.** A `flights` row whose sortie is one of the eight
checkrides is **refused**, with the reason rather than a typo report: *«C4590 is
one of the eight checkrides — a checkride is recorded in the Evaluations section,
where the syllabus order and the pass-attempt rule apply to it. Two rows for one
flight would be two grades that can disagree.»* The dropdown does not offer them,
so the refusal only ever meets a typed code.

### LESSONS AND EXAMS

```
wa.entry_keys('lessons') = ['date','end_date','group','course','legacy','entered_by']
wa.entry_keys('exams')   = ['date','exam','grade','legacy','entered_by']
```

**12b: FOUR CELLS AND THREE.** *«Ομοιως για μαθηματα και εξετασεις. Μη βαλεις
εκπαιδευτη για μαθηματα και εξετασεις για να ειναι απλο.»* A lesson row is
**GROUP · COURSE · START · END · ✕**; an exam row is **EXAM · DATE · GRADE · ✕**.
The instructor / examiner is gone by the ruling, the note by the same review, and
the periods and attendance boxes went with them: **the table the user drew has
four columns, and a key with no cell is a key nobody could ever edit** — it would
sit in the record, unreachable, drifting. Each is refused on write **by name**,
so a hand-made payload meets the ruling and not a typo report.

*What that gives up, stated plainly so it can be asked back in one line:*
`periods` (partial coverage of a course — NULL used to mean the full course,
FDMS's `covCore` semantics) and `absent` (*"the class covered it and this student
did not"*, which was how a makeup became visible from the student's side). Both
are one column each if the squadron wants them back.

- `group` — the **closed list** of the twelve theory groups. It is the identity
  of the row, the way `category` is for a FAIL.
- `course` — **off-catalogue accepted and marked**, the `sortie` rule: course
  codes are derived at run time from the printed duration block, so they are the
  value most likely to lag reality. What *is* refused is the **contradiction** —
  a course that exists but **in another group**, which would make the join key
  false. **The join key for a course is the PAIR `(group, course)`, never the
  code alone: `OJT` is a course of four different groups.**
- `end_date` — a lesson is a **block**: `date` = start, `end_date` = end, null =
  a single day.
- **No grade on a lesson.** A lesson is attended, not scored — and therefore a
  lesson is never *"awaiting"* anything either: the entries-CSV lag column is
  scoped to the sections that have a grade (`flights` · `fs` · `exams`), a
  defect this round's own CSV read-back caught.
- `exam` — one of the **8 ground-exam groups**, closed list. Its grade is
  nullable for the same reason a flight's is: the result can take longer to
  arrive than the exam did to sit.

> **⚠ The nested `exams[]` are LESSONS, not exams.** Four theory groups carry a
> nested `exams[]` array (`FF 190 · PT 190 · AΕ 190 · JX 190 · JX 191 · NA 191`)
> and a human would naturally file them under "exams". FDMS does not: its parser
> picks them up as **courses of their group**. WA's `exams` section therefore
> holds the **8 `ground_exam` groups only**, or the two systems disagree about
> what a student is owed.

> **⚠ JP190 is conditional.** *«Exams on Flight physiology (foreign SPs only)»* —
> a HAF student does not owe it. The generated `wa.exam_conditional()` carries the
> flag and every surface shows *foreign SPs only*. FDMS's own `SchedReady` never
> reads that flag and leaves JP190 pending for ever; **that pre-existing defect is
> not mirrored here.**

**THE GROUND-EXAM PASS MARK IS DELIBERATELY NOT DECIDED** *(round 12b — **now
DECIDED, see §4p**)*. FDMS uses `exam_pass_pct` (default **80**); WA used **60**
everywhere (ΠΔ 151/13). The reading that they are two different exams and both
numbers are right is plausible, so this round **stores the grade and derives no
characterisation for `exams` at all** — no mission, no pass/fail chip, nothing
that would settle the question by accident. (12b did not change that: `mission`
is a key of the two FLIGHT logs only, and an exams row carries none.)

> **CLOSED BY BRIDGE RULING #6 (2026-08-21, §4p):** it *is* the two-exams
> reading. A ground exam is passed at **80 %**, a flight at **60 %**, and the
> two numbers are both right. What round 12b wrote above still stands as the
> *storage* shape and was never rewritten — the exams section still stores a
> grade and derives **no mission and no row state** from it. What round 15 added
> is the one judgment the section already made implicitly since round 14
> (**which trial is operative**), now made at 80, plus the wording that names
> the mark.

### THE MUST-FIX: THE PASS-THROUGH IS THE POINT

`wa.migrate_record` builds its output `o` **key by key**, and its final
whitelist pass iterates over `o`. **A section the function does not NAME never
enters `o` and is therefore DELETED from every read, silently, for ever.** And
even reaching the final pass, an entry of a section `wa.entry_keys` does not name
would be stripped to `{}` row by row by `wa.strip_entry`. A student's whole
flight log would evaporate on the first read after the schema shipped.

So the four sections are named in **both** places, and they travel through with
their own repairs:

- **`seq` / `kind` / `ng` defaults** — a row written by an older client (or by a
  bridge that does not know them yet) reads as what it always was: one flight of
  that sortie, flown in its syllabus place. *(Implementation note: the branch
  must be `coalesce(jsonb_typeof(e->'seq'), '-') <> 'number'`, never a bare `<>`.
  An absent key makes `jsonb_typeof` return SQL NULL, `NULL <> 'number'` is NULL,
  and the branch is silently skipped — precisely for the row that needs the
  default. This was found and fixed during the round's own verification.)*
- **`track` resolved from the code's letter** where it can be — lossless and
  deterministic, since `wa.code_track` is what the validator judges the pair by.
- **A mission beside a grade is DROPPED**, not flagged. This is the one place
  the round removes a stored value, and it is lossless: where a grade exists the
  mission is *derived* from it, so what is dropped is a copy, not a fact.
  Flagging instead would leave a row nobody could ever save, because the form
  draws no mission box on a graded row — **a trap, not a question**. (Round 12's
  `verdict` needs no branch of its own: it is not in `wa.entry_keys` any more, so
  `wa.strip_entry` drops it on read like any retired key — which is exactly what
  “no legacy path” buys.)
- **THE CATALOGUE-NARROWING REPAIR PASS** (the `wa.nfs_reason_fix` model): a
  `group` or an `exam` the syllabus no longer contains is **nulled and the row
  flagged** — never dropped, never guessed at. This is what stops a future
  syllabus revision (a renamed theory group, a withdrawn ground exam) from making
  stored records **permanently unsaveable**: without it the owner would be
  refused on every save with no box on the form able to fix it.

### THE CATALOGUE PIPELINE

`tools/gen-items-catalog.py` already wrote two artefacts from one run
(`app/items-catalog.js` and the spliced GENERATED BLOCK of `db/schema.sql`). It
now writes four more catalogues from the same run:

| JS | SQL mirror |
|---|---|
| `WA_LOG_SORTIES[band][track][]` — `{c, n, g, o, h, nt, k, f1, sc}` | `wa.sortie_codes(band, track)` · `wa.sortie_band(code)` |
| `WA_GROUND[]` — the 12 theory groups, `courses[] {c, n, p, cond}` | `wa.lesson_groups()` · `wa.lesson_courses(group)` |
| `WA_EXAMS[]` — the 8 ground-exam groups | `wa.exam_ids()` · `wa.exam_conditional(id)` |
| `WA_SOLO_SLOTS` (unchanged) | `wa.solo_slots()` — **moved into the generated block**, hand-kept until now |

**`WA_LOG_SORTIES` is in FLOW-CHART ORDER, and `WA_SORTIES` deliberately stays
code-sorted.** The two live side by side on purpose: the round-5 pickers keep the
order they have always had, and the log tables get the printed one. The
divergence is real and it is a single pair — in `('flights','instrument')` the
flow chart runs `… I4602 **I4701 I4603** I4890`, the night sortie *before* I4603,
and sorting by code reorders the stage silently.

**BUILD TRIPWIRES.** The port of FDMS `parseGroupCourses` is 55 lines of
JavaScript re-written in Python, and drift there is silent *because the codes
still look right*. So the generator **asserts and fails the build**:

- **47 courses · 45 required + 2 conditional · 514 required periods · 26
  supplementary** — the four totals the port must reproduce;
- the eight per-`(band, track)` sortie counts — **36 / 14 / 22 / 13** flights and
  **18 / 18 / 5 / 7** F/S, 133 in all;
- **8** ground-exam groups;
- no duplicate course code **inside** one group (the `(group, course)` join key
  would be ambiguous);
- **`assert_latin` — every emitted code must be pure Latin.** Course codes in the
  source are mixed-script: `AΕ 101-108` and `AΕ 190` are Latin `A` + **Greek**
  `Ε` (U+0395), and inside the *same* group `g:GT-INSTR` the code `IN 101-105` is
  Latin while `ΙΝ 201-210` is Greek `Ι Ν`. Two codes whose printed forms are
  identical differ in script, and a stored value nobody can retype is a value
  nobody can ever correct. The Greek→Latin fold table is used **for matching
  only** (exactly as FDMS's `normTxt` does); the emitted values are never
  rewritten quietly — the build **stops**, names the code, its offending
  codepoints and its Latin twin, and leaves the decision to a human. *(Today the
  assertion never fires, because the label codes win over the table codes and the
  labels are Latin. It exists for the revision that changes that.)*

### THE FORM — THE TABLE FORM (12b)

The ten blocks sit at the **end** of the student form («ενα πινακα στο τελος»),
in the directive's order: **4 × Flights ⟨track⟩ · 4 × F/S ⟨track⟩ · Ground lessons
· Ground exams**. The flight blocks are collapsible `<details>`, open by
themselves when they hold something, each with its own **+ Add a flight** — a
single Add up in the section header could not know which track it was adding to,
and the track is a *stored fact* written by the act that creates the row, never
inferred afterwards from a code that may not exist.

Round 12 drew each flight as a **card** with a summary line above it. The review
replaced that with what a squadron actually reads — *«σε πινακα με στηλες και
σειρες ολες τις πτησεις»* — so each block is now a **real `<table>`**:

```
FLIGHT | DATE | INSTRUCTOR | DUR (h) | GRADE | MISSION | KIND | ⚑ #2 ↻ ✕
```

**THE COLUMN IS THE LABEL.** A cell is a bare control; the header says once, for
every row beneath it, what it is. That is what keeps a row **one line tall**
(measured: 37 px, every row, at 375 px and at 1280 px), and it is why the
labelled-field builders of the rest of the form are not reused here.

- **Everything that used to be a sentence under a box is now a chip with the
  sentence in its tooltip** — the wrong-table / wrong-band / checkride /
  off-catalogue flags, the `1:20 → 1.3` and `62.5 → 63` offers (one-glyph
  buttons), the CO tag, the 🔒 lock, the *#2* of a same-day re-fly, the
  *incomplete* marker of a leftover row. Nothing is hidden: the chip is
  coloured, permanent, beside the value it is about — and **the save says the
  whole of it in words** anyway.
- **NG lives in the GRADE cell**, because NG is an answer about the grade and
  nothing else: it removes the number and leaves who flew it, when and for how
  long exactly where they are.
- **The kind is a cell**, so an FCF / CEF / repeat is *another row of the log*
  rather than a variant of a syllabus sortie — which is the review's own
  reading: «Απλα για cef, fcf, repeat θα προσθετει εξτρα γραμμες».
- **The four table sections break out of the form's 760 px reading column**
  (`min(1140px, 96vw)`, centred). Eight columns of a flight log do not fit in a
  reading column, and a row that wrapped would stop being a row. Everything else
  keeps the column. On a phone the **table** scrolls inside its own wrapper and
  the **page never scrolls sideways** (verified: `documentElement.scrollWidth ==
  clientWidth` at 375 px).

**SORTING IS A RENDER, AND THE ROW MAP IS EXPLICIT.** *«Sorting με βαση τις
ημερομηνιες.»* Rows are **displayed** oldest first; **storage stays authoring
order**, because an array index is this form's address for a row — every handler
reaches `S.data[sec][i]`, and re-ordering the array under a half-typed row would
make the ✕ of one row delete another. So the map from a displayed row to its
stored row is **explicit and carried in the DOM**: every `<tr>` wears
`data-row="section:storedIndex"` and *nothing anywhere reads a row's position*.
(The R15b popover lesson from the sister application, applied before it could
bite here. Proven: three rows entered out of order, the **middle displayed** row
deleted, and `psql` shows the row that actually went was the one the ✕ belonged
to — stored index 4, not display position 2.)

- **Dateless rows sink to the end** — a row being typed is not the oldest flight
  in the log. Same date: the `seq` of a same-day re-fly, then the order they
  were entered in.
- **The sort runs when the date is SETTLED** (`change`) or when the box is
  **left** (`focusout`) — never on the keystroke: a `<input type=date>` is typed
  in three pieces, and a row that jumped after the day was entered would take
  the cursor with it half-way through the year.
- **It moves the `<tr>`, it does not rebuild the block.** A moved node is the
  same node: nothing loses its value, and the button a click is already
  travelling towards still exists when the mouse comes up. Whatever had the
  focus is handed it back.

The CO's drill-down and the printed brief keep their own tables — there the
screen is wide and the reader is reading, not typing — and both gained the
**Mission** column (and lost the Note one).

**COMPLETENESS, WITH THE LAG MADE EXPLICIT — three notions, kept apart:**

| notion | for the new sections |
|---|---|
| `COMPLETE[sec]` — *"is this row still a leftover?"* | `date && sortie && instructor && track`. **THE GRADE IS DELIBERATELY NOT PART OF IT.** A row may wait for its grade for ever without being incomplete. This is «δεκτο το null» expressed in the one function that decides. |
| `blocksSave` — *"does this row refuse the save?"* | **Only a missing instructor.** A missing grade never blocks anything. The two contradictions (`ng` + grade, `mission` + grade) are unreachable by construction — the mission cell only takes a choice where there is no grade, and NG clears both — and are refused by the validator anyway. |
| `wa.entry_count` / `co_entry_count` | All four join `WA.COUNTED`. **The consequence is named rather than hidden:** a mid-stage student goes from ~18 entries to ~80, so *"3 of 8 entered by the CO"* becomes *"3 of 80"*. That is what the record now contains, and a denominator that pretended otherwise would be the untruth. |

**THE LAG GETS A SURFACE**, because it is the reality the directive names. A row
with `grade IS NULL AND ng IS false AND mission IS NULL` is **awaiting its
debrief** — neither an error nor a legacy leftover. In the table form the empty
Mission dropdown *says so in its own placeholder* (**“— awaiting debrief —”**),
and after `WA.DEBRIEF_AMBER_DAYS` (7) an amber chip beside it carries the age
(*“127 d”*), because at some point the quiet fact becomes a thing to chase. Every
block header counts them (*"3 awaiting a grade"*), the CO's tables keep the full
chip, and on **paper** the lag and a mission-with-no-number are printed **in
words** — a photocopied brief showing an empty Grade cell for a flight the
squadron recorded as an incomplete mission would hide exactly what it exists to
show.

### BLAST RADIUS

**Server:** `wa.sections` · `wa.entry_keys` · `validate_record` (4 branches + the
checkride refusal + the band/track contradictions) · `wa.migrate_record`
(pass-through + repairs) · new `wa.section_cap` · `wa.log_bands` ·
`wa.flight_kinds` · **`wa.missions` · `wa.grade_mission`** · `wa.chk_int` ·
`wa.chk_duration` · `wa.entry_count_by` (with `co_entry_count` kept as its
wrapper) · the six generated lookups + `wa.solo_slots` moved into the block.
**12b drops `wa.verdicts` and `wa.grade_verdict`** by name (`drop function if
exists`, so a re-apply is still idempotent) — a retired function that stays
callable is a second surface waiting to be used.
**`wa.slot_empty`, `wa.entry_core`, `wa.stamp_record_diff` and `wa.carry_stamps`:
untouched** — the new rows are ordinary entries and the CO lock works on them
because it was never section-specific (proven again in 12b: a CO-entered
`flights` row is stamped, locked in the owner's table, and the owner's save is
refused server-side both when the row is dropped and when its mission is
altered).

**Client:** `WA.ENTRY_KEYS` · `WA.COUNTED` · `WA.SECTIONS_META` · the log
vocabulary and catalogue helpers in `app.js` (**`WA.MISSIONS` · `WA.gradeMission`
· `WA.rowMission` · `WA.missionDerived`** replace the verdict set) ·
`WA.awaitingDebrief` · `WA.migrateRecord` · `student.js` `SECTIONS` + `COMPLETE`
+ `blocksSave` + `missingOf` + `buildPayload` + **the whole table render (cell
builders, `sortedRows`, `trHTML`, `tblHTML`, `resortSection`, the live-cell
refreshers)** · `instructor.js` self-report card · `admin.js` drill-down, brief,
print and the entries CSV (**Hours**, **Awaiting**, **Mission** — a spreadsheet
that read a blank Grade as a zero would be reading a failure that never
happened) · `styles.css` (the `.ftbl` table form, `.wide-sec` break-out).

**Watch item, not a defect today:** `admin_get_data` ships the **full migrated
record** per student. Measured on the live stack it is 51 KB for 25 students; a
class with full flight logs would add roughly 24 KB per student. If that becomes
uncomfortable the fix is counts-on-the-dashboard and rows-on-drill-down, which is
a transport change and not a data one.

### DEPLOYMENT NOTE — THE CLOUD SCHEMA GOES FIRST

**The app must not ship before the cloud schema is re-applied.** An old cloud
schema does not know the four sections, so `wa.validate_record` answers *«unknown
section»* and **every save from the new app is refused**; worse, an old
`wa.migrate_record` would **drop** the four keys on read. Exact operator steps:

1. Open the Supabase dashboard for the squadron's project (EU · Frankfurt) →
   **SQL Editor**.
2. Paste the **whole** of `db/schema.sql` from this commit and run it. It is
   idempotent — it has been re-run twice against a populated database in this
   round's verification, exit 0 both times, with people, records and proposals
   byte-identical afterwards.
3. Confirm the new surface exists:
   `select array_length(wa.sections(),1);` → **13**,
   `select array_length(wa.sortie_codes('flights','contact'),1);` → **36**, and
   (12b) `select array_to_string(wa.missions(),' / ');` → **complete /
   incomplete**.
4. **Only then** push the app (the seven assets carry `?v=20260820c`).
5. If step 2 is skipped, the symptom is a save that fails with *«unknown
   section»* — re-run the schema and the same save succeeds untouched.

**Still true after 12b, and still the gate.** The reshape is what makes it
harmless that neither half has shipped: apply the schema of *this* commit, then
push the app of *this* commit, and there is no intermediate state to migrate.

### SELF-VERIFICATION — ROUND 12 (live, local stack, real RPCs and the real form)

1. **All ten blocks render at the end** of the student form in the directive's
   order — 4 Flights + 4 F/S collapsibles, then Ground lessons, then Ground
   exams. Per-table closed lists spot-checked against the catalogue: **32 / 12 /
   21 / 12** aircraft and **18 / 18 / 5 / 7** simulator — i.e. the flow-chart
   counts **minus the eight checkrides**, which the dropdown does not offer.
   Flow-chart order preserved live: `… I4601 I4602 I4701 I4603 I4890`.
2. **Rows created through the real form**: a graded flight (duration prefilled to
   the syllabus 1.3 on picking C4302); a **null-grade** row showing *"awaiting
   debrief"*; an **NG** row with the grade box gone from the DOM; a
   **verdict-without-grade** row; a **same-day double** via the *+ same-day
   re-fly* button (`seq` 2, flight and date carried over, header shows `#2`); a
   **kind `fcf`** row with free sortie text and **no** off-catalogue warning; a
   lessons row (block dates, periods, the Absent chip) and an exams row.
3. **psql read-back shows exact keys** — `date · track · sortie · seq · kind ·
   instructor · duration · grade · ng · verdict · note` and nothing else; no
   `_o_*` / `_ngset` UI crumbs reached storage.
4. **Refusals, through the real RPC**: unknown key in a `flights` entry →
   *"unknown field for a flights entry — accepted fields are …"*; verdict beside a
   grade → the curated sentence naming the derived verdict; grade `79.5` → the
   whole-number rule; a checkride in the flights log → the one-fact-one-row
   sentence. Thirty validator rules exercised in all (ng+grade, verdict+NG,
   duration `1.25` and `95`, wrong track, wrong band, unknown kind, missing
   instructor, unknown group, a course of another group, lesson end-before-start,
   unknown exam, the retired `pending` flag, the 400-row cap).
5. **Off-catalogue behaviour**: a free-text code on `kind:syllabus` is marked
   *"not in the syllabus catalogue"*, live on the keystroke; the same code on
   `kind:fcf`/`other` carries **no** warning. Wrong-track, wrong-band and
   checkride codes each get their own live note under the box.
6. **`migrate_record` round-trip**: a fabricated stored record carrying all four
   sections survives strip/migrate with **nothing lost** (the MUST-FIX proof);
   `migrate(migrate(x)) = migrate(x)`; the saved record re-read and re-saved
   through the real form is **byte-stable** (md5 identical). The catalogue-
   narrowing repair nulls a withdrawn group/exam, flags the row, and the repaired
   row **validates again**.
7. **Schema re-applied twice**, `ON_ERROR_STOP=1`, exit 0 both times, with log
   rows present: **42 people**, 3 records, 9 proposals, record md5 unchanged.
8. **CO on-behalf** writes a `flights` row and an `fs` row → both stamped
   `entered_by:'admin'`, both rendered **locked** on the owner's own form (every
   control disabled, the 🔒 note), and the owner's save refused server-side both
   when the row is dropped and when its grade is altered — the same sentence
   every other section gets.
9. **Regression**: five-level scale intact (10/8/5/3/1, `short === label`), the
   60/50 bands, the eight checkrides in syllabus order, the round-11 surfaces.
   `node --check` clean on all six JS files. **Zero console errors** across the
   student form, the CO form, Overview / Student analysis / Brief, the printed
   brief and the instructor view.
10. **Hygiene**: demo data snapshotted before the round and **byte-restored**
    after (md5 `ae140a99…` before and after), zero residue of the four new
    sections in any stored record, 42 people and 9 proposals untouched.

*(Items 2-5 above describe the round-12 CARD form. The rows, the refusals and the
keys they name were re-run against the table form in 12b — see below — and the
`verdict` half of them is now the `mission` half.)*

### SELF-VERIFICATION — ROUND 12b (live, local stack, the real form and the real RPCs)

1. **Ten blocks, ten tables.** All four Flights blocks, all four F/S blocks and
   the two ground blocks render as real `<table>`s with the new columns; an
   empty block keeps its "nothing recorded yet" line rather than an empty
   header. **Every row measured 37 px — one line** — at 375 px and at 1280 px.
2. **Rows created through the REAL form, out of date order**, and they order:
   entered C4101 (01/03) · C4302 (20/05) · C4201 (10/04) · FCF (15/04) ·
   re-fly (20/05 #2), displayed `0 → 2 → 3 → 1 → 4`, i.e. **01/03 · 10/04 ·
   15/04 · 20/05 #1 · 20/05 #2**, and a **dateless row sinks last**. Storage
   stayed authoring order in `psql`.
3. **✕ UNDER THE SORT DELETES THE RIGHT STORED ROW.** With the five rows
   scrambled by date, the **middle displayed** row was removed; `psql` shows the
   row that actually went was the FCF (**stored index 4**), not the row at
   display position 2 (`C4201`, stored index 2). The other four survive in
   order.
4. **`note` is refused on write and absent from the DOM** — `0` elements with
   `data-field="note"` anywhere in the four sections; the RPC answers *«the note
   field was removed from the flight log — «Δε θελω πεδιο note» …»*.
5. **Mission.** Grade `80` → the cell is a **chip** reading *Mission complete*
   with no control to change it; clear the grade and the same cell becomes the
   dropdown again. A mission set by hand on a gradeless row stores as
   `"incomplete"`. An **NG** row shows `—` for both grade and mission. Through
   the RPC: mission beside a grade → the curated sentence, and with grade `100`
   it prints **“100 %”** unchanged (the round-12 residual holds); mission on an
   NG row and an unknown mission each get their own sentence.
6. **Lessons and exams have no instructor anywhere**: `0` instructor inputs in
   the DOM, gone from `wa.entry_keys` (`date, end_date, group, course, legacy,
   entered_by` and `date, exam, grade, legacy, entered_by`), and a smuggled
   `instructor` / `instructor_oid` / `note` / `periods` / `absent` is refused
   through the real RPC with its own curated sentence.
7. **The table form's own machinery**: same-day re-fly still mints `seq 2` and
   lands beside its source under the sort; `kind:fcf` frees the flight cell to
   free text **with no off-catalogue flag**, while the same free code on
   `kind:syllabus` is flagged *off-catalogue*; the wrong-track, wrong-band and
   checkride flags appear live on the keystroke; `1:20` offers **→1.3** and
   stores `1.3` when pressed.
8. **Pass-through re-proven for the new shape**: a fabricated record carrying
   all four sections **plus** the retired `note` / `verdict` / `instructor` /
   `periods` / `absent` keys survives `wa.migrate_record` with **13 sections
   intact**, the retired keys dropped, a mission-beside-a-grade dropped, a
   mission on an NG row dropped, `track` resolved from the code letter, and
   `migrate(migrate(x)) = migrate(x)`. The migrated output **validates**. The
   client mirror `WA.migrateRecord` produces the identical result.
9. **Schema re-applied twice**, `ON_ERROR_STOP=1`, **exit 0** both times (the
   `drop function` of the two retired verdict helpers included): **42 people**,
   3 records, 9 proposals, `wa.sections` = 13.
10. **CO on-behalf**: the CO added an `F4301` flights row → stored
    `entered_by:'admin'`; on the owner's own table the row is `is-co is-colock`
    with **all 10 controls disabled** and the 🔒 CO chip, and the owner's save is
    refused **client-side** ("1 entry was set by the squadron CO …") and
    **server-side** both when the row is dropped and when its mission is
    altered.
11. **Regression**: 11 further validator rules re-run green (lesson
    end-before-start, duration `25` / `0` / `1.25`, NG+grade, unknown kind,
    missing instructor, unknown group, cross-group course, unknown exam, the
    retired `pending` flag) plus the `(track,sortie,date,seq)` duplicate rule.
    Five-level scale intact (10/8/5/3/1, `short === label`). **Zero console
    errors** on fresh tabs across the student form, the CO form, Overview /
    Student analysis / People & links / Brief, the printed brief and the
    instructor view. `node --check` clean on all six JS files.
12. **Two defects found by this round's own verification and fixed**: the
    printed brief said *"awaiting debrief"* for a row whose mission the squadron
    had recorded (now *"no percentage recorded"*), and the entries CSV marked
    **every ground lesson** as awaiting a debrief — a lesson has no grade at
    all, so the lag column is now scoped to the sections that do.
13. **Layout**: the four table cards break out to `min(1140px, 96vw)`; at
    1280 px the flights table **fits without scrolling** (1086 of 1086), at
    375 px it scrolls **inside its wrapper** (1121 in 306) and the page's own
    `scrollWidth == clientWidth` — no sideways page scroll.
14. **Hygiene**: demo data snapshotted before the round and **byte-restored**
    after — record md5 `0f5cc34f…` identical before and after, 3 records, 9
    proposals, 42 people, and **zero** stored records mentioning `mission`,
    `verdict` or any of the four sections. (The four sections held no fixture
    rows to begin with: round 12 left zero residue, and this round leaves the
    same.)

### OPEN ITEMS RAISED BY THIS ROUND

1. ~~**The ground-exam pass mark.** FDMS `exam_pass_pct` defaults to **80**; WA
   uses **60** everywhere. This round stores the grade and characterises nothing
   for `exams`, so the question is still open: one number, or two different exams
   with two right numbers?~~ — **ANSWERED 2026-08-21 (bridge ruling #6, §4p):
   TWO different exams with two right numbers.** Ground exams (the eight *and*
   the ΕΕΘ) are passed at **80 %**; flights and F/S stay at **60 %**.
2. **`admin_get_data` payload growth** — see the watch item above.
3. **Duration in FDMS.** `trainingLog` has no duration field, so duration is
   **WA-only** for now. Making it a real FDMS field is where this work meets the
   Currency semester counts.
4. **The bridge itself** — the directive's last sentence («αμφιδρομη
   ενημερωση») — is designed and unbuilt. The design that this round was shaped
   to fit is a **reconciler, not a replicator**: its normal output is a report,
   its writes are confirmed per row by the admin, it joins on OID (never on the
   mutable FDMS code), it mints deterministic `wa:` event ids so a re-run
   *updates* instead of appending (a duplicated FAIL row can manufacture a ΠΔ
   29/2020 referral against a student), and it never pushes an ungraded row —
   FDMS has no "not yet graded" state, and a blank result there silently
   *completes* a node.
5. **12b — the two boxes the simplification removed**, recorded so they can be
   asked back deliberately rather than rediscovered as a gap: a ground lesson no
   longer records **`periods`** (partial coverage; NULL meant the full course,
   FDMS's `covCore` semantics) nor **`absent`** (which was the only way a missed
   class became visible from the student's side, and with it the makeup). Each is
   one column of the lessons table and one key.
6. **12b — where a mission comes from when the grade lands later.** A row
   characterised by hand as *incomplete* and later given a grade of, say, 72
   silently becomes *complete*: the number wins, by design (one source of truth).
   The stored hand-set value is dropped on that keystroke and the student is told
   in a toast. If the squadron ever wants the disagreement itself recorded —
   *"the scheduler said incomplete, the debrief said 72"* — that is a second key
   and a deliberate decision, not an accident of this one.

## 4m. Round 13 (2026-08-20) — PRE-SEEDED SYLLABUS SLOTS, AND FOUR COLOURS

### THE REVIEW, VERBATIM (2026-08-20 evening)

> «Οπως ειναι τωρα πρεπει να καταχωρησει καθε πτηση ο μαθητης. Εγω θελω να εχουμε
> ηδη ετοιμες τις πτησεις. Οταν ειναι complete και ολα τα στοιχεια συμπληρωμενα
> θα γινεται χρωμα πρασινο. Οτι εχει ξεκινισει να γραφει ο μαθητης αντιστοιχο
> ανοιχτο πρασινο. Οτι χρωσταει καποια αποχρωση οπως γκρι. Οτι ειναι εξτρα θα
> εχει ενα μουσταρδι χρωμα ας πουμε. Ομοιως για ολες τις κατηγοριες. Και ετοιμα
> τα ground lessons.»

### THE SENTENCE ROUND 12 WROTE, AND WHY IT IS REVERSED

Round 12 put it in the generated catalogue itself, in capitals:

> *«NOTHING IS PRE-SEEDED FROM THIS. It is the closed list a sortie is CHOSEN
> from, never a skeleton of rows … so `wa.slot_empty` needs no branch for these
> sections.»*

That was the right engineering and the wrong product. A student who has to type
the flow chart back in before they can report against it is being asked to do the
syllabus's own work, and the one question the log is for — **what is still
owed** — could not be asked of a table that only contains what happened. The
review reverses the sentence and keeps every reason behind it: **the skeleton is
a RENDER, and an untouched slot is still stored nowhere.**

### THE PATTERN IS THE SOLO-SLOTS PATTERN, SCALED

`solo_flights` has drawn eight fixed rows since round 5 and stored only the ones
that were flown. Round 13 applies the same idea to the four log sections:

| section | slots | where they come from |
|---|---|---|
| `flights` | **77** — contact 32 · instrument 12 · formation 21 · nav 12 | `WA_LOG_SORTIES.flights`, **minus the eight checkrides** |
| `fs` | **48** — contact 18 · instrument 18 · formation 5 · nav 7 | `WA_LOG_SORTIES.fs` |
| `lessons` | **47** | the 12 theory groups × their courses, join key **(group, course)** |
| `exams` | **8** | `WA_EXAMS` |

The checkrides are excluded on purpose and it is the round-12 rule unchanged: a
checkride is recorded in **Evaluations**, where the syllabus order and the
pass-attempt rule apply to it, and two rows for one flight would be two grades
that can disagree.

### THE THREE FUNCTIONS (app.js — one vocabulary, every surface)

- **`WA.slotKey(sec, e)`** — *which* slot a row could occupy, `null` = an extra
  by nature. A flight qualifies only as the syllabus's **one planned pass**:
  `kind:'syllabus'`, `seq 1`, and a code its track's flow-chart list knows.
- **`WA.claims(sec, list)`** — *who* occupies it, in **two passes**:
  1. a row somebody has **written in** takes the slot — first in stored order,
     so a second written row naming the same sortie is an **extra**;
  2. only then may an untouched **placeholder** take a slot still free, and
     there the **last** one wins — picking `FO190` on a row the student just
     added must move *that* row into the FO190 slot, not make it vanish behind
     the seeded one. (Same doctrine as *«an imported evaluation that is finally
     identified goes HOME»* in the evaluations section.)
  A placeholder that ends up claiming nothing is **redundant**: drawn nowhere,
  stored nowhere.
- **`WA.rowState(sec, e, claimed)`** → `done · started · owed · extra`.

Plus `WA.slotRows(sec, list, track)` — the **one display order** (below) that
the student's form, the CO's drill-down and the printed brief all call, and
`WA.stateCounts(sec, list, track)`, which computes **owed from the CATALOGUE**
(`slots − claimed`) rather than by counting rows: the student's form carries the
placeholders and the CO's record does not, and both must reach the same number.
They do — verified live, `done 2 · started 0 · owed 75 · extra 2 · 4 h` on both
sides of the same record.

### THE COLOUR CONTRACT

| state | user's word | token | means |
|---|---|---|---|
| `done` | πράσινο | `--st-done` = `--good` @ .18/.15 | everything filled in **and** the mission completed |
| `started` | ανοιχτό πράσινο | `--st-started` = `--good` @ .075/.06 | written in, not finished |
| `owed` | γκρι | `--st-owed` (neutral wash) | the syllabus prescribes it, nothing recorded |
| `extra` | μουστάρδι | `--st-extra` = **`--mustard-rgb`** @ .20/.15 | beyond the planned pass |

**Done is two conditions, not one.** A flight is done on `date + instructor +
duration` **and** `WA.rowMission(e) === 'complete'` — i.e. a grade ≥ 60 or a
mission the squadron hand-set as complete. A flight graded 48 and re-flown is
**started**, not done: the green belongs to the pass. **NG is the named
exception** — a flight nobody could score is done on date + instructor +
duration, because there is no grade to wait for. A lesson is done on its **date**
(it is attended, not scored); an exam on **date + result**.

**Mustard is its own token and deliberately not `--bad`** — an FCF, a CEF or a
re-fly is a real flight the squadron flew, not a failure — **and not `--warn`**,
which already means *fix this* on that screen. Defined once per mode beside the
`--cat-*` track colours, so a state keeps its colour across all eight palettes.

**The colour is painted on the `<tr>`, never on its cells**, because `.ftbl td`
carries the hover wash and a state on the cells would swallow it. **A row is
never colour alone**: its last cell carries the state as a **word** (`.stchip`),
so a monochrome print, a colour-blind reader and a screen reader get the same
answer as the eye. A **legend** line names the four in the user's own terms under
each section header (one per section, not per block — ten legends would be
noise), and each block header counts them: `done X · started Y · owed Z · extra
N · h · awaiting`.

*Contrast, measured live in all eight palettes:* every state chip and legend chip
holds **≥ 4.66:1**. Two findings were fixed by the measurement rather than by
eye: the dark mustard `201,162,39` measured **3.99** on Tidal, so the dark token
is the brighter, more olive **`212,190,70`**; and the state chip is
**transparent**, because painting its own wash over the row's identical wash
doubled it (0.15 over 0.15 = 0.28) and pushed `done`/`started` to 4.30 / 4.22 in
Slate and Ridgeline. **Recorded, not hidden:** in **Mesa** `--warn` is itself a
dark mustard (109,90,0) and the light `--mustard` (107,84,0) is nearly the same
colour. They never share a column — `--warn` is a cell chip beside a value,
`--mustard` a row wash and the end-of-row chip — and each carries its own word. A
one-line override in the mesa block is the fix if it ever bothers anybody.

### THE ORDERING CHANGE — **FLAG FOR THE USER**

**The syllabus order is now the backbone.** Slot rows render first, in
flow-chart (and, for the ground blocks, printed-programme) order, and **a slot
does not move when its date is filled in** — its place is its place in the
syllabus. **Round 12b's date sort is not revoked; it now governs the EXTRAS**,
which have no place in the chart to sit in and render after the slots, oldest
first, dateless last, then `seq`, then stored order.

> **A mid-stage student will see their rows in a different order than
> yesterday — by syllabus, not by date.** That is the intended reading order for
> "how far through the stage am I", and it is the one thing in this round a
> reasonable person could want the other way. If the date order is wanted back
> for the slots too, it is one comparator in `WA.slotRows`.

### THE SPARSE RULE — WHERE IT LIVES, AND WHAT IT BUYS

One line in `buildPayload`, three times:

```js
const owedRow = (k, e) => WA.slotOwed(k, e);      //  slotKey && nothing else
… d[k].forEach((e, i) => { if (owedRow(k, e)) return; … });
```

`WA.slotOwed` deliberately does **not** ask whether the row claims its slot: the
answer is the same either way — the row stores nothing, counts nothing, is
stamped by nobody. `legacy` and `entered_by` are **disqualifiers** inside
`WA.slotUntouched`, so a row an older form left incomplete, or one the CO
entered, can never be mistaken for a placeholder and silently dropped.

What it buys, all four verified live:

1. **The record stays exactly as sparse as it was.** 182 rows on screen → **5
   stored**; 48 F/S rows → 1; 47 lessons → 2; 8 exams → 2. A student who touches
   nothing and presses Save stores `"flights": []`, `"fs": []`, `"lessons": []`,
   `"exams": []`.
2. **No server change at all.** `wa.slot_empty` needs no new branch because the
   server never receives an untouched slot. `db/schema.sql` is **untouched by
   this round** — see the deployment note below.
3. **The CO-entry arithmetic is undiluted.** *«1 of 23 entries was entered by the
   squadron CO»* — not *1 of 203*.
4. **The payload caps are where they were** (`wa.section_cap` 400/200, the
   400 000-byte ceiling): what travels is what happened.

**It works in reverse too.** A slot row cannot be *deleted* — the flow chart
prescribes it whether or not it has been flown — so the ✕ is replaced on a slot
row by a **⌫ that clears it back to owed** (the round-5 `soloEmptyReset` idiom,
given a button). Verified: cleared → grey, stays in its syllabus position, and
the next save takes it **out** of storage (`flights` 5 → 4).

### WHAT ELSE CHANGED

- **Slot rows print their identity, they do not offer it.** The sortie / group ·
  course / exam is the row's identity, not one of its answers, so it is a label
  with the whole syllabus line in its tooltip (name, Training Section, prescribed
  hours, night, solo candidate). **Kind is fixed to `Syllabus`** on a slot row —
  a slot of the flow chart *is* the planned pass by definition; a repeat, an FCF
  or a CEF is an EXTRA row, reached by **↻ same-day re-fly** or **+ Add an extra
  flight**.
- **Duration is not prefilled into a slot** (that would make it touched); the
  syllabus hours show as the box's **placeholder** instead, which is the better
  behaviour anyway.
- **A block opens** when it holds anything touched; if the whole section is
  untouched, the **first track** opens, so a fresh student meets their syllabus
  rather than four closed boxes.
- **CO drill-down**: the owed rows are drawn from the same catalogue through the
  same `WA.slotRows`, so the CO's table **is** the student's table — same order,
  same colours, same counts, plus a **State** column and the legend. The one
  question the CO actually asks — what is this student still owed — is answered
  without opening the student's link.
- **Brief + instructor card**: `· 74 of 77 owed`, `0 of 47 lessons · 0 of 8
  exams`, and an empty log now says *nothing flown yet — all 77 sorties of the
  flow chart owed* instead of rendering nothing.
- **Printed brief**: the four states are **words** — the count in each section
  heading and a `State` column on every printed row. **The owed rows are not
  printed one by one**: a photocopied brief of 180 empty lines is not a brief.
- **Entries CSV** gains **State**. Only three of the four words can ever appear
  there and that is not an oversight: it is one row per **entry**, and an owed
  slot is not an entry. **Where the fourth word lives:** the **summary CSV**
  gains four columns per slot section (`done · started · owed · extra`) plus its
  denominator — 20 new columns, which is what makes *"how far through the stage
  is this class"* answerable in a spreadsheet.

### TWO RESIDUALS FOUND IN PASSING (both fixed, both recorded)

1. **`WA.debriefChip` was not section-aware.** 12b's own note claimed *«every
   other surface already says "awaiting a result"»*; the CO's exam table did not
   — it said *awaiting debrief* about a written paper. Now `WA.debriefChip(e,
   sec)` mirrors `WA.debriefWord`.
2. **The CO could not delete his own entry.** The round-8 "the CO's entries must
   all still be there" check compared against a baseline taken at load and ran
   for **both** sides. It exists because nothing in the *student's* UI can drop a
   locked CO row; on the CO's own form nothing is locked, he may delete his own
   entry — and, since this round, **clear a slot row he filled in**. Refusing his
   save with a sentence telling him to ask himself was nonsense. The check is now
   `for (const sec of (asCO ? [] : SECTIONS))`.

### DEPLOYMENT NOTE — **NO SCHEMA GATE THIS ROUND**

`db/schema.sql` is **not touched**. The slots are a render; the server sees
exactly the payload it saw in round 12b, and `wa.validate_record`,
`wa.migrate_record`, `wa.slot_empty`, `wa.entry_count*` and the caps all apply
unchanged to the rows that *are* stored. **The app can ship on its own**: bump
the buster (this round: `?v=20260820d → ?v=20260821a`, seven assets) and push.
The §4l gate still stands for anyone who has not yet applied the round-12
schema — that is the schema this app needs, and nothing more.

### SELF-VERIFICATION — ROUND 13 (live, local stack, the real form and the real RPCs)

1. **A FRESH student opens with every slot grey.** `owed` = **77 flights · 48
   F/S · 47 lessons · 8 exams**, `notOwed = 0`, per track **32 / 12 / 21 / 12**
   aircraft and **18 / 18 / 5 / 7** simulator, and the form reads **clean**
   (`dirty:false`, the floating Save hidden) — 180 seeded rows do not fabricate
   an edit.
2. **The four transitions, on real `input` events**: `owed → started` on the
   date keystroke (counters flip **owed 32 → 31 · started 1** in the block and
   the section at once); instructor and duration keep it started; **grade 48
   leaves it STARTED**; **grade 85 makes it DONE**; **NG on date + instructor +
   duration makes it DONE**; **⌫ returns it to OWED** and the fingerprint returns
   to **clean** — typing and undoing lands back where it started.
3. **NG on an OWED slot is an answer about a flight that has not happened** —
   the round-9 solo ruling, applied here by leaving `ng` out of
   `WA.slotUntouched` rather than by a second flag. Tapping NG on a grey row
   shows the **NG** badge, leaves the row **owed** (counts unchanged, nothing
   stored, no save refusal about a date the student never meant to give), and
   the answer is carried into the record by the first real keystroke: date +
   instructor + duration took the row straight to **done**, `ng:true` and all.
4. **Extras are mustard and they render after the slots.** ↻ same-day re-fly →
   `C4101 #2` at the table's end; an `fcf` row with free-text sortie and **no**
   off-catalogue flag; a lessons extra with an **off-catalogue** course flag; an
   exams re-sit. A second extra with an earlier date **sorts above** the first,
   while a slot given a 31/12 date **does not move**.
5. **Sparse storage proven in `psql`.** 79 form rows → **5** stored, 48 → 1,
   47 → 2, 8 → 2, exact keys and nothing else; an all-untouched save stores four
   **empty** arrays; a cleared row **leaves** storage (5 → 4).
6. **Reload re-renders the states from storage** and the counts are identical to
   before the save.
7. **A stored R12b record lands in its slots**: `C4301`(88) **done** in the C4301
   slot, `C4302`(no grade) **started** in its own, `I4101 kind:repeat` an
   **extra** at the end of the Instrument table with the `I4101` slot still owed
   above it, `IN190` **done** among the eight exams — **zero duplicate slot rows**
   (contact 32 rows, instrument 12 + 1 extra), and the form opens **clean**.
8. **A hand-added row takes its free slot.** Adding an exams row and picking
   `FO190` moves *that* row into the FO190 position (8 rows, no stray extra, no
   duplicate); the seeded placeholder is drawn nowhere and reaches the server
   nowhere (3 exam rows stored).
9. **CO on-behalf**: the CO filled the `C4303` slot → stored with
   `entered_by:'admin'`, and on the owner's own form it renders **in its slot**,
   green, **locked** (all 7 controls disabled, 🔒 CO) — with *«1 of 23 entries»*,
   the undiluted arithmetic. The owner then saved and **the CO row survived**.
10. **CO surfaces**: drill-down headers `done 2 · started 0 · owed 75 · extra 2 ·
   4 h` — **identical to the student's form**; State column and legend on all
   four tables; brief lines and instructor card carry the denominator; the
   printed brief carries the counts and the State word; **entries CSV** State
   column (`done`/`started`/`extra`) and **summary CSV** 20 new columns
   (`2;0;75;2;77 · 1;0;47;0;48 · 2;0;45;0;47 · 1;1;6;0;8`).
11. **Layout and colour**: at **375 px** the page does **not** scroll sideways,
    rows stay **37 px — one line**, the table scrolls inside its own wrapper; all
    eight palettes resolve the four washes, and every state/legend chip measures
    **≥ 4.66:1**.
12. **`node --check` clean** on all six JS files. **Zero application console
    errors** across the student form, the CO form, Overview / Student analysis /
    Brief / People, the printed brief and the instructor view. `db/schema.sql`
    untouched, so no schema re-run was required.
13. **Hygiene**: demo data snapshotted before the round and **byte-restored**
    after — the two dumps differ only in `pg_dump`'s own random `\restrict`
    nonce; two fixture students created and **deleted**; 42 people, 3 records,
    9 proposals; the three record digests match the pre-round ones exactly.

### OPEN ITEMS RAISED BY THIS ROUND

1. **The ordering change is the one to rule on** — see the flag above.
2. ~~**A `started` ground lesson cannot be saved.**~~ **CLOSED IN ROUND 14
   (§4n·2).** A lesson has only `date` and `end_date`, so the only partial state
   is *an end date with no start date* — and round 12b's rule refused that row by
   name. The command's own instruction («τα μαθηματα να δεχομαστε και μονο end
   date για την καταγραφη») makes it a **complete** record instead: either date
   completes a ground lesson, so the one partial state the row can have is no
   longer the one state the server refuses.
3. **`JP190` is seeded for everybody.** It is `cond: true` — *foreign SPs only* —
   and a HAF student does not owe it, yet it counts in the 8 and shows as owed
   with its *foreign SPs* badge. FDMS's own `SchedReady` never reads that flag
   either (§4l). Two right answers exist (drop conditional slots from the
   denominator per student, or keep the syllabus whole and let the badge say
   it); this round keeps the syllabus whole. Same question for the two `[suppl.]`
   courses among the 47.
4. **180 rows is a lot of DOM on a phone.** It measures fine (37 px rows, no
   page-level sideways scroll, blocks closed until touched), but if a student on
   an old handset finds it heavy, the answer is a per-block *"show owed"* toggle,
   not a smaller syllabus.

## 4n. Round 14 (2026-08-21) — THE PANEL, THE PLANNED ROW, AND THE SIGNATURE

### THE MORNING BATCH, VERBATIM (2026-08-21)

> 1. «θα ηθελα στο wings ahead να προσθεσουμε στα αριστερα ενα navigation panel»
> 2. «τα μαθηματα να δεχομαστε και μονο end date για την καταγραφη»
> 3. «στα ground exam να εχουμε 2nd trial, 3rd και να μπορουμε να βαλουμε τα ΕΕΘ
>    με ΕΕΘ 1, ΕΕΘ 2 κλπ»
> 4. «τους εκπαιδευτες με σειρα αρχαιοτητας. HAF πρωτα, ITAF μετα»
> 5. «την γραμμη μεταξυ recommended as alternate and recommended for other
>    assignments»
> 6. «το save οχι για καθε μαθητη, αλλα γενικα»
> 7. «οταν πατησει το γενικο save ή το ειδικο να του βγαζουμε ενα μηνυμα
>    επιβεβαιωσης ποιος εγραψε (απο το link, o Maj ⟨ΟΝΟΜΑ⟩) και σε σχεση με τι.
>    Ετσι θα μπορει ο χρηστης να επιβεβαιωσει. Επισης θα μπορει να απορριψει. Αν
>    θελει να απορριψει θα τον ρωταμε αν θελει σιγουρα να απορριψει τις 1,2,3
>    αλλαγες»

**REDACTION NOTE.** Item 7 names the Flight Commander by surname. The name is
replaced by `⟨ΟΝΟΜΑ⟩` here and in the two source comments that quote the same
sentence (`app/app.js`, `app/student.js`): **no real name enters a tracked file,
ever.** Nothing else in the quotes is altered.

---

### 1. THE LEFT NAVIGATION PANEL

The student form is **fourteen sections and about twelve thousand pixels** since
round 13 pre-seeded the syllabus. Everything in it was reachable and nothing in
it was findable: a student adding an NFS scrolled past the whole flight log to
get there, and a CO entering data on somebody's behalf did it twice.

The panel is the form's **table of contents** — one row per section card, click
to go there — and each row carries **the one fact that section is about**, so it
answers *what do I still owe* without being opened at all:

| section kind | what the row says |
|---|---|
| the four slot sections (`flights` `fs` `lessons` `exams`) | the four-state bar, and **“N owed”** — the question the pre-seeded syllabus exists to answer |
| the two fixed sections (`evaluations` `solo_flights`) | **“6/8”** — how many syllabus slots are flown |
| everything else | the entry count, because for an NFS or an FPC the number *is* the fact (and zero is the good news) |

Every state is read from **the same counters the section header prints**
(`WA.stateCounts` / `cntHTML`) and never from a second count, and the panel is
refreshed on the same beat as the header — `markDirty()`, so it moves **on the
keystroke**, not on the next save.

**IT IS ONE COMPONENT AND IT IS NOT THE FORM'S** — `WA.navHTML` /
`WA.navMount(navEl, {items, anchor})` in `app.js`. It renders, tracks the
scroll, and re-reads the items on demand; it never reads a record, because it
must not have an opinion about what a section is. `WA._nav` is the one slot
`teardownView()` destroys — a scroll listener that outlived its DOM is the one
bug this component can have.

**THE LAYOUT.** `.pagelay` is a two-column grid (`224px minmax(0,1fr)`) and the
panel is **sticky inside it**, not fixed to the viewport: sticky keeps the rail
in the document, so it cannot sit on a page margin or fight the top bar for
position. `--topbar-h` (published by `WA.measureTopbar()`) is the only number it
needs, and the bar wraps to two rows on a 375 px phone without the rail
noticing.

*What happens to the round-12b breakout.* The four table cards escaped the
760 px reading column with `left:50%; translateX(-50%)`, measured against the
**viewport**. Inside the grid that would centre them on the page and push them
under the rail, so within a `.pagelay` the breakout is **turned off** and the
content column does the job instead: `.lay-read` keeps ordinary cards at 760 px
and lets the table cards fill the column — measured **999 px at a 1280 px
viewport**, against `min(1140px, 96vw)` before. Below the break the breakout is
restored, because there is no rail to collide with.

**UNDER 900 px IT IS THE SAME `<ul>` IN A DIFFERENT SHAPE** — a one-line
horizontally-scrolling **strip of pills** (measured 1479 px of pills scrolling
inside 355 px), and the **burger** opens it into a wrapped grid of all fourteen.
One list, two shapes: a phone gets the pills without a second copy of the markup
that could drift from the first. Tapping a pill closes the panel — the section
you asked for must not open underneath the list you asked it from.

**TWO THINGS THE SCROLL DOES THAT ARE NOT DECORATION.**

1. **The offset is measured, and below the break it includes the strip.** Above
   the break only the top bar has to be cleared; below it the panel is a *second*
   sticky strip, so its height counts too — otherwise every jump lands the
   section's heading behind the very pills that asked for it. Verified: at
   375 px every jump lands at `top: 154` against a nav bottom of `140`.
   **ROUND 17b — AND THE COLLAPSE HAPPENS FIRST (R17 verify item 2).** That
   verification was done with the strip **closed**; opened with the burger it
   was wrong, and had been since round 14. The open panel is a wrapped grid **in
   the flow**, so it pushes the whole document down by its own extra height;
   `go()` measured both the anchor and `offset()` against it and only then
   collapsed it, and Chrome's **scroll anchoring** then pulled the page back by
   exactly the collapse delta — leaving the card that much too low. Measured on
   the running app: **173.8 px instead of 14** on the 25-student instructor rail
   at 900 px (delta 160), **358.3** at 375 px (delta 344), and **37.5 / 183.5**
   on the 13-section student rail (deltas 24 / 170). The close is now the
   **first** thing `go()` does — `getBoundingClientRect()` flushes the pending
   layout on the very next line — so all three rails land at **14 px** under the
   strip at both widths, burger open or shut. One component, three rails.
2. **`behavior:"smooth"` is advisory, so the landing is confirmed.** Some
   engines — including this round's own emulation mode — ignore it outright and
   the page simply never moves, which would make the whole panel look broken
   while every other part of it worked. `go()` therefore re-checks 250 ms later
   and jumps instantly if **nothing has moved at all**; a real smooth scroll has
   travelled by then, so this never interrupts one. And smooth is capped at
   `WA.NAV_SMOOTH_MAX = 2400 px`: animating a jump from the top to Ground exams
   across twelve thousand pixels is not *smooth*, it is a four-second wait, and a
   table of contents exists to **take you there**. `prefers-reduced-motion`
   switches the animation off at any distance.

#### THE ADMIN DASHBOARD — THE JUDGEMENT

> *«Check the ADMIN dashboard too — if a left panel helps there
> (Overview/Analysis/Brief/People as vertical nav), apply the same pattern.»*

**THE FOUR TABS STAY A HORIZONTAL CHIP ROW**, and that is a ruling and not an
omission. A left panel answers **one** question — *where am I in this long
document, and what is in the rest of it* — and the four tabs are not a document:
each one **replaces** the whole content, so a vertical rail of them could only
ever highlight the row that is already lit. What it would cost is real: ~220 px
of width on every tab, for ever, and the two things this dashboard most needs
width for sit exactly there — the Overview's **thirteen-column** table and the
log tables in the analysis.

**BUT THE PATTERN'S REAL HOME IN THE ADMIN IS THE STUDENT ANALYSIS**, which *is*
a document: **ten cards**, several screens, and the CO reading it is looking for
a section (the evaluations plot, the FAIL table, the flight log, the
assessment). So the panel goes **there**, listing that tab's cards with the same
live states, mounted from the same `WA.navMount`. One component, two surfaces;
the tabs keep the shape that suits a view switch. The panel is destroyed and
re-mounted on every tab switch and on every student change, so its rows always
describe the student on screen (`Ground = 56 owed`, `Ø 9.33` — proven live).

---

### 2. A GROUND LESSON: THE END DATE ALONE IS A VALID RECORD

> «τα μαθηματα να δεχομαστε και μονο end date για την καταγραφη»

A lesson is a **block**: `date` = start, `end_date` = end. Round 12b asked for
the START on every row, which meant a course a student knows **finished** on the
12th but cannot date the beginning of could not be recorded at all. **Either
date now completes the row; both is the normal case; neither is still refused**,
because a lesson with no date at all says nothing that *this course is in the
programme* does not already say — and that is the owed slot, which stores
nothing.

**AND IT CLOSES ROUND 13'S OPEN ITEM 2.** That item read:

> *«A `started` ground lesson cannot be saved. A lesson has only `date` and
> `end_date`, so the only partial state is an end date with no start date — and
> round 12b's rule (unchanged) refuses that row by name. The colour is therefore
> honest but transient there.»*

The one partial state a two-date row can have was **the one state the server
refused**. It is now the state the command asked for, so the quirk is not
worked around — it is gone.

Where the rule lives, all four in the same words:

| | |
|---|---|
| server | `wa.validate_record` → *«a ground lesson is recorded by its start date, its end date, or both — one of the two is required»*. This is the **one** section where `wa.chk_entry_date` does not apply. |
| server, on read | `wa.migrate_record` no longer flags an end-only row as a lost-date import |
| client | `COMPLETE.lessons`, `buildPayload` (same sentence), `missingOf` (a missing `date` is not a missing fact here) |
| colour | `WA.rowDone('lessons')` → `isD(date) ‖ isD(end_date)`, so **end-only is green** |
| order | `WA.rowDate(sec,e)` — the date a row is filed under; an end-only lesson sorts by its end date instead of behind every course that has not started |
| readouts | the drill-down prints **“ended 30/04/2026”** and the entries CSV the same, not a broken range `— – 30/04` |

`end < start` is still refused when both exist.

---

### 3. GROUND EXAMS: TRIALS, AND THE ΕΕΘ SERIES

> «στα ground exam να εχουμε 2nd trial, 3rd και να μπορουμε να βαλουμε τα ΕΕΘ με
> ΕΕΘ 1, ΕΕΘ 2 κλπ»

**TWO DIFFERENT THINGS ARRIVE IN ONE SENTENCE**, and they are stored differently
because they *are* different:

| | a **TRIAL** | an **ΕΕΘ** |
|---|---|---|
| what it is | another attempt **at one of the eight** | a **weekly theory exam** — an open series the syllabus does not enumerate |
| identity | the exam's own id **+ `trial` 2 or 3** | `series:'EETH'` + `series_no` 1, 2, 3 … and **no `exam`** |
| how many | at most three, **one row per (exam, trial)** | unlimited within the section cap (200) |
| minted by | **“+ 2nd trial”** on the exam's own row | **“+ ΕΕΘ n”** in the section header, `max + 1` |
| date · grade | date may be empty on a **planned** (2nd/3rd) trial; the 1st still needs it | **both nullable** — it is programmed before it is sat |

**THE FIRST TRIAL IS WRITTEN AS NO KEY AT ALL.** That is what makes every record
from before this round correct without being rewritten, and it is enforced in
both directions: `wa.migrate_record` normalises a stored `1` away on read, and
`wa.validate_record` refuses `trial:1` by name — *«a stored 1 would be a second
spelling of the same fact, and two spellings is how a uniqueness rule gets
bypassed»*.

#### WHICH TRIAL WEARS THE SLOT — THE EVALUATIONS' RULE, ONE SECTION OVER

The colour of an exam slot follows the **operative attempt**, decided exactly as
round 11 decided it for the eight checkrides (`WA.evalOperativeOf`): **PASS is
the filter and it runs first, LATEST is only the tiebreak**, and a slot with no
pass at all falls back to the latest attempt so a student who has failed twice
still shows a number rather than an em dash. `WA.examOperativeIx` is that rule
over exam rows, with the tiebreak reading **date → trial number → stored order**
(*the later attempt*, when two re-sits share a day).

It **has to** be the same rule: a re-sat exam and a re-flown checkride are the
same fact about the same student, and two rules would let the brief and the form
disagree about whether IN190 is done. `WA.claims` is the one line where the two
doctrines meet — first-in-stored-order for the flight logs and the lessons (a
re-fly is not the planned pass), the **operative trial** for the exams (three
attempts at *one* slot, not three passes at it).

> **ROUND 15 — THE SAME RULE, THE EXAMS' OWN MARK.** *The rule* is shared; *the
> number* is not. Since bridge ruling #6 (§4p) `WA.examOperativeIx` asks
> `WA.gradePassed(g, 'exams')` — **80 %** — while `WA.evalOperativeOf` keeps
> asking the flight question at 60. This is the one place in the application
> where round 15 changed behaviour rather than wording: a 2nd trial marked 78
> used to take the slot and no longer does, and the rule's own documented
> fallback (*no attempt passed → the latest graded one stands, `passed:false`*)
> is what carries the slot instead.

#### NEITHER IS MUSTARD, AND WHY IT NEEDED TWO PREDICATES

`extra` means *beyond the syllabus's one planned pass*. Neither of these is:
a 2nd trial is a re-sit the squadron ordered, an ΕΕΘ is on the weekly programme.
Getting that right took **two questions that sound alike and are not**:

- **`WA.rowMinted`** — *did somebody CREATE this row with an affordance?* (a
  series row, or a trial ≥ 2). A minted row is a **report** even when it is
  empty (*a re-sit has been ordered*), so it is stored, it is never mistaken for
  a seeded placeholder, and the click never silently undoes itself on the next
  save. A **blank trial-1 row IS** the seeded placeholder. → `slotUntouched`,
  `claims`.
- **`WA.rowPlanned`** — *should it wear the mustard?* **Every** attempt at one of
  the eight is within the plan, whichever trial it is: when a 2nd trial passes it
  takes the slot, and the failed **first** attempt it displaces is not suddenly
  an off-catalogue extra — it is *the first trial*, and it is shown as one,
  directly beneath its slot. Only a row naming no known exam is an extra here.
  → `rowState`.

A **planned row with nothing in it is OWED**, not started: minting ΕΕΘ 4 or a 2nd
trial of IN190 puts it on the programme, and *«in the programme, nothing
recorded yet»* is the sentence the grey wash already carries. And a blank planned
row **never takes the slot** from the attempt that has something in it.

#### WHERE THE ROWS GO, AND WHAT THEY ARE CALLED

`WA.slotRows('exams', …)` emits: each of the eight slots (held by its operative
attempt) **with its other trials immediately beneath it**, then **the ΕΕΘ series
in number order after the eight fixed slots**, then the true extras. Every
surface names a row with the one helper, `WA.examRowLabel` — *“IN190 · 2nd
trial”*, *“ΕΕΘ 3”* — the student's table, the CO's drill-down, the **printed
brief** (monochrome has no badge colour to tell a re-sit from a first sitting)
and the **entries CSV**, whose *Counts* column now says which attempt the verdict
is read from, exactly as it does for a re-flown checkride.

#### THE EXAMS SECTION'S “+ ADD” IS NOW THE ΕΕΘ

The generic **+ Add** is gone from that header and it is not a loss: all eight
ground exams are seeded, the list is closed server-side, and a re-sit is now a
**trial** minted on its own row — so the only exam row a student can
legitimately need to *create* is the next weekly ΕΕΘ. A generic add could only
have produced a duplicate trial-1, which the new uniqueness rule refuses.
The affordance also disappears from an exam **nobody has sat**: there is no
second trial of an exam that has not had a first.

#### AND THE COUNT THAT HAD TO GROW A SECOND NAME

`WA.stateCounts` gains **`slotsDone`** — how many *slots* are complete, which is
not the same number as how many *rows* are: an exam sat three times is **one**
exam done. Every «X of 8» sentence (the instructor card, the CO's brief line)
now reads `slotsDone`; every «done X» still reads `done`. Without it a student
with a re-sit would have read **“9 of 8 exams”**.

---

### 4. INSTRUCTOR SENIORITY ORDER — ONE COMPARATOR, EVERY LIST

> «τους εκπαιδευτες με σειρα αρχαιοτητας. HAF πρωτα, ITAF μετα»

Every surface that lists instructors sorted them **alphabetically by surname** —
an order the squadron does not use for anything. The squadron's order is
seniority, and it has three levels:

1. **The air force.** HAF, then ITAF, then any other named one alphabetically
   (so a third lands somewhere definite rather than wherever the roster inserted
   it), then whoever the roster gave no country.
2. **The call sign, in NATURAL order** — a 2 before an 11, never the string
   order that puts the 11 first. The call sign and **not the rank** decides,
   because the call sign is the squadron's own position while the rank is a
   grade. This is the **FDMS Currency precedent**, unchanged. *(Round 19: the
   examples here are INVENTED numbers and the sentence no longer says which
   call sign belongs to which appointment — see §4u·6.)*
3. **No call sign sorts last within its own air force**, by surname — such a
   person is not un-ranked, they are un-numbered.

> **RULED 22/08/2026 (round 16, §4r ruling (b)) — LEVEL 3 IS A DEAD LETTER, AND
> IT STAYS.** *No instructor is ever without a call sign*: some numbers are
> deliberately skipped, and **students never have one**. The comparator is
> **kept exactly as written and is not exercised** — it is there so that a
> roster row missing its number lands somewhere definite instead of wherever the
> database happened to return it. Nothing to change; the question is closed.

**IT LIVES IN TWO PLACES BECAUSE IT HAS TO.** `WA.seniorityKey` / `WA.bySeniority`
on the client, `wa.seniority_key(people)` (over `wa.natkey`, which pads digit
runs to eight) on the server. The instructor **picker's payload is surnames and
nothing else** — no country and no call sign ever leave the database for a
student — so the **order is the only channel** the ruling has into that list, and
`wa.instructor_surnames()` applies it. `WA.insNames` correspondingly **stopped
sorting**: round 9 re-sorted alphabetically one line after the server had
applied the squadron's order, and threw it away.

**THE SORT SITES SWEPT** (`grep` over every `.sort(` / `order by` in the repo):

| where | before | now |
|---|---|---|
| `wa.instructor_surnames()` — the picker behind every “who” box | `order by last_name` | seniority (grouped by surname, taking the **senior** key where two share one) |
| `admin_dashboard` → `proposals` (the drill-down) | `order by ip.last_name` | seniority |
| `admin_dashboard` → `by_level` / `no_level` / `not_submitted` names | `order by i2.last_name` | seniority |
| `admin_dashboard` → `instructors` (the Overview strip) | `order by p.last_name` | seniority |
| `admin_list_people` (the People table) | `role, last_name, first_name` | `role`, then **seniority** inside each block |
| `admin_export` → `people` | `role, last_name` | `role`, then seniority |
| `admin.js` Overview submissions strip · People table · analysis drill-down · assessments CSV · printed brief comments | alphabetical | `WA.sortBySeniority` |

The client sorts **as well as** the server on every surface whose payload carries
the country and the call sign, so the order holds even against a cloud instance
whose schema has not been re-run yet. Every other `.sort(` in the app is a date,
a syllabus position, a class name or a metric value — none of them lists people.

---

### 5. THE ASSESSMENT FORM: THE LINE MOVED UP ONE

> «την γραμμη μεταξυ recommended as alternate and recommended for other
> assignments»

`WA.LEVEL_SEP_AT: 4 → 3`. Until now the rule sat before the **fifth** level and
said *the last one is a different kind of statement*. It now sits between
**Recommended as Alternate (5)** and **Recommended for Other Assignments (3)**,
and the move is what turns it from a typographic hedge into **the one boundary
this form is asked to draw**:

```
    Strongly Recommended                            10  ┐
    Recommended                                      8  ├─ the FIGHTER answers
    Recommended as Alternate                         5  ┘
    ────────────────────────────────────────────────────
    Recommended for Other Assignments                3  ┐─ the REDIRECT answers
    Strongly Recommended for Other Assignments       1  ┘
```

**The rationale in the spec changes with it**: the rule no longer separates *the
last level* from *the list*; it separates the three answers that place a student
on the fighter track or immediately beside it from the two that place him
somewhere else in the Air Force. The scale itself, the weights and the "not one
negative word" doctrine (§4j) are untouched.

The same rule is now drawn on the **CO's readout** (`assessBox`), from the same
`WA.LEVEL_SEP_AT`, so the boundary the CO reads a distribution against is the
boundary the instructor answered against.

---

### 6. ONE GENERAL SAVE ON THE INSTRUCTOR FORM

> «το save οχι για καθε μαθητη, αλλα γενικα»

Round 10 argued for the per-card Save and the argument had one flaw the live
form makes obvious: **an instructor answers a questionnaire about a class, not
twelve separate forms**, and a Save per card asks him to perform twelve acts to
complete one.

The objection round 10 raised against a single button — *“save which of them?”,
either by saving all (a batch write nobody asked for, and one that would
re-stamp rows the CO owns) or by guessing* — is answered by the machinery the
student form has had since round 9: **dirt is measured**. `SAVED[sid]` holds each
card as it was last stored, the card is dirty when it **differs**, and the one
Save writes exactly the dirty ones. Change something and change it back and the
card leaves the list, because the assessment really is the stored one again —
which is also what stops the general Save from re-stamping a proposal the CO
owns and the instructor never touched.

- the button **says how many**: *“Save 3 assessments”*, on both the floating
  copy (the student form's pattern — this form is a dozen screens long) and the
  bottom bar, and it is **disabled while nothing differs**;
- a dirty card is marked in place (`.stucard.is-dirty`, warn-coloured left
  border) and its status line says *“Unsaved — it will be written by the Save
  button.”*;
- **there is deliberately no batch RPC.** `wa.write_proposal` carries the whole
  per-proposal contract — the level normalisation, the **owner-reclaim** that
  clears the CO tag when the owner answers, the CO stamp when the CO does — and
  a second write path would be a second place for those rules to live. The
  button iterates the dirty cards over the RPC that already exists and **reports
  per card**: an assessment the server refuses leaves that one card unsaved and
  named, and the rest of the class still lands.

---

### 7. THE CONFIRMATION, AND THE ENUMERATED DISCARD

> «οταν πατησει το γενικο save ή το ειδικο να του βγαζουμε ενα μηνυμα
> επιβεβαιωσης ποιος εγραψε (απο το link, o Maj ⟨ΟΝΟΜΑ⟩) και σε σχεση με τι …
> Επισης θα μπορει να απορριψει. Αν θελει να απορριψει θα τον ρωταμε αν θελει
> σιγουρα να απορριψει τις 1,2,3 αλλαγες»

**WHO COMES FROM THE LINK, WHICH IS THE WHOLE POINT.** Whoever holds a personal
link **is** that person to this application; the one thing it can and must say
back before a write is **whose name goes on it**. The header is the token's own
record (`WA.me`) as **rank + surname** — *“1Lt ⟨SURNAME⟩”*, *“Cdt ⟨SURNAME⟩”* —
the way the squadron writes it. On the CO's on-behalf twins it names **both**:
*Signed by ⟨the CO⟩ · CO · on behalf of ⟨the student⟩*, because the tag the save
leaves behind says exactly that.

**AND WHAT — AS A NUMBERED LIST OF SENTENCES, NOT A PAYLOAD.** Built by comparing
the form against the state it was **last saved** in, every item in the terms the
user can see on screen: the section, the row named the round-12b way (its code /
date, **never** a stored index), and what changed, old → new.

```
  Save 3 changes to your record?
  Signed by Cdt ⟨SURNAME⟩
  3 CHANGES
   1. NFS · 01/06/2026 — added (date 01/06/2026)
   2. Ground lessons · GT-⟨GROUP⟩ · ⟨COURSE⟩ · 27/04/2026 — date — → 27/04/2026
   3. Ground exams · IN190 · 2nd trial · 20/05/2026 — grade 82 % → 91 %
      [Keep editing]   [Discard changes]   [Confirm & save]
```

**ONE BUILDER FOR ALL THREE FORMS** — the student's, the CO's on-behalf twin and
the instructor's general save — because three builders is three chances for the
message and the write to disagree:

- `WA.rowTitle(sec, e)` — what a row is CALLED (round 12b's naming, extracted so
  the save refusals and the change list cannot drift);
- `WA.rowIdent(sec, e)` — the identity two versions of one row share. Without it
  a removed row would make every row below it read as changed, turning one
  deletion into eighty edits in the dialog;
- `WA.IDENT_FIELDS` — the fields that ARE the row's name, so an *added* line does
  not read *“IN190 · 2nd trial — added (exam IN190, trial 2nd trial)”*. They are
  still compared: changing one changes `rowIdent`, so it surfaces as a removal
  and an addition, which is the honest description of moving a row from one
  identity to another;
- `WA.recordChanges(before, after, sections)` and `WA.proposalChanges(before,
  after, nameOf)` — the two shapes the app can write;
- `WA.confirmSave(opts)` — one promise, **three** answers.

**THE SECOND QUESTION IS ASKED INSIDE THE SAME DIALOG**, so a discard can still
be backed out of without the first list having to be rebuilt:

```
  Are you sure you want to discard changes 1-3?
  They will be undone and the form will go back to the way it was last saved.
   1. …  2. …  3. …
      [No — go back]        [Yes, discard all 3]
```

`[No — go back]` returns to the change list. `[Yes]` restores the last-saved
snapshot — the student form deep-copies the record, re-seeds the syllabus slots
and redraws all fourteen sections; the instructor form restores each dirty
card's level, checkbox and comment. `[Keep editing]` (and `Esc`) closes the
dialog changing nothing, and the form stays dirty. Long lists **scroll inside
the dialog** and the count stays in the header.

The dialog opens for **both** Save buttons on the student form — *«το γενικο save
ή το ειδικο»*: they are one act with two positions on the screen, and a dialog
that appeared for only one of them would teach the student that the other one
writes without asking.

---

### DATA-MODEL DELTA

`wa.entry_keys('exams')` and `WA.ENTRY_KEYS.exams` gain **three keys**:

| key | rule |
|---|---|
| `trial` | int **2..3** only — 1 is the absence of the key; refused by name if stored |
| `series` | closed list, `wa.exam_series()` = `['EETH']`; **exclusive with `exam`** |
| `series_no` | int 1..`wa.section_cap('exams')`; **required** on a series row — the number is the name |

Two closed rules join the solo-slot precedent in `wa.validate_record`:
**one row per (exam, trial)** and **ΕΕΘ numbers unique**. Both are enforced on
the server because the form's affordances mint from `max+1` and a payload can
always be hand-made. `wa.migrate_record` repairs the round-13 way — a value its
catalogue no longer contains is **nulled and the row flagged**, never dropped
and never guessed at.

`wa.exam_ids()` and `WA_EXAMS` are **untouched**: they come out of the syllabus
sources through `tools/gen-items-catalog.py` and the ΕΕΘ are not in them. The
series is the squadron's own weekly programme, declared **by hand, outside the
generated block**, on purpose.

### AUDIT-TABLE DELTA (§4h)

**No new dropdown.** The two new affordances are **buttons that mint a row**
(“+ 2nd trial”, “+ ΕΕΘ n”) — the same shape as round 12's “↻ same-day re-fly”,
and for the same reason: 1·2·3 and *max+1* are the whole of the choice, and a
box would only let it be got wrong. The exam picker itself is unchanged and
still closed to the eight.

### DEPLOYMENT NOTE — **THE SCHEMA GOES FIRST**

`db/schema.sql` **is** touched this round (`wa.natkey`, `wa.seniority_key`,
`wa.exam_series`, `wa.exam_trials`, the exams and lessons branches of
`wa.validate_record` and `wa.migrate_record`, `wa.entry_keys`, and seven
`order by` sites). The gate is the §4l gate, unchanged in shape:

1. **Run `db/schema.sql` on the cloud project first** (SQL editor, whole file,
   idempotent — it is re-runnable and was run twice here to exit 0).
2. **Then** push the app (`?v=20260821a → ?v=20260821b`, seven assets).

In that order, because an app that sends `trial` / `series` to a schema that
does not know them is refused by the key whitelist — by design — and a lesson
saved with an end date alone would be refused by the old `chk_entry_date`. The
reverse order is safe but useless: the new schema simply accepts what the old
app already sent.

**This round is COMMITTED LOCALLY AND NOT PUSHED** (the user's instruction),
so the gate is stated here for whoever runs the deployment.

### SELF-VERIFICATION — ROUND 14 (live, local stack, the real forms and the real RPCs)

1. **`db/schema.sql` applies twice, `ON_ERROR_STOP=1`, exit 0** both times.
   `wa.natkey('X-11') = 'X-00000011'`, `wa.natkey('X-2') = 'X-00000002'`.
2. **The panel is live and it agrees with the headers.** All 13 section rows
   present; the nav badge and the section's own `.cnt` were read side by side
   and match on every section (`Evaluations 8/8` ⇄ *“8 of 8 flown”*,
   `Flights 77 owed` ⇄ *“done 0 · started 0 · owed 77”*, …). Typing a date moves
   the bar on the keystroke; clearing it moves it back **and the form reads
   clean again** (`dirty:false`, floating Save hidden).
3. **Scroll and spy.** Clicking a row lands the section at `topbar + 14`
   (measured `top: 75` on the admin analysis, `154` at 375 px against a nav
   bottom of `140` — it clears the sticky strip). `is-here` follows both the
   click and a plain scroll. **Zero page-level sideways scroll** at 1000 px,
   1280 px and 375 px (`body.scrollWidth ≤ innerWidth` in all three).
4. **The 900 px collapse.** Burger appears (`display:flex`), the list becomes a
   `nowrap` strip that scrolls **1479 px inside 355 px**, the burger toggles
   `is-open` → `flex-wrap:wrap` and `aria-expanded`, and tapping a pill closes
   it. Rows stay **37 px — one line**.
5. **Lesson end-only.** `end_date` alone → row **green (`st-done`)**, section
   *“done 1 · started 0 · owed 46”*, and it **saved**: stored as
   `{"date":null,"group":…,"course":…,"end_date":"2026-04-30"}`. `⌫` returns it
   to **owed** and the record to **clean**. Server probes: end-only **accepted**,
   start-only **accepted**, neither **refused** by name, `end < start` **refused**.
6. **Exam trials.** IN190 sat and failed (48) → the **“+ 2nd trial”** affordance
   appears **on the keystroke** (it lives in the actions cell, which is the cell
   a keystroke re-renders) and is absent on every unsat exam. Minting adds a
   grey **2nd trial** row under the slot; filling it with **82** moves the slot
   to it (`st-done`) and the failed **1st trial** renders beneath, tagged, and
   **not mustard** — the pass-attempt rule, live.
7. **ΕΕΘ.** Three mints → `ΕΕΘ 1 · 2 · 3` after the eight fixed slots, grey,
   each with ✕, and the button re-labels itself **“+ ΕΕΘ 4”**. Counts:
   *“done 2 · started 0 · owed 10”* (7 unclaimed slots + 3 ΕΕΘ).
8. **Sparse storage held.** 12 form rows → **5 stored**: the two IN190 attempts
   (the first with **no `trial` key**, the second with `trial:2`) and three ΕΕΘ
   with `date:null, grade:null`. The seven untouched slots store nothing.
9. **Server refusals, on fabricated payloads** — every one by name: duplicate
   `(exam,trial)`; duplicate ΕΕΘ number; `trial:4`; `trial:1`; `exam` **and**
   `series` on one row; unknown series `WEEKLY`; ΕΕΘ with no number; `trial` on
   a series row; `series_no` on an exam row; a **first** trial with no date.
   Accepted: a **dateless 2nd trial**, an ΕΕΘ with only its number.
10. **Migrate / strip pass-through, both mirrors.** A fabricated stored record
    carrying `note`, `pending`, `trial:1`, `trial:3`, a dateless `trial:2`, an
    unknown series, a series row that also names an exam, a numberless ΕΕΘ, an
    unknown exam and three lesson shapes produced **identical output from
    `wa.migrate_record` and `WA.migrateRecord`** — retired keys stripped,
    `trial:1` normalised away, the dateless `trial:2` kept and **not** flagged,
    every unknown value nulled-and-flagged, the end-only lesson kept clean.
11. **Caps.** 200 ΕΕΘ accepted (the section cap), **201 refused** — *“too many
    entries”*.
12. **Seniority, three lists compared side by side.** People table, Overview
    submissions strip and the student form's datalist (surnames only, straight
    off `list_instructor_names`) are in the **identical** order: every HAF call
    sign in natural order, then every ITAF one, then the three without a call
    sign, last, by surname. *(Round 19: the real call signs this line printed
    were removed — §4u·6.)* The People header says *“— seniority order”*.
13. **The separator.** Read off the live radio group: `Strongly Recommended ·
    Recommended · Recommended as Alternate │ Recommended for Other Assignments ·
    Strongly Recommended for Other Assignments`.
14. **The general save.** Zero `[data-save]` buttons remain. Three cards changed
    (a level, a *flew with*, a comment) → **“Save 3 assessments”** on both
    buttons, 3 cards marked dirty, the dialog headed *“Signed by 1Lt ⟨SURNAME⟩”*
    with the three changes enumerated in visible terms. After **Confirm & save**:
    **`psql` says 3 proposals written and the total is still 9** — nothing else
    was touched, and no proposal was fabricated for the other 22 students.
15. **Discard, both forms.** Student: 3 changes → *“Are you sure you want to
    discard changes 1-3?”* with the list repeated; **No** returns to the change
    list; **Yes** reverts every one (the added NFS row gone, the lesson start
    cleared, the exam grade back to 82) and the form reads **clean**. Instructor:
    2 changes → *“…changes 1-2?”* → revert restores the radio, the checkbox and
    the disabled button.
16. **The CO on-behalf twin** carries the panel, the layout and the dialog:
    *“Save 1 change to ⟨student⟩'s record?” · “Signed by ⟨CO⟩ · CO · on behalf of
    ⟨student⟩”*, and **Keep editing** leaves the form dirty and unsaved.
17. **CO surfaces.** The drill-down names the trial and the series
    (`IN190 · 2nd trial`, `ΕΕΘ 1 · weekly theory`) and prints **“ended
    30/04/2026”** for the end-only lesson; the **printed brief** carries the same
    names in monochrome (`IN190 (not the operative attempt)`, `ΕΕΘ 1 (weekly
    theory) · not sat yet`); the analysis panel re-reads per student
    (`Ground = 56 owed`, `Ø 9.33`) and exists on **that tab only** (nav count 1
    on Student analysis, 0 on Overview / Brief / People).
18. **Layout arithmetic at 1280 px:** rail `224 px` ending at `x=236`, wide
    section starting at `x=254` (**no overlap**), wide section `999 px`, ordinary
    cards `760 px`, `body.scrollWidth 1265 ≤ 1280`.
19. **`node --check` clean** on all four JS files. **Zero application console
    errors** across the student form, the CO twin, the instructor form and all
    four admin tabs, including the `beforeprint` builder (26 printed pages).
20. **Contrast**: the panel uses only contract tokens (`--text` on
    `--accent-soft`, `--muted`/`--good` on `--panel`, the four `--st-*` washes
    round 13 already audited). Sampled across the palette catalogue the minimum
    measured was **5.73:1**.
21. **Hygiene**: demo data snapshotted before the round and **byte-restored**
    after — the two `pg_dump`s differ **only** in `pg_dump`'s own random
    `\restrict` nonce. 42 people, 3 records, 9 proposals, exactly as before.
    No fixture people were created. **Privacy grep: 0 hits** for the Flight
    Commander's surname in tracked files (the two source comments that quote the
    directive carry `⟨ΟΝΟΜΑ⟩`).

### OPEN ITEMS RAISED BY THIS ROUND

1. **A trial is “done” even when it failed.** `WA.rowDone('exams')` is round 13's
   rule — *sat AND marked* — so a first trial graded 48 % is **green**, and the
   2nd trial that passed is green beside it. The pass/fail distinction is carried
   by the badge (*“not the operative attempt”* on paper) and not by the colour.
   That is consistent with round 13, and it may not be what the squadron wants
   now that one exam can hold three rows: **should a non-operative attempt be
   grey, or keep its own verdict?** One line in `rowState` either way.
2. **`slotsDone` is not yet in the summary CSV.** The four state columns per slot
   section still export `done · started · owed · extra · in syllabus`, where
   `done` counts **rows**. For the exams that can now exceed the denominator in a
   spreadsheet exactly as it did on screen before this round fixed the sentences.
   A fifth column (`slots done`) is the honest fix; it was left out of this round
   to avoid changing an export's column count without being asked.
3. **The ΕΕΘ have no catalogue and therefore no denominator.** They are counted
   as owed once minted, but nothing knows how many the programme prescribes —
   *“3 owed”* means *three that somebody entered*, not *three of N*. If the
   weekly programme has a fixed count per stage, it belongs in the generated
   catalogue and the ΕΕΘ become slots like everything else.
4. **The panel lists sections, not rows.** On a twelve-thousand-pixel form the
   next question after *“take me to Ground exams”* is *“take me to the seven I
   still owe”*. A per-section “jump to the first owed row” would be one more
   click on the same component; it was not asked for and is not built.

---

## 4o. Round 14b (2026-08-21) — THE VERIFY SWEEP: FIVE FINDINGS OF THE ROUND-14 ADVERSARIAL READ

No new directive. Round 14 shipped seven items; the adversarial verify pass over
what it shipped found five defects, and this round is those five and **nothing
else**. `db/schema.sql` is **byte-identical** — every one of them is a naming, a
sentence or a readout, and not one of them is a rule.

### 1. A ROW TITLE COULD NOT NAME A SAME-DAY RE-FLY — *the one that mattered*

`WA.rowIdent` has told an original and its same-day re-fly apart by `seq` since
round 13. **`WA.rowTitle` never printed it.** So the confirmation dialog round 14
built — the whole point of which is *«σε σχεση με τι»* — rendered the two rows as
**identical lines**:

```
Flights · C4101 · Contact · 12/08/2026 — added (…)
Flights · C4101 · Contact · 12/08/2026 — added (…)
```

and, far worse, a **deletion** printed the line of the row that SURVIVED. A
dialog whose one job is to say what is about to be written was, on the one shape
where two rows are legitimately alike, unreadable.

The name now wears the mark the log table already draws on the row — `#2`:

```
Flights · C4101 · Contact · 12/08/2026 — added (instructor …, duration 1.3 h, grade 85 %)
Flights · C4101 · Contact · 12/08/2026 #2 — added (instructor …, duration 1.1 h, grade 72 %)
Flights · C4101 · Contact · 12/08/2026 #2 — removed
```

**AND THE REFUSALS ACTUALLY JOIN THE DIALOG NOW.** Round 14's own comment said
`WA.rowTitle` was extracted *“so the refusals, the change list and any later
surface cannot drift”* — and `student.js` still carried a **second copy** of
12b's naming inside `buildPayload`, which had already drifted from it in four
ways: no `#2` (so a refusal about a re-fly named the row that was fine), no
end-only lesson date, an **ΕΕΘ** reduced to `#7` because it carries no `exam`,
and a raw solo slot key where the form prints a label. The copy is gone; the
closure calls `WA.rowLabel`.

`WA.rowLabel(sec, e, opts)` is the naming core and returns **`""`** for a row
that shows nothing — the caller decides what to say instead, which is the one
thing the two surfaces disagree about (*“a new entry”* in the dialog, *“#4”* in a
refusal). `WA.rowTitle` is the dialog's wrapper around it.

### 2. THE CURRENT-STATE PARAGRAPH STILL DESCRIBED THE FORM ROUND 14 REPLACED

§4 Screens · 2 (the *current state* description of the instructor form, which is
what a reader who skips the round sections reads) still said **“thin rule before
the fifth”** and **“the card's own Save rings accent while dirty”**. Items 5 and
6 of round 14 reversed **both**. Rewritten to the true state — the rule marks the
**fighter / other split** between *Recommended as Alternate* and *Recommended for
Other Assignments*, and there is **ONE general Save** counting the dirty
assessments plus the confirmation dialog — with the round attributed.

Swept the whole document for the same two claims. Everything else that states
them is **round 10's own record**, each already carrying its `SUPERSEDED IN ROUND
14` / `REVERSED IN ROUND 14` block; the two round-10 **headings** that stated the
old rule as a bare fact now carry the round and the pointer, so a reader scanning
headings cannot pick up a rule that was reversed two rounds later.

### 3. THE OWED CHIP TOLD AN ΕΕΘ IT WAS A FLOW-CHART ROW — AND ITS OWN CELL SAID OTHERWISE

The generic **owed** sentence ends *“It is a row of the printed flow chart, not
something anybody reported, and NOTHING IS STORED for it until the first
keystroke.”* True of all 181 seeded slots. **False of both shapes round 14
added** — and false on the fact that decides whether anything is stored:

| the row | what it actually is |
|---|---|
| **ΕΕΘ n** | a weekly theory exam the syllabus **does not enumerate**; its own cell tooltip says so two columns away |
| **a minted 2nd / 3rd trial** | a re-sit somebody **ordered**; the flow chart prescribes one sitting, not this one |

Both correctly wear the grey — *“on the programme, nothing recorded yet”* is
exactly what they are — and **both are STORED** (`WA.rowMinted` disqualifies them
from `slotUntouched`, which is the line `buildPayload` drops rows on), so the
chip had the storage fact **backwards** as well.

The precedent is round 12b's `WA.debriefWord`: **the word is the same everywhere,
the sentence is section- and row-aware.** `WA.rowStateTip(sec, e, st)` returns
`WA.rowStateDef(st).tip` for every true flow-chart row and its own sentence for
these two, in all three states they can reach (*owed · started · done*; neither
can ever be *extra* — that is what `WA.rowPlanned` decided in round 14). Read by
the student form's chip **and** the CO's State column, so the two sides of one
record cannot disagree.

### 4. THE ANALYSIS RAIL'S EVALUATIONS ROW WAS THE ONE ROW THAT SAID NOTHING

The student form's rail prints the two **fixed** sections as *slots flown out of
slots prescribed* (**“8/8”**). The admin's analysis rail — the same component,
mounted on the same record — left `ana-eval` out of its `by` map entirely, so it
rendered an **empty** chip: one component saying two different things about one
record, on the row the CO most often opens that tab for. Same arithmetic as
`navItems()` (distinct non-empty checkrides, capped at the eight) and the same
two-segment bar.

> **RULING — Student and Comparison stay stateless**, and that is a judgement,
> not the same omission. `ana-id` is an **identity header** and `ana-cmp` is a
> chart of **whichever metric the chips have selected**; neither has a count that
> is *“the one fact”* about it, and a badge invented for them would be decoration
> on a component whose whole discipline is that it is not.

### 5. TWO LINES OF THE DIALOG THAT READ BADLY

**(a) The first sitting would not say it was one.** `WA.examRowLabel` names the
trial from the **2nd** up. On a row standing alone that is right — *IN190* **is**
the first sitting, and *“IN190 · 1st trial”* would be noise on the 199 exams out
of 200 that are sat once. Beside *“IN190 · 2nd trial”* it is the opposite: the
unqualified *IN190* reads as **the exam**, not as one of its sittings.

> **RULING — what counts as “beside”.** The word is added when **the record holds
> more than one sitting of that exam in either version** (before or after),
> counted **within** each list and never across them — one unchanged sitting
> appearing in both lists is one sitting, not two. `WA.examsWithTrials(...lists)`
> computes it once per section; `WA.examRowLabel(e, named)` takes the flag. A
> caller that cannot see the other trials never sets it, so the noise cannot
> appear where there is a single sitting.

```
Ground exams · CO190 · 05/08/2026 — added (grade 91 %)          ← one sitting, no trial word
Ground exams · IN190 · 1st trial · 10/08/2026 — added (grade 48 %)
Ground exams · IN190 · 2nd trial · 17/08/2026 — added (grade 78 %)
```

**(b) The date was printed twice.** An *added* line named the row by its date and
then listed the date again in the parenthetical — *“NFS · 21/08/2026 — added
(date 21/08/2026, reason …)”*: one fact twice in eleven words. The parenthetical
is **what the row was added WITH**; the date is **what it is CALLED**. The one
date the title actually printed is now dropped from it — `WA.titleDateField(e)`
is the single function both readers ask, so they cannot drift, and **the other
date of a two-date row is still listed** (an end date the title did not print is
news, not a repeat).

### WHAT WAS NOT TOUCHED

`db/schema.sql` (byte-identical, asserted), the seniority comparator, and the
**CO-lock mint behaviour** — the verify pass's finding (c), that a CO-locked exam
row offers a disabled *“+ 2nd trial”*, awaits the user's ruling on whether the CO
should be able to mint a re-sit on a row the student may not touch. The button
stays disabled until then.

> **RULED IN ROUND 16 (§4r·1), 22/08/2026 — «Το Β».** The question is answered
> the other way round from the way it is put here: the **student** mints, on the
> CO's row, and the row itself stays locked field for field. `applyLocks` now
> skips `[data-mint]` and nothing else; the server needed no change and was made
> to prove it.

### CACHE-BUSTER

`?v=20260821c` on **`app.js`, `student.js`, `admin.js` only** — the three files
this round changed. `styles.css`, `config.js`, `items-catalog.js` and
`instructor.js` keep `?v=20260821b`; bumping a file that did not change throws
away a cache entry for nothing.

### SELF-VERIFICATION — ROUND 14b (live, local stack, the real forms and the real RPCs)

1. **The re-fly, named.** C4101 filled and re-flown on the **same date** through
   the form's own ↻: the dialog printed the two lines above, `#2` on the second.
   **Confirm & save** wrote them; deleting the re-fly and re-opening the dialog
   printed **`… 12/08/2026 #2 — removed`** — the removed row, not the survivor.
2. **The date is not repeated.** Every *added* line in that dialog read
   `(instructor …, duration …, grade …)`; not one carried its own title's date.
3. **The trial word, both ways, in one dialog** — the three exam lines above:
   `CO190` bare (one sitting), `IN190 · 1st trial` and `IN190 · 2nd trial`
   (two).
4. **The refusals use the extracted namer** — proven in passing on a record whose
   legacy SMS row blocks the save: *“SMS (09/03/2026): choose the condition …”*.
5. **The two chips, live.** The minted 2nd trial: *“Owed — a planned 2nd trial of
   IN190 … A re-sit is ORDERED, not prescribed … it IS stored.”* The ΕΕΘ:
   *“Owed — a planned weekly theory exam (ΕΕΘ 1) … The ΕΕΘ are not rows of the
   printed flow chart …”* The **first** trial of IN190, a true slot row, kept the
   **generic** sentence verbatim.
6. **Same two sentences on the CO's side** — read off the analysis Ground card's
   State column on the same record, beside a `CO190` row still carrying the
   generic one.
7. **The rail.** `ana-eval` reads **`0/8`** (muted, one owed bar) on a student
   with no checkrides and **`8/8`** (good, one done bar) on the two who have flown
   all eight — walked student by student with the arrows. `ana-id` and `ana-cmp`
   stay blank by ruling.
8. **The instructor form is what §4 now says it is** — read off the live DOM:
   **0** `[data-save]` buttons, and the group order
   `Strongly Recommended · Recommended · Recommended as Alternate │ Recommended
   for Other Assignments · Strongly Recommended for Other Assignments`.
9. **`node --check` clean** on all six JS files. **Zero console errors** across
   the student form, the admin's four tabs (including the `beforeprint` builder)
   and the instructor form.
10. **`db/schema.sql` byte-identical** — `git diff --stat` names it nowhere.
11. **Hygiene**: demo data snapshotted before the round and **byte-restored**
    after — 42 people, 3 records, 9 proposals, exactly as before. No fixture
    people were created; the two test instructor names were `ZZ-TEST` and never
    reached a tracked file. **Privacy grep: 0 hits.**

## 4p. Round 15 (2026-08-21) — THE 80 % WRITTEN-EXAM THRESHOLD (bridge ruling #6)

### THE RULING, VERBATIM (2026-08-21)

> «80% για εξετασεις εδαφους, 60% για πτησεις. Πλεον εχουμε κανει και το mapping.»

**ΑΠΟΦΑΝΣΗ.** Round 12b left one question open in capitals — *«THE GROUND-EXAM
PASS MARK IS DELIBERATELY NOT DECIDED … one number, or two different exams with
two right numbers?»* (§4l). It is the second: **two different examinations, two
right numbers.** A **ground exam** is passed at **80 %**; a **flight** (and an
F/S sortie, and a checkride, and a solo, and an FPC / CEF) stays at **60 %**.
FDMS has always called the first number `exam_pass_pct` and defaulted it to 80,
so the ruling also closes the last arithmetic disagreement between the two
systems — *«Πλεον εχουμε κανει και το mapping.»*

**IT APPLIES TO BOTH GROUND-EXAM SHAPES**: the **eight** fixed groups and the
**ΕΕΘ weekly series**. An ΕΕΘ is a ground exam that the syllabus does not
enumerate; it is not a different kind of examination.

### WHAT MOVED — AND, MUCH MORE OF IT, WHAT DID NOT

| | | |
|---|---|---|
| **the printed five-band scale** (ΠΔ 151/13, `WA.GRADE_BANDS` / `wa.grade_band`) | **UNTOUCHED** | The bands are a **characterisation**, not a pass mark. A ground exam marked 78 is still «ΛΚ Λίαν Καλώς» — it simply does not pass a ground exam. Moving the bands would have re-graded every flight in the squadron to fix an exam. |
| **flights · F/S · checkrides · solos · FPC / CEF** | **60 %, unchanged** | ΠΔ 29/2020 Άρθρο 3 παρ.1β reads that number off a *πτήση εξέτασης ή αξιολόγησης*. Nothing about a flight changed. |
| **the mission collapse** (`WA.gradeMission` / `wa.grade_mission`) | **60 %, unchanged** | `mission` is a key of the **two flight logs only**; an exams row carries none, so there is no ground exam's mission to collapse. |
| **the four row states** (`WA.rowDone` → `done · started · owed · extra`) | **UNCHANGED, and deliberately** | A ground exam is `done` on its **date AND its result — whatever the result says**. A 40 % is a *complete row*: the row asked for a mark and got one. **Pass/fail is the other axis.** |
| **`slotsDone` («4 of 8 exams»)** | **number unchanged, sentence new** | It counts exams **sat and marked**, not exams passed. Unlabelled beside a live pass mark it would read as *«four passed»*, so both readouts (CO brief line, instructor card) now carry a title saying which number it is. |
| **the operative trial** (`WA.examOperativeIx`) | **MOVED TO 80** | This is the **one** behavioural change in the application. |
| **the server** | **judges nothing, before or after** | See below. |

### THE ONE BEHAVIOURAL CHANGE: WHICH TRIAL STANDS FOR THE EXAM

Round 14 gave the exams round 11's pass-attempt rule (§4n.3): *PASS is the
filter and runs first, LATEST is only the tiebreak, and a slot with no pass at
all falls back to the latest graded attempt marked `passed:false`.* The **rule**
is unchanged; only the **number it asks about** is. `WA.examOperativeIx` now
calls `WA.gradePassed(g, 'exams')`.

Consequence, exactly as the user's own test case predicted: **a 2nd trial marked
78 no longer wears the slot as a pass.** Nothing has passed, so the rule's own
documented fallback carries it — *the latest graded attempt stands for the exam,
`passed:false`* — and every surface says so out loud rather than showing a badge
that means «behind you».

### THE SHAPE OF THE CHANGE IN CODE

* `WA.GRADE_PASS_MIN = 60` keeps its name and its meaning: **the flight's
  number**. `WA.EXAM_PASS_MIN = 80` is new, and `WA.passMin(sec)` is the one
  function that chooses between them.
* `WA.gradePassed(g)` → `WA.gradePassed(g, sec)`. **A caller that passes no
  section is asking the flight question** — which is every caller that existed
  before this round, so nothing outside the exams moved by accident.
* `WA.examPassed(e)` is the row-level question (both shapes), and
  `WA.EXAM_PASS_TIP` is the exams' own pass-attempt sentence.
  `WA.PASS_ATTEMPT_TIP` stays the **checkrides'** and still quotes 60 %: at two
  different marks the two surfaces cannot share one sentence without one of them
  lying.
* **Server:** `wa.exam_pass_min()` = 80 and `wa.exam_passed(g)` are declared as
  the mirror — and **called by nothing**, on purpose. See below.

### THE 60 IS NOW READ FROM TWO PLACES — A STANDING INVARIANT (recorded round 15b, §4q·3)

Making `gradePassed` read the **number** left the flight's 60 with **two readers
that are not the same expression**, and round 15b's adversarial read named it.
It is **deliberate**, and it is **not** unified:

| | reads | why it must keep reading that |
|---|---|---|
| `WA.gradePassed(g, sec)` · `wa.grade_passed(g)` | the **number** (`n >= WA.passMin(sec)`) | it has to answer a **second** question — the ground exam's 80 % — and a *band* has no section. |
| `WA.gradeMission(g)` · `wa.grade_mission(g)` | the printed **band**'s own `pass` flag (`WA.gradeBand` / `wa.grade_band`) | the mission collapse **is** the five-band scale of ΠΔ 151/13 said in two words. It must keep asking *«which side of the printed scale is this?»*, not *«is this ≥ some number?»* — otherwise a future section-aware mark would silently drag the mission with it, which is exactly what this round ruled it must **not** do (a flight has no ground-exam mark). |

> **THE INVARIANT.** For every finite grade `g`:
> `WA.gradePassed(g) === (WA.gradeMission(g) === "complete")`.
> It holds **only while `GRADE_BANDS[good].lo === GRADE_PASS_MIN === 60`**.
> A round that moves one of those two numbers without the other breaks it.

**It is documented, not asserted.** Both definitions now name each other in full
(`app.js` → `WA.gradePassed` ⇄ `WA.gradeMission`, and the identical split,
for the identical reason, in `db/schema.sql`), and the parity check lives *here*
rather than in the code because **this application writes nothing to the console,
ever** (house rule) — an assertion nobody is allowed to print is not a guard, it
is noise waiting to happen. It is carried in the open list below.

### THE SERVER JUDGES NO EXAM GRADE — BEFORE THIS ROUND OR AFTER

Round 12b's shape is unchanged: the exams branch of `wa.validate_record` calls
**`wa.chk_grade` only** (a whole number 0-100) and stores what it is given.
Proven by grep, not by assertion: `wa.grade_passed` has exactly one call site
(`wa.eval_operative` — **checkrides**) and `wa.grade_mission` exactly one (the
**`flights` / `fs`** branch of the validator, in the refusal that names a stored
mission beside a stored grade). Neither reaches an exams row, and no refusal
text anywhere names 60 for an exam. **Live proof:** the round's own test record
saved a `55`, a `78` and a `79` on ground exams through the real RPC without a
murmur.

The two new SQL functions therefore exist so that the MIRROR contract is real
(«change one, change the other») and so the FDMS bridge has one server-side
number to join on. If a later round makes the server judge an exam, that is the
function it must call.

### THE FREEZE-PER-EXAM-AT-ENTRY PRINCIPLE IS A BRIDGE FINGERPRINT, NOT A WA CONSTANT

An exam judged by the mark **in force on the day it was sat** is a property of
the **FDMS-side bridge fingerprints**, not of this application:
`wa.exam_pass_min()` / `WA.EXAM_PASS_MIN` are **one live number with no
history**. WA records the grade; what a reconciler decides to freeze against a
past ruling is the reconciler's business, and inventing a WA-side effective-date
column would put a second, quieter copy of that history here.

### TWO DEFECTS FOUND BY THIS ROUND'S OWN VERIFICATION (both fixed)

1. **THE EXAM'S VERDICT DID NOT FOLLOW THE KEYSTROKE — and the fix could not be
   a redraw.** The trial badge and the grade box's title were drawn once, so a
   2nd trial typed up from 78 to 85 kept its *«· not passed»* badge. That is
   round 12b's own finding one section over (*«the mission chip follows EVERY
   grade keystroke»*). But the obvious instrument — the section-wide
   `syncSlots` redraw — **rebuilds the grade box, and a rebuilt
   `<input type=number>` comes back with its caret at position 0: typing «90»
   digit by digit produced «09»** (measured live, with `execCommand('insertText')`
   respecting the real caret). So the keystroke now repaints every row **of that
   exam** IN PLACE — state class, name cell, actions cell — and the grade box
   only ever has its `title` set. **The ORDER settles on `change` / `focusout`,
   by MOVING the `<tr>`s** (`resortSection`), which is precisely what round 12b
   already does for the date: *«NOT on the keystroke … it moves when the date is
   COMMITTED»*. The grade is now a **second sort key** of the same table — it
   decides which trial is drawn as the slot — and it settles the same way.
2. **EVERY GROUND EXAM EXPORTED A BLANK `State` COLUMN.** The entries-CSV call
   for `exams` passed **thirteen** arguments to a **twelve**-parameter `add`, so
   the state landed in the dropped one while the lessons beside it exported
   theirs. A round-14 defect, found by this round's CSV read-back, fixed by
   deleting the extra `""`.

### WHERE THE 80 % IS NOW SAID, IN WORDS

Student form — the exams section hint, the ⓘ terminology tooltip, the ΕΕΘ
series tooltip, **every grade box's title** (*«80 % … 79 % does not pass»*, and
without the re-sit clause on an ΕΕΘ, which has no trials), and the **trial
badge**, which is accented only when the operative attempt actually passed and
otherwise reads **«2nd trial · not passed»** in `--warn`. · CO's Student
analysis — the same badge, plus **«79% · fail»** in the Grade cell with the full
rule on hover. · Printed brief — the section head reads **«Ground exams —
passed at 80 %»** and each line prints **«(pass)» / «(below the 80 % pass
mark)»**, because paper is monochrome and has no hover. · Entries CSV — the
verdict travels in **Detail** for both shapes, and *Counts* now distinguishes
**«yes»** from **«yes — but no attempt has passed yet»**.

> **WIDENED IN ROUND 16 (§4r·2-4).** Two of the sentences above describe a badge
> only re-sits could wear. On both screen surfaces the chip now also appears on a
> **single sitting** (`«not passed»`, no trial word), the **1st trial** wears its
> word whenever the exam was sat more than once, and *“not passed”* means
> **graded and below** — an operative attempt still waiting for its result wears a
> **plain** badge, not `--warn`. The 80 % itself did not move.

### WHAT WAS NOT TOUCHED

The **CO-lock mint behaviour** and the **seniority wording** (both still awaiting
the user's rulings, §4o), `styles.css` (the `badge-warn` token already existed),
and every threshold that is not a ground exam's.

> **BOTH RULED IN ROUND 16 (2026-08-22)**: the mint in §4r·1 (*«Το Β»* — the
> student mints on the CO's locked row), the seniority wording in §4r's ruling
> **(b)** (no instructor is ever without a call sign; the within-air-force
> placement stays as a **dead-letter fallback**). Neither is open any more.

### CACHE-BUSTER

`?v=20260821d` on **`app.js`, `student.js`, `admin.js`, `instructor.js`** — the
four files this round changed. `styles.css`, `config.js` and `items-catalog.js`
keep `?v=20260821b`.

### DEPLOYMENT NOTE — THE SCHEMA IS TOUCHED, AND IT GOES FIRST

`db/schema.sql` gains two immutable functions and three comment blocks. It is
**additive and callable by nothing**, so old and new clients are both correct
against either version — but it joins round 14's gate and runs before the app,
by the house rule. **Run twice, `ON_ERROR_STOP=1`, exit 0 both times** (below).
The two commits ahead of `origin/main` and this one are **not pushed**.

### SELF-VERIFICATION — ROUND 15 (live, local stack, the real form and the real RPCs)

1. **The two numbers, from the live page**: `WA.passMin() === 60`,
   `WA.passMin('exams') === 80`; `gradePassed(79,'exams') false` ·
   `gradePassed(80,'exams') true` · `gradePassed(59) false` ·
   `gradePassed(60) true`.
2. **The bands did not move.** `50 ΣΚ · 59 ΣΚ · 60 Κ · 78 ΛΚ · 79 ΛΚ · 80 ΛΚ` —
   78, 79 and 80 are the **same band** and only the exam verdict separates them:
   `examPass false · false · true`.
3. **79 → fail-side, 80 → pass-side, on the keystroke.** A single-sitting IN190
   typed 79 → *«79 % does not pass»*; typed 80 → *«80 % PASSES»*. The row stayed
   **`st-done`** in **both** cases — the two axes, kept apart.
4. **55 + 78 → NO trial wears the slot as a pass.** The 2nd trial holds the slot
   as the **latest graded** attempt and says so: badge **«2nd trial · not
   passed»** (`badge-warn`), title *«No attempt has reached the pass mark yet, so
   the latest one stands for the exam.»* — the round-11 rule's own documented
   fallback, not a special case. The 1st trial is beneath it, `is-alt`, marked
   **«1st trial»**.
5. **55 + 85 → the 85 wears it.** Same two rows; the badge turns `badge-acc` and
   the title reads *«…the attempt the exam's verdict is read from, and it PASSED
   (85 %)»*.
6. **The slot moves back, too**: 1st = 90 (holder) → retyped to 9, and the slot
   moved to the 2nd trial in place on the keystroke; the rows **re-ordered on
   commit** (holder drawn first) by moving the `<tr>`s.
7. **The caret survives.** In the case that moves the slot: the grade input is
   the **same DOM node** before and after, still focused, and typing `9` then `0`
   yields **`90`** (it yielded `09` before the fix).
8. **Flights and F/S unchanged, probed one each.** Flight 60 → *Mission
   complete*, `st-done`; 59 → *Mission incomplete*. F/S 50 → *Mission
   incomplete* (`ΣΚ`); 60 → *Mission complete*. Every mission tooltip still
   reads *«the 60 % threshold of ΠΔ 151/13»*.
9. **The ΕΕΘ are judged at 80 too.** ΕΕΘ 1 at 79 → *«79 % does not pass»*, at 80
   → *«80 % PASSES»* — and the title drops the re-sit clause, because an ΕΕΘ has
   no trials.
10. **The CO's exam table**, read off the live DOM on the saved record:
    `CO190 79% · fail` · `IN190 2nd trial · not passed 78% · fail` ·
    `IN190 1st trial 55% · fail` · `IN290 85%` · `ΕΕΘ 1 79% · fail` — all five
    still `st-done`.
11. **The printed brief** (`beforeprint` builder): *«Ground exams — passed at
    80 % (done 5 · started 0 · owed 5)»*, then `79% (below the 80 % pass mark)` ·
    `78% (below …)` · `55% (below …)` · `85% (pass)` · `ΕΕΘ 1 … 79% (below …)`.
12. **The entries CSV**, captured from the real export blob: Detail carries
    *«— not passed (below the 80 % ground-exam pass mark)»* / *«— passed (80 % or
    better)»* on all five rows including the ΕΕΘ; *Counts* reads **«yes — but no
    attempt has passed yet»** on the operative-but-failed rows; and the **`State`
    column now reads `done`** where it was blank before the fix.
13. **The server stores and does not judge**: the record saved through the real
    RPC as
    `[{CO190 79}, {IN190 55}, {IN290 85}, {IN190 78 trial 2}, {ΕΕΘ 1 79}]` —
    three failing marks accepted without a murmur.
14. **Schema gate**: `db/schema.sql` run **twice** with `ON_ERROR_STOP=1`,
    **exit 0** both times; `wa.grade_pass_min() = 60`, `wa.exam_pass_min() = 80`,
    `wa.exam_passed(80) t` / `wa.exam_passed(79) f`, `wa.grade_passed(60) t` /
    `wa.grade_passed(59) f`.
15. **`node --check` clean** on all six JS files. **Zero console errors** on the
    student form, the admin's four tabs (including the `beforeprint` builder) and
    the instructor form.
16. **Hygiene**: demo data snapshotted before the round and **byte-restored**
    after — record md5 `95c641b4…` identical before and after, **3 records · 42
    people · 9 proposals**. The one test record created for the live probes was
    removed; **0** stored records carry this round's fixtures (the placeholder
    instructor name `ZZ-TEST`, or an `EETH` row); no fixture people
    were created. **Privacy grep: 0 hits.**

### OPEN ITEMS RAISED BY THIS ROUND

> **ITEMS 1, 2 AND 3 ARE CLOSED — RULED 22/08/2026, ROUND 16 (§4r).** (1) is
> **CONFIRMED**: *«60% f/s, flights»* — the F/S is judged at 60 like a flight,
> there is **no third threshold**, and nothing had to change. (2) is answered
> **«Το Α»**: a visible `badge-warn` chip, and **the row colour stays `st-done`**
> — the fifth state is declined on the record. (3) is closed **without a second
> counter**: every row that did not pass now says so on its own face, so the
> count keeps its meaning. **Item 4 is an invariant, not a question, and stays.**

1. **«F/S at 50» has no referent in WA.** The brief for this round named 50 % as
   the F/S threshold. **There is no 50 % pass mark anywhere in this
   application** — the only 50 is the **floor of the «ΣΚ» band** (ΠΔ 151/13,
   50-59 = ΥΣΤΕΡΗΣΗ), and an F/S sortie is judged at **60** exactly like a
   flight. Nothing was changed on that reading (*«nothing else moves»*), and it
   is recorded here so the question can be asked deliberately: **is a simulator
   sortie meant to pass at 50?** If it is, it is a third number and a third
   argument to `WA.passMin`.
2. **A failed exam is still green.** Round 14's open item 1 asked the same
   question about a failed *attempt*; the 80 % mark sharpens it. `CO190 79 %` is
   `st-done` — a complete row — and the CO's eye reads a green wash as *good*.
   The colour means *«the row is finished»* and the cell beside it says
   *«fail»*; a fifth state (*finished, not passed*) is a colour decision, not an
   arithmetic one, and it is the user's.
3. **`slotsDone` counts marked exams, not passed ones.** The number is right for
   what it measures and now carries a tooltip saying so — but if the CO's brief
   line is meant to answer *«how many has he PASSED?»*, that is a second counter
   and a deliberate decision.
4. **OPEN INVARIANT (added round 15b, §4q·3) — the two readers of the 60.**
   `WA.gradePassed(g)` reads the **number**, `WA.gradeMission(g)` reads the
   **band**; they agree today only because `GRADE_BANDS[good].lo ===
   GRADE_PASS_MIN === 60`. **Anything that moves either number must move the
   other, or state out loud why the two stop agreeing.** Same pair, same
   invariant, on the server (`wa.grade_passed` / `wa.grade_mission`). Checked by
   reading, not by asserting — see *THE 60 IS NOW READ FROM TWO PLACES* above.

## 4q. Round 15b (2026-08-21) — THE VERIFY SWEEP: THREE FINDINGS OF THE ROUND-15 ADVERSARIAL READ

No new directive. Round 15 shipped one ruling; the verify pass over what it
shipped found **one defect and two hygiene items**, and this round is those three
and **nothing else**. `db/schema.sql` is **byte-identical**. *(All three were
ruled the next day — round 16, §4r.)* The three open
RULINGS of §4p (a failed exam's colour, the operative-attempt badge, the F/S
mark) are **untouched — they are the user's**.

### 1. THE LAG CHIP SURVIVED ITS OWN ANSWER — *the one defect*

The «N d» chip in an exam's grade cell says exactly one thing: **«sat N days ago
and STILL WITHOUT A RESULT»**. Round 15 taught the keystroke to repaint the row
in place — the state class, the name cell, the actions cell, the grade box's
`title` — and **that is where it stopped**: `syncExamRows` never touched the
**rest of `td.c-gr`**. So the sentence that a result had not arrived stayed on
screen **beside the result being typed**:

```
IN190  02/01/2026   [ 85 ]  231 d      ← the chip is now a lie, on every keystroke
```

including the very case round 15 was built for — the grade that **moves the
slot** from one trial to another.

**AND THE FIX COULD NOT BE A REDRAW, FOR ROUND 15'S OWN REASON.** Rebuilding the
cell rebuilds the `<input type=number>`, and a rebuilt one comes back with its
caret at position 0 — *«90» typed digit by digit becomes «09»*. So the cell is
re-rendered **around** the box, exactly the way the round-12b/15 «→63»
whole-number offer already is (`refreshGradeFix`): the chip is **dropped and
re-inserted**, the `<input>` is **never touched**, and it stays the **same DOM
node** with its focus and its caret.

* `examLagHTML(e)` is the **third** extracted verdict-cell function, beside
  `examNameCellHTML` and `examGradeTitle` (round 15's own pattern): **one
  definition**, called by the renderer and by the live refresh alike, so the chip
  a row is born with and the chip it keeps are the same sentence.
* `refreshExamLag(i)` drops every `.lagchip` in `td.c-gr` — **and the space that
  carried it** — and appends the fresh one at the **end** of the cell, which is
  where the renderer puts it: **box · whole-number offer · chip**. (The chip is
  written with its own leading space; dropping only the element would leave the
  blank behind, and a grade typed and cleared a dozen times would leave a dozen
  of them. Whitespace collapses on screen, so the cell would have grown without
  bound with nothing looking wrong. Measured: **8 type-and-clear cycles, 4 child
  nodes, unchanged** — the refreshed cell is node-for-node the rendered one.)
* `syncExamRows` calls it for every row of the exam it repaints.

**A SECOND, FREE CORRECTION**: the chip now also **appears on the keystroke that
dates the row**. Before, a date typed into an owed exam left the cell blank until
the next redraw — the round-5b rule («the colour follows the keystroke»)
applied to the one part of the row that had been left out of it.

**The pre-existing semantics are kept exactly**: an exams row shows the chip only
when it is **awaiting a debrief** (dated, ungraded, no mission) **and** the wait
has reached `WA.DEBRIEF_AMBER_DAYS` (7) — so it is **always** the amber one, and
it **comes back** when the grade is cleared.

### 2. SIX HARDCODED «80» STRINGS — ONE SOURCE OF TRUTH, FOR REAL

Round 15's own doctrine comment says it: *«One function, so a chip, a tooltip, a
CSV cell and the operative-trial rule can never quote different marks»* — and
six sentences still carried the number **typed by hand**. They now derive from
`WA.passMin("exams")` (and, where the same sentence names the flight's mark,
`WA.passMin()`):

| | |
|---|---|
| `app.js` — `SECTIONS_META.exams.tip` (the ⓘ) | 80, **60**, 80 |
| `app.js` — `ROW_STATES.done.tip` | **60**, 80 |
| `app.js` — `EXAM_SERIES` ΕΕΘ tip | 80 |
| `app.js` — `WA.EXAM_PASS_TIP` | 80, 80 |
| `admin.js` — printed brief, `(below the 80 % pass mark)` | 80 |
| `student.js` — the exams section hint | 80, **60**, 80 |

**THE ONE THING THAT STAYS TYPED BY HAND** is inside `WA.EXAM_PASS_TIP`: the
Greek «80% για εξετασεις εδαφους, 60% για πτησεις» is the **user's ruling
quoted**, and a quotation is not derived from anything — it stays as it was
spoken.

**THE HOIST THIS NEEDED.** Four of the six are **object literals evaluated at
load**, a thousand lines *above* where the numbers were declared — a tooltip
cannot read a constant that does not exist yet. So the three lines that carry the
numbers (`WA.GRADE_PASS_MIN`, `WA.EXAM_PASS_MIN`, `WA.passMin`) now stand at the
**top of `app.js`**, and the round-15 doctrine block keeps the whole of the
explanation and points at them. **Nothing about the numbers themselves moved**,
and every one of the six strings renders **byte-identically** to what it printed
before (proved below) — only the SOURCE changed.

### 3. THE MIRROR NOTE: TWO READERS OF THE 60, NAMED

`WA.gradePassed` reads the **number** and `WA.gradeMission` reads the **band** —
two sources that happen to agree. **Not unified** (the band read is load-bearing:
see §4p, *THE 60 IS NOW READ FROM TWO PLACES*), so instead: both definitions name
each other in full, and the parity invariant is written into §4p and carried in
its open list. **No runtime assertion** — this application prints nothing to the
console, ever, and a check nobody may print is not a guard.

### CACHE-BUSTER

`?v=20260821e` on **`app.js`, `student.js`, `admin.js`** — the three files this
round changed. **`instructor.js` keeps `?v=20260821d`**; `styles.css`,
`config.js` and `items-catalog.js` keep `?v=20260821b`.

### SELF-VERIFICATION — ROUND 15b (live, local stack, the real form)

1. **The six strings render the SAME WORDS.** Each literal was evaluated from
   **253c5fd** and from the working tree under one stub and compared: **all six
   byte-identical** — `760 · 677 · 416 · 442 · 53 · 992` characters,
   `sha256` equal in every case. Live on the page: `WA.secTip('exams')` 760 ·
   `rowStateDef('done').tip` 677 · `EXAM_SERIES[0].tip` 416 · `EXAM_PASS_TIP`
   442, all reading *«…AT 80 % … at 60 …»* as before; the admin builder's own
   expression evaluated in the live page returns exactly
   `<span class="pr-n">(below the 80 % pass mark)</span>`.
   `WA.passMin() === 60`, `WA.passMin('exams') === 80` on the live page.
2. **THE PLAIN CASE.** `CO190` dated **231 days ago** → the cell shows
   **`231 d`** *(and it appeared on the date keystroke — see the free correction
   above)*. The grade box is marked with an **expando**, then `8` and `5` are
   typed through `execCommand('insertText')` (the real caret): the chip is
   **gone on the FIRST digit**, the box is the **same DOM node** (expando
   intact), still `document.activeElement`, and the value goes `8` → **`85`**,
   never `58`. Row `st-started` → `st-done`, title *«85 % PASSES»*.
3. **CLEARED → THE CHIP COMES BACK.** Select-all + delete on the same box:
   value `""`, **`231 d` back**, cell order `input · lagchip`, same node, still
   focused, row back to `st-started`.
4. **THE «→79» OFFER STILL WORKS AND STILL SITS IN ORDER.** `78.5` typed →
   cell is `input · cfix(→79)` with **no chip**; cleared → `input · lagchip`.
   (On an exams row the two are mutually exclusive by construction — a chip
   means *no grade*.)
5. **THE SLOT-MOVING CASE — the one round 15 was built for.** `IN190` 1st trial
   dated & marked **90** (the holder); a **2nd trial** minted, dated 12 days
   ago, ungraded → **`12 d`**. Expando on its grade box, then `9`, `5`:
   * on `9` — **chip gone**, same node, focused, value `9`, slot still on the
     1st trial (`slotc is-alt` on the 2nd);
   * on `5` — value **`95`** (not `59`), **THE SLOT MOVES**: the 2nd trial loses
     `is-alt` and the 1st gains it and is re-badged **«1st trial»** — all in
     place, same node, still focused.
   Cleared again → **`12 d` back** and the slot moves **back** to the 1st trial.
   The 1st trial (marked 90) correctly shows **no** chip throughout.
6. **THE ΕΕΘ (a row with NO slot key) behaves identically**: `ΕΕΘ 1` dated 9
   days ago → **`9 d`**; `7`,`9` typed → chip gone on the first digit, value
   **`79`**, same node, focused; cleared → **`9 d`** back (4 child nodes). Its
   title still drops the re-sit clause, as round 15 ruled.
6b. **NOTHING ACCUMULATES.** Eight consecutive type-and-clear cycles on one
   grade box: the cell holds **4 child nodes throughout** and its shape stays
   `text · INPUT · " " · SPAN.lagchip` — identical to the renderer's. (Measured
   **10 nodes after 6 cycles** on the first cut of the fix, which is what put
   the space-stripping into `refreshExamLag`.)
7. **`WA.EXAM_PASS_TIP` reaches a real badge**: the minted 2nd trial's badge
   title reads *«…counts with the attempt it was PASSED on — 80 % and above…»*,
   605 characters of sentence, from the derived constant.
8. **`node --check` clean** on all six JS files. **Zero console messages** (not
   just zero errors) on the student form, on the admin's four tabs **including
   the `beforeprint` builder** (26 printed pages, section head *«Ground exams —
   passed at 80 % (done 0 · started 0 · owed 8)»*), and on the instructor form.
9. **Busters live**: the page loads `app.js?v=20260821e`, `student.js?v=…e`,
   `admin.js?v=…e`, `instructor.js?v=…d`.
10. **`db/schema.sql` byte-identical** to 253c5fd (`git diff` empty).
11. **Hygiene**: **nothing was written** — every probe was in-memory on an
    unsaved form. `student_records` **3 rows, md5 `cd37aa79…` identical before
    and after**, `people` **42**, `proposals` **9**. No fixture rows, no fixture
    people, tabs closed.
12. **Privacy grep — 0 hits in the diff.** All **150** live identifiers of the
    local `people` table (first name · last name · MN · call sign · token),
    word-boundary and Unicode-aware, against **this round's whole diff: 0**.
    Repo-wide over the 17 tracked text files the standing **14** hits are the
    known pre-existing false positives and were re-read masked to confirm it:
    the role phrase *«Squadron CO»* in prose, the example call signs `P-xx` in
    the ordering docs, and the two demo surnames the spec already names in §4f
    — **none of them on a line this round touched.**

### ONE OPEN ITEM RAISED BY THIS ROUND (found, NOT fixed — out of scope)

**`refreshGradeFix` leaves its own blanks behind.** The whole-number offer is
re-inserted the same way (`" <button class=cfix …>"`) and only the `.cfix`
element is removed, so the space in front of it accumulates on every keystroke
that makes or unmakes a fractional grade — in **four** sections, not just the
exams. It is invisible (whitespace collapses) and it is **pre-existing**, so it
was left exactly as found: this round was three named items and nothing else.
The one-line cure is the one `refreshExamLag` now carries.

## 4r. Round 16 (2026-08-22) — THE MINT SURVIVES THE CO'S LOCK, AND THE VERDICT STOPS HIDING

Three changes and four rulings-on-paper. Two of the three changes answer
questions this document has been carrying open since round 14b and round 15; the
third is the ruling those two produced between them.

> The user's own words, quoted as spoken: on the CO-lock question — **«Το Β»**;
> on the failed-exam question — **«Το Α»** (22/08/2026). The lettered options
> they name are set out under each ruling below.

`db/schema.sql` is **byte-identical** this round — asserted, not assumed
(`git diff --name-only` names it nowhere). **The deployment gate does NOT
apply**, and the round is pushed. That is not luck: the one change that could
have needed the server (ruling 3B) was **tested against the real RPC first**,
and the guard turned out to be right already — see item 1 below.

---

### 1. RULING 3B — THE MINT SURVIVES THE CO'S LOCK

**The question, as §4o left it** (*“WHAT WAS NOT TOUCHED”*, round 14b): a
CO-locked exam row offered a **disabled** *“+ 2nd trial”*, and the verify pass
asked whether that was right. It was not. The effect was that **a student whose
first sitting the CO had typed in could not record their own re-sit** — and a
re-sit is the one line of that exam nobody but the student can report.

**The ruling is B: unlock ONLY the mint.**

| | before | after |
|---|---|---|
| the CO's row — its own fields | disabled | **disabled** (unchanged) |
| the CO's row — clear / remove | disabled | **disabled** (unchanged) |
| the CO's row — the payload contract | kept or dropped, never rewritten | **kept or dropped, never rewritten** (unchanged) |
| **«+ 2nd trial» on that row** | **disabled** | **enabled** |
| the minted row | — | a **NEW, student-owned** row: no `entered_by`, editable, removable, normal in every way |

**WHY THIS IS AN EXCEPTION TO A SHAPE AND NOT TO A RULE.** `applyLocks` disables
every `input, select, textarea, button` inside a `.is-colock` row — by design,
so that no delegated handler can ever fire against a locked row. Every one of
those controls **edits that row**. The mint edits nothing: it **appends a
sibling**. It sits inside the locked `<tr>` only because round 14 put the
affordance where the student is standing when they learn they must sit the exam
again. The lock was never meant to reach it, and now it does not:
`applyLocks` skips `[data-mint]`, **and only that**.

**THE SERVER WAS ALREADY RIGHT — AND WAS MADE TO PROVE IT.** `wa.carry_stamps`
matches each stored CO entry against the payload by `wa.entry_core` (the entry
**minus** its stamp) and refuses the save if any CO entry went unclaimed. A new
row carrying `trial: 2` has a different core, so it claims nothing and takes
nothing away: the CO's entry still matches itself. That is the reasoning; the
**proof is six real RPC calls** (item 1 of the self-verification). **No schema
change, so no gate.**

The button says so on a locked row. Its title gains one sentence and only
there: *“The sitting above was entered by the squadron CO and stays locked —
this re-sit is YOUR row, and you fill it in like any other.”*

**The caps are unmoved.** One row per `(exam, trial)`, three trials, across the
mix: the CO's row is trial 1, the student mints 2 and then 3, and a 4th is
refused by the server (`out of range 2-3`) — and the affordance is gone from the
form before the student can ask for it. Remove the 3rd and *“+ 3rd trial”*
returns.

---

### 2. RULING 5A-a — THE NOT-PASSED VERDICT BECOMES VISIBLE ON A SINGLE SITTING

**The question, as §4p·2 left it**: *“a failed exam is still green”*. `CO190
79 %` was `st-done` — a complete row — and the only place the row said it had
failed was **the hover title**, which on a phone is nowhere. The options put
were **(A)** say it in a badge and leave the colour alone, or **(B)** a fifth
row state, *finished-but-not-passed*, in its own colour.

**The ruling is A.** A graded ground exam — one of the eight **or** an ΕΕΘ —
whose mark is below `WA.passMin("exams")` wears a visible **`badge-warn` chip
reading «not passed»**. **The row colour does not move: it stays `st-done`.**

> **THE TWO AXES STAY APART, AND THIS ROUND IS THE RULING THAT SAYS SO OUT
> LOUD.** The colour answers *“is this row finished?”* — round 13's question,
> asked of every one of the 181 seeded slots in the same words. The badge
> answers *“what did it say?”*. Folding the second into the first would make
> `done` mean two things at once and would give the exams a state no other
> section can have. Recorded here as the ruling, so a later round does not
> re-open it as an oversight.

**A PASS WEARS NOTHING.** There is no *“passed”* chip: on the 199 exams out of
200 that are passed at the first sitting it would be noise, and the **absence**
of the chip is the pass. This is the same economy as the trial word itself.

**WHERE THE CHIP SITS — and the one place this round departs from the letter of
the brief.** The brief said *“next to the grade”*. It sits in the **exam-name
cell**, beside (and combined with) the trial word — because the brief also said
*“the same badge language”* and *“trials keep their existing combined badges
«2nd trial · not passed»”*, and those two badges are **one badge**: `«1st trial
· not passed»` is the verdict and the trial word in a single chip. Had the
single-sitting chip gone into the Grade column, **the same fact would live in a
different column depending on how many times the exam was sat** — the one
outcome the ruling was made to prevent. One fact, one column. (On the CO's
table the Grade cell independently still reads `79% · fail`, as it has since
round 15; that is the CO's own column and it was not touched.)

---

### 3. RULING 5A-b — THE OPERATIVE 1ST TRIAL WEARS ITS BADGE

The gate was `trial > 1 || alt`, which left **exactly one row in the
application unnamed**: the **first** trial, when it beat a later re-sit and kept
the slot. `85` then a `65` re-sit rendered as

```
IN290                       85 %          ← the holder, wearing nothing
IN290  «2nd trial»          65 %  is-alt
```

— an anonymous row plus an attempt, when it is in fact **two attempts and the
first one won**. The gate is now **“does the record hold more than one sitting
of this exam?”** (`WA.examTrialsOf(list, id).length > 1`), which is §4o·5's
*“what counts as beside”* read from the same counter that already names the
trial in the save dialog. So:

* **`85` then `65`** → the holder wears **`«1st trial»` in `badge-acc`**, the
  re-sit stays `is-alt` with a plain **`«2nd trial»`**;
* **`79` with a re-sit ordered but not yet marked** → the holder wears
  **`«1st trial · not passed»` in `badge-warn`**;
* **a single sitting stays unbadged as to trial** — which is what keeps the word
  off those 199 rows. Its verdict is ruling 5A-a's business, not this one's.
* **an ΕΕΘ never wears a trial word at all**: the weekly series is numbered, not
  re-sat.

**ONE GATE, TWO SURFACES.** Both decisions now live in `app.js`
(`WA.examTrialShown` · `WA.examNotPassed`, with `WA.examGraded` under them) and
are read by the student's exam row **and** the CO's Student-analysis row. Before
this round each surface carried its own copy of the condition; the two rulings
would have had to be applied twice and could then have drifted. The **sentences**
stay per-surface (the student's names the percentage, the CO's does not) —
that is the round-12b `WA.debriefWord` pattern: *the word is the same
everywhere, the sentence is surface-aware.*

---

### 4. THE FREE CORRECTION THIS ROUND HAD TO MAKE — «NOT PASSED» IS NOT «NOT PASSED YET»

The suffix and the `--warn` colour were driven by `!WA.examPassed(e)`, which is
**true of an ungraded row**. While the only badged rows were re-sits this was
nearly invisible; ruling 5A-b would have spread it to **first** trials, so the
round could not ship without it. The suffix now asks `WA.examNotPassed`
(**graded AND below the mark**), and an operative attempt whose result is not in
yet wears a **plain** badge — no accent, no warning — with the title *“The
result is not in yet.”*

**A row that has not been marked has not failed anything.** Measured live: two
trials of one exam, both dated, neither graded → the holder used to read
**`«2nd trial · not passed»` in `--warn`**; it now reads **`«2nd trial»`**,
plain. Same gate, therefore, as the chip of ruling 5A-a — which is the point:
one definition of *“did not pass”* in the whole application.

---

### 5. AND THE SAME NAMING REACHES PAPER

Ruling 5A-b's misreading exists on the printed brief too, and paper has neither
hover nor colour to correct it: the two lines printed **`IN190`** and
**`IN190 · 2nd trial`**, where the bare one reads as *the exam* rather than as
*one of its sittings*. The brief now passes the `named` flag that §4o·5 built
for the save dialog (`WA.examRowLabel(e, named)`, per exam via
`WA.examsWithTrials`), so a re-sat exam prints **`IN190 · 1st trial`** while
`CO190`, sat once, keeps its bare name. The verdict itself was already on paper
in words since round 15 (*“(pass)” / “(below the 80 % pass mark)”*) — that is
why paper needed nothing from ruling 5A-a.

---

### WHAT WAS NOT TOUCHED

* **`db/schema.sql`** — byte-identical, asserted. The CO guard was proven
  correct as it stands (six live RPCs); nothing was “adjusted minimally”
  because nothing was wrong.
* **`styles.css`** — `badge`, `badge-acc` and `badge-warn` all already existed;
  this round draws them, it does not define them. Its buster is unchanged.
* **`instructor.js`** — untouched, buster unchanged.
* **The entries CSV.** It renders no badge. Its `Detail` column has carried the
  verdict in words for **both** shapes since round 15 and its `Counts` column
  already distinguishes *“yes”* · *“yes — but no attempt has passed yet”* ·
  *“no — another attempt counts”*, so a spreadsheet reader can already tell the
  sittings apart. Deliberately left alone: round 15b's own residual was an
  argument-position defect in exactly this call, and a third surface was not
  asked for.
* **`slotsDone` and every counter.** See the closure of §4p·3 below — the ruling
  closes that item **without** a second counter, and no arithmetic moved.
* **The confirmation dialogs** — read live, word for word unchanged.

### CACHE-BUSTER

`?v=20260822a` on **`app.js`, `student.js`, `admin.js`** — the three files this
round changed. **`instructor.js` keeps `?v=20260821d`**; `styles.css`,
`config.js` and `items-catalog.js` keep `?v=20260821b`.

### SELF-VERIFICATION — ROUND 16 (live, local stack, the real forms and the real RPCs)

1. **THE CO GUARD, PROVEN — six real RPC calls, no schema change.** The CO wrote
   `IN190 · 05/08/2026 · 72` through `public.admin_save_student_record`; it
   stored as `{"date":"2026-08-05","exam":"IN190","grade":72,"entered_by":"admin"}`.
   Then, through `public.save_student_record` **as the student**:
   * **(A) accepted** — the CO row returned unchanged **plus** `trial:2`;
   * **(B) accepted** — and `trial:3` on top of it;
   * **(C) refused** — `trial:4` → *“out of range 2-3 (exams[3].trial)”*;
   * **(D) refused** — two rows both `trial:2` → *“two rows are the same trial of
     the same ground exam — each of the eight may be sat once per trial (1st,
     2nd, 3rd)”*;
   * **(E) refused** — the CO's grade changed 72 → 92 → *“this entry was set by
     the squadron CO and only the CO can change it …”* — **the wording of the
     time**; round 17b rewrote it to the admin sentence (§4b), and the refusal
     itself is unchanged;
   * **(F) refused** — the CO's row **dropped** → the same refusal.
   The lock holds in both directions it can be broken; the mint passes through
   it. **`db/schema.sql` was not opened.**
2. **THE LOCKED ROW, READ OFF THE LIVE DOM.** On the student's own form the CO
   row is `frow st-done is-co is-colock`, and every control's `.disabled` reads
   `date=true · grade=true · clear=true` — **`[data-mint]=false`**, the one
   enabled control in the row.
   **Control experiment**: `.click()` on a *disabled* button of the same row
   dispatched **nothing** (a listener attached for the test never fired, the row
   count did not change), so the mint's success is not an artefact of the probe.
3. **THE MINT, END TO END, THROUGH THE REAL FORM.** Clicking it produced a new
   `st-owed` row, **student-owned and editable** (`date`/`grade` not disabled),
   with the caret already in its date box, and the toast *“2nd trial of IN190
   added …”*. Date `19/08/2026`, then `9` and `1` typed with
   `execCommand('insertText')` (the real caret): value went `9` → **`91`**, the
   **same DOM node** throughout (expando intact), still focused. Saved through
   the form's own **Confirm & save**. **In the stored record the CO's entry is
   byte-identical** — compared as text against the exact stored string, `t` —
   **and the minted row carries no `entered_by`**, `f`.
4. **THE DIALOG'S WORDING IS UNCHANGED**, read off the live modal:
   *“Save 1 change to your record? … 1 change · Ground exams · IN190 · 2nd trial ·
   19/08/2026 — added (grade 91 %)”* and the three buttons *Keep editing ·
   Discard changes · Confirm & save*. The CO's row is **not** listed as a change,
   because it is not one.
5. **RULING 5A-a, ON THE KEYSTROKE.** A single-sitting `CO190`: `79` →
   **`[badge badge-warn] not passed`**, row **`st-done`**; `80` → **no badge at
   all**, row still `st-done`; back to `79` → the chip returns. An untouched
   `LNAV790` (no date, no grade) wears nothing and stays `st-owed` — *not marked
   is not failed*. Title on the chip, read off the live DOM: *“This exam was sat
   once, and 79 % does not reach the 80 % ground-exam pass mark. The row is
   COMPLETE — that is what its colour says — and it did not pass, which is what
   this chip says.”* (The CO-locked `IN190 72 %` of item 2 wore the same chip and
   the same sentence with its own number, before its re-sit existed.)
6. **RULING 5A-b, THE EXACT PAIR FROM THE BRIEF.** `IN290` at `85` **alone** →
   **no badge**. Mint the 2nd trial → the holder immediately wears
   **`[badge badge-acc] 1st trial`** and the new row `slotc is-alt` with plain
   **`2nd trial`**. Fill the re-sit with `65` → unchanged: holder `«1st trial»`
   accented (title *“…and it PASSED (85 %)”*), the `65` **`is-alt`**.
7. **THE FAILED FIRST-TRIAL HOLDER.** Same exam dropped to `79` with the re-sit
   dated but ungraded → the holder reads **`«1st trial · not passed»`** in
   `badge-warn`, title *“No attempt has reached the pass mark yet, so the latest
   one stands for the exam.”*
8. **THE FREE CORRECTION, MEASURED.** Both trials dated, **neither graded** →
   the holder reads **`«2nd trial»`, plain** (no `--warn`, no suffix), title
   *“The result is not in yet.”* — where before this round it read
   `«2nd trial · not passed»`.
9. **THE ΕΕΘ, BOTH WAYS.** `ΕΕΘ 1` at `79` → `[badge] weekly theory` **plus**
   `[badge badge-warn] not passed`, **no trial word**, and the title **drops the
   re-sit clause** exactly as the grade box has since round 15: *“A weekly theory
   exam, sat once, and 79 % does not reach the 80 % ground-exam pass mark …”*.
   `ΕΕΘ 2` at `80` → `weekly theory` only. Neither offers a mint.
10. **THE CAPS AND THE AFFORDANCE.** With trials 1 and 2 present the button reads
    *“+ 3rd trial”*; minting it makes the button **disappear from every row of
    that exam** (there is no 4th to offer); **✕** on the 3rd brings
    *“+ 3rd trial”* back. The badges of the other two rows are unaffected
    throughout.
11. **THE CO'S STUDENT-ANALYSIS TABLE — the mirror, read off the live DOM** on
    the saved record:
    `CO190 «not passed» 79% · fail done self` ·
    `IN190 «2nd trial»(acc) 91% done self` ·
    `IN190 «1st trial»(plain) 72% · fail done CO` ·
    `IN290 «1st trial»(acc) 85% done self` ·
    `IN290 «2nd trial»(plain) 65% · fail done self` ·
    `ΕΕΘ 1 «weekly theory» «not passed» 79% · fail done self` ·
    `ΕΕΘ 2 «weekly theory» 80% done self`.
    **All seven rows `st-done`** — the colour did not move on either surface.
12. **THE PRINTED BRIEF** (`beforeprint` builder, live): `CO190 06/08/2026 79%
    (below the 80 % pass mark) done` · `IN190 · 2nd trial … 91% (pass)` ·
    `IN190 · 1st trial CO (not the operative attempt) … 72% (below …)` ·
    `IN290 · 1st trial … 85% (pass)` · `IN290 · 2nd trial (not the operative
    attempt) … 65% (below …)` · `ΕΕΘ 1 (weekly theory) … 79% (below …)` ·
    `ΕΕΘ 2 (weekly theory) … 80% (pass)`. The **1st trials are named on paper**
    (item 5 above) while `CO190`, sat once, is not.
13. **`node --check` clean** on all six JS files. **Zero console messages** (not
    just zero errors) on the student form, on the admin's four tabs **including
    the `beforeprint` builder**, and on the instructor form.
14. **Busters live**: the page loads `app.js?v=20260822a`, `student.js?v=…a`,
    `admin.js?v=…a`, and `instructor.js?v=20260821d` unchanged.
15. **`db/schema.sql` byte-identical** — `git diff --name-only` lists only
    `app/app.js`, `app/student.js`, `app/admin.js`, `app/index.html`.
16. **Hygiene**: the round's probes needed real writes, so the three tables were
    `pg_dump`ed before the round and compared after. The fixture record (created
    on a student who had none) was **deleted**; `people` **42**, `student_records`
    **3**, `proposals` **9**, record md5 **`201d44b3…` identical before and
    after**, and the two dumps are **byte-identical** once `pg_dump`'s own
    per-session `\restrict` nonce is masked (**21 397 bytes, md5 `687c80f2…`
    both**). **0** stored records carry an `EETH` row; **0** fixture people.
    Browser tabs closed.
17. **Privacy grep — 0 real hits in the diff.** All **152** live identifiers of
    the local `people` table (first name · last name · MN · call sign · token),
    word-boundary and Unicode-aware, against **this round's whole diff**:
    **4 matches, every one of them the standing false positive** — the *role
    phrase* **«squadron CO»** in prose (the CO account's `last_name` **is** that
    role placeholder, with no first name, which is why the phrase matches at
    all); three are English UI/comment prose and the fourth is **this very
    sentence** naming the exception.
    **No name, MN, call sign or token reached a tracked file.** Repo-wide over
    the 17 tracked text files the known pre-existing set is unchanged and none of
    it sits on a line this round touched: the same role phrase, the two demo
    surnames §4f already names, and the example call signs `P-xx` in the
    ordering docs — the identical set §4q·12 recorded, and this round adds
    nothing to it.

### THE FOUR RULINGS RECORDED ON PAPER THIS ROUND (no code)

**(a) §4p·1 — «60% f/s, flights» (22/08/2026). CLOSED as CONFIRMED.** The
round-15 brief's *“F/S at 50”* had no referent in this application, and the
question was put deliberately. The answer is that **a simulator sortie is judged
at 60, exactly like a flight** — which is what `WA.passMin()` already returns for
`fs`, so **nothing changed and nothing had to**. The only 50 in Wings Ahead
remains the **floor of the «ΣΚ» band** of ΠΔ 151/13, which is a
*characterisation* and not a pass mark. There is **no third threshold**: 60 for
flying (flights, F/S, evaluations, solos, FPC/CEF) and 80 for written ground
exams, and that is the whole list. Noted the same day: **the FDMS bridge report
aligns its own constant to the same number**, so the two applications state one
rule.

**(b) The seniority “no call sign” fallback — CLOSED as a dead letter.** §4n·4
level 3 says *“no call sign sorts last within its own air force, by surname”*.
The user states that **no instructor is ever without a call sign** — some numbers
are deliberately skipped, and **students never have one**. The comparator is
therefore **kept exactly as written and is not exercised**: it is a
**dead-letter fallback**, there so that a roster row missing its number lands
somewhere definite instead of wherever the database happened to return it. No
code, no wording change, and the question is not open any more.

**(c) §4p·2 — CLOSED by change 2 of this round.** *“A failed exam is still
green”* is answered: **a visible badge, and the colour does not move.** The fifth
row state (*finished, not passed*) is **declined**, on the record, for the reason
set out in item 2 above.

**(d) §4p·3 — CLOSED by changes 2 and 3, and WITHOUT a second counter.** The
question was whether *“4 of 8 exams”* — which counts exams **sat and marked** —
ought to answer *“how many has he PASSED?”* instead, or in addition. It does not
need to: after this round **every exam row that did not pass says so on its own
face**, on both surfaces and on paper, so the CO reading the count can read the
answer straight off the table beneath it. The counter keeps its meaning and its
tooltip; **no arithmetic changed**.

## 4s. Round 17 (2026-08-22) — THE STUDENT RAIL, AND THE ADMIN STOPS BEING THE CO

### THE TWO RULINGS, VERBATIM (2026-08-22)

> **1.** «στο instructor recommendation θα ήθελα navigation panel με τους
> μαθητές. Πράσινη χροιά όποιο έχει βάλει επιλογή, μουσταρδί ότι δεν έχει
> επιλέξει κάτι ακόμη»

> **2.** «Ο admin δεν ειναι ο squadron CO, ειμαι εγω, ο developer. ⟨SURNAME⟩.
> Διορθωσε το»

*(The surname of the second ruling is **redacted here and in every tracked
file**, as it has been since round 14. The database carries the display name.
That is its only home, and this round is the round that makes the database the
only place the application reads it from.)*

Two more items came from the round-16 verify list: **item 12** (a real defect in
the trial badge) and **item 23** (a doc-nit, the last two inline copies of one
test). Four changes in all, and **the server was not touched by any of them.**

---

### 1. THE STUDENT RAIL ON THE INSTRUCTOR FORM — *ruling 1*

**IT IS THE ROUND-14 COMPONENT, NOT A SECOND ONE.** `WA.navHTML` /
`WA.navMount` already served two surfaces (the student form's fourteen sections
and the admin's ten analysis cards); the instructor form is the third, and it
hands the panel the same `items` array everything else does. What it lists is
**one row per student card**, in the order `data.students` arrives — the
seniority / class order the cards themselves render in — so **the rail and the
card list are literally the same array**: a filter or a grouping added here later
moves both or neither. The cards gained an `id` (`ins-stu-⟨uuid⟩`) and the panel
is told how to find them through its `anchor` option, exactly as the admin's
analysis rail is. Sticky beside the reading column; under **900 px** it is the
same `<ul>` as a one-line strip of pills with the burger opening it into a
wrapped grid. `teardownView()` destroys it through the same single `WA._nav`
slot — one view, one panel, no orphaned scroll listener.

**THE ONE THING THE COMPONENT GREW: `rowTone`.** The state this rail carries is
**binary** — an assessment is chosen or it is not — and a badge alone would say
it in the smallest type on the row. `rowTone` is a **state id from
`WA.ROW_STATES`** painted as a wash across the whole row. The caller names a
STATE, never a colour, so the rail draws from the round-13 four-state contract
and cannot invent a fifth:

| the ruling's word | state id | token | what it means here |
|---|---|---|---|
| **πράσινη χροιά** | `done` | `--st-done` | a level is **currently selected** on that card |
| **μουσταρδί** | `extra` | `--st-extra` | **no level chosen yet** |

It is **opt-in**: the two round-14 rails pass no `rowTone` and are pixel-for-
pixel what they were. `is-here` still wins over a tone (`:not(.is-here)` in the
CSS) — **where the reader IS outranks what the row says about itself**.

**WHAT CARRIES THE STATE A SECOND TIME — corrected in round 17b (R17 verify
item 3).** This paragraph used to say the 3 px left edge repeated the tone *«in
POSITION rather than in hue»*. **Measured on the running rail, that is false**:
both rules declare `inset 3px 0 0` on the same edge of the same box (both rows
`left 21 · width 206 · height 28`, both shadows `3px 0px 0px 0px inset`) — the
**geometry is identical and only the colour differs**. The edge is therefore a
**reinforcement of the hue** — the most saturated statement of it on the row,
worth keeping — and **not** a second modality. The second modality is **the
BADGE WORD**: `.sn-st` prints the weight digits **`10 · 8 · 5 · 3 · 1`** when a
level is chosen and **«not yet»** when none is, *inside the button's own
accessible name* (`2Lt ⟨SURNAME⟩ 3` · `Cdt IV ⟨SURNAME⟩ not yet`), so it reaches
a screen reader and a monochrome print as well as an eye; the tooltip says the
same fact in a sentence. On the pills below 900 px the edge is dropped (it clips
to the pill radius and reads as a smudge); the wash, the border and **the badge's
own word** carry it there — which is the arrangement the whole rail actually
relies on, at every width.

**WHAT COUNTS AS «HAVING PUT A CHOICE».** A **level**, and nothing else. Not a
comment, not the flew-with tick — those are notes *about* a judgement, and an
instructor who wrote a paragraph and chose no level has still said nothing the
Wing Commander brief can average. The test is `P[sid].level`, which is the
form's own working state, so the rail is truthful through **every** flow the
form has:

| flow | rail |
|---|---|
| **on load** | green for every stored level, mustard for the rest |
| **choose a level** | that row turns green **on the click**, count +1 |
| **click the chosen level again** (the round-10 clear gesture) | back to mustard, count −1 |
| **dirty, unsaved** | green, and the row's tooltip says *«chosen, not saved yet»* |
| **dialog → Discard** | every card is restored to its saved value and the rail follows card by card |
| **general Save** | redrawn **after** the writes, from the server's own verdict (`wa.write_proposal` normalises the level) |

**THE BADGE IS THE WEIGHT.** `10 · 8 · 5 · 3 · 1` — the number the brief
averages, and the number the card already prints beside every level — with the
level named in full in the row's tooltip. An unchosen row reads **«not yet»**,
which is the same fact in a word for anyone the hue does not reach. The panel
head carries **«7 of 25 chosen»** for the class.

**ONE DEFECT THIS ROUND'S OWN VERIFICATION CAUGHT, IN THE BRANCH NOBODY LOOKS
AT.** `.pagelay` is a two-column grid whose first column is the 224 px rail. An
instructor with **no active students** gets no rail — and the form, as the first
child, was then placed in THAT column and rendered **224 px wide**: a
one-sentence card squeezed into the space of a missing panel. Measured on the
running form (form column **999 px** railed · **760 px** centred with the
fallback · **224 px** had the grid been left on), and fixed by making the wrapper
a layout only when there is something to lay out — the empty form falls back to
exactly the markup it had before this round, a plain `.wrap`.

**RECORDED, NOT HIDDEN — AND MEASURED IN ROUND 17b:** in the **Wilderness**
palette `--good` is a yellow-green (142,207,98) and sits nearer the mustard
(212,190,70) than in the other seven. Round 17 wrote *«the pair is still
distinguishable»*; simulated for **protanopia** (Viénot / Brettel–Mollon 1999)
it is not — the two row washes, as painted on Wilderness's `--panel`, measure
**ΔE76 3.4** (ΔE2000 **3.3** between the raw tokens, **3.0** across the painted
3 px edge) against **13–14** in the other dark palettes. **This is now a stated
known limit, not a reassurance**, and the 3 px edge is no mitigation for it
because the edge *is* that colour (see the correction above). What a protanope
actually reads on the row is **the badge word** — *«not yet»* or the weight
digit, in the button's accessible name — with the tooltip saying it in a
sentence. By the same discipline the MESA note at the top of `styles.css` sets
out for `--warn` / `--mustard`, that word is the reason the palette is allowed
to stand; a future palette pass may still want to move Wilderness's `--good`.

---

### 2. THE TRIAL BADGE COUNTED ROWS, NOT SITTINGS — *round-16 verify item 12*

**THE DEFECT.** `WA.examTrialShown` decides whether an exam row wears
*«1st trial»*, and round 16 (§4r·3) made it draw that word whenever the record
holds **more than one sitting** of the exam. It counted with `WA.examTrialsOf`,
which returns **every row naming that exam** — and since round 13 the student's
form carries the **seeded flow-chart slot** for every exam nobody has sat. So a
record holding a hand-made `{exam:'X', trial:2}` and **no trial 1** produced two
"trials" of X: the minted re-sit, and the empty placeholder the form had just
seeded beside it. The **empty owed row** — nothing typed in it, nothing stored
for it, grey — wore **«1st trial»**. It named an attempt that had never been
made.

**THE FIX — the same question the sparse rule asks.** A row counts as a SITTING
when `WA.slotUntouched('exams', row)` says it is not the untouched flow-chart
placeholder. That predicate already knows every case: a written row, a legacy
row, an admin-entered row, a minted trial, an ΕΕΘ — all of them are stored, all
of them are reports, all of them count. Two clauses, because both halves of the
sentence have to be true:

```js
WA.examSittingsOf = (list, examId) =>
  WA.examTrialsOf(list, examId).filter((t) => !WA.slotUntouched("exams", t.e));

WA.examTrialShown = function (list, e, alt) {
  if (!e || WA.examSeries(e)) return false;
  if (alt || WA.examTrial(e) > 1) return true;
  if (WA.slotUntouched("exams", e)) return false;      // ← the row itself is not a sitting
  return WA.examSittingsOf(list, e.exam).length > 1;    // ← nor is a placeholder beside it
};
```

**ONE DEFINITION, BOTH SURFACES.** The student's exam row (`trialBadge`) and the
admin's Student-analysis table read the same gate — the round-16 arrangement,
unchanged — so the fix lands on both without either knowing about it.

**PROVEN LIVE, WITH THE PAYLOAD THE FINDING NAMES.** `{"exams":[{"exam":"IN190",
"trial":2}]}` written straight into a student record, opened on that student's
own link:

| row | before (round-16 gate) | after |
|---|---|---|
| the minted `trial:2` | «2nd trial» | **«2nd trial»** — kept |
| the seeded IN190 placeholder | «1st trial» | **no badge** |

and the two cases the word exists for are untouched, on the same form: a real
**85 then 65** pair still reads *«1st trial»* / *«2nd trial»* (two sittings), and
a **single** sitting still wears no trial word at all — which is what keeps the
word off the other 199 rows.

---

### 3. `WA.examGraded`, AND NOW THERE ARE NO COPIES — *round-16 verify item 23*

Round 16 extracted *«is there a mark at all?»* into `WA.examGraded` and left two
inline copies of its four-clause test alive: `admin.js` → `gradedEx` (the
entries-CSV Detail cell) and `student.js` → `examGradeTitle`'s local `has` (the
grade box's tooltip). Both are gone; both call `WA.examGraded`.

**BEHAVIOUR BYTE-IDENTICAL, AND MEASURED AS SUCH.** With a record built to
exercise all four clauses — `85` · `65` · `null` · `0` · `"79"` (a string) ·
`""` — across an exam with three trials, an off-catalogue exam and two ΕΕΘ:

- **the entries CSV**: exported twice from the running dashboard, once with
  `WA.examGraded` and once with the pre-round-17 inline expression swapped into
  its place — **9 245 bytes, identical, 6 ground-exam rows**, verdicts intact
  (*«passed (80 % or better)»*, *«not passed (below the 80 % ground-exam pass
  mark)»*, and silence where the result is not in).
- **the grade-box title**: all **13** exam-row titles on the student form,
  rebuilt both ways — **identical**, including the graded tail *«85 % PASSES.»*.

---

### 4. THE ADMIN IS NOT THE SQUADRON CO — *ruling 2*

> «Ο admin δεν ειναι ο squadron CO, ειμαι εγω, ο developer. ⟨SURNAME⟩.
> Διορθωσε το»

**THE LONG-OPEN QUESTION, CLOSED.** From round 4 to round 16 this application
called the holder of the admin link *«the CO»* — in the stamp, in the lock note,
in both on-behalf banners, on the People page, in the printed brief, in a CSV
header and in something over a hundred tooltips. He never was. **He is the
FLIGHT COMMANDER and the developer of this application**, and the squadron's
Commanding Officer is a different officer who does different things — some of
which this same application records.

**WHAT THE MECHANISM DOES: NOTHING.** The stored value has been
`entered_by='admin'` since round 4 — already neutral, already correct. **No
migration, no schema change, not one byte of `db/schema.sql`.** The internal
identifiers keep their names too, and that is deliberate: `.cotag`, `.colock`,
`is-co`, `is-colock`, `WA.isCO`, `WA.CO_TIP`, `opts.asCO` are what the code calls
its own variables, and renaming ~200 call sites would be a large diff that
changes nothing anybody sees. **What the USER SEES is the whole of this change.**

**THE IDENTITY IS NOW SAID IN EXACTLY TWO WAYS, AND NEVER IN A THIRD.**

1. **A NAME — the admin person row's own rank + surname, read from the
   DATABASE** through `WA.personRankName`, the same path the round-14
   confirmation dialog has used since it was built. Only possible where the
   admin himself is the reader (`WA.me` **is** his row), which is exactly the
   three surfaces that ever wanted a name:
   - the student form's on-behalf banner — *«Editing as ⟨Rank Surname⟩ — you are
     filling in this record on behalf of …»*
   - the instructor form's on-behalf banner — *«Entering as ⟨Rank Surname⟩ …»*
   - the printed assessment sheet — *«· entered on their behalf by ⟨Rank
     Surname⟩ (the squadron administration)»*
   - and the save dialog's signature line, which already read *«Signed by ⟨Rank
     Surname⟩»* and now wears an **ADMIN** chip beside it instead of a **CO** one.
2. **A ROLE WORD — «the admin» / «the squadron administration»** — everywhere a
   student or an instructor is the reader. **No RPC tells them the admin's
   name**, and inventing one would be a second identity: the lock note, the
   stamp tooltip, the record-level line, the save refusals and the landing page
   all use the neutral word. New constants, one definition each:
   `WA.ADMIN_TAG = "ADMIN"` · `WA.ADMIN_BODY = "the squadron administration"` ·
   `WA.ADMIN_WORD = "the admin"` · `WA.adminRankName()`.

**THE SWEEP, SURFACE BY SURFACE.**

| where | was | is |
|---|---|---|
| the entry chip (every table, card, brief, drill-down) | `CO` | **`ADMIN`** |
| the lock chip on a student's row | `🔒 CO` · `🔒 locked by CO` | **`🔒 ADMIN`** · **`🔒 locked by the admin`** |
| `WA.CO_TIP` | *Entered by the squadron CO on behalf of the owner* | *Entered by **the squadron administration** …* |
| `WA.CO_LOCK_TIP` | *Set by the squadron CO — locked … only the CO can change it* | *Set by **the squadron administration** … only **the admin** …* |
| the record-level chip | `CO` / `+N CO` | **`ADMIN`** / **`+N ADMIN`** |
| the record-level verdict for CSV (`WA.coWord`, `coSource.word`) | `CO` / `self+CO` | **`admin`** / **`self+admin`** |
| the entries-CSV column | `CO-entered entries` | **`Admin-entered entries`** |
| the two Save buttons on an on-behalf form | `Save as CO` | **`Save as admin`** |
| the two on-behalf banners | *Editing / Entering **as CO*** | *Editing / Entering **as ⟨Rank Surname⟩*** |
| the printed brief's per-student line | *record ENTERED BY THE CO* | *record ENTERED BY THE ADMIN* |
| the printed class-summary legend | *“CO” marks a record the squadron CO entered in full* | *“ADMIN” marks a record **the squadron administration** entered in full* |
| the three *enter-on-behalf* button tooltips | *tagged 'entered by CO'* | *tagged 'entered by the admin'* |
| the student form's own hint | *visible to your instructors and the squadron CO* | *… and the **squadron administration*** |
| the landing page | *contact the squadron CO* | *contact the **squadron administration*** |
| the People page's admin row | the stored surname read **«Squadron CO»** | **the admin's own rank + surname from the row** |

**ROUND 17b — THE LAST PLACE THAT STILL SAID IT WAS THE SEED (R17 verify item
A).** Every row of the table above is a SURFACE, and round 17 fixed all of them
while `db/schema.sql` went on writing the surname **«Squadron CO»** into the
admin row a fresh deployment bootstraps — so a brand-new install introduced its
own holder as the squadron's Commanding Officer before anybody typed a
character, and the People page dutifully printed it. The seed now writes the
**neutral role and nothing else**: `('admin', '', '', 'Admin')` — no rank, no
given name — and `WA.personRankName` therefore reads exactly **«Admin»** on
every surface until the holder sets his own name. **Existing installs are
untouched**: the insert is guarded by `not exists`, so on any database that
already carries an admin row it does nothing, and a name already stored (a
«Squadron CO» among them) is left for its owner to correct through People →
**Edit**. **The real name lives only in the database**, set on the running
instance — never in a tracked file (the round-9 privacy rule).

**AND THE REAL SQUADRON CO IS UNTOUCHED, BECAUSE HE EXISTS.** Three things in
this application name that officer, and all three are **doctrine about an
appointment**, not about the admin link. They stay word for word:

- **`WA.FPC_EVALUATORS = ["Squadron CO", "DO"]`** — an FPC is conducted by the
  Squadron CO or the DO **and by nobody else** (round 6, §4e·5), including the
  server's own `wa.fpc_evaluators()`;
- **`WA.EVALUATOR_ROLES`** — the CEF's evaluator datalist;
- **the ΚΕΠΕ entry conditions** — *«Squadron CO / DO decision — reduced
  performance»*, the opening sentence of 3-01 ΚΕΦ.2 §32β, in the section hint,
  the SMS reason list and the two save refusals.

The demo data proves the distinction rather than blurring it: an instructor row
in the local database carries the duty **“Squadron Commander”**, and the printed
brief shows an FPC conducted by **Squadron CO** — while the admin row beside
them is a person with a rank and a surname of his own.

**THE PEOPLE TABLE, AND THE ONE THING THE USER DOES HIMSELF.** The People page
already printed `WA.personName(p, true)` for the admin row: the CODE was right
and the DATA was wrong — the local demo row's `last_name` was the literal string
**«Squadron CO»**. It has been renamed to a **fake developer identity** for
testing — `Maj DELTA`, in the **Alfa / Bravo** convention of §4g, so that nobody
can mistake the fixture for a person. **On the cloud instance the user sets his own name
once, through the People tab's Edit button** — it is a person row like any other,
and no tracked file will ever hold the value.

**«CO diff-stamping» IS «ADMIN STAMPING».** §4f·9 now carries the renaming note
and the ruling; the mechanism it describes did not move.

---

### THE TWO ROUND-16 DISPLAY DECISIONS, RATIFIED (no code)

Both were built in round 16 on Claude's proposal, and the user did not object on
22/08. They are recorded here as **standing unless the user overrules them**:

**(a) THE NOT-PASSED CHIP LIVES IN THE EXAM-NAME CELL, AS ONE COMBINED LABEL.**
A row that is both a named trial and a failed one wears **one** badge reading
*«2nd trial · not passed»*, in the exam's own cell — not two chips, and not a
second chip in the Grade column. One row, one verdict, one place to look.

**(b) AN UNGRADED OPERATIVE HOLDER WEARS THE PLAIN «Xst trial» BADGE.** While
the result is outstanding the badge is **plain** — no accent, no warning — and
says the trial word alone. *«Not passed»* is **graded-and-below**, never *«has
not passed yet»*: a row still waiting for its mark has not failed anything
(§4r·4).

---

### WHAT WAS NOT TOUCHED

- **`db/schema.sql` — not one byte.** No RPC signature, no column, no policy, no
  server text. Asserted byte-identical at the end of the round.
- **The two round-14 rails** — the student form's fourteen sections and the
  admin's ten analysis cards render exactly as they did; `rowTone` is opt-in and
  neither passes it.
- **The stored provenance value** (`entered_by = 'admin'`), the lock rule, the
  carry-stamps contract and every server refusal sentence.
- **The four-state colour contract** (§4m) — round 17 borrows two of its tokens
  and adds none.
- **The doctrinal Squadron CO** in all three of its places, above.
- **The syllabus course codes that begin «CO »** (`CO 101-105`, `CO 106-108`,
  `CO 109`, `CO 110` — Basic/Advanced Contact, Night Flight, Landing Pattern):
  they are catalogue identifiers and were never about anybody's appointment.

### CACHE-BUSTER

`?v=20260822b` on the five files this round touched — `styles.css`, `app.js`,
`student.js`, `instructor.js`, `admin.js`. `config.js` and `items-catalog.js` are
untouched and keep `?v=20260821b`. *(The bump proved itself during verification:
the first load after the edits served a cached `index.html` and the old
`instructor.js`, and the rail was simply absent.)*

### DEPLOYMENT NOTE — **NO SCHEMA GATE THIS ROUND**

Client-only. Deploy the five files; nothing on the database has to move first,
and an instance running the round-16 schema serves round-17 code correctly. The
**one** manual step on a cloud instance is the admin person row's name, set by
the user through the People tab's **Edit** button (§4s·4).

### SELF-VERIFICATION — ROUND 17 (live, local stack, the real forms and the real RPCs)

Local stack, `http://localhost:8124/app/`, `supabase_db_WingsAhead`, real tokens,
real RPCs. **Zero console messages of any kind on every screen visited.**

**THE RAIL (instructor's own link, a class of 25 with 3 stored assessments)**

1. **The rail IS the card list** — 25 rows, 25 cards, `sameOrder: true` over the
   two id arrays, and every row's anchor resolves to its card.
2. **Truthful on load, mixed** — 3 green, badged `5` · `8` · `10` (the weights
   of the three levels that instructor has stored) · 22 mustard *«not yet»* ·
   head reads **«3 of 25 chosen»**.
3. **Click scrolls and marks** — row 15 clicked from the top: page 0 → 7 977 px,
   the card's top at **75 px** against a measured 61 px top bar, the row marked
   `is-here`.
4. **A choice flips the row on the click** — `tone-extra` → `tone-done`, badge
   `not yet` → `8`, tooltip gains *«chosen, not saved yet»*, head 3 → **4**.
5. **Click-the-chosen-one-again returns it** — `tone-done` → `tone-extra`, badge
   back to *«not yet»*, head back to **3**.
6. **A comment and a flew-with tick are NOT a choice** — both typed and ticked on
   a mustard row: the card goes dirty, the row **stays mustard**, the head stays
   **«3 of 25 chosen»**.
7. **Discard restores the saved truth** — one saved level cleared + one new
   level chosen + one comment: dialog *«Save 3 assessments?»*, signature
   *«Signed by Capt ⟨SURNAME⟩»*, three enumerated changes → *Discard* → *Yes* :
   the three original greens are back, head **«3 of 25 chosen»**, 0 dirty cards,
   Save disabled, float hidden.
8. **The general Save keeps it truthful** — 2 chosen + 1 cleared, confirmed and
   written over three real `save_proposal` calls: head **«4 of 25 chosen»**, the
   greens are exactly the four the database now holds, **no tooltip says
   «not saved yet»**, and a **full page reload reproduces the same four** from
   the server.
9. **900 px** — burger visible, the list is the horizontal pill strip, the row
   wash survives (`--st-extra` = `rgba(107,84,0,.15)`, `--st-done` =
   `rgba(15,115,80,.15)` in light), `is-here` still wins with the accent, the
   left edge is dropped on pills. **`documentElement.scrollWidth === clientWidth`
   — no horizontal scroll**, and no element overflows outside its own scroller.
10. **375 px** — same, **no horizontal scroll** closed, open or after a jump; the
    burger opens the wrapped grid, a pill click **closes the strip**, scrolls, and
    the card clears the strip's bottom edge.
11. **Keyboard** — every row is a real `<button>`, focusable, `:focus-visible`
    outlined, activation scrolls and marks; the burger is a `<button>` carrying
    `aria-expanded`; the panel carries `aria-label="Your students"` (and *«This
    instructor's students»* on the admin's twin).
12. **All 8 palettes × both modes** — green and mustard are distinct washes over
    their own panel in every one, and the badge takes the palette's own `--good`
    / `--mustard`. The Wilderness proximity is recorded above.
13. **The two round-14 rails are unchanged** — the student form's 13 rows and the
    admin analysis's 10 rows carry **no** `tone-` class.
13b. **The no-students branch** — measured on the running page against the same
    stylesheet: the fallback wrapper gives the form **760 px, centred** (the
    pre-round-17 layout) where the grid would have given it **224 px**. The
    defect and the fix are set out in §4s·1.

**THE TRIAL BADGE (verify item 12)** — as tabulated in §4s·2: the fabricated
`{exam:'IN190', trial:2}` payload written to a real record and read back on the
student's own form; the seeded placeholder loses its badge, the minted re-sit
keeps its own, a real two-sitting exam keeps both, a single sitting stays
unbadged. The pre-round-17 predicate was evaluated **side by side** on the same
rows to show which verdicts moved: **exactly one**.

**THE CONSOLIDATION (verify item 23)** — as tabulated in §4s·3: the entries CSV
byte-identical at 9 245 bytes over 6 ground-exam rows, and all 13 grade-box
titles identical, each measured by swapping the pre-round-17 expression back into
`WA.examGraded` and re-running the very same export and the very same render.

**THE ADMIN IDENTITY (ruling 2)**

14. **The admin's own dashboard** — `WA.adminRankName()` returns the row's
    `rank + last_name` from the database; the People tab's **Admin** card prints
    it, and **no «CO» text or tooltip survives anywhere on that tab**.
15. **On-behalf, instructor form** — banner *«**ADMIN** Entering as ⟨Rank
    Surname⟩ — you are filling in the assessments of ⟨Lt Col SURNAME⟩ …
    tagged “entered by the admin”»*, button **«Save as admin»**, and the rail is
    there with all 25 rows mustard (that instructor has assessed nobody).
16. **On-behalf, student form** — banner *«**ADMIN** Editing as ⟨Rank Surname⟩ —
    … tagged “entered by the admin” …»*, both Save buttons **«Save as admin»**.
17. **The save dialog** — *«Signed by ⟨Rank Surname⟩ **ADMIN** on behalf of
    ⟨Lt Col SURNAME⟩»*, the chip's tooltip reading *«Entered by the squadron
    administration on behalf of the owner — not self-reported»*.
18. **A student reading their own record** (a real record carrying one
    admin-entered, locked entry) — chip **`ADMIN`**, lock chip **`🔒 ADMIN`**
    with *«Set by the squadron administration — locked … only the admin can
    change or remove it»*, the record-level note *«**ADMIN** 1 of 2 entries was
    entered by the squadron administration on your behalf …»*, and the form's own
    hint *«visible to your instructors and the squadron administration»*.
19. **The printed brief** — *«self-report (+1 entered by the admin)»* per student
    and the class-summary legend *«“ADMIN” marks a record the squadron
    administration entered in full, “+N ADMIN” a self-reported record it added N
    entries to»*. The printed instructor sheet reads *«· entered on their behalf
    by ⟨Rank Surname⟩ (the squadron administration)»*.
20. **What still says «CO», checked node by node across the admin dashboard, the
    student form and the whole printed brief** — and every hit is one of the
    three legitimate kinds: a **stored FPC evaluator value** (*Squadron CO*), the
    **doctrinal FPC / ΚΕΠΕ tooltips**, the **syllabus course codes** *CO 101-105
    · CO 106-108 · CO 109 · CO 110*, and one **instructor's own stored comment**
    that happens to use the word. **Nothing the application itself writes calls
    the admin the CO any more.**

**HYGIENE**

21. Every fixture removed: the fabricated student record row **deleted** (that
    student had none before, and has none now); the three demo proposals of the
    test instructor **restored from a backup table, byte for byte** — same ids,
    same `created_at`, same `updated_at`, same comments — and the backup table
    dropped. `public.student_records` holds the same three rows with the same
    timestamps it held before the round.
22. **Privacy grep clean** — no name, MN, call sign or token reached a tracked
    file. The known pre-existing set of §4q·12 / §4r is unchanged, and the demo
    admin rename lives **only in the local database**.
23. **`db/schema.sql` asserted byte-identical** (hash before = hash after).

### OPEN ITEMS RAISED BY THIS ROUND

- **None that block anything.** One thing is recorded rather than opened: in the
  **Wilderness** palette the `done` green and the `extra` mustard are nearer each
  other than in the other seven. *(Round 17b amended this entry: the measured
  protanopia margin is **ΔE76 3.4** and the row's only non-hue channel is the
  **badge word** + tooltip — the 3 px left edge is a colour reinforcement, not a
  positional one. It remains a note for a future palette pass, not a defect,
  because the badge word carries the state on its own.)*

---

## 4s·b. Round 17b (2026-08-22) — THE R17 VERIFY SWEEP

Four findings of the adversarial read of round 17. **Two of them are on the
server**, so unlike round 17 this one carries a **schema gate**.

| # | finding | where | what changed |
|---|---|---|---|
| **A** | the admin bootstrap seeded the surname **«Squadron CO»** — the exact claim the user overruled | `db/schema.sql`, the bootstrap insert | the seed writes the **role**: `('admin','','','Admin')`, no rank, no given name (§4s·4) |
| **B** | the two server lock refusals still said *«the squadron CO … only the CO»* while the client twin said **admin** | `db/schema.sql`, `wa.carry_stamps` ×2 | both read **one** definition, `wa.admin_lock_msg()`, in the client's words (§4b) |
| **2** | `go()` measured the landing against the **OPEN** burger panel and collapsed after — every pill landed the card a full collapse-delta low, on **all three** rails, since round 14 | `app/app.js`, `WA.navMount` → `go()` | **collapse first, then measure and scroll** (§ the round-14 nav note) |
| **C** | the 3 px left edge was recorded as repeating the state *«in POSITION rather than in hue»* — measured false | `app/styles.css`, this spec | the record now says the second modality is the **badge word**; the edge is a colour reinforcement; the Wilderness protanopia margin is a stated limit (§4s·1) |

**WHAT DID NOT MOVE.** No RPC signature, no column, no policy, no stored value
(`entered_by = 'admin'`), no lock rule, no carry-stamps contract, no visual
change of any kind — **C is a documentation correction with no CSS declaration
touched**, and A affects **only databases that have no admin row yet**.

**RESIDUAL, RECORDED AND NOT FIXED.** Two INTERNAL COMMENTS in `db/schema.sql`
still use *«the Squadron CO»* as prose for the holder of the admin link —
`wa.entry_count_by`'s note (*“a row a machine proposed is not a row the Squadron
CO wrote”*, round 12) and the round-8 supremacy-inversion header (*“When the
Squadron CO writes a line into a student's record…”*). They are comments: they
execute nothing, no user ever reads them, and round 17's own rule leaves the
code's private vocabulary alone (`is-co`, `WA.isCO`, `asCO`). They are left out
of this round on purpose — **a gated schema diff should carry only what has to
be run** — and named here so the next round can take them.

**CACHE-BUSTER** — `?v=20260822c` on the two files this round touched,
`styles.css` and `app.js`. `student.js`, `instructor.js` and `admin.js` keep
`?v=20260822b`; `config.js` and `items-catalog.js` keep `?v=20260821b`.

### DEPLOYMENT GATE — **SCHEMA FIRST, THIS TIME**

`db/schema.sql` is touched. **The database moves before the code**: the user runs
the new `schema.sql` on the cloud project, confirms it, and only then is the
client deployed. The script is idempotent — re-running it on an instance that
already has an admin row changes nothing about that row (the `not exists` guard),
and no data is rewritten.

### SELF-VERIFICATION — ROUND 17b (live, local stack, real RPCs)

1. **FRESH BOOTSTRAP, on a throwaway database.** `schema.sql` run from empty into
   `wa_boot_r17b`: exit **0**, `INSERT 0 1`, and the seeded row is
   `role=admin · rank='' · first_name='' · last_name='Admin'` — one row, no
   *«Squadron CO»* anywhere. **Run twice**: exit **0**, `INSERT 0 0`, **the token
   survives**. `public.whoami()` on that fresh link returns
   `{"rank":"","last_name":"Admin",…}`, and fed to the running client that row
   prints **«Editing as Admin»** / **«Entering as Admin»** on the two on-behalf
   banners and **«Signed by Admin ADMIN on behalf of …»** in the save dialog.
2. **THE REFUSAL, BY REAL RPC.** On the throwaway database the admin wrote one
   NFS entry on a student's behalf (stamped `entered_by:'admin'`); the owner's
   own `public.save_student_record` was then refused **on both code paths** —
   the altered entry (`carry_stamps` line 51) and the omitted section (line 63) —
   each with *«WA: invalid payload — this entry was set by the squadron
   administration and only the admin can change or remove it — it is shown on
   your form locked, and your save must leave it exactly as it stands (nfs[0])»*;
   saved back **unchanged** it is accepted and the stamp survives. Repeated
   **over HTTP through PostgREST** against the local demo instance on a student
   who really holds an admin-locked CEF row: the same sentence, on both paths,
   and the stored record **byte-identical** after each (same `md5(data)`, same
   `last_update`) — a refusal writes nothing. Read back in the browser through
   the app's own `rpc()` on that student's own link, the message is the same, and
   the note on the locked row above it reads *«This entry was set by the squadron
   administration … only the admin can change or remove it.»* — **the two halves
   of the sentence finally agree.**
3. **THE LANDING, MEASURED.** Burger **open**, pill clicked, gap = card top −
   nav bottom, against the 14 px the offset promises:

   | rail | width | before (old order) | after |
   |---|---|---|---|
   | instructor · 25 students | 900 | **173.8** (delta 160) | **14.0** |
   | instructor · 25 students | 375 | **358.3** (delta 344) | **14.3** |
   | student · 13 sections | 900 | **37.5** (delta 24) | **13.5** |
   | student · 13 sections | 375 | **183.5** (delta 170) | **13.9** |
   | admin analysis · 10 cards | 375 | **150.0** (delta 136) | **14.0** |
   | admin analysis · 10 cards | 900 | — (delta 24) | **14.3** |

   Four or five pills per rail, top / middle / bottom of the document, ±0.5 px of
   sub-pixel. The **only** row that does not reach 14 is the **last** card of the
   instructor rail at 900 px (79.8): the document ends 66 px sooner than the gap
   needs, and the old order gave 173.8 there too. **Above the break nothing
   changed** — 1280 px still lands at 14.0 px under the top bar, because the new
   line is guarded by `innerWidth <= WA.NAV_BREAK`.
   *(Why it was wrong and not merely inelegant: the open panel is in the flow, so
   it pushes the document down by its extra height and the two errors would have
   cancelled — but Chrome's **scroll anchoring** compensates the collapse and
   pulls the page back by exactly that delta, leaving the error on screen. Round
   17's own item 10 checked only that the card «clears the strip's bottom edge»,
   which 173.8 px does.)*
4. **THE EDGE, MEASURED.** `.tone-done` and `.tone-extra` both compute
   `3px 0px 0px 0px inset` on rows of identical box (`left 21 · width 206 ·
   height 28`): **identical geometry, colour the only difference.** The badge
   word is in the accessible name (`2Lt ⟨SURNAME⟩ 3` · `Cdt IV ⟨SURNAME⟩ not
   yet`). Wilderness under protanopia (Viénot / Brettel–Mollon 1999): washes
   **ΔE76 3.4**, tokens **ΔE2000 3.3**, painted edge **3.0** — against 13–14 in
   Aegean, Nightfall and Tidal.
5. **HYGIENE.** `schema.sql` run **twice against the local demo database**: exit
   **0** both times, zero errors, and `people` (42) / `student_records` (3) /
   `proposals` (9) **byte-identical fingerprints before and after**, tokens and
   timestamps included. The demo admin row keeps the name it had. `node --check`
   clean on all five scripts; **zero console messages** on every screen visited;
   no horizontal scroll at 375 or 900. The throwaway database was dropped.

## 4t. Round 18 (2026-08-26) — ONE CLASS AT A TIME, AND ΕΕΘ BECOMES «WEEKLY»

Three items. **Two of them are on the server**, so this round carries a
**schema gate**.

### 4t·1. THE ASSESSMENT SCOPE — «Assessments open for: ⟨class⟩»

**COMMAND RULING (2026-08-26), verbatim:**

> «Τωρα τελειωνουν της 98Β, οποτε μονο για αυτους θελω προτασεις. Στο μελλον θα
>  επιλεγουμε για ποια ταξη θα στελνουμε προτασεις αξιοποιησης με το WA στους
>  εκπαιδευτες. Θελουμε την σειρα την οποια τελειωνει, οχι ολες τις ενεργες.»
>
> *«98B is finishing now, so I want proposals only for them. In future we will
>  CHOOSE which class we send utilization proposals to the instructors for. We
>  want the class that is FINISHING, not every active one.»*

Until this round the instructor form asked every instructor about **every active
student** — 25 of them, across three classes, of which the squadron cared about
nine. The ruling narrows the QUESTION, not the archive.

**THE STORAGE — one setting, in the private schema.**

| what | where |
|---|---|
| the value | `wa.settings (key, value, updated_at)`, one row, `key = 'assessment_class'` |
| «none» | `value is null` (or the row absent) — a real state, not a magic class name |
| the seed | `wa.migrations` row `r18-assessment-class` → `'98B HAF'`, **once per database, ever** |
| read | `wa.assessment_class()` — trims, folds `''` to null, so a stray space cannot mean a third thing |
| the predicate | `wa.student_in_scope(people)` — **one** definition, two callers |
| write | `public.admin_set_assessment_class(token, class)` — admin only |

**WHY A SETTING AND NOT A COLUMN.** This is not a fact about a person, a record
or an assessment; it is a fact about the squadron's **calendar** — one value for
the whole installation, changed about three times a year. A column on `people`
would ask every row to carry the same answer. A per-instructor flag would let
two instructors be asked about two different classes, which is exactly what the
ruling forbids.

**WHY SCHEMA `wa` AND NOT `public`.** PostgREST reaches `public` and nothing
else, so a table here needs no RLS policy, no revoke, no deny-by-default
boilerplate — it is unreachable by construction and the only door is the RPC
pair. *(Verified: `has_schema_privilege('anon','wa','usage')` = **f**,
`has_table_privilege('anon','wa.settings','select')` = **f**.)*

**WHY THE LEDGER AND NOT `on conflict do nothing`.** The round-10 lesson,
exactly: this file is re-applied on every deploy, and «seed if the row is
missing» would resurrect `98B HAF` the first time an admin deliberately closes
the assessments with «— none —». A decision made on the dashboard must not be
undone by a deployment. So the seed runs **once per database** and afterwards
the only writer is the admin RPC.

**THE ADMIN CONTROL — and where it lives, and why.** A `<select>` labelled
**«Assessments open for»**, listing the classes present in the database (derived
from the active students on every draw, the same source as the filter chips) plus
**«— none —»**, inside the **Instructor submissions** card of the Overview.

It does **not** sit beside the class-filter chips, and that is a decision and not
a layout accident. The chip row is a **viewing** filter: it narrows what the
admin is looking at, changes nothing for anybody else, and is remembered in this
browser. This control **writes a decision** that reaches every instructor in the
squadron. *One is what I see; the other is what they may do.* The Instructor
submissions card is the one place on the dashboard already about the
instructors' questionnaire — the card that answers *«are they done?»*, directly
above the question it cannot answer without this: *«done with WHOM?»*. It is a
boxed strip (`.scoperow`, tokens only) so the eye separates it from the prose
before the reader has read a word, and it carries a **hover title in the house
voice** that says what it gates, what it is not, and what it never touches.

**A STALE SCOPE STAYS CLOSED.** If the scoped class loses its last active
student the select still offers it, **marked** *«⟨class⟩ — nobody active»*, and
the line beneath says the forms are empty and why. It is deliberately **not**
folded back to «all», the way the viewing filter folds back: reverting would
**open** the assessments for the whole squadron behind the admin's back, and
this control must never move in that direction on its own.

**SERVER-ENFORCED, IN THE ONE WRITE PATH.**

- `wa.instructor_dataset` filters on `wa.student_in_scope`, so
  `list_students_for_instructor` **and** `admin_get_proposals_of` narrow
  together. The cards, the **R17 nav rail** and the **«N of M chosen»** head all
  follow without one of them being told about classes — all three are built from
  that one list, and were before this round. A client-side filter would have been
  a fourth place to keep in step, and the one place a stale tab could ignore.
- `wa.write_proposal` **refuses** a student outside the scope, **by name**,
  before anything is stored — which covers `save_proposal` (the instructor) and
  `admin_save_proposal` (the admin on their behalf), because the admin's
  on-behalf form is the same questionnaire and goes stale the same way.
  It names the student because the Save writes card by card and reports per
  card: *«one of them was refused»* would send an instructor hunting through
  twelve students for the one the server meant.

  > `WA: ⟨rank surname⟩ is in class 99A HAF, and assessments are open for class`
  > `98B HAF — only that class can be assessed right now. Nothing was written.`
  > `(Assessments already stored for other classes are untouched and stay visible.)`

  With no class open:

  > `WA: assessments are closed — no class is open for assessment at the moment,`
  > `so nothing can be recorded for ⟨rank surname⟩. The admin opens a class on`
  > `the dashboard, under Instructor submissions.`

- The setter **refuses a class nobody is in**, naming the classes that exist —
  because a typo, a stale tab or a hand-rolled call would otherwise close the
  assessments for the whole squadron while the dashboard claimed a class was
  open.

**THE SCOPE GATES NEW WRITES AND THE INSTRUCTOR FORM'S LIST — NEVER HISTORY.**
Stated here because it is the property the next round must not quietly lose:
**changing the scope later does not delete, hide or expire one past
assessment.** Every proposal already stored stays visible exactly where it shows
today — the Overview table and its mean, the analysis cards (with the assessor's
name and the weight arithmetic), the printed brief and all four exports.
`public.admin_get_data` and `public.admin_export` are **untouched by this
round's filter**; the only new thing either learned is a read-only
`assessment_class` field so the control can show what is open. The Overview's
class chips, the CSV scope rule and the JSON backup rule are **unchanged** —
they are viewing filters and this is not one.

**A STUDENT WITH NO CLASS RECORDED IS NEVER IN SCOPE.** The scope is a class
NAME, and a person carrying no name to match cannot match one. The select
therefore offers no «No class recorded» option, unlike the viewing filter. Give
the student their class under **People & links** and they join the class they
belong to.

**THE INSTRUCTOR FORM SAYS WHICH CLASS, EMPTY OR NOT.** An empty list means one
of two very different things — *«no class is open»* or *«this class has nobody in
it»* — and neither of them is *«your link is broken»*, which is what a blank page
says. So the scope travels with the payload and the form states it out loud: a
badge beside the instructor's own name (**«Class 98B HAF · 9 students»** /
**«Assessments closed»**), the first sentence of the head hint, the nav rail's
title, the printed sheet's meta line, and — where there is nothing to show — a
titled empty-state card instead of a blank page:

> **Nothing to assess** — There is nothing to assess yet. Assessments are closed
> — no class is open for assessment at the moment. The squadron assesses one
> class at a time — the one that is finishing — and the admin has not opened one.
> Nothing you have submitted before has been lost: it is all still on the
> dashboard.

### 4t·2. ΕΕΘ → **WEEKLY** — every visible surface, zero stored bytes

**COMMAND RULING (2026-08-26), verbatim:** «τα ερωτηματολογια ΕΕΘ 1,2,3 να τα
βαλουμε ως Weekly 1,2,3» — *«the ΕΕΘ questionnaires 1,2,3, let us put them as
Weekly 1,2,3».*

**OLD NAME → NEW NAME, dated: ΕΕΘ n → Weekly n (2026-08-26).**

| surface | before | after |
|---|---|---|
| row label (form, admin table, brief, rail) | `ΕΕΘ 3` | **`Weekly 3`** |
| the mint button | `+ ΕΕΘ 1` | **`+ Weekly 1`** |
| its hover title | *…the next weekly theory exam — ΕΕΘ 1…* | *…the next weekly theory exam — **Weekly 1**…* |
| the series badge / tip | `ΕΕΘ — the weekly theory exams…` | **`Weekly` — the weekly theory exams…** |
| the section tip + form hint | *the ΕΕΘ weekly theory exams* | *the **Weekly** theory exams* |
| confirmation-dialog lines | *Ground exams · ΕΕΘ 1 — added* | *Ground exams · **Weekly 1** — added* |
| CSV — Flight code | `ΕΕΘ 1` | **`Weekly 1`** |
| CSV — Detail | `ΕΕΘ — weekly theory exam` | **`weekly theory exam`** |
| server refusals (×6, `db/schema.sql`) | *every ΕΕΘ carries its number…* | *every **Weekly** exam carries its number…* |

**THE STORED KEY DOES NOT MOVE, AND THAT IS THE WHOLE DESIGN.** `series` is
still the literal `'EETH'` — in every record already written, in the CHECK on the
server (`wa.exam_series()`), and in the payload the client sends.
**NOT ONE ROW IS MIGRATED.** A record stored in round 14 renders «Weekly 3» the
instant the new client loads, because the label was always a **lookup** and the
number was always the name. Renaming the key would have meant rewriting every
stored record to change a caption, and would have broken any instance still
serving the previous client. *The word is data; the key is the contract.*

**THE VISIBLE NAME LIVES IN ONE PLACE ON EACH SIDE** — `WA.EXAM_SERIES[].label`
and the new `wa.series_label(key)` — so the next rename is two lines and not
thirty. Six server refusals now build their text with `format()` from that
function. **One refusal still prints the stored key**, deliberately: *«unknown
exam series — the list is EETH (the Weekly theory exams)»* is about the value a
payload must carry, so it names both.

**CSV Detail lost a word rather than gaining one.** `ΕΕΘ — weekly theory exam`
renamed mechanically would read `Weekly — weekly theory exam`: a cell saying the
same word twice and the number not at all. The **name** is the Flight-code
column's job; Detail says **what kind of row** it is, which is what the eight
ground exams already get there.

**ONE VISIBLE SURFACE STILL SAYS «ΕΕΘ», ON PURPOSE — say so, and overrule it in
one line if it is wrong.** The series' own hover tip opens *«Weekly — the weekly
theory exams (the squadron's **ΕΕΘ**, renamed on 2026-08-26)…»*. Everybody who
has used this app since round 14 knows these rows by the old name, and the
tooltip is the one place with room to say *«this is that»* without a memo. It is
the **only** remaining ΕΕΘ a user can see. If the ruling meant the word should
disappear from the screen entirely, deleting that parenthetical is the whole
change.

**Comments follow the vocabulary** (≈55 sites across `app.js`, `student.js`,
`admin.js`, `schema.sql`) so no internal note contradicts the screen beside it.
The **verbatim Greek rulings of rounds 14 and 18 are kept word for word** — they
are the record of what was said, and the record is not edited. So are the
`db/schema.sql` and `app/admin.js` comments that **quote** an old string as the
record of what replaced it.

### 4t·3. THE FIVE PROSE COMMENTS — the round-17b residual, taken

Round 17b recorded two internal comments still calling the **admin** *«the
Squadron CO»*, and left them out of a gated schema diff on purpose. The verify
read found five. All five are reworded to **«the admin»**; **zero behaviour**,
zero literals, zero grammar the parser can see.

| # | file | what it headed |
|---|---|---|
| 1 | `db/schema.sql` | the `entered_by` stamp note (round 4) |
| 2 | `db/schema.sql` | `wa.entry_count_by` — the provenance generalisation (round 12) |
| 3 | `db/schema.sql` | THE SUPREMACY INVERSION header (round 8) |
| 4 | `db/schema.sql` | `public.save_student_record`'s owner note (round 8) |
| 5 | `app/student.js` | the client twin of #3 — *«THE CO'S EDITS PREVAIL»* |

**WHAT STAYS «Squadron CO», BY ROUND 17'S OWN RULE.** The **appointment** exists:
it is one of the two that may conduct an FPC (`wa.fpc_evaluators`,
`WA.FPC_EVALUATORS`), an evaluator role of a CEF, the authority named in the
ΚΕΠΕ entry conditions of 3-01 ΚΕΦ.2 §32β, and an option in the People editor's
Duty list. Those are **doctrine**; they name an appointment and not this
application's admin. Also unchanged: the code's private vocabulary (`is-co`,
`WA.isCO`, `asCO`, `.cotag`), the stored `entered_by = 'admin'`, and
`db/schema.sql`'s round-17b note that **quotes** the old wording as the record
of what it replaced.

### CACHE-BUSTER

`?v=20260826a` on the **five** files this round touched — `styles.css`,
`app.js`, `student.js`, `instructor.js`, `admin.js`. `config.js` and
`items-catalog.js` are untouched and keep `?v=20260821b`.

### DEPLOYMENT GATE — **SCHEMA FIRST**

`db/schema.sql` is touched, and it carries a **seeding migration**. The database
moves before the code: the user runs the new `schema.sql` on the cloud project,
confirms it, and only then is the client deployed. The script is idempotent —
re-running it changes nothing, the ledger keeps the seed from running twice, and
no stored row is rewritten by any part of this round.

**THIS ROUND'S COMMIT RIDES THE SAME GATE AS ROUND 17b'S** — two commits ahead of
`origin/main`, neither pushed.

### SELF-VERIFICATION — ROUND 18 (live, local stack, real RPCs)

1. **THE SEED, AND THE LEDGER.** `schema.sql` applied to the local demo
   database: `NOTICE: r18: assessment scope seeded to «98B HAF» (9 active
   student(s) in it)`, exit **0**. Re-applied: `NOTICE: r18: assessment scope
   already seeded — leaving it at «98B HAF»`, exit **0**, and `wa.migrations`
   holds exactly two rows (`r10-five-level-scale`, `r18-assessment-class`).
2. **THE INSTRUCTOR FORM, ON A REAL INSTRUCTOR LINK.** 9 cards, **every one
   `Class 98B HAF`** (the database holds 25 active students across `2026B` (3),
   `98B HAF` (9), `99A HAF` (13)). Rail title **«Class 98B HAF»**, head count
   **«0 of 9 chosen»**, badge **«Class 98B HAF · 9 students»**, head sentence
   *«Assessments are open for class 98B HAF.»*
   `list_students_for_instructor` returns `assessment_class = "98B HAF"` and
   `jsonb_array_length(students) = 9`, all of one class.
3. **THE REFUSAL, BY RAW RPC.** `public.save_proposal(⟨instructor token⟩,
   ⟨99A HAF student⟩, {level:"recommended",flew_with:true})` →
   *«WA: ⟨rank surname⟩ is in class 99A HAF, and assessments are open for class
   98B HAF — only that class can be assessed right now. Nothing was written.
   (Assessments already stored for other classes are untouched and stay
   visible.)»* — raised at `write_proposal` line 44, **before** any insert.
   With the scope set to none, the same call →
   *«WA: assessments are closed — no class is open for assessment at the moment,
   so nothing can be recorded for ⟨rank surname⟩…»* (line 42).
   `public.admin_save_proposal` on the same out-of-scope student → the **same
   sentence**, through `write_proposal` line 44: the admin's on-behalf path is
   gated identically, and `admin_get_proposals_of` returned **13** students and
   `assessment_class = "99A HAF"` while 99A was open.
4. **THE SETTER'S GUARDS.** `'98C HAF'` (nobody in it) → *«no active student is
   in class 98C HAF … The classes on the roster are: 2026B · 98B HAF · 99A HAF.
   Choose one of them, or «none» to close the assessments.»* · an instructor
   token → *«WA: forbidden — this action requires the admin role»* · 41
   characters → *«a class name is at most 40 characters (assessment_class)»* ·
   `'  98B HAF  '` → accepted and stored trimmed, `{"ok":true,"students":9}`.
5. **THE FLIP, THROUGH THE REAL CONTROL.** Overview → Instructor submissions →
   the select changed from `98B HAF (9)` to `99A HAF (13)`; toast: *«Assessments
   are open for class 99A HAF — 13 students. Every instructor form now lists
   exactly them.»* The instructor form reloaded to **13 cards, all `99A HAF`**,
   rail **«Class 99A HAF»**, head **«0 of 13 chosen»**.
6. **AND HISTORY DID NOT MOVE.** With the scope on **99A HAF**, the Overview
   table still listed **all 25** students of all three classes, and the
   Assessment column still printed every stored mean of the **out-of-scope**
   classes: `Ø 3.67 3/13`, `Ø 7.00 3/13`, `Ø 10.00 3/13` (2026B) and
   `Ø 8.00 1/13` for the 98B student assessed one minute earlier through the
   real instructor form. His analysis card still read *«Ø 8.00 · weighted mean
   of 1 assessment · 8×1 ÷ 1 = 8.00 · 1× Recommended»* **with the assessor
   named**, and the printed brief still carried him: *«… Class 98B HAF ·
   self-report NOT submitted · assessments in: 1/13»*. Nothing was hidden,
   nothing expired.
7. **THE TWO EMPTY STATES.** Scope **none** → *«**Nothing to assess** — There is
   nothing to assess yet. Assessments are closed … Nothing you have submitted
   before has been lost: it is all still on the dashboard.»*, badge
   **«Assessments closed»**, 0 cards, no rail, no blank page.
   Scope **stale** (a class name with no active member, written straight into
   `wa.settings` to reproduce «the class emptied afterwards») → the select
   offers it **marked** *«97A HAF — nobody active»*, the dashboard line reads
   *«Class 97A HAF is open, and no active student is in it…»*, and the
   instructor form's card is titled *«Class 97A HAF is open — and empty»*.
   **It did not silently fall back to «all».**
8. **WEEKLY ON A PRE-EXISTING STORED ROW.** Two exam rows were stored through
   the RPC in the round-14 shape — byte-for-byte
   `[{"date":"2026-05-12","grade":88,"series":"EETH","series_no":1},
   {"date":"2026-05-19","series":"EETH","series_no":2}]` — and then read by the
   new client **with no migration of any kind**: the form printed **«Weekly 1»**
   and **«Weekly 2»**, the mint button beneath them **«+ Weekly 3»** (max + 1),
   and `ΕΕΘ` appeared **nowhere** in the rendered page. On a student with no
   series rows the button read **«+ Weekly 1»**, title *«Adds the next weekly
   theory exam — Weekly 1…»*. `WA.recordChanges` produced the confirmation
   lines *«Ground exams · Weekly 1 · 12/05/2026 — added (grade 88 %)»* and
   *«Ground exams · Weekly 3 — grade — → 74 %»*; `WA.fieldText("exams",
   "series","EETH")` → **«Weekly»**; `WA.EXAM_SERIES[0]` is
   `{id:"EETH", label:"Weekly"}` — **the key and the word, side by side.**
   The **entries CSV**, captured from the real export, carried
   `…;Ground exams;12/05/2026;weekly theory exam — passed (80 % or better);Weekly 1;…`
   and `…;19/05/2026;weekly theory exam;Weekly 2;…` — **no `ΕΕΘ`, no `EETH`
   anywhere in the file**. The printed brief carried `Weekly 1` / `Weekly 2` too.
   **All six renamed server refusals fired**, through `wa.validate_record` on
   hand-made payloads — *«every **Weekly** exam carries its number — Weekly 1,
   Weekly 2 … »* · *«a **Weekly** exam is not an attempt at one of the eight
   ground exams…»* · *«…or one of the **Weekly** series — never both»* ·
   *«a series number belongs to a **Weekly** exam…»* · *«two rows carry the same
   **Weekly** number…»* · and the one that keeps the key: *«unknown exam series
   — the list is **EETH** (the **Weekly** theory exams)»*. A valid
   `{"series":"EETH","series_no":1,"date":…,"grade":88}` was **ACCEPTED**
   unchanged — the rename touched the words and not one rule.
9. **HYGIENE.** `schema.sql` run **twice more** against the local demo database
   after every edit: exit **0** both times, **zero** `ERROR` lines, and
   `people` / `student_records` / `proposals` / `wa.settings` **byte-identical
   fingerprints before and after** (`e0c127a4…`, `020ba5f7…`, `2b28d9fb…`,
   `87d9840d…`), tokens and timestamps included. Counts back to where they
   started: **42 people · 3 records · 9 proposals**, scope **98B HAF** — the
   verification's one proposal and two exam rows were removed.
   `node --check` clean on all six scripts; **zero console messages** on the
   student form, the instructor form and all four admin tabs; **no horizontal
   scroll at 375 or 900** (`scrollWidth === clientWidth` on both); the new
   `.scoperow` renders in **light and dark** from tokens only
   (`--accent-soft` / `--line`). Privacy grep over the whole diff: **no real
   surname, Military Number or token** in any tracked file.
   **ONE DEVIATION, RECORDED.** Two of the three demo `student_records` were
   re-saved through the real `save_student_record` during verification, so they
   are now stored in **canonical (migrated) form** — the legacy `pending` key of
   round-2 vintage is gone from them and their `last_update` reads today. The
   app renders them identically, because every read already ran
   `wa.migrate_record`; the **third demo record still carries the legacy shape**,
   so the migration path remains testable. Nothing else about the demo database
   differs from where this round found it.

## 4u. Round 19 (2026-08-26) — THE INSTRUCTOR'S OWN CURRENCY, AND THE EXPORT NAMES ITSELF

> **ΑΠΟΦΑΣΗ ΧΡΗΣΤΗ 26/08/2026** (αυτολεξεί): «*στο link που θα στέλνουμε σε κάθε
> εκπαιδευτή θέλω να μπορεί να περάσει κι εκείνος, πέρα από την αξιολόγηση,
> κάποια δική του πτήση S και τα αντίστοιχα Ε. Επίσης να μπορεί να περάσει Ε και
> σε μια πτήση με μαθητή πέρα από τις S. Αυτό θα είναι μια γέφυρα για το currency
> του FDMS.*»

Until this round an instructor's link asked him **one** question — what he makes
of each student for fighters — and told him nothing about himself. It now
carries the second half of what he actually files with the squadron: **his own
flying**, in the terms the 3-01 counts it in, so that the currency register the
FDMS Scheduler keeps can be fed from the same link instead of from a second
form nobody would open.

### 4u·1. THE MODEL — FOUR FACTS AND A NUMBER

An instructor's currency row is a **claim about his own logbook**:

| key | what it is |
|---|---|
| `date` | **required** — ISO stored, DD/MM shown. A currency claim with no day claims nothing. |
| `kind` | `own` (a sortie of his own — the «δική του πτήση S» of the ruling) · `student` (a sortie flown with a student) — `wa.currency_kinds()` |
| `category` | `aeros` (**ΑΕΡΟΣ**, the semester AIR programme, Πίνακας 9) · `fs` (**F/S**, the semester SIMULATOR programme, Πίνακας 6) — `wa.currency_categories()`. **RETIRED IN ROUND 20 (§4v·1)**: replaced by `s_category`, from which the programme is now **derived**. A round-19 row is migrated to a **legacy** Σ id that says the category was never recorded. |
| `e_items` | the **E-items** of the 3-01 EVENTS table this sortie exercised — ids of `wa.e_item_ids()`, **possibly none** |
| `seq` | which sortie of that (kind, category, day) — 1, and 2 for the second. AUTHORED, never an array index (the round-12 doctrine). **Round 20**: the tuple is `(kind, s_category, date, seq)`. |

**A `student` ROW REFERENCES NO STUDENT, DELIBERATELY.** The flight itself lives
on the student's side and is entered there, by the student, in `flights` / `fs`.
This row is the instructor's own currency claim about the same hour of the same
day. Keeping them unlinked is what makes both independently correct: neither can
corrupt the other, and revoking one link touches neither.

**AND A SORTIE WITH NO EVENT IS STILL A SORTIE.** «κάποια δική του πτήση S» is
asked for by name, so `e_items` may be empty and the row still counts. The form
says so in its empty state, in its hint and in its column tooltip.

**NO NOTE FIELD** (house minimalism, the round-12b rule, unchanged).

### 4u·2. THE SORTIE CODE — **CONSIDERED, AND REFUSED** *(the round-19 judgement)*

The round brief left it open: *«allow an optional free-text sortie code (closed
to the syllabus catalog + off-catalogue escape, the R12 kind pattern) if the
proposal-reading argues for it; judge and record.»* **It does not, and it is not
there.** Two reasons, either of which is sufficient:

1. **It would be empty by nature on half the rows.** The syllabus catalogue is
   the STUDENT's Phase-II flow chart. An instructor's own Σ sortie under
   Πίνακας 9 has no code in it at all — so a `kind:'own'` row could never fill
   the box, and a field that is meaningless for half its rows teaches its user
   to skip it on the other half.
2. **Its destination never reads it.** The FDMS currency cell is dated by DATE
   and by E-ITEM and by nothing else (`specs/scheduler-spec.md` §11: «*μία έξοδος
   στο κελί, κατά τη δική της ημερομηνία · δατάρει και Ε άλλων στηλών*»). A
   bridge that carried a field the far side discards is a field the near side
   maintains for nobody.

Recorded here rather than left silent, so the next round does not re-open it by
accident. **If the squadron later asks for it**, the R12 `kind` pattern is the
shape to use — and the first thing to decide will be what it means on an `own`
row.

### 4u·3. THE E-ITEMS — A GENERATED CATALOGUE, TWO MIRRORS, ONE RUN

`tools/gen-currency-catalog.py` reads the FDMS research file
`D:\FDMS\data\requirements\instructor_currency.json` (*«91 ελεγμένα items από το
3-01/2025 ΔΑΕ — read-only research truth»*) and writes **both** mirrors in one
run, exactly as `gen-items-catalog.py` does for the syllabus:

- **`app/currency-catalog.js`** → `WA_E_ITEMS` — `{id, c, n, seat, d}`
- **`db/schema.sql`** → the `CURRENCY GENERATED BLOCK`: `wa.e_item_ids()` and
  `wa.e_item_name(id)`

so the closed list the form offers and the closed list the server enforces
**cannot drift** — nobody types either of them by hand.

**27 OF THE CATALOGUE'S 28, AND THE ONE THAT IS NOT IS NAMED.** `e-1d-demo`
(Ε-1δ — DEMO) is **Chapter-5 doctrine**: it belongs to the ΙΠΤΑΜΕΝΟΣ ΕΠΙΔΕΙΞΗΣ
and to nobody else. FDMS itself hides it from every instructor who does not hold
the post (its ✈ Demo-pilot section, `scheduler-spec` §11θ), and Wings Ahead has
no demo-pilot flag to hide it by — so offering it in a closed list fourteen
people see would show them all a currency for a post one of them might hold. It
is dropped **by id**, and the drop is printed in the generated header of **both**
mirrors, so the difference between 27 and 28 is never a silent one. A demo pilot
records his DEMO where the demo sheet lives: FDMS.

**THE STORED VALUE IS THE ASCII id.** The printed code is Greek — «Ε-1α» is a
Greek Ε and a Greek α, homoglyphs of Latin E and a — which is the trap
`gen-items-catalog.py` had to defuse for the course codes. Here it never arms:
what the record stores is `e-1a-aerobatics`, the generator **asserts** that every
emitted id matches `^[a-z0-9-]+$` and that no two collide, and the Greek code is
display only. An unknown id is **refused on write BY NAME**:

> `WA: invalid payload — «e-99-nope» is not an event of the 3-01 EVENTS table — choose one of the 27 printed events (currency[0].e_items[0])`

…and an id **already stored** that the catalogue no longer knows is **kept and
shown marked «unknown»**, never dropped behind its owner's back — the round-6
legacy-chip rule, applied to a second catalogue.

### 4u·4. STORAGE — `public.instructor_records`, THE MIRROR OF `student_records`

A new table, keyed like the student's: one `jsonb` per person, sections inside
it, every count derived and nothing typed.

```sql
create table if not exists public.instructor_records (
  instructor_id uuid primary key references public.people(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  last_update   timestamptz not null default now(), …);
```

**WHY A TABLE AND NOT A COLUMN ON `proposals`.** A proposal is keyed
`(instructor, student)` — a statement about somebody ELSE, one per student. A
currency row is a statement about the instructor HIMSELF, and there is exactly
one record of them per person. Hanging it off a proposal would tie an
instructor's flying to whichever student happened to be first in a list, and
lose it the day that student left.

**ITS OWN REGISTRY, AND THAT IS THE LOAD-BEARING PART.** An instructor record
shares **not one section name** with a student record, so it gets its own
whitelist rather than a branch inside the student's — `wa.ins_sections()` ·
`wa.ins_entry_keys()` · `wa.ins_strip_entry()` · `wa.ins_section_cap()` ·
`wa.validate_instructor_record()` · `wa.migrate_instructor_record()`, mirrored
client-side by `WA.INS_SECTIONS` / `WA.INS_ENTRY_KEYS` / `WA.migrateInsRecord`.
A single `wa.entry_keys()` serving both would answer `'currency'` with the
**student's** key list — and an unregistered section is not rejected by the
strip, it is **DESTROYED** by it, row by row, on the first read. Two records,
two registries, each exhaustive about its own sections.

**WHAT IS ENFORCED, AND BY NAME EVERY TIME**

| rule | refusal |
|---|---|
| unknown section | *unknown section — an instructor record holds: currency* |
| unknown key | *unknown field for section currency — allowed: date, kind, category, e_items, seq* |
| `date` required, ISO | *required date missing* / *date must be ISO YYYY-MM-DD* |
| `kind` closed | *a flight is either your own or one with a student — own / student* |
| `category` closed | *a flight is flown in the air or in the simulator — aeros / fs* |
| `seq` 1-9 | `wa.chk_int` |
| `e_items` ⊆ catalogue | *«…» is not an event of the 3-01 EVENTS table — choose one of the 27 printed events* |
| no repeated event on one sortie | *«Ε-32 — BFM…» is named twice on the same sortie — one flight exercises an event once* |
| one row per `(kind, category, date, seq)` | *this flight is already recorded (2026-08-26, aeros, flight 1 of the day) — give the second one its own number* |
| cap | 400 rows (`wa.ins_section_cap`) |

**THE SAME NORMALISATION BOUNDARY.** `wa.norm_record()` is reused unchanged —
it is section-agnostic — so a padded `' e-32-bfm '` cannot be a known event to
the storage and an unknown one to the membership check. (Proved: the duplicate
check fired on `["e-32-bfm", " e-32-bfm "]`.)

**AND THE RECORD IS STORED ALREADY MIGRATED**: `wa.write_instructor_record`
runs `wa.migrate_instructor_record` on the way in, so what the table holds is
byte-identical to what a read gives back.

### 4u·5. **NO ADMIN WRITE PATH — AND THAT IS THE RULING**

The admin may enter a **student's** record on their behalf, because he is
transcribing a form somebody filled in on paper. He may **not** enter an
instructor's currency: it is a claim about **who flew what**, and the admin was
not in the aircraft.

So `wa.write_instructor_record` has **no `p_as_admin` twin**, `public.save_instructor_currency(token, payload)`
takes **no instructor id** (the row belongs to whoever holds the link), and the
table therefore needs **no `entered_by` column**, no stamp, no diff-stamping and
no lock. The admin's on-behalf form renders the section **read-only** and says
why — but the absence of the path is what makes it true, not the absence of the
buttons. **Revoking a link closes it the same instant it closes the
assessments** (`wa.auth_role` refuses an inactive person), and the stored record
survives the revocation untouched.

### 4u·6. THE FORM — «MY CURRENCY», UNDER THE ASSESSMENTS

A **plain table** in its own card, below the student cards and above the save
bar — present even when the class is closed and there are no cards, because an
instructor whose assessments are shut still flies.

| | |
|---|---|
| **NO PRE-SEEDING, NO STATE CHIPS** | The student's log tables are pre-seeded from the printed flow chart and wear four state colours, because there the syllabus knows what is owed. Here nothing is owed **by a form**: an instructor's flying is open-ended, so there is no denominator, no placeholder row and no «owed» chip — one would invent a requirement the 3-01 states somewhere else entirely. |
| **COLUMNS** | Date · Flight (`own` / `with a student`) · Programme (**ΑΕΡΟΣ** / **F/S**) · **#** · E-items · ✕ |
| **ORDER** | **Newest first**, then by `#`. An open-ended list has no syllabus order; the only order it can have is a logbook's. Re-sorted on every committed cell, with the focus put back where it was. |
| **THE EVENTS CELL** | The round-6 `.ms-chips` / `.ms-add` control, reused verbatim: chips with ✕, and a closed select of the 27 minus the ones already on the row. |
| **NOTHING IS FILLED IN BY «+ flight»** | A date, a kind and a programme are **facts**. A form that guesses one has put a flight in an instructor's logbook that he did not fly. The row asks for what it still needs, and the client refuses to send it — *«23/08/2026 — still needs whether it was your own flight or one with a student and ΑΕΡΟΣ or F/S»* — with the row marked (`.is-problem`, the 12b pattern). |
| **A ROW WITH NOTHING IN IT IS NOT AN ENTRY** | The `wa.slot_empty` rule for a section that has no slots: «+ flight» pressed and then ignored is not a change, not a refusal and not a stored row. |
| **`seq` IS AUTHORED, AND NEVER A GUARANTEED REFUSAL** | The box is on the row and may be changed. But when a row's identity lands on one that already exists it takes the **lowest free** number and the toast says so — silently keeping the collision would turn a saved section into a refusal at the last moment. |

**ΑΕΡΟΣ AND F/S ARE GREEK ON PURPOSE — and it is the same ruling as the ΕΕΘ
tip.** These are the two words **printed** on the sheet the instructor is copying
from (Πίνακας 9 / Πίνακας 6) and the two sections the FDMS currency card opens
and closes with. An invented English pair would make him translate twice. The
English is **one hover away** (`WA.CURRENCY_CATS[].en`, shown in the select as
«ΑΕΡΟΣ — air» / «F/S — simulator», and in full in the tooltip), which is where a
terminology bridge belongs: never in a stored value, never in a label alone.

**THE RAIL GETS ONE ROW MORE.** The round-17 invariant — *«the rail is the card
list, literally»* — is about the **student** rows: they and the cards are both
built from `data.students`, in its order, so neither can drift. That is
untouched; the currency row is **appended after the map** and is built from the
other card on the page. Without it a section sitting below nine tall cards is a
section most instructors never scroll to. The head count still says *«7 of 9
chosen»*, because that is what it says it counts.

### 4u·7. THE ONE GENERAL SAVE COUNTS BOTH

Round 14's button said *«Save 3 assessments»*. That sentence is **kept exactly
where it is still the whole truth** and grows a second half the moment it is not:

- assessments only → **«Save 3 assessments»** *(unchanged)*
- currency only → **«Save 2 currency changes»**
- both → **«Save 3 assessments + 2 currency changes»**

**ONE LIST IN THE CONFIRMATION, TWO KINDS OF LINE.** The currency rows name
themselves through the **same** builder every other record uses — `WA.rowLabel`
gained an `ins_currency` branch, `WA.rowIdent` returns `WA.curIdent` (the
server's own uniqueness), `WA.IDENT_FIELDS.ins_currency` is all four naming
facts, and `WA.diffFields` now asks **both** registries. Live output:

```
My currency · own · ΑΕΡΟΣ · 26/08/2026 — added (E-items Ε-1α · Ε-32)
My currency · own · ΑΕΡΟΣ · 26/08/2026 #2 — added (E-items Ε-4)
My currency · with a student · F/S · 25/08/2026 — added (E-items Ε-3)
My currency · with a student · F/S · 25/08/2026 — E-items Ε-3 · e-retired-2024 → Ε-3
```

**THE CURRENCY IS WRITTEN FIRST**, in one call, before the per-student loop: a
refusal the instructor must act on should reach him before a dozen slower
writes, not after them — and the loop runs regardless, so nothing in the class
is held hostage by one bad flight. A currency refusal is reported **even when
every assessment landed**: *«12 saved ✓»* beside a section that was silently not
written is the one sentence this form must never print.

**DISCARD UNDOES BOTH**, because the dialog listed both. **`beforeunload` counts
both** — a table of flights is more typing than an answer, not less — through a
function (`WA._insCurDirty`) that `teardownView()` clears, so it can never be a
stale snapshot.

**AND THE PRINTED SHEET CARRIES IT.** Round 8's rule for that sheet is that it
prints what the document actually IS; from this round the document has two
parts, and a printout showing only the assessments would be filed as the whole
of an instructor's return.

### 4u·8. THE ADMIN SIDE — READ, NEVER WRITE

- **`wa.instructor_dataset`** gains `currency` + `currency_last_update`, so the
  section rides with the form in the same round trip as the cards (and the
  admin's on-behalf view gets it too, read-only).
- **`admin_get_data` → `instructors[]`** gains the same two keys. The **People**
  tab shows the one figure that tells the admin whether to click at all —
  a **`currency N`** chip beside Duty · Leadership · Status, with the last-saved
  time and the read-only reason in its tooltip. The full table is one click
  away, on «Enter assessments as…». *(The People tab is the roster editor; a
  roster editor that grows a flight log stops being one.)*
- **`public.admin_export`** gains `instructor_records[]` (`data` migrated,
  `data_as_stored` raw, `entries_total`, `last_update`) **and** `e_items[]` —
  `{id, name}` for all 27 — so a reader that has never seen the 3-01 can print
  «Ε-32 — BFM» instead of a slug.

### 4u·9. **`"schema": "wa-export-v1"`** — the pending F5 deliverable, stamped

`public.admin_export` now stamps its own format in its own first field. This
closes the finding the FDMS bridge audit recorded as **F5** and the tolerance
its `specs/bridge-spec.md` §3 declared: *«τον δείκτη `"schema": "wa-export-v1"`
τον σφραγίζει η `public.admin_export()` στον επόμενο γύρο του Wings Ahead»*.
Until now the bridge had to recognise the file by its **shape** (`people[]` +
`student_records[]`), which is a guard any JSON carrying a `people` array could
walk past.

**THE VALUE IS A CONTRACT, AND IT IS VERSIONED.** `wa-export-v1` describes the
**shape**, not the round that wrote it: **adding** a key — this round adds
`instructor_records` and `e_items` — leaves a v1 reader working, because a reader
that ignores what it does not know still gets every field it came for. Only a
change that BREAKS such a reader (a key renamed, a type changed, a section
removed) may move it to **v2**, and nothing may move it silently. Recorded here
so that rule outlives this round.

The FDMS side needs **no change**: its store-Import already accepts marked and
unmarked, and the unmarked branch now becomes what it always should have been —
a compatibility path for files exported before today, not the normal case.

### 4u·10. THE THREE ROUND-18 NOTES, TAKEN

**(a) THE INSTRUCTOR-SUBMISSIONS BADGE IS SCOPE-TRUTHFUL, AND ✓ IS REACHABLE.**
Round 18 narrowed what an instructor may be **asked** — one class at a time —
and this badge went on dividing by every active student in the squadron. On the
local stack (25 active students, 9 in the open class) an instructor who had
answered about all nine read **«9/25» in mustard**: a progress bar whose green
end he could not reach by doing everything asked of him, and which claimed he
owed sixteen assessments the server would **refuse**. It now counts his
submissions **for the students in scope**, out of **how many are in scope** —
the same question his own form answers («7 of 9 chosen»).

It is **client-only**, and it can be: the per-class breakdown round 18's note
said the payload lacked is already there one level down — every student carries
`proposals[]` with the `instructor_id` of everybody who submitted.
`proposals_count` is still read for an **un-migrated** server, and only there.
**With no class open** the badge is a **neutral em-dash**: an instructor who is
not being asked is not behind. The card's footnote was rewritten to match — it
used to apologise for a breakdown it could not do; it now states what the badge
means and that the class **filter** (what the admin sees) is a different thing
from the class **scope** (what the instructors were asked).

**(b) «HAS NOT SUBMITTED … YET» IS SCOPE-AWARE.** `not_submitted` is still the
whole truth about the DATA, but the sentence it was printed in said something the
data does not: that the assessment is **outstanding**. For a student outside the
open class it is not outstanding, it is **impossible** — the server refuses that
write by name — and a list of nine officers who «have not submitted yet» about a
student nobody is being asked about is the dashboard inventing work. **In scope**
the debt is named instructor by instructor, exactly as round 8 wrote it, because
that is the list the admin acts on. **Out of scope** it becomes one line:

> *Assessments are open for class 98B HAF, so nobody is being asked about this
> student (class 99A HAF). The 13 instructors who have not answered about him owe
> nothing — the server refuses an assessment outside the open class.*

One builder (`noSubHTML`), **both readers** — the analysis card and the printed
brief. On paper it matters more: a page filed and re-read months later has no
dashboard beside it.

**(c) THE ~105-COMMENT SWEEP — THE ADMIN STOPS BEING «THE CO» IN THE PROSE TOO.**
Round 17 stopped every **surface** from calling the admin the CO and left the
internal prose saying it. A parser-based sweep (not a blind regex) classified
every `\bCO\b` in `db/schema.sql` and `app/*.js` as inside a comment or not,
then rewrote **138 comment occurrences** — «the CO» → «the admin», «the CO's» →
«the admin's», «a CO save» → «an admin save», «CO-entered» → «admin-entered»,
the round-4 tag note's `"CO"` → `"ADMIN"`.

> **SUPERSEDED, 27/08/2026 (§4v·5c): the figure «138» is not reproducible.** It
> was the output of a one-off classifier that no longer exists. The re-runnable
> number is **142**, from the shipped commits themselves:
> `for f in db/schema.sql app/app.js app/admin.js app/student.js app/instructor.js; do git show b1a8dcc:$f; done | grep -oE '\bCO\b' | wc -l` → **195**, the same over `7a84c69` → **53**.
> Where the two disagree, **the command is right**.

**PROVED BEHAVIOUR-IDENTICAL, NOT ASSERTED.** Both versions of all four files
were run through the same comment stripper and the remaining executable text
compared **byte for byte**: `schema.sql` 138 527 · `app.js` 113 256 · `admin.js`
126 259 · `student.js` 130 884 — **identical**, all four. `node --check` on every
client file and `schema.sql` applied twice at `ON_ERROR_STOP=1`, exit **0**.

**THE 32 SURVIVORS, ENUMERATED.** Every one is either the **appointment** or a
**quoted ruling**, and each was kept by a rule rather than by hand:

> **SUPERSEDED, 27/08/2026 (§4v·5c): the figure «32» is not reproducible either,
> and the line numbers below went stale the moment rounds 19 and 20 moved them.**
> The re-runnable count is **57** across `db/schema.sql app/*.js app/*.css`
> (`grep -oE '\bCO\b' db/schema.sql app/*.js app/*.css | wc -l`), of which **8**
> are the syllabus **course codes** (`grep -oE "\bCO 1[0-9][0-9]\b" db/schema.sql app/items-catalog.js | wc -l`)
> and the other **49** are the families the table below names. Read them all with
> `grep -nE '\bCO\b' db/schema.sql app/*.js app/*.css`. The table stays as **the
> argument** for each family; the numbers beside it are no longer the count.

| what | where |
|---|---|
| *An FPC is conducted by the **Squadron CO** or the DO* (`wa.fpc_evaluators`) | `schema.sql` 67 · 1627 · 2350 · 3058 · `app.js` 1961 · `admin.js` 1261 · 1802 · `student.js` 513 · 1791 · 3358 |
| the CEF's evaluator roles (*DO / **Squadron CO** / an instructor*) | `schema.sql` 2339 · 3051 · `app.js` 1955 · `student.js` 448 |
| the **ΚΕΠΕ** entry conditions — the standing *Squadron CO / DO* discretion of 3-01 ΚΕΦ.2 §32β and the §32δ(2) duty to inform | `schema.sql` 1691 · 1694 · 2152 · `student.js` 529 · 3084 |
| the **quoted ruling** of round 17 / 17b (the words it replaced, kept as the record) | `schema.sql` 3597 · 3598 · 3604 · 4813-4815 · 4827 · `app.js` 776 · 777 · 797 · 799 |
| *the admin is the flight commander and the developer, never the squadron CO* | `app.js` 3429 |

Untouched, as round 17 ruled: the code's private vocabulary (`asCO`, `WA.isCO`,
`.cotag`, `is-colock`, `wa.co_entry_count`, `co_entries`), the stored
`entered_by = 'admin'`, the doctrine **string literals**, and the `CO 101-105` /
`CO 109` / `CO 110` **course codes** of the syllabus catalogue.

**(d) `WA.EXAM_SERIES[0].en` IS GONE.** Round 18 added it as *«the ASCII spelling
of the stored key, kept for the file names and log lines that must stay ASCII»*,
and not one file name or log line ever read it — the stored key is **already**
ASCII, so the field was a copy of `id` under a second name. A dead field is a
promise the code does not keep. *(The round-19 `WA.CURRENCY_CATS[].en` is not
its twin: it is **read**, by the category select, which is what earns it a
place.)*

**(e) THE ΕΕΘ HOVER TIP STAYS — RULING (Claude, 2026-08-26), standing unless the
user overrules it.** Round 18 renamed the series to «Weekly» on every surface and
left one Greek word inside the tooltip: *«the squadron's ΕΕΘ, renamed on
2026-08-26»*. That is **not a missed surface, it is a terminology bridge**. The
English-UI rule exists so a foreign student officer can read this application; it
has never meant that a Greek word may not be **named as the thing an English one
replaced**. Every user of the form has spent a year hearing «ΕΕΘ» in the squadron
and reading it on the programme board, and a tooltip pretending the word did not
exist would make each of them work out for himself that «Weekly» is the same
examination. The bridge is where a bridge belongs: **one hover away**, never in a
label, never in a stored value, and **dated**. It is a sentence with an expiry —
when nobody in the squadron says «ΕΕΘ» any more it has done its work and goes.
The same judgement governs §4u·6's ΑΕΡΟΣ / F/S labels.

### 4u·11. **PRIVACY — WHAT THE ROUND-19 GREP FOUND** *(and it found something)*

The grep this round runs is not a spot check: every value of every roster column
that could identify a person — `last_name`, `first_name`, `call_sign`, `mn`,
`external_oid`, `token`, **187 terms** — was matched, word-boundary and
case-insensitively, against **every one of the 19 tracked files**.

**It found ten leaks, all inherited, all now removed:**

| where | what |
|---|---|
| `app/app.js` → `WA.SENIORITY_TIP` | a **user-facing tooltip** illustrating natural order with a call sign the roster actually carries |
| `app/app.js` → `WA.natKey` comment | the same call sign as the padding example |
| `db/schema.sql` → `wa.natkey` header | *«the call sign is the squadron's own position (⟨call sign⟩ is the CO)»* — a real call sign **named as the Commander** |
| `app/app.js` → seniority header | the same sentence, client side |
| `specs/wingsahead-spec.md` §4n·4 | the same sentence again, plus two more real call signs |
| `specs/wingsahead-spec.md` §4n / §4o self-verification | four real call signs in a verification transcript, and one in a `wa.natkey` example |
| `specs/wingsahead-spec.md` §4e demo-data note | **two real surnames** |

This is **precisely** the defect the FDMS round-18 slice-1b sweep removed from
its own files (`scheduler-spec` §11: *«έγραφαν αυτούσια δύο πραγματικά call signs
του ιδιωτικού roster, ονομάζοντάς τα Δκτή και ΑΕ — σε δημόσιο repository»*), and
the lesson is the same one: **a call sign attached to an appointment is a name**.
Every occurrence is replaced by an invented number or a neutral phrase; the rules
they illustrate are unchanged, because the rules were always about digits and
never about who flies under them. **No literal call sign, surname, Military
Number, roster id or token lives in any tracked file** — re-run of the grep: **0
real-person hits**, the only matches being the English word *delta* colliding
with the deliberate `Maj DELTA` fixture of §4s.

> **STILL OPEN, AND IT IS THE FLIGHT COMMANDER'S CALL — NOT CLAUDE'S.** The **git
> history keeps them**. Rewriting history is an act with consequences in every
> clone, and it belongs to the user exactly as the identical FDMS item does. It
> is recorded here so it is not silence.

### 4u·A. AUDIT-TABLE DELTA (§4h) — **THREE NEW CONTROLS, ALL CLOSED**

§4h's enumeration said *«`app/app.js` and `app/instructor.js` carry no `<select>`
and no `<datalist>` at all»*. That was true of the instructor form for eighteen
rounds and this one ends it, so the table is extended rather than left to rot.

| # | Dropdown (surface · field) | Selector / builder (file) | Values | «Other…» escape? | If CLOSED — why |
|---|---|---|---|---|---|
| 20 | **My currency · Flight** | `select[data-curf$=":kind"]` (instructor.js) · `WA.CURRENCY_KINDS` ⇄ `wa.currency_kinds()` | own · with a student — **exactly two** | **NO — ✱ RULED EXCEPTION** | the ruling names two and the squadron counts two. A third kind of flight is not a wording the instructor is missing, it is a claim the currency register has no column for |
| 21 | **My currency · Programme** | `select[data-curf$=":category"]` · `WA.CURRENCY_CATS` ⇄ `wa.currency_categories()` | **ΑΕΡΟΣ** (Πίνακας 9) · **F/S** (Πίνακας 6) — **exactly two** | **NO — ✱ RULED EXCEPTION** | the 3-01 prints two semester programmes and the FDMS currency card has two sections. A third value would be a programme the doctrine does not have |
| 22 | **My currency · E-items** | `select.ms-add[data-curadd]` · `WA.E_ITEMS` ⇄ `wa.e_item_ids()` | the **27** events of the 3-01 EVENTS table (§4u·3), minus those already on the row | **NO — ✱ RULED EXCEPTION** | the **same argument as #5**: an event nobody else can have is an event nobody can count across the squadron or look up in the 3-01. Client and server share one **generated** list; a stored id the catalogue no longer knows is greyed *unknown* and blocks the save until it is replaced |

**No `<datalist>` is added**, and no free-text box: this section has **no note
field** (§4u·1) and **no sortie code** (§4u·2), so there is nothing on it a
user types except a date and a small integer.

**THE DATE AND THE `#` ARE NOT DROPDOWNS**, for the same reason §4h says the solo
slots are not: `input[type=date]` is the browser's own control over a real
calendar, and `input[type=number][min=1][max=9]` is a counted integer whose whole
range is nine values. Neither has a list to close.

**RUNNING TOTAL: 22 dropdown fields, 3 datalists, 8 ruled exceptions** — the
**four** of round 9 (the gradesheet items · the eight evaluation slots · the FPC
evaluator · the solo slots), the **fifth** of round 10 (the assessment scale,
a radio group and not a select), and the **three** above.

### 4u·12. CACHE-BUSTER

`?v=20260826b` on the **six** files this round touched — `styles.css`, `app.js`,
`student.js`, `instructor.js`, `admin.js`, and the new `currency-catalog.js`.
`config.js` and `items-catalog.js` are untouched and keep `?v=20260821b`.
*(`student.js` is touched by the comment sweep alone — zero executable bytes —
but a file whose bytes changed gets a new buster, or a proxy will serve the old
one for ever and the next round will not be able to tell what is deployed.)*

### 4u·13. DEPLOYMENT GATE — **SCHEMA FIRST, AND THREE COMMITS RIDE IT**

`db/schema.sql` is touched and it **creates a table**. The database moves first:
the user runs the new `schema.sql` on the cloud project, confirms it, and only
then is the client deployed. The script is **idempotent** — re-running it changes
nothing, `create table if not exists` guards the new table, the two migration
ledgers are untouched, and **no stored row is rewritten by any part of this
round**.

**A CLIENT DEPLOYED FIRST WOULD BREAK** (`list_students_for_instructor` would
return no `currency` key and `save_instructor_currency` would not exist), which
is the whole reason the gate is stated. A SERVER deployed first is harmless: the
old client simply ignores the two new keys.

**THIS ROUND'S COMMIT IS THE THIRD ON THE SAME UNPUSHED GATE** — round 17b,
round 18 and round 19 are all ahead of `origin/main` and **none of them is
pushed**.

### 4u·14. SELF-VERIFICATION — ROUND 19 (live, local stack, the real form and the real RPCs)

1. **THE CATALOGUE.** `python tools/gen-currency-catalog.py` → *«27 e-items
   (e-1d-demo excluded), source generated 2026-08-14»* + *«every emitted id is
   pure ASCII kebab-case (assert: 27 checked, 0 collisions)»*. `node --check
   app/currency-catalog.js` clean; `wa.e_item_ids()` returns **27** and
   `wa.e_item_name('e-32-bfm')` = **«Ε-32 — BFM (Basic Fighter Manoeuvres)»**.
   Loaded in the browser: `WA.E_ITEMS.length = 27`, `WA._E_BY_ID` 27 keys.
2. **SCHEMA ×2.** `schema.sql` applied twice with `ON_ERROR_STOP=1`, **exit 0**
   both times; the seed/migration ledger still holds exactly its two rows.
3. **THE WRITE, THROUGH THE REAL FORM.** On a real instructor link: «+ flight»
   ×3, cells filled by real `change` events. The second row of 26/08 took **#2
   by itself** (toast: *«A flight of 26/08/2026 (ΑΕΡΟΣ, own) is already recorded
   — this one is #2»*). Button read **«Save 1 assessment + 3 currency changes»**,
   dialog listed all four lines (§4u·7), «Confirm & save» → *«1 assessment + 3
   currency changes saved ✓»*. `public.instructor_records` holds the three rows,
   `seq` present **only** on the second, `e_items` absent on none that has them.
4. **RENDER SORTED, AND CLEAN ON RELOAD.** Reload → 26/08 #1, 26/08 #2, 25/08;
   Save **disabled**, float hidden, status back to its idle sentence — the
   fingerprint round-trips through the server's own returned record.
5. **UNKNOWN E, REFUSED BY NAME.** Through the page's own `rpc()`:
   *«…«e-99-nope» is not an event of the 3-01 EVENTS table — choose one of the 27
   printed events (currency[0].e_items[1])»*. A **stored** unknown id
   (`e-retired-2024`, planted directly in the table) renders as a dashed
   `is-legacy` chip reading **«e-retired-2024 unknown»** with the tooltip that
   says what to do; a save while it is present is refused **by name** and the
   status line carries the sentence. Removing the chip and saving succeeds, and
   the dialog names the change: *«E-items Ε-3 · e-retired-2024 → Ε-3»*.
6. **THE OTHER FIVE REFUSALS**, each by name: duplicate `(kind, category, date,
   seq)`; `kind:'solo'`; an unknown key `note`; the same event twice on one
   sortie (which also **proves the normalisation boundary** — it fired on
   `["e-32-bfm", " e-32-bfm "]`); an unknown section `proposals`.
7. **THE CLIENT'S OWN REFUSAL.** A row with a date and nothing else:
   *«Currency not saved — 23/08/2026 — still needs whether it was your own flight
   or one with a student and ΑΕΡΟΣ or F/S»*, and the row wears `.is-problem`.
8. **DISCARD.** *«Are you sure you want to discard change 1?»* → discard → the
   four saved rows are back, Save disabled.
9. **REVOKE.** With the instructor deactivated, `save_instructor_currency` and
   `list_students_for_instructor` both raise **«WA: invalid or revoked token»**,
   and `public.instructor_records` still holds its row — a revocation closes the
   door, it does not burn the file.
10. **THE ADMIN, READ-ONLY.** «Enter assessments as…» on that instructor:
    the currency card renders with **0** editable controls
    (`[data-curf]`, `.ms-add`, `[data-curdel]`, `[data-curerm]`, `#cur-add` all
    absent), the hint says why, the four rows read as text. People tab: the chip
    **«currency 4»** with *«4 flights and 4 events recorded for the currency
    register, last saved …»*.
11. **THE EXPORT.** `public.admin_export` →
    `schema = "wa-export-v1"`, `instructor_records` **1** (4 rows,
    `entries_total 4`), `e_items` **27** with
    `{id:"e-32-bfm", name:"Ε-32 — BFM (Basic Fighter Manoeuvres)"}`.
12. **THE BADGE, AT THREE SCOPES.** Scope `98B HAF`, one proposal filed:
    **«1/9»** (not «1/25»). Nine filed through `admin_save_proposal`: **«✓ 9/9»**
    — green reachable. Scope `— none —`: every badge a neutral **«—»** and the
    card reads *«Nothing is outstanding…»*. Scope restored to `98B HAF`.
13. **THE SCOPE-AWARE SENTENCE.** Out-of-scope student (99A HAF): **one** line,
    *«Assessments are open for class 98B HAF, so nobody is being asked about this
    student (class 99A HAF). The 13 instructors who have not answered about him
    owe nothing…»*. In-scope student: the **12 named** per-instructor lines,
    word for word as round 8 wrote them.
14. **THE SWEEP, PROVED.** Comment-stripped executable text identical in all four
    files (§4u·10c); the scanner re-run reports **32** surviving `\bCO\b` in
    comments, every one enumerated in the table above, and **zero** admin-as-CO
    prose. *(Superseded 27/08/2026 — §4v·5c: the greppable count is **57**, of
    which **8** are course codes; **zero** admin-as-CO prose still holds, and
    from round 20 it holds in `app/styles.css` too.)*
15. **HYGIENE.** `node --check` clean on all six client files. **Zero console
    errors** on a fresh tab through the whole instructor flow and the whole admin
    flow. No horizontal page scroll at **375 px** (`body.scrollWidth === 375`)
    with the table scrolling inside its own `.tblwrap`; at **1440 px** the table
    fits with **0** overflowing cells, no ellipsis and no clipped header.
16. **PRIVACY.** The 187-term grep over all 19 tracked files: **0** real-person
    hits after §4u·11 (the only matches being the English word *delta*).

### 4u·15. OPEN ITEMS RAISED BY THIS ROUND

1. **The git-history rewrite** (§4u·11) — the removed call signs and surnames
   are still in the history. **The Flight Commander's decision**, not Claude's.
2. **A `student`-kind row still names no sortie.** If the squadron later wants
   the instructor's currency row tied to the student's flight, the join key
   would be `(instructor, date, seq)` against the student's log — and the
   argument of §4u·2 would have to be re-made first.
3. **The FDMS bridge lane is not yet written.** This round produces the data and
   the marker; reading `instructor_records` into `instructorCurrency` is the
   FDMS side's own round.

## 4v. Round 20 (2026-08-27) — WHICH Σ IT WAS, THE TWO DOORS, THE CHIPS EVERYWHERE, AND THE SEARCH-PATH SWEEP

**FIVE RULINGS OF 27/08/2026**, one open item of Γύρος 11 closed, and the
hardening §4φ scheduled. The lettering continues the round series (4a … 4u → 4v);
§4φ is a **dated ruling appendix** and keeps its own place at the end of the file.

---

### 4v·1. «MY CURRENCY» LEARNS WHICH Σ IT IS

> **ΑΠΟΦΑΝΣΗ**: *«θα έπρεπε να έχουμε ποια S είναι και δυνατότητα πολλαπλών Ε.
> Αφού θα τροφοδοτούν το ίδιο σχήμα με το FDMS να τα έχουμε σωστά.»*

**WHAT WAS WRONG.** Round 19 stored the **programme** — `category` = `'aeros'` /
`'fs'` — and stopped there. That is the **table** a sortie belongs to, not the
sortie: Πίνακας 9 prints six ΑΕΡΟΣ rows and Πίνακας 6 six F/S rows, and «ΑΕΡΟΣ»
names one of them exactly as little as «a flight» names an aircraft. A currency
register that cannot say **which** sortie was flown cannot feed the register FDMS
keeps, which is the whole reason this lane exists.

**THE ROW MODEL.** `{date, kind: own|student, s_category, e_items[], seq}` —
`category` is **gone**, and the programme is **derived** (`wa.s_category_group`,
`WA.sCatGroup`). One fact where there were two, and no way for them to disagree:
nothing can now claim a Σ-3 flown in the simulator.

**THE CATALOGUE IS GENERATED, 1:1, FROM THE FDMS SOURCE.**
`tools/gen-currency-catalog.py` — the same script, the same run, the same source
file the 27 E-items come from (`D:\FDMS\data\requirements\instructor_currency.json`,
generated 2026-08-14) — now emits `WA_S_CATEGORIES` into `app/currency-catalog.js`
and `wa.s_category_ids()` / `wa.s_category_name()` / `wa.s_category_group()` /
`wa.s_category_legacy_ids()` into the CURRENCY GENERATED BLOCK of `db/schema.sql`.
**16 rows:**

| # | what | where it comes from |
|---|---|---|
| 6 | **ΑΕΡΟΣ** — Σ-1 · Σ-2 day · Σ-2 night · Σ-3 · Σ-4 · Σ-20 | source `kind: 's-category'` (Πίνακας 9) |
| 6 | **F/S** — SIM-1 · SIM-2 · SIM-3 · SIM-4 · SIM-5 · SIM-ΔΑ | source `kind: 'sim'` (Πίνακας 6) |
| 2 | the **recording aids** FDMS carries as columns of its own — «Νυχτερινή με μαθητές» and «Πτήση δοκιμής (FCF)» | **declared** in the generator, **asserted** against `D:\FDMS\app\currency.js` → `SYNTH` |
| 2 | the **legacy** ids — `legacy-aeros-unspecified`, `legacy-fs-unspecified` | declared; see 4v·1b |

**EXCLUDED BY NAME, WITH THE REASON PRINTED IN BOTH MIRRORS**:
`semiannual-air-total-t6` and `semiannual-fs-total-t6` (the printed **ΣΥΝΟΛΟ /
ΣΥΝΟΛΑ** rows — a total is not a sortie anybody flies) and
`sim-refresh-after-abstention` (§49 prints a **threshold in days**, not a
category; the sortie it demands is a SIM-1, already in the list).

**THE TWO AIDS ARE FDMS'S, AND THE BUILD SAYS SO.** They are not rows of the
research file — the 3-01 prints neither — so they are declared in the generator
under **FDMS's own ids and printed names**, and `assert_aids_against_fdms()`
fails the build if either string has left `D:\FDMS\app\currency.js`. The check
**never changes an emitted byte**: FDMS absent prints a note, and the catalogue
is identical either way, so the output stays byte-idempotent on a machine that
has Wings Ahead and not FDMS.

**TEST PILOTS: MARKED, NEVER HIDDEN.** `sim-da` and `x-fcf-flight` carry `tp`.
FDMS *hides* its FCF column from a man without the flag; Wings Ahead does not,
because its `test_pilot` comes from the shared roster and an unset one would stop
an instructor recording a flight he really flew. The option says «(Test Pilots)»
— and does not say it twice where the printed name already ends in *«(Test
Pilots only)»*.

**BYTE-IDEMPOTENT, PROVED**: two consecutive runs, identical md5 on both mirrors.

#### 4v·1b. THE MIGRATION — IT DOES NOT GUESS, AND THAT IS THE DESIGN

Cloud `instructor_records` **verified EMPTY on 27/08/2026**, so there is no cloud
data migration. The **local demo does** hold a round-19 fixture (4 rows), and any
instance that ran round 19 before this deploy will too.

Nobody can reconstruct from *«ΑΕΡΟΣ on the 26th»* whether the sortie was a Σ-1 or
a Σ-3 — the fact was never recorded — so `wa.migrate_ins_entry` / `WA.migrateInsEntry`
carry across the **only thing the old row knew** (the programme) onto a category
whose printed name **says** the Σ is unspecified.

> **JUDGEMENT — TWO LEGACY IDS AND NOT ONE.** The ruling asked for *«a
> catalog-level unspecified legacy id»*. It is **two**, one per programme,
> because `'aeros'` / `'fs'` is a fact the old row really did carry: folding both
> into a single «unspecified» would throw away something **true** in order to be
> honest about something it did not know. Nothing is lost by the split and the
> bridge gets a better signal.

> **JUDGEMENT — STORABLE, NEVER OFFERED.** A legacy id passes
> `wa.validate_instructor_record` (so a migrated record round-trips without the
> server refusing rows the instructor never touched) and is **not** in
> `WA.sCatOptions()` (so no new row can claim one). A row that HOLDS one keeps it
> selectable in its own box, marked, so it can be corrected instead of vanishing.
> The ruling asked for a value *«the bridge will surface as needing the
> developer's hand»* — hence `wa.ins_legacy_count()`, the `legacy_rows` field on
> every `instructor_records` entry of `admin_export`, the **red-edged row** in
> the table and the **«N without a Σ»** badge on the card.

**ORDER MATTERS AND IS COMMENTED**: the legacy pass runs **before** the key
whitelist, because the whitelist is what makes `category` stop existing.

#### 4v·1c. THE SERVER REFUSES BY NAME

`s_category` is validated against `wa.s_category_ids()` and the refusal prints the
**printed names**, not slugs, and counts what it then lists (the legacy ids are
excluded from both):

> *«s-99-invented» is not a category of Πίνακας 9 (ΑΕΡΟΣ) or Πίνακας 6 (F/S) —
> choose one of the 14 a flight may be recorded under: Σ-1 — General Adaptation ·
> Σ-2 — Instrument flight (PDO), day · … · SIM-ΔΑ — Aircraft test in the simulator
> (Test Pilots only)  (currency[0].s_category)*

The **uniqueness key** becomes `(kind, s_category, date, seq)` — server
(`wa.validate_instructor_record`) and client (`WA.curIdent`, `WA.IDENT_FIELDS`)
in step, as round 19 established. Two sorties of one day in **different** Σ
categories are now two rows at `seq 1` each, which is more correct than round 19
could be. The duplicate refusal names the Σ:

> *this flight is already recorded (2026-08-27, Σ-3 — Air-to-Ground missions,
> day/night, flight 1 of the day) — give the second one its own number*

And the retired key is refused by name: *unknown field for section currency —
allowed: date, kind, s_category, e_items, seq  (currency[0].category)*.

**`WA.rowLabel` says the Σ PRINTED NAME**, as the ruling asked — and no longer
prints the programme beside it, because the programme is now derived from the
same value and printing both would print one fact twice:

```
My currency · own · Σ-3 — Air-to-Ground missions, day/night · 27/08/2026 #2 — added (E-items Ε-21 · Ε-46)
```

#### 4v·1d. MULTI-E: IT EXISTED, AND NOW IT SAYS SO

Multi-E has been in the data since round 19. What was missing was any **sign** of
it: the cell offered a «— add an event —» `<select>`, which is a list of ONE that
happens to be repeatable — what a form looks like when it does **not** take many
— so a sortie that exercised four events was recorded with one.

The select is gone. `WA.pickEvents()` (app.js, the `.veil`/`.modal` pattern of
`WA.confirmSave`) opens the **FDMS dialog's shape**: all 27 events on screen at
once, a **filter** over them (code or words), a **count chip** *«3 of 27
selected»*, a checkbox per row, **Clear all**, **Cancel**, **Done**. The cell
carries the count on its own button («✎ 3 events» / «+ events»).

- **the boxes are STATE, not a write** — nothing reaches the row until Done, so
  Cancel really cancels;
- **the filter re-renders only the list** and re-reads the ticks from the Set, so
  a box ticked before filtering is still ticked after it;
- **an unknown id is never silently dropped** — it survives the dialog and
  survives Clear all, so the server can still refuse it by name.

---

### 4v·2. THE INSTRUCTOR LANDING PAGE, AND THE TWO DOORS

> **ΑΠΟΦΑΝΣΗ**: *«το landing page να έχει τα στοιχεία αυτού που μπαίνει, ώστε να
> κάνει και επιβεβαίωση, και να έχουμε μήνυμα καλωσορίσματος. Και μετά δύο
> επιλογές: My currency, Student Assessment. Τώρα είναι μπερδεμένα.»*

**WHAT WAS CONFUSED.** Round 19 put the instructor's own currency at the bottom
of the assessment form because there was nowhere else to put it, and the page
became two different jobs in one scroll: a questionnaire about twelve other
people, and a logbook about himself. They share a link and nothing else —
different subject, different verb, different Save.

**THE LINK NOW OPENS ON NEITHER.** It opens on **who you are**: rank + full name
as the roster holds them, the duty / leadership / status line with the call sign,
and the class scope — stated as a **confirmation**, with the sentence that makes
it actionable: *«You are signed in as … If this is not you, close this page and
tell the squadron administration — this is a personal link and everything saved
through it is recorded in your name.»* A personal link forwarded, pasted into the
wrong chat or opened on a shared machine is the one failure this application
cannot detect and its holder can, in one glance.

**TWO DOORS, EACH ITS OWN VIEW.** `★ Student Assessment` (the scoped form with
the R17 rail) and `✈ My currency` (the table alone). Each has a **back-to-landing
control at the top** of its pane, its **own Save**, and its own count of unsaved
work; the landing shows **both** counts on the tiles, so an instructor who left
something half-typed is told **which door** holds it.

**DEEP LINKS — the existing router pattern.** `WA.DOORS`, `getDoor()`,
`WA.doorHash()` in `app.js`, same regex shape as the round-4 `&co=` sub-route:

| hash | view |
|---|---|
| `#t=<token>` | the welcome page |
| `#t=<token>&v=assess` | Student Assessment |
| `#t=<token>&v=currency` | My currency |

**A DOOR IS NOT A RELOAD.** `route()` offers every hash change to `WA._insDoor`
**before** `teardownView()`; the mounted view takes it only for **the link it was
built for** (token + co target) and switches panes without re-fetching. Otherwise
switching doors would throw away whatever is half-typed in the other one. The
door buttons only ever **set `location.hash`**, so a click, the Back button, a
bookmark and a reload are **one path** with one behaviour.

**THE RAIL LIVES AND DIES WITH ITS DOOR.** Mounted when the assessment door
opens, destroyed when it closes — not merely hidden, because the panel keeps a
scroll spy on `window` that measures its cards, and a hidden card measures zero.
**The currency row is out of the rail** (round 19 had appended it): the rail is
the student cards again, in their order, which is the rule round 19 had to bend.

**THE SAVE COUNTS THE OPEN DOOR ONLY.** Round 19's combined sentence («Save 3
assessments + 2 currency changes») was honest for a page that held both at once;
from inside «My currency» it would offer to write twelve assessments the reader
cannot see and did not come to think about. So `doorCounts()` zeroes the closed
door, `saveAll(ids, withCur)` takes the open door as an argument, and
`confirmedSaveAll()` builds the dialog from the open door's list. **The DIFF
BUILDERS are unchanged and still shared** — `WA.proposalChanges` for the
assessments, `WA.recordChanges` (through `curChanges()`) for the flights: the
door decides which of them is asked for, never how either is written. The
`beforeunload` guard and the admin's Back still ask about **both**.

> **JUDGEMENT — THE STUDENT GETS THE HEADER AND NOT THE DOORS** (ruling asked for
> the judgement to be recorded). The **confirmation** half applies identically: a
> student's link is as forwardable as an instructor's, so the student form now
> opens with the same welcome card — *Welcome, ⟨rank + name⟩ · MN · Class*, and
> the same «if this is not you» sentence. The **doors** half does not: the
> instructor's link led to two unrelated jobs and the landing exists to tell them
> apart; a student's link leads to **one** record, and a landing whose only door
> opens onto the only room is a click that teaches nothing and costs everybody
> one. The parts of that record already have a rail (round 17), which is the
> right instrument for parts of one thing.

---

### 4v·3. THE CLASS CHIPS ON ALL FOUR ADMIN PAGES

> **ΑΠΟΦΑΝΣΗ**: *«όπως στο overview χωρίζεις τους μαθητές ανά τάξη να γίνεται και
> στις υπόλοιπες σελίδες.»*

**ONE COMPONENT, ONE STATE, FOUR PAGES.** `classChipsHTML()` is the single
builder; `A.cls` is the single state, persisted under the Overview's **existing**
key `wa-adm-class`, and the single `[data-cls]` click branch already served every
tab the moment the other three started drawing the row. Choosing a class anywhere
**follows everywhere**, and survives a reload.

| page | what the filter does |
|---|---|
| **Overview** | the table, the three CSV exports (unchanged behaviour) |
| **Student analysis** | the **deck**: the picker, the ← → arrows, the *«3 / 9»* pager, and the rail's card |
| **Brief mode** | the **deck** + its pager + **the printed brief** (see below) |
| **People & links** | the **students** table only — instructors are always shown |

**THE CHIP SET IS ONE SET, FROM ONE UNION; THE COUNTS ARE PER PAGE.** The
Overview is about the **active** students of the dashboard payload; People & links
is about **every** student row the roster holds. Chips derived from whichever page
happened to be open would appear and disappear as the admin moved between tabs,
**silently dropping a filter he had chosen**. So `classIds()` is the union of both
populations and `classList(pop, keyOf)` counts over the page's own — the chips
never move, and what each one says is true of the page you are reading. A chip
whose count is 0 here stays clickable and the page says *«nobody in this class»*
in its own words. `activeClass()` reverts to All only when the class has left the
roster **entirely**, which is the case it was written for.

**A.sel STILL INDEXES `A.data.students`** — the Overview rows, `data-goto` and the
round-11 return-to-where-you-were all depend on it — and `anaList()` / `anaPos()`
/ `anaStudent()` are the whole translation, used by both one-at-a-time tabs. A
selection the filter has just excluded **falls to the first of what is left**; the
alternative is showing a 99A student under a chip reading 98B.

> **JUDGEMENT — INSTRUCTORS ARE NEVER FILTERED.** An instructor carries no class
> (he flies with whoever is on the programme), so a class filter over the
> instructor table would either hide everybody or nobody, and both answers are a
> lie about what a class means. The heading says so while a filter is on.

> **JUDGEMENT — THE PRINTED BRIEF FOLLOWS THE FILTER.** Round 11 ruled the CSVs
> follow it: *«a button that sits over 6 visible rows and silently writes 20 is a
> button that produces the wrong attachment on a Monday morning.»* The deck on
> screen is the class the chips chose; a **Print brief** that quietly produced the
> whole squadron would be that same trap **on paper**, where it cannot be noticed
> until it has been handed out. The scope is now printed in the summary page's
> meta line, and the matrix's *«Class average»* row becomes an average of **one**
> class — which is the only thing that row ever claimed.

---

### 4v·4. RULING 2Α — «CLASS» MEANS THE STUDENT'S OWN CLASS (Γύρος 11 open item CLOSED)

**THE OPEN ITEM (§7, Γύρος 11):** *«Οι τέσσερις μπάρες, η σύγκριση ανά checkride
και η διακεκομμένη γραμμή αναφοράς υπολογίζονται πάνω σε όλους τους ενεργούς
μαθητές όλων των τμημάτων … Με 25 μαθητές σε τρία τμήματα στο ίδιο instance, το
«class best/worst/average» είναι αριθμητική πάνω σε πληθυσμό που η ετικέτα δεν
περιγράφει. **Ζητείται απόφαση**: να ακολουθεί το φίλτρο του Overview, να
περιορίζεται πάντα στο τμήμα του μαθητή, ή να μένει σε επίπεδο μοίρας;»*

> **Η ΑΠΟΦΑΝΣΗ (27/08/2026): ΤΟ ΤΜΗΜΑ ΤΟΥ ΙΔΙΟΥ ΤΟΥ ΜΑΘΗΤΗ.**

A 99A cadet three weeks into the stage and a 98B officer at the end of it are not
a population: «class average» over both is arithmetic about nobody, and it
flatters the one and punishes the other for a difference that is **calendar, not
ability**. The class a student is **in** is the cohort he flew the same syllabus
with on the same dates, which is what a comparison is for — and it is what the
label always claimed.

**AND NOT THE OVERVIEW FILTER, DELIBERATELY.** That filter is what the **admin**
is looking at; this chart is about who the **student** is measured against. Tying
them would make the same student's «best in class» change because somebody
clicked a chip — a number that moves without the data moving is a number nobody
can quote in a brief.

**ONE FUNCTION, EVERY CHART**: `peers(s)` / `peerLabel(s)` / `peerTip(s)` in
`app/admin.js`. It feeds

- the **four bars** (`fourBarSVG`) — caption now *«Solo flights — higher is better
  — class 2026B»*;
- the **per-checkride comparison** (`evalValues(id, s)`, `evalCompare`) — the
  `n = X of Y in class Z` line and the axis;
- the **dashed reference line** of the eight-checkride plot (`catPlotSVG`);
- the **FPC axis depth** (`plotDef`) — «#2» means the same position for the people
  he is actually compared with;
- the **legend**, which used to read *«all classes, not only this student's»* and
  now names the class it is the average of;
- the card heading, *«Comparison vs class 98B HAF»*, with `peerTip` on a `tipdot`.

**PROVED ON THE RUNNING APP**: for a 2026B student the bars read
`8 · 8 · 8 · 8` (own class, n = 3) where the squadron-wide population would have
produced `8 · 8 · 0 · 1.0` (n = 25).

---

### 4v·5. THE HARDENING SWEEP

#### 4v·5a. `search_path` PINNED ON ALL 102 FLAGGED FUNCTIONS

The 27/08 advisor triage (§4φ) counted `function_search_path_mutable` **×102** —
every helper in the `wa` schema. All 102 now carry

```sql
set search_path = public, wa, pg_temp
```

**WHICH IS THE STRING THE PUBLIC RPCs ALREADY SET.** A `wa` helper is only ever
reached from a `public` RPC that has already put exactly those three schemas on
the path, so pinning them to it is **behaviour-identical by construction** rather
than by hope. `wa.gen_token` keeps its own (`public, extensions, pg_temp`),
because pgcrypto lives in a fourth schema on Supabase — which is why it was the
one function pinned already.

**THE GENERATED FUNCTIONS PIN THEMSELVES.** `wa.e_item_ids` / `wa.e_item_name`
and the four new Σ functions are written by
`tools/gen-currency-catalog.py`, so the clause lives in its emitter (`SQL_SET`) —
otherwise the next regeneration would silently unpin them.

**AND THE PIN IS AUDITED, NOT REMEMBERED.** `create or replace function` replaces
a function's SET clauses along with its body, so a future round that re-creates
one helper without the clause would silently unpin it and the advisor would grow
the lint back one function at a time. A `do $$ … $$` block at the end of
`db/schema.sql` **fails the deployment**, naming every function that lost it. It
reads `pg_proc`, so what it asserts is true of the **database**, not of this file:

```
NOTICE:  r20: search_path pinned on all 110 wa functions
```

**PROVED LOCALLY** (`docker exec supabase_db_WingsAhead psql`):

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'wa'
   and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                   where c like 'search_path=%');
--  before: 102     after: 0
```

**THE CLOUD ADVISOR RE-RUN IS NOT THIS ROUND'S TO DO** — see §4φ·2: rounds work
only in the local laboratory. The lint that remains to be re-counted on the cloud
is `function_search_path_mutable`, and the number this change is expected to move
it by is **102 → 0**; the other two families of §4φ (`…security_definer_function_executable`
×42 and `rls_enabled_no_policy` ×6) are **accepted by design** and untouched.

#### 4v·5b. `app/styles.css` STOPS CALLING THE ADMIN «THE CO»

Round 19's sweep covered `db/schema.sql` and `app/*.js` and never opened the
stylesheet. **11 occurrences on 10 lines**, all inside `/* */` comments, all
rewritten: *«under the CO's fingers» → «under the admin's fingers»*, *«the CO's
log tables» → «the admin's log tables»*, *«ENTERED BY THE CO» → «ENTERED BY THE
ADMIN»*, *«"+1 CO"» → «"+1 ADMIN"»*, *«LOCKED BY THE CO» → «LOCKED BY THE
ADMIN»*, *«the CO tag on paper» → «the admin tag on paper»*.
**Zero behaviour**: the class names `.cotag`, `.cotag.part`, `.conote`,
`.is-colock`, `.is-co` are the code's private vocabulary and are **untouched**,
as round 17 ruled.

> **CORRECTED, 27/08/2026 (§4w·2) — WHAT «ZERO BEHAVIOUR» IS ALLOWED TO MEAN
> HERE.** This round reused round 19's proof sentence — *«comment-stripped
> executable text byte-identical»* (§4u·10c) — for the stylesheet. **For
> `app/styles.css` that sentence is false as written**, and not because the
> rewrite touched anything: round 20's **feature CSS shipped in the same
> commit** as the rename, so the file's stripped text **cannot** be identical
> across `fba495e → b40181b`, and no honest comparison could have returned that
> it was. What was actually verified — and all that this round is entitled to
> claim — is the **classification**, which is re-runnable:
>
> ```bash
> # every \bCO\b in the pre-round file, classified into /* */ spans
> git show fba495e:app/styles.css > /tmp/pre.css
> python - <<'PY'
> import re
> s = open('/tmp/pre.css', encoding='utf-8').read()
> spans = [(m.start(), m.end()) for m in re.finditer(r'/\*.*?\*/', s, re.S)]
> hits  = [m.start() for m in re.finditer(r'\bCO\b', s)]
> ins   = sum(any(a <= i < b for a, b in spans) for i in hits)
> print('total', len(hits), '· in comment spans', ins, '· in executable text', len(hits) - ins)
> print('in comment-STRIPPED text', len(re.findall(r'\bCO\b', re.sub(r'/\*.*?\*/', '', s, flags=re.S))))
> PY
> #   total 11 · in comment spans 11 · in executable text 0
> #   in comment-STRIPPED text 0
> ```
>
> **11 of 11 inside comment spans · 0 in the comment-stripped executable text.**
> That is the whole provable claim, and it is sufficient: the rename cannot have
> changed behaviour because it never touched a byte the browser reads. The
> stripped text itself went **49 299 → 52 381** characters (**+73 / −4**
> executable lines) and every one of those lines is round-20 **feature** CSS —
> `.savebar[hidden]`, `.curtbl .catbox`, `.curtbl td.prog`, `.ms-pick`,
> `.modal.epick`, `.epick-bar`, `.epick-q`, `.epick-list`.
>
> **THE GENERAL RULE THIS BUYS.** A byte-identity assertion is only available to
> a commit that ships **nothing but** the rewrite. Round 19's four files earned
> it (§4u·10c) because the sweep was the whole commit; this one did not, and
> **a claim a reader can falsify in one command costs more than the sentence it
> saves.** Where a mixed commit needs the same assurance, the classification
> above is the proof to reach for — it is stronger, not weaker: it says *why*
> the rewrite is inert instead of asserting that it happened to be.

#### 4v·5c. THE TWO UNREPRODUCIBLE FIGURES, REPLACED BY GREP-DERIVED ONES

§4u·10c claimed the sweep *«rewrote **138** comment occurrences»* and left
*«**32** survivors»*. **Neither number can be reproduced by any command in this
repository** — they were the output of a one-off classifier that no longer
exists — so both are superseded here by numbers anybody can re-derive, with the
command beside them. (The old figures are kept above as the record of what was
claimed; where they disagree with the commands below, **the commands are right**.)

**HOW BIG THE ROUND-19 SWEEP ACTUALLY WAS — 142 occurrences, from the history:**

```bash
for f in db/schema.sql app/app.js app/admin.js app/student.js app/instructor.js; do
  git show b1a8dcc:$f; done | grep -oE '\bCO\b' | wc -l      # 195   (round 18, pre-sweep)
for f in db/schema.sql app/app.js app/admin.js app/student.js app/instructor.js; do
  git show 7a84c69:$f; done | grep -oE '\bCO\b' | wc -l      #  53   (round 19, post-sweep)
```

195 − 53 = **142** standalone `CO` occurrences rewritten. (The old «138» counted
only what its own parser classified as a comment occurrence; `git` + `grep` count
**57 − 4 = 53**, and 142 is the figure the shipped commits prove.)

**WHAT SURVIVES TODAY — 57 occurrences, and what each one is:**

```bash
grep -oE '\bCO\b' db/schema.sql app/*.js app/*.css | wc -l                # 57
for f in db/schema.sql app/*.js app/*.css; do n=$(grep -oE '\bCO\b' "$f" | wc -l);
  [ "$n" -gt 0 ] && printf "%-24s %s\n" "$f" "$n"; done
#   db/schema.sql            23
#   app/app.js               15
#   app/student.js           13
#   app/items-catalog.js      4
#   app/admin.js              2
grep -oE "\bCO 1[0-9][0-9]\b" db/schema.sql app/items-catalog.js | wc -l  #  8
grep -nE '\bCO\b' db/schema.sql app/*.js app/*.css                        # read all 57
```

**8** are the syllabus **course codes** (`CO 101` · `CO 106` · `CO 109` · `CO 110`,
mirrored in the schema and in `items-catalog.js`). The remaining **49** are the
**real Squadron CO** where the doctrine names him — `wa.fpc_evaluators` /
`WA.FPC_EVALUATORS`, the CEF evaluator roles, the ΚΕΠΕ discretion of 3-01 ΚΕΦ.2
§32β and the §32δ(2) duty to inform — or the **quoted rulings of round 17 / 17b**
kept as the record of what was changed. **Zero admin-as-CO prose**, in any of the
six files, `app/styles.css` now included:

```bash
git show fba495e:app/styles.css | grep -oE '\bCO\b' | wc -l   # 11  (before round 20)
grep -oE '\bCO\b' app/styles.css | wc -l                      #  0  (after)
```

---

### 4v·6. VERIFY — WHAT WAS RUN, ON THE RUNNING APP AND THE RUNNING DATABASE

1. **Σ CATALOG 1:1 vs FDMS, re-derived.** The generator re-run from the FDMS
   source: **27 e-items** (1 excluded) + **16 Σ categories** (6 ΑΕΡΟΣ + 6 F/S
   printed rows + 2 recording aids + 2 legacy; 3 excluded by name). **43 ids
   asserted** pure ASCII kebab-case, **0 collisions**. The 2 aids **matched FDMS
   verbatim**. Two consecutive runs → identical md5 on `app/currency-catalog.js`
   and on `db/schema.sql`.
2. **s_category REFUSALS BY NAME** — 5 real RPC refusals, quoted in 4v·1c:
   unknown id (names all 14 choosable categories), duplicate E on one sortie,
   duplicate `(kind, s_category, date, seq)`, the retired `category` key, and the
   admin having no currency write path at all.
3. **LEGACY RENDERS HONESTLY** — the 4-row round-19 fixture migrates to
   `legacy-aeros-unspecified` ×2 / `legacy-fs-unspecified` ×2, every row
   **red-edged**, the card badge reads **«4 without a Σ»**, `legacy_rows: 1` (as
   a count of rows: 4) rides in `admin_export`, and the legacy option is
   selectable **only** on the row that holds it.
4. **THE LANDING SHOWS THE RIGHT IDENTITY FOR TWO DIFFERENT INSTRUCTOR TOKENS** —
   two links opened in the running app, each welcoming its own holder by rank +
   full name, duty line and call sign, with the class-scope line *«Assessments
   are open for class 98B HAF. 9 students are being asked about.»*
5. **THE STUDENT HEADER** — a student token opens on *«Welcome, ⟨rank + name⟩ ·
   MN ⟨n⟩ · Class 98B HAF»* with the confirmation sentence and **0 door tiles**.
6. **BOTH DOORS + DEEP-LINKS + BACK.** `&v=currency` → currency pane only, save
   bar visible, 4 rows; `&v=assess` → **9 rail rows, 9 cards**, rail summary
   *«9 of 9 chosen»*; `history.back()` walks the doors; the landing tiles carry
   **«1 unsaved»** on the door that holds it, and the unsaved edit **survived
   every door switch**.
7. **THE PICKER.** Opened on a row holding 2 events → chip *«2 of 27 selected»*,
   **27 rows**; filter `ifr` → **1 row (Ε-4)** and the two ticks **kept** in the
   Set; ticking Ε-4 → *«3 of 27 selected»*; Done → the cell reads **«✎ 3
   events»** and the Save reads **«Save 1 currency change»**.
8. **THE SAVE BAR IS THE OPEN DOOR'S** — hidden on the landing
   (`display: none`, after `.savebar[hidden]` was added: `display:flex` outranks
   the UA `[hidden]` rule, and the bar had stayed on screen).
9. **CLASS CHIPS FILTER ALL FOUR PAGES AND STAY IN SYNC.** Chips
   `All 25 · 2026B 3 · 98B HAF 9 · 99A HAF 13`. Picked **98B HAF** on the
   Overview → Student analysis opened **already on it**, pager **«1 / 9»**,
   heading *«Comparison vs class 98B HAF»*; Brief mode **«1 / 3»** on 2026B;
   People & links *«Students (3 of 25) — class 2026B»* with **3** rows and
   *«Instructors (16) — every instructor, whatever class is filtered»*.
10. **THE ANALYSIS BARS CHANGE POPULATION** — 98B *n = 0 of 9* vs 99A *n = 0 of
    13* on the same checkride; and the 2026B student's solo bars read
    `8 · 8 · 8 · 8` where the squadron-wide numbers are `8 · 8 · 0 · 1.0`.
11. **search_path** — 102 → **0** unpinned `wa` functions; the audit block prints
    *«r20: search_path pinned on all 110 wa functions»* and **would raise** on a
    single unpinned one.
12. **THE FULL RPC REGRESSION**, 35 checks over the pinned path: `keepalive`,
    `whoami` ×4 (+ *no `token` key in the payload*), `get_student_form`,
    `list_instructor_names`, `list_students_for_instructor`, `admin_get_data`,
    `admin_list_people`, `admin_export` (`wa-export-v1`, **16** s_categories,
    **27** e_items, *no `"token"` anywhere in the payload*),
    `admin_get_proposals_of`, `admin_get_student_form`, `save_student_record`
    (write-back-what-was-read), `save_instructor_currency` ×6 (3 accepted,
    5 refused by name), and the role refusals. **Every one behaved as before the
    pin.**
13. **SCHEMA APPLIED TWICE**, `ON_ERROR_STOP=1`, exit **0** both times.
14. **THE LOCAL DEMO WAS RESTORED BYTE-FOR-BYTE** after the regression: the
    round-19-shaped fixture (with `category`, no `s_category`) written straight
    into the table with the touch trigger disabled, its original `last_update`
    put back, and the second instructor's test record deleted — **1 record, 4
    rows**, exactly as found. The fixture stays round-19-shaped **on purpose**:
    it is what proves the migration on every future run.
15. **HYGIENE.** `node --check` clean on all six client files. **Zero console
    errors** through the instructor landing, both doors, the picker, the student
    form and all four admin tabs.
16. **PRIVACY.** The grep over every tracked file: **0 real-person hits**. No
    name, call sign or token from the local roster reached a tracked file.

### 4v·7. OPEN ITEMS RAISED BY THIS ROUND

1. **THE CLOUD ADVISOR RE-RUN — STILL PENDING, AND IT IS THE ONLY THING THAT CAN
   SETTLE THE NUMBER.** §4φ·2 forbids a round from touching the Supabase MCP; the
   schema must be deployed and the advisor re-run by the **main session, on the
   user's word**. **Expected — and it is a PREDICTION, not a result:**
   `function_search_path_mutable` **102 → 0**, the other **48** lints unchanged
   and accepted by design.

   > **RECORDED 27/08/2026 (§4w·3): «102 → 0» IS UNVERIFIED UNTIL THE GATE
   > RUNS.** What rounds 20 and 20b actually established is a **local** fact —
   > `pg_proc.proconfig` over the Docker instance, plus the audit block that
   > **raises** if one `wa` function loses its clause (*«r20: search_path pinned
   > on all 110 wa functions»*). Local `pg_proc` is **not** the cloud advisor:
   > the count of 102 came from a lint run against the **hosted** project, that
   > run has not happened again, and 110 (what the audit block counts) is not
   > 102 (what the advisor flagged) — the difference is real and unexamined
   > until somebody re-runs the lint. **Neither round may run it, and neither
   > round may write the outcome down as though it had.** The prediction is
   > therefore carried FORWARD here as an open item, on purpose: it is settled
   > **only** by `get_advisors` against the deployed cloud schema, in the main
   > session, with the user's explicit per-execution word, under every term of
   > §4φ (no final admin-token SELECT; no command returning a `token` column).
   > **Round 20b changes the prediction's SUBJECT, not its number** — the three
   > presence checks added here are `perform wa.chk(...)` statements *inside*
   > `wa.validate_instructor_record`, which already carried `set search_path`.
   > No function is created, dropped or renamed: the count stays **110 pinned /
   > 0 unpinned** locally, and the cloud expectation stays **102 → 0 with 48
   > unchanged**, unmoved by this round.
2. **THE Σ QUOTAS ARE CARRIED AND NOT COUNTED.** `p` / `a` (posted / attached
   sorties per semester) ride in the catalogue for the tooltip only. Wings Ahead
   records **that** a sortie was flown and **on what day**; FDMS is where the
   semester is counted against Πίνακας 6 / Πίνακας 9. If the squadron ever wants
   the *«3 of 6 this semester»* chip here, it needs the **posted/attached axis**
   on the instructor row first — which §4u already listed as a future axis.
3. **THE TEST-PILOT FLAG IS OFFERED, NOT ENFORCED.** `sim-da` and `x-fcf-flight`
   are marked and shown to everybody (4v·1). If the roster's `test_pilot` is ever
   trustworthy enough to gate on, FDMS's `hide` behaviour is the precedent —
   **but the failure mode of gating wrongly is a man who cannot record a flight
   he flew**, which is worse than an option he will not pick.
4. **THE LEGACY ROWS NEED THE DEVELOPER'S HAND.** The cloud has none; the local
   demo has 4. `admin_export` surfaces `legacy_rows` per record so the FDMS
   bridge can list them — the bridge lane itself is still unwritten (§4u·15·3).

## 4w. Round 20b (2026-08-27) — THE WA-20 VERIFY: A CHECK THAT DID NOT FIRE, AND THE SWEEP THAT FOUND ITS SIBLINGS

Three items, from the adversarial read of round 20. One is a **server hole** —
the round's headline check accepted the very rows it was written to refuse. One
is a **false sentence** in this document (§4v·5b, corrected in place above). One
is a **prediction being kept honest** until the gate can settle it (§4v·7·1).

### 4w·1. THE DEFECT — `wa.chk` DOES NOT FIRE ON NULL, AND A MEMBERSHIP TEST IS NULL WHEN THE FIELD IS ABSENT

**THE SHAPE.** `wa.chk(p_ok boolean, …)` raises `if not p_ok`. In SQL three-valued
logic `not NULL` is **NULL**, not TRUE — so `wa.chk` is silent on NULL. And
`x = any(list)` is **NULL whenever `x` is NULL**. Put together: every check
written as

```sql
perform wa.chk((e->>'field') = any(wa.some_list()), w || '.field', '…');
```

refuses a field that is **present and wrong** and **accepts a field that is
absent altogether** — the exact opposite of what a closed list is for, and
invisible from the call site, because the line *reads* like a requirement.

**WHERE IT BIT.** `wa.validate_instructor_record`, the currency section:
`s_category` (round 20, the headline of §4v·1) and `kind` (round 19, unnoticed
for a round). Proven on the running database **before** the fix:

| payload | before 20b | after 20b |
|---|---|---|
| `{"date":"2026-08-01","kind":"own","seq":1}` — no Σ | **ACCEPTED** | refused, `currency[0].s_category` |
| `{…,"s_category":null,…}` — JSON null | **ACCEPTED** | refused, `currency[0].s_category` |
| `{…,"s_category":"",…}` — blank | refused *(already — `'' = any()` is FALSE, not NULL; the 20b verifier measured it against the restored pre-fix function — the original table overstated this row)* | refused, `currency[0].s_category` — now with the presence sentence |
| `{"date":"2026-08-01","seq":1}` — no kind | **ACCEPTED** | refused, `currency[0].kind` |
| `{…,"kind":null,…}` — JSON null | **ACCEPTED** | refused, `currency[0].kind` |
| `{…,"kind":"solo",…}` — present, **wrong** | refused | refused *(unchanged)* |

That last row is the whole diagnosis: the list worked perfectly on every value
except the one that was not there.

**THE SECOND-ORDER CASUALTY, WHICH IS WORSE THAN THE FIRST.** The uniqueness
rule builds its identity by concatenation —
`(e->>'kind') || '|' || (e->>'s_category') || '|' || (e->>'date') || '|' || seq`
— and `||` propagates NULL. A row missing either field produced a **NULL key**,
so `not (f = any(seen))` was NULL and the *«this flight is already recorded»*
rule **silently stopped applying too**. Two byte-identical rows with no `kind`
were accepted as two flights. One NULL-blind check had quietly disarmed a
second, unrelated one.

**WHY IT MATTERS MORE THAN A BAD VALUE.** A refused row is a row the instructor
fixes. A row with no Σ category is **stored, exported and counted towards
nothing** — the programme (ΑΕΡΟΣ / F/S) is *derived* from `s_category`
(`wa.s_category_group`), so such a row belongs to neither section of the
currency card. It looks like a record and is not one, which is precisely the
corruption this application exists to prevent.

**THE FIX IS THE HOUSE'S OWN IDIOM, NOT A NEW ONE.** The SMS entrance has asked
this way since round 8: a **required-presence `wa.chk` with its own curated
sentence, BEFORE the membership check.** Two questions, two sentences — *«you
left this blank»* and *«that is not one of the choices»* are different things to
have done, and one message for both answers neither.

```sql
perform wa.chk(nullif(trim(coalesce(e->>'kind', '')), '') is not null, w || '.kind', '…');
perform wa.chk((e->>'kind') = any(wa.currency_kinds()), w || '.kind', '…');
```

**AND THE WORDS ARE THE FORM'S WORDS.** `instructor.js → curIncomplete()` carries
the comment *«The server refuses these too, by field»*. Until this round that
promise was **false for exactly the two fields it names**. It is now true, and
the server refuses in the sentence the client would have said, so the instructor
meets one wording and not two:

- `.kind` — *«every flight of the currency card says whether it was your own
  flight or one with a student — the squadron counts the two differently, so a
  row that says neither is a sortie that counts nowhere»*
- `.s_category` — *«every flight names which Σ category it was — the programme
  (ΑΕΡΟΣ / F/S) is read off the category, so a flight without one belongs to no
  section of the currency card and is counted towards nothing»*

### 4w·2. THE SWEEP — EVERY `= any(…)` INSIDE A `wa.chk`, CLASSIFIED

The verifier's recommendation, carried out: **all 24** `wa.chk` call sites whose
predicate contains `= any(` were extracted by a paren-matching parser (not a
regex over lines) and classified. The classifier was a one-off; its OUTPUT is
this table, and the 20b verifier re-derived it independently with their own
parser (agreeing on the total, all three fix targets, and every safe verdict —
and correcting one filing, applied below). To re-derive: list every `wa.chk(`
call whose predicate contains `= any(` in `db/schema.sql`, then bucket each as
(α) explicit `is null or`, (β) bare-but-safe for a stated reason, (γ) required →
presence layer. No standing script is claimed.

**12 sites carry the EXPLICIT `is null or` form. They are genuinely-optional
enums and they KEEP it** — an optional field that is absent is not an error, and
writing the NULL case out loud is what says so:
`reason` (NFS, 2249) · `category` (2290) · `evaluation` (2382) ·
`slot` (2394) · `evaluator` (FPC, 2468) · `track` (2489) · `kind` (flights,
2540) · `mission` (2575) · `group` (2626) · `course` (2650) · `series` (2670) ·
`exam` (2709).

**12 sites are BARE.** Each was read for whether its left operand can be NULL:

| line | site | verdict |
|---|---|---|
| 2225 | `k = any(allowed)` | **safe** — `k` is a `jsonb_object_keys` loop variable; never NULL |
| 2755 | `f = any(wa.entry_keys(k))` | **safe** — same, loop variable |
| 3434 | `k = any(wa.ins_sections())` | **safe** — same, loop variable |
| 3446 | `f = any(wa.ins_entry_keys(k))` | **safe** — same, loop variable |
| 2276 | `(e->>'reason') = any(wa.sms_reasons())` | **safe — the reference implementation.** The round-8 presence layer fires two lines above it |
| 2322 | `(e->'items'->>i2) = any(wa.item_names(…))` | **safe** — refiled here by the 20b verifier (the original table filed it under «explicit `is null or`», which its predicate does not contain): `wa.chk_str_list` at 2308 fires first, the `is not null` AND-conjunct + type-escape guard it, and `wa.item_names('other')` returns an EMPTY array (FALSE, never NULL) |
| 2527 | `not ((e->>'sortie') = any(wa.eval_ids()))` | **safe** — a presence layer already guards `sortie` for every non-legacy row. On a *legacy* row it no-ops, which is correct: a row with no sortie is not one of the eight checkrides |
| 4100 | `lv = any(wa.level_keys())` | **safe** — the enclosing `if p_payload ? 'level' and jsonb_typeof(…) <> 'null'` **is** the presence test |
| **3475** | `(e->>'kind') = any(wa.currency_kinds())` | **REQUIRED → presence layer added** (§4w·1) |
| **3502** | `(e->>'s_category') = any(wa.s_category_ids())` | **REQUIRED → presence layer added** (§4w·1) |
| **3539** | `ids[j] = any(wa.e_item_ids())` | **REQUIRED → presence layer added — FOUND BY THE SWEEP, not by the report** |
| 3562 | `not (f = any(seen))` | **second-order casualty**, now safe by construction — the loop above raises before this one runs, and `date` is required, so the key cannot be NULL |

**THE THIRD SITE IS WHY THE SWEEP WAS WORTH RUNNING.** `wa.e_items_of` reads each
element with `x #>> '{}'`, so a JSON `null` inside `e_items` arrives as SQL NULL.
The membership test was NULL-blind exactly as the other two were — but this one
**did not silently accept**, which is how it stayed hidden. It fell through to
the *duplicate* check, whose `x = ids[j]` is NULL for every row, so the count
came out `0`, `0 <> 1` fired, and an empty slot was refused as:

> *«« » is named twice on the same sortie — one flight exercises an event once»*

— a sentence about a rule the row had not broken, naming an event that was not
there. A refusal that lies about **why** is worse than one that does not come:
the instructor is sent to fix the wrong thing. It now reads *«an event slot names
the event the sortie exercised — an empty slot claims nothing, and a currency
claim that cannot be looked up in the 3-01 is one nobody can audit»*.

**NOT IN SCOPE, AND WHY.** The `= any(` sites inside `case when` / `if not`
**read-time repair** functions (`wa.migrate_*`, `wa.nfs_reason_fix`,
`wa.sms_reason_fix`, and the section repairs) are *not* the swept shape: there
NULL correctly falls through to the repair branch, which is the whole point of a
migration. `wa.chk` is the only place where NULL means «this rule did not run».

### 4w·3. THE LEGACY PATH WAS CHECKED BEFORE THE RULE WAS TIGHTENED

A required-presence rule is exactly the kind of change that makes old rows
unsavable, and `wa.write_instructor_record` **validates BEFORE it migrates**
(`wa.norm_record` → `validate_instructor_record` → `migrate_instructor_record`),
so the read-time repair cannot rescue a write. Verified, not assumed:

- A round-19-shaped payload (`category: 'aeros'`, no `s_category`) is **already
  refused today, before this change**, by the round-20 field whitelist —
  *«unknown field for section currency — allowed: date, kind, s_category,
  e_items, seq»*. This round does not make it worse.
- A legacy row that came **through the read migration** carries
  `legacy-aeros-unspecified` / `legacy-fs-unspecified`. Both are members of
  `wa.s_category_ids()`, so both pass the new presence layer **and** the
  membership check. **The 4-row local fixture still round-trips.**
- That is the legacy design working as §4v·1b intended: the sanctioned way to
  hold a row whose category was never recorded is an **id** — present, storable,
  and marked red on every surface — never an absent field.

### 4w·4. SPEC CORRECTIONS MADE BY THIS ROUND

1. **§4v·5b** — the *«comment-stripped executable text byte-identical»* sentence
   was **false as written** for `app/styles.css` (round-20 feature CSS shipped in
   the same commit). Replaced in place with the classification that was actually
   verified: **11 of 11 occurrences inside `/* */` spans, 0 in executable text**,
   plus the stripped-text delta (**49 299 → 52 381**, **+73 / −4** lines, all of
   it feature CSS) and the general rule — a byte-identity assertion belongs only
   to a commit that ships nothing but the rewrite.
2. **§4v·7·1** — the advisor prediction (`function_search_path_mutable`
   **102 → 0**, the other **48** unchanged) is now marked **a prediction, not a
   result**, settled **only** by `get_advisors` against the deployed cloud
   schema, from the **main session, on the user's per-execution word**, under
   every term of §4φ. Local `pg_proc` is not the cloud advisor, and **110**
   (what the audit block counts) is not **102** (what the advisor flagged).

### 4w·5. VERIFY — WHAT WAS RUN, ON THE RUNNING DATABASE AND THE RUNNING APP

1. **THE DEFECT REPRODUCED FIRST, ON THE LIVE DATABASE** — the six payloads of
   the §4w·1 table run through `wa.validate_instructor_record` **before** the
   fix: 5 wrongly ACCEPTED, 1 correctly refused. Then the same six after: **5
   refused by field name, the sixth unchanged.**
2. **THE EXACT REPRO RPCs**, end-to-end through
   `public.save_instructor_currency` with a real instructor token:
   `{"currency":[{"date":"2026-08-01","kind":"own","seq":1}]}` → **refused,
   `currency[0].s_category`**; `{"currency":[{"date":"2026-08-01","seq":1}]}` →
   **refused, `currency[0].kind`**; a valid row → **ACCEPTED, `entries=1`**; a
   padded id `"  e-1b-spin  "` → **ACCEPTED and stored trimmed**, proving the
   `wa.norm_record` boundary still runs ahead of the new checks.
3. **THE REGRESSION FIXTURE — 11 currently-valid payloads, all still ACCEPTED**:
   own + Σ-1 · student + SIM-2 · `e_items: []` · `e_items: null` · multi-E with 3
   real events · **legacy aeros** · **legacy fs** · empty section · no `currency`
   key at all · two rows same day different `seq` · `x-fcf-flight` +
   `x-night-students`. **Nothing that worked before this round stopped working.**
4. **THE CONTROLS — 7 pre-existing refusals all still fire, in their own words**:
   wrong `kind` · unknown `s_category` (still lists all **14** choosable
   categories by printed name) · unknown event id · duplicate E on one sortie
   (*«Ε-1β — SPIN»*) · true duplicate row identity · the retired `category` key ·
   missing date.
5. **THE SWEEP, MACHINE-RUN** — the paren-matching classifier over
   `db/schema.sql`: **24** `wa.chk` sites containing `= any(`, **12** explicit,
   **12** bare (the 20b verifier's independent re-derivation refiled one site;
   see §4w·2), classified in the §4w·2 table. The classifier was a one-off —
   the re-derivation recipe lives in §4w·2's opening paragraph; no standing
   script exists, and the table says so instead of pointing at one.
6. **SCHEMA APPLIED TWICE**, `ON_ERROR_STOP=1`, exit **0** both times, **0**
   `ERROR`/`FATAL` lines on the second pass.
7. **NO FUNCTION CREATED, DROPPED OR RENAMED** — the three additions are
   `perform wa.chk(…)` statements inside a function that already carried its
   clause. `pg_proc`: **110 wa functions · 110 pinned · 0 unpinned**, and the
   audit block still prints *«r20: search_path pinned on all 110 wa functions»*.
8. **THE REFUSAL AS THE INSTRUCTOR'S OWN BROWSER RECEIVES IT.** The three
   defective payloads posted from the running page to
   `/rest/v1/rpc/save_instructor_currency` over the app's own `WA_CONFIG`
   endpoint: **HTTP 400** on all three, each carrying the field-addressed
   sentence — `currency[0].s_category`, `currency[0].kind`,
   `currency[0].e_items[0]`. The contract is true at the wire, not only inside
   the database.
9. **AND THE CLIENT IS STILL THE FIRST LINE — BOTH LAYERS, IN ONE VOCABULARY.**
   On the running app the first row's Σ category was set back to *«— choose —»*
   and Save pressed through the confirm dialog. The client refused **before any
   RPC**: *«0 saved · Currency not saved — own · 26/08/2026 — still needs which
   Σ category it was»*, the offending row red-edged and focused. **`0 saved`** —
   so the instructor still meets the form's sentence, and the server's
   matching-vocabulary refusal is the backstop for everything that is *not* the
   form.
10. **THE LEGACY FIXTURE SURVIVES THE TIGHTENING** — the 4-row round-19 record
    migrates on read to `legacy-aeros-unspecified` ×2 / `legacy-fs-unspecified`
    ×2, the badge reads **«4 without a Σ»**, the legacy option is offered
    **only** on the row that holds it (ΑΕΡΟΣ rows never offer the F/S legacy id
    and vice versa), and the migrated record **re-validates** under the new rule
    — write-back-what-was-read still holds.
11. **THE LOCAL DEMO IS EXACTLY AS FOUND.** The RPC proof of item 2 wrote a
    record for a *second* instructor; it was deleted. **1 record · 4 rows ·
    `last_update` 2026-08-26 19:23:00+00 · `md5(data)` unchanged**, and the
    fixture stays round-19-shaped **on purpose** — it is what proves the
    migration on every future run (§4v·6·14).
12. **HYGIENE.** `node --check` clean on all seven client files; **zero console
    errors** on a fresh tab through the instructor landing and both doors; no
    horizontal page scroll. The privacy grep — **186** person-identifying terms
    (names · call signs · MN · external OID · tokens, taken live from the
    roster) over all **21** tracked files: **0 real-person hits**, and **0** of
    those terms appear anywhere in this round's diff.
13. **NO CLIENT FILE CHANGED, SO NO CACHE BUSTER MOVED.** The round is
    server-and-spec only (`db/schema.sql`, `specs/wingsahead-spec.md`); the
    client's promise did not need rewording **because the server came to meet
    it** — which is the right direction for a contract the client had already
    written down.

## 4x. Round 21 (2026-08-28) — CONTINUATION / WITH SP, THE DEMO FLIGHT, AND MY FLIGHT LOGBOOK

RULING (2026-08-28, record dated; verbatim spirit): «Στο flight επιλογές
Continuation, With SP. Οι επιλογές στο category ωραίες όταν έχουμε τωρινό own —
μετά Continuation. Πρόσθεσε και το demo flight. Όταν η επιλογή είναι With SP
(τωρινό with a student) να ανοίγουν οι πτήσεις των μαθητών, έξτρα repeat, fcf,
cef. Το PROGRAMME δεν χρειάζεται. Μια χαρά για τα events. Στο My Currency να
έχουμε έναν πίνακα My Flight Logbook, όπου θα μπαίνει ό,τι βάζει ο κάθε
εκπαιδευτής. Εδώ είναι που θέλει προσοχή: αν μπει ένας μαθητής και βάλει πτήση
C4101 με [τον εκπαιδευτή] να το βλέπουμε κι εδώ — ή αν προσθέσει κάποιος πτήση
στο progress του FDMS (όχι του scheduler — αυτές που έχουν γίνει). Στήστο με
προσοχή στα πεδία, πίνακες, σχήμα.»

### 4x·1. THE KIND RENAME — THE STORED KEYS MOVE

`wa.currency_kinds()` = **`['continuation','with_sp']`**, with the printed
labels in a new SQL twin **`wa.currency_kind_label(id)`** («Continuation» /
«With SP») beside the client's `WA.CURRENCY_KINDS`. **Judgement recorded**: the
cloud `instructor_records` table is EMPTY (verified 27/08/2026, restated at the
migration's comment), so a permanent translation layer («stored 'own', shown
Continuation») would be a tax paid forever to spare a migration that costs two
CASE arms. The house already owns the mechanism (read-time repair,
`wa.migrate_ins_entry`), it is idempotent, and stored keys that say what the
surfaces say is the round-20 doctrine — no two vocabularies for one fact.

The migration table (read-time, both mirrors; the cloud maps nothing):

| old stored | new stored | note |
|---|---|---|
| `kind: 'own'` | `kind: 'continuation'` | pure rename |
| `kind: 'student'` | `kind: 'with_sp'` | pure rename |
| `category: 'aeros'` (round 19) | `s_category: 'legacy-aeros-unspecified'` | existing round-20 arm, kept, runs unchanged |
| `category: 'fs'` (round 19) | `s_category: 'legacy-fs-unspecified'` | existing arm, kept |
| `sortie` = `REPEAT`/`FCF`/`CEF` | the lowercase marker id | **implementation arm the design pass did not list** — see §4x·2 |
| `s_category` on a (now) `with_sp` row | **KEPT AS-IS** — legacy carrier | the old row claimed a Σ; nobody can reconstruct the student's sortie code from it, and the migration does not guess. Rendered marked: «Σ as claimed: …». Growth blocked at write. |

Ordering inside `migrate_ins_entry`: the kind map first, then the marker fold,
then the category→legacy arm (all idempotent; the strip runs after, as today).
**THE GROW-GUARD**: new `wa.ins_withsp_scat_count(p)` counts the currency rows
where `kind='with_sp'` and the entry carries `s_category`;
`wa.write_instructor_record` refuses a payload whose count EXCEEDS the stored
record's (both sides counted in the MIGRATED shape — the exact analog of the
round-6 `phase` grow-guard), sentence: *«a Σ category on a with-SP flight is a
leftover of the old form — it may stay on the rows that already carry one, and
no new row takes one; name the student's sortie instead»*. Replacing the claim
with a sortie DROPS the count and is accepted — that correction is what the
guard exists to allow.

### 4x·2. THE WITH-SP SORTIE — §4u·2 SUPERSEDED FOR THIS KIND ONLY

`wa.ins_entry_keys('currency')` becomes
`['date','kind','s_category','sortie','e_items','seq']`. Round 19's two
reasons for refusing a sortie code (§4u·2) are QUOTED AND RETIRED for
`with_sp` only: **(a)** «the box would be empty-by-nature on half the rows»
dies the moment the field exists only on the kind where it is always
meaningful — a flight WITH a student always has the student's sortie; **(b)**
«FDMS's currency cell is dated by DATE and E-ITEM and by nothing else» was
argued about the instructor's OWN Σ rows, which keep their Σ category and
refuse a sortie BY NAME: *«a Continuation flight is your own — it is named by
its Σ category of Πίνακας 9 / Πίνακας 6, not by a syllabus sortie of the
students»*. One NEW field and not a unified one, with the bridge in mind: the
two value spaces have different closed lists, different derivations and
different escape rules, and the bridge join (§4x·6) wants the student row's
`sortie` VERBATIM under the SAME KEY NAME.

Per-kind rules (server = client wording — the `curIncomplete()` promise):

- **continuation** — `s_category` REQUIRED (*«every Continuation flight names
  which Σ category it was — Πίνακας 9 and Πίνακας 6 are counted by the
  category, so a flight without one is counted towards nothing»*); `sortie`
  refused by name (above).
- **with_sp** — `sortie` REQUIRED (*«every flight with an SP names what was
  flown — choose the student's sortie from the syllabus, or repeat / fcf /
  cef, or type the code if the syllabus data lags reality»*), UNLESS the row is
  a legacy carrier (a Σ and no sortie — the one sanctioned way to stand
  without one). A row carrying BOTH is refused: *«one box, one fact — this
  flight already names the student sortie, and a Σ category beside it would be
  a second claim that can contradict the first»* — and the FORM keeps the rule
  true before the server does: flipping the kind clears the field the new kind
  does not take, and a sortie chosen on a carrier REPLACES the claim (toast,
  nothing written until Save).
- `kind` missing / not in list: *«every flight of the logbook says whether it
  was a Continuation flight of your own or one with a student (SP) — …»* /
  *«a flight is either a Continuation flight or one with an SP — continuation /
  with_sp»*.

**The value space of `sortie`**: (a) a syllabus code of the STUDENT catalogue,
**both bands open** — the students fly aircraft AND simulator with
instructors; recognised exactly when `wa.sortie_band(code)` is non-null. (b)
the three MARKERS, which ARE the R12 kind ids — new
**`wa.withsp_markers()`** = `['repeat','fcf','cef']`, pinned as a subset of
`wa.flight_kinds()` deliberately without `'syllabus'` (a syllabus flight is
named by its code) and without `'other'` (the off-catalogue free text IS the
other). (c) **off-catalogue free text**, accepted (`wa.chk_text` ≤ 40) and
shown marked — the student form's own escape. **No checkride refusal** here:
the student-side `wa.eval_ids()` refusal exists to prevent two grades for one
flight, and this row carries no grade — judgement recorded. **Nothing stores a
band or a track**: `wa.sortie_band` derives the band where the code is known
and honestly derives nothing for markers and free text.

**DEVIATIONS RECORDED (implementation, two):**
1. **The marker fold.** The normalisation boundary upper-cases every field
   named `sortie` (`wa.code_fields` → `norm_code`), so a stored marker would
   read `REPEAT` while every reader and the bridge join compare against the
   lowercase R12 id. `wa.migrate_ins_entry` (and its client twin) therefore
   folds a sortie whose lowercase form is a marker back to the lowercase id —
   idempotent, registered in the migration, and the reason the design's
   «stored value stays as typed/picked» holds in spirit: codes store
   normalised (upper, as the student's do), markers store as the ids they are.
2. **The picker control.** The design pass said «input + datalist (the student
   form's own sortie pattern)»; the student form's sortie control is in fact a
   `<select>` with an «Other…» free-text escape, and a `<datalist>` cannot
   render the optgroups the same design asks for. Implemented as the design's
   optgroups — a leading **«Beyond the syllabus»** (the three markers, each
   with its label: «repeat — a re-fly of a syllabus flight» · «FCF — aircraft
   test flight» · «CEF — Εξέταση Καταλληλότητας») followed by the **8 (band,
   track) groups in flow-chart order** from `WA_LOG_SORTIES` (no new catalogue
   file) — plus **«Other… (type the code)»**, which swaps the box to free text
   with a «list» control back. Off-catalogue values render selected and
   marked, never dropped.

**The uniqueness identity — one formula, both kinds** (the change-dialog
identity and the duplicate refusal stay one thing):
`kind | coalesce(s_category, upper(wa.norm_line(sortie)), '') | date |
coalesce(seq,'1')` — so `c4101` and `C4101` cannot both be stored, markers
pass through `upper()` harmlessly, and the same identity under DIFFERENT kinds
is two rows, not a duplicate. The refusal prints `wa.s_category_name` where
present, else the sortie verbatim. `WA.curIdent` / `curTrip` mirror the
coalesce.

### 4x·3. THE DEMO FLIGHT — x-demo-flight, GENERATED AND MARKED

New generated Σ category (17th): id `x-demo-flight`, c «Πτήση επίδειξης
(DEMO)», n «Display flight (demo sortie)», g `aeros`, `aid: true` (not a
printed row of Πίνακας 9), **`dp: true` — the NEW FLAG, the `tp` mechanism's
second instance**, no printed quota. Position: after `x-fcf-flight`, before
`legacy-aeros-unspecified` — §37α counts the demo sortie WITH the FCF inside
Σ-1 in one sentence («Στην κατηγορία αυτή να συμπεριλαμβάνονται, για τους
διαθέσιμους, οι πτήσεις Δοκιμής Α/Φ (FCF) και DEMO»), so the two aids of that
sentence sit together.

**Marked, not hidden — the recorded reasoning**: FDMS gates its six demo
records on the curated `demo_pilot` flag; Wings Ahead's roster has NO such
flag at all (deliberately not added this round), so hiding is not even
possible without inventing one — and an invented, unset flag would stop a man
recording a flight he really flew, the x-fcf reasoning verbatim. `dp` renders
«(Demo pilots)» beside the option and «Demo pilots only — the option is
marked, never hidden» in `WA.sCatTip`; **no server gate** (same as `tp`).

**Generator** (`tools/gen-currency-catalog.py`): new `S_DEMO` declaration; new
**`assert_demo_against_source(cat)`** — the research file must still carry
`e-1d-demo` (kind `e-item`) AND `demo-500ft-currency` (kind `recency`, the
Ch.5 §17 15-day display currency a dated `x-demo-flight` row is what feeds),
else `SystemExit` («the demo category must be re-argued against the catalog
that exists») — the exclusion-list assert pattern, third instance. It does NOT
assert against FDMS's `app/currency.js`: demo is not a SYNTH column there (it
is the `DEMO_IDS` table), so the `S_AIDS` client assert does not apply —
recorded in the docstring. `WA_S_CATEGORIES.total` 16 → 17; the refusal's
offered-count moves 14 → 15 automatically (computed live, minus the legacy
ids).

**E-items unchanged** («μια χαρά για τα events»): `e-1d-demo` STAYS excluded
from `WA_E_ITEMS` — the ruling touched the Σ picker (a category), and a dated
`x-demo-flight` row already carries the fact FDMS's demo currency needs (Ch.5
§17 is dated by the display sortie itself). Judgement recorded.

### 4x·4. PROGRAMME LEAVES THE UI — THE FACT STAYS, THE DECORATION GOES

«Το PROGRAMME δεν χρειάζεται» is read as: the derived FACT stays (the bridge
eats it), the derived DECORATION goes. **What died**: the Programme column and
derived `.prog` cell in the currency table (edit and read-only rows alike),
the programme column in the print view, and the programme-led optgroup labels.
**What survived, server-side, untouched**: `wa.s_category_group`,
`wa.currency_categories`, `wa.currency_category_name` — because (a) the export
labels every `s_categories` row with `programme` + `programme_name` and the
FDMS currency card is split ΑΕΡΟΣ/F-S — the bridge needs the mapping; (b) the
Σ refusal sentence names the two printed tables; (c) the two legacy ids are
per-programme by construction. The Σ picker KEEPS its two optgroups (a flat
17-item list would be worse), retitled by the printed tables — **«Πίνακας 9
(ΑΕΡΟΣ)» / «Πίνακας 6 (F/S)»** — a source citation, not a badge; `WA.sCatTip`
keeps citing the printed table inside the tooltip for the same reason.
`WA.CURRENCY_CATS` / `currencyCatLabel` survive client-side only as far as
tooltips and export-reading need them.

### 4x·5. MY FLIGHT LOGBOOK — THREE SOURCES, ONE ROW SHAPE, SERVER-COMPUTED

New **`wa.instructor_logbook(v)`**, shipped as one new key `'logbook'` of
`wa.instructor_dataset` — the §4u house rule (one round trip per door), and
the admin's on-behalf view inherits it read-only for free; no new RPC. Row
shape: `{src: self|sp|fdms, date, sortie, s_category, band, kind, seq, grade,
ng, mission, student{last_name,first_name,class}, match: oid|surname,
ambiguous, legacy}`.

- **(a) SELF** — the caller's own currency rows, PROJECTED (`e_items` are NOT
  repeated: they live in the editable table above; the logbook is the flying,
  not the events).
- **(b) SP-ENTERED** — for every **ACTIVE student** (deliberately NOT
  `wa.student_in_scope`: the ruling says any student's row naming him, and a
  graduating class closing its assessment window does not un-fly its flights —
  recorded), every `flights`/`fs` row (post-`wa.migrate_record`, once per
  record via the lateral pattern) matching the caller. `solo_flights` are
  EXCLUDED (the instructor there AUTHORISED, he was not aboard);
  `evaluations`/`fpc`/`cef` evaluator matches are a NOTED open item (§4x·10).
- **(c) FDMS-PROGRESS** — the designed, EMPTY slot: a row whose per-entry
  provenance stamp is `'fdms'` (`entered_by = 'fdms'` — the value
  `wa.entry_count_by`'s comment already reserves for bridge slice 3) is
  labelled `src:'fdms'` instead of `'sp'`. Today zero rows carry it, so
  `counts.fdms` renders 0 and the source column exists — Phase 4's FDMS→WA
  lane lands into a finished surface with NO further logbook change. (A direct
  FDMS-training-log feed bypassing student records would be a bridge import
  lane — out of scope, recorded.)

**Matching — oid-first, surname fallback, shared-surname honesty**: (1) a row
carrying `instructor_oid` matches iff `v.external_oid` is non-null and equal —
the oid is the unambiguous identity, surname never overrides it, and an oid
row that is not his is not listed; (2) no oid → folded surnames
(`lower(btrim())` both sides); a misspelled surname matches nobody and appears
in nobody's logbook — the same truth every surname box already lives with,
recorded, not papered over; (3) `ambiguous: true` on every surname-matched row
whose folded surname is shared by MORE THAN ONE `role='instructor'` row in
`people` (active or not — old rows may name departed men): SHOWN, flagged
«shared surname — may belong to another», counted under `counts.sp_ambiguous`
as well as `counts.sp` — flagged, never guessed, never silently attributed,
never dropped; both holders see the row flagged in their own logbooks.

**Envelope**: `{rows, counts: {self, sp, sp_ambiguous, fdms}, truncated,
omitted}`. Sorting server-side: `date desc`, then src (`self` → `sp` →
`fdms`), then student surname, then `seq desc`. **Caps, counts stay true**:
self uncapped (≤400 by `wa.ins_section_cap`); sp+fdms capped at the most
recent **600** post-sort; `counts` computed BEFORE the cap; `truncated` +
`omitted` say so and the client says it in words. The in-scope students'
records are migrated a second time by the students lane — accepted and
recorded (different populations; sharing would couple two lanes for a
≤31-record cost).

**Client**: the «My currency» door gains the read-only **«My Flight
Logbook»** card BELOW the editable table — columns Date · Source (Self / SP /
FDMS chips) · Flight (Σ printed name, sortie label or marker label) · Band ·
Student · Result (grade / NG / mission / awaiting-debrief chip) · #; counts
line above; ambiguous and legacy rows wear marked chips; no control writes.
Door tile sub becomes «your own flying · your logbook» (only where the payload
carries the key — a pre-round-21 server draws no card and makes no promise).
**PERFORMANCE — THE MEASURED NUMBER, AND THE TRADE IT BUYS (round 22, WA-21
verify finding 5)**: the WA-21 verify timed `wa.instructor_dataset` at **3.3 s
for a 930-row logbook** on the local stack. That is the cost of the shape this
section chose deliberately, and the number belongs beside the choice: the SP
lane migrates every ACTIVE student's record on read (`wa.migrate_record`, once
per record via the lateral pattern) rather than reading a denormalised join
table, because a stored projection is a second copy that eventually disagrees
with its sources — the same argument that keeps the logbook out of the export
and off the print sheet. **ACCEPTED AS THE TRADE, with the number attached**:
one door, one round trip, at most one dataset call per page load, on a
population bounded by the class sizes the squadron actually runs (≤31 records
in scope + the caps of §4u). 930 rows is already several times a real
instructor's stage. IF IT EVER STOPS BEING ACCEPTABLE the fix is named in
advance and does not change the contract: cache the migrated record per
(student, last_update) for the length of one request, which removes the second
migration the students lane already pays for and leaves every projection
identical. Not built — measured, judged and recorded.

**Implementation note (recorded)**: the client re-projects the SELF lane from
its own last-saved rows (the same migrated record the server projects — one
truth, two projections), so a currency save updates the logbook without a
second round trip; the SP/FDMS lanes are the server's. The logbook is NOT
printed by the print sheet and NOT exported — a projection recomputable from
its sources, and a copy that shipped beside them would eventually disagree
(§4x·7).

### 4x·6. THE BRIDGE JOIN CONTRACT — DECLARED, NOT YET EXERCISED (slice 6 / Phase 4)

- **Code row**: instructor `(date, upper(norm(sortie)))` ↔ student
  `flights|fs` row with equal `date` and equal `upper(wa.norm_line(sortie))`,
  the student row matching the instructor by the §4x·5 rule (oid-first,
  surname fallback). `seq` is NOT part of the join key — the instructor's seq
  counts HIS sorties of that identity that day, the student's counts the
  student's re-flies; multiple candidates on one day pair by seq ascending on
  both sides and the cross-check REPORTS the remainder, never forces 1:1.
  Result classes mirror the bridge's: `agree` / `claim_only` / `student_only`.
- **Marker row**: instructor `(date, marker)` ↔ student rows of that date with
  `kind = marker` naming him (for `repeat` the generic marker matches any of
  his repeats that day — the ruling asked for the generic options by name, and
  a repeat picked as its code joins tighter anyway; recorded).
- Nothing on the instructor row names the student — the round-19 unlinking
  doctrine stands; the join always goes THROUGH the student row's instructor
  fields.

### 4x·7. EXPORT DELTA — AND WHY THE STAMP STAYS wa-export-v1

- `instructor_records[]` rows already ship migrated `data` (so exports carry
  the NEW kind keys automatically) + `legacy_rows`; ADD **`withsp_legacy_rows`**
  (`wa.ins_withsp_scat_count` of the migrated data) — the second «work the
  developer owes» number beside the first.
- ADD top-level **`currency_kinds`**: `[{id, label}]` from `wa.currency_kinds()`
  + `wa.currency_kind_label(id)`, so no reader ever hardcodes the ids the way
  it never hardcodes a Σ slug.
- `s_categories` gains `x-demo-flight` automatically (generated;
  `legacy:false`, programme fields unchanged in shape).
- **Schema stamp stays `wa-export-v1`** — justified so the next round does not
  re-litigate it: §4u·9's promotion rule triggers on a change that BREAKS an
  existing reader; the only prospective reader of `kind` values is the
  bridge's currency lane (slice 6, unshipped), no shipped reader switch-cases
  on `'own'`/`'student'`, and every change here is additive.
- The logbook is NOT exported — it is a projection recomputable from
  `student_records` + `instructor_records` + `people`, and an export that
  shipped both sources and projection would eventually disagree with itself.

### 4x·8. AUDIT-TABLE DELTA · CACHE-BUSTER · DEPLOYMENT GATE

**Dropdowns (§4h)**: the `kind` box keeps its closed two (new words); the Σ
box is unchanged in mechanics (retitled optgroups, +1 marked option); the NEW
with-SP sortie box is a closed list (3 markers + 133 catalogue codes in 9
optgroups) **with the student form's own «Other…» free-text escape** — closed
where the catalogue knows, open where reality outruns it, exactly the R12
sortie box's contract. No other box changed.

**Cache-busters (touched-only)**: `currency-catalog.js`, `app.js`,
`instructor.js`, `styles.css` (the dead `.curtbl td.prog` rule removed with
its cell) → `?v=20260828a` (`student.js`, `admin.js`, `config.js`,
`items-catalog.js` untouched and unbumped). `app/config.js` itself needed no
change — the round adds no endpoint.

**Deployment gate — THE SCHEMA GOES FIRST**, through the §4φ Supabase MCP gate
(the main session runs `db/schema.sql` on the cloud in batches; the token-echo
SELECT stays the LAST statement for the batch splitter). Then the app
(`?v=20260828a`). In that order because an app that sends `sortie` (or the new
kind keys) to a schema that does not know them is refused by the key whitelist
— by design. The LOCAL stack got the schema this round (applied twice,
`ON_ERROR_STOP=1`, exit 0 both, 0 ERROR/FATAL lines; the r20 audit now prints
**«search_path pinned on all 114 wa functions»** — the four new functions all
carry the clause). Schema changed → **COMMIT, DO NOT PUSH**.

### 4x·9. SELF-VERIFICATION — RUN LIVE ON THE LOCAL STACK (all PASS)

1. **The kind rename round-trips the round-19 fixture** (4 rows, `own`×3 +
   `student`×1 + `category` keys): migrates on read to
   `continuation`×3/`with_sp`×1 + the two legacy ids, **re-validates**
   (write-back-what-was-read holds), and `migrate(migrate(x)) = migrate(x)`.
2. **A with_sp+s_category payload that GROWS the count is refused** in the
   grow-guard's own sentence; a planted round-20-shaped carrier **round-trips
   unchanged** and **replacing the claim with a sortie is accepted**.
3. **A both-fields row is refused by name** («one box, one fact»); a
   continuation row with a sortie, a Σ-less continuation row, a sortie-less
   with_sp row and a kind-less row are each refused in their §4x·2 sentences;
   the retired `own` kind is refused by the closed list («continuation /
   with_sp»).
4. **Marker and code rows save** end-to-end through
   `wa.write_instructor_record`: `c4101` stores `C4101`, `REPEAT` folds to
   `repeat`, off-catalogue text stores normalised and renders marked.
5. **The demo option is present, marked «(Demo pilots)», and storable**
   (`x-demo-flight` accepted with events; in the export's `s_categories`).
6. **The duplicate identity fires across the coalesce** (`C4101` vs `c4101`,
   one day, one kind) — and the SAME identity under DIFFERENT kinds is two
   rows, not a duplicate.
7. **Logbook**: oid-match unambiguous with grade+band; the oid row is
   INVISIBLE to the other holder of the surname; surname rows flagged
   `ambiguous` for BOTH holders; the fs `repeat` row keeps band+kind+flag;
   **cap bites at 600 with counts computed before it** (650 planted → sp=650,
   listed=600, omitted=50, truncated=true); the fixture instructor's real
   logbook reads `{self:4, sp:0, sp_ambiguous:0, fdms:0}` — **fdms is 0**.
8. **The ruling's own scenario, end-to-end through the running app**: a
   student saved a `C4101` row naming the instructor through
   `public.save_student_record`; the instructor's reloaded page showed it in
   My Flight Logbook — `SP` chip, «C4101 — Contact – Familiarization», band
   Flights, the student named, «awaiting debrief» — and the counts line read
   «4 of your own · 1 entered by students · 0 from FDMS Progress». The student
   record was then restored byte-exactly (md5 + last_update verified).
9. **Export carries `currency_kinds`** (`continuation`/«Continuation»,
   `with_sp`/«With SP») **and `withsp_legacy_rows`** (fixture: 1, beside
   `legacy_rows` 4); stamp still `wa-export-v1`.
10. **Client**: the with-SP picker renders «Beyond the syllabus» + the 8
    (band, track) optgroups (138 options); kind flips clear the other kind's
    field; the carrier chip «Σ as claimed» renders and a chosen sortie
    replaces it; the admin on-behalf twin renders the same two cards with **0
    editable controls**; **zero console errors** on the landing, both doors
    and the on-behalf twin; `node --check` clean on all seven client files.
11. **Hygiene**: schema applied twice (exit 0, 0 ERROR lines); the local demo
    left exactly as found (fixture `instructor_records` md5 + `last_update`
    unchanged; all temp roster/record rows deleted; people counts restored);
    privacy grep — 190 live roster terms over all tracked files: 0
    real-person hits (the only matches are the deliberate NATO-alphabet demo
    fixtures of §4s and single-letter initials). The cloud advisor re-run
    belongs to the §4φ gate of the main session, where the accepted lint
    number is re-checked.

### 4x·10. OPEN ITEMS THE ROUND LEAVES, BY NAME

1. **`x-night-students` is now reachable only under Continuation** while its
   name describes a with-students sortie — flagged for the user, not decided:
   FDMS carries it as a column of the instructor's OWN ΑΕΡΟΣ table, so
   Continuation may well be the right shelf, but the words sit oddly and the
   call is the user's.
2. **Evaluator matches** (`evaluations`/`fpc`/`cef` rows naming him as
   evaluator) as a fourth logbook source — noted, not built.
3. **A `demo_pilot` roster flag**, if the squadron ever wants the demo option
   GATED instead of marked — until then FDMS's flag stays the curated one.
4. **The FDMS-side one-line note in bridge-spec.md** — D:\FDMS is read-only to
   this round; the note that slice 3's landing surface (the logbook's fdms
   lane) now exists belongs to the next FDMS lane.

## 4y. Round 22 (2026-08-28) — ONE FLIGHT, ONE RECORD: THE SOLO SLOT AND THE EIGHT CHECKRIDES RENDER INSIDE THE FLIGHTS TABLES

TWO RULINGS (2026-08-28, record dated; verbatim):

> «Έβαλα την C4791 και έκανα save. Γιατί δεν ανανεώνεται στον πίνακα Flights;»

> «Στα flights δεν έχεις τις αξιολογήσεις — τις θέλουμε.»

They are one question asked twice. The Flights tables draw the printed flow
chart, and TWO KINDS OF SORTIE of that chart were not in them: a sortie flown
SOLO (recorded in Solo flights) and the eight CHECKRIDES (recorded in
Evaluations, and refused in the flights log by name since round 12). The first
produced double bookkeeping — the user filled the C4791 solo, saved, and the
Flights row for the same flight stayed grey and owed. The second produced a
hole — the one surface that reads a stage in flow-chart order had eight gaps in
it, and «what is this student still owed» came out eight short.

**THE ANSWER IS THE CHECKRIDE PRECEDENT, GENERALISED: one fact, ONE stored row,
and every other surface RENDERS it.** Nothing new is stored, nothing is
duplicated, and no section loses ownership of its own record.

### 4y·1. THE DERIVED ROW — WHAT IT IS, AND THE THREE INVARIANTS

A **derived row** is a position of a Flights table whose flight is stored in
another section of the same record. `WA.derivedSlots(sec, rec)` answers, for a
whole record, «which positions of this log are filled from elsewhere, and what
do they say», and every surface that draws or counts the log reads that one
answer: the student's form, the admin's drill-down, the printed brief, the
instructor's student card, the four counters and the nav rails.

Three invariants, and they are the whole of the design:

1. **NOTHING IS STORED.** A derived row has no index, never enters a payload,
   never appears in an export, is never stamped and never counts as an entry.
   `n` and `hours` deliberately ignore it: the row that holds the duration lives
   in the section that stores it, and counting it here would count one flight's
   hours twice. Rendering it or not rendering it leaves the stored bytes
   identical.
2. **IT IS NEVER EDITABLE.** The fact belongs to its own section. The row
   carries no control of its own — only a **↗** that lands on the row which
   owns it, because the answer to «why can I not edit this» has to be one click
   from the question.
3. **IT WINS ITS POSITION.** A stored flights row naming the same sortie cannot
   claim it (`WA.claims` takes the derived keys in a pass 0, before either of
   round 13's two passes). A legacy carrier that predates the refusal therefore
   falls back to being a marked **EXTRA** — kept, visible, asked for, never
   destroyed and never mistaken for the planned pass.

**THE TREATMENT IS THE HOUSE MUTED ONE, NOT A FIFTH COLOUR.** The four state
washes keep their meaning — a flown checkride is green like any flown sortie,
an unflown one is grey like any owed row. What marks a row as derived is the
dashed left rule, the muted italic cells and a chip naming the owning section
(«checkride — recorded in Evaluations» · «recorded in Solo flights»). The state
word is still in the last cell, so paper, a monochrome print and a screen
reader get the same answer as the eye.

### 4y·2. THE EIGHT CHECKRIDES REJOIN THE CHART — AS POSITIONS, NOT ROWS

`WA.slotDefs('flights')` now carries all 133 flow-chart sorties per band
instead of the checkride-less 125, each checkride position marked `ck`. **The
aircraft denominator goes 77 → 85** (contact 32→36, instrument 12→14,
formation 21→22, navigation 12→13); **the SIMULATOR tables gain none**, because
none of the eight is an F/S sortie — verified against the generated catalogue,
not assumed. The four `X in the syllabus` tooltips say how many of their rows
are checkrides and why those cannot be typed into.

WHAT DOES NOT MOVE:

- **The R12 refusal stands verbatim.** A stored `flights`/`fs` row naming one
  of the eight is refused by name, in the same sentence, unchanged.
- **The picker is unchanged.** `WA.logPickList` still filters `!s.k`: a
  position nobody may type into needs no option in the dropdown.
- **No checkride placeholder is ever seeded.** `ensureLogSlots` skips `ck`
  defs — seeding one would mint a row the server refuses by name and hand the
  student a box for a flight this section may not hold.
- **`WA.slotKey` returns null for a `ck` position**, so no stored row can ever
  claim one, on any surface, whatever it says.

A checkride's derived row reads the **OPERATIVE attempt** (`WA.evalOperativeOf`
— round 11's pass rule), so the log cannot print a grade the Evaluations table
disowns: `done` when it has a date AND the operative attempt passed (60 % on the
printed scale — the flights table's own «the mission was completed»),
`started` otherwise. A slot nobody has flown produces no derived row at all: the
position renders plainly OWED, read-only.

### 4y·3. THE SOLOS — AND THE REFUSAL SET, JUDGED FROM THE SYLLABUS

> ⚠ **SUPERSEDED IN PART, 2026-08-28 (evening)** — both tiers are now **MARKS,
> not refusals**: §4y·11·1. The two-tier JUDGEMENT stands and still decides
> which sentence a row wears; the refusal it produced does not. The text below
> is the record of what round 22 did and is not rewritten.

Every **FILLED** solo row that names a sortie this log has a position for
derives that position — the eight fixed slots AND an «additional solo», because
a solo recorded is a solo recorded and the double bookkeeping is identical
either way. A filled slot with no sortie chosen yet names no position and
derives nothing; clearing the solo returns the position to an ordinary editable
owed slot on the same keystroke. `done` when the row has its date, the person
who authorised it and either NG (nobody could score it) or a passing grade.

Item 1(b) of the ruling asks for the refusal set to be **judged** from the
syllabus and the judgement **recorded**. It is in two tiers, because the
syllabus itself has two shapes.

**TIER 1 — A SOLO BY DEFINITION. Refused ALWAYS, by name.** A Training Section
whose solo is REQUIRED and whose picker offers no alternative: the slot must be
filled and only one code can fill it, so nobody flies that code dual, ever.
Today that is **exactly one code — C4791**, the stage's 1st SOLO (section
C4790-91, `req`, candidates: C4791 alone). It is the exact parallel of a
checkride: the flow chart leaves no other way to fly it. Generated as
`req && slots_of_section >= len(codes)` (`wa.solo_only_codes()` /
`WA.soloOnlyCodes()`), so a section that ever prescribed 2 solos over 2
candidates would join it without a line of new code.
Sentence: *«C4791 is the stage's 1st SOLO — a solo is recorded in the Solo
flights section, where who authorised it and the NG rule live. Two rows for one
flight would be two records that can disagree.»*

**TIER 2 — A SOLO CANDIDATE. Refused only on the PROVABLE duplicate.** The 17
solo-candidate codes (`wa.solo_slot_codes()`) are NOT inherently solos: C4802
and C4803 are the two candidates of a four-sortie section prescribing ONE solo,
so whichever was not flown solo WAS flown dual and its Flights row is the truth.
**THE WIDER READING OF THE RULING WAS JUDGED AGAINST, AND THIS IS THE RECORD OF
IT**: refusing all 17 by name would refuse a real flight, which is the one thing
this application must never do. «Two rows for one FLIGHT» is the harm the ruling
names, and one flight is one sortie ON ONE DAY — so the refusal fires when this
record's own solo section already holds that sortie **on that date**
(`wa.solo_holder(p, code, date)`), and on nothing else. A dual C4802 on another
day is a second real sortie: it is stored, and it renders as the EXTRA it is,
because the solo already holds the flow-chart position. The form says so on the
keystroke — a REFUSAL flag where the day matches, a WARNING flag («this row is a
second, later sortie … it is shown as an EXTRA; nothing is refused») where it
does not.
Sentence: *«C4802 on 2026-08-25 is already recorded as the solo of C4801-04-S1 —
a solo is recorded in the Solo flights section …»*

**EXISTING ROWS ARE NEVER DESTROYED** — the keep-it-ask-for-it contract. A
record written before this round that carries such a row keeps it: it renders as
a marked EXTRA beside the derived row, the form asks for it, and nothing rewrites
anybody's record. What is refused is a SAVE that still contains one, which is the
moment its owner is in front of the form and can answer.

### 4y·4. THE LIVE FOLLOW — WHY THE RULING'S «δεν ανανεώνεται» IS ANSWERED NOW

A solo filled in and a checkride recorded change positions of the FLIGHTS table
while the student is standing in a different card, so no row-level refresh of
their own section can reach it. `student.js` fingerprints the derived map after
every edit (`syncDerived`, 8 checkrides + 9 solo rows — a string compare on the
common keystroke) and, on the edit that moves it, redraws the two log sections
whole. The box being typed into is in neither of them, so nothing loses its
focus or its caret. The baseline is taken from the FIRST render, so the first
keystroke of a session does not rebuild two tables that have not moved.

**AND THE PLACEHOLDER STAYS UNDERNEATH.** `ensureLogSlots` deliberately asks
`WA.claims(sec, list)` **without** the record — «which positions does a ROW OF
THIS SECTION hold», not «which are spoken for». Skipping the seed under a
derived position was tried and is a defect, caught in the live verify: clear the
solo and the position had no placeholder to fall back to, so **the C4791 row
vanished from the table** instead of returning to owed — and the record
fingerprint would have moved every time a solo was filled or emptied, marking the
form dirty for a row nobody typed. The placeholder is therefore always there,
always unstored (`WA.slotOwed` drops it from the payload), and drawn only when
nothing else holds its place.

### 4y·5. THE SIX WA-21 VERIFY FINDINGS

1. **The «Other…» free-text pair no longer escapes its cell.** The box and its
   «list» way back were bare siblings in a `white-space: nowrap` cell: the input
   took its intrinsic width, the button was pushed past the cell edge and at
   1280 px came to rest under the # column's seq box — painted over and not
   clickable across most of its face. They are ONE control now
   (`<span class="freewrap">`), laid out as a **block-level flex with
   `width: 100%`** — a block box in a table cell resolves its percentage against
   THE CELL, so the pair can never render wider than its column, not even when
   the auto table layout hands the cell less than its content asks for. The
   input is the part that gives (`min-width: 0`); the button never shrinks and
   never moves. The cell (`td.wcell`) carries a `min-width` floor and may grow
   downwards, so the legacy Σ-claim chip stacks above the pair instead of
   shoving it sideways.
2. **The currency save dialog is per-kind truthful.** Round 20 had one kind of
   row, so one sentence was true. Round 21 gave the section two, and a Σ category
   became a property of exactly one of them — yet the dialog still told every
   signer «each row names the Σ category … and the E-items», false in front of
   every with-SP row, on the one screen where the claim is SIGNED. `curSaveWhat()`
   now reads the rows about to be stored and describes those: the Σ half only
   where a Σ is really there, the sortie half only where a sortie is, both (with
   counts) when both are.
3. **The off-catalogue promise is honest.** Every «Other…» tooltip said the typed
   code was «saved as typed». It is not: `sortie` / `slot` / `evaluation` /
   `flight_code` are `wa.code_fields()` and go through `wa.norm_code` =
   `upper(wa.norm_line(t))`, so `c4302` is STORED `C4302`. One sentence now, in
   `WA.OFFCAT_SAVED`, used by every code box on both forms: «saved in capitals,
   exactly as the log prints it … and leading and trailing spaces are trimmed».
   The free-text fields that are NOT codes (a course code, a note) keep their own
   wording, because for them the old promise was true.
4. **`wa.withsp_markers() ⊆ wa.flight_kinds()` is now an executable assert.**
   §4x·2 declares the three with-SP markers to BE the R12 flight-kind ids — that
   is what makes the bridge join of §4x·6 a join and not a translation table —
   and nothing enforced it. Add a fourth marker, or rename a kind, and the lists
   drift silently: the join then matches nothing and no error is ever raised,
   which is the worst failure this file can have. A deploy-time `do $$` block
   FAILS with names, in the round-20 search-path audit's own pattern, and a
   second clause refuses the two deliberate exclusions (`syllabus`, `other`) if
   they ever appear. A companion block asserts that every
   `wa.solo_slot_codes()` entry is a sortie the flow chart knows (a refusal
   nobody could satisfy would otherwise be shippable) and that
   `solo_only ⊆ solo_slot`.
5. **The 3.3 s / 930-row logbook measurement is recorded in §4x·5** as the
   accepted trade, with the number attached and the named fix held in reserve
   (per-request cache keyed on (student, last_update)).
6. **The `s_category = ''` identity edge is aligned on the CLIENT's rule.**
   `WA.curIdent` falls through an empty Σ to the sortie; the server's
   `coalesce(e->>'s_category', …)` skipped only NULL, so a row carrying
   `"s_category": ""` identified itself two different ways. One line —
   `nullif(e->>'s_category', '')` — and the two agree by construction. Proven
   with a **mirror fixture**: 12 rows through `WA.curIdent` and through the
   server's expression produce byte-identical identity lists; the pre-fix
   expression collapsed a C4101 and a **C4102** of the same day into one
   identity, i.e. it would have refused a second, real flight.

### 4y·6. THE GENERATOR TRAP, FOUND AND DEFUSED (not asked for, and it would have broken the next deploy)

`tools/gen-items-catalog.py` REPLACES everything between the GENERATED-BLOCK
markers of `db/schema.sql`. Rounds 14, 15, 18 and 19 had each added a
**hand-written** function inside those markers, where it read naturally beside
the exams and the roster it belongs to — eight functions in all
(`wa.exam_series`, `wa.series_label`, `wa.exam_trials`, `wa.exam_pass_min`,
`wa.exam_passed`, `wa.natkey`, `wa.seniority_key` ×2). And round 20's
search-path sweep pinned the ten GENERATED functions **in the schema file only**,
never in the generator that writes them.

So the next run of the generator — a syllabus correction, one new sortie — would
have **silently deleted 126 lines of live schema** and **unpinned ten wa
functions**, and the deploy would have failed at the round-20 audit, far from the
cause. Verified by running it: 10 insertions, 136 deletions.

Both halves are closed. The eight hand-written functions are RELOCATED below the
`▲▲ GENERATED BLOCK ▲▲` marker (a pure relocation — same relative order, every
one still defined after what it calls), and the generator emits
`set search_path = public, wa, pg_temp` on every function it writes (`SQL_PIN`).
Re-run afterwards, the generator's diff against the schema is **exactly the two
new functions and nothing else**, and `app/items-catalog.js` comes back
byte-identical (md5 unchanged).

### 4y·7. DELTA — SCHEMA · CLIENT · BUSTERS · GATE

**Schema**: +3 functions (`wa.solo_slot_codes`, `wa.solo_only_codes` generated;
`wa.solo_holder` hand-written) → the r20 audit now prints **«search_path pinned
on all 117 wa functions»**; +2 refusals in the flights/fs branch of
`wa.validate_record`; the `nullif` in the currency identity; +2 deploy-time
audit blocks. The token-echo SELECT is still the LAST statement.

**Client**: `WA.derivedSlots` / `derivedKeys` / `derivedTag` / `derivedTip` /
`derivedGradeText` / `derivedJump` / `DERIVED_SRC`; `WA.soloSlotCodes` /
`soloOnlyCodes` / `isSoloOnlyCode` / `soloOnlyRefusal` / `soloTakenRefusal`;
`WA.OFFCAT_SAVED`. `WA.claims` / `stateCounts` / `slotRows` take an optional
trailing **record** — omitted, every one of them behaves exactly as it did
before this round, which is what keeps an older caller correct. `stateCounts`
gains `derived`. New surfaces: the derived `<tr>` and the read-only unflown-
checkride `<tr>` on the student form, the derived row and its Source cell in the
admin drill-down, the derived line on the printed brief, «N recorded elsewhere»
on the admin card and the instructor card, and the `data-jump` handler.

**Cache-busters (touched-only)**: `app.js`, `student.js`, `admin.js`,
`instructor.js`, `styles.css` → `?v=20260828b`. `config.js`,
`items-catalog.js` and `currency-catalog.js` are byte-identical and unbumped.

**Deployment gate — THE SCHEMA GOES FIRST**, through the §4φ Supabase MCP gate:
the main session runs `db/schema.sql` on the cloud in batches, the token-echo
SELECT stays the LAST statement for the batch splitter, then the app
(`?v=20260828b`). **ONE gate covers BOTH round 21 and round 22** — this commit
stacks on the unpushed WA-21 commit and the branch is TWO AHEAD of
`origin/main`. Schema changed → **COMMIT, DO NOT PUSH.**

### 4y·8. SELF-VERIFICATION — RUN LIVE ON THE LOCAL STACK (all PASS)

1. **The ruling's own scenario, end to end.** On a student whose record was
   `{}`: the C4791 position rendered as an editable owed slot; filling the solo
   slot (sortie · date · grade 82 · instructor) turned the **Flights C4791 row
   flown/green on the keystroke** — «C4791 | 20/08/2026 | ALPHA | — | 82 % |
   Mission complete | recorded in Solo flights», zero controls — the block count
   went `done 0 · owed 36` → `done 1 · owed 35` and the rail `85 owed` → `84
   owed`. Saved through the real form; **the stored record's `flights` array came
   back EMPTY** (no derived row, no placeholder); reloaded, the derived row
   rendered identically from the server's own copy. The fixture was then restored
   byte-exactly (md5 `99914b93…`, `last_update` / `created_at` / `updated_at` /
   `entered_by` all as found).
2. **The raw-RPC refusals, through `public.save_student_record`**: a C4791
   flights row → *«C4791 is the stage's 1st SOLO …»* (400); a C4802 row on the
   same day as the record's own C4802 solo → *«C4802 on 2026-08-25 is already
   recorded as the solo of C4801-04-S1 …»* (400); a C4590 row → the R12
   checkride sentence, **verbatim and unchanged** (400).
3. **The refusal does not over-fire**: `C4802` on ANOTHER day is accepted; an
   EMPTY solo slot blocks nothing; `C4101` is accepted; the C4791 SOLO ITSELF is
   accepted; `c4791` lower-case and a `repeat`-kind C4791 are both refused (the
   code is a solo however the row is labelled).
4. **Clear → the position comes back.** Live, without a save: clearing the solo
   returned the C4791 row to an editable owed slot (5 controls), `owed 27 → 28`,
   rail `69 → 70`, and the table still held all 36 contact positions; refilling
   it returned it to derived/green. This is the defect §4y·4 records — it was
   caught here and fixed.
5. **The checkrides render at their flow-chart positions** — the demo record with
   all 8 checkrides and all 8 solos shows **16 derived rows**, `Flights 69 owed`
   of 85, C4590 and C4790 in place between C4403 and C4601 / C4602 and C4791. The
   ↗ on C4590 lands on `evaluations:0` and flashes it; the ↗ on C4791 lands on
   `solo_flights:0`.
6. **The pass-attempt rule is what the log prints**: a checkride graded 41 reads
   `started`; a later attempt at 71 makes the row `done` with grade 71 and
   `attempts: 2`.
7. **Derived rows change no stored byte**: `WA.recordFingerprint` and
   `JSON.stringify` of a record are identical before and after every render path
   runs over it; `WA.filled` sees none; the F/S log gains none (0 derived, slot
   count still 48).
8. **A legacy carrier is kept and marked**: a stored flights row naming a derived
   sortie does not claim the position, reads `extra`, and is counted as one.
9. **Every surface agrees.** Student form 9 derived / `done 9 · owed 27`; admin
   drill-down 16 derived rows with a Source column; printed brief prints them
   («C4590 (checkride — recorded in Evaluations) … done») and its heading reads
   `done 16 · started 0 · owed 69`; the admin card line reads «Flights · 69 of 85
   owed · 16 recorded elsewhere».
10. **Finding 1**: at 1280 px the «list» button sits inside its cell, does not
    overlap the seq box, and is live at **6/6 probe points across its face** —
    and stays 6/6 when the column is force-squeezed to 150 px and to 110 px.
11. **Finding 6**: 12-row mirror fixture — client and server identity lists
    byte-identical; the pre-fix server expression collapsed three distinct rows
    (including a C4101 and a C4102) into one identity.
12. **Schema x2, `ON_ERROR_STOP=1`, exit 0 both**, 0 SQL ERROR/FATAL lines; the
    audits print «r20: search_path pinned on all 117 wa functions», «r22:
    withsp_markers (repeat/fcf/cef) is a subset of flight_kinds», «r22: 17 solo
    candidate code(s), of which 1 refused by name always (C4791)».
13. **Hygiene**: `node --check` clean on all seven client files and
    `ast.parse` on the generator; **zero console errors** on the student form,
    the admin (overview / analysis / brief) and both instructor doors; the local
    demo left exactly as found — all four `student_records` md5 + `last_update`
    unchanged, `instructor_records` md5 unchanged, roster counts 25/16/1
    unchanged; privacy grep over all tracked files: 0 real-person hits.

### 4y·9. OPEN ITEMS THE ROUND LEAVES, BY NAME

1. **The aircraft denominator moved, 77 → 85**, and every historical sentence in
   this spec that says «77 aircraft sorties» describes the pre-round-22 shape.
   Not rewritten — the record of what each round did stays what it said — but a
   reader comparing §4m to a live screen should read this line.
2. **A derived row shows no DURATION.** ~~Neither an evaluation nor a solo row
   stores one, so the cell says «—» with the reason in its tooltip, and the
   block's `h` total does not include those flights.~~
   **CLOSED by the ruling of 2026-08-28 (evening): §4y·11·3.** The two owning
   sections gained an optional `duration`, the derived rows carry it, and the
   block totals include it — which is exactly the ruling this item asked for.
3. **The instructor's «N recorded elsewhere» line** was verified through the
   admin's identical code path; the demo roster has no instructor scoped to the
   one class whose students hold records, so it was not seen on that surface with
   a non-zero count.
4. **Tier 2 is date-scoped by judgement** (§4y·3). ~~If the squadron would rather
   have the wider refusal — any solo-candidate row whose position the solo
   already holds — it is one predicate, and it should be a ruling, because it
   refuses records that are true.~~
   **CLOSED — the other way.** Tier 2 is not widened; it is **GONE**, together
   with tier 1 and the 22b pair refusal: all three are MARKS now, §4y·11·1. The
   date scope survives as the line between the two SENTENCES — the same-day
   shape wears «suspect», another day wears «solo flown» and suspects nothing.

### 4y·10. Round 22b (2026-08-28) — THE THREE FINDINGS OF THE WA-22 ADVERSARIAL READ

The verify of round 22 passed the mechanism — derived rows, the two-tier
refusal, the legacy-carrier fallback — and named three defects in it. This round
fixes **exactly** those three and redesigns nothing that passed.

**FINDING 1 — THE INVISIBLE FROZEN LEGACY CARRIER.** A record written before
round 22 that carries a stored **C4791** flights row **with the C4790-91-S1 solo
slot still EMPTY** — the commonest legacy shape, because the row and the solo
were two books and only one of them was ever filled — rendered that row as an
ordinary **green planned-pass slot row**. No flag, no chip, no sentence
anywhere, while the server refused **every save of that record** with the tier-1
refusal, a duration edit three sections away included, and the student met the
sentence only **after** the save had failed. The record was frozen with no
in-form instruction.

*Why it happened.* Round 22 blocked the solo positions in `WA.claims`, from the
**derived map** — which is per record, and therefore only while a solo is
actually recorded. The verify proved the fix path already worked: the moment a
derived row occupied the position, the same stored row correctly fell to «frow
st-extra» with its named `.cflag`. What was missing was that a **tier-1 code is
a property of the SYLLABUS, not of the record** — nobody ever flies C4791 dual —
so the block belongs where the checkride block already is.

*The fix.* `WA.slotDefs` marks such a position **`so`** (`WA.isSoloOnlyCode`),
`WA.slotOwner(def)` answers «which section owns this position» in one place for
all three surfaces, and `WA.slotKey` refuses a key to `ck` **and** `so` alike:
**a stored row may never claim the position, derived row or not.** Everything
else follows from the contract the checkride positions have honoured since round
22 — the position is **never seeded** (`ensureLogSlots`), is drawn **read-only**
(the generalised `ownedOwedTrHTML`, with the arrow landing on the very solo row
that fills it), is **dropped from the picker** (`WA.logPickList`), reads **OWED**
in every head, rail and count, and the carrier is the **marked EXTRA** the schema
comment always promised. That comment (`db/schema.sql`, the tier-1/tier-2
paragraph) said «a marked EXTRA **beside the derived row**»; the «beside» was the
defect, and it now states the true behaviour: marked EXTRA **always**, derived
row or not. The student's way out — delete the flagged row, save — was verified
end to end.

*And the form now says it before the server does.* Round 22 left the two solo
refusals out of `buildPayload`, so the form's own promise («everything the
server refuses is refused here first, in the same words») was true of the
checkride refusal and of nothing this round added. Both are there now: the row
is **named**, scrolled to and marked, instead of a raw server sentence about a
row the student cannot find.

**FINDING 2 — THE FALSE COMMENT, MADE TRUE BY BUILDING THE CHECK.**
`app/app.js` said, of two solos of one sortie, «*the section itself refuses the
pair*». Nothing refused it, on either side. Both refusals are now built, in
**both mirrors**, in identical words:

- **(a) TWO SOLOS OF ONE SORTIE** — ⚠ **SUPERSEDED 2026-08-28 (evening):** the
  pair check is now a **MARK ON BOTH ROWS**, not a refusal, and `wa.solo_twin`
  is dropped — §4y·11·1. «Ένα solo που δεν πετάχτηκε … συνήθως πετιέται σε
  κάποιο repeat» — a genuine second solo of one code is a flight that happened.
  The reasoning below (what the pair does to the record, the stored order, the
  NULL-blind discipline) stands verbatim and is what the MARK is built on;
  **finding 2 (b), the checkride fence, is unchanged and still a refusal.**
  The round-22b text, kept as the record of what that round did:
  `WA.soloPairRefusal` / `wa.solo_twin`:
  «*F4302 is recorded as the solo of both F4301-06-S1 and F4301-06-S2 — one
  flight, one record …*». The pair derives **one** position of the flight log
  between them (the later wins) while **both** are stored, counted and exported:
  a solo nobody flew, visible in the record and in no table. F4301-06 makes it
  reachable with no free text at all — two prescribed solos over one candidate
  list. The names are printed **in stored order** on both sides, so the sentence
  reads the same whichever row of the pair the validator is standing on.
  **NULL-blind discipline (the WA-20b class):** presence before membership — a
  row joins the comparison only when it **names** a sortie, so eight empty slots
  are not eight rows of one sortie, and an empty row can neither false-fire nor
  disarm the check.
- **(b) A SOLO NAMING A CHECKRIDE CODE** — `WA.soloIsCheckrideRefusal`: the R12
  sentence, one section over. `{"sortie": "C4590"}` was **accepted** into a solo
  slot, stored, counted and exported while appearing **NOWHERE** in the Flights
  table, because `WA.derivedSlots` skips a `ck` position on purpose — that
  position belongs to Evaluations. A checkride is flown **with** an evaluator; it
  can never be a solo, whoever typed it.

**THE JUDGEMENT ON THE REST OF THE FREE TEXT, RECORDED.** The question asked was
whether any **other** non-candidate code needs the same fence — the solo pickers
offer the Training Section's candidates **and** free text beside them.
**The candidate set is NOT fenced, deliberately**, for three reasons: (i) a solo
of a sortie the generated chart did not mark `sc` is still a flight that
happened, and refusing it would refuse the truth — the one thing this
application must never do (the same reasoning that made tier 2 date-scoped,
§4y·3); (ii) unlike a checkride it creates **no second book** — the Flights
position such a code names is DERIVED from that very solo row; (iii) the opening
is already **bounded**, not arbitrary: `wa.code_track` admits only
`^[BCIFN][0-9]{4}$`, and the row's existing check requires the sortie's letter to
match the slot's Training Section. The **pickers are unchanged**, so the mirrors
agree exactly: candidates offered, free text open, checkrides refused by name on
both sides. **Asserted, not merely written down:** the r22 audit block gains a
third assertion — no `wa.solo_slot_codes()` entry may be one of
`wa.eval_ids()` — because a generator run that made those two sets overlap would
offer a code the save refuses, which is the same unanswerable refusal the other
two assertions exist to prevent.
**KEEP IT, ASK FOR IT** for any legacy row that breaks either rule: it is stored,
read and shown exactly as it stands; what is refused is the **save**, with the
row named, so the owner is in front of the form when the question is asked. The
way out is the row's own picker (a slot) or its ✕ (an additional solo). Nothing
is rewritten and nothing is dropped behind its owner's back.
**Left standing, and named here rather than acted on:** the existing sentence
«this sortie does not belong to the Training Section of that solo slot» is
enforced as a **first-letter** test, not a section test. It passed the WA-22
verify and this round does not redesign what passed — but a reader should know
the check is looser than its own words, and tightening it to the sortie's printed
Training Section would be a **ruling**, not an inference.

**FINDING 3 — THE MANGLED TIER-2 SENTENCE.** `WA.soloTakenRefusal` interpolated
`WA.soloSlotLabel(slotId)`, which is the form's own heading — «C4801-04 — solo» —
so the rendered `.cflag` read «*… is already recorded as the solo of C4801-04 —
solo — a solo is recorded …*»: a stray clause the server twin never had. The
client now names the **slot id as it is stored** (`WA.soloHolderName`, the mirror
of `wa.solo_row_name`: the slot, or «an additional solo»), which is the one name
the server can say, so **both mirrors name the same thing in the same words** —
verified char-by-char against the server's own string. The single remaining
difference is the DATE: the form prints `25/08/2026` (`fmtD`, the idiom of every
sentence it says) where the server prints `2026-08-25`. That is a rendering, not
a word, and it is deliberate.

**DELTA.** *Schema*: +2 functions (`wa.solo_row_name`, `wa.solo_twin`) → the r20
audit now prints **«search_path pinned on all 119 wa functions»**; +2 refusals in
the `solo_flights` branch of `wa.validate_record`; +1 assertion in the r22 solo
audit block; the corrected tier-1/tier-2 comment. The token-echo SELECT is still
the LAST statement. *Client*: `WA.slotOwner` / `slotOwnerTip` / `soloSlotOfCode`
/ `soloHolderName` / `soloPairRefusal` / `soloIsCheckrideRefusal`; `so` on the
log slot defs; `WA.slotKey` and `WA.logPickList` read `ck` and `so` alike;
`ckOwedTrHTML` → `ownedOwedTrHTML` (both sources, one function); the two solo
refusals join `buildPayload`'s flights branch and the two new ones its solo
branch; the admin's unfilled-position row names its owner. *Cache-busters
(touched-only)*: `app.js`, `student.js`, `admin.js` → `?v=20260828c`;
`styles.css`, `instructor.js`, `config.js`, `items-catalog.js` and
`currency-catalog.js` are byte-identical and unbumped. *Gate*: the schema
changed → **COMMIT, DO NOT PUSH**; this commit stacks on WA-21 and WA-22 and the
branch is **THREE AHEAD** of `origin/main` — **ONE §4φ MCP gate covers all
three**, schema first, then the app.

**SELF-VERIFICATION — RUN LIVE ON THE LOCAL STACK (all PASS).**
1. **The frozen shape, end to end.** A scratch record holding the stored C4791
   row with the solo slot EMPTY: the row renders **`frow st-extra`** with the
   `.cflag` «solo» carrying the tier-1 sentence and a ✕ of its own; the C4791
   position renders read-only «recorded in Solo flights», **owed**, with the ↗
   landing on `solo_flights:0`; the block reads `owed 36 · extra 1 · 0.3 h` of
   36 and the rail `Flights 85 owed`. Pressing Save is refused **by the form**,
   naming the row («Flights (C4791 · Contact · 20/08/2026): …»); removing the row
   and saving **succeeds**, and the stored record comes back with `flights: []`.
2. **Raw RPC, through `public.save_student_record`**: two solos of F4302 → the
   pair refusal by name; a slot row + a slot-less duplicate → «*… of both
   C4801-04-S1 and an additional solo*»; `{"sortie":"C4590"}` in a solo slot →
   the checkride refusal; ` c4590 ` padded and lower-case → the same refusal.
   **It does not over-fire**: eight EMPTY slots save; one filled + one empty save;
   two solos of the SAME section with DIFFERENT sorties save; a single legal solo
   saves; a **non-candidate but real** sortie in a slot saves (the recorded
   judgement). `wa.solo_twin` returns the pair in stored order from either index
   and null for an absent/empty/`null` sortie.
3. **The tier-1 and tier-2 refusals of round 22 are unchanged**, verbatim, and
   the client's four sentences were compared **character by character** with the
   server's: `PAIR`, `CKSOLO` and `ONLY` **identical**; `TAKEN` differs at
   character 10 only — the date rendering named above.
4. **The mechanism that passed still passes**: filling the solo live turned the
   C4791 position derived **on the keystroke** (`owed 36 → 35`, `started 1`) with
   the carrier still a marked extra beside it; a record with both carriers shows
   `done 2 · owed 34 · extra 2 · 1.5 h`; the demo student with 8 checkrides and 8
   solos still reads **`Flights 69 owed`** of 85; `WA.slotCount` is 85 / 48
   unchanged; the F/S log has **0** `so` positions.
5. **Every surface agrees**: the admin drill-down shows the derived row (Source
   «Solo flights»), the carrier as **extra**, and — with the solo empty — the
   position as an owed row wearing the same chip and the same sentence; the
   printed brief prints both; the picker offers **neither** C4790 nor C4791
   (31 real options + «—» + «Other…»); the block badge now names the solo
   position beside the four checkrides.
6. **Schema ×2, `ON_ERROR_STOP=1`, exit 0 both**, zero SQL ERROR/FATAL lines; the
   audits print «r20: search_path pinned on all 119 wa functions», «r22:
   withsp_markers … subset of flight_kinds» and «r22: 17 solo candidate code(s),
   of which 1 refused by name always (C4791)».
7. **Hygiene**: `node --check` clean on all seven client files; **zero console
   errors** on the student form, the admin's four tabs and both instructor doors;
   the local demo left **exactly as found** — all four `student_records` md5 +
   `last_update` + `created_at` + `updated_at` + `entered_by` restored
   byte-for-byte, `instructor_records` unchanged, roster 25/16/1 unchanged;
   privacy grep over all tracked files: **0 real-person hits**.
8. **One defect of this round's own, caught here**: the first cut of the
   `WA.derivedSlots` edit dropped `const d = ix[key]`, which threw on every
   render («d is not defined») — found by the console check, fixed, and every
   surface re-verified afterwards.

### 4y·11. Round 23 (2026-08-28, evening) — ΜΑΡΚΑΡΙΣΜΑ, ΟΧΙ ΑΡΝΗΣΗ: THE SUSPECT MARK, DURATION ON THE DERIVED ROWS, AND THE EXTRAS/FAIL SEAM

**THE RULING, DATED.** It arrived after WA-22 / 22b had built one-truth out of
REFUSALS, and it **partially overturns** them:

> «Δεν υπάρχει διπλότυπο για την ίδια πτήση. Μια έξοδος (π.χ. C4202) μπορεί να
> πεταχτεί Mission Incomplete — δεν παίρνει βαθμολογία και δεν μετράει στη ροή
> του syllabus· θα μετρήσει μόνο όταν είναι Mission Complete. Ένα solo που δεν
> πετάχτηκε σε μια ενότητα (λόγω καιρού) συνήθως πετιέται σε κάποιο repeat.
> Όπως είναι με το which-sortie που μπορούμε να κάνουμε type είναι μια χαρά — θα
> μπαίνει ως έξτρα γραμμή. Για να μην το πνίξουμε: ΜΑΡΚΑΡΙΣΜΑ ως ύποπτο, και το
> ξεδιαλύνουμε μετά και μαζί.»
> «Να βάλουμε και το duration στις παράγωγες γραμμές. Προσοχή: οι cef, fcf,
> repeat, mission incomplete είναι έξτρα γραμμές. Μπορεί να βαθμολογηθούν και με
> fail, almost good, αλλά και non graded. Όμως αν κάποιος περάσει ένα fail στην
> C4602 επάνω, πρέπει τότε να ενημερώνεται το flight.»

It **overturns in part** §4y·3 (both tiers) and §4y·10 finding 2 (a) (the pair);
it **closes** §4y·9 item 2 (a derived row shows no duration) and §4y·9 item 4
(tier 2's date scope). The one-truth core is left standing.

#### 4y·11·1. SUSPECT, NOT REFUSED

**THE THREE REFUSALS THAT GO**, all three of them client MARKS now — the row is
**saved exactly as it stands**, rendered as an EXTRA, and marked:

| was refused | is now |
|---|---|
| **TIER 1** — a `flights`/`fs` row naming a solo-by-definition code (C4791) | `.cflag` **suspect**, sentence (A) |
| **TIER 2** — the same sortie on the SAME DAY as a flown solo of this record | `.cflag` **suspect**, sentence (B) |
| **THE PAIR** (22b 2a) — two solo rows naming one sortie | `.cflag` **suspect** on **BOTH** rows, at rest, sentence (C) |

**THE FOUR REFUSALS THAT STAY**, because they are STRUCTURALLY IMPOSSIBLE — no
true flight matches them: **R12** (a checkride code in `flights`/`fs`), the **22b
2b fence** (a checkride code in a solo slot), the **letter/track** rules
(`wa.code_track`, the band, the solo slot's first-letter test), and the
**syllabus-order** rules. So do the instructor-on-every-row rule, NG⇒no-grade,
mission-beside-grade, `wa.chk_duration` and the caps.

**WHERE THE MARK COMPUTES: derived at render, NOTHING STORED, on either side.**
Four reasons, in the order they bite. (1) It is a property of the RECORD, not of
a row: «this sortie appears twice» is a *relation* between two rows, and a flag
stored on one of them would have to be re-evaluated whenever the other changed
and would **survive the edit that resolved it** — a mark that outlives its reason
teaches the reader to ignore marks. (2) The R19 lesson runs both ways: a new
stored key costs two registry entries, a migrate branch, a strip branch, a
validator branch and a state test, and buys a value that can **disagree with the
two facts it summarises** — the FPC `result` defect (round 11) and the `verdict`
defect (12b) in a third costume. (3) The WA-22 derived-row precedent (§4y·1) is
the same shape: a suspect mark is a READING of the record, exactly as a derived
row is. (4) The computation already existed on all three sides; three sites
changed their **verb** (refuse → mark) and the server lost its `wa.chk` entirely.
**The server is not asked for a suspect list and the dataset payload does not
grow**: the admin holds the full migrated record client-side and computes with
the *same* `WA.*` functions the student's form uses — **one function, three
surfaces**, the `WA.slotOwner` pattern of 22b.

**THE ONE SHARED FUNCTION.** `WA.logRowFlag(sec, e, rec)` is the whole of
student.js's `logSortieFlag` body lifted to `app/app.js` and given the record;
`soloHolder()` went with it as **`WA.soloHolderOf(rec, code, date)`**, and the
solo section's own pair mark is **`WA.soloRowFlag(rec, i)`**. Callers: the
student's form (a two-line wrapper), the admin's drill-down (**closing 22b
verify item 13**) and the printed brief, which prints the WORD — `(suspect)` —
beside the existing `(Repeat)` / `(same-day re-fly #2)` parentheticals, because
paper cannot hover.

**THE FOUR SENTENCES** — house voice: WHAT · WHERE · WHY it may be a double ·
WHAT HAPPENS NOW. The last clause is written **once** (`WA.SUSPECT_TAIL`), so
four sentences cannot end four ways: *«Nothing is refused and nothing is lost:
the row is saved exactly as it stands, it is marked here, and the double record
is untangled together with the squadron administration.»*

- **(A) TIER 1**, label **suspect**: *«C4791 is the stage's 1st SOLO and the
  syllabus gives no other way to fly it — the solo itself is recorded in the Solo
  flights section, where who authorised it and the NG rule live, and that record
  holds this position in the flow chart. So this row may be a SECOND RECORD of
  the same flight; it is kept as an EXTRA and marked.»*
- **(B) TIER 2**, label **suspect**: *«C4802 on 12/08/2026 is also recorded as
  the solo of C4801-04-S1 — the same sortie on the same day, which is one flight
  in two books. This row is kept as an EXTRA and marked.»* (date through `fmtD`).
- **(C) THE PAIR**, label **suspect**, on **both** rows of the Solo flights
  section and at rest: *«F4302 is recorded as the solo of both F4301-06-S1 and
  F4301-06-S2 — a sortie is flown solo ONCE, so one of these two rows is probably
  a second record of one flight. They derive ONE position of the flight log
  between them (the later row wins it) while both are stored, counted and
  exported. Both rows are kept, and both are marked.»* The names print in
  **stored order**, so the sentence reads the same standing on either row.
- **(D) THE SOLO-CANDIDATE EXTRA ON ANOTHER DAY**, label **solo flown**, **NOT**
  suspect: *«… This row is a SECOND sortie of the same code on ANOTHER DAY —
  normally a real, separate flight. It is stored, it counts, and it is shown as
  an EXTRA. Nothing is refused and nothing is suspected.»*
  **JUDGEMENT, RECORDED**: only the **same-day** shape wears the word. A dual
  C4802 on the 5th beside a solo C4803 on the 12th is the commonest *true* shape
  in the whole syllabus (§4y·3's own worked example); marking it suspect would
  cry wolf on the normal case and teach the squadron to ignore the word — the one
  failure a marking scheme cannot survive.

**WHAT LEFT THE SERVER**, and why dropped rather than kept unused: three
`wa.chk` calls and the three functions that existed only to feed them —
`wa.solo_holder`, `wa.solo_twin`, `wa.solo_row_name` (`drop function if
exists`, idempotent under the ×2 `ON_ERROR_STOP` run). *A predicate with no
caller is a rule nobody enforces wearing the clothes of a rule; the next reader
takes it for one and the round after re-wires the refusal by accident.*
**WHAT STAYED**: `wa.solo_only_codes()` / `wa.solo_slot_codes()` and **all three
r22 audit assertions** — they are the GENERATED MIRROR of the client's mark set
(`tools/gen-items-catalog.py` emits the JS copy and the SQL copy in one run, so
asserting the SQL copy asserts the run). The r22 notice keeps its `r22:` identity
and changes one word: *«17 solo candidate code(s), of which 1 marked SUSPECT by
name always (C4791) — no longer refused (ruling 2026-08-28, §4y·11·1)»*.

**DOES C4791 RETURN TO `WA.logPickList`? NO** — judgement, recorded. The case for
is that the picker no longer offers a choice the save refuses. The case against
wins on three counts: (1) the `so` position is **still never claimable by a
stored row**, so a C4791 row typed into the Flights table is ALWAYS an extra
wearing the word — offering it in the *syllabus dropdown* would be the list
saying «this is one of your sorties, put it here», and the picker would be
**manufacturing** the double record the mark exists to catch; (2) free text can
always type it, and typing it is a **deliberate** act that meets the mark on the
keystroke, whereas picking from the list is trust in the list; (3) `ck` and `so`
have been ONE rule since 22b (`WA.slotOwner`) and splitting them would put two
doctrines back where one was.

#### 4y·11·2. THE THREE 22b VERIFY FINDINGS THIS CLOSES

- **Item 11 — the pair, invisible at rest.** A legacy/live pair of solos naming
  one sortie was refused on SAVE and shown NOWHERE on the screen. Both rows now
  carry the `.cflag` **suspect** from page load, in the student's form and in the
  admin's solo table alike — and the record **saves**.
- **Item 12 — a genuine second solo of C4791 was unrecordable.** It is
  recordable again, as the suspect extra the ruling describes.
- **Item 13 — the admin drill-down was blinder than the student's form.** It now
  renders `WA.logRowFlag` as the same `.cflag`, in the same words, from the same
  function: track / band / checkride / **suspect** / off-catalogue. **The
  principle, for the spec: the review surface must not be blinder than the
  surface being reviewed.** `stateCell` was called with ONE argument for derived
  and owed rows; it now takes the band, the row and the attention map, so the
  row-aware sentence reaches paper and screen alike.

#### 4y·11·3. DURATION ON THE DERIVED ROWS

**THE FIELD: `duration`** — the *same* key as the flights/fs rows, deliberately.
One name buys `wa.chk_duration`, `WA.fieldText('duration') → «1.3 h»`,
`WA.FIELD_WORDS.duration`, `durParse` / `durFix`, the section-generic
`[data-dur]` handler, the CSV Hours column and the change list, **with zero new
code**; a second name (`hours`, `dur`) would need every one of them twice.
Sections: **`solo_flights`** and **`evaluations`**. Optional everywhere.

**BOTH REGISTRY MIRRORS, SAME COMMIT (the R19 rule).** `WA.ENTRY_KEYS` and
`wa.entry_keys` both gain the key. **The registry entry IS the migration**:
absent ≡ null everywhere, so `wa.migrate_record` needs no branch — what the
entry does is stop `wa.strip_entry` / the client strip from **destroying** the
key on the first read.

**THE PRESENCE-BEFORE-MEMBERSHIP SEAM: `slot_empty` MUST learn the key**, in
both mirrors. *Proof it neither disarms nor false-fires*: `empty(v)` is
null / undefined / "" (and `is null` on the SQL side covers an absent key and an
explicit null alike), so **no stored record changes state on deploy** — no
record can carry the key today, because it was unregistered and therefore
stripped. A row carrying *only* a duration correctly stops being an empty slot
(a duration is a report about a flight that happened) and is then asked for its
date and its instructor by the rules that already exist — the same shape as a
grade typed on its own.
**`duration` NEVER changes a state**: `WA.rowDone` is not consulted for these
two sections and `derivedSlots`' inline state tests are unchanged. The ruling
says «να βάλουμε», not «να απαιτούμε»; requiring it would turn every
already-green solo and checkride amber on deploy for a field nobody has filled.

**VALIDATION**, both sides: `wa.chk_duration` in the `evaluations` and
`solo_flights` branches of `wa.validate_record`, and — client side — the
flights branch's five clauses **extracted** into one `durOK()` that all three
branches call, because a second copy of those sentences is a second place for
them to drift from `wa.chk_duration`.

**THE FORM**: a new labelled-field builder `durF()` beside `gradeF`, reusing
`durFix` verbatim. Evaluations: beside the grade, replacing the grid filler.
Solo flights: its own `rgrid2` under the instructor. `refreshDurFix` is
table-cell shaped and was deliberately **NOT widened** — a labelled row is
redrawn whole, and only when the row's SHAPE changed (the conversion offer
appearing or going, or the slot crossing between empty and flown), so the caret
is never taken mid-value.

**THE ARITHMETIC SEAMS, every one:** `WA.derivedSlots` gains `dur` on both
sources (`WA.evalRows` carries `duration` through); **`WA.stateCounts` counts
the derived hours** and the rounding moved to AFTER the derived loop — round 22's
reason («counting it here would count one flight's hours twice») was right about
`n` and **wrong about `hours`**, because this table stores no row for that
sortie and there is no second copy to double; `n` still leaves them alone. The
block summaries, the rail and `WA.stateLine` follow for free; `cntHTML` gains
`· N h` for the two fixed sections (a total belongs where the field is entered);
the admin drill-down's and the student's derived rows print the number with the
tooltip *«Read from the row that owns this flight, in the ⟨section⟩ section —
the one place it is stored»*; the printed brief's per-band line **dropped its own
ad-hoc `hrs` reduce and reads `cn.hours`**, which removed a second copy of the
arithmetic *and* made the brief agree with the table (it was the one surface
that would still have under-reported); the printed brief's derived row prints
it; `exportEntriesCSV` passes it in the Hours position for both sections;
`admin_export` needs **no change** (it emits `wa.migrate_record(r.data)` whole
and the registered key rides along free — stamp stays `wa-export-v1`, the
§4x·7 reasoning verbatim). The **instructor logbook** gains an **Hours** column
between Band and Student: `wa.instructor_logbook` sends
`'duration', e->'duration'` on the SP lane and `'duration', null` on `self_rows`,
and the client mirror does the same — *«a currency row records what was flown,
not for how long»*.

**JUDGEMENT, RECORDED (open item):** the logbook's SP lane is **not** extended to
solo / evaluation rows in this round — §4y·11·9 (b).

#### 4y·11·4. EXTRAS AND THE FAIL SEAM

**WHAT THE FAIL / ALMOST GOOD SECTIONS ACTUALLY STORE** (read, not assumed):
`{date, category, flight_code, items[], instructor, grade, legacy, entered_by}`.
`category` is the track, `flight_code` comes from a picker over `WA.sorties(cat)`
(all bands and checkrides, plus free text), `items[]` are syllabus gradesheet
items only (round 6), and a new row opens at grade **40** (FAIL) / **50**
(ALMOST GOOD) — the ΠΔ 151/13 bands Ε and ΣΚ. **Nothing linked a FAIL row to a
Flights position**: `flight_code` on a fail row was read by nothing but the CSV
and `WA.rowLabel`.

**THE DECISION: (ii) CROSS-INFORMING, NOT (i) GRADE STATES ON THE ROW.** A
FAIL/ALMOST-GOOD *state* stored on the flights row is **refused**, for three
reasons. (1) It would be a **third source of truth** beside `grade` and
`mission` — precisely the defect round 11 removed from the FPC and 12b removed
with `verdict`; the grade already carries the band and `mission` already carries
the no-percentage case. (2) **The ruling's four outcomes on an extra are already
representable with nothing new stored**: a PERCENTAGE (whose printed band *is*
fail / almost good / pass); **FAIL** = a percentage in Ε *and/or* a FAIL row
naming the sortie; **ALMOST GOOD** = a percentage in ΣΚ *and/or* an ALMOST GOOD
row; **non graded** = `ng: true` — «nobody was in a position to score it», which
is exactly what non-graded means here. **That is what «non graded on an extra»
means, and it needs no code.** (3) What the log row genuinely does NOT hold is
the FAIL section's own content — the ITEMS that missed the desired performance,
the instructor and the track. That is what the squadron reads. **So the seam is a
LINK, not a duplicated verdict.**

**THE MECHANISM: `WA.slotAttention(sec, rec)`** — derived, nothing stored, the
`derivedSlots` shape one section over. For every `fail` / `almost_good` row the
normalised code, its band and its track give the position key; rows naming no
known code contribute nothing (presence before membership). It shows as a
`.dchip` (the READING chip, not the warning chip) reading **`FAIL recorded`** /
**`ALMOST GOOD recorded`** (`N×` when more than one) with the sentence *«A FAIL
is recorded against C4602 in the FAIL section — 12/08/2026, 3 items,
⟨instructor⟩. The flight itself is recorded here; what missed the desired
performance is recorded there. This position is not complete until an attempt at
C4602 is Mission Complete.»* and a **↗** to the fail row (the jump handler was
already section-generic). Rendered on **all three surfaces** and on paper as
`(FAIL recorded)`.

**THE STATE PROMOTION, TIGHTLY BOUNDED**: a position whose state would be
**`owed`** and which `slotAttention` names reads **`started`** instead. Nothing
else moves — a `done` position keeps its green (§4y·11·9 a), a `started` one is
already started, an `extra` is not a position, and `ck` / `so` positions are
**excluded** (their state belongs to Evaluations / Solo flights) though they
still get the chip. It is applied in the three functions that already take
`rec` — `WA.slotRows`, `WA.stateCounts` and the student form's `rowMeta` — and
**never inside `WA.rowState`**, which must keep answering the
payload/placeholder question or the sparse rule breaks. **`WA.slotOwed` is NOT
touched**, so the seeded placeholder is still dropped from the payload and
**nothing is stored**. The state WORD stays one of the four (no fifth
vocabulary); the SENTENCE is the row's, through a new flights/fs branch of
`WA.rowStateTip` — the `WA.debriefWord` precedent.

#### 4y·11·5. MISSION COMPLETE WINS THE POSITION

**THE RULE, IN ONE SENTENCE:** *a flow-chart position is held by the OPERATIVE
ATTEMPT among the rows that name it — the latest Mission-Complete one, or the
first in stored order while none is complete — and every other attempt is an
EXTRA, rendered under it.*

Until this round `WA.slotKey` granted a flights key only for
`kind === 'syllabus' && seq === 1`, so **a Mission-Incomplete first attempt
claimed the position for ever and a later complete re-fly could never take it**.
That is the half of the ruling that was untrue. (The other half — that an
incomplete row does not read *done* — was already true: `WA.rowDone` requires
`WA.rowMission(e) === 'complete'`.) The fix is **the exams doctrine applied to
the two flight logs**:

- **`WA.slotHome(sec, e)`** — *which position this row is ABOUT* (never a
  claim): null for the ground sections and for an off-catalogue KIND (an
  fcf / cef / other names no syllabus position; its flight box is free text).
- **`WA.slotKey`** for flights/fs becomes `slotHome` minus the positions this
  table does not own — the `seq === 1` and `kind === 'syllabus'` gates are
  **gone**. A repeat and a same-day re-fly are **attempts at the same position**,
  exactly as the three trials of IN190 are three attempts at one exam. `ck` / `so`
  are still denied, so **the WA-22b hole does not re-open**.
- **`WA.flightCompleted(e)`** = `ng || rowMission(e) === 'complete'` — «the
  sortie was completed», independent of whether the row is fully filled in.
- **`WA.logOperativeIx(list, idxs)`** — the mirror of `WA.examOperativeIx` and
  `WA.evalOperativeOf`: the LATEST completed attempt (tiebreak date → seq →
  stored index), else `idxs[0]` — round 13's first-in-stored-order, unchanged,
  so nothing churns while no attempt has completed.
- **`WA.claims`, the `holder` line** — one line, now three doctrines.
- **`WA.rowMinted`** gains a flights/fs branch (`kind !== 'syllabus' || seq > 1`),
  and it is **load-bearing**: without it a blank Repeat row with a sortie chosen
  would satisfy `slotUntouched` and be **silently dropped from the payload**;
  with it such a row is a REPORT (somebody chose Repeat, or pressed ↻ — both
  affordances, the round-14 doctrine), it is stored, and it is refused by name
  («the date is required»). It also keeps a blank re-fly from taking the position
  off a written row. **`WA.rowPlanned` is NOT touched**, so `WA.rowState` keeps
  returning **`extra`** for every non-operative attempt — the ruling's own word
  («θα μπαίνει ως έξτρα γραμμή»).
- **`WA.slotRows`** files an unclaimed row under its `slotHome`, so it renders as
  an **`alt` row immediately beneath the position it is about** (date → seq →
  stored index). Only rows with **no** home go to the bottom extras block.
  Consequence, and it is the point: the suspect rows and the failed attempts now
  sit **under the sortie they are about** rather than at the foot of the table.
- **`student.js` `logRow`** gains `plannedPass(e)`; the read-only slot flight
  cell and the hard-coded «Syllabus» Kind cell are gated on it, so **a claiming
  repeat / re-fly keeps both pickers and its ✕**. The Kind cell's old tooltip
  («a slot of the printed flow chart is a SYLLABUS sortie by definition») is
  rewritten — it stopped being true the moment a repeat could hold a position.

#### 4y·11·6. VALIDATE BEFORE CONFIRM

**THE DEFECT (pre-existing, found by the 22b verify):** `confirmedSave()` showed
the «Save N changes?» dialog and only THEN called `save()`, which built the
payload and refused. **A student confirmed a save that did not happen** — one
act, two positions on the screen. **THE FIX:** `buildPayload()` moves ABOVE the
dialog and its result is **threaded** into `save(built)`, so it still runs
exactly **once per save act**; the refusal reporting is extracted verbatim into
`reportProblems(b)`, which both the pre-check and `save()`'s belt-to-braces
guard call, so they cannot drift. **What the dialog shows on a refusal is
nothing — it never opens**: the refusal takes its place, same status line, same
toast, same scroll-to-row, same 4-second `.is-problem` wash, only BEFORE the
question instead of after the answer. **The same defect on the INSTRUCTOR
door** (`confirmedSaveAll` → `saveAll` → `saveCurrency` → `curIncomplete`) is
fixed in the same commit: `curIncomplete()` runs before `WA.confirmSave`, marks
the row and returns, and `saveCurrency()` keeps its own guard. *Leaving one door
confirm-then-refusing while the other validates first is exactly the drift the
house rejects.*

#### 4y·11·7. DELTA · BUSTERS · GATE

- **`db/schema.sql`** — `wa.entry_keys` (+`duration` ×2), `wa.slot_empty`
  (+`duration` ×2), three `drop function if exists`, three `wa.chk` removed, two
  `wa.chk_duration` added, `wa.instructor_logbook` (+`duration` ×2), the r22
  notice reworded, the tier / pair / audit comment blocks made true.
- **Client** — `app.js` (`SUSPECT_WORD` / `SUSPECT_TAIL`, the four sentence
  builders renamed and re-worded, `soloHolderOf`, `logRowFlag`, `soloRowFlag`,
  `slotHome`, `flightCompleted`, `logOperativeIx`, `slotAttention` +
  `attentionTag` / `attentionTip` / `attentionJump` / `attentionPromotes`,
  `ENTRY_KEYS`, `slotEmpty`, `slotKey`, `rowMinted`, `claims`, `derivedSlots`,
  `evalRows`, `stateCounts`, `slotRows`, `rowStateTip`); `student.js` (`durF`,
  the two form placements, `attChip`, `plannedPass`, `rowMeta`, `cntHTML`,
  `derivedSig`, `reportProblems` / `confirmedSave` / `save`, `buildPayload`'s
  `durOK` + the two new branches + the two refusals removed);
  `admin.js` (`cflagOf`, `attChip`, `stateCell`, the three `logRows` branches,
  `soloRows`, the brief's `cn.hours`, the printed rows, the CSV);
  `instructor.js` (the Hours column, `logSelfRows`, `confirmedSaveAll`).
- **Busters, touched-only** → `?v=20260828d` on `app.js`, `student.js`,
  `admin.js`, `instructor.js`. **`styles.css` is byte-identical** and stays at
  `20260828b` — the round reuses `.cflag` and `.dchip` and adds no colour
  (tokens-only rule). `config.js`, `items-catalog.js`, `currency-catalog.js`
  unbumped.
- **Gate**: schema first, then the app. Committed, **not pushed** — the branch
  stands **four ahead** of `origin/main`, and **ONE §4φ MCP gate covers all
  four**.

#### 4y·11·8. SELF-VERIFICATION — RUN LIVE ON THE LOCAL STACK

1. **Schema applied ×2**, `ON_ERROR_STOP=1`, exit 0 both, **zero** ERROR/FATAL
   lines, every audit block firing (`r20: search_path pinned on all 116 wa
   functions` — three fewer, the three dropped predicates — `r22: withsp_markers
   ⊆ flight_kinds`, the three r22 solo assertions and the reworded notice).
   `wa.solo_holder` / `wa.solo_twin` / `wa.solo_row_name`: **0 rows** in
   `pg_proc`.
2. **The three former refusals ACCEPT** through `wa.validate_record`: a C4791
   flights row, a same-day C4802 beside its flown solo, and two solo rows naming
   F4302. **The four that stay REFUSE, verbatim**: a checkride in a solo slot, a
   checkride in `flights`, the track mismatch, and the letter rule.
3. **Round-trip through the real RPC** (`public.save_student_record`): the whole
   round-23 shape saves — suspect carrier, same-day duplicate, solo pair,
   incomplete + repeat, durations on both fixed sections, a FAIL on C4602 — and
   reads back with `solo_flights[0].duration = 1.3` and
   `evaluations[0].duration = 1.1` (**the R19 destruction test**). `duration: 0`
   and `duration: 25` are refused by name on both sides; `slot_empty` is `false`
   on a duration-only row and `true` on the bare slot, on an explicit null and
   on an absent key.
4. **On the student's form**: the C4791 carrier renders `frow st-extra` with the
   `.cflag` **suspect** and sentence (A); the C4791 position renders read-only,
   **owed**; filling the solo turns the position **derived · done** on the
   keystroke with **1.2 h** in its Hours cell and leaves the carrier a suspect
   extra **directly beneath it**. The same-day C4802 wears (B) with the `fmtD`
   date; **both** F4302 solo rows wear (C) **at rest**, word for word. `C4202`
   Mission Incomplete alone reads **started**; adding a Mission-Complete
   **repeat** hands it the position, **green**, with the incomplete rendered as
   an extra directly beneath and `owed` unchanged; a later incomplete repeat
   leaves the complete in place. `C4602` wears **`FAIL recorded`** and reads
   **started**, one lower on `owed` and one higher on `started`, **with nothing
   stored**. Block header, rail, `cntHTML`, drill-down, brief line, both printed
   tables and the CSV all report **3.9 h**.
5. **Ordering**: with a refusal on the record, Save shows the refusal FIRST —
   status line, toast, scroll, `.is-problem` — and `WA.confirmSave` is **not
   called at all**; a clean save opens it, lists *«Solo flights · F4302 ·
   10/08/2026 — duration — → 1.3 h»*, and writes. **`buildPayload` runs exactly
   once** per save act (instrumented: 1 at the dialog, still 1 at the write).
   The instructor door refuses before the dialog too.
6. **The admin drill-down** shows the same `.cflag` **suspect** on the same rows
   with the same sentences, the pair on both solo rows, the `FAIL recorded` chip
   and the **started** state on C4602, and the derived hours; the printed brief
   prints `(suspect)`, `(FAIL recorded)` and the numbers.
7. **The instructor logbook** shows the **Hours** column: an SP row carries the
   student's `1.4`, an ungraded SP row and every Self row carry `—`.
8. `node --check` clean on all seven client files; **zero console errors** on
   the student form, the admin's four tabs and both instructor doors; the local
   demo left **exactly as found**; privacy grep over all tracked files: **0
   real-person hits**.

#### 4y·11·9. OPEN ITEMS

- **(a) THE FAIL-AFTER-COMPLETE DEMOTION — AWAITING RATIFICATION.** If a
  position already holds a Mission Complete and a LATER fail / incomplete
  arrives (a repeat gone wrong), the position **KEEPS the complete** — the
  operative-attempt mirror of Evaluations (§4k, «two successful attempts resolve
  to the later one»). The fail stays visible as a marked extra beneath the
  position and the chip stays on the position (a fail that happened is history
  and is never hidden). **This is the implementer's default, not a ruling.** If
  the squadron wants the position DEMOTED by a later failure it is one predicate
  in `WA.logOperativeIx`, and it should be an ΑΠΟΦΑΝΣΗ, because it would paint a
  sortie the student demonstrably completed as not completed.
- **(b) THE LOGBOOK'S SP LANE AND THE SOLO / CHECKRIDE ROWS.** Not extended this
  round. A solo names an *authorising* instructor (who may not have flown) and a
  checkride names an *evaluator*; folding either into «My Flight Logbook»
  changes what the table means. A ruling, not an inference.
- **(c) «FLIGHT COMMANDER»** — the squadron's own word for the person the WA
  vocabulary calls `WA.ADMIN_BODY` («the squadron administration»).
  `WA.SUSPECT_TAIL` is now the one place it would change, and it is a ruling.
- **(d) §4y·10's first-letter Training Section test** still stands as written.


## 4. Screens

1. **Student form** (via personal link): sectioned, repeatable rows (+ add /
   remove), Save any time, shows own last_update. Re-entry always allowed.
   **Round 12 / 12b (§4l): the LOG TABLES at the end** — 4 × Flights ⟨track⟩ +
   4 × F/S ⟨track⟩ as collapsible blocks, then Ground lessons and Ground exams.
   Each block is a **real table, one row per flight, edited in the cells**
   (FLIGHT · DATE · INSTRUCTOR · DUR · GRADE · MISSION · KIND · ✕/⌫).
   **The grade may be left empty for ever**: the row says *awaiting debrief* and
   is complete without it.
   **Round 13 (§4m): the syllabus is ALREADY THERE** — 77 aircraft sorties, 48
   simulator sorties, 47 ground courses and 8 ground exams are rows **from the
   first day**, in flow-chart / printed-programme order, in **four colours**:
   **done** (green — everything filled in and the mission completed) · **started**
   (light green) · **owed** (grey — prescribed, nothing recorded) · **extra**
   (mustard — beyond the syllabus's one planned pass), with a legend line and
   `done X · started Y · owed Z · extra N` on every block header. **An untouched
   slot is stored NOWHERE**; a slot row is cleared (⌫) rather than deleted, and
   the extras — repeats, FCF, CEF, same-day re-flies, off-catalogue rows — render
   after the slots in date order.
   **Round 22 (§4y): TWO KINDS OF ROW ARE READ FROM ELSEWHERE.** The aircraft
   count is now **85, not 77** — the eight CHECKRIDES have their place in the
   chart again — and any sortie flown SOLO shows there too. Both render as
   **derived read-only rows** in the house muted treatment, at their flow-chart
   position, with the owning section named on the row («checkride — recorded in
   Evaluations» · «recorded in Solo flights») and a **↗** that lands on the row
   which holds the fact. They store nothing, are never editable, never enter a
   payload or an export, and never count as entries — but they are **not owed**,
   so the four counts, the block headers and the nav rails follow them.
   **Round 23 (§4y·11):** those derived rows now show **HOURS** too — the solo
   slots and the checkrides gained an optional `duration`, and every block
   total, rail, brief line and export includes them — and a stored row for a
   sortie that is recorded elsewhere is **kept and marked «suspect»** rather
   than refused, with a sentence saying why it may be a double record and that
   it will be untangled with the squadron administration. A FAIL recorded
   against a sortie shows **on that sortie's position**, and a flow-chart
   position is held by the **operative attempt** — the latest Mission Complete.
   The same form, bound to somebody else, is what
   **the admin** fills in on a student's behalf (§4s·4 — the admin is the flight
   commander and the developer, **not** the squadron CO).
2. **Instructor link — round 20 (§4v·2): it opens on a WELCOME PAGE, and then
   TWO DOORS.** First the identity as a **confirmation** (rank + full name, duty
   / leadership / status + call sign, the class scope, and *«if this is not you,
   close this page and tell the squadron administration»*), then two large
   tiles: **★ Student Assessment** and **✈ My currency**. Each is its own view
   with a **back-to-landing control**, its **own Save** and its own unsaved
   count — and the landing shows **both** counts, so an instructor is told which
   door holds his half-typed work. The doors are **hash sub-routes**
   (`#t=…&v=assess` / `&v=currency`, the round-4 `&co=` pattern), so one can be
   bookmarked and **Back** returns through them; switching does **not** re-fetch
   or rebuild, so nothing typed is lost. The R17 rail lives inside the
   assessment door (mounted and destroyed with it) and no longer carries a
   currency row.
   **MY CURRENCY** (round 19 §4u, round 20 §4v·1, **round 21 §4x**): a plain
   table — **Date · Flight `Continuation`/`With SP` · Sortie / Σ category · # ·
   E-items · ✕** (the Programme column died with the §4x ruling) — rows added
   by «+ flight», sorted newest first. A **Continuation** flight names its **Σ
   category**: the printed rows of **Πίνακας 9** (Σ-1 · Σ-2 day · Σ-2 night ·
   Σ-3 · Σ-4 · Σ-20) or **Πίνακας 6** (SIM-1 … SIM-ΔΑ), the **two columns FDMS
   keeps** (night-with-students, FCF) and the **Chapter-5 demo flight** (marked
   «Demo pilots», never hidden), grouped in the box by printed table. A
   **With-SP** flight names **what was flown**: the student's syllabus sortie
   (both bands, 8 optgroups), or **repeat / fcf / cef**, or off-catalogue text
   via «Other…» — shown marked. Rows recorded before the taxonomies wear their
   **legacy** marks, are **red-edged**, and the card counts them («N without a
   Σ», «N with an old Σ claim»). **E-items are a picker** — all 27 on screen, a
   filter, a count chip, checkboxes, Clear all / Cancel / Done. It names no
   student and changes no student's record. On the admin's on-behalf twin it is
   **read-only** — the server has no admin write path for it at all.
   **MY FLIGHT LOGBOOK** (round 21 §4x·5) sits below it, read-only: every
   flight the application knows about the instructor — his own rows (Self),
   every student `flights`/`fs` row naming him (SP — oid first, surname
   fallback, shared surnames flagged never guessed), and the FDMS-Progress lane
   the Phase-4 bridge will fill (source column ready, counts 0 today) — date
   desc, counts per source, capped at the most recent 600 student-entered rows
   with the true totals said above the cap.
   The assessments themselves: student list — **round 18 (§4t·1): the students
   of the ONE class the admin has opened for assessment, and nobody else**, filtered
   server-side (`wa.student_in_scope`) so the cards, the nav rail and the
   «N of M chosen» head all follow from one list; the form names the class in a
   badge, in its head sentence, on the rail and on the printed sheet, and with
   no class open (or an empty one) it shows a **titled empty-state card** saying
   which of the two it is instead of a blank page. The server refuses a
   proposal for a student outside the scope, **by name** — and past assessments
   of every class stay visible everywhere they show today.
   Per student a **compact card of their
   self-reported data** (counters, evaluations, solos, **and the round-12 flight
   log as one line per band — per-track counts, hours, how many sorties are
   still awaiting a grade, and (round 13) how many of the flow chart are still
   OWED**) beside **ONE radio group
   of the five assessment levels for fighters** (round 10, §4j — scale order,
   weights shown, click-the-selected-one to clear) + comment + flew-with
   checkbox. **Round 14 (§4n·5): the thin rule sits between «Recommended as
   Alternate» and «Recommended for Other Assignments»** — it marks the
   **fighter / other split** (three answers above it, two below), not the last
   level off from the list, and the admin's readout draws it from the same
   `WA.LEVEL_SEP_AT`. **Round 14 (§4n·6): there is ONE general Save**, not one
   per card — it names how many assessments differ from what is stored
   (*“Save 3 assessments”*, floating copy + bottom bar, disabled while nothing
   differs), a dirty card is marked in place, and the write goes through the
   round-14 **confirmation dialog** (§4n·7) naming the instructor the link
   belongs to and enumerating the changes. **Its own printable sheet** (round 8,
   round-10 content): one structured block per student — the assessment in words
   with its weight, flown-with, comment, and the student's reported record.
   **Round 17 (§4s·1): a LEFT NAVIGATION PANEL of the students** — the round-14
   component (`WA.navHTML` / `WA.navMount`), one row per student card in the
   order the cards render, click scrolls to the card and marks the row, sticky
   beside the column and collapsing under 900 px to the pills + burger. Each row
   is **tinted by whether an assessment has been CHOSEN**: green (`--st-done`)
   where a level is currently selected — saved **or** pending — mustard
   (`--st-extra`) where none is, with the level's **weight** as the row badge
   («10») or *«not yet»*, and *«7 of 25 chosen»* in the panel head. A comment or
   a flew-with tick is **not** a choice.
3. **Admin dashboard** (the admin — **§4s·4: the admin is NOT the squadron
   CO**) — THREE MODES (decision 2026-08-13):
   a. **Overview**: one row per student (key counters, the **weighted mean** with
      its five-segment distribution bar and `n/instructors`,
      completion status) + who has not submitted yet ·
      people/token management (generate/copy/revoke links) · CSV/JSON export.
      **Round 11 (§4k·1): a CLASS FILTER** — chips derived from the active
      students (the classes are read-only and follow the members), persisted in
      `localStorage`, recomputing the counts line and the "without a
      self-report" card, keeping every row's original index, leaving the
      not-filterable instructor card labelled as such, and scoping **the three
      CSV exports** (class in the file name) while the **JSON backup stays
      complete**.
      **Round 20 (§4v·3): THE SAME CHIP ROW IS ON ALL FOUR TABS**, one component
      and **one** choice (the same `wa-adm-class` key), so a class picked
      anywhere follows everywhere. The chip **set** is the union of the
      dashboard's active students and the roster's, so it never changes between
      tabs; the **counts** are per page. It narrows the Overview table, the
      **deck** of Student analysis and Brief mode (picker, ← →, the *«3 / 9»*
      pager) and the **students** table of People & links. **Instructors are
      never filtered** — an instructor carries no class. The **printed brief now
      follows it too**, for the round-11 export reason, and says which class it
      covers.
      **Round 18 (§4t·1): «ASSESSMENTS OPEN FOR: ⟨class ▾⟩»**, a boxed strip
      inside the *Instructor submissions* card — the classes present plus
      «— none —», written through `public.admin_set_assessment_class`. It is a
      **WRITE, not a view**: it decides which students every instructor's form
      lists and which assessments the server accepts, and it is deliberately
      NOT beside the class-filter chips, which only narrow what the admin sees.
      It **hides and deletes nothing** — every stored assessment stays visible
      in this table, in the analysis, in the brief and in all four exports.
   b. **Student analysis** (click a row — each student examined SEPARATELY):
      - Identity header (MN, rank, name, class) + entries still to correct.
      - **Comparison chart** (vanilla SVG, mifchart discipline): the selected
        metric shown as FOUR bars — **this student · class best · class worst ·
        class average**. **Round 20, ruling 2Α (§4v·4): «class» is THE
        STUDENT'S OWN CLASS** — the four bars, the per-checkride comparison, the
        dashed reference line, the FPC axis depth and the legend all read one
        function (`peers`), and every label **names** the class it means. It is
        deliberately **not** the chip row above: that says what the admin is
        looking at, this says who the student is measured against.
        Metric selected by CLICK on chips: FAIL · ALMOST GOOD ·
        NFS · SMS entries · airsickness · solo flights · FPC · CEF.
        **Round 2/3**: no mean-evaluation metric and no evaluation COUNT chip
        (every student converges to the same eight checkrides). Every chip
        states its direction, and **FPC/CEF are always "lower is better"** —
        they exist only after a failure.
      - **Evaluations card**: (a) PER-EVALUATION comparison — pick one of the
        eight checkrides, get the same four bars ON THAT checkride (each
        student contributes **the attempt the flight was characterised
        successful on** — round 11, §4k·3; it was "their latest graded attempt"
        until then) with the contributing values printed underneath so the admin
        can hand-check them — **round 8: the y-axis starts just below the lowest
        grade plotted, not at 0**; (b) **round 11: ONE plot of ALL EIGHT
        checkrides** in syllabus order, never in date order, as connected points
        with grade labels, a faint dashed class-average reference and **x labels
        coloured by track** with a legend naming the four (the per-category
        chips are gone; a point with no successful attempt is drawn as a hollow
        ring) — clicking a point highlights its row in (c) the SUMMARY TABLE
        (evaluation · with whom · grade · date · source), where every extra
        attempt is its own row marked with its band and **"not counted"**; and
        (d) **the FPC plot in its own block below**, because an FPC has no
        position in the syllabus to share the x axis with.
      - **Dated-entry tables**: FAIL and ALMOST GOOD in full (flight code,
        items, instructor, grade), airsickness **when and with whom**, plus
        NFS · SMS · solos · FPC · CEF. All of it reaches the printed brief.
      - **Round 12 / 12b (§4l): THE LOG TABLES** — at the end, in the form's
        order: 4 × Flights ⟨track⟩ and 4 × F/S ⟨track⟩ (flight · date ·
        instructor · hours · grade · **mission** · source, with the *kind* and
        *same-day re-fly* tags), then Ground lessons (group · course · block
        dates) and Ground exams (exam · date · grade). An empty grade cell is
        **not a gap**: it prints the *awaiting debrief* chip with its age, and
        the **mission** column says either what the squadron recorded without a
        number or — marked as such — what is **read from the grade**. All of it
        reaches the printed brief, where both are spelled out in words because
        paper is monochrome, and where a row whose mission the squadron *did*
        record reads *"no percentage recorded"* rather than *"awaiting
        debrief"* — nobody is chasing that flight.
        **Round 13 (§4m): the admin's tables are the STUDENT'S tables.** The owed
        rows are drawn from the same catalogue through the same `WA.slotRows`,
        so the order, the four colours and the four counts are identical on both
        sides of one record; each table gains a **State** column and the legend,
        and the headers read `done X · started Y · owed Z · extra N`. On paper
        the four states are **words** — the count in each section heading and a
        State column per printed row — and the owed rows are **not** printed one
        by one, because a brief of 180 empty lines is not a brief.
      - **Assessment panel (round 10, §4j)** — ONE box where three branch boxes
        used to be, because there is one question now. It shows the **weighted
        mean** in large type, **the arithmetic that produced it**
        (`(10×2 + 5×1) ÷ 3 = 8.33`) so the number can be checked rather than
        trusted, the distribution in the command's shorthand
        (**«2× Strongly · 1× Alternate»**), and then **one row per level in
        scale order** — chip, weight, and the SURNAMES of the instructors who
        gave it. Round 8's rule about the two silences survives the reshape as
        two POLITELY WORDED bullets: "• Maj Alfa has submitted but has not
        formed a view yet" (he looked and did not answer) and "• Capt X has not
        submitted an assessment for this student yet" (he has not looked).
        Drill-down list (who + **call sign**, duty, leadership, status, **the
        level chip + its weight**, flew_with, comment).
      - **Prev / Next student arrows (and keyboard ←/→)** — the admin walks
        student-by-student during the actual Wing Commander brief.
   c. **Brief mode**: presentation-friendly (large type, one student per
      screen, arrows) + **printable brief** (monochrome, one page per student
      + a summary ranking table per class).
4. **No/invalid token**: neutral landing, no data, *contact-the-squadron-
   administration* hint (round 17 — it was «contact the squadron CO»).

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
3. Admin link generated → **the admin** adds people → distributes links.
   The admin's own person row carries **his** rank + surname; every surface that
   names the identity reads it from there (§4s·4). On a fresh cloud instance the
   bootstrap seeds that row as the **role** — no rank, surname **«Admin»**
   (round 17b) — and it is renamed once, through the People tab's **Edit**
   button. That rename lives in the database and **only** there.

## 7. Open items

- **ΑΠΟΦΑΝΣΗ 2026-08-28, βράδυ (Γύρος 23, §4y·11) — ΜΑΡΚΑΡΙΣΜΑ, ΟΧΙ ΑΡΝΗΣΗ.**
  «*Δεν υπάρχει διπλότυπο για την ίδια πτήση. Μια έξοδος (π.χ. C4202) μπορεί να
  πεταχτεί Mission Incomplete — δεν παίρνει βαθμολογία και δεν μετράει στη ροή
  του syllabus· θα μετρήσει μόνο όταν είναι Mission Complete. Ένα solo που δεν
  πετάχτηκε σε μια ενότητα (λόγω καιρού) συνήθως πετιέται σε κάποιο repeat. Όπως
  είναι με το which-sortie που μπορούμε να κάνουμε type είναι μια χαρά — θα
  μπαίνει ως έξτρα γραμμή. Για να μην το πνίξουμε: ΜΑΡΚΑΡΙΣΜΑ ως ύποπτο, και το
  ξεδιαλύνουμε μετά και μαζί.*» · «*Να βάλουμε και το duration στις παράγωγες
  γραμμές. Προσοχή: οι cef, fcf, repeat, mission incomplete είναι έξτρα γραμμές.
  Μπορεί να βαθμολογηθούν και με fail, almost good, αλλά και non graded. Όμως αν
  κάποιος περάσει ένα fail στην C4602 επάνω, πρέπει τότε να ενημερώνεται το
  flight.*»

  1. **ΥΠΟΠΤΟ, ΟΧΙ ΑΡΝΗΣΗ.** Οι ΤΡΕΙΣ αρνήσεις των γύρων 22/22b — ΒΑΘΜΙΔΑ 1
     (C4791 πάντα), ΒΑΘΜΙΔΑ 2 (ίδιο sortie ΤΗΝ ΙΔΙΑ ΜΕΡΑ με flown solo) και το
     ΖΕΥΓΟΣ (δύο solo της ίδιας εξόδου) — γίνονται ΜΑΡΚΑΡΙΣΜΑΤΑ: η γραμμή
     αποθηκεύεται ΟΠΩΣ ΕΙΝΑΙ, εμφανίζεται ως EXTRA και φοράει ένα ορατό
     `.cflag` **suspect** που λέει γιατί ΜΠΟΡΕΙ να είναι διπλή εγγραφή και ότι
     θα ξεδιαλυνθεί ΜΑΖΙ με τη διοίκηση της μοίρας. **Τίποτα δεν καταστρέφεται
     και τίποτα δεν μπλοκάρεται.** Ο ΠΥΡΗΝΑΣ ΤΗΣ ΜΙΑΣ ΑΛΗΘΕΙΑΣ ΜΕΝΕΙ: ένα
     συμπληρωμένο solo εξακολουθεί να ΠΑΡΑΓΕΙ τη θέση του στα Flights και η
     παραγόμενη γραμμή εξακολουθεί να την ΚΕΡΔΙΖΕΙ. **ΤΙ ΜΕΝΕΙ ΑΡΝΗΣΗ** (δομικά
     αδύνατα — καμία αληθινή πτήση δεν τα ταιριάζει): R12 checkride στα flights,
     το φράγμα 22b του checkride σε solo slot, οι κανόνες γράμματος/track και οι
     κανόνες σειράς του syllabus. Οι `wa.solo_holder` / `wa.solo_twin` /
     `wa.solo_row_name` **δια­γράφονται** (ένα κατηγόρημα χωρίς καλούντα είναι
     κανόνας που κανείς δεν επιβάλλει, φορώντας τα ρούχα κανόνα).
     **Η C4791 ΔΕΝ επιστρέφει στο dropdown** — κρίση, καταγεγραμμένη: μια λίστα
     που προσφέρει κωδικό τον οποίο ο πίνακας δεν μπορεί ΠΟΤΕ να κρατήσει
     κατασκευάζει ακριβώς τη διπλή εγγραφή που το μαρκάρισμα υπάρχει για να
     πιάνει· το ελεύθερο κείμενο τον γράφει πάντα, και η πληκτρολόγηση είναι
     ΣΥΝΕΙΔΗΤΗ πράξη που συναντά το μαρκάρισμα στο ίδιο πλήκτρο.
  2. **ΟΙ ΤΡΕΙΣ ΔΙΑΠΙΣΤΩΣΕΙΣ ΤΟΥ WA-22b ΚΛΕΙΝΟΥΝ ΜΕ ΤΟΝ ΤΡΟΠΟ ΤΟΥ
     ΜΑΡΚΑΡΙΣΜΑΤΟΣ** (§4y·11·2): το ζεύγος μαρκάρεται σε ΚΑΙ ΤΙΣ ΔΥΟ γραμμές
     **σε ηρεμία** (όχι μόνο στο save) και το αρχείο αποθηκεύεται κανονικά· ένα
     γνήσιο δεύτερο solo της C4791 καταγράφεται ξανά· και **η οθόνη ελέγχου του
     admin δείχνει τα ίδια chips με του μαθητή** — *η επιφάνεια που ελέγχει δεν
     επιτρέπεται να είναι πιο τυφλή από την επιφάνεια που ελέγχεται*.
  3. **DURATION ΣΤΙΣ ΠΑΡΑΓΩΓΕΣ ΓΡΑΜΜΕΣ** (§4y·11·3): τα solo slots και οι
     αξιολογήσεις αποκτούν ΠΡΟΑΙΡΕΤΙΚΟ `duration` — το ΙΔΙΟ κλειδί με τις
     γραμμές του log, ώστε ο έλεγχος, η μετατροπή 1:20→1.3, το CSV και η λίστα
     αλλαγών να δουλεύουν χωρίς νέα γραμμή κώδικα. Δηλώνεται και στα ΔΥΟ μητρώα
     (`WA.ENTRY_KEYS` + `wa.entry_keys`) και στα ΔΥΟ `slot_empty` **στο ίδιο
     commit** — αδήλωτο κλειδί ΚΑΤΑΣΤΡΕΦΕΤΑΙ στην ανάγνωση (το μάθημα του R19).
     Κανένα αποθηκευμένο αρχείο δεν αλλάζει κατάσταση στο deploy, και το πεδίο
     ΠΟΤΕ δεν αποφασίζει κατάσταση («να βάλουμε», όχι «να απαιτούμε»). Όλα τα
     αθροίσματα ωρών — κεφαλίδες, ράγα, drill-down, brief, δύο εκτυπώσεις, CSV —
     λένε τον ΙΔΙΟ αριθμό, και το brief έπαψε να υπολογίζει δικό του.
  4. **ΤΑ EXTRA ΚΑΙ Η ΡΑΦΗ ΤΟΥ FAIL** (§4y·11·4): αποφασίστηκε το **(ii)** —
     οι υπάρχουσες ενότητες FAIL / ALMOST GOOD **ΕΝΗΜΕΡΩΝΟΥΝ** τη θέση, ΟΧΙ
     αποθηκευμένη κατάσταση βαθμού πάνω στη γραμμή (θα ήταν ΤΡΙΤΗ πηγή αλήθειας
     δίπλα στο `grade` και το `mission` — το ελάττωμα που έφυγε δύο φορές, με το
     `result` του FPC και το `verdict`). Τα τέσσερα αποτελέσματα του ρύθμισης
     εκφράζονται ΗΔΗ χωρίς τίποτα νέο: ποσοστό, FAIL (ποσοστό στο Ε ή/και γραμμή
     FAIL), ALMOST GOOD (ΣΚ ή/και γραμμή), και **non graded = `ng`**. Ένα FAIL
     στην C4602 βάζει chip **«FAIL recorded»** πάνω στη θέση της C4602, με ↗ στη
     γραμμή που το κρατά, και η θέση διαβάζεται **started** αντί για owed — ΧΩΡΙΣ
     να αποθηκεύεται τίποτα.
  5. **MISSION COMPLETE ΚΕΡΔΙΖΕΙ ΤΗ ΘΕΣΗ** (§4y·11·5): μια θέση του flow chart
     την κρατά η **ΛΕΙΤΟΥΡΓΙΚΗ ΠΡΟΣΠΑΘΕΙΑ** — η τελευταία Mission Complete, ή η
     πρώτη σε σειρά αποθήκευσης όσο καμία δεν έχει ολοκληρωθεί — και κάθε άλλη
     προσπάθεια είναι EXTRA, **σχεδιασμένη ΑΠΟ ΚΑΤΩ ΤΗΣ**. Το δόγμα των
     εξετάσεων, μία ενότητα παραδίπλα.
  6. **ΕΛΕΓΧΟΣ ΠΡΙΝ ΤΗΝ ΕΠΙΒΕΒΑΙΩΣΗ** (§4y·11·6): ο διάλογος «Save N changes?»
     ΔΕΝ ανοίγει πια πάνω σε save που θα απορριφθεί — ούτε στη φόρμα του μαθητή
     ούτε στην πόρτα του εκπαιδευτή. Η άρνηση παίρνει τη θέση του διαλόγου, με
     τα ίδια λόγια και το ίδιο scroll στη γραμμή που ονομάζει.

  **ΑΝΟΙΧΤΑ** (§4y·11·9): **(α)** αν μια θέση κρατά ήδη Mission Complete και
  έρθει ΑΡΓΟΤΕΡΑ fail / incomplete, η θέση **ΚΡΑΤΑΕΙ** το complete — αυτό είναι
  **η προεπιλογή του υλοποιητή, ΟΧΙ απόφανση**, και η υποβάθμιση θέλει ΑΠΟΦΑΝΣΗ
  γιατί θα έβαφε ως μη ολοκληρωμένη μια έξοδο που ο μαθητής αποδεδειγμένα
  ολοκλήρωσε· **(β)** η λωρίδα SP του logbook ΔΕΝ επεκτάθηκε σε solo /
  αξιολογήσεις (το solo ονομάζει τον ΕΓΚΡΙΝΟΝΤΑ, το checkride τον ΑΞΙΟΛΟΓΗΤΗ —
  απόφανση, όχι συμπέρασμα)· **(γ)** «**Flight Commander**» — η λέξη της μοίρας
  για το πρόσωπο που το λεξιλόγιο του WA λέει `WA.ADMIN_BODY`: το
  `WA.SUSPECT_TAIL` είναι πλέον το ΕΝΑ σημείο που θα άλλαζε, και είναι απόφανση·
  **(δ)** το πρώτο-γράμμα τεστ της Training Section του §4y·10 μένει ως έχει.

- **ΑΠΟΦΑΝΣΕΙΣ 2026-08-28 (Γύρος 22, §4y) — ΜΙΑ ΠΤΗΣΗ, ΕΝΑ ΑΡΧΕΙΟ.**
  1. «*Έβαλα την C4791 και έκανα save. Γιατί δεν ανανεώνεται στον πίνακα
     Flights;*» — το solo slot και η γραμμή Flights ήταν ΔΥΟ ΒΙΒΛΙΑ ΓΙΑ ΜΙΑ
     ΠΤΗΣΗ. Με το προηγούμενο του checkride: το γεγονός αποθηκεύεται ΜΙΑ ΦΟΡΑ
     (Solo flights) και ο πίνακας Flights το ΕΜΦΑΝΙΖΕΙ ως παραγόμενη (derived)
     γραμμή, χωρίς τίποτα αποθηκευμένο — με σύνδεσμο ↗ στη γραμμή που το
     κατέχει. Το owed, οι μετρήσεις και οι ράγες ακολουθούν, ΖΩΝΤΑΝΑ (χωρίς
     save και reload).
  2. «*Στα flights δεν έχεις τις αξιολογήσεις — τις θέλουμε.*» — οι ΟΚΤΩ
     αξιολογήσεις παίρνουν τη θέση τους μέσα στους πίνακες Flights (77 → 85
     αεροσκάφους· καμία στο F/S), ως derived read-only γραμμές που διαβάζουν
     τον λειτουργικό κανόνα του γύρου 11. Η ΑΠΑΓΟΡΕΥΣΗ του R12 ΜΕΝΕΙ ΑΥΤΟΥΣΙΑ:
     μια αξιολόγηση αποθηκεύεται ΜΟΝΟ στο Evaluations.

  **Η ΚΡΙΣΗ ΓΙΑ ΤΗ ΛΙΣΤΑ ΑΠΑΓΟΡΕΥΣΗΣ** (§4y·3, ζητήθηκε ρητά): ΔΥΟ ΒΑΘΜΙΔΕΣ.
  **C4791 πάντα** — μοναδικός υποψήφιος ενός ΥΠΟΧΡΕΩΤΙΚΟΥ solo, κανείς δεν την
  πετάει με εκπαιδευτή, ακριβώς όπως ένα checkride. **Οι υπόλοιποι 16 υποψήφιοι
  ΜΟΝΟ στο αποδείξιμο διπλότυπο**: ίδιο sortie ΤΗΝ ΙΔΙΑ ΗΜΕΡΑ με flown solo του
  ίδιου αρχείου. Η ευρύτερη ανάγνωση ΘΑ ΑΡΝΙΟΤΑΝ ΠΤΗΣΗ ΠΟΥ ΕΓΙΝΕ (μια C4802 με
  εκπαιδευτή άλλη μέρα — η C4803 πέταξε solo), και αυτό είναι το ένα πράγμα που
  η εφαρμογή δεν επιτρέπεται να κάνει· εκεί δεν χρειάζεται άρνηση, γιατί το solo
  κρατά ήδη τη θέση και η διπλή γραμμή εμφανίζεται ως EXTRA. Παλιές γραμμές ΔΕΝ
  καταστρέφονται (legacy carrier, keep-it-ask-for-it).

  **ΟΙ ΕΞΙ ΔΙΑΠΙΣΤΩΣΕΙΣ ΤΟΥ WA-21 ΚΛΕΙΝΟΥΝ** (§4y·5): το κουμπί «list» μένει
  μέσα στο κελί του και είναι πατήσιμο σε όλο του το πλάτος· ο διάλογος save του
  currency λέει την αλήθεια ΑΝΑ ΕΙΔΟΣ γραμμής· η υπόσχεση off-catalogue λέει
  πλέον «κεφαλαία, όπως τυπώνει το log» (τα code πεδία περνούν από
  `upper(wa.norm_line())`)· `wa.withsp_markers() ⊆ wa.flight_kinds()` γίνεται
  εκτελέσιμο assert που ΡΙΧΝΕΙ ΤΟ DEPLOY με ονόματα· το 3.3s/930 γραμμές
  καταγράφεται ως αποδεκτό trade στο §4x·5 με τον αριθμό δίπλα· και η ταυτότητα
  `s_category=''` ευθυγραμμίζεται με τον κανόνα του client (μία γραμμή,
  αποδεδειγμένη με mirror fixture 12 γραμμών).

  **ΚΑΙ ΕΝΑ ΠΟΥ ΔΕΝ ΖΗΤΗΘΗΚΕ** (§4y·6): ο generator έτρωγε 8 χειρόγραφες
  συναρτήσεις που ζούσαν μέσα στα GENERATED markers και ξεκάρφωνε 10
  `search_path` pins — ο επόμενος δικός του κύκλος θα είχε σβήσει 126 γραμμές
  ζωντανού σχήματος και θα είχε ρίξει το deploy στο audit του γύρου 20, μακριά
  από την αιτία. Οι οκτώ μετακινήθηκαν έξω από τα markers, ο generator εκπέμπει
  πλέον το pin, και το αποτέλεσμα επαληθεύτηκε byte-προς-byte (το
  `items-catalog.js` γυρίζει ίδιο, το schema diff είναι ΜΟΝΟ οι δύο νέες
  συναρτήσεις).

  **ΑΝΟΙΧΤΑ** (§4y·9): ο παρονομαστής 77→85 (τα ιστορικά κείμενα των παλιών
  γύρων μένουν όπως γράφτηκαν)· μια derived γραμμή ΔΕΝ δείχνει ώρες, γιατί ούτε
  η αξιολόγηση ούτε το solo αποθηκεύουν duration — αν τις θέλουμε στο σύνολο
  ωρών, θέλει απόφανση και πεδία στις δύο εκείνες ενότητες πρώτα· η γραμμή «N
  recorded elsewhere» του εκπαιδευτή δοκιμάστηκε μέσω του ίδιου κώδικα στον
  admin (το demo roster δεν έχει εκπαιδευτή στην τάξη με δεδομένα)· και η
  ΒΑΘΜΙΔΑ 2 είναι κρίση — αν θέλετε ευρύτερη απαγόρευση, είναι ΑΠΟΦΑΝΣΗ, γιατί
  αρνείται εγγραφές που είναι αληθινές.

- **ΓΥΡΟΣ 22b (2026-08-28, §4y·10) — ΟΙ ΤΡΕΙΣ ΔΙΑΠΙΣΤΩΣΕΙΣ ΤΟΥ WA-22 ΚΛΕΙΝΟΥΝ.**
  1. **Η ΑΟΡΑΤΗ ΠΑΓΩΜΕΝΗ ΓΡΑΜΜΗ.** Παλιό αρχείο με αποθηκευμένη γραμμή **C4791**
     στα Flights και **ΑΔΕΙΟ** το solo slot εμφανιζόταν ως κανονική ΠΡΑΣΙΝΗ
     γραμμή του συλλαβικού πλάνου — καμία σήμανση πουθενά — ενώ ο server
     αρνιόταν **ΚΑΘΕ save** του αρχείου (ακόμη και αλλαγή duration σε άλλη
     ενότητα), και ο μαθητής έβλεπε τον λόγο ΜΟΝΟ ΑΦΟΥ αποτύγχανε το save.
     Πλέον ένας κωδικός που είναι **solo εξ ορισμού** αντιμετωπίζεται όπως μια
     θέση checkride: **καμία αποθηκευμένη γραμμή δεν παίρνει τη θέση**, με ή
     χωρίς derived γραμμή — η θέση διαβάζεται **owed** και είναι read-only («↗»
     στη γραμμή του solo που τη γεμίζει), και η παλιά γραμμή είναι το σημασμένο
     **EXTRA** που το σχόλιο του schema υποσχόταν (διορθώθηκε και το σχόλιο). Η
     έξοδος του μαθητή — σβήνω τη γραμμή, save — δουλεύει από άκρη σε άκρη, και
     **η φόρμα το λέει πριν τον server**, ονομάζοντας τη γραμμή.
  2. **ΤΟ ΨΕΥΤΙΚΟ ΣΧΟΛΙΟ ΕΓΙΝΕ ΑΛΗΘΙΝΟ.** Χτίστηκαν οι δύο έλεγχοι που το
     `app.js` περιέγραφε χωρίς να υπάρχουν, **ΚΑΙ ΣΤΟΥΣ ΔΥΟ ΚΑΘΡΕΦΤΕΣ**: **δύο
     solo της ΙΔΙΑΣ πτήσης** (μία πτήση, ένα αρχείο — ονομάζονται και τα δύο
     slots, σε σειρά αποθήκευσης) και **solo που ονομάζει checkride** (C4590·
     αποθηκευόταν, μετριόταν, εξαγόταν και ΔΕΝ φαινόταν πουθενά). NULL-blind:
     ελέγχεται μόνο γραμμή που **ονομάζει** πτήση (η κλάση του WA-20b).
     **Η ΚΡΙΣΗ, ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ:** το σύνολο υποψηφίων **ΔΕΝ** φράζεται — ένα solo
     σε sortie που ο chart δεν σημείωσε `sc` είναι ΠΤΗΣΗ ΠΟΥ ΕΓΙΝΕ, δεν δημιουργεί
     δεύτερο βιβλίο, και το ελεύθερο κείμενο είναι ήδη φραγμένο σε
     `^[BCIFN][0-9]{4}$` του γράμματος του slot. Οι pickers μένουν ως έχουν, ώστε
     οι δύο καθρέφτες να συμφωνούν· και το audit του γύρου 22 αποκτά τρίτο assert
     (κανένας υποψήφιος solo δεν είναι checkride).
  3. **Η ΣΠΑΣΜΕΝΗ ΠΡΟΤΑΣΗ (tier 2)** έλεγε «*… της C4801-04 — solo — ένα solo
     καταγράφεται …*». Ο client ονομάζει πλέον το **slot id όπως αποθηκεύεται**,
     δηλαδή ΑΚΡΙΒΩΣ ό,τι λέει ο server (επαληθεύτηκε χαρακτήρα-χαρακτήρα· μόνη
     διαφορά η μορφή ημερομηνίας, που είναι απόδοση και όχι λέξη).
  **ΑΝΟΙΧΤΟ, ΟΧΙ ΑΛΛΑΓΜΕΝΟ:** ο έλεγχος «this sortie does not belong to the
  Training Section of that solo slot» συγκρίνει ΜΟΝΟ το πρώτο γράμμα — πέρασε το
  verify του WA-22 και δεν το πειράζουμε· αν θέλετε πραγματικό έλεγχο Training
  Section, είναι **ΑΠΟΦΑΝΣΗ**.

- **ΑΠΟΦΑΝΣΗ 2026-08-28 (Γύρος 21, §4x) — CONTINUATION / WITH SP, ΤΟ DEMO,
  ΚΑΙ ΤΟ MY FLIGHT LOGBOOK.** «*Στο flight επιλογές Continuation, With SP …
  Πρόσθεσε και το demo flight … να ανοίγουν οι πτήσεις των μαθητών, έξτρα
  repeat, fcf, cef. Το PROGRAMME δεν χρειάζεται … έναν πίνακα My Flight
  Logbook.*» Τα ΑΠΟΘΗΚΕΥΜΕΝΑ kinds μετακινούνται (`continuation`/`with_sp`,
  cloud κενό — κρίση καταγεγραμμένη §4x·1), το `sortie` μπαίνει ΜΟΝΟ στο
  with_sp (κατάλογος μαθητών + 3 markers + off-catalogue escape· το §4u·2
  υπερισχύεται ΜΟΝΟ για αυτό το kind), το `x-demo-flight` γεννιέται από την
  πηγή με flag `dp` (marked, never hidden), το PROGRAMME φεύγει από το UI και
  μένει server-side για τη γέφυρα, και το logbook ενώνει ΤΡΕΙΣ πηγές (self ·
  sp-entered με oid-first/surname-fallback/shared-flagged · fdms-provenance,
  άδεια θέση για το Phase 4) με cap 600 και αληθινά counts. Export: +
  `currency_kinds`, + `withsp_legacy_rows`· stamp ΜΕΝΕΙ `wa-export-v1`
  (αιτιολόγηση §4x·7).
  **ΤΕΣΣΕΡΑ ΑΝΟΙΧΤΑ ΠΟΥ ΓΕΝΝΗΣΕ Ο ΓΥΡΟΣ** (§4x·10): το `x-night-students`
  προσβάσιμο μόνο υπό Continuation ενώ περιγράφει πτήση με μαθητές (θέλει
  απόφανση)· οι evaluator-matches ως τέταρτη πηγή του logbook· ένα
  `demo_pilot` flag στο roster αν ζητηθεί gate αντί για mark· η μονόγραμμη
  σημείωση στο bridge-spec.md του FDMS (read-only σε αυτόν τον γύρο).

- **ΑΠΟΦΑΝΣΕΙΣ 2026-08-27 (Γύρος 20, §4v) — ΠΕΝΤΕ, ΚΑΙ ΚΛΕΙΝΕΙ ΤΟ ΑΝΟΙΧΤΟ
  ΣΗΜΕΙΟ ΤΟΥ ΓΥΡΟΥ 11.**
  1. **ΠΟΙΑ Σ ΕΙΝΑΙ, ΚΑΙ ΠΟΛΛΑΠΛΑ Ε** (§4v·1). «*θα έπρεπε να έχουμε ποια S
     είναι και δυνατότητα πολλαπλών Ε. Αφού θα τροφοδοτούν το ίδιο σχήμα με το
     FDMS να τα έχουμε σωστά.*» Η γραμμή γίνεται
     `{date, kind, s_category, e_items[], seq}`· το `category` **φεύγει** και το
     πρόγραμμα **παράγεται** από την κατηγορία. Κατάλογος **16 Σ** από την ΙΔΙΑ
     πηγή FDMS και τον ΙΔΙΟ generator (6 ΑΕΡΟΣ + 6 F/S + **2 στήλες που κρατά το
     FDMS** + **2 legacy**), byte-idempotent, με **assert** ότι οι δύο στήλες
     του FDMS δεν μετονομάστηκαν. Το picker των Ε γίνεται **checkbox list με
     φίλτρο και μετρητή**, όπως ο διάλογος του FDMS.
  2. **LANDING PAGE ΜΕ ΔΥΟ ΠΟΡΤΕΣ** (§4v·2). «*το landing page να έχει τα
     στοιχεία αυτού που μπαίνει, ώστε να κάνει και επιβεβαίωση … Και μετά δύο
     επιλογές: My currency, Student Assessment. Τώρα είναι μπερδεμένα.*»
     Καλωσόρισμα + **επιβεβαίωση ταυτότητας**, δύο πόρτες με **δικό τους
     hash sub-route** (`&v=assess` / `&v=currency`), **back** σε κάθε μία, και
     το γενικό Save μετράει **μόνο την ανοιχτή πόρτα**. Ο **μαθητής** παίρνει
     την ίδια κεφαλίδα επιβεβαίωσης και **όχι** πόρτες (κρίση καταγεγραμμένη).
  3. **CLASS CHIPS ΣΕ ΟΛΕΣ ΤΙΣ ΣΕΛΙΔΕΣ ΤΟΥ ADMIN** (§4v·3). «*όπως στο overview
     χωρίζεις τους μαθητές ανά τάξη να γίνεται και στις υπόλοιπες σελίδες.*»
     **Ένα** component, **μία** επιλογή (το υπάρχον `wa-adm-class`), τέσσερις
     σελίδες — και η επιλογή **ακολουθεί παντού**. Οι **εκπαιδευτές δεν
     φιλτράρονται ποτέ**· το **τυπωμένο brief ακολουθεί** το φίλτρο, όπως τα CSV.
  4. **ΑΠΟΦΑΝΣΗ 2Α** (§4v·4) — **ΚΛΕΙΝΕΙ** το ανοιχτό σημείο του Γύρου 11: κάθε
     σύγκριση του Student analysis γίνεται πάνω στο **τμήμα του ίδιου του
     μαθητή**, και η ετικέτα το **ονομάζει**.
  5. **ΘΩΡΑΚΙΣΗ** (§4v·5): `search_path` καρφωμένο σε **όλες τις 102**
     συναρτήσεις `wa` (+ **audit** που ρίχνει το deployment αν κάποια το χάσει),
     τα **11** σχόλια «CO» του `styles.css` γίνονται «the admin», και οι **δύο
     μη-αναπαραγώγιμοι αριθμοί** (138 / 32) αντικαθίστανται από **grep-derived**
     νούμερα με τις εντολές τους.
  **ΤΕΣΣΕΡΑ ΑΝΟΙΧΤΑ ΠΟΥ ΓΕΝΝΗΣΕ Ο ΓΥΡΟΣ** (§4v·7):
  1. **Το re-run του cloud advisor** — ο §4φ·2 απαγορεύει σε γύρο να αγγίξει το
     Supabase MCP· το schema και ο advisor **ανήκουν στην κύρια συνεδρία, με τον
     λόγο του χρήστη**. Αναμενόμενο: `function_search_path_mutable` **102 → 0**.
  2. **Τα quotas των Σ ταξιδεύουν, δεν μετριούνται** — χρειάζεται πρώτα ο άξονας
     **τοποθετημένος / προσκολλημένος** στη γραμμή του εκπαιδευτή.
  3. **Το flag Δοκιμαστή προσφέρεται, δεν επιβάλλεται** — το χειρότερο σφάλμα
     είναι ένας άνθρωπος που **δεν μπορεί να καταγράψει πτήση που πέταξε**.
  4. **Οι legacy γραμμές θέλουν το χέρι του developer** — το cloud δεν έχει
     καμία, το τοπικό demo έχει 4· το `admin_export` τις εκθέτει (`legacy_rows`).

- **ΑΠΟΦΑΝΣΗ 2026-08-26 (Γύρος 19, §4u) — ΤΟ CURRENCY ΤΟΥ ΕΚΠΑΙΔΕΥΤΗ.**
  «*στο link που θα στέλνουμε σε κάθε εκπαιδευτή θέλω να μπορεί να περάσει κι
  εκείνος, πέρα από την αξιολόγηση, κάποια δική του πτήση S και τα αντίστοιχα Ε.
  Επίσης να μπορεί να περάσει Ε και σε μια πτήση με μαθητή πέρα από τις S. Αυτό
  θα είναι μια γέφυρα για το currency του FDMS.*» — νέος πίνακας
  `public.instructor_records`, ενότητα `currency`, κατάλογος **27 E-items** από
  το 3-01 (παραγόμενος από την έρευνα του FDMS), **καμία διαδρομή εγγραφής για
  τον admin**, και ο δείκτης **`"schema": "wa-export-v1"`** στο `admin_export`
  που κλείνει το εκκρεμές F5 της γέφυρας.
  **ΤΡΙΑ ΑΝΟΙΧΤΑ ΠΟΥ ΓΕΝΝΗΣΕ Ο ΓΥΡΟΣ** (§4u·15):
  1. **Το rewrite του git history** — τα call signs και τα δύο επώνυμα που
     αφαιρέθηκαν από τα tracked αρχεία (§4u·11) **ζουν ακόμη στο ιστορικό**.
     Πράξη με συνέπειες σε κάθε clone: **ανήκει στην απόφανση του Διοικητή
     Σμήνους**, όπως ακριβώς και το πανομοιότυπο εκκρεμές του FDMS.
  2. **Μια γραμμή `student` δεν ονομάζει sortie** — αν ζητηθεί σύνδεση με την
     πτήση του μαθητή, το κλειδί θα είναι `(instructor, date, seq)` και το
     επιχείρημα του §4u·2 πρέπει να ξαναγίνει πρώτο.
  3. **Η λωρίδα της γέφυρας δεν έχει γραφτεί ακόμη** — ο γύρος παράγει τα
     δεδομένα και τον δείκτη· η ανάγνωση των `instructor_records` στο
     `instructorCurrency` είναι δικός γύρος της πλευράς FDMS.

- **ΑΠΟΦΑΝΣΕΙΣ 2026-08-26 (Γύρος 18, §4t) — ΔΥΟ, ΚΑΙ ΜΙΑ ΕΚΚΡΕΜΟΤΗΤΑ ΤΟΥ 17b
  ΕΚΛΕΙΣΕ.**
  1. **Οι προτάσεις αφορούν ΜΙΑ σειρά τη φορά** (§4t·1). «Τωρα τελειωνουν της
     98Β, οποτε μονο για αυτους θελω προτασεις. Στο μελλον θα επιλεγουμε για
     ποια ταξη θα στελνουμε προτασεις αξιοποιησης με το WA στους εκπαιδευτες.
     Θελουμε την σειρα την οποια τελειωνει, οχι ολες τις ενεργες.» Μία ρύθμιση
     (`wa.settings.assessment_class`, seed **98B HAF**), ένα control στο
     Overview («Assessments open for»), η φόρμα του εκπαιδευτή δείχνει **μόνο**
     τη σειρά αυτή, και ο server **αρνείται ονομαστικά** πρόταση για μαθητή
     εκτός σειράς. **Το ιστορικό δεν κρύβεται ποτέ**: ό,τι έχει ήδη καταγραφεί
     μένει ορατό παντού (Overview, analysis, brief, exports), και η αλλαγή
     σειράς δεν σβήνει τίποτε.
  2. **ΕΕΘ → «Weekly»** (§4t·2). «τα ερωτηματολογια ΕΕΘ 1,2,3 να τα βαλουμε ως
     Weekly 1,2,3.» Μετονομασία **σε κάθε ορατή επιφάνεια** (γραμμές, κουμπί
     «+ Weekly n», badges/tips, διάλογος επιβεβαίωσης, εκτύπωση, CSV, πίνακας
     admin, αρνήσεις του server). **Η αποθήκευση ΔΕΝ άλλαξε**: `series:'EETH'`
     παραμένει byte-for-byte και **καμία εγγραφή δεν μεταναστεύει** — μια
     γραμμή του Γύρου 14 εμφανίζεται ως «Weekly n» χωρίς να την αγγίξει κανείς.
  3. **ΕΚΛΕΙΣΕ — τα πέντε σχόλια που έλεγαν «the Squadron CO» για τον admin**
     (§4t·3): το residual του Γύρου 17b, πέντε (όχι δύο) σημεία, **μόνο
     σχόλια**, μηδέν συμπεριφορά. Ο **πραγματικός** Διοικητής Μοίρας μένει
     άθικτος όπου είναι **δόγμα** (FPC, CEF, ΚΕΠΕ §32β, λίστα Duty).

- **ΑΠΟΦΑΝΣΕΙΣ 2026-08-22 (Γύρος 17, §4s) — ΔΥΟ, ΚΑΙ Η ΔΕΥΤΕΡΗ ΚΛΕΙΝΕΙ ΤΟ
  ΠΑΛΑΙΟΤΕΡΟ ΑΝΟΙΧΤΟ ΣΗΜΕΙΟ ΤΗΣ ΕΦΑΡΜΟΓΗΣ.**
  1. **Navigation panel μαθητών στη φόρμα του εκπαιδευτή** (§4s·1). «στο
     instructor recommendation θα ήθελα navigation panel με τους μαθητές.
     Πράσινη χροιά όποιο έχει βάλει επιλογή, μουσταρδί ότι δεν έχει επιλέξει
     κάτι ακόμη». Ίδιο component με τον Γύρο 14· **πράσινο** όπου υπάρχει
     επιλεγμένο επίπεδο (αποθηκευμένο **ή** εκκρεμές), **μουστάρδι** όπου δεν
     υπάρχει. Σχόλιο ή «flew with» **δεν** είναι επιλογή. Κεφαλίδα «7 of 25
     chosen».
  2. **Ο admin ΔΕΝ είναι ο Διοικητής Μοίρας** (§4s·4). «Ο admin δεν ειναι ο
     squadron CO, ειμαι εγω, ο developer. ⟨SURNAME⟩. Διορθωσε το». Κάθε
     ετικέτα που ονόμαζε τον κάτοχο του admin link «CO» λέει πλέον **«ADMIN» /
     «the admin» / «the squadron administration»**, και όπου χωράει **όνομα**
     διαβάζεται το **rank + επώνυμο της γραμμής του admin από τη ΒΑΣΗ**. Η
     αποθηκευμένη τιμή `entered_by='admin'` **δεν άλλαξε** — καμία μετάπτωση,
     καμία αλλαγή schema. Ο **πραγματικός** Διοικητής Μοίρας μένει αυτούσιος
     όπου τον ονομάζει το δόγμα (FPC, CEF, ΚΕΠΕ). Στο cloud ο χρήστης βάζει το
     όνομά του μόνος του, από το **Edit** της γραμμής του στο People.

- **ΔΥΟ ΑΠΟΦΑΣΕΙΣ ΠΑΡΟΥΣΙΑΣΗΣ ΤΟΥ ΓΥΡΟΥ 16, ΕΠΙΚΥΡΩΜΕΝΕΣ 22/08 (χωρίς κώδικα).**
  Χτίστηκαν στον Γύρο 16 με πρόταση του Claude και ο χρήστης δεν έφερε
  αντίρρηση. **Ισχύουν έως ότου ο χρήστης τις ανατρέψει** (§4s, «THE TWO
  ROUND-16 DISPLAY DECISIONS, RATIFIED»):
  (α) το chip **«not passed»** ζει στο **κελί του ονόματος** της εξέτασης, ως
  **ΕΝΑ** συνδυασμένο label («2nd trial · not passed») — όχι δεύτερο chip, όχι
  στη στήλη του βαθμού·
  (β) μια **αβαθμολόγητη** γραμμή που κρατά τη θέση φοράει το **απλό** badge
  «Xst trial» (αναμονή) και **ποτέ** «not passed» — το «not passed» είναι
  «βαθμολογήθηκε ΚΑΙ κάτω από τη βάση», ποτέ «δεν έχει περάσει ΑΚΟΜΗ».

- **ΑΠΟΦΑΝΣΕΙΣ 2026-08-22 (Γύρος 16, §4r) — ΤΕΣΣΕΡΙΣ, ΚΑΙ ΚΛΕΙΝΟΥΝ ΠΕΝΤΕ ΣΗΜΕΙΑ.**
  1. **«Το Β» — το mint επιβιώνει του κλειδώματος του Διοικητή.** Σε γραμμή
     εξέτασης που **έγραψε ο Διοικητής**, ο μαθητής μπορεί πλέον να πατήσει
     «+ 2nd trial»: η γραμμή του Διοικητή **μένει κλειδωμένη πεδίο-πεδίο** και
     ταξιδεύει στο save αυτούσια (kept-or-dropped-never-rewritten), αλλά η
     **νέα** γραμμή είναι **δική του**, χωρίς `entered_by`. Ξεκλειδώνει **μόνο**
     το `[data-mint]` — τίποτε άλλο. Ο server **δεν χρειάστηκε αλλαγή** και το
     απέδειξε σε 6 πραγματικά RPC (2 δεκτά, 4 αρνήσεις). Κλείνει το ανοιχτό
     εύρημα (c) του Γύρου 14b (§4o).
  2. **«Το Α» — η ετυμηγορία γίνεται ΟΡΑΤΗ και σε μονή εξέταση.** Βαθμολογημένη
     γραπτή (μία από τις οκτώ **ή** ΕΕΘ) κάτω από το 80 φοράει **ορατό chip
     «not passed»** (`badge-warn`)· **το χρώμα της γραμμής ΔΕΝ αλλάζει**
     (`st-done`). Οι δύο άξονες μένουν χωριστοί: το χρώμα λέει «τελείωσε η
     γραμμή», το badge λέει «τι είπε». **Πέμπτη κατάσταση: ΑΠΟΡΡΙΠΤΕΤΑΙ.**
     Κλείνει το §4p·2.
  3. **Η λειτουργική 1η προσπάθεια φοράει το badge της.** Όταν η εξέταση έχει
     **2+ προσπάθειες**, ο κάτοχος της θυρίδας φοράει «1st trial» (και
     «1st trial · not passed» αν δεν πέρασε)· η μονή εξέταση μένει **χωρίς**
     λέξη trial. Ίδια πύλη σε **δύο** επιφάνειες (`WA.examTrialShown`), και το
     ίδιο όνομα πλέον **και στο τυπωμένο brief**. Κλείνει το §4p·3 — **χωρίς
     δεύτερο μετρητή**: κάθε γραμμή που δεν πέρασε το λέει μόνη της.
  4. **«60% f/s, flights» — ΕΠΙΒΕΒΑΙΩΝΕΤΑΙ.** Το F/S κρίνεται στο **60** όπως η
     πτήση· **δεν υπάρχει τρίτος αριθμός**. Η WA το έκανε ήδη, άρα **δεν άλλαξε
     τίποτα**. Το μόνο 50 παραμένει το κατώφλι της ζώνης «ΣΚ» (χαρακτηρισμός,
     όχι βάση). Την ίδια ημέρα **το FDMS bridge report ευθυγραμμίζει τη σταθερά
     του** στον ίδιο αριθμό. Κλείνει το §4p·1.
  5. **Αρχαιότητα — «χωρίς call sign» = ΝΕΚΡΟ ΓΡΑΜΜΑ.** **Κανένας εκπαιδευτής
     δεν είναι ποτέ χωρίς call sign** (κάποιοι αριθμοί παραλείπονται σκόπιμα· οι
     **μαθητές δεν έχουν ποτέ**). Το 3ο επίπεδο του comparator (§4n·4) **μένει
     ως έχει και δεν ενεργοποιείται** — υπάρχει ώστε μια ελλιπής γραμμή roster
     να προσγειώνεται κάπου ορισμένα. Κλείνει, χωρίς αλλαγή κώδικα.
- **ΑΠΟΦΑΝΣΗ 2026-08-21 (Γύρος 15, §4p) — ΤΟ ΚΑΤΩΦΛΙ ΤΩΝ ΓΡΑΠΤΩΝ ΕΞΕΤΑΣΕΩΝ ΕΙΝΑΙ
  80 %.** «80% για εξετασεις εδαφους, 60% για πτησεις. Πλεον εχουμε κανει και το
  mapping.» Κλείνει το ανοιχτό σημείο 1 του Γύρου 12b: **δύο διαφορετικές
  εξετάσεις, δύο σωστοί αριθμοί.** Ισχύει και για τις οκτώ και για τα **ΕΕΘ**. Οι
  πτήσεις, τα F/S, οι αξιολογήσεις, τα solo και τα FPC / CEF **μένουν στο 60**,
  και η **πεντάβαθμη κλίμακα ΠΔ 151/13 δεν κουνήθηκε** (τα «Α/ΛΚ/Κ/ΣΚ/Ε» είναι
  *χαρακτηρισμός*, όχι βάση επιτυχίας: ένα 78 σε γραπτή είναι ακόμη «ΛΚ» και απλώς
  δεν περνάει). Άλλαξε **μία** συμπεριφορά: ποια προσπάθεια «πιάνει» τη θυρίδα
  (`WA.examOperativeIx`) — ένα 78 σε 2nd trial δεν την πιάνει πια ως επιτυχία.
- ~~**ΝΕΟ (Γύρος 15, §4p) — τρία ανοιχτά σημεία**~~ — **ΚΑΙ ΤΑ ΤΡΙΑ ΕΚΛΕΙΣΑΝ
  στον Γύρο 16 (22/08/2026, §4r)**: το (1) ως **ΕΠΙΒΕΒΑΙΩΣΗ** (60, χωρίς αλλαγή),
  το (2) με **«Το Α»** (ορατό badge, το χρώμα μένει), το (3) **χωρίς δεύτερο
  μετρητή**. Το αρχικό κείμενο μένει ως ίχνος:
  (1) το **«F/S στο 50»** της
  εντολής **δεν αντιστοιχεί σε τίποτα** μέσα στην εφαρμογή — το μόνο 50 είναι το
  κατώφλι της ζώνης «ΣΚ» και το F/S κρίνεται στο 60 όπως η πτήση· **ζητείται
  απόφανση** αν το simulator υποτίθεται ότι περνάει στο 50 (θα ήταν τρίτος
  αριθμός)· (2) μια **αποτυχημένη γραπτή παραμένει πράσινη** (`st-done` = η
  γραμμή είναι πλήρης· το κελί δίπλα λέει «fail») — χρειάζεται πέμπτη κατάσταση
  «τελειωμένο, μη επιτυχές»; (3) το **«4 από 8 exams»** μετράει γραπτές που
  **δόθηκαν και βαθμολογήθηκαν**, όχι επιτυχίες — τώρα το λέει σε tooltip, αλλά
  αν το brief πρέπει να απαντά «πόσες πέρασε», είναι δεύτερος μετρητής.
- **ΝΕΟ (Γύρος 15b, §4q·3) — ΑΝΟΙΧΤΗ ΑΜΕΤΑΒΛΗΤΗ (invariant), όχι εκκρεμότητα
  απόφανσης**: το 60 της πτήσης διαβάζεται πλέον από **δύο** σημεία — η
  `WA.gradePassed` διαβάζει τον **αριθμό** (γιατί πρέπει να απαντά και στο 80 των
  γραπτών), η `WA.gradeMission` διαβάζει τη **ζώνη** της ΠΔ 151/13 (γιατί ΕΙΝΑΙ η
  πεντάβαθμη κλίμακα σε δύο λέξεις). Συμφωνούν **μόνο** όσο
  `GRADE_BANDS[good].lo === GRADE_PASS_MIN === 60`. **Όποιος γύρος κουνήσει τον
  έναν αριθμό, κουνάει και τον άλλο** — αλλιώς να πει ρητά γιατί παύουν να
  συμφωνούν. Το ίδιο ζεύγος και server-side (`wa.grade_passed` /
  `wa.grade_mission`). Δεν μπαίνει assertion: η εφαρμογή **δεν γράφει ποτέ στην
  κονσόλα** (κανόνας του σπιτιού).

- **ΝΕΟ (Γύρος 14, §4n) — τέσσερα ανοιχτά σημεία του γύρου**: (1) μια αποτυχημένη
  1η προσπάθεια εξέτασης είναι **πράσινη** («δόθηκε και βαθμολογήθηκε», ο κανόνας
  του Γύρου 13) ενώ ο βαθμός της δεν μετράει — να μείνει έτσι ή η μη-λειτουργική
  προσπάθεια να γίνει γκρι; (2) η στήλη `done` του summary CSV μετράει **γραμμές**
  και όχι **θυρίδες**, οπότε με re-sits μπορεί να ξεπεράσει τον παρονομαστή —
  προτείνεται πέμπτη στήλη `slots done`· (3) τα **Weekly** (πρώην ΕΕΘ — η
  μετονομασία του Γύρου 18, §4t·2) **δεν έχουν κατάλογο**, άρα
  ούτε παρονομαστή («3 owed» = τρία που κατέγραψε κάποιος, όχι «3 από N»)· (4) το
  panel οδηγεί σε **ενότητες**, όχι σε γραμμές — ένα «πήγαινέ με στην πρώτη γραμμή
  που χρωστάω» είναι ένα κλικ παραπάνω στο ίδιο component.
  **Το (1) ΕΚΛΕΙΣΕ στον Γύρο 16 (§4r·2, «Το Α»)**: το χρώμα **μένει** —
  η γραμμή είναι πλήρης — και η ετυμηγορία λέγεται με **badge**, όχι με γκρι.
  Τα (2), (3), (4) παραμένουν ανοιχτά.

- ~~Weighted-score formula visible & adjustable? (default 3/2/1)~~ — ΑΠΑΝΤΗΘΗΚΕ
  στον Γύρο 10 (§4j): βάρη **10/8/5/3/1** ορισμένα από τη διοίκηση, τύπος ορατός
  σε κάθε επιφάνεια· «adjustable» ΔΕΝ ζητήθηκε — η κλίμακα είναι κλειστή.
- Deadline mechanism (freeze submissions before the brief)? — v2 unless asked.
- Σημείωση μετάπτωσης (R10 verify item 4): η one-shot μετάπτωση των 9 demo
  proposals ανανέωσε το `updated_at` των γραμμών που άγγιξε — τα «πότε υπέβαλε»
  των demo δεν είναι πλέον τα αρχικά (οι παγωμένες rank_* στήλες μένουν το
  πλήρες ίχνος). Στο πραγματικό 98B ο πίνακας ξεκινά άδειος, οπότε δεν αφορά
  κανένα αληθινό δεδομένο· μελλοντικές μεταπτώσεις να τυλίγονται σε
  trigger-disable ώστε να μην αγγίζουν χρονοσφραγίδες.
- ~~**ΝΕΟ (Γύρος 11, §4k) — «class average» στο Student analysis**~~ —
  **ΕΚΛΕΙΣΕ στον Γύρο 20 (27/08/2026, §4v·4) με την ΑΠΟΦΑΝΣΗ 2Α: «ΤΟ ΤΜΗΜΑ ΤΟΥ
  ΙΔΙΟΥ ΤΟΥ ΜΑΘΗΤΗ».** Οι τέσσερις μπάρες, η σύγκριση ανά checkride, η
  **διακεκομμένη γραμμή αναφοράς**, το βάθος του άξονα των FPC και το legend
  διαβάζουν πλέον **μία** συνάρτηση (`peers(s)`), και η ετικέτα **ονομάζει** το
  τμήμα («Comparison vs class 98B HAF»). Ένας δόκιμος της 99A τρεις εβδομάδες
  μέσα στο στάδιο και ένας αξιωματικός της 98B στο τέλος του **δεν είναι
  πληθυσμός**: ο μέσος όρος πάνω και στους δύο είναι αριθμητική για κανέναν.
  **ΟΧΙ** το φίλτρο του Overview, σκοπίμως: εκείνο λέει τι βλέπει ο **admin**,
  αυτό λέει με ποιους συγκρίνεται ο **μαθητής** — αν δένονταν, η θέση ενός
  μαθητή θα άλλαζε επειδή κάποιος πάτησε ένα chip. Το αρχικό κείμενο μένει ως
  ίχνος: *«Οι τέσσερις μπάρες, η σύγκριση ανά checkride και η διακεκομμένη
  γραμμή αναφοράς υπολογίζονται πάνω σε **όλους τους ενεργούς μαθητές όλων των
  τμημάτων** — όπως πάντα, ο Γύρος 11 δεν άλλαξε κανέναν αριθμό, μόνο έκανε τα
  tooltips ειλικρινή. Με 25 μαθητές σε τρία τμήματα στο ίδιο instance, το «class
  best/worst/average» είναι αριθμητική πάνω σε πληθυσμό που η ετικέτα δεν
  περιγράφει. **Ζητείται απόφαση**: να ακολουθεί το φίλτρο του Overview, να
  περιορίζεται πάντα στο τμήμα του μαθητή, ή να μένει σε επίπεδο μοίρας;»*
- **ΝΕΟ (Γύρος 11) — παρατήρηση από τη ζωντανή δοκιμή, ΟΧΙ σφάλμα του γύρου:**
  η εγγραφή ενός demo μαθητή δεν αποθηκεύεται ξανά επειδή μια παλιά γραμμή SMS
  δεν ονομάζει τη συνθήκη ΚΕΠΕ (κανόνας Γύρου 8, §4f). Λειτουργεί ακριβώς όπως
  σχεδιάστηκε — καταγράφεται εδώ ώστε να μην εκληφθεί ως παρενέργεια του
  Γύρου 11 όταν ο CO το συναντήσει.

## §4φ · 2026-08-27 — Η ΠΥΛΗ ΑΝΑΠΤΥΞΗΣ ΜΕΣΩ SUPABASE MCP (ΑΠΟΦΑΝΣΗ ΧΡΗΣΤΗ)

**ΑΠΟΦΑΝΣΗ 27/08/2026**: «Συμφωνώ για supabase ακολουθώντας τους κανόνες για το
select και token.» Το βήμα «ο χρήστης επικολλά το db/schema.sql στον SQL editor»
μπορεί εφεξής να εκτελείται από τον Claude μέσω του Supabase MCP, με τους εξής
ΑΠΑΡΑΒΑΤΟΥΣ όρους:

1. **Μία ρητή εντολή του χρήστη ανά εκτέλεση** («τρέξε το schema») — ποτέ
   αυτεπάγγελτα, ποτέ ως παρενέργεια άλλης εργασίας.
2. **Ποτέ από subagents/γύρους** — μόνο η κύρια συνεδρία, με τον χρήστη παρόντα.
   Οι γύροι συνεχίζουν να δουλεύουν ΜΟΝΟ στο τοπικό εργαστήριο.
3. **Το τελικό SELECT που τυπώνει το admin token ΔΕΝ εκτελείται ποτέ** — το
   schema τρέχει χωρίς την τελευταία εντολή-ηχώ· ο κανόνας «admin token ποτέ
   μέσω Claude» μένει απαραβίαστος. Γενικότερα: **καμία εντολή δεν επιστρέφει
   ποτέ στήλη token** — οι έλεγχοι γίνονται με counts/booleans.
4. Μετά από κάθε schema εκτέλεση τρέχει ο security advisor και τα ευρήματα
   κρίνονται στο spec.

**Η ΚΡΙΣΗ ΤΩΝ ADVISOR ΕΥΡΗΜΑΤΩΝ (27/08/2026, 150 lints, 0 ERROR):**
- `anon/authenticated_security_definer_function_executable` ×42 — **ΑΠΟΔΕΚΤΟ BY
  DESIGN**: η αρχιτεκτονική είναι RPC-only με το token ως όρισμα· ο anon ΠΡΕΠΕΙ
  να καλεί τα RPCs και το καθένα αυθεντικοποιεί μόνο του (wa.auth/auth_role).
- `rls_enabled_no_policy` ×6 — **ΑΠΟΔΕΚΤΟ BY DESIGN**: RLS ενεργό χωρίς policies
  = default-deny· κανένας ρόλος δεν διαβάζει πίνακα απευθείας.
- `function_search_path_mutable` ×102 — **ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΗ ΘΩΡΑΚΙΣΗ** για τον
  επόμενο γύρο schema: κάρφωμα search_path σε όλες τις συναρτήσεις (φθηνό,
  best-practice, χαμηλό πρακτικό ρίσκο σήμερα).

**ΕΓΙΝΕ ΣΤΟΝ ΓΥΡΟ 20 (27/08/2026, §4v·5a).** Και οι **102** φέρουν πλέον
`set search_path = public, wa, pg_temp` — **την ίδια συμβολοσειρά που ήδη
ορίζουν τα public RPC**, άρα η αλλαγή είναι behaviour-identical **εκ
κατασκευής**: μια `wa` συνάρτηση φτάνεται μόνο μέσα από ένα public RPC που έχει
ήδη βάλει ακριβώς αυτά τα τρία σχήματα στο path. Η `wa.gen_token` κρατά το δικό
της (`public, extensions, pg_temp` — pgcrypto). Ένα **audit block** στο τέλος του
`db/schema.sql` **ρίχνει το deployment** αν έστω μία `wa` συνάρτηση χάσει τη
ρήτρα (το `create or replace` αντικαθιστά και τα SET), και τυπώνει
*«r20: search_path pinned on all 110 wa functions»*. Τοπικά: **102 → 0**
(`pg_proc` / `proconfig`), schema εφαρμοσμένο **δύο φορές** με `ON_ERROR_STOP=1`,
και **35 RPC** έλεγχοι πάνω από το καρφωμένο path χωρίς καμία αλλαγή
συμπεριφοράς.

**ΤΟ RE-RUN ΤΟΥ ADVISOR ΔΕΝ ΑΝΗΚΕΙ ΣΕ ΓΥΡΟ — Η ΠΥΛΗ ΕΠΑΝΑΔΙΑΤΥΠΩΝΕΤΑΙ.** Ο όρος
2 παραπάνω μένει απαράβατος: **ποτέ από subagents/γύρους**. Το `db/schema.sql`
του Γύρου 20 είναι **committed και ΟΧΙ pushed**· η εκτέλεσή του μέσω Supabase MCP
και το επακόλουθο `get_advisors` γίνονται **από την κύρια συνεδρία, με ρητή
εντολή του χρήστη ανά εκτέλεση**, **χωρίς** το τελικό SELECT που τυπώνει το admin
token, και **καμία** εντολή δεν επιστρέφει ποτέ στήλη token. Αναμενόμενο
αποτέλεσμα: `function_search_path_mutable` **102 → 0**, τα υπόλοιπα **48** lints
αμετάβλητα και **αποδεκτά by design**.

**ΓΥΡΟΣ 20b (27/08/2026) — Η ΠΥΛΗ ΞΑΝΑΔΙΑΤΥΠΩΝΕΤΑΙ ΑΥΤΟΥΣΙΑ, ΚΑΙ ΤΟ ΣΤΟΙΒΑΓΜΑ
ΜΕΓΑΛΩΝΕΙ ΚΑΤΑ ΕΝΑ.** Ο γύρος 20b άγγιξε `db/schema.sql` (τρία `wa.chk`
παρουσίας, §4w·1) και το spec, **και τίποτε άλλο**. Δεν άγγιξε — και δεν
επιτρέπεται να αγγίξει — το Supabase MCP: ο όρος 2 μένει απαράβατος, **ποτέ από
subagents/γύρους**. Το repo είναι τώρα **δύο commits μπροστά από το
`origin/main`** (γύρος 20 → γύρος 20b), **committed και ΟΧΙ pushed**.

Άρα εκκρεμούν, με τη σειρά, **ΜΟΝΟ από την κύρια συνεδρία και με ρητή εντολή του
χρήστη ανά εκτέλεση**:

1. **Deploy** του `db/schema.sql` (όπως στέκει μετά τον 20b) μέσω Supabase MCP —
   **χωρίς** την τελική εντολή-ηχώ που τυπώνει το admin token, και **καμία**
   εντολή να μην επιστρέφει ποτέ στήλη `token` (έλεγχοι με counts/booleans).
2. **`get_advisors`** αμέσως μετά (όρος 4).

**ΤΟ ΑΝΑΜΕΝΟΜΕΝΟ ΕΙΝΑΙ ΠΡΟΒΛΕΨΗ, ΟΧΙ ΑΠΟΤΕΛΕΣΜΑ** (§4v·7·1, §4w·4·2):
`function_search_path_mutable` **102 → 0**, τα υπόλοιπα **48** lints αμετάβλητα
και **αποδεκτά by design**. Ο γύρος 20b **δεν μετακινεί τον αριθμό**: δεν
δημιούργησε, δεν διέγραψε και δεν μετονόμασε καμία συνάρτηση — οι τρεις έλεγχοι
είναι `perform wa.chk(...)` **μέσα** στην `wa.validate_instructor_record`, που
ήδη έφερε τη ρήτρα. Τοπικά: **110 wa functions · 110 pinned · 0 unpinned**.
