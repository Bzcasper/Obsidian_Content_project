import googleTrends from 'google-trends-api';
import { createClient } from '@supabase/supabase-js';
import { TemplateService } from './template-service.js';
import { UrlDiscoveryService } from './url-discovery-service.js';
import { ErrorHandler } from './error-handler.js';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class TrendsService {
  static async fetchTrendingTopics(options = {}) {
    const context = {
      service: 'trends',
      operation: 'fetchTrendingTopics',
      params: [options]
    };

    try {
      // Get real-time trending searches
      const trendingSearches = await googleTrends.realTimeTrends({
        geo: options.geo || 'US',
        category: options.category || 'all'
      });

      // Get daily trends
      const dailyTrends = await googleTrends.dailyTrends({
        geo: options.geo || 'US'
      });

      // Process and combine trends
      const trends = await this.processTrends(
        JSON.parse(trendingSearches),
        JSON.parse(dailyTrends)
      );

      // Save to Obsidian
      await this.saveToObsidian(trends);

      // Save to database
      await this.saveTrendsToDatabase(trends);

      // Find relevant URLs for content creation
      const relevantUrls = await UrlDiscoveryService.findRelevantUrls(trends);
      
      // Add URLs to trends data
      trends.relevantUrls = relevantUrls;

      return trends;
    } catch (error) {
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async processTrends(realTimeTrends, dailyTrends) {
    const trends = {
      timestamp: new Date().toISOString(),
      realTime: [],
      daily: [],
      categories: new Map()
    };

    // Process real-time trends
    if (realTimeTrends.storySummaries?.trendingStories) {
      trends.realTime = realTimeTrends.storySummaries.trendingStories.map(story => ({
        title: story.title,
        entityNames: story.entityNames,
        articles: story.articles,
        shareUrl: story.shareUrl
      }));
    }

    // Process daily trends
    if (dailyTrends.default?.trendingSearchesDays) {
      trends.daily = dailyTrends.default.trendingSearchesDays.flatMap(day => 
        day.trendingSearches.map(search => ({
          date: day.date,
          title: search.title.query,
          formattedTraffic: search.formattedTraffic,
          relatedQueries: search.relatedQueries,
          articles: search.articles
        }))
      );
    }

    // Categorize trends
    for (const trend of [...trends.realTime, ...trends.daily]) {
      // Use natural language processing to categorize
      const category = await this.categorizeTrend(trend);
      if (!trends.categories.has(category)) {
        trends.categories.set(category, []);
      }
      trends.categories.get(category).push(trend);
    }

    return trends;
  }

  static async categorizeTrend(trend) {
    // Basic categorization based on keywords
    const categories = {
      technology: ['tech', 'software', 'app', 'phone', 'computer', 'digital'],
      business: ['business', 'company', 'stock', 'market', 'economy'],
      entertainment: ['movie', 'music', 'celebrity', 'game', 'tv', 'show'],
      sports: ['sport', 'game', 'player', 'team', 'match', 'tournament'],
      politics: ['politics', 'government', 'election', 'policy', 'president'],
      science: ['science', 'research', 'study', 'discovery']
    };

    const text = [
      trend.title,
      ...(trend.entityNames || []),
      ...(trend.relatedQueries || [])
    ].join(' ').toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  static async saveToObsidian(trends) {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const trendsPath = path.join(vaultPath, 'Trends');
    
    // Create trends directory if it doesn't exist
    await fs.mkdir(trendsPath, { recursive: true });
    
    // Generate daily trends file
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(trendsPath, `trends-${date}.md`);
    
    // Apply template
    const content = await TemplateService.applyTemplate('trends', {
      title: `Trending Topics - ${date}`,
      content: '',
      metadata: {
        date,
        trends
      }
    });
    
    // Save file
    await fs.writeFile(filePath, content, 'utf8');
    
    // Update trends dashboard
    await this.updateTrendsDashboard(trends);
    
    return path.relative(vaultPath, filePath);
  }

  static async updateTrendsDashboard(trends) {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const dashboardPath = path.join(vaultPath, 'Dashboard', 'trends-dashboard.md');
    
    const content = [
      '# Trending Topics Dashboard',
      '',
      '## Latest Trends',
      '',
      '### Real-Time Trends',
      ...trends.realTime.map(trend => 
        `- [${trend.title}](${trend.shareUrl})`
      ),
      '',
      '### Daily Trends',
      ...trends.daily.slice(0, 10).map(trend =>
        `- ${trend.title} (${trend.formattedTraffic})`
      ),
      '',
      '## Trends by Category',
      '',
      ...Array.from(trends.categories.entries()).map(([category, items]) => [
        `### ${category.charAt(0).toUpperCase() + category.slice(1)}`,
        ...items.map(item => `- ${item.title}`),
        ''
      ]).flat(),
      '',
      '## Recent Trends Files',
      '',
      '\`\`\`dataview',
      'TABLE date as "Date", length(file.outlinks) as "Topics"',
      'FROM "Trends"',
      'SORT date DESC',
      'LIMIT 7',
      '\`\`\`'
    ].join('\n');

    // Add relevant URLs section
    if (trends.relevantUrls?.length > 0) {
      content += '\n\n## Content Opportunities\n\n';
      
      // Group URLs by type
      const urlsByType = trends.relevantUrls.reduce((acc, url) => {
        if (!acc[url.type]) acc[url.type] = [];
        acc[url.type].push(url);
        return acc;
      }, {});
      
      // Add each type's URLs
      for (const [type, urls] of Object.entries(urlsByType)) {
        content += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)} Content\n\n`;
        urls.slice(0, 5).forEach(url => {
          content += `- [${url.title}](${url.url})\n  - Score: ${url.normalizedScore}\n  - Trend: ${url.trend}\n`;
        });
      }
    }
    
    await fs.writeFile(dashboardPath, content, 'utf8');
  }

  static async saveTrendsToDatabase(trends) {
    // Save trends data to Supabase
    const { data, error } = await supabase
      .from('trends')
      .insert([{
        date: new Date().toISOString(),
        real_time_trends: trends.realTime,
        daily_trends: trends.daily,
        categories: Object.fromEntries(trends.categories)
      }]);

    if (error) throw error;
    return data;
  }
}