async function testSeriousEats() {
  const fetch = (await import('node-fetch')).default;
  try {
    const url = 'https://www.seriouseats.com/easy-mexican-chorizo-taco';
    console.log('Fetching URL:', url);
    
    const response = await fetch(url);
    const html = await response.text();
    
    // Look for specific recipe patterns
    console.log('=== Testing Recipe Extraction ===');
    
    // Look for title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) {
      console.log('Title found:', titleMatch[1].trim());
    }
    
    // Look for ingredients section
    const ingredientsSection = html.match(/ingredients?[^<]*/gi);
    console.log('Ingredients sections found:', ingredientsSection ? ingredientsSection.length : 0);
    
    // Look for specific ingredient patterns
    const ingredientPatterns = [
      /<li[^>]*>([^<]*\d+[^<]*[a-zA-Z]+[^<]*)<\/li>/gi,
      /<p[^>]*>([^<]*\d+[^<]*[a-zA-Z]+[^<]*)<\/p>/gi,
      /(\d+\s+(cup|tsp|tbsp|oz|pound|lb|gram|g|ml|l|piece|clove|slice)[^<]*)/gi
    ];
    
    for (let i = 0; i < ingredientPatterns.length; i++) {
      const matches = html.match(ingredientPatterns[i]);
      if (matches) {
        console.log(`Pattern ${i + 1} found ${matches.length} matches:`, matches.slice(0, 5));
      }
    }
    
    // Look for directions/instructions
    const directionsPatterns = [
      /<ol[^>]*>.*?<\/ol>/gis,
      /<ul[^>]*>.*?<\/ul>/gis,
      /directions?[^<]*/gi
    ];
    
    for (let i = 0; i < directionsPatterns.length; i++) {
      const matches = html.match(directionsPatterns[i]);
      if (matches) {
        console.log(`Directions pattern ${i + 1} found ${matches.length} matches`);
        if (matches[0]) {
          console.log('Sample:', matches[0].substring(0, 200));
        }
      }
    }
    
    // Look for servings
    const servingsMatch = html.match(/(\d+)\s*(serving|serves|yield)/gi);
    if (servingsMatch) {
      console.log('Servings found:', servingsMatch);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSeriousEats();
