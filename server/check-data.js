const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'sales-db.mysql.database.azure.com',
  user: 'clasko',
  password: 'your_clasko_password', // Replace with your actual password
  database: 'recipe_db',
  ssl: {
    rejectUnauthorized: false
  }
};

async function checkData() {
  let connection;
  
  try {
    connection = await mysql.createConnection(dbConfig);
    
    console.log('Checking recipes table data...');
    const [rows] = await connection.execute('SELECT * FROM recipes LIMIT 3');
    
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
    if (connection) {
      await connection.end();
    }
  }
}

checkData(); 