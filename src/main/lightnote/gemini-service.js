const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-2.5-flash';
const RATE_LIMIT_DELAY = 4000;

let genAI = null;
let lastRequestTime = 0;
let rateChain = Promise.resolve();

const SYSTEM_PROMPT = `You are a personal note assistant inside a scheduler app.
Answer the user's question using ONLY the provided note pages and the schedule context.

Rules:
1. Bold key concepts, important numbers, and key sentences with **markdown**.
2. If the answer is not in the notes/schedule, say "I couldn't find that in your notes." — do not invent.
3. Cite each fact inline with the source number, e.g. "The goal is X [1]. Two people were hired [2]."
4. Reuse the same number for the same source.
5. When the question is about the calendar, use the schedule context (today's date, upcoming events, open tasks).
6. Be concise and clear.`;

const ORGANIZE_SYSTEM_PROMPT = `You are a note-organizing expert. Restructure messy notes so they are clear and easy to read.

Rules:
1. Preserve all key information — never drop content.
2. Reorganize into a logical flow and topic order.
3. Use ## for subheadings.
4. Use - bullets for lists.
5. Bold key keywords and important points with **markdown**.
6. Remove redundancy and filler.
7. Output Markdown only (no HTML).`;

const WEB_SEARCH_SYSTEM_PROMPT = `You are a personal AI assistant inside a scheduler app.
Combine web search results with the user's personal notes and schedule for accurate, up-to-date answers.

Rules:
1. Bold key concepts, important numbers, and key sentences with **markdown**.
2. Cite each fact inline with a source number, e.g. [1], [2].
3. When personal notes or schedule context are provided, use them alongside the web information.
4. Be concise and clear.`;

/** Append the current date so the model can resolve "today / tomorrow / this week". */
function withDate(prompt) {
  return `${prompt}\n\nThe current date and time is ${new Date().toString()}.`;
}

function init(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

// Kept for API compatibility; history is no longer retained (single-shot queries).
function resetChat() { /* no-op */ }

/** Build the user message: optional schedule context + numbered note sources + question. */
function buildUserMessage(question, relevantFiles, extraContext) {
  const fileContext = relevantFiles
    .map((f) => `[Source ${f.name}]\n${f.content}`)
    .join('\n\n---\n\n');
  return [extraContext, fileContext, `Question: ${question}`]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

async function queryWithFiles(question, relevantFiles, onChunk, extraContext) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');
  await applyRateLimit();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: withDate(SYSTEM_PROMPT),
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.8 },
  });

  const userMessage = buildUserMessage(question, relevantFiles, extraContext);

  try {
    const result = await model.generateContentStream(userMessage);
    let fullText = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      if (onChunk) onChunk({ text, done: false });
    }
    if (onChunk) onChunk({ text: '', done: true });
    return { fullText };
  } catch (err) {
    throw mapError(err);
  }
}

async function queryWithWebSearch(question, relevantFiles, onChunk, extraContext) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');
  await applyRateLimit();

  const userMessage = buildUserMessage(question, relevantFiles, extraContext);

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: withDate(WEB_SEARCH_SYSTEM_PROMPT),
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    });

    const result = await model.generateContentStream(userMessage);
    let fullText = '';
    let webSources = [];
    let isGrounded = false;

    const absorb = (meta) => {
      if (!meta) return;
      if (meta.groundingSupports?.length) isGrounded = true;
      if (meta.groundingChunks?.length) {
        const found = meta.groundingChunks.filter((c) => c.web?.uri).map((c) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
        if (found.length) webSources = found;
      }
    };

    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      if (onChunk) onChunk({ text, done: false });
      absorb(chunk.candidates?.[0]?.groundingMetadata);
    }
    if (webSources.length === 0) {
      try { absorb((await result.response).candidates?.[0]?.groundingMetadata); } catch { /* ignore */ }
    }
    if (webSources.length === 0 && isGrounded) {
      webSources = [{ title: 'Answer grounded in Google Search', url: '' }];
    }

    if (onChunk) onChunk({ text: '', done: true });
    return { fullText, webSources };
  } catch (err) {
    if (err.message?.includes('tools') || err.message?.includes('googleSearch')) {
      console.warn('Web search unsupported, falling back to notes-only:', err.message);
      return queryWithFiles(question, relevantFiles, onChunk, extraContext);
    }
    throw mapError(err);
  }
}

