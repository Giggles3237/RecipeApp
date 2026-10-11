// AI-assisted recipe intake.
//
// Every way of adding a recipe (pasted text, web link, photo) goes through two steps:
//   1. extractRecipe   – read the source and pull out title / ingredient lines / steps / tags
//   2. normalizeIngredients – compare each ingredient line with what is already in the
//      database so the same thing always gets the same name and unit
//      ("2 cloves garlic", "garlic cloves", "clove garlic" -> 2 clove garlic).
//
// If OPENAI_API_KEY is not set or the AI call fails, step 2 falls back to the
// older rule-based matcher so imports still work.
const OpenAI = require('openai');
const ingredientModel = require('../models/ingredientModel');
const measurementModel = require('../models/measurementModel');
const categoryModel = require('../models/categoryModel');
const standardizationService = require('./standardizationService');
const { parseAIJson, toQuantity, convertIngredients, truncateText, dedupeArray } = require('./recipeParsing');

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) return null;
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}
function isEnabled() {
  return Boolean(getClient());
}
// For tests: inject a fake client
function _setClient(c) {
  client = c;
}
const model = () => process.env.OPENAI_MODEL || 'gpt-4o-mini';

async function callJSON(messages, { maxTokens = 4000 } = {}) {
  const ai = getClient();
  if (!ai) throw new Error('OPENAI_API_KEY is not set on the server.');
  const params = {
    model: model(),
    messages,
    max_completion_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };
  // Newer reasoning models only accept the default temperature
  if (/^gpt-4/.test(model())) params.temperature = 0;
  const completion = await ai.chat.completions.create(params);
  const content = (completion.choices[0].message.content || '').trim();
  return parseAIJson(content);
}

/* ------------------------------------------------------------------ */
/* Step 1: extract a recipe from text, page text, or photos            */
/* ------------------------------------------------------------------ */

const EXTRACT_PROMPT = `You read recipes from pasted text, web pages, or photos (cookbook pages, printed cards, handwritten cards, screenshots) and return ONLY a JSON object:
{
  "found": true,
  "title": "string",
  "servings": number or null,
  "ingredients": ["each ingredient line as written, e.g. 2 cloves garlic, minced"],
  "instructions": ["one step per item, without leading numbers like 'Step 1:'"],
  "tags": ["2-6 short lowercase tags: cuisine, meal type, main ingredient"],
  "notes": "anything unclear, e.g. 'bottom of the card is cut off', or empty string"
}
Rules:
- Only include what is actually in the source. Never invent ingredients, amounts, or steps.
- Drop sub-headings inside the ingredient list (e.g. "For the sauce:") but keep their ingredient lines.
- If a number is unreadable, keep the line and write "?" where the number was, and mention it in notes.
- Ignore ads, comments, nutrition panels, and navigation text on web pages.
- If there is no recipe in the input, return {"found": false, "notes": "short reason"}.`;

/**
 * @param {object} input
 * @param {string} [input.text]    pasted recipe text or page text
 * @param {string[]} [input.images] data URLs (data:image/jpeg;base64,...)
 */
async function extractRecipe({ text, images } = {}) {
  const content = [];
  if (text) content.push({ type: 'text', text: `Recipe source:\n\n${truncateText(text, 20000)}` });
  for (const url of images || []) {
    content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  }
  if (!content.length) throw new Error('Nothing to read.');
  if (images && images.length) {
    content.unshift({
      type: 'text',
      text: images.length > 1
        ? `These ${images.length} photos are pages of the same recipe, in order. Read them together.`
        : 'Read the recipe in this photo.',
    });
  }

  const data = await callJSON([
    { role: 'system', content: EXTRACT_PROMPT },
    { role: 'user', content },
  ]);

  if (data.found === false) {
    const err = new Error(data.notes ? `No recipe found: ${data.notes}` : 'No recipe found in that input.');
    err.status = 422;
    throw err;
  }
  const lines = (Array.isArray(data.ingredients) ? data.ingredients : [])
    .map((i) => (typeof i === 'string' ? i : ingredientToLine(i)))
    .filter(Boolean);
  return {
    title: String(data.title || 'Untitled').trim(),
    servings: toQuantity(data.servings),
    ingredients: lines,
    instructions: dedupeArray(Array.isArray(data.instructions) ? data.instructions : []),
    tags: dedupeArray((Array.isArray(data.tags) ? data.tags : []).map((t) => String(t).toLowerCase())),
    notes: data.notes || '',
  };
}

