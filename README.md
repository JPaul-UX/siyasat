<img src="apps/web/public/logo.svg" alt="Siyasat, citation checker" width="236">

# Siyasat

Siyasat checks whether the references in a paper are real, correct, and not retracted. It looks each one up in
Crossref and OpenAlex, shows what differs from the official record, and builds a corrected bibliography.
A draft check puts each cited sentence next to its source's abstract, so the author can judge whether the source
supports it.

## Citation styles

References can be pasted in any common style, and mixed in one list: APA, Harvard, MLA, Chicago (author-date
and notes), IEEE, Vancouver, AMA and ACS are each recognised by their shape, so a wrong year, author, volume
or page range is caught whichever style it is written in (`packages/core/src/parse.ts`). A reference in no
recognisable shape is still matched, on its DOI or on how much of a record's title appears in it.

The corrected bibliography, the "copy corrected reference" button, the spreadsheet and the downloaded report can
be written in APA 7, MLA 9, Chicago author-date, Harvard, IEEE or Vancouver (`packages/core/src/styles.ts`).
IEEE and Vancouver lists are numbered in the order of the list that was checked; the others are sorted by
author. Journal articles, books, chapters, conference papers and preprints each have their own layout, with
the publisher, place and editors when the database holds them. What it does not hold is left out, never
invented.

### Capitals and abbreviations

A style also says how a title is capitalised and whether a journal is named in full. Databases hold a title
however its publisher typed it, so it is rewritten for the style (`packages/core/src/casing.ts`): sentence
case for APA, Harvard, IEEE and Vancouver, title case for MLA and Chicago. Going to sentence case means
deciding which capitals are real, and each word is decided on evidence, strongest first:

1. its own shape ("NumPy", "mRNA", "COVID-19");
2. the abstract, which shows how words are written in running text, including names of several words;
3. another copy of the same title in sentence case: the author's own reference, or a second database record;
4. a list of names (countries, peoples, languages, Philippine places, people whose names became terms);
5. failing all of those, lower case.

A title that is not in English is left as it is.

Vancouver and IEEE cite journals by abbreviation. The abbreviation is looked up in the NLM Catalog by ISSN,
then taken from the publisher's own short title, and only then worked out by ISO 4 from a word list
(`packages/core/src/journals.ts`).

The app explains all of this, and how a reference is scored, on its **How it works** page. That page reads
its numbers from `packages/core/src/scoring.ts`, the one table every threshold lives in, and computes its
worked examples with the checker's own functions.

## How it is built

| Part | Where | What it does |
| --- | --- | --- |
| Core | `packages/core` | The citation logic in plain TypeScript: parsing references, scoring matches, deciding verdicts, analysing drafts, reading library exports, writing exports. No network and no DOM, so the API and the web app share it. |
| API | `apps/api` | NestJS. Looks references up in the scholarly databases, and stores each workspace's checks in Postgres (Prisma). In production it also serves the built web app. |
| Web | `apps/web` | Vite + React. The interface. Uploaded PDFs and Word files are read in the browser; only their text is sent for checking. |

Lookups go through the API rather than straight from the browser so that API keys stay on the server, answers are
cached, and all users together stay inside each database's rate limit (`apps/api/src/upstream`).

## Accounts and abuse protection

Every lookup costs requests to Crossref, OpenAlex and the other databases, which all users share, so Siyasat needs
an account: nothing but the sign-in and sign-up pages works without one (`apps/api/src/auth`).

- **Sessions.** Signing in sets an httpOnly, SameSite=Lax cookie holding a random token; the database keeps only
  its hash. Sessions last 30 days. Passwords are hashed with scrypt.
- **Rate limits.** Lookups are limited per account (per IP address before signing in). Sign-ups are limited to 30
  an hour per address and sign-in attempts to 60 every 15 minutes. Ten wrong passwords in a row lock the account
  for 15 minutes.
- **Bots.** The sign-up form has a field people cannot see; a sign-up that fills it in is refused and logged.
- **Usage.** Each account's lookups are counted per day, and so is every request a rate limit refused.

Checks saved before accounts existed belong to anonymous workspaces whose token is in the browser's local
storage. Signing up or in from that browser moves those checks into the account.

### The admin dashboard

The super admin opens **Admin** in the sidebar (`/admin`). It shows:

- **Overview**: accounts, sign-ups, active accounts, lookups, rate-limited requests and failed sign-ins, today and
  for the last 30 days, with the newest accounts and the heaviest users today.
- **Accounts**: every account with where it signed up from (IP address and browser), when it was last active, its
  saved checks, and its lookups and rate-limited requests over the last week. Search by name, email or IP address,
  and sort by usage to find whoever is hammering the service.
- **An account**: its sessions, 30 days of usage by kind, and its activity. From here the admin can **suspend** it
  (signed out everywhere at once, and no sign-in or checks until reactivated), **sign it out everywhere**, or
  **unlock** sign-in after too many wrong passwords.
- **Activity**: a log of sign-ups, sign-ins, failed and blocked attempts, and admin actions, kept for a year.

A switch at the top **pauses new sign-ups**, for when sign-ups themselves are being abused; existing accounts
keep working.

There is one super admin, set by `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`. The API creates that account when
it starts, and the password in the environment is always the one that works: if someone registered that address
first, the start-up takes the account back, replaces its password, and ends its sessions. Changing the email makes
the old super admin an ordinary account.

## Look and feel

The colours are MSU-IIT's maroon and gold, in the shades the institute's own website uses: maroon `#941A1E`
(dark `#7E0108`, deep `#640000`) and gold `#F3D558`. They are defined once, as variables at the top of
`apps/web/src/styles.css`, together with the type (Inter for the interface, Source Serif 4 for headings and for
reading) and the spacing. The same stylesheet is inlined into downloaded reports.

