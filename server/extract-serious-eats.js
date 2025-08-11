async function extractSeriousEats() {
  const fetch = (await import('node-fetch')).default;
  
  try {
    const url = 'https://www.seriouseats.com/easy-mexican-chorizo-taco';
    console.log('Fetching URL:', url);
    
    const response = await fetch(url);
    const html = await response.text();
    
    // Look for the JSON-LD script tag
    const scriptMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis);
    
    if (scriptMatch) {
      console.log('Found JSON-LD script tag');
      const jsonContent = scriptMatch[0].replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
      
      try {
        const data = JSON.parse(jsonContent);
        console.log('Successfully parsed JSON-LD');
        console.log('Data type:', typeof data);
        console.log('Is array:', Array.isArray(data));
        
        if (Array.isArray(data)) {
          console.log('Array length:', data.length);
          data.forEach((item, index) => {
            console.log(`Item ${index}:`, item['@type']);
          });
        } else {
          console.log('Single object type:', data['@type']);
        }
        
        // Find the recipe object
        let recipe = null;
        if (Array.isArray(data)) {
          recipe = data.find(item => item['@type'] && (item['@type'] === 'Recipe' || item['@type'].includes('Recipe')));
        } else if (data['@type'] && (data['@type'] === 'Recipe' || data['@type'].includes('Recipe'))) {
          recipe = data;
        }
        
        if (recipe) {
          console.log('\n=== EXTRACTED RECIPE ===');
          console.log('Title:', recipe.name || recipe.headline);
          console.log('Ingredients count:', recipe.recipeIngredient ? recipe.recipeIngredient.length : 0);
          console.log('Instructions count:', recipe.recipeInstructions ? recipe.recipeInstructions.length : 0);
          console.log('Servings:', recipe.recipeYield);
          
          if (recipe.recipeIngredient) {
            console.log('\nIngredients:');
            recipe.recipeIngredient.forEach((ingredient, index) => {
              console.log(`${index + 1}. ${ingredient}`);
            });
          }
          
          if (recipe.recipeInstructions) {
            console.log('\nInstructions:');
            recipe.recipeInstructions.forEach((step, index) => {
              const stepText = typeof step === 'string' ? step : step.text || '';
              console.log(`${index + 1}. ${stepText}`);
            });
          }
          
        } else {
          console.log('No recipe found in JSON-LD data');
          console.log('Available keys:', Object.keys(data));
        }
        
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError.message);
      }
    } else {
      console.log('No JSON-LD script tag found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

extractSeriousEats();
