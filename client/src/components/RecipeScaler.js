import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRecipe, scaleRecipe } from '../services/api';

export default function RecipeScaler() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [scaledRecipe, setScaledRecipe] = useState(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id) {
      getRecipe(id).then(data => {
        setRecipe(data);
        setScaledRecipe(data);
      }).catch(error => {
        console.error('Error loading recipe:', error);
      });
    }
  }, [id]);

  const handleScale = async () => {
    if (!recipe || scaleFactor <= 0) return;
    
    setLoading(true);
    try {
      const scaled = await scaleRecipe(id, scaleFactor);
      setScaledRecipe(scaled);
    } catch (error) {
      console.error('Error scaling recipe:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatQuantity = (quantity) => {
    if (!quantity) return '';
    // Convert to fraction if it makes sense
    if (quantity < 1) {
      const fractions = {
        0.125: '1/8',
        0.25: '1/4',
        0.33: '1/3',
        0.5: '1/2',
        0.67: '2/3',
        0.75: '3/4'
      };
      const closest = Object.keys(fractions).find(f => Math.abs(parseFloat(f) - quantity) < 0.02);
      if (closest) return fractions[closest];
    }
    
    // Round to reasonable precision
    return quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(2);
  };

  if (!recipe) {
    return (
      <div>
        <h2>Recipe Scaler</h2>
        <p>Loading recipe...</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Scale Recipe: {recipe.title}</h2>
      
      <div className="scaling-controls">
        <label>
          Scale Factor:
          <input 
            type="number" 
            value={scaleFactor} 
            onChange={(e) => setScaleFactor(parseFloat(e.target.value) || 1)}
            min="0.1"
            max="10"
            step="0.1"
            style={{ marginLeft: '10px', width: '80px' }}
          />
        </label>
        <button onClick={handleScale} disabled={loading} style={{ marginLeft: '10px' }}>
          {loading ? 'Scaling...' : 'Scale Recipe'}
        </button>
        <button onClick={() => navigate('/')} style={{ marginLeft: '10px' }}>
          Back to Recipes
        </button>
      </div>

      {scaledRecipe && (
        <div className="scaled-recipe">
          <h3>Scaled Recipe</h3>
          {scaledRecipe.scaleFactor && scaledRecipe.scaleFactor !== 1 && (
            <p style={{ color: '#666', fontStyle: 'italic' }}>
              Scaled by {scaledRecipe.scaleFactor}x 
              {scaledRecipe.originalServings && scaledRecipe.scaledServings && (
                ` (${scaledRecipe.originalServings} → ${scaledRecipe.scaledServings} servings)`
              )}
            </p>
          )}

          <div className="recipe-section">
            <h4>Ingredients</h4>
            <ul>
              {scaledRecipe.ingredients.map((ingredient, idx) => (
                <li key={idx}>
                  {formatQuantity(ingredient.quantity)} {ingredient.unit} {ingredient.name}
                  {ingredient.converted && (
                    <span style={{ color: '#666', fontSize: '0.9em' }}>
                      {' '}(converted from {formatQuantity(ingredient.originalQuantity)} {ingredient.originalUnit})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="recipe-section">
            <h4>Instructions</h4>
            <ol>
              {scaledRecipe.instructions.map((instruction, idx) => (
                <li key={idx}>{instruction}</li>
              ))}
            </ol>
          </div>

          {scaledRecipe.tags && scaledRecipe.tags.length > 0 && (
            <div className="recipe-section">
              <h4>Tags</h4>
              <div className="tags">
                {scaledRecipe.tags.map((tag, idx) => (
                  <span key={idx} className="tag">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .scaling-controls {
          margin: 20px 0;
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
        }
        
        .scaled-recipe {
          margin-top: 20px;
        }
        
        .recipe-section {
          margin: 20px 0;
        }
        
        .recipe-section h4 {
          color: #333;
          margin-bottom: 10px;
        }
        
        .recipe-section ul, .recipe-section ol {
          margin: 0;
          padding-left: 20px;
        }
        
        .recipe-section li {
          margin: 5px 0;
          line-height: 1.4;
        }
        
        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .tag {
          background: #007bff;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.9em;
        }
      `}</style>
    </div>
  );
}

