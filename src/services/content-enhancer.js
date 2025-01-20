import { createClient } from '@supabase/supabase-js';
import { ErrorHandler } from './error-handler.js';
import natural from 'natural';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class ContentEnhancer {
  static async enhance(content, options = {}) {
    const context = {
      service: 'content-enhancer',
      operation: 'enhance',
      params: [content]
    };

    try {
      // Extract key information
      const keywords = await this.extractKeywords(content);
      const structure = await this.analyzeStructure(content);
      
      // Generate enhanced content sections
      const enhancedSections = await Promise.all([
        this.generateIntroduction(content, keywords),
        this.generateProductComparisons(content),
        this.generateBuyingGuide(content, keywords),
        this.generateConclusion(content, keywords),
        this.generateCallToAction(content)
      ]);

      // Combine enhanced content
      const enhancedContent = this.combineContent(content, enhancedSections);

      // Add affiliate disclaimers and metadata
      const finalContent = await this.addAffiliateElements(enhancedContent);

      return {
        ...content,
        content: finalContent,
        metadata: {
          ...content.metadata,
          enhanced: true,
          enhancementTimestamp: new Date().toISOString(),
          keywords,
          structure
        }
      };
    } catch (error) {
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async extractKeywords(content) {
    const tfidf = new natural.TfIdf();
    tfidf.addDocument(content.content);
    
    // Get top keywords
    const keywords = [];
    tfidf.listTerms(0).slice(0, 10).forEach(item => {
      keywords.push({
        term: item.term,
        score: item.tfidf
      });
    });

    return keywords;
  }

  static async analyzeStructure(content) {
    const sections = content.content.split(/#{1,6}\s+/);
    return {
      headingCount: sections.length - 1,
      averageSectionLength: sections.reduce((sum, section) => 
        sum + section.length, 0) / sections.length,
      hasProductReviews: /review|rating|stars?/i.test(content.content),
      hasPricing: /price|\$|cost/i.test(content.content),
      hasComparisons: /vs|versus|compared?|better than/i.test(content.content)
    };
  }

  static async generateIntroduction(content, keywords) {
    const intro = [
      `# ${content.title}`,
      '',
      'Looking for the best solution? You\'re in the right place.',
      '',
      `In this comprehensive guide, we'll explore ${keywords.slice(0, 3)
        .map(k => k.term).join(', ')} and help you make an informed decision.`,
      '',
      '## Quick Summary',
      '',
      '- Expert-tested and reviewed products',
      '- Detailed comparisons and analysis',
      '- Up-to-date pricing information',
      '- Pros and cons for each option',
      ''
    ].join('\n');

    return intro;
  }

  static async generateProductComparisons(content) {
    // Extract product mentions
    const productRegex = /(?:^|\s)([A-Z][a-zA-Z0-9\s]+?)(?=\s+(?:is|are|has|features|costs|price))/g;
    const products = [...content.content.matchAll(productRegex)]
      .map(match => match[1])
      .filter((value, index, self) => self.indexOf(value) === index);

    if (products.length < 2) return '';

    const comparison = [
      '## Product Comparison',
      '',
      '| Feature | ' + products.join(' | ') + ' |',
      '|' + '-|'.repeat(products.length + 1),
    ];

    // Generate comparison rows
    const features = ['Price Range', 'Key Features', 'Best For', 'Rating'];
    features.forEach(feature => {
      comparison.push(
        '| ' + feature + ' | ' + 
        products.map(() => this.generateComparisonCell(feature)).join(' | ') + ' |'
      );
    });

    return comparison.join('\n') + '\n\n';
  }

  static generateComparisonCell(feature) {
    const ranges = {
      'Price Range': ['$29-$49', '$99-$149', '$199-$299', '$49-$99'],
      'Key Features': ['Easy to use', 'Advanced features', 'Best value', 'Premium quality'],
      'Best For': ['Beginners', 'Professionals', 'Small business', 'Enterprise'],
      'Rating': ['⭐⭐⭐⭐', '⭐⭐⭐⭐½', '⭐⭐⭐⭐⭐', '⭐⭐⭐½']
    };
    
    const options = ranges[feature] || ['N/A'];
    return options[Math.floor(Math.random() * options.length)];
  }

  static async generateBuyingGuide(content, keywords) {
    const guide = [
      '## Buying Guide',
      '',
      'When choosing the right solution, consider these key factors:',
      '',
      '### Key Features to Look For',
      '',
      keywords.slice(0, 5).map(k => 
        `- **${k.term}**: Important for optimal performance and reliability`
      ).join('\n'),
      '',
      '### Price Considerations',
      '',
      '- Entry-level options: Perfect for beginners',
      '- Mid-range solutions: Best value for money',
      '- Premium choices: For professional needs',
      '',
      '### User Experience',
      '',
      '- Ease of setup and configuration',
      '- Learning curve and documentation',
      '- Customer support quality',
      ''
    ].join('\n');

    return guide;
  }

  static async generateConclusion(content, keywords) {
    const conclusion = [
      '## Final Verdict',
      '',
      `After thorough testing and analysis, we found that ${keywords[0].term} is crucial for success. `,
      'Consider your specific needs and budget when making a decision.',
      '',
      '### Top Recommendations',
      '',
      '1. **Best Overall**: Perfect balance of features and value',
      '2. **Budget Choice**: Great for those just starting',
      '3. **Premium Pick**: When only the best will do',
      ''
    ].join('\n');

    return conclusion;
  }

  static async generateCallToAction(content) {
    const cta = [
      '## Ready to Get Started?',
      '',
      'Click the links below to check current prices and availability:',
      '',
      '{{#each metadata.affiliateLinks}}',
      '- [Check Price on {{this.vendor}}]({{this.url}}) 🛒',
      '{{/each}}',
      '',
      '*Prices and availability are accurate as of {{metadata.lastUpdated}}*',
      ''
    ].join('\n');

    return cta;
  }

  static async addAffiliateElements(content) {
    const disclaimer = [
      '',
      '---',
      '',
      '*Disclaimer: As an affiliate, we may earn a commission from qualifying purchases. ',
      'This helps support our research and testing at no extra cost to you.*',
      ''
    ].join('\n');

    return content + disclaimer;
  }

  static combineContent(original, enhancedSections) {
    // Combine sections while preserving any original content
    const combined = [
      enhancedSections[0], // Introduction
      '## Original Content',
      '',
      original.content,
      '',
      ...enhancedSections.slice(1) // Other enhanced sections
    ].join('\n\n');

    return combined;
  }
}