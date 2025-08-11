const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: 'sales-db.mysql.database.azure.com',
  user: 'member',
  password: 'results24',
  database: 'sales-db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
};

async function testConnection() {
  let connection;
  
  try {
    console.log('Attempting to connect to MySQL database...');
    console.log('Host:', dbConfig.host);
    console.log('User:', dbConfig.user);
    console.log('Database:', dbConfig.database);
    
    // Create connection
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Successfully connected to MySQL database!');
    
    // Test a simple query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Database query test successful:', rows);
    
    // Get database version
    const [versionRows] = await connection.execute('SELECT VERSION() as version');
    console.log('✅ MySQL Version:', versionRows[0].version);
    
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 This might be an authentication issue. Check your username and password.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 This might be a network issue. Check if the database is accessible.');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 This might be a DNS resolution issue. Check the hostname.');
    }
    
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed.');
    }
  }
}

// Run the test
testConnection(); 