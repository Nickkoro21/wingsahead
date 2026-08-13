# WingsAhead — Οδηγός εγκατάστασης (το πρωινό τελετουργικό)

> Χρόνος: ~10 λεπτά. Χρειάζεσαι: λογαριασμό GitHub, το `gh` CLI συνδεδεμένο
> (`gh auth status` — αν όχι: `gh auth login`), και αυτόν τον φάκελο όπως σου
> παραδόθηκε (με έτοιμο git commit).
>
> Σειρά: **πρώτα Supabase** (βήματα 1–3), **μετά GitHub** (βήματα 4–5),
> **τέλος τα λινκ** (βήμα 6). Μην αλλάξεις τη σειρά — το βήμα 4 ανεβάζει το
> `config.js` που συμπληρώνεις στο βήμα 3.

---

## 1. Λογαριασμός Supabase + νέο project

1. Άνοιξε **https://supabase.com** → **Start your project** → **Sign in with GitHub**
   (χρησιμοποίησε τον GitHub λογαριασμό σου — δεν χρειάζεται νέο password).
2. **New project**:
   - Organization: ό,τι προτείνει (προσωπικό).
   - Name: `wingsahead`
   - Database Password: πάτα **Generate a password** — ΔΕΝ θα το ξαναχρειαστείς,
     αλλά φύλαξέ το κάπου.
   - **Region: `eu-central-1` (Frankfurt)** ← υποχρεωτικά EU.
   - Πάτα **Create new project** και περίμενε ~1–2 λεπτά να «πρασινίσει».

## 2. Τρέξε το schema (μία επικόλληση)

1. Αριστερό μενού → **SQL Editor** → **New query**.
2. Άνοιξε το αρχείο **`db/schema.sql`** από αυτόν τον φάκελο, **επίλεξε τα πάντα
   (Ctrl+A), αντίγραψε, επικόλλησε** στο SQL Editor.
3. Πάτα **Run** (Ctrl+Enter).
4. Στο αποτέλεσμα (κάτω) βλέπεις μία γραμμή με στήλες **`admin_token`** και
   **`admin_link`**. **Αντίγραψε το `admin_token` και φύλαξέ το** (π.χ. σε
   σημείωμα) — είναι το προσωπικό σου κλειδί-λινκ διοικητή.

> Το script είναι ακίνδυνο να ξανατρέξει — αν το τρέξεις δεύτερη φορά δεν
> σβήνει τίποτα και ξανατυπώνει το ίδιο admin token.

## 3. Δύο επικολλήσεις στο config.js

1. Supabase → **Project Settings** (γρανάζι κάτω αριστερά) → **Data API**
   (ή «API»): αντίγραψε το **Project URL** (μοιάζει με
   `https://abcdefgh.supabase.co`).
2. Στην ίδια περιοχή (καρτέλα **API Keys**): αντίγραψε το **`anon` `public`**
   key (το ΜΕΓΑΛΟ string — ΟΧΙ το `service_role`).
3. Άνοιξε το **`app/config.js`** με Notepad και αντικατέστησε τις δύο τιμές:

```js
var WA_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",      // ← Project URL
  SUPABASE_ANON_KEY: "eyJ…ή sb_publishable_…",       // ← anon public key
};
```

Αποθήκευση. (Το anon key ΕΙΝΑΙ ασφαλές να δημοσιευτεί — η βάση απαντά μόνο
μέσω συναρτήσεων που ελέγχουν το προσωπικό token του καθενός.)

## 4. GitHub repo + Pages (copy-paste)

Άνοιξε PowerShell **μέσα στον φάκελο** (Shift+δεξί κλικ → Open PowerShell) και:

```powershell
git add -A
git commit -m "config: production Supabase URL + anon key"
gh repo create wingsahead --public --source=. --push
```

Μετά ενεργοποίησε το GitHub Pages (σερβίρει από το main branch):

```powershell
'{"source":{"branch":"main","path":"/"}}' | gh api -X POST repos/Nickkoro21/wingsahead/pages --input -
```

> Αν δώσει σφάλμα, κάν' το από το site (ίδιο αποτέλεσμα, 10 δευτερόλεπτα):
> github.com → wingsahead → **Settings → Pages → Branch: main / (root) → Save**.

