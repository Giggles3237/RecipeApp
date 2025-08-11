import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import RecipeList from './components/RecipeList';
import RecipeForm from './components/RecipeForm';
import RecipeScraper from './components/RecipeScraper';
import RecipeDisplay from './components/RecipeDisplay';
import GroceryList from './components/GroceryList';
import MealPlanner from './components/MealPlanner';
import './App.css';

function App() {
  return (
    <div className="App">
      <Header />
      <div className="container">
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/add" element={<RecipeForm />} />
          <Route path="/edit/:id" element={<RecipeForm />} />
          <Route path="/recipe/:id" element={<RecipeDisplay />} />
          <Route path="/scrape" element={<RecipeScraper />} />
          <Route path="/groceries" element={<GroceryList />} />
          <Route path="/meal-planner" element={<MealPlanner />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
