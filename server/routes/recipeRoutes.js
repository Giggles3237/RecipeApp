const express = require('express');
const router = express.Router();
const { parse } = require('recipe-ingredient-parser-v3');
const recipeScraper = require('@brandonrjguth/recipe-scraper');
const OpenAI = require('openai');
const recipeModel = require('../models/recipeModel');
const Recipe = require('../models/recipeModel');
const categoryModel = require('../models/categoryModel');
const ingredientModel = require('../models/ingredientModel');

// Initialise OpenAI client with API key from .env
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/* Helper: extract metric quantity/unit (ml, l, g, kg) from a raw line, if present */
function extractMetricFromLine(rawLine) {
  if (!rawLine) return null;
  const line = String(rawLine);
  // Pattern 1: metric in parentheses e.g., "1 cup (240 ml)", "2 tbsp (30 ml)"
  const parenMetric = line.match(/\(([^)]*?)(\d+[\d\s\/.]*)(?:\s*)(ml|l|g|kg)\s*[^)]*\)/i);
  if (parenMetric) {
    const numStr = parenMetric[2].trim();
    const unit = parenMetric[3].toLowerCase();
    const qty = safeParseQuantity(numStr);
    if (!isNaN(qty)) return { quantity: qty, unit };
  }
  // Pattern 2: inline metric e.g., "240 ml milk", "200g sugar"
  const inlineMetric = line.match(/\b(\d+[\d\s\/.]*)\s*(ml|l|g|kg)\b/i);
  if (inlineMetric) {
    const numStr = inlineMetric[1].trim();
    const unit = inlineMetric[2].toLowerCase();
    const qty = safeParseQuantity(numStr);
    if (!isNaN(qty)) return { quantity: qty, unit };
  }
  return null;
}

/* Helper: parse numeric string that may contain fractions like 1/2 or "1 1/2" */
function safeParseQuantity(text) {
  const t = String(text).trim();
  // Mixed number e.g., "1 1/2"
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = parseFloat(mixed[1]);
    const num = parseFloat(mixed[2]);
    const den = parseFloat(mixed[3]);
    return whole + (den ? num / den : 0);
  }
  // Simple fraction e.g., "2/3"
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    return den ? num / den : NaN;
  }
  // Plain number
  const n = parseFloat(t.replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

/* Helper: convert an array of strings into structured ingredient objects */
function convertIngredients(list) {
  return list.map((line) => {
    try {
      // Parse ingredient lines using the parser library (English locale)
      const parsed = parse(line, 'eng');

      // Prefer metric units if present in the original line
      const metric = extractMetricFromLine(line);
      const quantity = metric ? metric.quantity : (parsed.quantity || null);
      const unit = metric ? metric.unit : (parsed.unit || '');

      return {
        quantity,
        unit,
        name: parsed.ingredient || line,
        modifier: parsed.comment || ''
      };
    } catch (err) {
      // If parsing fails, try metric only
      const metric = extractMetricFromLine(line);
      if (metric) {
        return { quantity: metric.quantity, unit: metric.unit, name: line, modifier: '' };
      }
      return { quantity: null, unit: '', name: line, modifier: '' };
    }
  });
}

// Helper: extract Recipe JSON-LD from HTML if present
function extractRecipeFromJSONLD(html) {
  try {
    const scripts = [];
    const re = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
      scripts.push(match[1]);
    }
    for (const block of scripts) {
      try {
        const json = JSON.parse(block.trim());
        const nodes = Array.isArray(json) ? json : (json['@graph'] || [json]);
        for (const node of nodes) {
          const type = node['@type'];
          const isRecipe = Array.isArray(type) ? type.includes('Recipe') : type === 'Recipe';
          if (isRecipe) {
            const title = node.name || node.headline || 'Untitled';
            const ing = node.recipeIngredient || [];
            // Instructions can be array of strings or Thing with .text
            let instructions = node.recipeInstructions || [];
            if (Array.isArray(instructions)) {
              instructions = instructions.map((i) => typeof i === 'string' ? i : (i.text || '')).filter(Boolean);
            } else if (typeof instructions === 'string') {
              instructions = [instructions];
            } else {
              instructions = [];
            }
            const keywords = node.keywords || [];
            const tags = Array.isArray(keywords) ? keywords : (typeof keywords === 'string' ? keywords.split(',').map(s => s.trim()) : []);
            return { title, ingredients: ing, instructions, tags };
          }
        }
      } catch (_) { /* ignore parse error for this block */ }
    }
  } catch (e) {
    console.error('extractRecipeFromJSONLD error:', e);
  }
  return null;
}

