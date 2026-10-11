const express = require('express');
const cors = require('cors');
require('dotenv').config();

const recipeRoutes = require('./routes/recipeRoutes');
const standardizationService = require('./services/standardizationService');

const app = express();

// CORS: only allow the sites listed in ALLOWED_ORIGINS. If unset (local dev), allow all.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors(
    allowedOrigins.length
      ? {
          origin(origin, cb) {
            // Allow non-browser requests (no Origin header) and listed origins
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error('Not allowed by CORS'));
          },
        }
      : undefined
  )
);

// Parse JSON bodies. Limit is raised so recipe photos (base64) fit.
app.use(express.json({ limit: '15mb' }));

// Mount our API routes under /api
app.use('/api', recipeRoutes);

// Health check route
app.get('/', (req, res) => {
  res.send('Recipe API is running');
});

// Friendly error for oversized uploads / bad JSON instead of an HTML stack trace
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload too large. Try a smaller photo.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Server error' });
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

// Start the server (skipped when imported by tests)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    await initializeServer();
  });
}

module.exports = app;
