const db = require('../config/db');

// Standard ingredient categories and common ingredients
const STANDARD_INGREDIENTS = [
  // Proteins
  { name: 'chicken breast', category: 'protein', aliases: 'chicken breasts,boneless chicken breast' },
  { name: 'ground beef', category: 'protein', aliases: 'ground meat,minced beef' },
  { name: 'salmon', category: 'protein', aliases: 'salmon fillet,fresh salmon' },
  { name: 'eggs', category: 'protein', aliases: 'egg,large eggs' },
  { name: 'tofu', category: 'protein', aliases: 'firm tofu,extra firm tofu' },
  { name: 'bacon', category: 'protein', aliases: 'sliced bacon,thick cut bacon' },
  
  // Oils
  { name: 'olive oil', category: 'oil', aliases: 'extra-virgin olive oil,EVOO' },
  { name: 'vegetable oil', category: 'oil', aliases: 'canola oil,cooking oil' },
  
  // Herbs & Spices
  { name: 'oregano', category: 'herb', aliases: 'dried oregano,fresh oregano' },
  { name: 'cumin', category: 'spice', aliases: 'whole cumin seeds,ground cumin,cumin seeds' },
  { name: 'coriander', category: 'spice', aliases: 'whole coriander seeds,ground coriander,coriander seeds' },
  { name: 'cloves', category: 'spice', aliases: 'ground cloves,whole cloves' },
  { name: 'basil', category: 'herb', aliases: 'fresh basil,dried basil' },
  { name: 'thyme', category: 'herb', aliases: 'fresh thyme,dried thyme' },
  { name: 'parsley', category: 'herb', aliases: 'fresh parsley,chopped parsley' },
  { name: 'paprika', category: 'spice', aliases: 'sweet paprika,smoked paprika' },
  
  // Sweeteners
  { name: 'brown sugar', category: 'sweetener', aliases: 'dark brown sugar,light brown sugar' },
  { name: 'honey', category: 'sweetener', aliases: 'raw honey,pure honey' },
  { name: 'sugar', category: 'sweetener', aliases: 'white sugar,granulated sugar' },
  { name: 'maple syrup', category: 'sweetener', aliases: 'pure maple syrup,real maple syrup,grade a maple syrup' },
  
  // Condiments
  { name: 'vinegar', category: 'condiment', aliases: 'cider vinegar,apple cider vinegar,white vinegar' },
  { name: 'soy sauce', category: 'condiment', aliases: 'low sodium soy sauce' },
  { name: 'fish sauce', category: 'condiment', aliases: 'asian fish sauce' },
  { name: 'salsa', category: 'condiment', aliases: 'charred salsa verde,salsa verde' },
  
  // Seasonings
  { name: 'salt', category: 'seasoning', aliases: 'kosher salt,table salt,sea salt' },
  { name: 'black pepper', category: 'seasoning', aliases: 'pepper,ground black pepper' },
  
  // Fruits
  { name: 'pineapple', category: 'fruit', aliases: 'whole pineapple,fresh pineapple' },
  { name: 'apple', category: 'fruit', aliases: 'apples,granny smith apple' },
  { name: 'banana', category: 'fruit', aliases: 'bananas,ripe banana' },
  { name: 'lemon', category: 'fruit', aliases: 'lemons,fresh lemon' },
  { name: 'lime', category: 'fruit', aliases: 'limes,fresh lime' },
  { name: 'orange', category: 'fruit', aliases: 'oranges,fresh orange' },
  
  // Grains & Starches
  { name: 'rice', category: 'grain', aliases: 'white rice,brown rice,jasmine rice' },
  { name: 'pasta', category: 'grain', aliases: 'spaghetti,penne,macaroni' },
  { name: 'bread', category: 'grain', aliases: 'white bread,whole wheat bread' },
  { name: 'flour', category: 'grain', aliases: 'all-purpose flour,wheat flour' },
  { name: 'quinoa', category: 'grain', aliases: 'quinoa grain,cooked quinoa' },
  { name: 'tortillas', category: 'grain', aliases: 'corn tortillas,flour tortillas' },
  
  // Dairy
  { name: 'milk', category: 'dairy', aliases: 'whole milk,2% milk,skim milk' },
  { name: 'butter', category: 'dairy', aliases: 'unsalted butter,salted butter' },
  { name: 'cheese', category: 'dairy', aliases: 'cheddar cheese,mozzarella cheese,cotija cheese,crumbled cotija cheese' },
  { name: 'yogurt', category: 'dairy', aliases: 'plain yogurt,greek yogurt' },
  { name: 'cream', category: 'dairy', aliases: 'heavy cream,whipping cream' },
  
  // Vegetables
  { name: 'onion', category: 'vegetable', aliases: 'onions,yellow onion,white onion' },
  { name: 'garlic', category: 'vegetable', aliases: 'garlic cloves,fresh garlic,medium garlic,minced garlic' },
  { name: 'tomato', category: 'vegetable', aliases: 'tomatoes,fresh tomatoes' },
  { name: 'bell pepper', category: 'vegetable', aliases: 'bell peppers,red bell pepper,green bell pepper' },
  { name: 'carrot', category: 'vegetable', aliases: 'carrots,baby carrots' },
  { name: 'celery', category: 'vegetable', aliases: 'celery stalks,celery ribs' },
  { name: 'potato', category: 'vegetable', aliases: 'potatoes,russet potatoes' },
  { name: 'broccoli', category: 'vegetable', aliases: 'broccoli florets,fresh broccoli' },
  { name: 'chiles', category: 'vegetable', aliases: 'jalapeño,serrano chiles,ancho chiles,chipotle peppers' },
  { name: 'cilantro', category: 'herb', aliases: 'fresh cilantro,cilantro leaves' }
];

