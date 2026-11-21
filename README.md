<img src="apps/web/public/logo.svg" alt="Siyasat, citation checker" width="236">

# Siyasat

Siyasat checks whether the references in a paper are real, correct, and not retracted. It looks each one up in
Crossref and OpenAlex, shows what differs from the official record, and builds a corrected bibliography.
A draft check puts each cited sentence next to its source's abstract, so the author can judge whether the source
supports it.

## Set this up on Railway

People who open the site see a landing page first. They can ask for an account, but they cannot use the checker
until you approve them. You approve them from an **Admin** page after you log in.

Do these steps **before** you merge or redeploy. If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are missing, the new
version refuses to start, and Railway keeps the previous version running.

1. Open [Railway](https://railway.com), then your Siyasat project, then the service that is already live (the web app, not the database).
2. Open **Variables**.
3. Add `ADMIN_EMAIL`. Set it to the email address you will use to log in.
4. Add `ADMIN_PASSWORD`. Set it to a password only you know, at least 12 characters. This is the password for that email. If you later forget it, change this variable and redeploy: the password updates to match.
5. Leave the database as it is. Accounts and saved checks live in the Postgres database you already attached. You do not add a disk volume. `DATABASE_URL` should already be set to your Postgres plugin (it looks like `${{Postgres.DATABASE_URL}}`, with the real name of that database service). If a deploy says the database is missing, set `DATABASE_URL` to that value and nothing else.
6. Do not delete `CONTACT_EMAIL`, `OPENALEX_API_KEY`, or `NODE_ENV` if they are already there. The checker uses them.
7. Redeploy. Merging this into the branch Railway deploys (today that is `fullstack-app`) does it. Railway updates the database tables on its own, then starts the site.
8. Open the site. You should see the landing page, not the checker. Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. In the sidebar, open **Admin**.
9. When someone uses **Request access**, they show up under **Waiting**. Click **Approve**. They can then log in and use the checker. **Reject** turns a request down. **Revoke** takes access away from someone you already approved.

Until you approve someone, they can log in but only see a message that says they are waiting for approval. The checker, and the addresses the checker calls (for example `/api/verify` and `/api/checks`), answer "no" to them.

Checks saved before accounts existed were tied to the browser, not to an email, so they do not show up after you log in. New checks are saved on the account.

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

Signing in is a real account. The password is stored only as a scrypt hash. The browser keeps a random session
id in an httpOnly cookie (secure when `NODE_ENV` is production), and the database stores only the hash of that
id. A new account is `pending` until an admin approves it. Pending and rejected accounts can log in, and then
only see that they are waiting for approval. The checker routes refuse them with HTTP 403. The first admin is
created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` when the server starts.

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
cp apps/api/.env.example apps/api/.env   # then set CONTACT_EMAIL, and OPENALEX_API_KEY if you have one
pnpm db:up                               # Postgres on localhost:5433
pnpm db:migrate                          # create the tables
pnpm dev                                 # API on :3000, web on :5173
```

Open http://localhost:5173. The web dev server passes `/api` requests on to the API.

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
| `ADMIN_EMAIL` | yes, in production | The owner's login email. The server will not start in production without it |
| `ADMIN_PASSWORD` | yes, in production | The owner's password, at least 12 characters. Changing it and restarting the server resets the password and signs the owner out |

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
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the optional settings above. The plain-language steps are at the top of
this file, under "Set this up on Railway".

Accounts are rows in the same Postgres database as the checks (`users` and `sessions`). Railway keeps that
database when the app restarts or redeploys, so you do not mount a volume for them.

## API

Every route is under `/api`. The checker routes need the session cookie of an **approved** account. Sending
`Authorization: Bearer` no longer works. `packages/core/src/api.ts` has the request and response types.

| Route | Who can call it | Purpose |
| --- | --- | --- |
| `GET /health` | anyone | Is the service up and the database reachable |
| `POST /auth/signup` | anyone | Create a pending account and sign them in |
| `POST /auth/login` | anyone | Sign in. Pending and rejected accounts get a session, but not the checker |
| `POST /auth/logout` | anyone | End the session |
| `GET /auth/me` | anyone | The signed-in account, or `{ "user": null }` |
| `GET /admin/users` | owner | List accounts |
| `POST /admin/users/:id/approve` | owner | Let this person use the checker |
| `POST /admin/users/:id/reject` | owner | Turn down a request |
| `POST /admin/users/:id/revoke` | owner | Take access away |
| `POST /verify` | approved account | Check one reference |
| `POST /draft/source` | approved account | Check one source cited in a draft, and fetch its abstract |
| `GET /enrich?doi=` | approved account | Venue and open-access details for a DOI |
| `POST /journals/abbreviations` | approved account | The NLM Catalog's abbreviations for journals, by ISSN |
| `GET /fulltext?doi=` | approved account | A free full text for a DOI, when one exists |
| `GET /checks` | approved account | Summaries of the account's saved checks |
| `GET`, `PUT`, `PATCH`, `DELETE /checks/:id` | approved account | Read, save, change, or delete one check |
| `POST /checks/:id/results` | approved account | Add results to a check, or replace the ones at the same positions |
| `DELETE /checks`, `POST /checks/restore` | approved account | Delete every check; bring deleted checks back (for Undo) |
