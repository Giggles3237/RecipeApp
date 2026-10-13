const express = require('express');
const router = express.Router();
const recipeScraper = require('@brandonrjguth/recipe-scraper');
const OpenAI = require('openai');
const recipeModel = require('../models/recipeModel');
const categoryModel = require('../models/categoryModel');
const ingredientModel = require('../models/ingredientModel');
const measurementModel = require('../models/measurementModel');
const standardizationService = require('../services/standardizationService');
const ai = require('../services/aiRecipeService');
const { assertPublicUrl, fetchPublicPage, UnsafeUrlError } = require('../services/urlSafety');
const {
  toQuantity,
  extractRecipeFromJSONLD,
  stripHtmlToText,
  truncateText,
  dedupeArray,
  parseJsonArray,
} = require('../services/recipeParsing');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function serializeRecipe(r) {
  return {
    ...r,
    ingredients: parseJsonArray(r.ingredients),
    instructions: parseJsonArray(r.instructions),
    tags: parseJsonArray(r.tags),
  };
}

function sendError(res, err, fallbackMessage) {
  // OpenAI errors carry an HTTP status too, but their text can include part of the API key.
  // Translate them instead of passing them to the browser.
  if (err instanceof OpenAI.APIError) {
    console.error('OpenAI error:', err.status, err.message);
    const msg =
      err.status === 401
        ? "The server's OpenAI API key is invalid. Update OPENAI_API_KEY in the server settings."
        : err.status === 429
        ? 'OpenAI usage limit reached. Check billing/credits on platform.openai.com, then try again.'
        : 'The AI service had a problem. Please try again in a minute.';
    return res.status(502).json({ error: msg });
  }
  const status = err && err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(fallbackMessage, err);
  res.status(status).json({ error: status === 500 ? fallbackMessage : err.message });
}

// Simple per-IP limit on the endpoints that cost money (OpenAI calls).
const aiHits = new Map();
const AI_LIMIT = Number(process.env.AI_RATE_LIMIT || 30); // requests
const AI_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes
function aiRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const hits = (aiHits.get(key) || []).filter((t) => now - t < AI_WINDOW_MS);
  if (hits.length >= AI_LIMIT) {
    return res.status(429).json({ error: 'Too many AI requests. Please wait a few minutes.' });
  }
  hits.push(now);
  aiHits.set(key, hits);
  next();
}

function requireAI(req, res, next) {
  if (!ai.isEnabled()) {
    return res.status(503).json({ error: 'AI is not set up on the server (OPENAI_API_KEY missing).' });
  }
  next();
}

/* ------------------------------------------------------------------ */
/* Recipes CRUD                                                        */
/* ------------------------------------------------------------------ */

/* GET /api/recipes — list all recipes */
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await recipeModel.getAllRecipes();
    res.json(recipes.map(serializeRecipe));
  } catch (err) {
    sendError(res, err, 'Failed to retrieve recipes');
  }
});

/* GET /api/recipes/:id — get a single recipe */
router.get('/recipes/:id', async (req, res) => {
  try {
    const recipe = await recipeModel.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(serializeRecipe(recipe));
  } catch (err) {
    sendError(res, err, 'Error retrieving recipe');
  }
});

function validateRecipeBody(body) {
  const { title, ingredients, instructions } = body || {};
  if (!title || !String(title).trim()) return 'Title is required';
  if (!Array.isArray(ingredients)) return 'Ingredients must be a list';
  if (!Array.isArray(instructions)) return 'Instructions must be a list';
  return null;
}

/* POST /api/recipes — create a new recipe via JSON body */
router.post('/recipes', async (req, res) => {
  const problem = validateRecipeBody(req.body);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const { title, ingredients, instructions, tags, servings } = req.body;
    const newRecipe = await recipeModel.createRecipe({ title, ingredients, instructions, tags: tags || [], servings });
    res.status(201).json(newRecipe);
  } catch (err) {
    sendError(res, err, 'Failed to create recipe');
  }
});

/* PUT /api/recipes/:id — update a recipe */
router.put('/recipes/:id', async (req, res) => {
  const problem = validateRecipeBody(req.body);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const existing = await recipeModel.getRecipeById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Recipe not found' });
    const updated = await recipeModel.updateRecipe(req.params.id, {
      ...req.body,
      tags: req.body.tags || [],
      servings: req.body.servings || existing.servings,
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err, 'Failed to update recipe');
  }
});

/* DELETE /api/recipes/:id — delete a recipe */
router.delete('/recipes/:id', async (req, res) => {
  try {
    const result = await recipeModel.deleteRecipe(req.params.id);
    res.json(result);
  } catch (err) {
    sendError(res, err, 'Failed to delete recipe');
  }
});

