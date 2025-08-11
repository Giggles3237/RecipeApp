const db = require('../config/db');

// Fetch all recipes from the database
async function getAllRecipes() {
  const [rows] = await db.query('SELECT * FROM recipes');
  return rows;
}

// Fetch a single recipe by its ID
async function getRecipeById(id) {
  const [rows] = await db.query('SELECT * FROM recipes WHERE id = ?', [id]);
  return rows[0];
}

// Create a new recipe
async function createRecipe({ title, ingredients, instructions, tags, servings }) {
  console.log('Creating recipe:', { title, ingredients, instructions, tags, servings }); // Debug log
  try {
    const [result] = await db.query(
      'INSERT INTO recipes (title, ingredients, instructions, tags, servings) VALUES (?, ?, ?, ?, ?)',
      [title, JSON.stringify(ingredients), JSON.stringify(instructions), JSON.stringify(tags), servings || 4]
    );
    console.log('Recipe created with ID:', result.insertId); // Debug log
    return { id: result.insertId, title, ingredients, instructions, tags, servings: servings || 4 };
  } catch (error) {
    console.error('Error creating recipe:', error);
    throw error;
  }
}

// Update an existing recipe
async function updateRecipe(id, { title, ingredients, instructions, tags, servings }) {
  await db.query(
    'UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, tags = ?, servings = ? WHERE id = ?',
    [title, JSON.stringify(ingredients), JSON.stringify(instructions), JSON.stringify(tags), servings || 4, id]
  );
  return { id, title, ingredients, instructions, tags, servings: servings || 4 };
}

// Delete a recipe
async function deleteRecipe(id) {
  await db.query('DELETE FROM recipes WHERE id = ?', [id]);
  return { message: 'Recipe deleted' };
}

module.exports = {
  getAllRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
};