// Helper: strip HTML to plain text and truncate
function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function truncateText(text, maxChars = 15000) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/* Helper: scrape recipe from URL */
async function scrapeRecipeFromUrl(url) {
  try {
    const recipe = await recipeScraper(url);
    const structuredIngredients = convertIngredients(recipe.ingredients);
    const standardizationService = require('../services/standardizationService');
    const standardized = await standardizationService.standardizeIngredients(structuredIngredients);
    
    return {
      title: recipe.name || 'Untitled',
      ingredients: standardized.standardized,
      instructions: recipe.instructions,
      tags: recipe.tags || [],
      needsReview: standardized.reviewCount > 0,
      reviewCount: standardized.reviewCount,
      originalIngredients: recipe.ingredients,
      sourceUrl: url
    };
  } catch (error) {
    throw new Error(`Failed to scrape recipe: ${error.message}`);
  }
}

// Helper: fetch raw page text for AI fallback
async function fetchPageText(url) {
  try {
    const fetchFn = typeof fetch !== 'undefined' ? fetch : (await import('node-fetch')).default;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error('fetchPageText error:', e);
    throw e;
  }
}

function dedupeArray(arr) {
  return Array.from(new Set((arr || []).map((s) => (s || '').trim()).filter(Boolean)));
}

/* GET /api/recipes — list all recipes */
router.get('/recipes', async (req, res) => {
  try {
    const recipes = await recipeModel.getAllRecipes();
    // Parse JSON fields before sending to the client
    const parsed = recipes.map((r) => {
      const parseField = (field) => {
        if (!field) return [];
        // If it's already an array, return it
        if (Array.isArray(field)) {
          return field;
        }
        // If it's a string, try to parse it
        if (typeof field === 'string') {
          try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed : [];
          } catch (error) {
            // If parsing fails, return empty array
            return [];
          }
        }
        // If it's an object or anything else, return empty array
        return [];
      };
      
      return {
        ...r,
        ingredients: parseField(r.ingredients),
        instructions: parseField(r.instructions),
        tags: parseField(r.tags),
      };
    });
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve recipes' });
  }
});

