const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const recipeRoutes = require('./routes/recipeRoutes');
const standardizationService = require('./services/standardizationService');

const app = express();

// Middleware
app.use(cors());              // enable CORS for all origins
app.use(bodyParser.json());   // parse JSON bodies

// Mount our API routes under /api
app.use('/api', recipeRoutes);

// Health check route
app.get('/', (req, res) => {
  res.send('Recipe API is running');
});

// Initialize standardization tables
async function initializeServer() {
  try {
    await standardizationService.initializeStandardization();
    console.log('Standardization tables initialized');
  } catch (error) {
    console.error('Error initializing standardization:', error);
  }
}

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await initializeServer();
});
