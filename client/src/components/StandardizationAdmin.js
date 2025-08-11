import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchMeasurements, 
  fetchIngredients, 
  fetchIngredientCategories,
  createMeasurement, 
  createIngredient 
} from '../services/api';

export default function StandardizationAdmin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('measurements');
  const [measurements, setMeasurements] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [measurementForm, setMeasurementForm] = useState({
    name: '',
    category: 'volume',
    base_conversion: '',
    display_name: '',
    aliases: ''
  });

  const [ingredientForm, setIngredientForm] = useState({
    name: '',
    category: 'other',
    aliases: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [measurementData, ingredientData, categoryData] = await Promise.all([
        fetchMeasurements(),
        fetchIngredients(),
        fetchIngredientCategories()
      ]);
      setMeasurements(measurementData);
      setIngredients(ingredientData);
      setCategories(categoryData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMeasurementSubmit = async (e) => {
    e.preventDefault();
    try {
      await createMeasurement({
        ...measurementForm,
        base_conversion: parseFloat(measurementForm.base_conversion)
      });
      setMeasurementForm({
        name: '',
        category: 'volume',
        base_conversion: '',
        display_name: '',
        aliases: ''
      });
      loadData(); // Reload data
    } catch (error) {
      console.error('Error creating measurement:', error);
    }
  };

  const handleIngredientSubmit = async (e) => {
    e.preventDefault();
    try {
      await createIngredient(ingredientForm);
      setIngredientForm({
        name: '',
        category: 'other',
        aliases: ''
      });
      loadData(); // Reload data
    } catch (error) {
      console.error('Error creating ingredient:', error);
    }
  };

  const groupedMeasurements = measurements.reduce((acc, measurement) => {
    if (!acc[measurement.category]) acc[measurement.category] = [];
    acc[measurement.category].push(measurement);
    return acc;
  }, {});

  const groupedIngredients = ingredients.reduce((acc, ingredient) => {
    if (!acc[ingredient.category]) acc[ingredient.category] = [];
    acc[ingredient.category].push(ingredient);
    return acc;
  }, {});

  return (
    <div>
      <h2>Standardization Administration</h2>
      
      <div className="admin-tabs">
        <button 
          className={activeTab === 'measurements' ? 'active' : ''}
          onClick={() => setActiveTab('measurements')}
        >
          Measurements
        </button>
        <button 
          className={activeTab === 'ingredients' ? 'active' : ''}
          onClick={() => setActiveTab('ingredients')}
        >
          Ingredients
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {activeTab === 'measurements' && (
        <div className="tab-content">
          <div className="form-section">
            <h3>Add New Measurement</h3>
            <form onSubmit={handleMeasurementSubmit} className="admin-form">
              <div className="form-row">
                <label>
                  Name (abbreviation):
                  <input
                    type="text"
                    value={measurementForm.name}
                    onChange={(e) => setMeasurementForm({...measurementForm, name: e.target.value})}
                    required
                    placeholder="e.g., tsp, cup, oz"
                  />
                </label>
                <label>
                  Display Name:
                  <input
                    type="text"
                    value={measurementForm.display_name}
                    onChange={(e) => setMeasurementForm({...measurementForm, display_name: e.target.value})}
                    required
                    placeholder="e.g., teaspoon, cup, ounce"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Category:
                  <select
                    value={measurementForm.category}
                    onChange={(e) => setMeasurementForm({...measurementForm, category: e.target.value})}
                  >
                    <option value="volume">Volume</option>
                    <option value="weight">Weight</option>
                    <option value="count">Count</option>
                    <option value="special">Special</option>
                    <option value="container">Container</option>
                  </select>
                </label>
                <label>
                  Base Conversion Factor:
                  <input
                    type="number"
                    step="any"
                    value={measurementForm.base_conversion}
                    onChange={(e) => setMeasurementForm({...measurementForm, base_conversion: e.target.value})}
                    required
                    placeholder="e.g., 4.92892 for tsp to ml"
                  />
                </label>
              </div>
              <label>
                Aliases (comma-separated):
                <input
                  type="text"
                  value={measurementForm.aliases}
                  onChange={(e) => setMeasurementForm({...measurementForm, aliases: e.target.value})}
                  placeholder="e.g., teaspoons, t"
                />
              </label>
              <button type="submit">Add Measurement</button>
            </form>
          </div>

          <div className="data-section">
            <h3>Current Measurements</h3>
            {Object.entries(groupedMeasurements).map(([category, items]) => (
              <div key={category} className="category-group">
                <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                <div className="items-list">
                  {items.map(measurement => (
                    <div key={measurement.id} className="item-card">
                      <strong>{measurement.name}</strong> ({measurement.display_name})
                      <br />
                      <small>Conversion: {measurement.base_conversion}</small>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ingredients' && (
        <div className="tab-content">
          <div className="form-section">
            <h3>Add New Ingredient</h3>
            <form onSubmit={handleIngredientSubmit} className="admin-form">
              <div className="form-row">
                <label>
                  Name:
                  <input
                    type="text"
                    value={ingredientForm.name}
                    onChange={(e) => setIngredientForm({...ingredientForm, name: e.target.value})}
                    required
                    placeholder="e.g., chicken breast, olive oil"
                  />
                </label>
                <label>
                  Category:
                  <select
                    value={ingredientForm.category}
                    onChange={(e) => setIngredientForm({...ingredientForm, category: e.target.value})}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <label>
                Aliases (comma-separated):
                <input
                  type="text"
                  value={ingredientForm.aliases}
                  onChange={(e) => setIngredientForm({...ingredientForm, aliases: e.target.value})}
                  placeholder="e.g., chicken breasts, boneless chicken breast"
                />
              </label>
              <button type="submit">Add Ingredient</button>
            </form>
          </div>

          <div className="data-section">
            <h3>Current Ingredients ({ingredients.length} total)</h3>
            {Object.entries(groupedIngredients).map(([category, items]) => (
              <div key={category} className="category-group">
                <h4>{category.charAt(0).toUpperCase() + category.slice(1)} ({items.length})</h4>
                <div className="items-list">
                  {items.slice(0, 10).map(ingredient => ( // Show only first 10 per category
                    <div key={ingredient.id} className="item-card">
                      <strong>{ingredient.name}</strong>
                      {ingredient.aliases && (
                        <><br /><small>Aliases: {ingredient.aliases}</small></>
                      )}
                    </div>
                  ))}
                  {items.length > 10 && (
                    <div className="item-card more-items">
                      ... and {items.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="actions">
        <button onClick={() => navigate('/')}>Back to Recipes</button>
      </div>

      <style jsx>{`
        .admin-tabs {
          display: flex;
          margin-bottom: 20px;
          border-bottom: 1px solid #ddd;
        }
        
        .admin-tabs button {
          padding: 10px 20px;
          border: none;
          background: none;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        
        .admin-tabs button.active {
          border-bottom-color: #007bff;
          color: #007bff;
        }
        
        .tab-content {
          margin-top: 20px;
        }
        
        .form-section {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        
        .admin-form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        
        .admin-form label {
          display: flex;
          flex-direction: column;
          font-weight: 500;
        }
        
        .admin-form input, .admin-form select {
          margin-top: 5px;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .admin-form button {
          background: #007bff;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          align-self: flex-start;
        }
        
        .admin-form button:hover {
          background: #0056b3;
        }
        
        .data-section h3 {
          color: #333;
          margin-bottom: 20px;
        }
        
        .category-group {
          margin-bottom: 30px;
        }
        
        .category-group h4 {
          color: #666;
          border-bottom: 1px solid #eee;
          padding-bottom: 5px;
          margin-bottom: 15px;
        }
        
        .items-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
        }
        
        .item-card {
          background: white;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.9em;
        }
        
        .item-card.more-items {
          background: #f8f9fa;
          color: #666;
          font-style: italic;
          text-align: center;
        }
        
        .actions {
          margin: 40px 0 20px 0;
          padding: 20px 0;
          border-top: 1px solid #ddd;
        }
      `}</style>
    </div>
  );
}

