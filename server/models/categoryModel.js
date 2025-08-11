const db = require('../config/db');

async function initializeCategories() {
  // categories
  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      sort_order INT DEFAULT 0
    )
  `);
  // category_profiles
  await db.query(`
    CREATE TABLE IF NOT EXISTS category_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    )
  `);
  // category_assignments
  await db.query(`
    CREATE TABLE IF NOT EXISTS category_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ingredient_id INT NOT NULL,
      profile_id INT NULL,
      category_id INT NOT NULL,
      sort_hint INT NULL,
      UNIQUE KEY uq_assignment (ingredient_id, profile_id),
      INDEX idx_profile (profile_id),
      INDEX idx_category (category_id)
    )
  `);
  // seed default categories if empty
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM categories');
  if (rows[0].count === 0) {
    const defaults = [
      { name: 'protein', sort_order: 10 },
      { name: 'vegetable', sort_order: 20 },
      { name: 'fruit', sort_order: 30 },
      { name: 'dairy', sort_order: 40 },
      { name: 'grain', sort_order: 50 },
      { name: 'herb', sort_order: 60 },
      { name: 'spice', sort_order: 70 },
      { name: 'seasoning', sort_order: 80 },
      { name: 'oil', sort_order: 90 },
      { name: 'condiment', sort_order: 100 },
      { name: 'sweetener', sort_order: 110 },
      { name: 'other', sort_order: 999 }
    ];
    for (const c of defaults) {
      await db.query('INSERT INTO categories (name, sort_order) VALUES (?, ?)', [c.name, c.sort_order]);
    }
  }
  // seed a default profile if none exists
  const [p] = await db.query('SELECT COUNT(*) AS count FROM category_profiles');
  if (p[0].count === 0) {
    await db.query('INSERT INTO category_profiles (name) VALUES (?)', ['My Store']);
  }
}

async function getAllCategories() {
  const [rows] = await db.query('SELECT * FROM categories ORDER BY sort_order, name');
  return rows;
}

async function getCategoryById(id) {
  const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getCategoryByName(name) {
  const [rows] = await db.query('SELECT * FROM categories WHERE LOWER(name) = ?', [name.toLowerCase()]);
  return rows[0] || null;
}

async function getOrCreateCategoryByName(name) {
  let cat = await getCategoryByName(name);
  if (cat) return cat;
  const [res] = await db.query('INSERT INTO categories (name) VALUES (?)', [name]);
  return { id: res.insertId, name };
}

async function createProfile(name) {
  const [res] = await db.query('INSERT INTO category_profiles (name) VALUES (?)', [name]);
  return { id: res.insertId, name };
}

async function getProfiles() {
  const [rows] = await db.query('SELECT * FROM category_profiles ORDER BY name');
  return rows;
}

async function getProfileByName(name) {
  const [rows] = await db.query('SELECT * FROM category_profiles WHERE LOWER(name) = ?', [name.toLowerCase()]);
  return rows[0] || null;
}

async function upsertAssignment({ ingredientId, categoryId, profileId = null, sort_hint = null }) {
  // Try update first
  const [existing] = await db.query('SELECT id FROM category_assignments WHERE ingredient_id = ? AND ((profile_id IS NULL AND ? IS NULL) OR profile_id = ?)', [ingredientId, profileId, profileId]);
  if (existing[0]) {
    await db.query('UPDATE category_assignments SET category_id = ?, sort_hint = ? WHERE id = ?', [categoryId, sort_hint, existing[0].id]);
    return { id: existing[0].id, ingredient_id: ingredientId, category_id: categoryId, profile_id: profileId, sort_hint };
  }
  const [res] = await db.query('INSERT INTO category_assignments (ingredient_id, profile_id, category_id, sort_hint) VALUES (?, ?, ?, ?)', [ingredientId, profileId, categoryId, sort_hint]);
  return { id: res.insertId, ingredient_id: ingredientId, category_id: categoryId, profile_id: profileId, sort_hint };
}

async function getAssignment(ingredientId, profileId = null) {
  const [rows] = await db.query('SELECT * FROM category_assignments WHERE ingredient_id = ? AND ((profile_id IS NULL AND ? IS NULL) OR profile_id = ?) LIMIT 1', [ingredientId, profileId, profileId]);
  return rows[0] || null;
}

async function resolveCategoryForIngredient(ingredientId, profileId = null) {
  // profile-specific
  let row = await getAssignment(ingredientId, profileId);
  if (row) {
    const cat = await getCategoryById(row.category_id);
    return cat ? { ...cat, sort_hint: row.sort_hint } : null;
  }
  // global default (NULL profile)
  row = await getAssignment(ingredientId, null);
  if (row) {
    const cat = await getCategoryById(row.category_id);
    return cat ? { ...cat, sort_hint: row.sort_hint } : null;
  }
  return null;
}

module.exports = {
  initializeCategories,
  getAllCategories,
  getCategoryById,
  getCategoryByName,
  getOrCreateCategoryByName,
  createProfile,
  getProfiles,
  getProfileByName,
  upsertAssignment,
  getAssignment,
  resolveCategoryForIngredient
};