/* GET /api/recipes/:id — get a single recipe */
router.get('/recipes/:id', async (req, res) => {
  try {
    const recipe = await recipeModel.getRecipeById(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    const parseField = (field) => {
      if (!field) return [];
      // If it's already an array, return it
      if (Array.isArray(field)) {
        return field;
      }
      // If it's a string, try to parse it
      if (typeof field === 'string') {
        try {
          const parsed = JSON.parse(field);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          // If parsing fails, return empty array
          return [];
        }
      }
      // If it's an object or anything else, return empty array
      return [];
    };
    
    res.json({
      ...recipe,
      ingredients: parseField(recipe.ingredients),
      instructions: parseField(recipe.instructions),
      tags: parseField(recipe.tags),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error retrieving recipe' });
  }
});

/* POST /api/recipes — create a new recipe via JSON body */
router.post('/recipes', async (req, res) => {
  try {
    const { title, ingredients, instructions, tags } = req.body;
    const newRecipe = await recipeModel.createRecipe({ title, ingredients, instructions, tags });
    res.status(201).json(newRecipe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create recipe' });
  }
});

/* PUT /api/recipes/:id — update a recipe */
router.put('/recipes/:id', async (req, res) => {
  try {
    const updated = await recipeModel.updateRecipe(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update recipe' });
  }
});

/* DELETE /api/recipes/:id — delete a recipe */
router.delete('/recipes/:id', async (req, res) => {
  try {
    const result = await recipeModel.deleteRecipe(req.params.id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete recipe' });
  }
});

/* POST /api/recipes/ai — parse plain text using OpenAI and return standardized ingredients for review */
router.post('/recipes/ai', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text field' });
  try {
    // Build a prompt instructing the model to output JSON only
    const messages = [
      {
        role: 'system',
        content: `You are a recipe parser. Extract recipe information from text and return ONLY valid JSON with this exact structure:
{
  "title": "Recipe Name",
  "ingredients": [
    { "quantity": 2, "unit": "cup", "name": "flour", "modifier": "sifted" },
    { "quantity": 1, "unit": "tsp", "name": "salt", "modifier": "" }
  ],
  "instructions": ["Step 1: Mix ingredients", "Step 2: Bake at 350F"],
  "tags": ["baking", "bread", "dinner"]
}

Rules:
- Return ONLY the JSON object, no markdown, no explanations
- Ingredients must be structured objects with quantity, unit, name, and modifier (modifier can be empty string)
- Instructions should be complete steps
- Tags should be relevant categories
- If any field is missing from the text, use empty array [] or reasonable defaults`
      },
      {
        role: 'user',
        content: `Parse this recipe text into JSON format:

${text}

Return ONLY the JSON object with title, ingredients (array of objects with quantity, unit, name, modifier), instructions (array of strings), and tags (array of strings).`
      },
    ];
    // Call the Chat Completions API
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' }
    });
    const content = completion.choices[0].message.content.trim();
    console.log('AI Response:', content); // Debug log
    
    let data;
    try {
      data = JSON.parse(content);
    } catch (parseError) {
      const sanitized = sanitizeAIJson(content);
      try {
        data = JSON.parse(sanitized);
      } catch (err2) {
        console.error('Failed to parse AI response:', content);
        return res.status(500).json({ error: 'AI returned invalid JSON. Please try again with clearer recipe text.' });
      }
    }
    
    // Validate required fields
    if (!data.title || !data.ingredients || !data.instructions) {
      console.error('AI response missing required fields:', data);
      return res.status(500).json({ error: 'AI response missing required fields. Please try again.' });
    }
    
    // Convert ingredient lines into structured objects and standardize them
    const rawIngredients = Array.isArray(data.ingredients) ? data.ingredients : [];
    const structuredIngredients = rawIngredients.map((ing) => {
      if (typeof ing === 'string') return convertIngredients([ing])[0];
      return {
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? '',
        name: ing.name ?? '',
        modifier: ing.modifier ?? ''
      };
    });
    const standardizationService = require('../services/standardizationService');
    const standardized = await standardizationService.standardizeIngredients(structuredIngredients);
    
    // Return the parsed recipe with standardized ingredients for review
    res.json({
      title: data.title,
      ingredients: standardized.standardized.map(s => ({ ...s, modifier: structuredIngredients.find(i => (i.name || '').toLowerCase() === (s.name || '').toLowerCase())?.modifier || '' })),
      instructions: data.instructions,
      tags: data.tags || [],
      needsReview: standardized.reviewCount > 0,
      reviewCount: standardized.reviewCount,
      originalIngredients: rawIngredients
    });
  } catch (err) {
    console.error('Error in AI recipe parsing:', err);
    res.status(500).json({ error: 'Failed to parse recipe via OpenAI: ' + err.message });
  }
});

/* POST /api/recipes/scrape — scrape recipe from URL */
router.post('/recipes/scrape', async (req, res) => {
  const { url, useAI = false } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });
  
  try {
    if (useAI) {
      // Fetch full page text and let AI parse it
      const pageText = await fetchPageText(url);
      const jsonld = extractRecipeFromJSONLD(pageText);
      if (jsonld) {
        const rawIngredients = Array.isArray(jsonld.ingredients) ? jsonld.ingredients : (Array.isArray(jsonld) ? jsonld : jsonld.ingredients || []);
        const structuredIngredients = convertIngredients(jsonld.ingredients || []);
        const standardizationService = require('../services/standardizationService');
        const standardized = await standardizationService.standardizeIngredients(structuredIngredients);
        return res.json({
          title: jsonld.title || 'Untitled',
          ingredients: standardized.standardized.map(s => ({ ...s, modifier: structuredIngredients.find(i => (i.name || '').toLowerCase() === (s.name || '').toLowerCase())?.modifier || '' })),
          instructions: dedupeArray(jsonld.instructions),
          tags: jsonld.tags || [],
          needsReview: standardized.reviewCount > 0,
          reviewCount: standardized.reviewCount,
          originalIngredients: jsonld.ingredients || [],
          sourceUrl: url
        });
      }
      const trimmed = truncateText(stripHtmlToText(pageText));
      const messages = [
        { role: 'system', content: `You are a recipe parser. Extract recipe information from text and return ONLY valid JSON with this exact structure:\n{\n  "title": "Recipe Name",\n  "ingredients": [\n    { "quantity": 2, "unit": "cup", "name": "flour", "modifier": "sifted" },\n    { "quantity": 1, "unit": "tsp", "name": "salt", "modifier": "" }\n  ],\n  "instructions": ["Step 1: Mix ingredients", "Step 2: Bake at 350F"],\n  "tags": ["baking", "bread", "dinner"]\n}\n\nRules:\n- Return ONLY the JSON object, no markdown, no explanations\n- Ingredients must be structured objects with quantity, unit, name, and modifier (modifier can be empty string)\n- Instructions should be complete steps\n- Tags should be relevant categories\n- If any field is missing from the text, use empty array [] or reasonable defaults` },
        { role: 'user', content: `Parse this recipe page into structured JSON:\n\n${trimmed}\n\nReturn ONLY the JSON object with title, ingredients (array of objects with quantity, unit, name, modifier), instructions (array of strings), and tags (array of strings).` }
      ];
      const completion = await openai.chat.completions.create({ model: OPENAI_MODEL, messages, temperature: 0, response_format: { type: 'json_object' } });
      const content = completion.choices[0].message.content.trim();
      let data;
      try {
        data = JSON.parse(content);
      } catch (parseError) {
        const sanitized = sanitizeAIJson(content);
        try { data = JSON.parse(sanitized); } catch (err2) {
          console.error('AI fallback parse error:', content);
          return res.status(500).json({ error: 'AI fallback returned invalid JSON.' });
        }
      }

      const rawIngredients = Array.isArray(data.ingredients) ? data.ingredients : [];
      const structuredIngredients = rawIngredients.map((ing) => {
        if (typeof ing === 'string') return convertIngredients([ing])[0];
        return {
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? '',
          name: ing.name ?? '',
          modifier: ing.modifier ?? ''
        };
      });
      const standardizationService = require('../services/standardizationService');
      const standardized = await standardizationService.standardizeIngredients(structuredIngredients);

      return res.json({
        title: data.title || 'Untitled',
        ingredients: standardized.standardized.map(s => ({ ...s, modifier: structuredIngredients.find(i => (i.name || '').toLowerCase() === (s.name || '').toLowerCase())?.modifier || '' })),
        instructions: dedupeArray(data.instructions),
        tags: data.tags || [],
        needsReview: standardized.reviewCount > 0,
        reviewCount: standardized.reviewCount,
        originalIngredients: rawIngredients,
        sourceUrl: url
      });
    }

    // Non-AI path: attempt scraper; on failure, fallback to AI automatically
    try {
      const recipe = await scrapeRecipeFromUrl(url);
      // Dedupe instructions just in case
      recipe.instructions = dedupeArray(recipe.instructions);
      return res.json(recipe);
    } catch (scrapeErr) {
      console.warn('Scrape failed, falling back to AI:', scrapeErr?.message);
      const pageText = await fetchPageText(url);
      const jsonld = extractRecipeFromJSONLD(pageText);
      if (jsonld) {
        const structuredIngredients = convertIngredients(jsonld.ingredients || []);
        const standardizationService = require('../services/standardizationService');
        const standardized = await standardizationService.standardizeIngredients(structuredIngredients);
        return res.json({
          title: jsonld.title || 'Untitled',
          ingredients: standardized.standardized.map(s => ({ ...s, modifier: structuredIngredients.find(i => (i.name || '').toLowerCase() === (s.name || '').toLowerCase())?.modifier || '' })),
          instructions: dedupeArray(jsonld.instructions),
          tags: jsonld.tags || [],
          needsReview: standardized.reviewCount > 0,
          reviewCount: standardized.reviewCount,
          originalIngredients: jsonld.ingredients || [],
          sourceUrl: url
        });
      }
      const trimmed = truncateText(stripHtmlToText(pageText));
      const messages = [
        { role: 'system', content: `You are a recipe parser. Extract recipe information from text and return ONLY valid JSON with this exact structure:\n{\n  "title": "Recipe Name",\n  "ingredients": [\n    { "quantity": 2, "unit": "cup", "name": "flour", "modifier": "sifted" },\n    { "quantity": 1, "unit": "tsp", "name": "salt", "modifier": "" }\n  ],\n  "instructions": ["Step 1: Mix ingredients", "Step 2: Bake at 350F"],\n  "tags": ["baking", "bread", "dinner"]\n}\n\nRules:\n- Return ONLY the JSON object, no markdown, no explanations\n- Ingredients must be structured objects with quantity, unit, name, and modifier (modifier can be empty string)\n- Instructions should be complete steps\n- Tags should be relevant categories\n- If any field is missing from the text, use empty array [] or reasonable defaults` },
        { role: 'user', content: `Parse this recipe page into structured JSON:\n\n${trimmed}\n\nReturn ONLY the JSON object with title, ingredients (array of objects with quantity, unit, name, modifier), instructions (array of strings), and tags (array of strings).` }
      ];
      const completion = await openai.chat.completions.create({ model: OPENAI_MODEL, messages, temperature: 0, response_format: { type: 'json_object' } });
      const content = completion.choices[0].message.content.trim();
      let data;
      try {
        data = JSON.parse(content);
      } catch (parseError) {
        const sanitized = sanitizeAIJson(content);
        try { data = JSON.parse(sanitized); } catch (err2) {
          console.error('AI fallback parse error:', content);
          return res.status(500).json({ error: 'AI fallback returned invalid JSON.' });
        }
      }

      const rawIngredients = Array.isArray(data.ingredients) ? data.ingredients : [];
      const structuredIngredients = rawIngredients.map((ing) => {
        if (typeof ing === 'string') return convertIngredients([ing])[0];
        return {
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? '',
          name: ing.name ?? '',
          modifier: ing.modifier ?? ''
        };
      });
      const standardizationService = require('../services/standardizationService');
      const standardized = await standardizationService.standardizeIngredients(structuredIngredients);

      return res.json({
        title: data.title || 'Untitled',
        ingredients: standardized.standardized.map(s => ({ ...s, modifier: structuredIngredients.find(i => (i.name || '').toLowerCase() === (s.name || '').toLowerCase())?.modifier || '' })),
        instructions: dedupeArray(data.instructions),
        tags: data.tags || [],
        needsReview: standardized.reviewCount > 0,
        reviewCount: standardized.reviewCount,
        originalIngredients: rawIngredients,
        sourceUrl: url
      });
    }
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Failed to scrape recipe' });
  }
});

/* POST /api/recipes/confirm — save recipe after ingredient review */
router.post('/recipes/confirm', async (req, res) => {
  try {
    const { title, ingredients, instructions, tags, servings, force = false } = req.body;
    
    if (!title || !ingredients || !instructions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate that all ingredients have been reviewed unless forcing
    const unreviewedIngredients = ingredients.filter(ing => ing.needsReview);
    if (!force && unreviewedIngredients.length > 0) {
      return res.status(400).json({ 
        error: `Cannot save recipe with ${unreviewedIngredients.length} unreviewed ingredients` 
      });
    }

    // Create the recipe via model (MySQL)
    const newRecipe = await recipeModel.createRecipe({
      title,
      ingredients: ingredients.map(ing => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category || 'other',
        modifier: ing.modifier || ''
      })),
      instructions,
      tags: tags || [],
      servings: servings || 4
    });

    res.status(201).json(newRecipe);
  } catch (error) {
    console.error('Error confirming recipe:', error);
    res.status(500).json({ error: 'Failed to save recipe' });
  }
});

