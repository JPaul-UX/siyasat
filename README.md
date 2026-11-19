<img src="apps/web/public/logo.svg" alt="Siyasat, citation checker" width="236">

# Siyasat

Siyasat checks whether the references in a paper are real, correct, and not retracted. It looks each one up in
Crossref and OpenAlex, shows what differs from the official record, and builds a corrected APA 7 bibliography.
A draft check puts each cited sentence next to its source's abstract, so the author can judge whether the source
supports it.

## How it is built

| Part | Where | What it does |
| --- | --- | --- |
| Core | `packages/core` | The citation logic in plain TypeScript: parsing references, scoring matches, deciding verdicts, analysing drafts, reading library exports, writing exports. No network and no DOM, so the API and the web app share it. |
| API | `apps/api` | NestJS. Looks references up in the scholarly databases, and stores each workspace's checks in Postgres (Prisma). In production it also serves the built web app. |
| Web | `apps/web` | Vite + React. The interface. Uploaded PDFs and Word files are read in the browser; only their text is sent for checking. |

Lookups go through the API rather than straight from the browser so that API keys stay on the server, answers are
cached, and all users together stay inside each database's rate limit (`apps/api/src/upstream`).

There are no accounts. The first visit creates an anonymous workspace, and the browser keeps its token in local
storage. Whoever holds the token can read that workspace's checks, so clearing site data, or using another
browser, starts a new empty workspace.

## Look and feel

The colours are MSU-IIT's maroon and gold, in the shades the institute's own website uses: maroon `#941A1E`
(dark `#7E0108`, deep `#640000`) and gold `#F3D558`. They are defined once, as variables at the top of
`apps/web/src/styles.css`, together with the type (Inter for the interface, Source Serif 4 for headings and for
reading) and the spacing. The same stylesheet is inlined into downloaded reports.

Every icon is from Lucide; the interface uses no emoji and no symbol characters as icons. The logo is Lucide's
search-check glyph in a maroon and gold seal ("siyasat" means to look into something closely):
`apps/web/src/components/Logo.tsx` draws it, and `apps/web/public/logo.svg` and `favicon.svg` are the same
drawing as files.

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

## Tests

`packages/core/test/legacy-parity.test.ts` checks the TypeScript engine against recorded output of the original
browser-only version of Siyasat (`test/fixtures/legacy-golden.json`), including the Crossref and OpenAlex
responses it saw. A change that alters a verdict fails there, so it has to be deliberate.

## Deploying

The repository deploys to Railway as one service plus a Postgres database. `Dockerfile` builds all three
packages; the container applies database migrations and starts the API, which serves the web app. `railway.json`
tells Railway to use the Dockerfile and to wait for `/api/health` before sending traffic.

```sh
railway up        # build and deploy the current directory
railway logs      # follow the service's logs
```

The service needs `DATABASE_URL` (set it to `${{Postgres.DATABASE_URL}}`), `NODE_ENV=production`, and the
optional settings above.

## API

Every route is under `/api`. All but the first two need `Authorization: Bearer <workspace token>`.
`packages/core/src/api.ts` has the request and response types.

| Route | Purpose |
| --- | --- |
| `GET /health` | Is the service up and the database reachable |
| `POST /workspaces` | Start an anonymous workspace; answers with its token |
| `POST /verify` | Check one reference |
| `POST /draft/source` | Check one source cited in a draft, and fetch its abstract |
| `GET /enrich?doi=` | Venue and open-access details for a DOI |
| `GET /fulltext?doi=` | A free full text for a DOI, when one exists |
| `GET /checks` | Summaries of the workspace's saved checks |
| `GET`, `PUT`, `PATCH`, `DELETE /checks/:id` | Read, save, change, or delete one check |
| `POST /checks/:id/results` | Add results to a check, or replace the ones at the same positions |
| `DELETE /checks`, `POST /checks/restore` | Delete every check; bring deleted checks back (for Undo) |
