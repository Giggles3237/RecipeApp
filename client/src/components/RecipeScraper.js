import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseRecipeWithAI, scrapeRecipe } from '../services/api';
import RecipeConfirmationDialog from './RecipeConfirmationDialog';

export default function RecipeScraper() {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [scrapedRecipe, setScrapedRecipe] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const navigate = useNavigate();

  async function handleScrape(e) {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    try {
      const recipe = await scrapeRecipe(url, useAI);
      setScrapedRecipe(recipe);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Scraping error:', error);
      alert('Failed to scrape recipe. Please try a different URL or use the AI parsing option.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAI(e) {
    e.preventDefault();
    if (!text) return;
    setLoading(true);
    try {
      const recipe = await parseRecipeWithAI(text);
      setScrapedRecipe(recipe);
      setShowConfirmation(true);
    } catch (error) {
      console.error('AI parsing error:', error);
      alert('Failed to parse recipe with AI. Please try again with clearer recipe text.');
    } finally {
      setLoading(false);
    }
  }

  const handleConfirmRecipe = () => {
    setShowConfirmation(false);
    setScrapedRecipe(null);
    setUrl('');
    setText('');
    navigate('/');
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setScrapedRecipe(null);
  };

  return (
    <div>
      <h2>Import Recipe</h2>
      <div className="import-section">
        <form onSubmit={handleScrape} className="import-form">
          <label>
            Paste recipe URL:
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/recipe" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            <input 
              type="checkbox" 
              checked={useAI} 
              onChange={(e) => setUseAI(e.target.checked)} 
            />
            Use AI parsing (for unsupported sites)
          </label>
          <button type="submit" disabled={loading}>
            {useAI ? 'Parse with AI' : 'Scrape Recipe'}
          </button>
        </form>
        <hr />
        <form onSubmit={handleAI} className="import-form">
          <label>
            Paste raw recipe text:
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="e.g., title, ingredients, instructions" />
          </label>
          <button type="submit" disabled={loading}>Parse via AI</button>
        </form>
      </div>
      {loading && <p>Processing… please wait.</p>}

      <RecipeConfirmationDialog
        recipe={scrapedRecipe}
        isOpen={showConfirmation}
        onClose={handleCloseConfirmation}
        onConfirm={handleConfirmRecipe}
      />
    </div>
  );
}
