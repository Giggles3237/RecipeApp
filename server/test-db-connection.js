// Quick connectivity check. Uses the same settings as the app (server/.env).
// Run: node test-db-connection.js
const pool = require('./config/db');

async function testConnection() {
  try {
    console.log('Attempting to connect to MySQL database...');
    console.log('Host:', process.env.DB_HOST);
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);

    const [rows] = await pool.query('SELECT 1 as test');
    console.log('✅ Database query test successful:', rows);

    const [versionRows] = await pool.query('SELECT VERSION() as version');
    console.log('✅ MySQL Version:', versionRows[0].version);
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);

    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Authentication issue. Check DB_USER and DB_PASSWORD in .env.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Network issue. Check the database firewall allows your IP.');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 DNS issue. Check DB_HOST in .env.');
    } else if (/certificate/i.test(error.message)) {
      console.log('\n💡 TLS certificate issue. See DB_SSL_REJECT_UNAUTHORIZED in .env.example.');
    }
  } finally {
    await pool.end();
    console.log('Connection closed.');
  }
}

testConnection();
