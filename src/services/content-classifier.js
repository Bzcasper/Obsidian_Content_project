import natural from 'natural';

export class ContentClassifier {
  static async classify(page) {
    try {
      // Get page content and metadata
      const content = await this.extractPageContent(page);
      const metadata = await this.extractClassificationMetadata(page);
      
      // Combine different classification methods
      const classifications = await Promise.all([
        this.classifyByStructure(page),
        this.classifyByContent(content),
        this.classifyByMetadata(metadata)
      ]);
      
      // Weight and combine results
      const result = this.combineClassifications(classifications);
      return result;
    } catch (error) {
      console.error('Classification failed:', error);
      return 'blog_post'; // Default fallback
    }
  }

  static async extractPageContent(page) {
    return await page.evaluate(() => {
      const article = document.querySelector('article');
      if (article) return article.textContent;
      
      const main = document.querySelector('main');
      if (main) return main.textContent;
      
      return document.body.textContent;
    });
  }

  static async extractClassificationMetadata(page) {
    return await page.evaluate(() => {
      return {
        ogType: document.querySelector('meta[property="og:type"]')?.content,
        articleType: document.querySelector('meta[property="article:type"]')?.content,
        schemaType: document.querySelector('[itemtype]')?.getAttribute('itemtype'),
        classList: Array.from(document.body.classList),
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent)
      };
    });
  }

  static async classifyByStructure(page) {
    const structure = await page.evaluate(() => {
      const hasArticle = !!document.querySelector('article');
      const hasCode = !!document.querySelector('pre code');
      const hasSteps = !!document.querySelector('ol li');
      const hasAcademicElements = !!document.querySelector('cite, blockquote');
      
      return { hasArticle, hasCode, hasSteps, hasAcademicElements };
    });
    
    if (structure.hasCode) return 'code_snippet';
    if (structure.hasSteps) return 'tutorial';
    if (structure.hasAcademicElements) return 'research_note';
    if (structure.hasArticle) return 'blog_post';
    
    return null;
  }

  static async classifyByContent(content) {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(content.toLowerCase());
    const productPatterns = [
      /\b(?:review|comparison|vs|versus)\b/i,
      /\b(?:best|top|recommended)\b.*\b(?:products?|tools?|software)\b/i,
      /\b(?:price|cost|pricing)\b/i,
      /\b(?:buy|purchase|order)\b/i,
      /\b(?:affiliate|commission)\b/i
    ];
    
    // Define content type indicators
    const indicators = {
      tutorial: ['step', 'guide', 'how to', 'tutorial', 'learn'],
      code_snippet: ['function', 'code', 'class', 'method', 'implementation'],
      research_note: ['study', 'research', 'analysis', 'findings', 'methodology'],
      blog_post: ['blog', 'article', 'post', 'opinion', 'thoughts'],
      affiliate_post: ['review', 'comparison', 'best', 'top', 'recommended', 'price', 'buy']
    };

    // Check for affiliate content patterns
    const isAffiliate = productPatterns.some(pattern => pattern.test(content));
    if (isAffiliate) {
      return 'affiliate_post';
    }
    
    // Count matches for each type
    const matches = Object.entries(indicators).map(([type, keywords]) => {
      const count = keywords.reduce((sum, keyword) => {
        return sum + tokens.filter(token => token.includes(keyword)).length;
      }, 0);
      return { type, count };
    });
    
    // Return type with most matches
    const bestMatch = matches.reduce((best, current) => {
      return current.count > best.count ? current : best;
    });
    
    return bestMatch.count > 0 ? bestMatch.type : null;
  }

  static async classifyByMetadata(metadata) {
    if (metadata.ogType === 'article') return 'blog_post';
    if (metadata.schemaType?.includes('TechArticle')) return 'tutorial';
    if (metadata.schemaType?.includes('ScholarlyArticle')) return 'research_note';
    if (metadata.classList.some(c => c.includes('post'))) return 'blog_post';
    
    return null;
  }

  static combineClassifications(classifications) {
    // Count occurrences of each type
    const counts = classifications.reduce((acc, type) => {
      if (type) acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    
    // Return most common type or default
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'blog_post';
  }
}