Περίμενε 1–2 λεπτά. Η σελίδα σου είναι:

```
https://<το-github-username-σου>.github.io/wingsahead/
```

Δοκίμασέ τη σκέτη — πρέπει να δεις το ευγενικό «This application works only
through personal links».

## 5. Άνοιξε το δικό σου λινκ διοικητή

Στον browser (και στο κινητό σου — αποθήκευσέ το στα bookmarks):

```
https://<username>.github.io/wingsahead/#t=<ADMIN_TOKEN>
```

όπου `<ADMIN_TOKEN>` αυτό που φύλαξες στο βήμα 2.4. Ανοίγει το **Admin
dashboard**.

## 6. Πρόσθεσε τους 9 μαθητές και στείλε τα λινκ

1. Καρτέλα **People & links** → **+ Add student** → Rank / ΑΜ / Επώνυμο /
   Όνομα / Class → **Create**. (×9)
2. Δίπλα σε κάθε μαθητή πάτα **Copy link** → επικόλλησε το λινκ σε
   **προσωπικό** Viber/mail του μαθητή. Ένα λινκ = ένα πρόσωπο· όποιος το
   έχει, ΕΙΝΑΙ αυτός ο μαθητής.
3. (Φάση 2 — όποτε είσαι έτοιμος) **+ Add instructor** με Duty / Leadership /
   Status και μοίρασε λινκ εκπαιδευτών με τον ίδιο τρόπο.

Αυτό ήταν. Ό,τι υποβάλλουν το βλέπεις ζωντανά στο **Overview** /
**Student analysis** / **Brief mode** (το Brief mode έχει και **Print brief**
— ασπρόμαυρη σελίδα ανά μαθητή + συγκεντρωτικός πίνακας ανά σειρά).

---

## Αν διαρρεύσει λινκ

**People & links** → στο πρόσωπο → **Regenerate**: το παλιό λινκ πεθαίνει
ΑΜΕΣΩΣ, βγαίνει καινούριο (αντιγράφεται μόνο του) → στείλ' το ξανά. Τα
δεδομένα του προσώπου ΔΕΝ χάνονται. Το **Revoke** απλώς απενεργοποιεί
(χωρίς νέο λινκ) — **Re-activate** το ξανανοίγει.

## Εβδομαδιαίο keep-alive (ήδη έτοιμο)

Το repo περιέχει το **`.github/workflows/keepalive.yml`**: κάθε Δευτέρα
06:17 UTC «χτυπά» τη βάση με ένα ακίνδυνο RPC ώστε το δωρεάν Supabase project
να μην μπει ποτέ σε παύση (pause γίνεται μετά από ~1 εβδομάδα αδράνειας).
Δεν χρειάζεται να κάνεις τίποτα. Μόνο σημείωση: αν το repo μείνει 60 μέρες
χωρίς κανένα commit, το GitHub απενεργοποιεί τα χρονοπρογραμματισμένα
workflows και σου στέλνει mail — τότε: repo → **Actions → Supabase
keep-alive → Run workflow** (ή κάνε ένα οποιοδήποτε commit).

> Αν παρ' όλα αυτά το project μπει σε pause: supabase.com → project →
> **Restore**. Τα δεδομένα δεν χάνονται.

## Πού είναι τι (για να ξέρεις)

| Τι                         | Πού                                              |
|----------------------------|--------------------------------------------------|
| Δεδομένα (η μόνη πηγή)     | Supabase (EU — Frankfurt), πίνακες κλειδωμένοι — πρόσβαση ΜΟΝΟ μέσω token-RPC |
| Κώδικας (χωρίς δεδομένα)   | GitHub repo `wingsahead` (public)                |
| Λινκ / tokens              | ΠΟΤΕ στο repo — μόνο στη βάση και σε όποιον τα στείλεις |
| Ρυθμίσεις                  | `app/config.js` (URL + anon key, τα μόνα που άλλαξες) |
| Schema / επανεγκατάσταση   | `db/schema.sql` (ξανατρέχει ακίνδυνα)            |
