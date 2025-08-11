async function debugSeriousEats() {
  const fetch = (await import('node-fetch')).default;
  
  try {
    const url = 'https://www.seriouseats.com/easy-mexican-chorizo-taco';
    console.log('Fetching URL:', url);
    
    const response = await fetch(url);
    const html = await response.text();
    
    // Look for different script tag patterns
    const patterns = [
      /<script type="application\/ld\+json">(.*?)<\/script>/gis,
      /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis,
      /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis,
      /<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/gis
    ];
    
    for (let i = 0; i < patterns.length; i++) {
      const matches = html.match(patterns[i]);
      console.log(`Pattern ${i + 1} matches:`, matches ? matches.length : 0);
      
      if (matches && matches.length > 0) {
        console.log(`Found ${matches.length} matches with pattern ${i + 1}`);
        break;
      }
    }
    
    // Look for any script tags with JSON content
    const allScriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
    console.log('Total script tags found:', allScriptMatches ? allScriptMatches.length : 0);
    
    if (allScriptMatches) {
      for (let i = 0; i < Math.min(allScriptMatches.length, 10); i++) {
        const match = allScriptMatches[i];
        if (match.includes('"@type"') && match.includes('"Recipe"')) {
          console.log(`\n=== Recipe Script Tag ${i + 1} ===`);
          console.log('Content preview:', match.substring(0, 300));
        }
      }
    }
    
    // Look for the specific content we saw in the test
    const recipeContent = html.match(/"recipeIngredient":\s*\[(.*?)\]/gis);
    if (recipeContent) {
      console.log('\n=== Found Recipe Ingredients ===');
      console.log('Ingredients section:', recipeContent[0].substring(0, 500));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugSeriousEats();
