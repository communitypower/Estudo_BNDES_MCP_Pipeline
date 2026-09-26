---
name: naval-industry-data-pipeline
description: Extract structured data from naval industry Markdown reports and populate web portal databases. Use for processing COPPE/UFRJ shipbuilding studies, populating shipyard/dataset/document tables, uploading files to storage, and seeding Manus webdev projects with naval industry data. Also covers the full UFRJ/COPPETEC study workflow for naval industry restructuring.
---

# Naval Industry Data Pipeline

Pipeline for extracting structured data from naval industry technical reports (Markdown) and populating web portal databases with shipyards, datasets, documents, and media.

## When to Use

- Populating a naval industry portal with data from Markdown reports
- Extracting shipyard information, economic indicators, or production data from COPPE/UFRJ studies
- Seeding a Manus webdev project database with naval industry data
- Processing new batches of reports for an existing portal

## Workflow Overview

The pipeline follows 5 steps:

1. **Scan Markdown files** — Identify and catalog uploaded report files
2. **Extract in parallel** — Use `map` tool to extract structured data from each Markdown file
3. **Consolidate** — Deduplicate shipyards, merge datasets, add coordinates
4. **Seed database** — Run seed script to insert data and upload files to storage
5. **Verify** — Check portal displays correct counts and data

## Step 1: Scan Markdown Files

Run the scanner to catalog Markdown files:

```bash
python /home/ubuntu/skills/naval-industry-data-pipeline/scripts/extract_markdown_data.py /path/to/uploads/ /tmp/markdown-manifest.json
```

This produces a manifest JSON listing all Markdown files with paths and sizes.

## Step 2: Extract Data in Parallel

Use the `map` tool to process all Markdown files simultaneously. See `references/extraction-prompt.md` for the complete prompt template and output schema.

Key extraction targets per Markdown file:

| Target | Format | Example |
|---|---|---|
| Shipyards | JSON array with name, city, state, region, status, capacity | `[{"name":"Brasfels","city":"Angra dos Reis","state":"RJ",...}]` |
| Datasets | JSON array with title, category, period, data points | `[{"title_pt":"Custo MO","category":"economic","data":[...]}]` |
| Document metadata | Title, description, category | Used for documents table |

**Critical**: Each Markdown input must be wrapped in `<file>` tags in the map prompt template so the file is transferred to subtask sandboxes.

## Step 3: Consolidate Extracted Data

After `map` returns results:

1. **Parse JSON fields** — `shipyards_json` and `datasets_json` are stringified JSON; parse them.
2. **Deduplicate shipyards** — Same shipyard may appear across multiple volumes. Merge by name, keeping the most detailed description and capacity data.
3. **Add coordinates** — Geocode each shipyard using city + state. Common Brazilian shipyard coordinates:

```
Angra dos Reis, RJ → -23.0068, -44.3182
Niterói, RJ       → -22.8833, -43.1167
Rio de Janeiro, RJ → -22.8700, -43.2300
Itajaí, SC         → -26.9078, -48.6619
Manaus, AM         → -3.1190, -60.0217
Belém, PA          → -1.4558, -48.5024
Fortaleza, CE      → -3.7172, -38.5433
Guarujá, SP        → -23.9900, -46.2600
```

4. **Normalize dataset categories** — Map to: `trade`, `production`, `economic`, `statistics`.
5. **Normalize chart types** — Assign `line` (time series), `bar` (comparisons), or `table` (multi-column).

## Step 4: Seed Database

Copy and customize the seed template:

```bash
cp /home/ubuntu/skills/naval-industry-data-pipeline/templates/seed-data.mjs /path/to/project/seed-data.mjs
```

Populate the 4 data arrays (`SHIPYARDS`, `DATASETS`, `DOCUMENTS`, `MEDIA_ITEMS`) with consolidated data from Step 3, then run:

```bash
cd /path/to/project && pnpm add dotenv && node seed-data.mjs
```

### Key Technical Details

- **Use `sql` template literals** from `drizzle-orm` for parameterized queries. Raw `db.execute(string, params)` fails silently with drizzle's MySQL driver.
- **JSON columns**: Stringify data arrays before inserting: `JSON.stringify(d.data)`.
- **File upload**: The seed script uses Forge presigned URLs to upload documents to S3. Requires `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` env vars.
- **Idempotency**: The script does not check for duplicates. Clear tables before re-running, or add `ON DUPLICATE KEY` logic.

### Common Pitfall

```js
// ✗ WRONG — drizzle raw execute with positional params fails silently
await db.execute("INSERT INTO shipyards (namePt) VALUES (?)", ["Brasfels"]);

// ✓ CORRECT — use sql template literal
import { sql } from "drizzle-orm";
await db.execute(sql`INSERT INTO shipyards (namePt) VALUES ${"Brasfels"}`);
```

## Step 5: Verify

After seeding, check the portal:

1. Run `webdev_check_status` to capture a screenshot
2. Verify dashboard counters match expected totals
3. Spot-check a few shipyards on the map page
4. Verify document download links work
5. Save checkpoint with `webdev_save_checkpoint`

## Project Context

For the full UFRJ/COPPETEC study workflow (9 phases from planning to validation) and the complete database schema, see `references/project-context.md`.

## File Reference

| File | Purpose |
|---|---|
| `scripts/extract_markdown_data.py` | Scan Markdown directory and generate manifest |
| `templates/seed-data.mjs` | Seed script template with upload helper |
| `references/extraction-prompt.md` | Map tool prompt template and output schema |
| `references/project-context.md` | UFRJ/COPPETEC study phases and DB schema |
