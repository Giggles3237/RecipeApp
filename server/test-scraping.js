async function testScraping() {
  const fetch = (await import('node-fetch')).default;
  try {
    const url = 'https://www.seriouseats.com/easy-mexican-chorizo-taco';
    console.log('Fetching URL:', url);
    
    const response = await fetch(url);
    const html = await response.text();
    
    console.log('HTML length:', html.length);
    
    // Look for recipe-specific content
    const recipeMatch = html.match(/<h1[^>]*>.*?<\/h1>/gi);
    const ingredientsMatch = html.match(/ingredients?[^<]*/gi);
    const directionsMatch = html.match(/directions?[^<]*/gi);
    
    console.log('Recipe title found:', recipeMatch ? 'Yes' : 'No');
    console.log('Ingredients section found:', ingredientsMatch ? 'Yes' : 'No');
    console.log('Directions section found:', directionsMatch ? 'Yes' : 'No');
    
    // Extract text content
    let textContent = html.replace(/<script[^>]*>.*?<\/script>/gi, ' ');
    textContent = textContent.replace(/<style[^>]*>.*?<\/style>/gi, ' ');
    textContent = textContent.replace(/<[^>]*>/g, ' ');
    textContent = textContent.replace(/\s+/g, ' ').trim();
    
    console.log('Text content length:', textContent.length);
    console.log('First 500 chars:', textContent.substring(0, 500));
    
    // Look for specific patterns
    const ingredientsSection = html.match(/ingredients?[^<]*/gi);
    const directionsSection = html.match(/directions?[^<]*/gi);
    
    if (ingredientsSection) {
      console.log('Ingredients section found:', ingredientsSection[0]);
    }
    
    if (directionsSection) {
      console.log('Directions section found:', directionsSection[0]);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testScraping();
