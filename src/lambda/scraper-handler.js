import { ScraperService } from '../services/scraper.js';
import { TemplateService } from '../services/template-service.js';
import { FileService } from '../services/file-service.js';
import { createClient } from '@supabase/supabase-js';
import { ErrorHandler } from '../services/error-handler.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const handler = async (event) => {
  const context = {
    service: 'lambda',
    operation: 'scrape',
    params: [event]
  };

  try {
    // Parse request body
    const body = JSON.parse(event.body);
    
    // Validate required fields
    if (!body.url) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'URL is required'
        })
      };
    }

    const { url, template = 'blog-post', tags = [] } = body;

    // Scrape content
    const scrapedData = await ScraperService.scrape(url);

    // Save to Supabase
    const { data: savedContent, error: dbError } = await supabase
      .from('content')
      .insert([{
        title: scrapedData.title,
        content: scrapedData.content,
        type: scrapedData.metadata.contentType || 'blog_post',
        metadata: {
          ...scrapedData.metadata,
          scrapeTimestamp: new Date().toISOString(),
          tags
        },
        source_url: url,
        status: 'draft'
      }])
      .select()
      .single();

    if (dbError) throw dbError;

    // Apply template
    const markdownContent = await TemplateService.applyTemplate(
      template,
      savedContent
    );

    // Save to Obsidian
    const savePath = await FileService.saveAsMarkdown(
      {
        ...savedContent,
        content: markdownContent
      },
      template
    );

    // Update content record with Obsidian path
    await supabase
      .from('content')
      .update({
        metadata: {
          ...savedContent.metadata,
          obsidian_path: savePath
        }
      })
      .eq('id', savedContent.id);

    // Log success
    await supabase
      .from('logs')
      .insert([{
        event: 'scrape_success',
        details: {
          url,
          contentId: savedContent.id,
          template,
          obsidianPath: savePath
        }
      }]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true
      },
      body: JSON.stringify({
        success: true,
        contentId: savedContent.id,
        obsidianPath: savePath,
        title: savedContent.title,
        type: savedContent.type
      })
    };

  } catch (error) {
    const handledError = await ErrorHandler.handleError(error, context);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true
      },
      body: JSON.stringify({
        error: handledError.message,
        details: handledError.context
      })
    };
  }
};