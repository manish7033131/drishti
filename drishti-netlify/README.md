# Drishti on Netlify

Folder structure (keep exactly):
  index.html
  netlify.toml
  netlify/functions/analyze.js

## Deploy (CLI, recommended)
1. npm i -g netlify-cli
2. cd drishti-netlify
3. netlify login
4. netlify link        (choose your existing site: fastidious-cuchufli-7bf067)
5. netlify env:set GEMINI_API_KEY "your_key"      # OR: netlify env:set ANTHROPIC_API_KEY "your_key"
6. netlify deploy --prod

## Test the backend
Open the site, choose a language, tap any tile.
If you see an error, open browser console (F12) or Netlify > Functions > analyze > logs.

## If the Gemini model name errors
netlify env:set GEMINI_MODEL "model-name-from-ai.google.dev/gemini-api/docs/models"
netlify deploy --prod
