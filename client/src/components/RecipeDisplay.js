import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRecipe, deleteRecipe, updateRecipe } from '../services/api';
import './RecipeDisplay.css';

export default function RecipeDisplay() {
  const [recipe, setRecipe] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    loadRecipe();
  }, [id]);

  async function loadRecipe() {
    try {
      setLoading(true);
      const data = await getRecipe(id);
      setRecipe(data);
      setError(null);
    } catch (err) {
      console.error('Error loading recipe:', err);
      setError('Failed to load recipe');
    } finally {
      setLoading(false);
    }
  }

  function startEditing(index = null) {
    if (!recipe) return;
    setDraft(JSON.parse(JSON.stringify(recipe)));
    setIsEditing(true);
    setEditingIndex(index);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditingIndex(null);
    setDraft(null);
  }

  function updateIngredientField(index, field, value) {
    const next = { ...draft };
    next.ingredients = next.ingredients.slice();
    next.ingredients[index] = { ...next.ingredients[index], [field]: value };
    setDraft(next);
  }

  async function saveAllChanges() {
    if (!draft) return;
    try {
      setSaving(true);
      const updated = await updateRecipe(id, {
        title: draft.title,
        ingredients: draft.ingredients,
        instructions: draft.instructions || [],
        tags: draft.tags || [],
        servings: draft.servings || recipe?.servings || 4
      });
      // Optimistically set local state
      setRecipe(updated);
      setIsEditing(false);
      setEditingIndex(null);
      setDraft(null);
    } catch (err) {
      console.error('Error saving recipe:', err);
      alert('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (window.confirm('Are you sure you want to delete this recipe?')) {
      try {
        await deleteRecipe(id);
        navigate('/');
      } catch (err) {
        console.error('Error deleting recipe:', err);
        alert('Failed to delete recipe');
      }
    }
  }

  if (loading) {
    return <div className="loading">Loading recipe...</div>;
  }

  if (error || !recipe) {
    return <div className="error">Recipe not found</div>;
  }

  const working = isEditing ? draft : recipe;

  return (
    <div className="recipe-display">
      <div className="recipe-header">
        <h1>{working.title}</h1>
        <div className="recipe-actions">
          {isEditing ? (
            <>
              <button 
                className="edit-button"
                onClick={saveAllChanges}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button 
                className="back-button"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </button>
            </>
          ) : (
            <button 
              className="edit-button"
              onClick={() => startEditing(null)}
            >
              Edit Recipe
            </button>
          )}
          <button 
            className="delete-button"
            onClick={handleDelete}
            disabled={saving}
          >
            Delete Recipe
          </button>
          <button 
            className="back-button"
            onClick={() => navigate('/')}
            disabled={saving}
          >
            Back to Recipes
          </button>
        </div>
      </div>

      {working.tags && working.tags.length > 0 && (
        <div className="recipe-tags">
          {working.tags.map((tag, index) => (
            <button
              key={index}
              className="tag clickable"
              onClick={() => navigate('/', { state: { searchTag: tag } })}
              title={`Search for recipes with tag: ${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="recipe-content">
        <div className="ingredients-section">
          <h2>Ingredients</h2>
          <ul className="ingredients-list">
            {working.ingredients && working.ingredients.map((ingredient, index) => {
              const isRowEditing = isEditing && editingIndex === index;
              return (
                <li 
                  key={index} 
                  className={`ingredient-item${isRowEditing ? ' editing' : ''}`}
                  onClick={() => {
                    if (!isEditing) startEditing(index); else setEditingIndex(index);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {isRowEditing ? (
                    <div className="ingredient-edit-row">
                      <input
                        type="text"
                        value={ingredient.quantity ?? ''}
                        onChange={(e) => updateIngredientField(index, 'quantity', e.target.value)}
                        className="quantity-input"
                        placeholder="Qty"
                      />
                      <input
                        type="text"
                        value={ingredient.unit ?? ''}
                        onChange={(e) => updateIngredientField(index, 'unit', e.target.value)}
                        className="unit-input"
                        placeholder="Unit"
                      />
                      <input
                        type="text"
                        value={ingredient.name ?? ''}
                        onChange={(e) => updateIngredientField(index, 'name', e.target.value)}
                        className="name-input"
                        placeholder="Ingredient"
                      />
                      <input
                        type="text"
                        value={ingredient.modifier ?? ''}
                        onChange={(e) => updateIngredientField(index, 'modifier', e.target.value)}
                        className="modifier-input"
                        placeholder="Modifier (minced, chopped, etc.)"
                      />
                      <button 
                        className="back-button"
                        onClick={(e) => { e.stopPropagation(); setEditingIndex(null); }}
                        type="button"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <>
                      {ingredient.quantity && <span className="quantity">{ingredient.quantity}</span>}
                      {ingredient.unit && <span className="unit">{ingredient.unit}</span>}
                      <span className="name">{ingredient.name}</span>
                      {ingredient.modifier && <span className="modifier"> — {ingredient.modifier}</span>}
                      {ingredient.category && <span className="category">({ingredient.category})</span>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="instructions-section">
          <h2>Instructions</h2>
          <ol className="instructions-list">
            {working.instructions && working.instructions.map((instruction, index) => (
              <li key={index} className="instruction-item">
                {instruction}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {working.sourceUrl && (
        <div className="recipe-source">
          <p>Source: <a href={working.sourceUrl} target="_blank" rel="noopener noreferrer">{working.sourceUrl}</a></p>
        </div>
      )}
    </div>
  );
}
