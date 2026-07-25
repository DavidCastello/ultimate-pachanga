# Ultimate Pachanga
#
# Everyday commands. `npm run ...` still works for everything here; this file
# exists so the two ways of running the app are named rather than remembered:
#
#   make dev-local   against the Supabase stack on this machine
#   make dev         against the deployed database
#
# Which database the app talks to is decided entirely by Vite's mode and the
# env file that mode loads. `.env.cloud.local` outranks `.env.local`, so the
# cloud target genuinely replaces the local settings instead of inheriting
# whichever of them happens to be defined.

CLOUD_ENV := .env.cloud.local
LOCAL_ENV := .env.local

# One-off data loads for the deployed database. Deliberately not migrations;
# see supabase/production/README.md.
PROD_DIR := supabase/production
PROD_SCRIPTS := 01_roster 02_fixtures 03_results
LOCAL_DB_CONTAINER := supabase_db_ultimate-pachanga
LOCAL_KONG_CONTAINER := supabase_kong_ultimate-pachanga

.DEFAULT_GOAL := help

.PHONY: help install dev dev-local build preview lint format check test \
        test-watch coverage db-start db-stop db-status db-reset db-test \
        db-types verify prod-roster prod-fixtures prod-results prod-load \
        prod-dry-run

help: ## Show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

# ---------------------------------------------------------------------------
# Running the app
# ---------------------------------------------------------------------------

dev-local: ## Dev server against the local Supabase stack
	@test -f $(LOCAL_ENV) || { \
	  echo "Missing $(LOCAL_ENV)."; \
	  echo "Run 'cp .env.example $(LOCAL_ENV)', start the stack with"; \
	  echo "'make db-start', and fill it in from 'make db-status'."; \
	  exit 1; \
	}
	npm run dev

# Failing loudly matters here: without the file Vite would quietly fall back to
# .env.local and you would be editing the production league while believing you
# were on a scratch database.
dev: ## Dev server against the deployed database
	@test -f $(CLOUD_ENV) || { \
	  echo "Missing $(CLOUD_ENV) — no deployed database is configured yet."; \
	  echo ""; \
	  echo "Create it with the Supabase project's values:"; \
	  echo "  VITE_SUPABASE_URL=https://<ref>.supabase.co"; \
	  echo "  VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>"; \
	  echo "  VITE_APP_NAME=Roco Summer League"; \
	  echo ""; \
	  echo "Working locally? Use 'make dev-local' instead."; \
	  exit 1; \
	}
	npm run dev:cloud

build: ## Type-check and build to dist/
	npm run build

preview: ## Serve the production build
	npm run preview

# ---------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------

lint: ## ESLint
	npm run lint

format: ## Prettier, writing changes
	npm run format

check: ## Prettier and ESLint, check only
	npm run format:check
	npm run lint

test: ## Frontend tests once
	npm run test:run

test-watch: ## Frontend tests in watch mode
	npm test

coverage: ## Frontend tests with coverage
	npm run test:coverage

verify: check test db-test build ## Everything CI would run

# ---------------------------------------------------------------------------
# Database (local stack)
# ---------------------------------------------------------------------------

db-start: ## Start the local Supabase stack
	npm run db:start

db-stop: ## Stop it
	npm run db:stop

db-status: ## Print local URLs and keys
	npm run db:status

# The gateway restart is not optional housekeeping. `supabase db reset` replaces
# the auth container but leaves Kong routing to the old one's address, so every
# sign-in afterwards fails with a 502 and nothing in the app explains why. Doing
# it here means nobody has to remember.
db-reset: ## Recreate the database from migrations + the seed files
	npm run db:reset
	@docker restart $(LOCAL_KONG_CONTAINER) >/dev/null \
	  && echo "Gateway restarted — sign-in works again." \
	  || echo "Could not restart $(LOCAL_KONG_CONTAINER); sign-in may 502."

db-test: ## Run the pgTAP tests
	npm run db:test

db-types: ## Regenerate src/types/database.ts from the schema
	npm run db:types

# ---------------------------------------------------------------------------
# Production data (one-off loads)
#
# The real roster, fixtures and results. Run once, in order, against the
# deployed database. Everything here needs PROD_DB_URL — the database
# connection string, password included — which is a full-access credential and
# belongs in the shell, never in a file git tracks or a VITE_ variable.
#
# ON_ERROR_STOP is what makes these safe to chain: without it psql would carry
# on past a failed statement and report success.
# ---------------------------------------------------------------------------

# Exported rather than interpolated, and read as "$$PROD_DB_URL" below. Writing
# $(PROD_DB_URL) into a recipe pastes the password into a line the shell then
# evaluates, so a `$` in it expands to an undefined variable and psql receives a
# truncated password — reported as "password authentication failed", which sends
# you looking in entirely the wrong place. `export` also covers
# `make prod-load PROD_DB_URL=...`, which otherwise would not reach the recipe.
export PROD_DB_URL

define require_prod_db_url
	@test -n "$$PROD_DB_URL" || { \
	  echo "PROD_DB_URL is not set."; \
	  echo ""; \
	  echo "Take the connection string from the Supabase dashboard under"; \
	  echo "Project Settings > Database > Connection string > psql, then:"; \
	  echo "  export PROD_DB_URL='postgresql://...'"; \
	  echo ""; \
	  echo "Rehearsing against the local stack instead? Use 'make prod-dry-run'."; \
	  exit 1; \
	}
	@command -v psql >/dev/null || { \
	  echo "psql is not installed. On macOS:"; \
	  echo "  brew install libpq"; \
	  echo "  export PATH=\"/opt/homebrew/opt/libpq/bin:\$$PATH\""; \
	  exit 1; \
	}
endef

prod-roster: ## Load the real roster into the deployed database
	$(require_prod_db_url)
	psql "$$PROD_DB_URL" -v ON_ERROR_STOP=1 -f $(PROD_DIR)/01_roster.sql

prod-fixtures: ## Load the real matches and squads
	$(require_prod_db_url)
	psql "$$PROD_DB_URL" -v ON_ERROR_STOP=1 -f $(PROD_DIR)/02_fixtures.sql

# Requires the owner account to have registered: importing results goes through
# import_match_scores, which only administrators may call.
prod-results: ## Import the real match results
	$(require_prod_db_url)
	psql "$$PROD_DB_URL" -v ON_ERROR_STOP=1 -f $(PROD_DIR)/03_results.sql

prod-load: prod-roster prod-fixtures prod-results ## All three, in order

# `make db-reset` already runs these three as part of seeding, so this is not
# how you get the data locally — it is how you prove a *second* run corrects
# rather than duplicates, which is the property that makes them safe to re-run
# against production. Counts should be identical afterwards.
#
# Talks to the local container directly, so no psql and no PROD_DB_URL.
prod-dry-run: ## Re-run the production scripts locally to prove they are idempotent
	@docker ps --format '{{.Names}}' | grep -qx $(LOCAL_DB_CONTAINER) || { \
	  echo "The local stack is not running. Start it with 'make db-start'."; \
	  exit 1; \
	}
	@for script in $(PROD_SCRIPTS); do \
	  echo "==> $$script"; \
	  docker exec -i $(LOCAL_DB_CONTAINER) \
	    psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
	    < $(PROD_DIR)/$$script.sql || exit 1; \
	done
