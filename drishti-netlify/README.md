# Drishti – AI Eyes for the Blind

Voice-first web app that helps blind and low-vision users understand
their surroundings. Point the camera, tap a button, and hear the answer
in Hindi, Punjabi or English.

## Features
- Around Me: describes the scene and warns about danger first
- Bus & Signs: reads boards and route numbers
- Medicine: reads name, expiry and warnings
- Food Label: veg/non-veg mark, expiry, MRP, allergens
- Find Thing: voice search for an object
- Appliance: describes buttons and dials
- Colour and Read Text
- Ask: follow-up questions by voice

## How it works
Camera photo -> Netlify serverless function (analyze.js) -> AI vision
model -> short spoken answer.

## Tech stack
HTML, CSS, JavaScript, Netlify Functions, Gemini / Claude vision API,
Web Speech API.

## Live demo
PASTE-YOUR-NETLIFY-LINK-HERE

## Team
Write your team members' names here

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
