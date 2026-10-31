// Drishti - Netlify Function: /.netlify/functions/analyze
// Input (POST JSON): { image (base64 jpeg), mode, lang, question }
// Output: { text }
// Env vars: GEMINI_API_KEY  (or ANTHROPIC_API_KEY as backup), optional GEMINI_MODEL

const LN = {
  en: "English (simple spoken English)",
  hi: "Hindi in Devanagari script (simple spoken Hindi, no English words unless needed)",
  pa: "Punjabi in Gurmukhi script (simple spoken Punjabi)"
};

const BASE =
  "You are Drishti, a voice assistant for a blind person. Your answer will be read aloud, so: " +
  "use short, plain sentences; no markdown, no bullet symbols, no emojis; max 5 sentences. " +
  "Describe positions using simple words like left, right, ahead, near, far, or clock directions. " +
  "Never guess. If the photo is too dark, blurry, cut off or you cannot read something clearly, " +
  "begin your answer with the exact word RETRY: and then tell the person how to take a better photo " +
  "(for example: hold the phone steady, move closer, add light, show the full label).";

const P = {
  around:
    BASE + " TASK: Describe the surroundings. FIRST mention any danger (stairs, steps, holes, vehicles, " +
    "water, wet floor, open flame, obstacles at head or foot level) with direction and rough distance. " +
    "If there is a danger, start the answer with the word Warning. " +
    "Then mention doors, people and main objects. Do NOT say the path is safe or clear; instead end by " +
    "saying to be careful and not to rely only on this app.",
  bus:
    BASE + " TASK: Read bus numbers, destination and any route name or sign visible. " +
    "Say the bus number first, then the destination. If several buses or signs are visible, " +
    "list each with its position (left, centre, right). If it is a road or shop sign, read the text.",
  med:
    BASE + " TASK: This is a medicine strip, bottle or box. Read ONLY what is printed: the medicine name, " +
    "strength, expiry date, and any printed warning. Say clearly if the medicine is expired. " +
    "Do NOT give advice about dose, when to take it, or whether it is safe. " +
    "End with: please confirm with a pharmacist or doctor before taking any medicine.",
  food:
    BASE + " TASK: This is a packaged food label. Tell: product name, whether the green dot (vegetarian) " +
    "or the brown/red dot (non-vegetarian) mark is visible, MRP or price, expiry or best before date, " +
    "and any allergen warning. If you cannot clearly see the veg or non-veg mark, say that it is not clear. " +
    "Never guess the veg or non-veg status.",
  find:
    BASE + " TASK: The person is looking for a specific thing (given as the question). " +
    "Say whether you can see it. If yes, tell where it is (left, right, ahead, high, low) and how far, " +
    "in steps if possible. If not visible, say so and suggest turning slowly and trying again.",
  appliance:
    BASE + " TASK: This is a home appliance such as a washing machine, microwave or similar. " +
    "Describe the control panel: name each visible button, knob or display text in order from left to right, " +
    "top to bottom, and where the start or power button is. Read any display text. " +
    "If the person asks a question, answer it using only what is visible.",
  color:
    BASE + " TASK: Tell the main colour of the object in the centre of the photo in simple words. " +
    "Also mention a second colour or a pattern if present.",
  read:
    BASE + " TASK: Read all the readable text in the photo aloud in a natural order, exactly as written. " +
    "Do not add comments. If the text is in several languages, read each part. " +
    "If it is a bill or form, read the important items and the total."
};

function reply(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(obj)
  };
}

