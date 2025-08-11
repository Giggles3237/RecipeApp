import React, { useState, useEffect } from 'react';
import { confirmRecipe } from '../services/api';

export default function RecipeReviewDialog({ 
  isOpen, 
  onClose, 
  parsedRecipe, 
  onRecipeSaved,
  sourceType = 'ai' // 'ai' or 'scrape'
}) {
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (parsedRecipe) {
      setRecipe(parsedRecipe);
    }
  }, [parsedRecipe]);

  if (!isOpen || !recipe) return null;

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = [...recipe.ingredients];
    updatedIngredients[index] = {
      ...updatedIngredients[index],
      [field]: value
    };
    setRecipe({ ...recipe, ingredients: updatedIngredients });
  };

  const handleIngredientNameEdit = (index, newName) => {
    handleIngredientChange(index, 'name', newName);
    handleIngredientChange(index, 'needsReview', false);
  };

  const handleIngredientCategoryChange = (index, category) => {
    handleIngredientChange(index, 'category', category);
    handleIngredientChange(index, 'needsReview', false);
  };

  const handleUnitEdit = (index, newUnit) => {
    handleIngredientChange(index, 'unit', newUnit);
    handleIngredientChange(index, 'needsReview', false);
  };

  const handleQuantityEdit = (index, newQuantity) => {
    handleIngredientChange(index, 'quantity', parseFloat(newQuantity) || 0);
    handleIngredientChange(index, 'needsReview', false);
  };

  const handleSaveRecipe = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Check if any ingredients still need review
      const unreviewed = recipe.ingredients.filter(ing => ing.needsReview);
      if (unreviewed.length > 0) {
        setError(`Please review ${unreviewed.length} ingredient(s) before saving`);
        setLoading(false);
        return;
      }

      const savedRecipe = await confirmRecipe(recipe);
      onRecipeSaved(savedRecipe);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save recipe');
    } finally {
      setLoading(false);
    }
  };

  const getReviewStatus = () => {
    const total = recipe.ingredients.length;
    const reviewed = recipe.ingredients.filter(ing => !ing.needsReview).length;
    return { total, reviewed, needsReview: total - reviewed };
  };

  const reviewStatus = getReviewStatus();

  return (
    <div className="recipe-review-overlay">
      <div className="recipe-review-dialog">
        <div className="review-header">
          <h2>Review Recipe Before Saving</h2>
          <div className="review-summary">
            <span className="status-item">
              <strong>{reviewStatus.reviewed}</strong> of <strong>{reviewStatus.total}</strong> ingredients reviewed
            </span>
            {reviewStatus.needsReview > 0 && (
              <span className="status-warning">
                ⚠️ {reviewStatus.needsReview} need{reviewStatus.needsReview !== 1 ? 's' : ''} review
              </span>
            )}
          </div>
        </div>

        <div className="recipe-preview">
          <div className="recipe-basic-info">
            <h3>{recipe.title}</h3>
            <p className="source-info">
              Source: {sourceType === 'ai' ? 'AI Parsed Text' : 'Scraped from URL'}
            </p>
            {recipe.tags && recipe.tags.length > 0 && (
              <div className="recipe-tags">
                {recipe.tags.map((tag, idx) => (
                  <span key={idx} className="tag">{tag}</span>
                ))}
              </div>
            )}
          </div>

          <div className="ingredients-section">
            <h4>Ingredients</h4>
            <div className="ingredients-list">
              {recipe.ingredients.map((ingredient, index) => (
                <div 
                  key={index} 
                  className={`ingredient-item ${ingredient.needsReview ? 'needs-review' : 'reviewed'}`}
                >
                  <div className="ingredient-inputs">
                    <input
                      type="number"
                      step="0.01"
                      value={ingredient.quantity || ''}
                      onChange={(e) => handleQuantityEdit(index, e.target.value)}
                      className="quantity-input"
                      placeholder="Qty"
                    />
                    <input
                      type="text"
                      value={ingredient.unit || ''}
                      onChange={(e) => handleUnitEdit(index, e.target.value)}
                      className="unit-input"
                      placeholder="Unit"
                    />
                    <input
                      type="text"
                      value={ingredient.name}
                      onChange={(e) => handleIngredientNameEdit(index, e.target.value)}
                      className="name-input"
                      placeholder="Ingredient name"
                    />
                  </div>
                  
                  <div className="ingredient-meta">
                    <select
                      value={ingredient.category || 'unknown'}
                      onChange={(e) => handleIngredientCategoryChange(index, e.target.value)}
                      className="category-select"
                    >
                      <option value="protein">Protein</option>
                      <option value="vegetable">Vegetable</option>
                      <option value="fruit">Fruit</option>
                      <option value="dairy">Dairy</option>
                      <option value="grain">Grain</option>
                      <option value="herb">Herb</option>
                      <option value="spice">Spice</option>
                      <option value="seasoning">Seasoning</option>
                      <option value="oil">Oil</option>
                      <option value="condiment">Condiment</option>
                      <option value="sweetener">Sweetener</option>
                      <option value="other">Other</option>
                      <option value="unknown">Unknown</option>
                    </select>
                    
                    {ingredient.needsReview && (
                      <span className="review-flag" title="This ingredient needs review">
                        ⚠️
                      </span>
                    )}
                    
                    {ingredient.originalName && ingredient.originalName !== ingredient.name && (
                      <span className="original-name" title={`Original: ${ingredient.originalName}`}>
                        📝
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="instructions-section">
            <h4>Instructions</h4>
            <div className="instructions-list">
              {recipe.instructions.map((instruction, index) => (
                <div key={index} className="instruction-item">
                  <span className="step-number">{index + 1}.</span>
                  <span className="instruction-text">{instruction}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="review-actions">
          <button 
            onClick={onClose} 
            className="btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            onClick={handleSaveRecipe} 
            className="btn-primary"
            disabled={loading || reviewStatus.needsReview > 0}
          >
            {loading ? 'Saving...' : 'Save Recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}
