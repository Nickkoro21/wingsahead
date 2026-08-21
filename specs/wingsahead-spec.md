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
2. **The call sign, in NATURAL order** — P-2 before P-14, never the string order
   that puts P-14 first. The call sign and **not the rank** decides, because the
   call sign is the squadron's own position (P-14 is the CO) while the rank is a
   grade. This is the **FDMS Currency precedent**, unchanged.
3. **No call sign sorts last within its own air force**, by surname — such a
   person is not un-ranked, they are un-numbered.

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
   `wa.natkey('P-14') = 'P-00000014'`, `wa.natkey('P-2') = 'P-00000002'`.
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
    off `list_instructor_names`) are in the **identical** order: HAF
    `P-14 … P-24`, then ITAF `P-40, P-42`, then the three without a call sign,
    last, by surname. The People header says *“— seniority order”*.
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

### WHAT WAS NOT TOUCHED

The **CO-lock mint behaviour** and the **seniority wording** (both still awaiting
the user's rulings, §4o), `styles.css` (the `badge-warn` token already existed),
and every threshold that is not a ground exam's.

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
   after the slots in date order. The same form, bound to somebody else, is what
   the CO fills in on a student's behalf.
2. **Instructor form**: student list; per student a **compact card of their
   self-reported data** (counters, evaluations, solos, **and the round-12 flight
   log as one line per band — per-track counts, hours, how many sorties are
   still awaiting a grade, and (round 13) how many of the flow chart are still
   OWED**) beside **ONE radio group
   of the five assessment levels for fighters** (round 10, §4j — scale order,
   weights shown, click-the-selected-one to clear) + comment + flew-with
   checkbox. **Round 14 (§4n·5): the thin rule sits between «Recommended as
   Alternate» and «Recommended for Other Assignments»** — it marks the
   **fighter / other split** (three answers above it, two below), not the last
   level off from the list, and the CO's readout draws it from the same
   `WA.LEVEL_SEP_AT`. **Round 14 (§4n·6): there is ONE general Save**, not one
   per card — it names how many assessments differ from what is stored
   (*“Save 3 assessments”*, floating copy + bottom bar, disabled while nothing
   differs), a dirty card is marked in place, and the write goes through the
   round-14 **confirmation dialog** (§4n·7) naming the instructor the link
   belongs to and enumerating the changes. **Its own printable sheet** (round 8,
   round-10 content): one structured block per student — the assessment in words
   with its weight, flown-with, comment, and the student's reported record.
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
        **Round 13 (§4m): the CO's tables are the STUDENT'S tables.** The owed
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

- **ΑΠΟΦΑΝΣΗ 2026-08-21 (Γύρος 15, §4p) — ΤΟ ΚΑΤΩΦΛΙ ΤΩΝ ΓΡΑΠΤΩΝ ΕΞΕΤΑΣΕΩΝ ΕΙΝΑΙ
  80 %.** «80% για εξετασεις εδαφους, 60% για πτησεις. Πλεον εχουμε κανει και το
  mapping.» Κλείνει το ανοιχτό σημείο 1 του Γύρου 12b: **δύο διαφορετικές
  εξετάσεις, δύο σωστοί αριθμοί.** Ισχύει και για τις οκτώ και για τα **ΕΕΘ**. Οι
  πτήσεις, τα F/S, οι αξιολογήσεις, τα solo και τα FPC / CEF **μένουν στο 60**,
  και η **πεντάβαθμη κλίμακα ΠΔ 151/13 δεν κουνήθηκε** (τα «Α/ΛΚ/Κ/ΣΚ/Ε» είναι
  *χαρακτηρισμός*, όχι βάση επιτυχίας: ένα 78 σε γραπτή είναι ακόμη «ΛΚ» και απλώς
  δεν περνάει). Άλλαξε **μία** συμπεριφορά: ποια προσπάθεια «πιάνει» τη θυρίδα
  (`WA.examOperativeIx`) — ένα 78 σε 2nd trial δεν την πιάνει πια ως επιτυχία.
- **ΝΕΟ (Γύρος 15, §4p) — τρία ανοιχτά σημεία**: (1) το **«F/S στο 50»** της
  εντολής **δεν αντιστοιχεί σε τίποτα** μέσα στην εφαρμογή — το μόνο 50 είναι το
  κατώφλι της ζώνης «ΣΚ» και το F/S κρίνεται στο 60 όπως η πτήση· **ζητείται
  απόφανση** αν το simulator υποτίθεται ότι περνάει στο 50 (θα ήταν τρίτος
  αριθμός)· (2) μια **αποτυχημένη γραπτή παραμένει πράσινη** (`st-done` = η
  γραμμή είναι πλήρης· το κελί δίπλα λέει «fail») — χρειάζεται πέμπτη κατάσταση
  «τελειωμένο, μη επιτυχές»; (3) το **«4 από 8 exams»** μετράει γραπτές που
  **δόθηκαν και βαθμολογήθηκαν**, όχι επιτυχίες — τώρα το λέει σε tooltip, αλλά
  αν το brief πρέπει να απαντά «πόσες πέρασε», είναι δεύτερος μετρητής.

- **ΝΕΟ (Γύρος 14, §4n) — τέσσερα ανοιχτά σημεία του γύρου**: (1) μια αποτυχημένη
  1η προσπάθεια εξέτασης είναι **πράσινη** («δόθηκε και βαθμολογήθηκε», ο κανόνας
  του Γύρου 13) ενώ ο βαθμός της δεν μετράει — να μείνει έτσι ή η μη-λειτουργική
  προσπάθεια να γίνει γκρι; (2) η στήλη `done` του summary CSV μετράει **γραμμές**
  και όχι **θυρίδες**, οπότε με re-sits μπορεί να ξεπεράσει τον παρονομαστή —
  προτείνεται πέμπτη στήλη `slots done`· (3) τα **ΕΕΘ δεν έχουν κατάλογο**, άρα
  ούτε παρονομαστή («3 owed» = τρία που κατέγραψε κάποιος, όχι «3 από N»)· (4) το
  panel οδηγεί σε **ενότητες**, όχι σε γραμμές — ένα «πήγαινέ με στην πρώτη γραμμή
  που χρωστάω» είναι ένα κλικ παραπάνω στο ίδιο component.

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