function detectMime(b64) {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

let MODEL_CACHE = null;

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// Ask Google which models THIS key can really use, newest flash first.
async function listModels() {
  if (MODEL_CACHE) return MODEL_CACHE;
  const out = [];
  if (process.env.GEMINI_MODEL) out.push(process.env.GEMINI_MODEL);
  const tm = withTimeout(6000);
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
      signal: tm.signal
    });
    const j = await r.json().catch(() => ({}));
    const bad = /(image|tts|live|embed|audio|robotics|computer|learnlm|gemma|aqa|imagen|veo|exp-)/i;
    const list = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => /^gemini/i.test(n) && !bad.test(n));
    const ver = (n) => {
      const m = n.match(/gemini-(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : 0;
    };
    const score = (n) =>
      (/flash/i.test(n) ? 100 : 0) +
      (/lite/i.test(n) ? -20 : 0) +
      (/pro/i.test(n) ? 40 : 0) +
      (/preview/i.test(n) ? -5 : 0) +
      (/latest/i.test(n) ? 2 : 0) +
      ver(n) * 3;
    list.sort((x, y) => score(y) - score(x));
    for (const n of list) if (!out.includes(n)) out.push(n);
  } catch (e) {
    console.error("listModels failed", e.message);
  } finally {
    tm.done();
  }
  for (const n of ["gemini-flash-latest", "gemini-2.0-flash"]) if (!out.includes(n)) out.push(n);
  MODEL_CACHE = out;
  console.log("Gemini candidates:", out.slice(0, 6).join(", "));
  return out;
}

async function callGemini(prompt, image) {
  const started = Date.now();
  const models = (await listModels()).slice(0, 5);
  let lastErr = "";
  for (const model of models) {
    if (Date.now() - started > 20000) break; // stay under the function time limit
    const tm = withTimeout(14000);
    try {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        signal: tm.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: detectMime(image), data: image } }
              ]
            }
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 }
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        lastErr = model + ": " + ((j.error && j.error.message) || r.status);
        console.error("Gemini error", lastErr);
        if (r.status === 401 || r.status === 403) break; // key problem
        if (r.status === 400 && /API key/i.test(lastErr)) break;
        MODEL_CACHE = null; // re-list next time
        continue;
      }
      const parts =
        (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      const text = parts.map((p) => p.text || "").join(" ").trim();
      if (text) {
        // remember the working model first
        MODEL_CACHE = [model].concat((MODEL_CACHE || models).filter((m) => m !== model));
        return text;
      }
      lastErr = model + ": empty answer";
    } catch (e) {
      lastErr = model + ": " + (e.name === "AbortError" ? "timeout" : e.message);
      console.error(lastErr);
    } finally {
      tm.done();
    }
  }
  throw new Error("Gemini failed - " + lastErr);
}

async function callClaude(prompt, image) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: detectMime(image), data: image } },
            { type: "text", text: prompt }
          ]
        }
      ]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Claude: " + ((j.error && j.error.message) || r.status));
  return (j.content || []).map((c) => c.text || "").join(" ").trim();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });

  let b;
  try {
    b = JSON.parse(event.body || "{}");
  } catch (e) {
    return reply(400, { error: "Bad JSON" });
  }
  const { image, mode, lang, question } = b;

  // "ask" = follow-up question about the last photo
  const task = mode === "ask" ? P.read : P[mode];
  if (!image || !task) return reply(400, { error: "Missing image or mode" });

  let prompt;
  if (mode === "ask") {
    prompt =
      BASE +
      " TASK: Answer the person's question about this photo using only what is visible. " +
      "If the answer is not visible, say so.";
  } else {
    prompt = task;
  }
  prompt +=
    "\nAnswer language: " + (LN[lang] || LN.en) + "." +
    (question ? "\nPerson's question or what they are looking for: " + String(question).slice(0, 300) : "");

  try {
    let text;
    if (process.env.GEMINI_API_KEY) text = await callGemini(prompt, image);
    else if (process.env.ANTHROPIC_API_KEY) text = await callClaude(prompt, image);
    else return reply(500, { error: "No API key set in Netlify environment variables" });

    if (!text) return reply(502, { error: "Empty answer from model" });
    return reply(200, { text });
  } catch (e) {
    console.error(e);
    return reply(502, { error: String(e.message).slice(0, 300) });
  }
};