/* POST /api/recipes/:id/scale — return a scaled copy (does not save) */
router.post('/recipes/:id/scale', async (req, res) => {
  const factor = parseFloat(req.body && req.body.scaleFactor);
  if (!Number.isFinite(factor) || factor <= 0 || factor > 100) {
    return res.status(400).json({ error: 'scaleFactor must be a number between 0 and 100' });
  }
  try {
    const recipe = await recipeModel.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    const parsed = serializeRecipe(recipe);
    parsed.ingredients = parsed.ingredients.map((i) => ({ ...i, quantity: toQuantity(i.quantity) }));
    res.json(standardizationService.scaleRecipe(parsed, factor));
  } catch (err) {
    sendError(res, err, 'Failed to scale recipe');
  }
});

/* ------------------------------------------------------------------ */
/* Recipe intake — every path ends in the same AI review step          */
/* ------------------------------------------------------------------ */

/* POST /api/recipes/ai — pasted recipe text */
router.post('/recipes/ai', aiRateLimit, requireAI, async (req, res) => {
  const text = req.body && String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Missing text field' });
  try {
    const extracted = await ai.extractRecipe({ text });
    res.json(await ai.buildReviewPayload(extracted, { source: 'text' }));
  } catch (err) {
    sendError(res, err, 'Failed to read that recipe text. Please try again.');
  }
});

/* POST /api/recipes/photo — one or more photos of a recipe (data URLs) */
const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/;
router.post('/recipes/photo', aiRateLimit, requireAI, async (req, res) => {
  const images = Array.isArray(req.body && req.body.images) ? req.body.images : [];
  if (!images.length) return res.status(400).json({ error: 'Add at least one photo.' });
  if (images.length > 4) return res.status(400).json({ error: 'Up to 4 photos per recipe.' });
  for (const img of images) {
    if (typeof img !== 'string' || !IMAGE_DATA_URL.test(img) || img.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Photos must be JPEG, PNG, WebP or GIF under about 6 MB each.' });
    }
  }
  try {
    const extracted = await ai.extractRecipe({ images });
    res.json(await ai.buildReviewPayload(extracted, { source: 'photo' }));
  } catch (err) {
    sendError(res, err, 'Failed to read the recipe from that photo. Try a clearer, well-lit shot.');
  }
});

/* POST /api/recipes/scrape — recipe from a web link */
router.post('/recipes/scrape', aiRateLimit, async (req, res) => {
  const { url, useAI = false } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    await assertPublicUrl(url);
    let extracted = null;

    // 1. Dedicated scraper library (fast, supports many big recipe sites)
    if (!useAI) {
      try {
        // The library can hang on some sites; give up after 20s and use the steps below
        const r = await Promise.race([
          recipeScraper(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('scraper timed out')), 20000)),
        ]);
        if (r && Array.isArray(r.ingredients) && r.ingredients.length) {
          extracted = {
            title: r.name || 'Untitled',
            ingredients: r.ingredients,
            instructions: r.instructions || [],
            tags: r.tags || [],
            servings: toQuantity(r.servings),
          };
        }
      } catch (scrapeErr) {
        console.warn('Scraper library failed, trying page data:', scrapeErr && scrapeErr.message);
      }
    }

    // 2. Structured recipe data embedded in the page (most recipe blogs have this)
    let pageHtml = null;
    if (!extracted) {
      pageHtml = await fetchPublicPage(url);
      extracted = extractRecipeFromJSONLD(pageHtml);
    }

    // 3. Let the AI read the page text
    if (!extracted) {
      if (!ai.isEnabled()) {
        return res.status(422).json({
          error: 'Could not find a recipe on that page. Try a screenshot with "From a photo" instead.',
        });
      }
      extracted = await ai.extractRecipe({ text: truncateText(stripHtmlToText(pageHtml), 20000) });
    }

    extracted.instructions = dedupeArray(extracted.instructions);
    res.json(await ai.buildReviewPayload(extracted, { sourceUrl: url, source: 'url' }));
  } catch (err) {
    if (err instanceof UnsafeUrlError) return res.status(400).json({ error: err.message });
    sendError(res, err, 'Failed to import a recipe from that link.');
  }
});

