# Newly Done

## Scope
Whatever happens beyond this point should follow this workflow.

## Getting all docs pages
- Don't guess URLs manually.
- Docs sites like Wokwi Docs are structured, so extract links programmatically.
- Best method: use `sitemap.xml` (contains all pages).
- Alternative methods:
- Crawl site (recursive `<a href>` extraction)
- Parse sidebar/navigation
- Use DevTools JS snippet to grab links

## Key realization
- `/chips-api/spi` is just a route path.
- You get these via:
- sitemap
- crawling
- sidebar parsing
- Sitemap is complete structure, so no need to crawl further.

## Your actual goal (AI helper)
Not scraping. Build an AI-ready knowledge base.

## What data you actually need

### 1. Parts database (most important)
Source: `/parts/*`
Each page = one component
Extract:
- exact name (e.g., `wokwi-servo`)
- pins
- properties
- example usage/code

Use for:
- adding components
- correct wiring

### 2. Connection logic
Sources:
- `/diagram-format`
- `/chips-api/gpio`, `spi`, `i2c`, `uart`

Contains:
- wiring rules
- protocols
- pin behavior

Needed to prevent wrong connections.

### 3. Code patterns
Sources:
- `/guides/*`
- examples in parts pages

Extract only:
- snippets
- function usage

Ignore full text.

### 4. Custom components (advanced)
Sources:
- `/chips-api/*`
- `/guides/custom-chips-to-wasm`

Enables:
- custom chips
- virtual components (e.g., 9V battery)

Key data:
- `chip.json`
- attributes
- pin definitions

## What to ignore (waste tokens)
- `/faq`
- `/contributing/*`
- `/keyboard-shortcuts`
- `/search`

## Correct system design (important)

### Step 1: Preprocess to structured data
- `parts.json`
- `connections.json`
- `code_snippets.json`

### Step 2: Retrieval (RAG)
- Don't load everything.
- Fetch only relevant data per query.

Example:
- "add LED" -> load LED data + pin rules

### Step 3: Keep prompts small
- Send only needed info.
- Avoid full docs.

## Core insight
- Dumping docs -> generic AI
- Structured + selective retrieval -> tool-aware AI

## Copilot usage strategy
- Don't feed full sitemap.
- Provide:
- specific pages on demand
- or preprocessed summaries

Example:
- SPI -> `/chips-api/spi`
- Servo -> `/parts/wokwi-servo`
