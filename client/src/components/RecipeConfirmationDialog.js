import React, { useState, useEffect } from 'react';
import { confirmRecipe } from '../services/api';
import './RecipeConfirmationDialog.css';

export default function RecipeConfirmationDialog({ 
  recipe, 
  isOpen, 
  onClose, 
  onConfirm 
}) {
  const [loading, setLoading] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [editingInstruction, setEditingInstruction] = useState(null);
  const [editingTag, setEditingTag] = useState(null);

  // Initialize editing recipe when dialog opens or recipe changes
  useEffect(() => {
    if (isOpen && recipe) {
      const normalized = {
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
        tags: Array.isArray(recipe.tags) ? recipe.tags : []
      };
      setEditingRecipe(JSON.parse(JSON.stringify(normalized)));
    }
  }, [isOpen, recipe]);

  if (!isOpen || !recipe || !editingRecipe) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const unreviewedCount = Array.isArray(editingRecipe?.ingredients)
        ? editingRecipe.ingredients.filter((ing) => ing && ing.needsReview).length
        : 0;
      let force = false;
      if (unreviewedCount > 0) {
        const proceed = window.confirm(
          `${unreviewedCount} ingredient(s) are marked as needing review. Save anyway?`
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
        force = true;
      }
      const payload = { ...editingRecipe, force };
      const response = await confirmRecipe(payload);
      console.log('Recipe confirmed successfully:', response);
      onConfirm();
    } catch (error) {
      console.error('Error confirming recipe:', error);
      // More detailed error logging
      if (error.message) {
        console.error('Error message:', error.message);
      }
      if (error.stack) {
        console.error('Error stack:', error.stack);
      }
      alert('Failed to save recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isNewIngredient = (ingredient) => {
    return ingredient.isNewIngredient || ingredient.needsReview || ingredient.confidence === 'low';
  };

  const isNewUnit = (ingredient) => {
    return ingredient.isNewUnit || (!ingredient.unitData && ingredient.unit);
  };

  const isNewTag = (tag) => {
    // For now, we'll assume all tags are new since we don't have a tag database
    // This could be enhanced later with a tag standardization service
    return true;
  };

  const isNewInstruction = (instruction) => {
    // Instructions are always new since they're recipe-specific
    return true;
  };

  const handleIngredientEdit = (index) => {
    setEditingIngredient(index);
  };

  const handleIngredientSave = (index) => {
    setEditingIngredient(null);
  };

  const handleIngredientChange = (index, field, value) => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.ingredients[index] = { 
      ...updatedRecipe.ingredients[index], 
      [field]: value,
      needsReview: false
    };
    setEditingRecipe(updatedRecipe);
  };

  const handleInstructionEdit = (index) => {
    setEditingInstruction(index);
  };

  const handleInstructionSave = (index) => {
    setEditingInstruction(null);
  };

  const handleInstructionChange = (index, value) => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.instructions[index] = value;
    setEditingRecipe(updatedRecipe);
  };

  const handleTagEdit = (index) => {
    setEditingTag(index);
  };

  const handleTagSave = (index) => {
    setEditingTag(null);
  };

  const handleTagChange = (index, value) => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.tags[index] = value;
    setEditingRecipe(updatedRecipe);
  };

  const handleTitleChange = (value) => {
    setEditingRecipe({ ...editingRecipe, title: value });
  };

  const addIngredient = () => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.ingredients.push({
      quantity: '',
      unit: '',
      name: '',
      isNewIngredient: true,
      isNewUnit: true,
      needsReview: true
    });
    setEditingRecipe(updatedRecipe);
    setEditingIngredient(updatedRecipe.ingredients.length - 1);
  };

  const removeIngredient = (index) => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.ingredients.splice(index, 1);
    setEditingRecipe(updatedRecipe);
  };

  const addInstruction = () => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.instructions.push('');
    setEditingRecipe(updatedRecipe);
    setEditingInstruction(updatedRecipe.instructions.length - 1);
  };

  const removeInstruction = (index) => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.instructions.splice(index, 1);
    setEditingRecipe(updatedRecipe);
  };

  const addTag = () => {
    const updatedRecipe = { ...editingRecipe };
    if (!updatedRecipe.tags) updatedRecipe.tags = [];
    updatedRecipe.tags.push('');
    setEditingRecipe(updatedRecipe);
    setEditingTag(updatedRecipe.tags.length - 1);
  };

  const removeTag = (index) => {
    const updatedRecipe = { ...editingRecipe };
    updatedRecipe.tags.splice(index, 1);
    setEditingRecipe(updatedRecipe);
  };

  return (
    <div className="recipe-confirmation-overlay">
      <div className="recipe-confirmation-dialog">
        <div className="recipe-confirmation-header">
          <h2>Confirm Recipe Import</h2>
          <button 
            className="close-button" 
            onClick={onClose}
            disabled={loading}
          >
            ×
          </button>
        </div>

        <div className="recipe-confirmation-content">
          <div className="recipe-title-section">
            <div className="editable-title">
              {editingRecipe && (
                <input
                  type="text"
                  value={editingRecipe.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="title-input"
                  placeholder="Recipe title"
                />
              )}
            </div>
            {recipe.sourceUrl && (
              <p className="source-url">Source: <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{recipe.sourceUrl}</a></p>
            )}
          </div>

          <div className="recipe-section">
            <div className="section-header">
              <h4>Ingredients</h4>
              <button className="add-button" onClick={addIngredient}>
                + Add Ingredient
              </button>
            </div>
            <div className="ingredients-list">
              {editingRecipe && editingRecipe.ingredients.map((ingredient, index) => (
                <div 
                  key={index} 
                  className={`ingredient-item ${isNewIngredient(ingredient) ? 'new-item' : ''}`}
                >
                  <div className="ingredient-content">
                    <input
                      type="text"
                      value={ingredient.quantity || ''}
                      onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                      className="ingredient-quantity-input"
                      placeholder="Qty"
                    />
                    <input
                      type="text"
                      value={ingredient.unit || ''}
                      onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                      className={`ingredient-unit-input ${isNewUnit(ingredient) ? 'new-unit' : ''}`}
                      placeholder="Unit"
                    />
                    <input
                      type="text"
                      value={ingredient.name || ''}
                      onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                      className={`ingredient-name-input ${isNewIngredient(ingredient) ? 'new-name' : ''}`}
                      placeholder="Ingredient name"
                    />
                    <input
                      type="text"
                      value={ingredient.modifier || ''}
                      onChange={(e) => handleIngredientChange(index, 'modifier', e.target.value)}
                      className="ingredient-modifier-input"
                      placeholder="Modifier (e.g., minced, peeled and chopped)"
                    />
                  </div>
                  <div className="ingredient-actions">
                    <div className="ingredient-status">
                      {isNewIngredient(ingredient) && (
                        <span className="status-badge new">New Ingredient</span>
                      )}
                      {isNewUnit(ingredient) && (
                        <span className="status-badge new">New Unit</span>
                      )}
                      {!isNewIngredient(ingredient) && !isNewUnit(ingredient) && (
                        <span className="status-badge existing">Existing</span>
                      )}
                    </div>
                    <button 
                      className="remove-button"
                      onClick={() => removeIngredient(index)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  {ingredient.originalName && ingredient.originalName !== ingredient.name && (
                    <div className="original-name">
                      Original: {ingredient.originalName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="recipe-section">
            <div className="section-header">
              <h4>Instructions</h4>
              <button className="add-button" onClick={addInstruction}>
                + Add Step
              </button>
            </div>
            <div className="instructions-list">
              {editingRecipe && editingRecipe.instructions.map((instruction, index) => (
                <div 
                  key={index} 
                  className={`instruction-item ${isNewInstruction(instruction) ? 'new-item' : ''}`}
                >
                  <span className="instruction-number">{index + 1}.</span>
                  <input
                    type="text"
                    value={instruction}
                    onChange={(e) => handleInstructionChange(index, e.target.value)}
                    className="instruction-input"
                    placeholder="Enter instruction step"
                  />
                  <div className="instruction-actions">
                    <span className="status-badge new">New</span>
                    <button 
                      className="remove-button"
                      onClick={() => removeInstruction(index)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="recipe-section">
            <div className="section-header">
              <h4>Tags</h4>
              <button className="add-button" onClick={addTag}>
                + Add Tag
              </button>
            </div>
            <div className="tags-list">
              {editingRecipe && editingRecipe.tags && editingRecipe.tags.map((tag, index) => (
                <div key={index} className="tag-item">
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => handleTagChange(index, e.target.value)}
                    className="tag-input"
                    placeholder="Enter tag"
                  />
                  <div className="tag-actions">
                    <span className="status-badge new">New</span>
                    <button 
                      className="remove-button"
                      onClick={() => removeTag(index)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="recipe-summary">
            <div className="summary-item">
              <strong>Total Ingredients:</strong> {editingRecipe ? editingRecipe.ingredients.length : 0}
            </div>
            <div className="summary-item">
              <strong>New Ingredients:</strong> {editingRecipe ? editingRecipe.ingredients.filter(isNewIngredient).length : 0}
            </div>
            <div className="summary-item">
              <strong>New Units:</strong> {editingRecipe ? editingRecipe.ingredients.filter(isNewUnit).length : 0}
            </div>
            <div className="summary-item">
              <strong>Instructions:</strong> {editingRecipe ? editingRecipe.instructions.length : 0}
            </div>
            {editingRecipe && editingRecipe.tags && (
              <div className="summary-item">
                <strong>Tags:</strong> {editingRecipe.tags.length}
              </div>
            )}
          </div>
        </div>

        <div className="recipe-confirmation-actions">
          <button 
            className="cancel-button" 
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            className="confirm-button" 
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Import Recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}
