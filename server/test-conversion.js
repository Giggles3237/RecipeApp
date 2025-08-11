// Test the ingredient standardization process
const standardizationService = require('./services/standardizationService');

async function testConversion() {
  const ingredients = [
    "2 teaspoons vegetable oil",
    "1 large white onion, finely diced (about 1 1/2 cups), divided",
    "1 poblano pepper, finely diced (about 1 cup)",
    "1 1/2 pounds fresh Mexican chorizo (see note)",
    "1 chipotle chili in adobo sauce, minced (about 1 tablespoon)"
  ];
  
  console.log('Original ingredients:', ingredients);
  
  // Create structured ingredients manually
  const structuredIngredients = ingredients.map(line => {
    // Simple parsing for testing
    const parts = line.split(' ');
    const quantity = parts[0];
    const unit = parts[1];
    const name = parts.slice(2).join(' ');
    
    return {
      quantity: quantity,
      unit: unit,
      name: name
    };
  });
  
  console.log('Structured ingredients:', structuredIngredients);
  
  const standardizationResult = await standardizationService.standardizeIngredients(structuredIngredients);
  console.log('Standardization result:', standardizationResult);
  
  console.log('Final standardized ingredients:', standardizationResult.standardized);
}

testConversion();