function ingredientToLine(i) {
  if (!i || typeof i !== 'object') return String(i || '').trim();
  if (i.original) return String(i.original);
  return [i.quantity, i.unit, i.name].filter((v) => v !== null && v !== undefined && v !== '').join(' ') +
    (i.modifier ? `, ${i.modifier}` : '');
}

/* ------------------------------------------------------------------ */
/* Step 2: make ingredients consistent with what is already saved      */
/* ------------------------------------------------------------------ */

async function loadCatalog() {
  const [ingredients, units] = await Promise.all([
    ingredientModel.getAllIngredients(),
    measurementModel.getAllMeasurements(),
  ]);
  let categories = [];
  try {
    categories = (await categoryModel.getAllCategories()).map((c) => c.name);
  } catch (_) {
    /* categories table may not exist yet */
  }
  categories = dedupeArray([...categories, ...ingredients.map((i) => i.category), 'other']);
  return { ingredients, units, categories };
}

function splitAliases(s) {
  return String(s || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
}

function buildLookup(catalog) {
  const byName = new Map();
  for (const ing of catalog.ingredients) {
    byName.set(ing.name.toLowerCase(), ing);
  }
  const byAlias = new Map();
  for (const ing of catalog.ingredients) {
    for (const a of splitAliases(ing.aliases)) if (!byName.has(a) && !byAlias.has(a)) byAlias.set(a, ing);
  }
  return {
    find(name) {
      const key = String(name || '').toLowerCase().trim();
      if (!key) return null;
      return byName.get(key) || byAlias.get(key) || null;
    },
  };
}

const NORMALIZE_PROMPT = `You standardize recipe ingredients for a personal recipe and grocery-list app.
Consistency is the whole point: the same product must always get the same name and unit, so grocery lists combine correctly and the ingredient list never fills up with near-duplicates.

You receive KNOWN_INGREDIENTS (canonical name [category] and alternate names), KNOWN_UNITS, CATEGORIES, and numbered LINES from one recipe.

Return ONLY JSON: {"items":[{"index":0,"quantity":2,"unit":"clove","name":"garlic","written":"garlic cloves","modifier":"minced","category":"vegetable","match":"garlic","note":""}]}

For each line, exactly one item, same index:
- quantity: a number. Convert fractions (1/2 -> 0.5, "1 1/2" -> 1.5, "½" -> 0.5). For a range use the lower number. null when there is none ("salt to taste") or it is unreadable ("?").
- unit: exactly one of KNOWN_UNITS, or "" when the item is simply counted (3 eggs, 1 onion). Map spellings and plurals to the known unit ("Tablespoons", "Tbsp", "T" -> "tbsp"; "t", "teaspoons" -> "tsp"; "cloves" -> "clove"; "lbs" -> "lb"). Only use a unit outside KNOWN_UNITS if nothing there fits.
- name: the product you would buy, short, lowercase, generic. Words that are really a unit belong in unit: "2 cloves garlic", "2 garlic cloves" and "2 clove garlic" all become unit "clove", name "garlic". Preparation, size and state go in modifier, not the name ("minced", "finely chopped", "large", "divided", "softened", "plus more for serving").
- written: the ingredient name as it was written in the line, without amounts or preparation (e.g. "garlic cloves", "extra-virgin olive oil").
- match: if the item is the same product as a KNOWN_INGREDIENT, set match AND name to that canonical name exactly as given. Otherwise null.
    Same product = a cook would buy the same thing at the store. If the written name appears in a known ingredient's alternate names, it is a match.
    Matches: "garlic cloves" -> "garlic"; "large eggs" -> "eggs"; "unsalted butter" -> "butter" when listed as an alternate.
    NOT matches (different products): "garlic powder" vs "garlic"; "green onions" vs "onion"; "chicken thighs" vs "chicken breast"; "brown sugar" vs "sugar"; "sweet potato" vs "potato"; "chicken broth" vs "chicken breast".
- category: one of CATEGORIES. For a match, use the known ingredient's category.
- note: a few words only when you changed something a person might question or you are unsure (e.g. "moved 'cloves' to unit", "unclear amount"). Otherwise "".`;

function formatCatalog(catalog) {
  const ingLines = catalog.ingredients
    .slice(0, 2000)
    .map((i) => {
      const aliases = splitAliases(i.aliases);
      return `- ${i.name} [${i.category}]${aliases.length ? ` (also: ${aliases.join(', ')})` : ''}`;
    })
    .join('\n');
  const unitLines = catalog.units
    .map((u) => (u.display_name && u.display_name !== u.name ? `${u.name} (${u.display_name})` : u.name))
    .join(', ');
  return `KNOWN_INGREDIENTS:\n${ingLines || '(none yet)'}\n\nKNOWN_UNITS: ${unitLines}\n\nCATEGORIES: ${catalog.categories.join(', ')}`;
}

/**
 * Standardize ingredient lines (strings or {quantity, unit, name, modifier} objects).
 * Returns { standardized: [...], reviewCount, aiAssisted, aiError? }
 * Each standardized item has the fields the confirmation dialog expects.
 */
async function normalizeIngredients(input) {
  const lines = (input || []).map((i) => (typeof i === 'string' ? i.trim() : ingredientToLine(i))).filter(Boolean);
  if (!lines.length) return { standardized: [], reviewCount: 0, aiAssisted: false };

  if (isEnabled()) {
    try {
      return await normalizeWithAI(lines);
    } catch (err) {
      console.error('AI ingredient normalization failed, using rule-based fallback:', err.message);
      const fallback = await normalizeWithoutAI(lines);
      return { ...fallback, aiError: err.message };
    }
  }
  return normalizeWithoutAI(lines);
}

async function normalizeWithAI(lines) {
  const catalog = await loadCatalog();
  const lookup = buildLookup(catalog);
  const numbered = lines.map((l, i) => `${i}: ${l}`).join('\n');

  const data = await callJSON(
    [
      { role: 'system', content: NORMALIZE_PROMPT },
      { role: 'user', content: `${formatCatalog(catalog)}\n\nLINES:\n${numbered}` },
    ],
    { maxTokens: 6000 }
  );
  const items = Array.isArray(data.items) ? data.items : [];
  const byIndex = new Map(items.map((it) => [Number(it.index), it]));

  const standardized = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const it = byIndex.get(i);
    if (!it || !it.name) {
      // Model skipped this line: handle it with the rule-based matcher
      const [fb] = (await normalizeWithoutAI([line])).standardized;
      standardized.push({ ...fb, aiNote: 'AI skipped this line; please check it.' });
      continue;
    }

    // Never trust the model's "match" blindly: it must be a real saved ingredient.
    let known = (it.match && lookup.find(it.match)) || lookup.find(it.name) || lookup.find(it.written);
    if (!known) known = await ingredientModel.findIngredientExact(it.name);

    const name = known ? known.name : String(it.name).toLowerCase().trim();
    const category = known
      ? known.category
      : catalog.categories.includes(it.category) ? it.category : 'other';

    const rawUnit = String(it.unit || '').trim();
    const unitData = rawUnit ? await measurementModel.findMeasurement(rawUnit) : null;
    const isNewUnit = Boolean(rawUnit && !unitData);
    const isNewIngredient = !known;

    standardized.push({
      quantity: toQuantity(it.quantity),
      unit: unitData ? unitData.name : rawUnit,
      unitData,
      name,
      modifier: String(it.modifier || '').trim(),
      category,
      ingredientId: known ? known.id : null,
      originalName: line,
      originalUnit: rawUnit,
      aliasCandidate: String(it.written || '').toLowerCase().trim() || null,
      aiNote: String(it.note || '').trim(),
      needsReview: isNewIngredient || isNewUnit,
      confidence: known ? 'high' : 'low',
      isNewIngredient,
      isNewUnit,
      ingredientExists: !isNewIngredient,
      unitExists: !isNewUnit,
    });
  }
  return {
    standardized,
    reviewCount: standardized.filter((s) => s.needsReview).length,
    aiAssisted: true,
  };
}

