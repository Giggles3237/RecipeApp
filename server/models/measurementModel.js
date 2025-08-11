const db = require('../config/db');

// Standard measurement units with conversion factors to a base unit
const STANDARD_MEASUREMENTS = [
  // Volume - base unit: milliliters (ml)
  { name: 'ml', category: 'volume', base_conversion: 1, display_name: 'milliliter' },
  { name: 'l', category: 'volume', base_conversion: 1000, display_name: 'liter' },
  { name: 'tsp', category: 'volume', base_conversion: 4.92892, display_name: 'teaspoon' },
  { name: 'tbsp', category: 'volume', base_conversion: 14.7868, display_name: 'tablespoon' },
  { name: 'fl oz', category: 'volume', base_conversion: 29.5735, display_name: 'fluid ounce' },
  { name: 'cup', category: 'volume', base_conversion: 236.588, display_name: 'cup' },
  { name: 'pint', category: 'volume', base_conversion: 473.176, display_name: 'pint' },
  { name: 'quart', category: 'volume', base_conversion: 946.353, display_name: 'quart' },
  { name: 'gallon', category: 'volume', base_conversion: 3785.41, display_name: 'gallon' },
  
  // Weight - base unit: grams (g)
  { name: 'g', category: 'weight', base_conversion: 1, display_name: 'gram' },
  { name: 'kg', category: 'weight', base_conversion: 1000, display_name: 'kilogram' },
  { name: 'oz', category: 'weight', base_conversion: 28.3495, display_name: 'ounce' },
  { name: 'lb', category: 'weight', base_conversion: 453.592, display_name: 'pound' },
  
  // Count - base unit: pieces
  { name: 'piece', category: 'count', base_conversion: 1, display_name: 'piece' },
  { name: 'dozen', category: 'count', base_conversion: 12, display_name: 'dozen' },
  { name: 'each', category: 'count', base_conversion: 1, display_name: 'each' },
  
  // Special measurements
  { name: 'pinch', category: 'special', base_conversion: 0.5, display_name: 'pinch' },
  { name: 'dash', category: 'special', base_conversion: 0.625, display_name: 'dash' },
  { name: 'clove', category: 'special', base_conversion: 1, display_name: 'clove' },
  { name: 'slice', category: 'special', base_conversion: 1, display_name: 'slice' },
  { name: 'can', category: 'container', base_conversion: 400, display_name: 'can' }, // Average 400ml can
  { name: 'jar', category: 'container', base_conversion: 500, display_name: 'jar' }, // Average 500ml jar
  { name: 'package', category: 'container', base_conversion: 1, display_name: 'package' },
  { name: 'large', category: 'special', base_conversion: 1, display_name: 'large' },
  { name: 'medium', category: 'special', base_conversion: 1, display_name: 'medium' },
  { name: 'small', category: 'special', base_conversion: 1, display_name: 'small' },
  { name: 'whole', category: 'special', base_conversion: 1, display_name: 'whole' },
  { name: 'q.b.', category: 'special', base_conversion: 1, display_name: 'to taste' }, // quanto basta
  { name: 'to taste', category: 'special', base_conversion: 1, display_name: 'to taste' },
  { name: 'handful', category: 'special', base_conversion: 1, display_name: 'handful' },
  { name: 'bunch', category: 'special', base_conversion: 1, display_name: 'bunch' },
  { name: 'sprig', category: 'special', base_conversion: 1, display_name: 'sprig' }
];

// Initialize measurements table and populate with standard measurements
async function initializeMeasurements() {
  try {
    // Create measurements table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS measurements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        category VARCHAR(20) NOT NULL,
        base_conversion DECIMAL(10,6) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        aliases TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if table is empty
    const [existing] = await db.query('SELECT COUNT(*) as count FROM measurements');
    if (existing[0].count === 0) {
      // Insert standard measurements
      for (const measurement of STANDARD_MEASUREMENTS) {
        await db.query(
          'INSERT INTO measurements (name, category, base_conversion, display_name) VALUES (?, ?, ?, ?)',
          [measurement.name, measurement.category, measurement.base_conversion, measurement.display_name]
        );
      }
      console.log('Standard measurements initialized');
    }
  } catch (error) {
    console.error('Error initializing measurements:', error);
  }
}

