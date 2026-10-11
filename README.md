# RecipeApp

Recipe manager with grocery lists and a meal planner. React front end (`client/`), Express + MySQL API (`server/`).

## How adding a recipe works

Every way of adding a recipe goes through the same AI review step before anything is saved:

1. **Read the source.** The source can be a **photo** (cookbook page, recipe card, screenshot; up to 4 pages), a **web link**, **pasted text**, or a recipe typed into the Add Recipe form.
2. **Check every ingredient against your saved list.** The AI compares each line with the ingredients and units already in the database and standardizes it. For example, "2 cloves garlic", "3 garlic cloves" and "1 clove garlic" all become *garlic*, unit *clove*. Prep words like "minced" move to a separate note. The AI keeps different products apart: "garlic powder" stays separate from "garlic".
3. **You review.** Matched items show what they were matched to. New ingredients and units are highlighted. You can edit anything.
4. **Save, and the app learns.** New ingredients are added to your list. The way an ingredient was written (e.g. "clove garlic") is saved as an alias, so the next import matches it right away.

On the **Admin** page, adding an ingredient or unit that duplicates one you already have (e.g. "garlic clove" when "garlic" exists) brings up a prompt. It offers to save the new name as an alias of the existing entry instead.

If the AI isn't configured or a call fails, imports still work using the older rule-based matching, and the review screen says so.

## Setup

```bash
# Server
cd server
cp .env.example .env      # fill in database + OpenAI settings
npm install
npm run dev               # http://localhost:5000

# Client (separate terminal)
cd client
cp .env.example .env      # REACT_APP_API_URL, defaults to http://localhost:5000/api
npm install
npm start                 # http://localhost:3000
```

On Netlify, set `REACT_APP_API_URL` under Site settings → Environment variables. Then add the Netlify site URL to the server's `ALLOWED_ORIGINS`.

`OPENAI_MODEL` must be a vision-capable model for photo import. The default is `gpt-4o-mini`.

## Security notes

- Credentials only go in `server/.env`, which git ignores. Never commit them; the repo is public.
- The server verifies the database's TLS certificate. Set `DB_SSL_REJECT_UNAUTHORIZED=false` only as a temporary workaround.
- Recipe links are only fetched from public addresses. Requests to localhost, private networks and cloud metadata are blocked.
- AI endpoints are rate-limited per IP (`AI_RATE_LIMIT`, default 30 per 10 minutes) to protect the OpenAI bill.

## Handy scripts (server folder)

- `node test-db-connection.js`: checks the database connection using `.env`
- `node check-data.js`: prints the first few saved recipes
