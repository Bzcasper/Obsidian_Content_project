import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { ScraperService } from './services/scraper.js';
import { FileService } from './services/file-service.js';
import { TemplateService } from './services/template-service.js';
import { TrendsService } from './services/trends-service.js';
import { ObsidianAutomationService } from './services/obsidian-automation-service.js';

// Load environment variables
dotenv.config();

// Validate Obsidian vault path on startup using a standard async function
async function validateVaultPath() {
  try {
    await FileService.validateVaultPath();
    console.log('Obsidian vault path validated');
  } catch (error) {
    console.error('Warning:', error.message);
  }
}
validateVaultPath();

// Initialize Supabase client with environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Create Express app and configure middleware
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Base route: Provide API overview
app.get('/', (req, res) => {
  res.json({
    message: 'Content Automation API',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/api/content',
      '/api/scrape',
      '/api/templates',
      '/api/logs',
      '/api/trends',
    ],
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
  });
});

/* -----------------------------------------
   Template Management Endpoints
----------------------------------------- */

// Get available templates
app.get('/api/templates/available', async (req, res) => {
  try {
    const templates = await TemplateService.getAvailableTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error getting available templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save a new template
app.post('/api/templates', async (req, res) => {
  try {
    const { name, content } = req.body;

    // Validate input fields
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Invalid input',
        details: ['Template name is required and must be a string'],
      });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Invalid input',
        details: ['Template content is required and must be a string'],
      });
    }

    // Save template file and log event
    const templatePath = await FileService.saveTemplate(name, content);
    await logEvent('template_created', { name, path: templatePath });

    res.json({
      message: 'Template saved successfully',
      name,
      path: templatePath,
    });
  } catch (error) {
    console.error('Error saving template:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all templates
app.get('/api/templates', async (req, res) => {
  try {
    const templates = await FileService.listTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/* -----------------------------------------
   Content Endpoints
----------------------------------------- */

// Create new content entry
app.post('/api/content', async (req, res) => {
  try {
    const {
      title,
      content,
      type,
      metadata = {},
      source_url,
      tags = [],
    } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string') {
      return res.status(400).json({
        error: 'Invalid input',
        details: ['Title is required and must be a string'],
      });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Invalid input',
        details: ['Content is required and must be a string'],
      });
    }
    if (!Array.isArray(tags)) {
      return res.status(400).json({
        error: 'Invalid input',
        details: ['Tags must be an array'],
      });
    }
    if (source_url) {
      try {
        new URL(source_url);
      } catch {
        return res.status(400).json({
          error: 'Invalid input',
          details: ['Invalid URL format'],
        });
      }
    }

    const { data, error } = await supabase
      .from('content')
      .insert([
        {
          title,
          content,
          type,
          metadata,
          source_url,
          status: 'draft',
        },
      ])
      .select();

    if (error) throw error;

    const createdContent = data[0];
    await logEvent(
      'content_created',
      {
        content_id: createdContent.id,
        type,
        title,
      },
      createdContent.user_id
    );

    res.json(createdContent);
  } catch (error) {
    console.error('Error creating content:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve content with optional filters
app.get('/api/content', async (req, res) => {
  try {
    const { type, status } = req.query;
    let query = supabase.from('content').select('*');

    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching content:', error);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve content by URL
app.get('/api/content/url/:url(*)', async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.url);
    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('source_url', url)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({
        error: 'Content not found',
        message: 'No content found for the provided URL',
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching content by URL:', error);
    res.status(500).json({ error: error.message });
  }
});

/* -----------------------------------------
   Scraping Endpoint
----------------------------------------- */

// Scrape content from a given URL and process it
app.post('/api/scrape', async (req, res) => {
  const { url, type = 'blog_post', metadata = {}, tags = [] } = req.body;
  let { template } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  if (!Array.isArray(tags)) {
    return res.status(400).json({
      error: 'Invalid input',
      details: ['Tags must be an array'],
    });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // Validate template if provided
    if (template) {
      const templates = await TemplateService.getAvailableTemplates();
      const validTemplate = templates.find((t) => t.id === template);
      if (!validTemplate) {
        return res.status(400).json({
          error: 'Invalid template',
          validTemplates: templates.map((t) => t.id),
        });
      }
    }

    // Log scraping initiation
    await logEvent('scrape_started', { url, type }, 'system');

    // Scrape data from the URL
    const scrapedData = await ScraperService.scrape(url);

    // Insert scraped content into Supabase
    const { data, error: dbError } = await supabase
      .from('content')
      .insert([
        {
          title: scrapedData.title,
          content: scrapedData.content,
          type,
          metadata: {
            ...metadata,
            ...scrapedData.metadata,
            tags: Array.from(new Set([...(metadata.tags || []), ...tags])),
            scrapeTimestamp: new Date().toISOString(),
          },
          source_url: url,
          status: 'draft',
        },
      ])
      .select();

    if (dbError) throw dbError;
    const contentEntry = data[0];

    // Apply template and save as Markdown in Obsidian vault
    const markdownContent = await TemplateService.applyTemplate(
      template || 'blog-post',
      contentEntry
    );
    const markdownPath = await TemplateService.saveToObsidian(
      markdownContent,
      contentEntry.metadata.keywords?.[0] || 'uncategorized'
    );

    // Update content record with markdown path
    await supabase
      .from('content')
      .update({
        metadata: {
          ...contentEntry.metadata,
          markdownPath,
        },
      })
      .eq('id', contentEntry.id);

    // Log successful scraping
    await logEvent(
      'content_scraped',
      {
        content_id: contentEntry.id,
        url,
        type,
      },
      contentEntry.user_id
    );

    res.json(contentEntry);
  } catch (error) {
    // Attempt to log scraping error before responding
    try {
      await logEvent('scrape_error', { url, error: error.message }, 'system');
    } catch (logError) {
      console.error('Error logging scrape error:', logError);
    }
    console.error('Error initiating scrape:', error);
    res.status(500).json({ error: error.message });
  }
});

/* -----------------------------------------
   Log Management Endpoints
----------------------------------------- */

// Helper function to log events to Supabase
async function logEvent(event, details, user_id = null) {
  try {
    await supabase.from('logs').insert([{ event, details, user_id }]);
  } catch (error) {
    console.error('Error logging event:', error);
  }
}

// Fetch logs with optional filters
app.get('/api/logs', async (req, res) => {
  try {
    const { event, start_date, end_date } = req.query;
    let query = supabase.from('logs').select('*');

    if (event) query = query.eq('event', event);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new log entry
app.post('/api/logs', async (req, res) => {
  try {
    const { event, details = {} } = req.body;
    const { data, error } = await supabase
      .from('logs')
      .insert([{ event, details }])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error('Error creating log:', error);
    res.status(500).json({ error: error.message });
  }
});

/* -----------------------------------------
   Start Server
----------------------------------------- */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Content Automation API running at http://0.0.0.0:${PORT}`);
  console.log('Available endpoints:');
  console.log('  - GET  /health');
  console.log('  - POST /api/content');
  console.log('  - GET  /api/content');
  console.log('  - POST /api/scrape');
  console.log('  - GET  /api/templates');
  console.log('  - POST /api/logs');
  console.log('  - GET  /api/logs');
  console.log('  - GET  /api/trends');
});
