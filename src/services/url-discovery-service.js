import { createClient } from '@supabase/supabase-js';
import { ErrorHandler } from './error-handler.js';
import fetch from 'node-fetch';
import natural from 'natural';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class UrlDiscoveryService {
  static async findRelevantUrls(trends) {
    const context = {
      service: 'url-discovery',
      operation: 'findRelevantUrls',
      params: [trends]
    };

    try {
      const urlSets = await Promise.all([
        this.findProductReviewUrls(trends),
        this.findComparisonUrls(trends),
        this.findBuyingGuideUrls(trends),
        this.findTutorialUrls(trends)
      ]);

      // Combine and deduplicate URLs
      const allUrls = this.combineAndScoreUrls(urlSets);

      // Save discovered URLs to database
      await this.saveUrlsToDatabase(allUrls);

      return allUrls;
    } catch (error) {
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async findProductReviewUrls(trends) {
    const urls = [];
    
    for (const trend of [...trends.realTime, ...trends.daily]) {
      const searchQueries = [
        `${trend.title} review`,
        `best ${trend.title}`,
        `${trend.title} product review`,
        `${trend.title} comparison`
      ];

      for (const query of searchQueries) {
        const results = await this.searchGoogle(query);
        urls.push(...results.map(result => ({
          ...result,
          type: 'review',
          trend: trend.title,
          query
        })));
      }
    }

    return urls;
  }

  static async findComparisonUrls(trends) {
    const urls = [];
    
    for (const trend of [...trends.realTime, ...trends.daily]) {
      const searchQueries = [
        `${trend.title} vs`,
        `${trend.title} alternatives`,
        `${trend.title} comparison`,
        `compare ${trend.title}`
      ];

      for (const query of searchQueries) {
        const results = await this.searchGoogle(query);
        urls.push(...results.map(result => ({
          ...result,
          type: 'comparison',
          trend: trend.title,
          query
        })));
      }
    }

    return urls;
  }

  static async findBuyingGuideUrls(trends) {
    const urls = [];
    
    for (const trend of [...trends.realTime, ...trends.daily]) {
      const searchQueries = [
        `${trend.title} buying guide`,
        `how to choose ${trend.title}`,
        `${trend.title} guide`,
        `${trend.title} purchase guide`
      ];

      for (const query of searchQueries) {
        const results = await this.searchGoogle(query);
        urls.push(...results.map(result => ({
          ...result,
          type: 'buying_guide',
          trend: trend.title,
          query
        })));
      }
    }

    return urls;
  }

  static async findTutorialUrls(trends) {
    const urls = [];
    
    for (const trend of [...trends.realTime, ...trends.daily]) {
      const searchQueries = [
        `how to use ${trend.title}`,
        `${trend.title} tutorial`,
        `${trend.title} tips`,
        `${trend.title} for beginners`
      ];

      for (const query of searchQueries) {
        const results = await this.searchGoogle(query);
        urls.push(...results.map(result => ({
          ...result,
          type: 'tutorial',
          trend: trend.title,
          query
        })));
      }
    }

    return urls;
  }

  static async searchGoogle(query) {
    // Note: In a production environment, you should use the official Google Custom Search API
    // This is a simplified example
    try {
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?` +
        `key=${process.env.GOOGLE_API_KEY}&` +
        `cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&` +
        `q=${encodeURIComponent(query)}`
      );

      const data = await response.json();
      
      if (!data.items) return [];

      return data.items.map(item => ({
        url: item.link,
        title: item.title,
        description: item.snippet,
        source: item.displayLink
      }));
    } catch (error) {
      console.error(`Search failed for query "${query}":`, error);
      return [];
    }
  }

  static combineAndScoreUrls(urlSets) {
    // Combine all URLs
    const allUrls = urlSets.flat();
    
    // Create a map to store unique URLs with their scores
    const urlMap = new Map();
    
    for (const url of allUrls) {
      if (!urlMap.has(url.url)) {
        // Calculate initial score
        const score = this.calculateUrlScore(url);
        
        urlMap.set(url.url, {
          ...url,
          score,
          occurrences: 1
        });
      } else {
        // Update existing URL entry
        const existing = urlMap.get(url.url);
        existing.occurrences += 1;
        existing.score += this.calculateUrlScore(url);
        
        // Add any new trends or queries
        if (!existing.trends?.includes(url.trend)) {
          existing.trends = [...(existing.trends || []), url.trend];
        }
      }
    }

    // Convert map to array and sort by score
    return Array.from(urlMap.values())
      .sort((a, b) => b.score - a.score)
      .map(url => ({
        ...url,
        normalizedScore: Math.round(url.score * 100) / 100
      }));
  }

  static calculateUrlScore(url) {
    let score = 0;

    // Base score by content type
    const typeScores = {
      review: 3,
      comparison: 4,
      buying_guide: 5,
      tutorial: 2
    };
    score += typeScores[url.type] || 1;

    // Domain authority score (simplified example)
    const authorityDomains = [
      'techradar.com',
      'cnet.com',
      'pcmag.com',
      'tomsguide.com',
      'wirecutter.com'
    ];
    if (authorityDomains.some(domain => url.source.includes(domain))) {
      score += 2;
    }

    // Title relevance score
    const titleTokens = new natural.WordTokenizer().tokenize(url.title.toLowerCase());
    const queryTokens = new natural.WordTokenizer().tokenize(url.query.toLowerCase());
    const commonWords = titleTokens.filter(word => queryTokens.includes(word));
    score += commonWords.length * 0.5;

    // Affiliate potential indicators
    const affiliateIndicators = [
      'review',
      'best',
      'top',
      'vs',
      'compare',
      'buy',
      'price',
      'deal'
    ];
    const hasAffiliateIndicators = affiliateIndicators.some(indicator => 
      url.title.toLowerCase().includes(indicator)
    );
    if (hasAffiliateIndicators) {
      score += 2;
    }

    return score;
  }

  static async saveUrlsToDatabase(urls) {
    const { data, error } = await supabase
      .from('discovered_urls')
      .insert(
        urls.map(url => ({
          url: url.url,
          title: url.title,
          description: url.description,
          source: url.source,
          type: url.type,
          trend: url.trend,
          score: url.normalizedScore,
          metadata: {
            queries: [url.query],
            trends: url.trends || [url.trend],
            occurrences: url.occurrences
          }
        }))
      );

    if (error) throw error;
    return data;
  }
}