async function organizeContent(pageTitle, pageText, onChunk) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');
  await applyRateLimit();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: ORGANIZE_SYSTEM_PROMPT,
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.8 },
  });

  const userMessage = `Reorganize the following note.\n\nTitle: ${pageTitle}\n\nContent:\n${pageText}`;

  try {
    const result = await model.generateContentStream(userMessage);
    let fullText = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullText += text;
      if (onChunk) onChunk({ text, done: false });
    }
    if (onChunk) onChunk({ text: '', done: true });
    return { fullText };
  } catch (err) {
    throw mapError(err);
  }
}

const EXTRACT_SYSTEM_PROMPT = `You extract concrete, actionable items from a note for a scheduler app.
Return ONLY valid JSON matching exactly this shape:
{
  "tasks":  [{ "title": string, "dueDate": "YYYY-MM-DD" | null, "priority": "urgent" | "normal" | "low" }],
  "events": [{ "title": string, "date": "YYYY-MM-DD", "start": "HH:MM" | null, "end": "HH:MM" | null }]
}
Rules:
- A "task" is a to-do (no fixed time). An "event" is something at a specific date/time (meeting, appointment).
- Resolve relative dates ("tomorrow", "next Monday") using the current date. If a date is unknown, use null (tasks) or omit the event.
- Only include clear action items actually present in the note. Do NOT invent.
- At most 12 tasks and 12 events. Keep titles short.
- Output JSON only — no prose, no markdown fences.`;

async function extractActions(text) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');
  await applyRateLimit();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: withDate(EXTRACT_SYSTEM_PROMPT),
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' },
  });

  try {
    const result = await model.generateContent(`Note:\n${text}`);
    let raw = result.response.text().trim();
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim(); // strip accidental fences
    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error('PARSE_FAILED');
    throw mapError(err);
  }
}

const BRIEF_SYSTEM_PROMPT = `You are a prep assistant inside a scheduler app.
Given a calendar item (an event or a task) and its linked notes, write a concise prep brief.

Rules:
1. Start with a one-line summary of what this item is about.
2. Then 3-6 bullet talking points / prep steps drawn from the linked notes.
3. If the notes contain open questions or action items, list them under "Open items".
4. If no notes are provided, give a short, generic prep checklist appropriate for this kind of item.
5. Use Markdown, bold key points, and keep it concise.`;

async function generateBrief(contextText) {
  if (!genAI) throw new Error('API_NOT_INITIALIZED');
  await applyRateLimit();

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: withDate(BRIEF_SYSTEM_PROMPT),
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048, topP: 0.8 },
  });

  try {
    const result = await model.generateContent(contextText);
    return { fullText: result.response.text() };
  } catch (err) {
    throw mapError(err);
  }
}

// Returns { ok } on success, or { ok:false, reason } where reason is
// 'INVALID_KEY' (the key is genuinely rejected) vs 'UNVERIFIED' (could not verify
// right now — network/region/quota). Callers should NOT block saving on UNVERIFIED.
async function testApiKey(apiKey) {
  try {
    const testAI = new GoogleGenerativeAI(apiKey);
    const model = testAI.getGenerativeModel({ model: MODEL_NAME });
    await model.generateContent('ping');
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message || err);
    const keyRejected = /API key not valid|API_KEY_INVALID|invalid api ?key|API key expired/i.test(msg)
      || (/\b400\b/.test(msg) && /API_KEY/i.test(msg));
    return { ok: false, reason: keyRejected ? 'INVALID_KEY' : 'UNVERIFIED', message: msg };
  }
}

function mapError(err) {
  if (err.message?.includes('429')) return new Error('RATE_LIMIT');
  if (err.message?.includes('API_KEY') || err.message?.includes('API key')) return new Error('INVALID_API_KEY');
  return err;
}

// Serialize calls so they never fire faster than the rate limit (real queue, not a race).
function applyRateLimit() {
  rateChain = rateChain.then(async () => {
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) await sleep(RATE_LIMIT_DELAY - elapsed);
    lastRequestTime = Date.now();
  });
  return rateChain;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

module.exports = { init, resetChat, queryWithFiles, queryWithWebSearch, organizeContent, extractActions, testApiKey };
