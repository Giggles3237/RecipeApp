import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { generateGroceries } from '../services/api';
import './GroceryList.css';

// Persistence keys
const STORAGE_KEY = 'groceryList.state.v1';
const PROFILE_KEY = 'groceryList.profileId.v1';

export default function GroceryList() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const recipeIds = state?.selected || [];
  const [scaleFactor, setScaleFactor] = useState(state?.scaleFactor || 1);
  const [groceries, setGroceries] = useState([]);
  const [groupedGroceries, setGroupedGroceries] = useState({});
  const [loading, setLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [profileId, setProfileId] = useState(localStorage.getItem(PROFILE_KEY) || '');

  // Load from localStorage on mount if no recipeIds provided
  useEffect(() => {
    if (recipeIds.length === 0) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setGroceries(parsed.groceries || []);
          setGroupedGroceries(parsed.groupedGroceries || {});
          setCheckedItems(new Set(parsed.checkedItems || []));
          setScaleFactor(parsed.scaleFactor || 1);
        } catch (_) {
          // ignore
        }
      }
    }
  }, []);

  // Save to localStorage when groceries or checked items change
  useEffect(() => {
    const payload = {
      groceries,
      groupedGroceries,
      checkedItems: Array.from(checkedItems),
      scaleFactor
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [groceries, groupedGroceries, checkedItems, scaleFactor]);

  const clearSaved = () => {
    localStorage.removeItem(STORAGE_KEY);
    setGroceries([]);
    setGroupedGroceries({});
    setCheckedItems(new Set());
  };

  console.log('GroceryList component state:', { 
    state, 
    recipeIds, 
    scaleFactor, 
    groceries: groceries.length,
    groupedGroceries: Object.keys(groupedGroceries).length
  });

  const handleItemCheck = (itemKey) => {
    const newCheckedItems = new Set(checkedItems);
    if (newCheckedItems.has(itemKey)) {
      newCheckedItems.delete(itemKey);
    } else {
      newCheckedItems.add(itemKey);
    }
    setCheckedItems(newCheckedItems);
  };

  const handleCheckAll = () => {
    if (checkedItems.size === groceries.length) {
      setCheckedItems(new Set());
    } else {
      const allItemKeys = groceries.map((item, idx) => `${item.category}-${idx}-${item.name}`);
      setCheckedItems(new Set(allItemKeys));
    }
  };

  const getCheckedCount = () => checkedItems.size;
  const getTotalCount = () => groceries.length;

  useEffect(() => {
    console.log('useEffect triggered with:', { recipeIds, scaleFactor, profileId });
    if (recipeIds.length > 0) {
      console.log('Generating grocery list with:', { recipeIds, scaleFactor, profileId });
      setLoading(true);
      generateGroceries(recipeIds, scaleFactor, profileId || undefined).then((data) => {
        console.log('Received grocery data:', data);
        setGroceries(data);
        
        // Group by category
        const grouped = data.reduce((acc, item) => {
          const rawCategory = item.category;
          const category = (!rawCategory || rawCategory === 'unknown') ? 'other' : rawCategory;
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        
        console.log('Grouped groceries:', grouped);
        setGroupedGroceries(grouped);
      }).catch(error => {
        console.error('Error generating grocery list:', error);
      }).finally(() => {
        setLoading(false);
      });
    } else {
      console.log('No recipe IDs provided');
    }
  }, [recipeIds, scaleFactor, profileId]);

  const handleScaleChange = (newScaleFactor) => {
    const factor = parseFloat(newScaleFactor);
    if (factor > 0 && factor <= 10) {
      setScaleFactor(factor);
      // Automatically regenerate the list when scale factor changes
      setTimeout(() => {
        setGroceries([]);
        setGroupedGroceries({});
        setCheckedItems(new Set());
        setLoading(true);
      }, 100); // Small delay to ensure state is updated
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const printContent = `
      <html>
        <head>
          <title>Grocery List</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
            .category { margin-bottom: 20px; }
            .category h2 { color: #374151; margin-bottom: 10px; }
            .item { margin: 5px 0; padding: 5px 0; border-bottom: 1px solid #f3f4f6; }
            .quantity { font-weight: bold; color: #6b7280; }
            .name { margin-left: 10px; }
            .sources { display: block; color: #9ca3af; font-size: 12px; margin-left: 10px; }
            .scale-info { color: #6b7280; font-style: italic; margin-bottom: 20px; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>Grocery List</h1>
          ${scaleFactor !== 1 ? `<div class="scale-info">Scaled by ${scaleFactor}x</div>` : ''}
          ${Object.keys(groupedGroceries).map(category => {
            const items = groupedGroceries[category];
            if (!items || items.length === 0) return '';
            return `
              <div class="category">
                <h2>${category.charAt(0).toUpperCase() + category.slice(1)}${category.endsWith('s') ? '' : 's'}</h2>
                ${items.map(item => `
                  <div class="item">
                    <span class="quantity">${formatQuantity(item)} ${item.unit}</span>
                    <span class="name">${item.name}</span>
                    ${item.sources && item.sources.length ? `<span class="sources">From: ${item.sources.join(', ')}</span>` : ''}
                  </div>
                `).join('')}
              </div>
            `;
          }).join('')}
        </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleRegenerateList = () => {
    // Clear current groceries to trigger regeneration
    setGroceries([]);
    setGroupedGroceries({});
    setCheckedItems(new Set());
    setLoading(true);
  };

  const formatQuantity = (item) => {
    const quantity = item.displayQuantity || item.quantity;
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
    
    return quantity % 1 === 0 ? quantity.toString() : quantity.toFixed(2);
  };

  const categoryOrder = ['protein', 'vegetable', 'fruit', 'dairy', 'grain', 'herb', 'spice', 'seasoning', 'oil', 'condiment', 'sweetener', 'other'];

  if (recipeIds.length === 0) {
    return (
      <div>
        <h2>Grocery List</h2>
        <p>No recipes selected. Go back and select recipes to generate a list.</p>
        <button onClick={() => navigate('/')}>Back to Recipes</button>
      </div>
    );
  }

  return (
    <div className="grocery-list-container">
      <div className="grocery-header">
        <div className="header-top">
          <button 
            onClick={() => navigate('/')}
            className="back-button"
          >
            ← Back to Recipes
          </button>
          <h2>Grocery List</h2>
        </div>
        <div className="scale-controls">
          <label htmlFor="scale-factor">Scale Factor:</label>
          <input
            id="scale-factor"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={scaleFactor}
            onChange={(e) => handleScaleChange(e.target.value)}
            className="scale-input"
          />
          <span className="scale-info">
            {scaleFactor !== 1 ? `(${scaleFactor}x)` : '(1x)'}
          </span>
          <select 
            value={profileId}
            onChange={(e) => { setProfileId(e.target.value); localStorage.setItem(PROFILE_KEY, e.target.value); }}
            className="profile-select"
            style={{ marginLeft: 10 }}
            aria-label="Category Profile"
          >
            <option value="">Default Categories</option>
            <option value="1">My Store</option>
          </select>
          <button 
            onClick={() => {
              console.log('Test button clicked. Current state:', { recipeIds, scaleFactor });
              if (recipeIds.length > 0) {
                setLoading(true);
                generateGroceries(recipeIds, scaleFactor).then((data) => {
                  console.log('Test: Received data:', data);
                  setGroceries(data);
                  const grouped = data.reduce((acc, item) => {
                    const rawCategory = item.category;
                    const category = (!rawCategory || rawCategory === 'unknown') ? 'other' : rawCategory;
                    if (!acc[category]) acc[category] = [];
                    acc[category].push(item);
                    return acc;
                  }, {});
                  setGroupedGroceries(grouped);
                  setLoading(false);
                }).catch(error => {
                  console.error('Test: Error:', error);
                  setLoading(false);
                });
              }
            }}
            className="test-button"
            style={{ marginLeft: '10px', padding: '4px 8px', fontSize: '12px' }}
          >
            Test Generate
          </button>
        </div>
        <div className="grocery-summary">
          <span className="summary-item">
            <strong>{getCheckedCount()}</strong> of <strong>{getTotalCount()}</strong> items
          </span>
          <span className="summary-item">
            <strong>{recipeIds.length}</strong> recipe{recipeIds.length !== 1 ? 's' : ''}
          </span>
          <button 
            className="check-all-btn"
            onClick={handleCheckAll}
            type="button"
          >
            {checkedItems.size === groceries.length ? 'Uncheck All' : 'Check All'}
          </button>
        </div>
        
        {groceries.length > 0 && (
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(getCheckedCount() / getTotalCount()) * 100}%` }}
              ></div>
            </div>
            <span className="progress-text">
              {Math.round((getCheckedCount() / getTotalCount()) * 100)}% Complete
            </span>
          </div>
        )}
      </div>
      
      {loading ? (
        <div className="loading-state">
          <p>Generating grocery list...</p>
        </div>
      ) : groceries.length === 0 ? (
        <div className="empty-state">
          <p>No ingredients found in the selected recipes.</p>
          <p>Try selecting different recipes or check if the recipes have ingredients.</p>
        </div>
      ) : (
        <div className="grocery-list">
          {(() => {
            const dynamicCategories = Object.keys(groupedGroceries).filter(
              (cat) => !categoryOrder.includes(cat)
            );
            const allCategories = [...categoryOrder, ...dynamicCategories];

            return allCategories.map((category) => {
              const items = groupedGroceries[category];
              if (!items || items.length === 0) return null;

              return (
                <div key={category} className="category-section">
                  <h3 className="category-header">
                    {category.charAt(0).toUpperCase() + category.slice(1)}{category.endsWith('s') ? '' : 's'}
                  </h3>
                  <ul className="items-list">
                    {items.map((item, idx) => {
                      const itemKey = `${category}-${idx}-${item.name}`;
                      const isChecked = checkedItems.has(itemKey);
                      
                      return (
                        <li key={itemKey} className={`grocery-item ${isChecked ? 'checked' : ''}`}>
                          <label className="item-label">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={() => handleItemCheck(itemKey)}
                            />
                            <span className="item-name">{item.name}</span>
                            <span className="item-quantity">{formatQuantity(item)} {item.unit}</span>
                            {item.needsReview && (
                              <span className="needs-review" title="This item may need review for standardization">⚠️</span>
                            )}
                          </label>
                            {item.detailsBySource && item.detailsBySource.length > 0 && (
                              <div style={{ marginLeft: 34, color: '#9ca3af', fontSize: 12 }}>
                                {item.detailsBySource.map((d, i) => (
                                  <div key={i}>From: {d.recipeTitle}{d.modifier ? ` — ${d.modifier}` : ''}</div>
                                ))}
                              </div>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            });
          })()}
        </div>
      )}
      
      <div className="actions">
        <button onClick={handlePrint} className="print-button">Print List</button>
        <button onClick={handleRegenerateList} className="regenerate-button">Regenerate List</button>
        <button onClick={clearSaved} className="clear-button">Clear Saved List</button>
      </div>
    </div>
  );
}