async function normalizeWithoutAI(lines) {
  const structured = convertIngredients(lines);
  const result = await standardizationService.standardizeIngredients(structured);
  const standardized = result.standardized.map((s, i) => ({
    ...s,
    modifier: structured[i].modifier || '',
    originalName: lines[i],
    aliasCandidate: (structured[i].name || '').toLowerCase().trim() || null,
  }));
  return { standardized, reviewCount: result.reviewCount, aiAssisted: false };
}

/* ------------------------------------------------------------------ */
/* Full pipeline used by every import route                            */
/* ------------------------------------------------------------------ */

async function buildReviewPayload(extracted, extras = {}) {
  const normalized = await normalizeIngredients(extracted.ingredients);
  return {
    title: extracted.title || 'Untitled',
    servings: extracted.servings || null,
    ingredients: normalized.standardized,
    instructions: dedupeArray(extracted.instructions),
    tags: extracted.tags || [],
    needsReview: normalized.reviewCount > 0,
    reviewCount: normalized.reviewCount,
    originalIngredients: extracted.ingredients,
    aiAssisted: normalized.aiAssisted,
    aiNotes: [extracted.notes, normalized.aiError && `AI matching unavailable (${normalized.aiError}); used basic matching.`]
      .filter(Boolean)
      .join(' '),
    ...extras,
  };
}

