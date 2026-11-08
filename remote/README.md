# Stockfolio remote research worker

Runs on a remote server; no browser or personal computer needs to stay open.
Cloudflare checks official public data once per Taipei 07:00 batch. This worker
polls every 15 minutes and waits until all sources and watched companies have
been checked in that batch. A failed source is reported separately; a batch
being complete does not mean every source succeeded.

The worker creates its own random device secret in a private remote directory. The approval URL contains only its SHA-256 fingerprint, not the secret.
Open the website approval URL returned by `/status`, sign in to Stockfolio, and
approve that specific remote service. The website stores only a hash. The device
can read watched tickers and public evidence and write analysis; it cannot read
personal notes, edit manual fields, or delete stocks. Website passwords and
provider credentials are never returned or copied between services. Device
authorization expires after 90 days and can be revoked at `/remote-connect`.

The chosen deployment is the owner's existing Omni remote machine. Set
`RESEARCH_ENGINE=codex` to reuse that machine's authenticated Codex CLI. No
credentials are copied to a new host and no API key is needed. Codex uses its
configured default model and its managed permission policy. Model requests count
against that account's allowance. A small real model connection probe succeeded;
this is not proof of a completed scheduled financial analysis.

`remote/server.mjs` is a long-running user process with an internal 15-minute
poll. Start it in a detached Omni session; no crontab, system service, Astra team
space or personal-computer process is required. It stays active only while that
Omni process and machine are running; after a machine restart, relaunch it. It
binds to localhost by default. `/status` distinguishes connection, website
authorization, public-data completion, model errors and successful research.

The optional API engine stays unused for this deployment. It requires explicit
provider configuration and credentials if chosen in the future.

Each pass claims at most two pending companies with a 20-minute lease. It
downloads readable official financial sources, submits one model request per
company, validates identity, period and citations, and writes only `analysis`.
Failures preserve the previous report. A deleted stock is not recreated, newer
manual research is not overwritten, and notes/revision updates are protected by
the website transaction. Unchanged filing evidence reuses the existing report;
quote or retrieval timestamp changes alone do not trigger a full re-analysis.

This first worker cannot perform a complete arbitrary-company valuation from
filing indexes alone. Missing documents, financial units, current prices,
consensus expectations or financial details must stay unknown. It does not
enable automatic macro interpretations or change the macro interface.

Build context is the repository root: `docker build -f remote/Dockerfile .`.
Use a private 1 GiB persistent volume at `/data`, HTTP health probe `/health`,
one replica, 100m CPU / 128 MiB request and 500m CPU / 512 MiB limit. Provider
quota and permissions are independent of website hosting and must be verified
before describing the system as automatic AI research.

Observed setup limitation: direct HTTPS from the agent environment and the
background probe to the website returned ECONNRESET, while the user reports that
the Omni desktop browser can open it. Do not claim automated research is live
until the background process actually reads an authorized work batch and writes
one validated result to the production website.
