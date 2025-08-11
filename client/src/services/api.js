const API_BASE = 'http://localhost:5000/api';

export async function fetchRecipes() {
  const res = await fetch(`${API_BASE}/recipes`);
  return res.json();
}

export async function getRecipe(id) {
  const res = await fetch(`${API_BASE}/recipes/${id}`);
  return res.json();
}

export async function createRecipe(data) {
  const res = await fetch(`${API_BASE}/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateRecipe(id, data) {
  const res = await fetch(`${API_BASE}/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteRecipe(id) {
  const res = await fetch(`${API_BASE}/recipes/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function parseRecipeWithAI(text) {
  const res = await fetch(`${API_BASE}/recipes/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function scrapeRecipe(url, useAI = false) {
  const res = await fetch(`${API_BASE}/recipes/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, useAI }),
  });
  return res.json();
}

export async function generateGroceries(recipeIds, scaleFactor = 1, profileId) {
  console.log('API: generateGroceries called with:', { recipeIds, scaleFactor, profileId });
  const res = await fetch(`${API_BASE}/groceries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeIds, scaleFactor, profileId }),
  });
  console.log('API: Response status:', res.status);
  const data = await res.json();
  console.log('API: Response data:', data);
  return data;
}

export async function scaleRecipe(id, scaleFactor) {
  const res = await fetch(`${API_BASE}/recipes/${id}/scale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scaleFactor }),
  });
  return res.json();
}

export async function fetchMeasurements() {
  const res = await fetch(`${API_BASE}/measurements`);
  return res.json();
}

export async function fetchIngredients(category = null) {
  const url = category ? `${API_BASE}/ingredients?category=${category}` : `${API_BASE}/ingredients`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchIngredientCategories() {
  const res = await fetch(`${API_BASE}/ingredients/categories`);
  return res.json();
}

export async function createMeasurement(data) {
  const res = await fetch(`${API_BASE}/measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function createIngredient(data) {
  const res = await fetch(`${API_BASE}/ingredients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function confirmRecipe(recipeData) {
  console.log('Sending recipe data to confirm:', recipeData);
  
  const res = await fetch(`${API_BASE}/recipes/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipeData),
  });
  
  console.log('Response status:', res.status);
  console.log('Response headers:', res.headers);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error('Server error response:', errorText);
    throw new Error(`Server error: ${res.status} - ${errorText}`);
  }
  
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const responseText = await res.text();
    console.error('Non-JSON response received:', responseText);
    throw new Error(`Expected JSON response but got: ${contentType}`);
  }
  
  return res.json();
}
