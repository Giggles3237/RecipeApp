import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchRecipes } from '../services/api';
import './RecipeList.css';

export default function RecipeList() {
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [sortOrder, setSortOrder] = useState('asc');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    // Handle search tag from navigation state
    if (location.state?.searchTag) {
      setSearchTerm(location.state.searchTag);
      // Clear the state to prevent re-applying on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    filterAndSortRecipes();
  }, [recipes, searchTerm, sortBy, sortOrder]);

  async function load() {
    const data = await fetchRecipes();
    setRecipes(data);
  }

  function filterAndSortRecipes() {
    let filtered = recipes.filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (recipe.tags && recipe.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
      return matchesSearch;
    });

    // Sort recipes
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle arrays (tags) and null values
      if (Array.isArray(aValue)) aValue = aValue.join(', ');
      if (Array.isArray(bValue)) bValue = bValue.join(', ');
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      if (sortOrder === 'asc') {
        return aValue.toString().localeCompare(bValue.toString());
      } else {
        return bValue.toString().localeCompare(aValue.toString());
      }
    });

    setFilteredRecipes(filtered);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function handleSort(field) {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }

  function getSortIcon(field) {
    if (sortBy !== field) return '↕️';
    return sortOrder === 'asc' ? '↑' : '↓';
  }

  return (
    <div className="recipe-list-container">
      <div className="recipe-list-header">
        <h2>Recipes</h2>
        <div className="recipe-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search recipes or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="sort-container">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="title">Sort by Title</option>
              <option value="tags">Sort by Tags</option>
            </select>
            <button 
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="sort-order-button"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {filteredRecipes.length === 0 && (
        <div className="no-recipes">
          {searchTerm ? 'No recipes match your search.' : 'No recipes found. Add some!'}
        </div>
      )}

      {filteredRecipes.length > 0 && (
        <div className="recipe-table-container">
          <table className="recipe-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input 
                    type="checkbox" 
                    checked={selected.length === filteredRecipes.length && filteredRecipes.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(filteredRecipes.map(r => r.id));
                      } else {
                        setSelected([]);
                      }
                    }}
                  />
                </th>
                <th 
                  className="sortable-header"
                  onClick={() => handleSort('title')}
                >
                  Title {getSortIcon('title')}
                </th>
                <th 
                  className="sortable-header"
                  onClick={() => handleSort('tags')}
                >
                  Tags {getSortIcon('tags')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.map((recipe) => (
                <tr key={recipe.id}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selected.includes(recipe.id)} 
                      onChange={() => toggleSelect(recipe.id)} 
                    />
                  </td>
                  <td>
                    <button 
                      className="recipe-title-button"
                      onClick={() => navigate(`/recipe/${recipe.id}`)}
                    >
                      {recipe.title}
                    </button>
                  </td>
                  <td className="tags-cell">
                    {recipe.tags && recipe.tags.length > 0 ? (
                      <div className="tags-display">
                        {recipe.tags.map((tag, index) => (
                          <button
                            key={index}
                            className="tag-chip clickable"
                            onClick={() => navigate(`/recipe/${recipe.id}`)}
                            title={`View ${recipe.title}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="no-tags">No tags</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected.length > 0 && (
        <div className="bulk-actions">
          <button 
            className="primary-button"
            onClick={() => navigate('/groceries', { state: { selected } })}
          >
            Generate Grocery List ({selected.length})
          </button>
        </div>
      )}
    </div>
  );
}