// Get all measurements
async function getAllMeasurements() {
  const [rows] = await db.query('SELECT * FROM measurements ORDER BY category, name');
  return rows;
}

// Find measurement by name (including common aliases)
async function findMeasurement(unitName) {
  if (!unitName) return null;
  
  const normalized = unitName.toLowerCase().trim();
  
  // Common aliases mapping
  const aliases = {
    'teaspoon': 'tsp', 'teaspoons': 'tsp', 't': 'tsp',
    'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'T': 'tbsp', 'tb': 'tbsp',
    'cups': 'cup', 'c': 'cup',
    'ounce': 'oz', 'ounces': 'oz',
    'pound': 'lb', 'pounds': 'lb', 'lbs': 'lb',
    'gram': 'g', 'grams': 'g',
    'kilogram': 'kg', 'kilograms': 'kg', 'kgs': 'kg',
    'liter': 'l', 'liters': 'l', 'litre': 'l', 'litres': 'l',
    'milliliter': 'ml', 'milliliters': 'ml', 'millilitre': 'ml', 'millilitres': 'ml',
    'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'floz': 'fl oz',
    'pints': 'pint', 'pt': 'pint',
    'quarts': 'quart', 'qt': 'quart',
    'gallons': 'gallon', 'gal': 'gallon',
    'pieces': 'piece', 'pcs': 'piece', 'pc': 'piece', 'ct': 'piece', 'count': 'piece',
    'dozens': 'dozen', 'dz': 'dozen',
    'cloves': 'clove',
    'slices': 'slice',
    'cans': 'can',
    'jars': 'jar',
    'packages': 'package', 'pkg': 'package', 'pkgs': 'package',
    'ea': 'each', 'each': 'each'
  };
  
  const searchName = aliases[normalized] || normalized;
  
  const [rows] = await db.query(
    'SELECT * FROM measurements WHERE LOWER(name) = ? OR LOWER(display_name) = ?',
    [searchName, searchName]
  );
  
  return rows[0] || null;
}

// Convert between units of the same category
function convertUnits(fromAmount, fromUnit, toUnit) {
  if (!fromUnit || !toUnit || fromUnit.category !== toUnit.category) {
    return null; // Cannot convert between different categories
  }
  
  // Convert to base unit, then to target unit
  const baseAmount = fromAmount * fromUnit.base_conversion;
  const convertedAmount = baseAmount / toUnit.base_conversion;
  
  return Math.round(convertedAmount * 1000) / 1000; // Round to 3 decimal places
}

// Add a new measurement
async function createMeasurement({ name, category, base_conversion, display_name, aliases }) {
  const [result] = await db.query(
    'INSERT INTO measurements (name, category, base_conversion, display_name, aliases) VALUES (?, ?, ?, ?, ?)',
    [name, category, base_conversion, display_name, aliases || null]
  );
  return { id: result.insertId, name, category, base_conversion, display_name, aliases };
}

// Update a measurement
async function updateMeasurement(id, { name, category, base_conversion, display_name, aliases }) {
  await db.query(
    'UPDATE measurements SET name = ?, category = ?, base_conversion = ?, display_name = ?, aliases = ? WHERE id = ?',
    [name, category, base_conversion, display_name, aliases || null, id]
  );
  return { id, name, category, base_conversion, display_name, aliases };
}

// Delete a measurement
async function deleteMeasurement(id) {
  await db.query('DELETE FROM measurements WHERE id = ?', [id]);
  return { message: 'Measurement deleted' };
}

module.exports = {
  initializeMeasurements,
  getAllMeasurements,
  findMeasurement,
  convertUnits,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement
};
