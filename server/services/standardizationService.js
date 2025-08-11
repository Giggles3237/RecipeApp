const measurementModel = require('../models/measurementModel');
const ingredientModel = require('../models/ingredientModel');
const categoryModel = require('../models/categoryModel');

// Initialize standardization tables
async function initializeStandardization() {
  await measurementModel.initializeMeasurements();
  await ingredientModel.initializeIngredients();
  await categoryModel.initializeCategories();
}

// Standardize a single ingredient object
async function standardizeIngredient(ingredient) {
  const { quantity, unit, name } = ingredient;
  
  // Standardize the measurement unit
  let standardizedUnit = null;
  let convertedQuantity = quantity;
  let isNewUnit = false;
  
  if (unit) {
    standardizedUnit = await measurementModel.findMeasurement(unit);
    if (!standardizedUnit) {
      // Unit not found in our database - flag for review
      console.warn(`Unknown measurement unit: ${unit}`);
      isNewUnit = true;
    }
  }
  
  // Standardize the ingredient name
  const ingredientSuggestion = await ingredientModel.suggestIngredientName(name);
  const isNewIngredient = ingredientSuggestion.needsReview || ingredientSuggestion.confidence === 'low';
  
  return {
    quantity: convertedQuantity,
    unit: standardizedUnit ? standardizedUnit.name : unit,
    unitData: standardizedUnit,
    name: ingredientSuggestion.suggested,
    originalName: name,
    originalUnit: unit,
    category: ingredientSuggestion.category,
    needsReview: ingredientSuggestion.needsReview || !standardizedUnit,
    confidence: ingredientSuggestion.confidence,
    isNewIngredient: isNewIngredient,
    isNewUnit: isNewUnit,
    // Add metadata for the confirmation dialog
    ingredientExists: !isNewIngredient,
    unitExists: !isNewUnit
  };
}

// Standardize an array of ingredients
async function standardizeIngredients(ingredients) {
  const results = [];
  const reviewItems = [];
  
  for (const ingredient of ingredients) {
    const standardized = await standardizeIngredient(ingredient);
    results.push(standardized);
    
    if (standardized.needsReview) {
      reviewItems.push(standardized);
    }
  }
  
  return {
    standardized: results,
    needsReview: reviewItems,
    reviewCount: reviewItems.length
  };
}

// Scale a recipe by a given factor
function scaleRecipe(recipe, scaleFactor) {
  const scaledIngredients = recipe.ingredients.map(ingredient => ({
    ...ingredient,
    quantity: ingredient.quantity ? ingredient.quantity * scaleFactor : ingredient.quantity
  }));
  
  return {
    ...recipe,
    ingredients: scaledIngredients,
    scaleFactor: scaleFactor,
    originalServings: recipe.servings || 4,
    scaledServings: (recipe.servings || 4) * scaleFactor
  };
}

// Convert ingredient to a different unit (if possible)
async function convertIngredientUnit(ingredient, targetUnitName) {
  if (!ingredient.unitData) {
    return null; // Cannot convert without unit data
  }
  
  const targetUnit = await measurementModel.findMeasurement(targetUnitName);
  if (!targetUnit) {
    return null; // Target unit not found
  }
  
  const convertedQuantity = measurementModel.convertUnits(
    ingredient.quantity,
    ingredient.unitData,
    targetUnit
  );
  
  if (convertedQuantity === null) {
    return null; // Cannot convert between different categories
  }
  
  return {
    ...ingredient,
    quantity: convertedQuantity,
    unit: targetUnit.name,
    unitData: targetUnit,
    converted: true,
    originalQuantity: ingredient.quantity,
    originalUnit: ingredient.unit
  };
}

// Aggregate ingredients for grocery list with smart unit conversion
async function aggregateIngredientsForGrocery(recipeIngredients) {
  const aggregated = new Map();
  
  for (const ingredient of recipeIngredients) {
    const standardized = await standardizeIngredient(ingredient);
    const key = standardized.name.toLowerCase();
    
    if (aggregated.has(key)) {
      const existing = aggregated.get(key);
      
      // Try to combine quantities if units are compatible
      if (existing.unitData && standardized.unitData && 
          existing.unitData.category === standardized.unitData.category) {
        
        // Convert to common unit (prefer the first unit encountered)
        const converted = measurementModel.convertUnits(
          standardized.quantity || 0,
          standardized.unitData,
          existing.unitData
        );
        
        if (converted !== null) {
          existing.quantity = (existing.quantity || 0) + converted;
        } else {
          // Cannot convert, keep as separate entry
          aggregated.set(`${key}_${standardized.unit}`, standardized);
        }
      } else {
        // Different units or no unit data, keep separate
        const uniqueKey = standardized.unit ? 
          `${key}_${standardized.unit}` : 
          `${key}_${Math.random().toString(36).substr(2, 9)}`;
        aggregated.set(uniqueKey, standardized);
      }
    } else {
      aggregated.set(key, standardized);
    }
  }
  
  return Array.from(aggregated.values()).sort((a, b) => {
    // Sort by category, then by name
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });
}

// Suggest better unit for display (e.g., convert 1000ml to 1l)
function suggestBetterUnit(quantity, unit, unitData) {
  if (!unitData || !quantity) return { quantity, unit };
  
  // Volume conversions
  if (unitData.category === 'volume') {
    if (unit === 'ml' && quantity >= 1000) {
      return { quantity: quantity / 1000, unit: 'l' };
    }
    if (unit === 'tsp' && quantity >= 3) {
      return { quantity: quantity / 3, unit: 'tbsp' };
    }
    if (unit === 'tbsp' && quantity >= 16) {
      return { quantity: quantity / 16, unit: 'cup' };
    }
  }
  
  // Weight conversions
  if (unitData.category === 'weight') {
    if (unit === 'g' && quantity >= 1000) {
      return { quantity: quantity / 1000, unit: 'kg' };
    }
    if (unit === 'oz' && quantity >= 16) {
      return { quantity: quantity / 16, unit: 'lb' };
    }
  }
  
  return { quantity, unit };
}

module.exports = {
  initializeStandardization,
  standardizeIngredient,
  standardizeIngredients,
  scaleRecipe,
  convertIngredientUnit,
  aggregateIngredientsForGrocery,
  suggestBetterUnit
};

