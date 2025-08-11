import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Header() {
  const location = useLocation();
  return (
    <nav className="navbar">
      <h1>Recipe Manager</h1>
      <ul>
        <li className={location.pathname === '/' ? 'active' : ''}><Link to="/">Recipes</Link></li>
        <li className={location.pathname === '/add' ? 'active' : ''}><Link to="/add">Add Recipe</Link></li>
        <li className={location.pathname === '/scrape' ? 'active' : ''}><Link to="/scrape">Import Recipe</Link></li>
        <li className={location.pathname === '/groceries' ? 'active' : ''}><Link to="/groceries">Grocery List</Link></li>
        <li className={location.pathname === '/meal-planner' ? 'active' : ''}><Link to="/meal-planner">Meal Planner</Link></li>
        <li className={location.pathname === '/admin' ? 'active' : ''}><Link to="/admin">Admin</Link></li>
      </ul>
    </nav>
  );
}
