# Wings Ahead — Spec (SDD)

> Student utilization recommendations for the Wing Commander brief.
> Separate product from FDMS. Draft 2026-08-12 — approved and implemented.
> **Rounds 2+3 (2026-08-13)** applied as one delivery: see §3 (data model) and
> §4a (branding · terminology · evaluation identity).

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

**Legacy (v1) records migrate ON READ** (`wa.migrate_record`, mirrored in
`WA.migrateRecord`): the NFS counter becomes one entry per counted event, a
pending SMS keeps the fact as a note, free-text FAIL items become `items[]`
under the placeholder category `other`, identity-less evaluations survive
un-identified, `graded:false` becomes `ng:true`, `progress_tests`/
`aptitude_exams` become `fpc`/`cef`. What cannot be completed automatically is
carried with `legacy:true`; the form highlights it, says exactly what is
missing, and still saves the rest. The flag can only be USED UP: a save may
never contain more legacy rows in a section than the stored record had.

**THE ACTIVE INSTRUCTORS' SURNAMES** — `wa.instructor_surnames()` is the one
function that produces them: a JSON array of strings, sorted, distinct, active
instructors, and **nothing else** (no id, no token, no rank, no duty, no
`external_oid`). Any valid token may read them, students included — a student
may legitimately see who their instructors are. Round 9 folds the same array
into the form payload as `get_student_form(...).instructors` (and its admin
twin), so the form arrives with its own picker; **RPC
`list_instructor_names(token)`** stays as the standalone question over the same
function. Free text remains accepted in every box they fill (§4i·1).

**proposals** (instructor × student, upsert-once-per-pair):
- ranks: {fighters: 1|2|3|null, helicopters: …, transport_ff: …} — **ranking,
  multiple allowed**: 1 to 3 branches, each with an order position (decision Q1)
- not_recommended: {fighters: bool, …} — **round 8**: a branch has FOUR states,
  ranked 1st/2nd/3rd · **explicitly not recommended** · untouched. A rank and a
  refusal are mutually exclusive (server-checked, plus a table constraint)
- flew_with: bool («έχω πετάξει μαζί του»)
- comment: optional short free text

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

**6 · THE INSTRUCTOR SAYS NO OUT LOUD.** A branch had three states and
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
| 6 | FPC · Due to which stage flight | `pickerF` → `triggerF` · `TRIGGER_GROUPS` | every sortie of the stage, grouped by the four tracks, checkrides included | **YES** — "Other… (type the code)" | — |
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
and the instructor board is tap-to-place (its "positions" are buttons, and the
theme gallery's cards are `role="option"` buttons, not a select). That is the
whole surface: **19 dropdown fields, 3 datalists, 4 ruled exceptions.**
(Round 9's form polish moved #10 from a `<select>` to a datalist input and
added `dl-eval`; the field count is unchanged, the ruled exceptions are
unchanged, and #5 lost the free-text filter box that used to sit above it —
see §4i.)

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

## 4. Screens

1. **Student form** (via personal link): sectioned, repeatable rows (+ add /
   remove), Save any time, shows own last_update. Re-entry always allowed.
2. **Instructor form**: student list; per student a **compact card of their
   self-reported data** (counters, evaluations, solos) beside the ranking
   pickers (1st/2nd/3rd **+ Not recommended**, round 8) + flew-with checkbox.
   Save/edit any time. **Its own printable sheet** (round 8): one structured
   block per student — branch table, flown-with, comment, and the student's
   reported record.
3. **Admin dashboard** (CO) — THREE MODES (decision 2026-08-13):
   a. **Overview**: one row per student (key counters, mini proposal bars,
      completion status) + who has not submitted yet ·
      people/token management (generate/copy/revoke links) · CSV/JSON export.
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
        student contributes their latest graded attempt) with the contributing
        values printed underneath so the CO can hand-check them — **round 8:
        the y-axis starts just below the lowest grade plotted, not at 0**; (b) a
        PER-CATEGORY plot (chips Contact · Instrument · Formation · Navigation ·
        FPC) drawing that category's evaluations **in syllabus order, never in
        date order**, as connected points with grade labels and a faint dashed
        class-average reference — clicking a point highlights its row in
        (c) the SUMMARY TABLE (evaluation · with whom · grade · date · source).
      - **Dated-entry tables**: FAIL and ALMOST GOOD in full (flight code,
        items, instructor, grade), airsickness **when and with whom**, plus
        NFS · SMS · solos · FPC · CEF. All of it reaches the printed brief.
      - Proposals panel (decision 2026-08-13): THREE BRANCH BOXES always visible
        (Fighters · Helicopters · Transport–Firefighting). A rank selector
        (1st / 2nd / 3rd choice chips) applies to ALL three boxes and refreshes
        them SIMULTANEOUSLY; each box lists the SURNAMES of the instructors who
        gave the student that rank for that branch ("Alfa, Bravo …").
        Under each box, every NON-proposal appears as a POLITELY WORDED bullet —
        e.g. "• Maj Alfa has not recommended Fighters for this student" and,
        for instructors with no submission at all, "• Capt X has not submitted a
        recommendation for this student yet". **Round 8** adds the third and
        strongest bullet: "• Maj Alfa **does not recommend** Fighters for
        this student" — the branch he explicitly refused, which is a judgement
        and not a silence. Weighted score per branch (default
        3/2/1, formula shown), count of 1st choices, % of proposers who flew
        with them; drill-down list (who + **call sign**, duty, leadership, status, flew_with,
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