// Initialize ingredients table and populate with standard ingredients
async function initializeIngredients() {
  try {
    // Create ingredients table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL,
        aliases TEXT,
        nutritional_info JSON,
        storage_tips TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if table is empty
    const [existing] = await db.query('SELECT COUNT(*) as count FROM ingredients');
    if (existing[0].count === 0) {
      // Insert standard ingredients
      for (const ingredient of STANDARD_INGREDIENTS) {
        await db.query(
          'INSERT INTO ingredients (name, category, aliases) VALUES (?, ?, ?)',
          [ingredient.name, ingredient.category, ingredient.aliases]
        );
      }
      console.log(`Initialized ${STANDARD_INGREDIENTS.length} standard ingredients`);
    }
  } catch (error) {
    console.error('Error initializing ingredients:', error);
    throw error;
  }
}

// Get all ingredients
async function getAllIngredients() {
  const [rows] = await db.query('SELECT * FROM ingredients ORDER BY category, name');
  return rows;
}

// Get ingredients by category
async function getIngredientsByCategory(category) {
  const [rows] = await db.query('SELECT * FROM ingredients WHERE category = ? ORDER BY name', [category]);
  return rows;
}

// Find ingredient by name (including aliases)
async function findIngredient(ingredientName) {
  if (!ingredientName) return null;
  
  const normalized = ingredientName.toLowerCase().trim();
  
  // First try exact match
  const [exactMatch] = await db.query(
    'SELECT * FROM ingredients WHERE LOWER(name) = ?',
    [normalized]
  );
  
  if (exactMatch[0]) return exactMatch[0];
  
  // Then try alias search
  const [aliasMatch] = await db.query(
    'SELECT * FROM ingredients WHERE LOWER(aliases) LIKE ?',
    [`%${normalized}%`]
  );
  
  if (aliasMatch[0]) return aliasMatch[0];
  
  // Try partial name match
  const [partialMatch] = await db.query(
    'SELECT * FROM ingredients WHERE LOWER(name) LIKE ? ORDER BY LENGTH(name)',
    [`%${normalized}%`]
  );
  
  return partialMatch[0] || null;
}

// Suggest standardized ingredient name
async function suggestIngredientName(inputName) {
  const found = await findIngredient(inputName);
  if (found) {
    return {
      suggested: found.name,
      category: found.category,
      confidence: 'high',
      original: inputName
    };
  }
  
  // If not found, return suggestion for manual review
  return {
    suggested: inputName,
    category: 'unknown',
    confidence: 'low',
    original: inputName,
    needsReview: true
  };
}

// Add a new ingredient
async function createIngredient({ name, category, aliases, nutritional_info, storage_tips }) {
  const [result] = await db.query(
    'INSERT INTO ingredients (name, category, aliases, nutritional_info, storage_tips) VALUES (?, ?, ?, ?, ?)',
    [name, category, aliases || null, nutritional_info ? JSON.stringify(nutritional_info) : null, storage_tips || null]
  );
  return { id: result.insertId, name, category, aliases, nutritional_info, storage_tips };
}

// Update an ingredient
async function updateIngredient(id, { name, category, aliases, nutritional_info, storage_tips }) {
  await db.query(
    'UPDATE ingredients SET name = ?, category = ?, aliases = ?, nutritional_info = ?, storage_tips = ? WHERE id = ?',
    [name, category, aliases || null, nutritional_info ? JSON.stringify(nutritional_info) : null, storage_tips || null, id]
  );
  return { id, name, category, aliases, nutritional_info, storage_tips };
}

// Delete an ingredient
async function deleteIngredient(id) {
  await db.query('DELETE FROM ingredients WHERE id = ?', [id]);
  return { message: 'Ingredient deleted' };
}

// Get ingredient categories
async function getIngredientCategories() {
  const [rows] = await db.query('SELECT DISTINCT category FROM ingredients ORDER BY category');
  return rows.map(row => row.category);
}

module.exports = {
  initializeIngredients,
  getAllIngredients,
  getIngredientsByCategory,
  findIngredient,
  suggestIngredientName,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  getIngredientCategories
};
