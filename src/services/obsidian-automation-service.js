import { createClient } from '@supabase/supabase-js';
import { ScraperService } from './scraper.js';
import { ContentEnhancer } from './content-enhancer.js';
import { TemplateService } from './template-service.js';
import { ImageGenerationService } from './image-generation-service.js';
import { ErrorHandler } from './error-handler.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class ObsidianAutomationService {
  static async initializeDashboard() {
    try {
      const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
      const dashboardPath = path.join(vaultPath, 'Dashboard');
      
      // Create dashboard structure
      await fs.mkdir(dashboardPath, { recursive: true });
      
      // Create dashboard components
      await this.createDashboardFiles(dashboardPath);
      
      return {
        success: true,
        message: 'Dashboard initialized successfully'
      };
    } catch (error) {
      return await ErrorHandler.handleError(error, {
        service: 'obsidian-automation',
        operation: 'initializeDashboard'
      });
    }
  }

  static async createDashboardFiles(dashboardPath) {
    const files = {
      'dashboard.md': this.getDashboardTemplate(),
      'content-calendar.md': this.getCalendarTemplate(),
      'scraping-queue.md': this.getScrapingQueueTemplate(),
      'content-stats.md': this.getStatsTemplate()
    };

    for (const [filename, content] of Object.entries(files)) {
      await fs.writeFile(
        path.join(dashboardPath, filename),
        content,
        'utf8'
      );
    }
  }

  static getDashboardTemplate() {
    return `# Content Automation Dashboard

## Quick Actions
- [[content-calendar|📅 Content Calendar]]
- [[scraping-queue|🔄 Scraping Queue]]
- [[content-stats|📊 Content Statistics]]

## Recent Activity
\`\`\`dataview
TABLE created_at as "Date", title as "Content", status as "Status"
FROM "content"
SORT created_at DESC
LIMIT 5
\`\`\`

## Upcoming Content
\`\`\`dataview
TABLE scheduled_date as "Date", title as "Content", type as "Type"
FROM "content"
WHERE scheduled_date > date(now)
SORT scheduled_date ASC
LIMIT 5
\`\`\`

## Content Statistics
\`\`\`dataview
TABLE length(rows) as "Count"
FROM "content"
GROUP BY status
\`\`\`
`;
  }

  static getCalendarTemplate() {
    return `# Content Calendar

## Scheduled Content
\`\`\`dataview
CALENDAR scheduled_date
FROM "content"
WHERE scheduled_date
\`\`\`

## Content Queue
\`\`\`tasks
not done
path includes content
\`\`\`

## Add New Content
- [ ] #content 
`;
  }

  static getScrapingQueueTemplate() {
    return `# Scraping Queue

## Pending URLs
\`\`\`tasks
not done
path includes scraping
\`\`\`

## Recent Scrapes
\`\`\`dataview
TABLE created_at as "Date", source_url as "URL", status as "Status"
FROM "content"
WHERE source_url
SORT created_at DESC
LIMIT 10
\`\`\`
`;
  }

  static getStatsTemplate() {
    return `# Content Statistics

## Content by Type
\`\`\`dataview
TABLE length(rows) as "Count"
FROM "content"
GROUP BY type
\`\`\`

## Content by Status
\`\`\`dataview
TABLE length(rows) as "Count"
FROM "content"
GROUP BY status
\`\`\`

## Recent Performance
\`\`\`dataview
TABLE 
  created_at as "Date",
  title as "Content",
  metadata.views as "Views",
  metadata.engagement as "Engagement"
FROM "content"
WHERE metadata.views
SORT metadata.views DESC
LIMIT 10
\`\`\`
`;
  }

  static async processScheduledContent() {
    try {
      // Get scheduled content from Supabase
      const { data: scheduledContent, error } = await supabase
        .from('content')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_date', new Date().toISOString());

      if (error) throw error;

      for (const content of scheduledContent) {
        await this.processContent(content);
      }

      return {
        success: true,
        processed: scheduledContent.length
      };
    } catch (error) {
      return await ErrorHandler.handleError(error, {
        service: 'obsidian-automation',
        operation: 'processScheduledContent'
      });
    }
  }

  static async processContent(content) {
    try {
      // Scrape content if URL provided
      if (content.source_url) {
        const scrapedData = await ScraperService.scrape(content.source_url);
        content = { ...content, ...scrapedData };
      }

      // Enhance content with AI
      const enhancedContent = await ContentEnhancer.enhance(content);

      // Generate featured image
      const imageData = await ImageGenerationService.generateImage(
        enhancedContent.title,
        enhancedContent.metadata.keywords
      );

      // Apply template
      const markdownContent = await TemplateService.applyTemplate(
        null, // Let template service determine best template
        {
          ...enhancedContent,
          metadata: {
            ...enhancedContent.metadata,
            featuredImage: imageData
          }
        }
      );

      // Save to Obsidian
      const savePath = await TemplateService.saveToObsidian(
        markdownContent,
        enhancedContent.metadata.category || 'content'
      );

      // Update content record
      await supabase
        .from('content')
        .update({
          status: 'published',
          metadata: {
            ...enhancedContent.metadata,
            obsidian_path: savePath,
            featuredImage: imageData,
            published_at: new Date().toISOString()
          }
        })
        .eq('id', content.id);

      // Log success
      await supabase
        .from('logs')
        .insert([{
          event: 'content_published',
          details: {
            content_id: content.id,
            path: savePath
          }
        }]);

      return {
        success: true,
        path: savePath
      };
    } catch (error) {
      return await ErrorHandler.handleError(error, {
        service: 'obsidian-automation',
        operation: 'processContent',
        params: [content]
      });
    }
  }

  static async scheduleContent(url, scheduledDate, options = {}) {
    try {
      // Validate URL
      try {
        new URL(url);
      } catch (e) {
        throw new Error('Invalid URL format');
      }

      // Create content record
      const { data, error } = await supabase
        .from('content')
        .insert([{
          source_url: url,
          scheduled_date: scheduledDate,
          status: 'scheduled',
          metadata: {
            ...options,
            scheduled_at: new Date().toISOString()
          }
        }])
        .select()
        .single();

      if (error) throw error;

      // Add to Obsidian scraping queue
      const queuePath = path.join(
        process.env.OBSIDIAN_VAULT_PATH,
        'Dashboard',
        'scraping-queue.md'
      );

      const queueEntry = `\n- [ ] #scraping Scrape and process ${url} (scheduled for ${scheduledDate})`;
      await fs.appendFile(queuePath, queueEntry, 'utf8');

      return {
        success: true,
        content_id: data.id,
        scheduled_date: scheduledDate
      };
    } catch (error) {
      return await ErrorHandler.handleError(error, {
        service: 'obsidian-automation',
        operation: 'scheduleContent',
        params: [url, scheduledDate, options]
      });
    }
  }
}