# Content Automation API

A Node.js application that provides content scraping and management with Supabase for data storage.

## Directory Structure

```
project/
├── src/
│   └── main.js          # Node.js/Express API server
├── test-request.js      # Script to test the API
├── package.json         # Node.js dependencies
├── .env                 # Environment variables
└── README.md           # Documentation
```

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - PORT (default: 3000)

3. Start the server:
```bash
npm run dev
```

4. Test the API:
```bash
node test-request.js
```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /api/content` - Create new content
- `GET /api/content` - Get content with optional type and status filters
- `GET /api/content/url/:url` - Get content by URL
- `POST /api/scrape` - Scrape content from a URL
- `GET /api/logs` - Get logs with optional filters
- `POST /api/logs` - Create new log entry

## Features

- Advanced content scraping with:
  - Intelligent content extraction using Readability
  - Markdown conversion with TurnDown
  - HTML sanitization
  - Metadata extraction (OpenGraph, meta tags)
  - Reading time estimation
  - Link and image extraction
- Content management with Supabase
- Automatic Markdown file generation
- Event logging
- Error handling and validation