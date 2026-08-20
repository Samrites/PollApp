# PollApp

PollApp is an Angular survey application for creating, publishing and evaluating polls. Users can create surveys with multiple questions, filter surveys by category, vote in active surveys and view live results. Finished surveys remain available for evaluation but cannot be voted on again.

## Features

- Create surveys in a modal with required and optional fields
- Default survey deadline of 30 days, with a custom date option
- Category filtering for active and past surveys, including an **All** option
- Highlight the three surveys ending soonest
- Vote in active surveys with single- or multiple-choice questions
- Live result updates through Supabase Realtime
- View past surveys without allowing new votes

## Development

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
ng serve
```

Open `http://localhost:4200/` in the browser.

## Production build

```bash
ng build
```

The production files are generated in the `dist/` directory.

## Backend

The project uses Supabase for survey storage, response statistics and realtime result updates. The Supabase URL and publishable key are configured in the Angular environment files.
