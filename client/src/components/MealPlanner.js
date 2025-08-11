import React, { useEffect, useState } from 'react';
import { fetchRecipes } from '../services/api';

export default function MealPlanner() {
  const [recipes, setRecipes] = useState([]);
  const [calendar, setCalendar] = useState(() => {
    // initial calendar: 7 days × 3 meals
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const meals = ['Breakfast', 'Lunch', 'Dinner'];
    const cal = {};
    days.forEach((day) => {
      cal[day] = {};
      meals.forEach((meal) => {
        cal[day][meal] = null;
      });
    });
    return cal;
  });

  useEffect(() => {
    fetchRecipes().then((data) => setRecipes(data));
  }, []);

  function handleDragStart(e, recipe) {
    e.dataTransfer.setData('application/json', JSON.stringify(recipe));
  }

  function handleDrop(e, day, meal) {
    e.preventDefault();
    const recipe = JSON.parse(e.dataTransfer.getData('application/json'));
    setCalendar((prev) => ({
      ...prev,
      [day]: { ...prev[day], [meal]: recipe },
    }));
  }

  function allowDrop(e) {
    e.preventDefault();
  }

  return (
    <div className="meal-planner">
      <div className="recipe-sidebar">
        <h3>Recipes</h3>
        {recipes.map((r) => (
          <div key={r.id} className="draggable-recipe" draggable onDragStart={(e) => handleDragStart(e, r)}>
            {r.title}
          </div>
        ))}
      </div>
      <div className="calendar">
        {Object.keys(calendar).map((day) => (
          <div key={day} className="day-column">
            <h4>{day}</h4>
            {Object.keys(calendar[day]).map((meal) => (
              <div
                key={meal}
                className="meal-slot"
                onDragOver={allowDrop}
                onDrop={(e) => handleDrop(e, day, meal)}
              >
                <strong>{meal}:</strong>
                {calendar[day][meal] ? <span> {calendar[day][meal].title}</span> : <span className="placeholder"> (drop here)</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
