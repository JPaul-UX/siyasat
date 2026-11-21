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

Visitors land on a public page. They log in, or they request access. A new account is **pending** until an admin
approves it. Pending and rejected accounts can log in, but they only see a waiting message: the checker and every
API route it uses refuse them. Passwords are hashed. The login is an httpOnly cookie the page script cannot read.

Each approved person has their own saved checks. Checks made before accounts existed were tied to a browser, not
to a person, and are not carried over.

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
cp apps/api/.env.example apps/api/.env   # then set CONTACT_EMAIL, ADMIN_EMAIL, ADMIN_PASSWORD, and OPENALEX_API_KEY if you have one
pnpm db:up                               # Postgres on localhost:5433
pnpm db:migrate                          # create the tables
pnpm dev                                 # API on :3000, web on :5173
```

Log in locally with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from that file. Leave them empty only if you are not testing approval. Production will not start without them.

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
| `ADMIN_EMAIL` | **yes in production** | The email you log in with. The app creates this admin account on startup |
| `ADMIN_PASSWORD` | **yes in production** | The password for that account. At least 8 characters. Changing it and restarting updates the password |

## Tests

`packages/core/test/legacy-parity.test.ts` checks the TypeScript engine against recorded output of the original
browser-only version of Siyasat (`test/fixtures/legacy-golden.json`), including the Crossref and OpenAlex
responses it saw. A change that alters a verdict fails there, so it has to be deliberate; the few places where
the engine now does better than the original on purpose are named in that file with the reason.

`packages/core/test/citation-styles.test.ts` covers reading, checking and writing each citation style, for
each kind of work. `casing.test.ts` and `journals.test.ts` cover capitalisation and journal abbreviation, with
the hard cases: names, abbreviations, titles in capitals, titles not in English, and what is lost when there
is no abstract.

## Railway: turn on logins

Do this **before** you merge and deploy. If these are missing, the new version will refuse to start.

Accounts and saved checks live in the Postgres database this app already uses. You do **not** add a disk volume,
and you do **not** create a second database. Postgres is the right place because the checker already stores its
results there, and Railway keeps that database when the app updates. A file on the server's disk would be wiped
on the next deploy.

### 1. Open the variables

In Railway, open the Siyasat service (the one that runs the website), then the **Variables** tab.

### 2. Add your login

| Variable | What to type |
| --- | --- |
| `ADMIN_EMAIL` | The email you will use to log in. Example: `you@example.com` |
| `ADMIN_PASSWORD` | A password you choose. At least 8 characters. This is your login password. Do not put it in the code. |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Should already be `${{Postgres.DATABASE_URL}}`. If it is empty, set it to exactly that, including the `${{ }}`. |

`CONTACT_EMAIL` and `OPENALEX_API_KEY` are unchanged. Keep them if they are already set. Crossref and OpenAlex work better with them.

### 3. Deploy

Merge the pull request, or redeploy the service after the variables are saved. Railway rebuilds the app. On startup it updates the database (new tables for accounts) and creates your admin login from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. You do not sign up for that account on the website.

If you later change `ADMIN_PASSWORD` in Railway and redeploy, your login password changes to the new one.

### 4. Approve people

1. Open the site and click **Log in**.
2. Enter the email and password from step 2.
3. In the left sidebar, click **Access**. On a phone, **Access** is in the top bar.
4. Under **Waiting for approval**, click **Approve**.

They can then log in and use the checker. **Reject** turns down a request. **Revoke** takes the checker away from someone you already approved. They can still log in, and they see "Waiting for approval" instead of the checker.

The app is one Railway service, same as before. `Dockerfile` builds it, applies database migrations, and starts the API, which also serves the website. `railway.json` tells Railway to use the Dockerfile and to wait for `/api/health` before sending traffic.

```sh
railway up        # build and deploy the current directory
railway logs      # follow the service's logs
```

## API

Every route is under `/api`. The checker routes require a logged-in, approved user. The browser sends the
httpOnly session cookie; there is no bearer token. `packages/core/src/api.ts` has the request and response types.

| Route | Who can call it | Purpose |
| --- | --- | --- |
| `GET /health` | anyone | Is the service up and the database reachable |
| `GET /auth/me` | anyone | The logged-in account, or `{ user: null }` |
| `POST /auth/signup` | anyone | Create a pending account and log them in |
| `POST /auth/login` | anyone | Log in. Pending and rejected accounts get a session but not the checker |
| `POST /auth/logout` | anyone | End the login |
| `GET /admin/users` | admin | List pending, approved, and rejected accounts |
| `POST /admin/users/:id/approve` | admin | Let this person use the checker |
| `POST /admin/users/:id/reject` | admin | Turn down a request |
| `POST /admin/users/:id/revoke` | admin | Take access away |
| `POST /verify` | approved | Check one reference |
| `POST /draft/source` | approved | Check one source cited in a draft, and fetch its abstract |
| `GET /enrich?doi=` | approved | Venue and open-access details for a DOI |
| `POST /journals/abbreviations` | approved | The NLM Catalog's abbreviations for journals, by ISSN |
| `GET /fulltext?doi=` | approved | A free full text for a DOI, when one exists |
| `GET /checks` | approved | Summaries of this person's saved checks |
| `GET`, `PUT`, `PATCH`, `DELETE /checks/:id` | approved | Read, save, change, or delete one check |
| `POST /checks/:id/results` | approved | Add results to a check, or replace the ones at the same positions |
| `DELETE /checks`, `POST /checks/restore` | approved | Delete every check; bring deleted checks back (for Undo) |