Every icon is from Lucide; the interface uses no emoji and no symbol characters as icons. The logo is Lucide's
search-check glyph in a maroon and gold seal ("siyasat" means to look into something closely):
`apps/web/src/components/Logo.tsx` draws it, and `apps/web/public/logo.svg` and `favicon.svg` are the same
drawing as files. `apps/web/public/og.jpg` (1200×630) is the picture shown when a link to the site is shared.

## Run it locally

You need Node 22 or newer, pnpm, and Docker (for Postgres).

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # then set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD, CONTACT_EMAIL,
                                         # and OPENALEX_API_KEY if you have one
pnpm db:up                               # Postgres on localhost:5433
pnpm db:migrate                          # create the tables
pnpm dev                                 # API on :3000, web on :5173
```

Open http://localhost:5173 and create an account, or sign in as the super admin. The web dev server passes
`/api` requests on to the API.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the API and the web app, rebuilding on change |
| `pnpm build` | Build core, API and web for production |
| `pnpm start` | Apply database migrations, then run the built API (which serves the built web app) |
| `pnpm test` | Run the core and API tests |
| `pnpm typecheck` | Type-check all three packages |
| `pnpm db:migrate` | Create and apply a migration after changing `apps/api/prisma/schema.prisma` |

## Settings

The API reads these from the environment (`apps/api/.env` in development).

| Variable | Needed | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `PORT` | no | Port to listen on. Defaults to 3000 |
| `CONTACT_EMAIL` | recommended | Sent to Crossref and OpenAlex as `mailto`. Crossref allows about three times as many requests per second with it. Unpaywall requires it, so without it the reader finds fewer free PDFs |
| `OPENALEX_API_KEY` | recommended | Free key from [openalex.org](https://openalex.org). Since February 2026 OpenAlex refuses most title searches without one, and Siyasat then relies on Crossref alone |
| `SEMANTIC_SCHOLAR_API_KEY` | no | Raises the rate limit for abstracts from Semantic Scholar |
| `PUBLIC_URL` | no | The site's public address, used in link previews. Without it, the address each page was requested on is used |
| `SUPER_ADMIN_EMAIL` | recommended | The super admin's email address. Without it nobody can open the admin dashboard |
| `SUPER_ADMIN_PASSWORD` | with the email | The super admin's password, at least 12 characters. Change it here and restart to change it |
| `STATS_TIMEZONE` | no | The time zone the admin dashboard counts days in. Defaults to `Asia/Manila` |

## Tests

`packages/core/test/legacy-parity.test.ts` checks the TypeScript engine against recorded output of the original
browser-only version of Siyasat (`test/fixtures/legacy-golden.json`), including the Crossref and OpenAlex
responses it saw. A change that alters a verdict fails there, so it has to be deliberate; the few places where
the engine now does better than the original on purpose are named in that file with the reason.

`packages/core/test/citation-styles.test.ts` covers reading, checking and writing each citation style, for
each kind of work. `casing.test.ts` and `journals.test.ts` cover capitalisation and journal abbreviation, with
the hard cases: names, abbreviations, titles in capitals, titles not in English, and what is lost when there
is no abstract.

## Deploying

The repository deploys to Railway as one service plus a Postgres database. `Dockerfile` builds all three
packages; the container applies database migrations and starts the API, which serves the web app. `railway.json`
tells Railway to use the Dockerfile and to wait for `/api/health` before sending traffic.

```sh
railway up        # build and deploy the current directory
railway logs      # follow the service's logs
```

The service needs `DATABASE_URL` (set it to `${{Postgres.DATABASE_URL}}`), `NODE_ENV=production`,
`SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`, and the optional settings above. In production the session cookie
is marked Secure, so the site must be served over HTTPS (Railway does this).

## API

Every route is under `/api`. All but the health check and the first three auth routes need a signed-in session
(the cookie the sign-in routes set), and the `/admin` routes need the super admin.
`packages/core/src/api.ts` has the request and response types.

| Route | Purpose |
| --- | --- |
| `GET /health` | Is the service up and the database reachable |
| `GET /auth/config` | Whether new sign-ups are open |
| `POST /auth/signup` | Create an account and sign in |
| `POST /auth/signin`, `POST /auth/signout` | Sign in; sign out |
| `GET /auth/me` | The signed-in account |
| `POST /verify` | Check one reference |
| `POST /draft/source` | Check one source cited in a draft, and fetch its abstract |
| `GET /enrich?doi=` | Venue and open-access details for a DOI |
| `POST /journals/abbreviations` | The NLM Catalog's abbreviations for journals, by ISSN |
| `GET /fulltext?doi=` | A free full text for a DOI, when one exists |
| `GET /checks` | Summaries of the workspace's saved checks |
| `GET`, `PUT`, `PATCH`, `DELETE /checks/:id` | Read, save, change, or delete one check |
| `POST /checks/:id/results` | Add results to a check, or replace the ones at the same positions |
| `DELETE /checks`, `POST /checks/restore` | Delete every check; bring deleted checks back (for Undo) |
| `GET /admin/overview` | The admin dashboard's numbers and 30-day series |
| `GET /admin/users`, `GET /admin/users/:id` | Accounts, with usage; one account in full |
| `POST /admin/users/:id/suspend`, `/reactivate`, `/unlock`, `/sign-out` | Act on an account |
| `GET /admin/events` | The activity log |
| `GET`, `PUT /admin/settings` | Whether new sign-ups are open |
