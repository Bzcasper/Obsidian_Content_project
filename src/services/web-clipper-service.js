import { ScraperService } from './scraper.js';
import { TemplateService } from './template-service.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class WebClipperService {
  static async handleClip(clipData) {
    try {
      // Extract data from web clipper
      const { url, selection, title, tags = [] } = clipData;
      
      // Determine if we have selected text or need to scrape
      let content;
      let metadata = {};
      
      if (selection) {
        // Use selected content
        content = selection;
        metadata.isPartialContent = true;
      } else {
        // Scrape full content
        const scrapedData = await ScraperService.scrape(url);
        content = scrapedData.content;
        metadata = { ...scrapedData.metadata };
      }

      // Save to Supabase
      const { data: savedContent, error } = await supabase
        .from('content')
        .insert([{
          title: title || 'Untitled Clip',
          content,
          type: 'web_clip',
          metadata: {
            ...metadata,
            source_url: url,
            clipped_at: new Date().toISOString(),
            tags
          },
          source_url: url,
          status: 'draft'
        }])
        .select()
        .single();

      if (error) throw error;

      // Apply template and save to Obsidian
      const markdownContent = await TemplateService.applyTemplate(
        'web-clip',
        savedContent
      );

      const savePath = await TemplateService.saveToObsidian(
        markdownContent,
        tags[0] || 'web-clips'
      );

      // Update content record with save path
      await supabase
        .from('content')
        .update({
          metadata: {
            ...savedContent.metadata,
            obsidian_path: savePath
          }
        })
        .eq('id', savedContent.id);

      return {
        success: true,
        path: savePath,
        contentId: savedContent.id
      };
    } catch (error) {
      console.error('Web clipper error:', error);
      throw error;
    }
  }
}