/* GET /api/ingredients — get all ingredients */
router.get('/ingredients', async (req, res) => {
  try {
    const { category } = req.query;
    const ingredientModel = require('../models/ingredientModel');
    const ingredients = category 
      ? await ingredientModel.getIngredientsByCategory(category)
      : await ingredientModel.getAllIngredients();
    res.json(ingredients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve ingredients' });
  }
});

/* GET /api/ingredients/categories — get ingredient categories */
router.get('/ingredients/categories', async (req, res) => {
  try {
    const ingredientModel = require('../models/ingredientModel');
    const categories = await ingredientModel.getIngredientCategories();
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve ingredient categories' });
  }
});

/* POST /api/ingredients — create a new ingredient */
router.post('/ingredients', async (req, res) => {
  try {
    const ingredientModel = require('../models/ingredientModel');
    const newIngredient = await ingredientModel.createIngredient(req.body);
    res.status(201).json(newIngredient);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

/* GET /api/measurements — get all measurements */
router.get('/measurements', async (req, res) => {
  try {
    const measurementModel = require('../models/measurementModel');
    const measurements = await measurementModel.getAllMeasurements();
    res.json(measurements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve measurements' });
  }
});

/* POST /api/measurements — create a new measurement */
router.post('/measurements', async (req, res) => {
  try {
    const measurementModel = require('../models/measurementModel');
    const newMeasurement = await measurementModel.createMeasurement(req.body);
    res.status(201).json(newMeasurement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create measurement' });
  }
});

/* POST /api/groceries — generate an aggregated grocery list from selected recipe IDs */
router.post('/groceries', async (req, res) => {
  console.log('Backend: Received grocery request:', req.body);
  const { recipeIds, scaleFactor = 1, profileId = null } = req.body;
  if (!Array.isArray(recipeIds)) return res.status(400).json({ error: 'recipeIds must be an array' });
  
  const scale = parseFloat(scaleFactor) || 1;
  console.log('Backend: Processing with scale factor:', scale);
  
  try {
    // Fetch all selected recipes
    const groceries = {};
    for (const id of recipeIds) {
      console.log('Backend: Processing recipe ID:', id);
      const recipe = await recipeModel.getRecipeById(id);
      if (!recipe) {
        console.log('Backend: Recipe not found for ID:', id);
        continue;
      }
      console.log('Backend: Recipe found:', recipe.title);
      let ingList;
      if (typeof recipe.ingredients === 'string') {
        ingList = JSON.parse(recipe.ingredients);
      } else {
        ingList = recipe.ingredients;
      }
      console.log('Backend: Ingredients for recipe:', ingList);
      for (const item of ingList) {
        const key = `${(item.name || '').toLowerCase()}|${item.unit || ''}`;
        const scaledQuantity = (Number(item.quantity) || 0) * scale;

        // Resolve category by profile if we can; otherwise fallback to item.category or 'other'
        let resolvedCategory = item.category || 'other';
        let ingredientId = item.ingredientId || null;
        if (!ingredientId && item.name) {
          const found = await ingredientModel.findIngredient(item.name);
          if (found) ingredientId = found.id;
        }
        if (ingredientId) {
          const resolved = await categoryModel.resolveCategoryForIngredient(ingredientId, profileId);
          if (resolved && resolved.name) {
            resolvedCategory = resolved.name;
          }
        }
        
        const sourceEntry = { recipeTitle: recipe.title, modifier: item.modifier || null };
        
        if (!groceries[key]) {
          groceries[key] = { 
            name: item.name, 
            unit: item.unit, 
            quantity: scaledQuantity,
            category: resolvedCategory,
            sources: [recipe.title],
            detailsBySource: [sourceEntry]
          };
        } else {
          groceries[key].quantity += scaledQuantity;
          if (!groceries[key].sources.includes(recipe.title)) {
            groceries[key].sources.push(recipe.title);
          }
          groceries[key].detailsBySource.push(sourceEntry);
        }
      }
    }
    console.log('Backend: Final groceries object:', groceries);
    // Return aggregated list as an array
    const result = Object.values(groceries);
    console.log('Backend: Sending response:', result);
    res.json(result);
  } catch (err) {
    console.error('Backend: Error generating grocery list:', err);
    res.status(500).json({ error: 'Failed to generate grocery list' });
  }
});

// Helper: attempt to sanitize AI output into valid JSON
function sanitizeAIJson(content) {
  try {
    // Replace bare fractions (e.g., : 2/3) with decimals (e.g., : 0.67)
    const replaced = content.replace(/:\s*(\d+)\s*\/\s*(\d+)(\s*[},\]])/g, (m, a, b, tail) => {
      const num = parseFloat(a);
      const den = parseFloat(b);
      if (!den) return m; // avoid div by zero
      const dec = Math.round((num / den) * 100) / 100; // 2 decimal places
      return `: ${dec}${tail}`;
    });
    return replaced;
  } catch (_) {
    return content;
  }
}

module.exports = router;
