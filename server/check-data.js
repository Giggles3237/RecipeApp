// Prints the first few recipes as stored. Uses the app's settings (server/.env).
// Run: node check-data.js
const pool = require('./config/db');

async function checkData() {
  try {
    console.log('Checking recipes table data...');
    const [rows] = await pool.query('SELECT * FROM recipes LIMIT 3');

    console.log('Found', rows.length, 'recipes:');
    rows.forEach((row, index) => {
      console.log(`\nRecipe ${index + 1}:`);
      console.log('ID:', row.id);
      console.log('Title:', row.title);
      console.log('Ingredients (raw):', row.ingredients);
      console.log('Instructions (raw):', row.instructions);
      console.log('Tags (raw):', row.tags);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkData();
