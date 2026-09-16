# LogFinder

AI-powered Elasticsearch log search and analysis interface.

LogFinder is designed to help teams quickly inspect, filter, and analyze operational logs using a modern web interface and natural-language AI-assisted search. It connects to Elasticsearch in read-only mode and enables users to explore index patterns, time fields, filters, and log data without writing raw DSL manually.

## Features

- Elasticsearch index and field discovery
- Index pattern suggestions and view management
- Time-range, filter, and text-based searching
- AI-assisted natural language log querying
- Histogram and time-series insights
- Pagination for large result sets
- Visible-column selection for structured log views
- Support for corporate AI, OpenAI-compatible providers, Gemini, OpenRouter, and custom endpoints
- Local management of credentials and API keys in the browser

## Tech Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Zustand
- Elasticsearch REST API
- AI provider integration for enterprise and public models

## How It Works

LogFinder follows a simple operational flow:

1. The user defines an Elasticsearch profile and data view.
2. The application fetches index mappings and field capabilities.
3. The user searches within a date range using filters and text queries.
4. The AI assistant interprets the user request and prepares a safe Elasticsearch query plan.
5. The backend executes the query and returns results, totals, and histogram data.
6. Results are summarized and presented in the UI, with pagination support when needed.

## Project Structure

```text
.
├── app/
│   ├── api/
│   │   ├── ai/
│   │   │   └── chat/
│   │   └── es/
│   │       ├── defaults/
│   │       ├── fields/
│   │       ├── histogram/
│   │       ├── indices/
│   │       ├── search/
│   │       └── test/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ChatPanel.tsx
│   ├── Explorer.tsx
│   └── SettingsDialog.tsx
├── lib/
│   ├── ai-server.ts
│   ├── client.ts
│   ├── date-tr.ts
│   ├── defaults.ts
│   ├── es-server.ts
│   ├── store.ts
│   ├── theme.ts
│   └── types.ts
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── next-env.d.ts
├── README.md
└── READMETurkish.md
```

## Prerequisites

- Node.js 18+
- npm or yarn
- A running Elasticsearch cluster or reachable ES endpoint
- Access to an AI provider (corporate AI, OpenAI-compatible API, Gemini, OpenRouter, or a custom endpoint)

## Installation

1. Clone the repository:

```bash
git clone <repo-url>
cd LogFinder
```

2. Install dependencies:

```bash
npm install
```

3. Create your environment file:

```bash
copy .env.example .env.local
```

If `.env.example` does not exist, add the following values to `.env.local`:

```env
# Elasticsearch defaults (optional)
ELASTIC_URL=https://your-elasticsearch-host:9200
ELASTIC_USERNAME=your-username
ELASTIC_PASSWORD=your-password
ELASTIC_PATTERN=logs-*
ELASTIC_TIME_FIELD=@timestamp
DEFAULT_VIEW_PATTERNS=logs-*,app-logs-*,nginx-*,audit-*
DEFAULT_TIME_FIELD=@timestamp

# AI defaults (optional)
AI_BASE_URL=https://your-ai-endpoint
AI_USERNAME=your-username
AI_NODE_NAME=producer
AI_BOT=your-bot
AI_VERSION=latest
```

> Credentials are not stored in the repository. They are configured locally either in the settings UI or via `.env.local`.

4. Start the application:

```bash
npm run dev
```

The app runs on:

```text
http://localhost:3000
```

## Available Scripts

```bash
# Development mode
npm run dev

# Production build
npm run build

# Production server
npm run start

# Linting
npm run lint
```

## Usage

### 1. Configure the Elasticsearch Profile

- Open the settings dialog.
- Provide the Elasticsearch URL, username, password, or API key.
- Define the default index pattern and time field.

### 2. Create or Select a View

- Use the sidebar to create or switch between views.
- Edit the index pattern and time field.
- Save the view for future use.

### 3. Inspect Fields

- Browse the field list from the selected index.
- Toggle visible columns to focus on the most relevant log fields.
- Use field metadata to plan better searches and filters.

### 4. Search Using AI

Ask the assistant in natural language, for example:

- "Show ERROR logs from the last 2 hours"
- "Find nginx 5xx errors"
- "Analyze the busiest hours for application failures"
- "Search for timeout messages in level=ERROR"

The AI creates a controlled query, and the backend runs the search safely against Elasticsearch.

## Security Notes

- The system is intentionally read-only for Elasticsearch operations.
- Access is restricted to approved query endpoints.
- Mutation operations such as write requests are blocked by design.
- User credentials and API keys are managed in the browser and never embedded into the repository.
- `.env.local` should remain local and should not be committed to version control.

## Core Logic

- `lib/es-server.ts` contains the safe Elasticsearch client implementation.
- `buildBoolQuery()` standardizes time-based and boolean filters.
- `searchLogs()` uses search-after pagination to avoid loading excessive result volumes.
- `histogram()` delivers time-distribution data for analysis.
- `lib/ai-server.ts` orchestrates provider calls and builds the Elasticsearch query plan.

## Troubleshooting

### Elasticsearch connection error

- Verify `ELASTIC_URL` and credentials.
- Check network access to the Elasticsearch cluster.
- Validate the `insecure` configuration when using self-signed or internal certificates.

### AI response is not returned

- Check the AI provider base URL.
- Confirm the model name and API key.
- Verify the selected bot/version settings for the corporate AI provider.

### Index not found or pattern error

- Ensure the pattern is correct.
- Validate the indices using `_cat/indices`.
- Check `DEFAULT_VIEW_PATTERNS` and `ELASTIC_PATTERN` values.

## Recommended Next Improvements

- Add preset time ranges and advanced filter presets
- Improve column sorting and table-level filtering
- Add JSON pretty-printing and nested-field expansion in log output
- Capture search history and reusable query patterns for future sessions

## License

This project is intended for private use and internal development. Please confirm licensing terms with the project owner before deployment or redistribution.

## Contributing

Contributions, feature requests, and enhancements are welcome. Open a pull request or get in touch with the project maintainers.

---

LogFinder is built to provide rapid, secure, and AI-assisted log discovery for operations teams.
