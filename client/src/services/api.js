// Where the API lives. Set REACT_APP_API_URL in client/.env or in Netlify's environment settings.
const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

// Throws an Error with the server's message (and .status / .data) when the request fails.
async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

export const fetchRecipes = () => request('/recipes');
export const getRecipe = (id) => request(`/recipes/${id}`);
export const createRecipe = (data) => post('/recipes', data);
export const updateRecipe = (id, data) => request(`/recipes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRecipe = (id) => request(`/recipes/${id}`, { method: 'DELETE' });
export const scaleRecipe = (id, scaleFactor) => post(`/recipes/${id}/scale`, { scaleFactor });

/* ---- Recipe intake: each returns a recipe ready for the review dialog ---- */
export const parseRecipeWithAI = (text) => post('/recipes/ai', { text });
export const scrapeRecipe = (url, useAI = false) => post('/recipes/scrape', { url, useAI });
export const importRecipeFromPhotos = (images) => post('/recipes/photo', { images });
// Runs a hand-typed recipe through the same ingredient consistency check
export const reviewRecipe = (recipe) => post('/recipes/review', recipe);
// Saves after review. Creates a new recipe, or updates when recipeData.id is set.
export const confirmRecipe = (recipeData) => post('/recipes/confirm', recipeData);

export async function generateGroceries(recipeIds, scaleFactor = 1, profileId) {
  return post('/groceries', { recipeIds, scaleFactor, profileId });
}

/* ---- Ingredients & units ---- */
export const fetchMeasurements = () => request('/measurements');
export const fetchIngredients = (category = null) =>
  request(category ? `/ingredients?category=${encodeURIComponent(category)}` : '/ingredients');
export const fetchIngredientCategories = () => request('/ingredients/categories');
// These reject with err.status === 409 and err.data.duplicateOf when it looks like a duplicate.
export const createMeasurement = (data) => post('/measurements', data);
export const createIngredient = (data) => post('/ingredients', data);
export const addIngredientAlias = (id, alias) => post(`/ingredients/${id}/aliases`, { alias });
export const addMeasurementAlias = (id, alias) => post(`/measurements/${id}/aliases`, { alias });
