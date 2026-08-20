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
  grade), verdict? (`pass|lagging|failed`, **only where the grade is absent**;
  where a grade exists the verdict is DERIVED by `wa.grade_verdict` and a stored
  one is refused), note?}]
  A row whose sortie is one of the eight checkrides is **refused**: a checkride
  lives in Evaluations, and two rows for one flight are two grades that can
  disagree.
- **lessons**: [{date*, end_date? (a lesson is a BLOCK), group* (one of the 12
  theory groups — closed), course? (off-catalogue accepted and marked; a course
  of ANOTHER group is refused, because the join key is the PAIR `(group,
  course)` — `OJT` belongs to four of them), periods? (**null means the FULL
  course**, FDMS's own semantics), absent*, instructor?, instructor_oid?,
  note?}] — **no grade: a lesson is attended, not scored.**
- **exams**: [{date*, exam* (one of the **8 ground-exam groups** and only those
  — the nested `exams[]` of four theory groups are COURSES of their group),
  grade? (nullable, same lag), instructor?, instructor_oid?, note?}]

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

**DEMO DATA.** The seed violated rule 3 (Georgiou had I4490/F4690 over empty
C5090/C5490/I4890; Papadopoulos C5090 over an empty C4790 and I4490 over an
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
drops one, *"this entry was set by the squadron CO and only the CO can change
it"* (a whole section omitted from the payload is caught by the same rule).
The owner path **no longer strips stamps**: `wa.strip_stamps` is dropped and
replaced by `wa.carry_stamps`, which preserves the stored provenance of every
matched entry (admin stays admin, null stays null) and leaves everything the
owner wrote unstamped. Diff-stamping is unchanged on the CO path; **the CO can
still edit or delete his own entries, and the CO editing an OWNER entry
re-stamps it admin — which locks it.** The record-level derived stamp follows:
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

**`app/app.js` and `app/instructor.js` carry no `<select>` and no `<datalist>`
at all** — the shared library defines vocabularies but renders no form control,
and the instructor board is a **radio group** (round 10 — its five levels are
`<input type="radio">`, not a select; the theme gallery's cards are
`role="option"` buttons, also not a select). That is the whole surface:
**19 dropdown fields, 3 datalists, 4 ruled exceptions.**
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

### THE FORM — ONE RADIO GROUP, AND A THIN RULE BEFORE THE FIFTH

Per student, **one `role="radiogroup"` of five real radios in scale order**
(arrow keys walk the scale, screen readers announce "3 of 5"), each showing its
label and its weight, beside the existing comment and flew-with.

**The fifth option is separated from the four above it by a thin 1px rule.** The
four above place a student on the fighter track or beside it; the fifth places
him firmly **elsewhere**. It is a different **kind** of statement, not merely the
next step down, and it is not allowed to read as the continuation of a list.

**Clearing:** clicking the level that is already selected returns the student to
"no view formed yet" — the same escape the round-8 chips had, which a radio group
does not offer by itself, and the only way to un-say something an instructor did
not mean to say.

**JUDGEMENT — no floating Save here (and why).** §4i·3 gave the *student* form a
floating dirty-state Save because that form is metres long and its Save scrolls
out of reach. This form is a five-option question whose Save sits inside the same
small card, a thumb away — and there is **one card per student**, so a floating
button would have to answer *"save which of them?"*: either save all (a batch
write nobody asked for, which would also re-stamp rows the CO owns) or guess.
So the card's **own** Save announces the dirt instead — it gains an accent ring
the moment anything changes and drops it on save, which is what the floating
button was ever for.

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

**ONE DEFINITION, WRITTEN TWICE AND CHECKED:**
`wa.grade_pass_min()` / `wa.grade_band()` / `wa.grade_passed()` /
`wa.eval_operative()` in `db/schema.sql`, mirrored by `WA.GRADE_PASS_MIN` /
`WA.GRADE_BANDS` / `WA.gradeBand` / `WA.gradePassed` / `WA.attemptLater` /
`WA.evalOperativeOf` in `app/app.js`. `WA.evalLatest` is **gone, not renamed** —
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

## 4l. Round 12 (2026-08-20) — THE LOG TABLES

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
   'duration','grade','ng','verdict','note','legacy','entered_by']
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
| `verdict` | `pass\|lagging\|failed`, nullable | Present **only when `grade` is null**. |
| `note` | free text ≤300 | In `wa.free_fields()` already. |
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

**THE VERDICT, AND WHY IT EXISTS.** The squadron's scheduler knows pass / lag /
fail and has no percentage for a sortie; this record knows percentages. `verdict`
is how the first crosses into the second. It lives **only where the grade is
absent**: a stored verdict beside a stored grade is a second source of truth that
can contradict the first — the exact defect round 11 removed from the FPC. Where
a grade exists the verdict is **derived** (`wa.grade_verdict`, the 60/50
thresholds of ΠΔ 151/13 collapsed to three) and a stored one is refused by name.
Without the key, a flight the squadron recorded as **ΑΠΟΤΥΧΙΑ** would arrive
indistinguishable from a flight still waiting for its debrief — a failure
invisible in the record that exists to show it.

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
wa.entry_keys('lessons') =
  ['date','end_date','group','course','periods','absent',
   'instructor','instructor_oid','note','legacy','entered_by']
wa.entry_keys('exams') =
  ['date','exam','grade','instructor','instructor_oid','note','legacy','entered_by']
```

- `group` — the **closed list** of the twelve theory groups. It is the identity
  of the row, the way `category` is for a FAIL.
- `course` — **off-catalogue accepted and marked**, the `sortie` rule: course
  codes are derived at run time from the printed duration block, so they are the
  value most likely to lag reality. What *is* refused is the **contradiction** —
  a course that exists but **in another group**, which would make the join key
  false. **The join key for a course is the PAIR `(group, course)`, never the
  code alone: `OJT` is a course of four different groups.**
- `periods` — integer, nullable. **NULL means the FULL course** — FDMS's own
  semantics (`covCore`). New helper `wa.chk_int`.
- `end_date` — a lesson is a **block**: `date` = start, `end_date` = end, null =
  a single day.
- `absent` — boolean. This is how *"the class covered it and this student did
  not"* is said **from the student's side**, and it is the only thing that makes
  a makeup visible instead of silent.
- **No grade on a lesson.** A lesson is attended, not scored.
- `exam` — one of the **8 ground-exam groups**, closed list.

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

**THE GROUND-EXAM PASS MARK IS DELIBERATELY NOT DECIDED.** FDMS uses
`exam_pass_pct` (default **80**); WA uses **60** everywhere (ΠΔ 151/13). The
reading that they are two different exams and both numbers are right is
plausible, so this round **stores the grade and derives no characterisation for
`exams` at all** — no verdict, no pass/fail chip, nothing that would settle the
question by accident. It stays an open item below.

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
- **A verdict beside a grade is DROPPED**, not flagged. This is the one place
  round 12 removes a stored value, and it is lossless: where a grade exists the
  verdict is *derived* from it, so what is dropped is a copy, not a fact.
  Flagging instead would leave a row nobody could ever save, because the form
  draws no verdict box on a graded row — **a trap, not a question**.
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

### THE FORM

The ten blocks sit at the **end** of the student form («ενα πινακα στο τελος»),
in the directive's order: **4 × Flights ⟨track⟩ · 4 × F/S ⟨track⟩ · Ground lessons
· Ground exams**. The flight blocks are collapsible `<details>`, open by
themselves when they hold something, each with its own **+ Add a flight** — a
single Add up in the section header could not know which track it was adding to,
and the track is a *stored fact* written by the act that creates the row, never
inferred afterwards from a code that may not exist.

Every row wears a **one-line summary** — flight · date · instructor · duration ·
grade — and **that line is the table row the directive asks for**; the boxes below
it are how it is edited. On a 375 px phone the columns wrap instead of scrolling,
which is why this is not a real `<table>` here. The CO's drill-down and the
printed brief **do** use real tables: there the screen is wide and the reader is
reading, not typing.

Rows keep their **index in the section** (`data-idx`), never their index in the
table: every handler addresses `S.data[sec][i]`, and a per-table index would
silently edit the wrong row the moment two tables held entries.

**COMPLETENESS, WITH THE LAG MADE EXPLICIT — three notions, kept apart:**

| notion | for the new sections |
|---|---|
| `COMPLETE[sec]` — *"is this row still a leftover?"* | `date && sortie && instructor && track`. **THE GRADE IS DELIBERATELY NOT PART OF IT.** A row may wait for its grade for ever without being incomplete. This is «δεκτο το null» expressed in the one function that decides. |
| `blocksSave` — *"does this row refuse the save?"* | **Only a missing instructor.** A missing grade never blocks anything. The two contradictions (`ng` + grade, `verdict` + grade) are unreachable by construction — the verdict box is only drawn where there is no grade, and NG clears both — and are refused by the validator anyway. |
| `wa.entry_count` / `co_entry_count` | All four join `WA.COUNTED`. **The consequence is named rather than hidden:** a mid-stage student goes from ~18 entries to ~80, so *"3 of 8 entered by the CO"* becomes *"3 of 80"*. That is what the record now contains, and a denominator that pretended otherwise would be the untruth. |

**THE LAG GETS A SURFACE**, because it is the reality the directive names. A row
with `grade IS NULL AND ng IS false AND verdict IS NULL` renders an **"awaiting
debrief"** chip — quiet, dashed, in the muted colour: it is neither an error nor a
legacy leftover. After `WA.DEBRIEF_AMBER_DAYS` (7) it turns amber and carries the
age (*"awaiting debrief · 21 d"*), because at some point the quiet fact becomes a
thing to chase. Every section header counts them (*"3 awaiting a grade"*), and on
**paper** the lag and a verdict-with-no-number are printed **in words** — a
photocopied brief showing an empty Grade cell for a flight the squadron recorded
as ΑΠΟΤΥΧΙΑ would hide exactly what it exists to show.

### BLAST RADIUS

**Server:** `wa.sections` · `wa.entry_keys` · `validate_record` (4 branches + the
checkride refusal + the band/track contradictions) · `wa.migrate_record`
(pass-through + repairs) · new `wa.section_cap` · `wa.log_bands` ·
`wa.flight_kinds` · `wa.verdicts` · `wa.grade_verdict` · `wa.chk_int` ·
`wa.chk_duration` · `wa.entry_count_by` (with `co_entry_count` kept as its
wrapper) · the six generated lookups + `wa.solo_slots` moved into the block.
**`wa.slot_empty`, `wa.entry_core`, `wa.stamp_record_diff` and `wa.carry_stamps`:
untouched** — the new rows are ordinary entries and the CO lock works on them
because it was never section-specific.

**Client:** `WA.ENTRY_KEYS` · `WA.COUNTED` · `WA.SECTIONS_META` · the log
vocabulary and catalogue helpers in `app.js` · `WA.migrateRecord` ·
`student.js` `SECTIONS` + `COMPLETE` + `blocksSave` + `missingOf` + `buildPayload`
+ the 4+4 render · `instructor.js` self-report card · `admin.js` drill-down,
brief, print and the entries CSV (two new columns: **Hours** and **Awaiting** —
a spreadsheet that read a blank Grade as a zero would be reading a failure that
never happened).

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
   `select array_length(wa.sections(),1);` → **13**, and
   `select array_length(wa.sortie_codes('flights','contact'),1);` → **36**.
4. **Only then** push the app (the seven assets carry `?v=20260820a`).
5. If step 2 is skipped, the symptom is a save that fails with *«unknown
   section»* — re-run the schema and the same save succeeds untouched.

### SELF-VERIFICATION (live, local stack, real RPCs and the real form)

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

### OPEN ITEMS RAISED BY THIS ROUND

1. **The ground-exam pass mark.** FDMS `exam_pass_pct` defaults to **80**; WA
   uses **60** everywhere. This round stores the grade and characterises nothing
   for `exams`, so the question is still open: one number, or two different exams
   with two right numbers?
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

## 4. Screens

1. **Student form** (via personal link): sectioned, repeatable rows (+ add /
   remove), Save any time, shows own last_update. Re-entry always allowed.
   **Round 12 (§4l): the LOG TABLES at the end** — 4 × Flights ⟨track⟩ + 4 × F/S
   ⟨track⟩ as collapsible blocks, then Ground lessons and Ground exams. Each
   flight row wears a one-line summary (flight · date · instructor · duration ·
   grade) that reads as the table row, with the boxes below it. **The grade may
   be left empty for ever**: the row says *awaiting debrief* and is complete
   without it. The same form, bound to somebody else, is what the CO fills in on
   a student's behalf.
2. **Instructor form**: student list; per student a **compact card of their
   self-reported data** (counters, evaluations, solos, **and the round-12 flight
   log as one line per band — per-track counts, hours, and how many sorties are
   still awaiting a grade**) beside **ONE radio group
   of the five assessment levels for fighters** (round 10, §4j — scale order,
   weights shown, **thin rule before the fifth**, click-the-selected-one to
   clear) + comment + flew-with checkbox. Save/edit any time; the card's own
   Save rings accent while dirty. **Its own printable sheet** (round 8, round-10
   content): one structured block per student — the assessment in words with its
   weight, flown-with, comment, and the student's reported record.
3. **Admin dashboard** (CO) — THREE MODES (decision 2026-08-13):
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
   b. **Student analysis** (click a row — each student examined SEPARATELY):
      - Identity header (MN, rank, name, class) + entries still to correct.
      - **Comparison chart** (vanilla SVG, mifchart discipline): the selected
        metric shown as FOUR bars — **this student · class best · class worst ·
        class average**. Metric selected by CLICK on chips: FAIL · ALMOST GOOD ·
        NFS · SMS entries · airsickness · solo flights · FPC · CEF.
        **Round 2/3**: no mean-evaluation metric and no evaluation COUNT chip
        (every student converges to the same eight checkrides). Every chip
        states its direction, and **FPC/CEF are always "lower is better"** —
        they exist only after a failure.
      - **Evaluations card**: (a) PER-EVALUATION comparison — pick one of the
        eight checkrides, get the same four bars ON THAT checkride (each
        student contributes **the attempt the flight was characterised
        successful on** — round 11, §4k·3; it was "their latest graded attempt"
        until then) with the contributing values printed underneath so the CO
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
      - **Round 12 (§4l): THE LOG TABLES** — at the end, in the form's order:
        4 × Flights ⟨track⟩ and 4 × F/S ⟨track⟩ (flight · date · instructor ·
        hours · grade · note · source, with the *kind* and *same-day re-fly*
        tags), then Ground lessons (group · course · block dates · periods ·
        instructor · attendance) and Ground exams. Here they are **real
        tables** — the screen is wide and the CO is reading, not typing. An
        empty grade cell is **not a gap**: it prints the *awaiting debrief*
        chip with its age, and a verdict with no percentage is named in words
        rather than left blank. All of it reaches the printed brief, where the
        lag and the verdict are spelled out because paper is monochrome.
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
- **ΝΕΟ (Γύρος 11, §4k) — «class average» στο Student analysis.** Οι τέσσερις
  μπάρες, η σύγκριση ανά checkride και η διακεκομμένη γραμμή αναφοράς
  υπολογίζονται πάνω σε **όλους τους ενεργούς μαθητές όλων των τμημάτων** —
  όπως πάντα, ο Γύρος 11 δεν άλλαξε κανέναν αριθμό, μόνο έκανε τα tooltips
  ειλικρινή. Με 25 μαθητές σε τρία τμήματα στο ίδιο instance, το «class
  best/worst/average» είναι αριθμητική πάνω σε πληθυσμό που η ετικέτα δεν
  περιγράφει. **Ζητείται απόφαση**: να ακολουθεί το φίλτρο του Overview, να
  περιορίζεται πάντα στο τμήμα του μαθητή, ή να μένει σε επίπεδο μοίρας;
- **ΝΕΟ (Γύρος 11) — παρατήρηση από τη ζωντανή δοκιμή, ΟΧΙ σφάλμα του γύρου:**
  η εγγραφή ενός demo μαθητή δεν αποθηκεύεται ξανά επειδή μια παλιά γραμμή SMS
  δεν ονομάζει τη συνθήκη ΚΕΠΕ (κανόνας Γύρου 8, §4f). Λειτουργεί ακριβώς όπως
  σχεδιάστηκε — καταγράφεται εδώ ώστε να μην εκληφθεί ως παρενέργεια του
  Γύρου 11 όταν ο CO το συναντήσει.