/* POST /api/recipes/review — run a hand-typed recipe through the same ingredient check */
router.post('/recipes/review', aiRateLimit, async (req, res) => {
  const { id, title, ingredients, instructions, tags, servings } = req.body || {};
  if (!Array.isArray(ingredients)) return res.status(400).json({ error: 'Ingredients must be a list' });
  try {
    res.json(
      await ai.buildReviewPayload(
        {
          title: title || 'Untitled',
          ingredients,
          instructions: Array.isArray(instructions) ? instructions : [],
          tags: Array.isArray(tags) ? tags : [],
          servings: toQuantity(servings),
        },
        { id: id || undefined, source: 'manual' }
      )
    );
  } catch (err) {
    sendError(res, err, 'Failed to check ingredients');
  }
});

/* POST /api/recipes/confirm — save recipe after review (creates, or updates when id is given) */
router.post('/recipes/confirm', async (req, res) => {
  try {
    const { id, title, ingredients, instructions, tags, servings, force = false } = req.body || {};

    if (!title || !Array.isArray(ingredients) || !Array.isArray(instructions)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const unreviewed = ingredients.filter((ing) => ing && ing.needsReview);
    if (!force && unreviewed.length > 0) {
      return res.status(400).json({ error: `Cannot save recipe with ${unreviewed.length} unreviewed ingredients` });
    }

    // Remember new ingredients and how they were written, so future imports stay consistent
    const learned = await ai.learnFromConfirmedIngredients(
      ingredients.filter((ing) => ing && String(ing.name || '').trim())
    );

    const cleanIngredients = learned.map((ing) => ({
      name: String(ing.name).trim(),
      quantity: toQuantity(ing.quantity),
      unit: String(ing.unit || '').trim(),
      category: ing.category && ing.category !== 'unknown' ? ing.category : 'other',
      modifier: String(ing.modifier || '').trim(),
      ingredientId: ing.ingredientId || null,
    }));

    const payload = {
      title: String(title).trim(),
      ingredients: cleanIngredients,
      instructions: dedupeArray(instructions),
      tags: dedupeArray(tags || []),
      servings: toQuantity(servings) || 4,
    };

    if (id) {
      const existing = await recipeModel.getRecipeById(id);
      if (!existing) return res.status(404).json({ error: 'Recipe not found' });
      return res.json(await recipeModel.updateRecipe(id, payload));
    }
    res.status(201).json(await recipeModel.createRecipe(payload));
  } catch (error) {
    sendError(res, error, 'Failed to save recipe');
  }
});

/* ------------------------------------------------------------------ */
/* Ingredients & measurements (with duplicate protection)              */
/* ------------------------------------------------------------------ */

/* GET /api/ingredients — get all ingredients */
router.get('/ingredients', async (req, res) => {
  try {
    const { category } = req.query;
    const ingredients = category
      ? await ingredientModel.getIngredientsByCategory(category)
      : await ingredientModel.getAllIngredients();
    res.json(ingredients);
  } catch (err) {
    sendError(res, err, 'Failed to retrieve ingredients');
  }
});

/* GET /api/ingredients/categories — get ingredient categories */
router.get('/ingredients/categories', async (req, res) => {
  try {
    res.json(await ingredientModel.getIngredientCategories());
  } catch (err) {
    sendError(res, err, 'Failed to retrieve ingredient categories');
  }
});

/* POST /api/ingredients/check — is this name a duplicate of something saved? */
router.post('/ingredients/check', aiRateLimit, async (req, res) => {
  try {
    res.json(await ai.checkDuplicate('ingredient', req.body && req.body.name));
  } catch (err) {
    sendError(res, err, 'Failed to check ingredient');
  }
});

/* POST /api/ingredients — create a new ingredient.
   Returns 409 with { duplicateOf } if it looks like an existing one, unless force: true. */
router.post('/ingredients', aiRateLimit, async (req, res) => {
  const { name, category, aliases, force = false } = req.body || {};
  const clean = String(name || '').toLowerCase().trim();
  if (!clean) return res.status(400).json({ error: 'Name is required' });
  try {
    const dup = await ai.checkDuplicate('ingredient', clean);
    if (dup.duplicateOf && (dup.exact || !force)) {
      return res.status(409).json({ error: 'Possible duplicate', ...dup });
    }
    const newIngredient = await ingredientModel.createIngredient({ ...req.body, name: clean, category: category || 'other', aliases });
    res.status(201).json(newIngredient);
  } catch (err) {
    sendError(res, err, 'Failed to create ingredient');
  }
});

/* POST /api/ingredients/:id/aliases — add another name for an existing ingredient */
router.post('/ingredients/:id/aliases', async (req, res) => {
  try {
    const updated = await ingredientModel.addAlias(req.params.id, req.body && req.body.alias);
    if (!updated) return res.status(404).json({ error: 'Ingredient not found' });
    res.json(updated);
  } catch (err) {
    sendError(res, err, 'Failed to add alias');
  }
});

/* GET /api/measurements — get all measurements */
router.get('/measurements', async (req, res) => {
  try {
    res.json(await measurementModel.getAllMeasurements());
  } catch (err) {
    sendError(res, err, 'Failed to retrieve measurements');
  }
});

/* POST /api/measurements — create a new measurement (409 if it duplicates an existing unit) */
router.post('/measurements', aiRateLimit, async (req, res) => {
  const { name, category, base_conversion, display_name, force = false } = req.body || {};
  const clean = String(name || '').toLowerCase().trim();
  if (!clean || !category || !Number.isFinite(Number(base_conversion))) {
    return res.status(400).json({ error: 'Name, category and conversion factor are required' });
  }
  try {
    const dup = await ai.checkDuplicate('unit', clean);
    if (dup.duplicateOf && (dup.exact || !force)) {
      return res.status(409).json({ error: 'Possible duplicate', ...dup });
    }
    const newMeasurement = await measurementModel.createMeasurement({
      ...req.body,
      name: clean,
      base_conversion: Number(base_conversion),
      display_name: display_name || clean,
    });
    res.status(201).json(newMeasurement);
  } catch (err) {
    sendError(res, err, 'Failed to create measurement');
  }
});

/* POST /api/measurements/:id/aliases — add another spelling for an existing unit */
router.post('/measurements/:id/aliases', async (req, res) => {
  try {
    const updated = await measurementModel.addAlias(req.params.id, req.body && req.body.alias);
    if (!updated) return res.status(404).json({ error: 'Measurement not found' });
    res.json(updated);
  } catch (err) {
    sendError(res, err, 'Failed to add alias');
  }
});

/* ------------------------------------------------------------------ */
/* Grocery list                                                        */
/* ------------------------------------------------------------------ */

/* POST /api/groceries — aggregated grocery list from selected recipe IDs */
router.post('/groceries', async (req, res) => {
  const { recipeIds, scaleFactor = 1, profileId = null } = req.body || {};
  if (!Array.isArray(recipeIds)) return res.status(400).json({ error: 'recipeIds must be an array' });
  const scale = parseFloat(scaleFactor) || 1;

  // Cache lookups for this request so each ingredient hits the DB once, not once per recipe
  const idCache = new Map();
  const categoryCache = new Map();
  async function ingredientIdFor(name) {
    const key = String(name || '').toLowerCase();
    if (!idCache.has(key)) {
      const found = await ingredientModel.findIngredientExact(key);
      idCache.set(key, found ? found.id : null);
    }
    return idCache.get(key);
  }
  async function categoryFor(ingredientId) {
    if (!categoryCache.has(ingredientId)) {
      const resolved = await categoryModel.resolveCategoryForIngredient(ingredientId, profileId);
      categoryCache.set(ingredientId, resolved && resolved.name ? resolved.name : null);
    }
    return categoryCache.get(ingredientId);
  }

  try {
    const groceries = {};
    for (const id of recipeIds) {
      const recipe = await recipeModel.getRecipeById(id);
      if (!recipe) continue;
      for (const item of parseJsonArray(recipe.ingredients)) {
        const key = `${(item.name || '').toLowerCase()}|${item.unit || ''}`;
        const qty = toQuantity(item.quantity);
        const scaledQuantity = qty === null ? null : qty * scale;

        let resolvedCategory = item.category || 'other';
        const ingredientId = item.ingredientId || (item.name ? await ingredientIdFor(item.name) : null);
        if (ingredientId) {
          const cat = await categoryFor(ingredientId);
          if (cat) resolvedCategory = cat;
        }

        const sourceEntry = { recipeTitle: recipe.title, modifier: item.modifier || null };
        if (!groceries[key]) {
          groceries[key] = {
            name: item.name,
            unit: item.unit,
            quantity: scaledQuantity,
            category: resolvedCategory,
            sources: [recipe.title],
            detailsBySource: [sourceEntry],
          };
        } else {
          const g = groceries[key];
          // "to taste" items (no quantity) stay without a number instead of becoming 0
          if (scaledQuantity !== null) g.quantity = (g.quantity || 0) + scaledQuantity;
          if (!g.sources.includes(recipe.title)) g.sources.push(recipe.title);
          g.detailsBySource.push(sourceEntry);
        }
      }
    }
    res.json(
      Object.values(groceries).map((g) => ({
        ...g,
        quantity: g.quantity === null ? null : Math.round(g.quantity * 1000) / 1000,
      }))
    );
  } catch (err) {
    sendError(res, err, 'Failed to generate grocery list');
  }
});

module.exports = router;
