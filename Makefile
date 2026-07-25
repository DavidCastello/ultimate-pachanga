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

.DEFAULT_GOAL := help

.PHONY: help install dev dev-local build preview lint format check test \
        test-watch coverage db-start db-stop db-status db-reset db-test \
        db-types verify

help: ## Show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

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

db-reset: ## Recreate the database from migrations + seed.sql
	npm run db:reset

db-test: ## Run the pgTAP tests
	npm run db:test

db-types: ## Regenerate src/types/database.ts from the schema
	npm run db:types