/* ------------------------------------------------------------------ */
/* After the user confirms: remember new ingredients and spellings     */
/* ------------------------------------------------------------------ */

/**
 * Saves new ingredients to the catalog and records how they were written as aliases,
 * so next time "garlic cloves" matches "garlic" instantly. Returns the ingredients with
 * ingredientId filled in. Never throws — learning must not block saving a recipe.
 */
async function learnFromConfirmedIngredients(ingredients) {
  const out = [];
  for (const ing of ingredients || []) {
    const name = String(ing.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!name) {
      out.push(ing);
      continue;
    }
    try {
      let known = await ingredientModel.findIngredientExact(name);
      if (!known) {
        try {
          known = await ingredientModel.createIngredient({
            name,
            category: ing.category && ing.category !== 'unknown' ? ing.category : 'other',
          });
        } catch (e) {
          // Probably created concurrently (unique name) — look it up again
          known = await ingredientModel.findIngredientExact(name);
        }
      }
      const alias = String(ing.aliasCandidate || '').toLowerCase().trim();
      if (known && alias && alias !== known.name.toLowerCase() && alias.length <= 60) {
        await ingredientModel.addAlias(known.id, alias);
      }
      out.push({ ...ing, name: known ? known.name : name, ingredientId: known ? known.id : null });
    } catch (err) {
      console.error(`Could not learn ingredient "${name}":`, err.message);
      out.push(ing);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Duplicate check when adding ingredients/units by hand (Admin page)  */
/* ------------------------------------------------------------------ */

const DUPLICATE_PROMPT = `You keep a recipe app's list of ingredients (or measurement units) free of duplicates.
Given a NEW entry and the KNOWN list, decide if NEW is the same thing as one KNOWN entry (just a different spelling, plural, size, preparation, or a word like "cloves" that is really a unit).
Different products are NOT duplicates ("garlic powder" vs "garlic", "green onion" vs "onion", "brown sugar" vs "sugar").
Return ONLY JSON: {"duplicateOf": "<exact KNOWN name>" or null, "reason": "few words"}`;

async function checkDuplicate(kind, newName) {
  const name = String(newName || '').toLowerCase().trim();
  if (!name) return { duplicateOf: null };

  if (kind === 'ingredient') {
    const exact = await ingredientModel.findIngredientExact(name);
    if (exact) return { duplicateOf: exact.name, id: exact.id, reason: 'already saved under this name or alias', exact: true };
  } else {
    const exact = await measurementModel.findMeasurement(name);
    if (exact) return { duplicateOf: exact.name, id: exact.id, reason: 'already a known unit', exact: true };
  }
  if (!isEnabled()) return { duplicateOf: null };

  const catalog = await loadCatalog();
  const known = kind === 'ingredient'
    ? catalog.ingredients.map((i) => `- ${i.name}${i.aliases ? ` (also: ${splitAliases(i.aliases).join(', ')})` : ''}`)
    : catalog.units.map((u) => `- ${u.name} (${u.display_name})`);
  try {
    const data = await callJSON(
      [
        { role: 'system', content: DUPLICATE_PROMPT },
        { role: 'user', content: `KIND: ${kind}\nNEW: ${name}\n\nKNOWN:\n${known.join('\n')}` },
      ],
      { maxTokens: 200 }
    );
    if (!data.duplicateOf) return { duplicateOf: null };
    const list = kind === 'ingredient' ? catalog.ingredients : catalog.units;
    const hit = list.find((x) => x.name.toLowerCase() === String(data.duplicateOf).toLowerCase());
    return hit ? { duplicateOf: hit.name, id: hit.id, reason: data.reason || '' } : { duplicateOf: null };
  } catch (err) {
    console.error('AI duplicate check failed:', err.message);
    return { duplicateOf: null };
  }
}

module.exports = {
  isEnabled,
  extractRecipe,
  normalizeIngredients,
  buildReviewPayload,
  learnFromConfirmedIngredients,
  checkDuplicate,
  _setClient,
};
