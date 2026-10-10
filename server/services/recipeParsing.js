// Non-AI parsing helpers: ingredient line parsing, JSON-LD extraction, HTML cleanup.
const { parse } = require('recipe-ingredient-parser-v3');

/* Parse numeric strings that may contain fractions like "1/2", "1 1/2" or unicode "½" */
const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
function safeParseQuantity(text) {
  if (text === null || text === undefined || text === '') return NaN;
  if (typeof text === 'number') return text;
  let t = String(text).trim();
  // "1½" or "1 ½"
  const uni = t.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (uni) return (uni[1] ? parseFloat(uni[1]) : 0) + UNICODE_FRACTIONS[uni[2]];
  // Ranges like "2-3": take the first number
  const range = t.match(/^([\d./\s]+?)\s*(?:-|–|to)\s*[\d./]+$/);
  if (range) t = range[1].trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const den = parseFloat(mixed[3]);
    return parseFloat(mixed[1]) + (den ? parseFloat(mixed[2]) / den : 0);
  }
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const den = parseFloat(frac[2]);
    return den ? parseFloat(frac[1]) / den : NaN;
  }
  const n = parseFloat(t.replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

// Returns a number or null (for "to taste", blanks, etc.)
function toQuantity(value) {
  const n = safeParseQuantity(value);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

/* Extract metric quantity/unit (ml, l, g, kg) from a raw line, if present */
function extractMetricFromLine(rawLine) {
  if (!rawLine) return null;
  const line = String(rawLine);
  const parenMetric = line.match(/\(([^)]*?)(\d+[\d\s\/.]*)(?:\s*)(ml|l|g|kg)\s*[^)]*\)/i);
  if (parenMetric) {
    const qty = safeParseQuantity(parenMetric[2].trim());
    if (!isNaN(qty)) return { quantity: qty, unit: parenMetric[3].toLowerCase() };
  }
  const inlineMetric = line.match(/\b(\d+[\d\s\/.]*)\s*(ml|l|g|kg)\b/i);
  if (inlineMetric) {
    const qty = safeParseQuantity(inlineMetric[1].trim());
    if (!isNaN(qty)) return { quantity: qty, unit: inlineMetric[2].toLowerCase() };
  }
  return null;
}

/* Convert an array of ingredient strings into structured objects (no AI) */
const TO_TASTE = /,?\s*\b(?:to taste|as needed|for serving|for garnish|optional)\b\.?/i;

function convertIngredients(list) {
  return (list || []).map((rawLine) => {
    let line = String(rawLine || '').replace(/\s+/g, ' ').trim();
    // "salt to taste" / "pepper, as needed" -> no amount; keep the phrase as a modifier
    const tasteMatch = line.match(TO_TASTE);
    if (tasteMatch && !/^\s*[\d¼½¾⅓⅔⅛]/.test(line)) {
      const name = line.replace(TO_TASTE, '').replace(/[,\s]+$/, '').trim();
      return { quantity: null, unit: '', name: name || line, modifier: tasteMatch[0].replace(/^,?\s*/, '').replace(/\.$/, ''), original: rawLine };
    }
    try {
      const parsed = parse(line, 'eng');
      const metric = extractMetricFromLine(line);
      return {
        quantity: metric ? metric.quantity : parsed.quantity || null,
        unit: metric ? metric.unit : parsed.unit || '',
        name: parsed.ingredient || line,
        modifier: parsed.comment || '',
        original: line,
      };
    } catch (err) {
      const metric = extractMetricFromLine(line);
      if (metric) return { quantity: metric.quantity, unit: metric.unit, name: line, modifier: '', original: line };
      return { quantity: null, unit: '', name: line, modifier: '', original: line };
    }
  });
}

/* Extract a Recipe from JSON-LD <script> blocks, if the page has one */
function flattenInstructions(instructions) {
  if (typeof instructions === 'string') return [instructions];
  if (!Array.isArray(instructions)) return [];
  const out = [];
  for (const i of instructions) {
    if (typeof i === 'string') out.push(i);
    else if (i && Array.isArray(i.itemListElement)) out.push(...flattenInstructions(i.itemListElement)); // HowToSection
    else if (i && i.text) out.push(i.text);
  }
  return out;
}

function extractRecipeFromJSONLD(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html || '')) !== null) {
    let json;
    try {
      json = JSON.parse(match[1].trim());
    } catch (_) {
      continue;
    }
    const nodes = Array.isArray(json) ? json : json['@graph'] || [json];
    for (const node of nodes) {
      if (!node) continue;
      const type = node['@type'];
      const isRecipe = Array.isArray(type) ? type.includes('Recipe') : type === 'Recipe';
      if (!isRecipe) continue;
      const keywords = node.keywords || [];
      const yieldVal = Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield;
      return {
        title: node.name || node.headline || 'Untitled',
        ingredients: node.recipeIngredient || [],
        instructions: flattenInstructions(node.recipeInstructions).map(stripTags).filter(Boolean),
        tags: Array.isArray(keywords) ? keywords : String(keywords).split(',').map((s) => s.trim()).filter(Boolean),
        servings: parseInt(yieldVal, 10) || null,
      };
    }
  }
  return null;
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, maxChars = 15000) {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function dedupeArray(arr) {
  return Array.from(new Set((arr || []).map((s) => String(s || '').trim()).filter(Boolean)));
}

// Parse a DB JSON column that may already be an array, a JSON string, or junk
function parseJsonArray(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

// Model output sometimes contains bare fractions like "quantity": 2/3 — convert to decimals
function sanitizeAIJson(content) {
  return String(content)
    .replace(/^```(?:json)?\s*|\s*```$/g, '')
    .replace(/:\s*(\d+)\s*\/\s*(\d+)(\s*[},\]])/g, (m, a, b, tail) => {
      const den = parseFloat(b);
      if (!den) return m;
      return `: ${Math.round((parseFloat(a) / den) * 1000) / 1000}${tail}`;
    });
}

function parseAIJson(content) {
  try {
    return JSON.parse(content);
  } catch (_) {
    return JSON.parse(sanitizeAIJson(content));
  }
}

module.exports = {
  safeParseQuantity,
  toQuantity,
  extractMetricFromLine,
  convertIngredients,
  extractRecipeFromJSONLD,
  stripHtmlToText,
  truncateText,
  dedupeArray,
  parseJsonArray,
  sanitizeAIJson,
  parseAIJson,
};
