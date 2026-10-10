import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getRecipe, parseRecipeWithAI, scrapeRecipe, reviewRecipe } from '../services/api';
import RecipeConfirmationDialog from './RecipeConfirmationDialog';

// Turn a saved ingredient back into an editable line, keeping its preparation note
function ingredientToLine(i) {
  if (typeof i === 'string') return i;
  const main = [i.quantity, i.unit, i.name].filter((v) => v !== null && v !== undefined && v !== '').join(' ');
  return i.modifier ? `${main}, ${i.modifier}` : main;
}

export default function RecipeForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [tags, setTags] = useState('');
  const [servings, setServings] = useState('');

  const [aiText, setAiText] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [parsedRecipe, setParsedRecipe] = useState(null);

  useEffect(() => {
    if (isEdit) {
      getRecipe(id).then((data) => {
        setTitle(data.title || '');
        setIngredients((data.ingredients || []).map(ingredientToLine).join('\n'));
        setInstructions(Array.isArray(data.instructions) ? data.instructions.join('\n') : (data.instructions || ''));
        setTags(Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || ''));
        setServings(data.servings || '');
      }).catch(error => {
        console.error('Error loading recipe:', error);
      });
    }
  }, [id, isEdit]);

  async function openReview(fn) {
    setIsProcessing(true);
    try {
      const result = await fn();
      setParsedRecipe(result);
      setShowReviewDialog(true);
    } catch (error) {
      console.error('Processing failed:', error);
      alert(error.message || 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  // Typed-in recipes go through the same ingredient check as imports before saving
  function handleSubmit(e) {
    e.preventDefault();
    openReview(() =>
      reviewRecipe({
        id: isEdit ? id : undefined,
        title,
        ingredients: ingredients.split('\n').map((l) => l.trim()).filter(Boolean),
        instructions: instructions.split('\n').map((l) => l.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        servings: servings || undefined,
      })
    );
  }

  const handleAIParse = () => {
    if (!aiText.trim()) return;
    openReview(() => parseRecipeWithAI(aiText));
  };

  const handleScrape = () => {
    if (!scrapeUrl.trim()) return;
    openReview(() => scrapeRecipe(scrapeUrl));
  };

  const handleRecipeSaved = (saved) => {
    setShowReviewDialog(false);
    navigate(saved && saved.id ? `/recipe/${saved.id}` : '/');
  };

  const handleReviewClose = () => {
    setShowReviewDialog(false);
    setParsedRecipe(null);
  };

  return (
    <div className="recipe-form-container">
      <h2>{isEdit ? 'Edit Recipe' : 'Add Recipe'}</h2>
      
      {/* AI Parsing Section */}
      {!isEdit && (
        <div className="ai-section">
          <h3>Parse Recipe with AI</h3>
          <p>Paste recipe text and let AI extract the ingredients and instructions:</p>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="Paste your recipe text here..."
            rows={6}
            className="ai-textarea"
          />
          <button 
            onClick={handleAIParse} 
            disabled={isProcessing || !aiText.trim()}
            className="ai-parse-btn"
          >
            {isProcessing ? 'Parsing...' : 'Parse with AI'}
          </button>
        </div>
      )}

      {/* Recipe Scraping Section */}
      {!isEdit && (
        <div className="scrape-section">
          <h3>Scrape Recipe from URL</h3>
          <p>Enter a recipe URL to automatically extract the recipe:</p>
          <input
            type="url"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder="https://example.com/recipe"
            className="scrape-url-input"
          />
          <button 
            onClick={handleScrape} 
            disabled={isProcessing || !scrapeUrl.trim()}
            className="scrape-btn"
          >
            {isProcessing ? 'Scraping...' : 'Scrape Recipe'}
          </button>
        </div>
      )}

      {/* Manual Recipe Entry */}
      <div className="manual-section">
        <h3>{isEdit ? 'Edit Recipe Details' : 'Manual Recipe Entry'}</h3>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Title
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Ingredients (one per line)
            <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={6} required />
          </label>
          <label>
            Instructions (one per line)
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} required />
          </label>
          <label>
            Tags (comma separated)
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label>
            Servings
            <input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={isProcessing}>
              {isProcessing ? 'Checking ingredients…' : isEdit ? 'Review & Update' : 'Review & Create'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="secondary">Cancel</button>
          </div>
        </form>
      </div>

      {/* Recipe Review Dialog */}
      <RecipeConfirmationDialog
        recipe={parsedRecipe}
        isOpen={showReviewDialog}
        onClose={handleReviewClose}
        onConfirm={handleRecipeSaved}
      />

      <style>{`
        .recipe-form-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .ai-section,
        .scrape-section,
        .manual-section {
          margin-bottom: 40px;
          padding: 20px;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          background: #f8f9fa;
        }

        .ai-section h3,
        .scrape-section h3,
        .manual-section h3 {
          margin: 0 0 15px 0;
          color: #495057;
          border-bottom: 2px solid #007bff;
          padding-bottom: 5px;
        }

        .ai-textarea,
        .scrape-url-input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 1em;
          margin-bottom: 15px;
        }

        .ai-parse-btn,
        .scrape-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1em;
          transition: background 0.2s ease;
        }

        .ai-parse-btn:hover:not(:disabled),
        .scrape-btn:hover:not(:disabled) {
          background: #218838;
        }

        .ai-parse-btn:disabled,
        .scrape-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .form label {
          display: block;
          margin-bottom: 15px;
        }

        .form label input,
        .form label textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1em;
          margin-top: 5px;
        }

        .form-actions {
          display: flex;
          gap: 15px;
          margin-top: 20px;
        }

        .primary,
        .secondary {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1em;
        }

        .primary {
          background: #007bff;
          color: white;
        }

        .primary:hover {
          background: #0056b3;
        }

        .secondary {
          background: #6c757d;
          color: white;
        }

        .secondary:hover {
          background: #5a6268;
        }

        @media (max-width: 768px) {
          .recipe-form-container {
            padding: 15px;
          }

          .form-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
