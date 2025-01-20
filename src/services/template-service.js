import fs from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import dotenv from 'dotenv';
import { ErrorHandler } from './error-handler.js';

dotenv.config();

export class TemplateService {
  static async getAvailableTemplates() {
    const templates = [
      {
        id: 'blog-post',
        name: 'Blog Post',
        description: 'Template for blog posts with metadata, content, and image gallery',
        defaultTags: ['blog', 'article']
      },
      {
        id: 'research-note',
        name: 'Research Note',
        description: 'Academic or research-focused template with citations and key points',
        defaultTags: ['research', 'notes']
      },
      {
        id: 'code-snippet',
        name: 'Code Snippet',
        description: 'Template for code examples with syntax highlighting and documentation',
        defaultTags: ['code', 'development']
      },
      {
        id: 'tutorial',
        name: 'Tutorial',
        description: 'Step-by-step guide template with prerequisites and examples',
        defaultTags: ['tutorial', 'guide']
      }
    ];

    return templates;
  }

  static async getTemplate(templateId) {
    const context = {
      service: 'template',
      operation: 'getTemplate',
      params: [templateId]
    };

    try {
      const templatePath = path.join(process.cwd(), 'src', 'templates', `${templateId}.md`);
      
      try {
        const template = await fs.readFile(templatePath, 'utf8');
        return template;
      } catch (error) {
        console.log(`Template file not found: ${templatePath}, using default template`);
        return [
          `# {{title}}`,
          '',
          `**Source:** {{url}}`,
          `**Created:** {{created_at}}`,
          `**Tags:** {{tags}}`,
          '',
          '---',
          '',
          '## Metadata',
          '```json',
          '{{metadata}}',
          '```',
          '',
          '---',
          '',
          '## Content',
          '',
          '{{content}}'
        ].join('\n');
      }
    } catch (error) {
      console.error(`Template not found: ${templateId}`);
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async determineBestTemplate(content) {
    try {
      // Calculate template scores based on content characteristics
      const scores = new Map();
      
      // Initialize base scores for each template
      const templates = await this.getAvailableTemplates();
      templates.forEach(template => scores.set(template.id, 0));
      
      // Analyze code presence
      const codeBlockCount = (content.content.match(/```[\s\S]*?```/g) || []).length;
      if (codeBlockCount > 0) {
        scores.set('code-snippet', scores.get('code-snippet') + 10 * codeBlockCount);
      }
      
      // Check for tutorial indicators
      const tutorialPatterns = [
        /step\s+\d+/i,
        /how\s+to/i,
        /guide/i,
        /tutorial/i,
        /learn/i,
        /follow\s+these\s+steps/i
      ];
      const tutorialScore = tutorialPatterns.reduce((score, pattern) => 
        score + ((content.content.match(pattern) || []).length * 5), 0);
      scores.set('tutorial', scores.get('tutorial') + tutorialScore);
      
      // Check for research indicators
      const researchPatterns = [
        /study/i,
        /research/i,
        /analysis/i,
        /findings/i,
        /conclusion/i,
        /methodology/i,
        /cited/i,
        /reference/i
      ];
      const researchScore = researchPatterns.reduce((score, pattern) =>
        score + ((content.content.match(pattern) || []).length * 5), 0);
      scores.set('research-note', scores.get('research-note') + researchScore);
      
      // Check for affiliate/product review indicators
      const affiliatePatterns = [
        /review/i,
        /price/i,
        /\$/,
        /best\s+\w+/i,
        /comparison/i,
        /vs\./i,
        /affiliate/i,
        /commission/i
      ];
      const affiliateScore = affiliatePatterns.reduce((score, pattern) =>
        score + ((content.content.match(pattern) || []).length * 5), 0);
      scores.set('affiliate-post', scores.get('affiliate-post') + affiliateScore);
      
      // Check metadata
      if (content.metadata) {
        // Check content type
        if (content.metadata.contentType) {
          scores.set(content.metadata.contentType, 
            scores.get(content.metadata.contentType) + 20);
        }
        
        // Check tags
        const tagMappings = {
          'code': 'code-snippet',
          'tutorial': 'tutorial',
          'guide': 'tutorial',
          'research': 'research-note',
          'study': 'research-note',
          'review': 'affiliate-post',
          'product': 'affiliate-post'
        };
        
        content.metadata.tags?.forEach(tag => {
          const mappedTemplate = tagMappings[tag.toLowerCase()];
          if (mappedTemplate && scores.has(mappedTemplate)) {
            scores.set(mappedTemplate, scores.get(mappedTemplate) + 10);
          }
        });
      }
      
      // Check structure
      const headingCount = (content.content.match(/^#{1,6}\s+/gm) || []).length;
      if (headingCount > 5) {
        scores.set('tutorial', scores.get('tutorial') + 5);
        scores.set('affiliate-post', scores.get('affiliate-post') + 5);
      }
      
      // Get template with highest score
      let bestTemplate = 'blog-post'; // Default template
      let highestScore = 0;
      
      scores.forEach((score, template) => {
        if (score > highestScore) {
          highestScore = score;
          bestTemplate = template;
        }
      });
      
      return bestTemplate;
    } catch (error) {
      console.error('Error determining best template:', error);
      return 'blog-post'; // Fallback to default template
    }
  }

  static async applyTemplate(templateId, data) {
    const context = {
      service: 'template',
      operation: 'apply',
      params: [templateId, data]
    };

    try {
      // If no template specified, determine best template based on data
      if (!templateId && data) {
        templateId = await this.determineBestTemplate(data);
      }

      const template = await this.getTemplate(templateId);
    
      // Replace placeholders with actual data
      let content = template;
    
      // Basic replacements
      content = content.replace(/{{title}}/g, data.title || '');
      content = content.replace(/{{url}}/g, data.source_url || '');
      content = content.replace(/{{created_at}}/g, new Date().toISOString());
      content = content.replace(/{{tags}}/g, (data.metadata?.tags || []).map(tag => `#${tag}`).join(' '));
      content = content.replace(/{{content}}/g, data.content || '');
    
      // Handle metadata
      content = content.replace(/{{metadata}}/g, JSON.stringify(data.metadata || {}, null, 2));
    
      // Handle arrays with simple templating
      const arrayRegex = /{{#each\s+([^}]+)}}([\s\S]+?){{\/each}}/g;
      content = content.replace(arrayRegex, (match, path, template) => {
        const value = path.split('.').reduce((obj, key) => obj?.[key], data);
        if (Array.isArray(value)) {
          return value.map(item => {
            let itemContent = template;
            // Replace item properties
            Object.entries(item).forEach(([key, value]) => {
              itemContent = itemContent.replace(
                new RegExp(`{{this.${key}}}`, 'g'),
                value
              );
            });
            return itemContent.trim();
          }).join('\n');
        }
        return '';
      });
    
      return content;
    } catch (error) {
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async saveToObsidian(content, folderName) {
    try {
      const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
      if (!vaultPath) {
        throw new Error('OBSIDIAN_VAULT_PATH not set');
      }

      const normalizedPath = path.normalize(vaultPath);
      const contentDir = path.join(normalizedPath, sanitize(folderName));
      
      // Create content directory if it doesn't exist
      await fs.mkdir(contentDir, { recursive: true });
      
      // Generate safe filename from title
      const filename = sanitize(content.title)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .slice(0, 200);
      
      const filePath = path.join(contentDir, `${filename}.md`);
      
      // Save the file
      await fs.writeFile(filePath, content, 'utf8');
      
      return path.relative(normalizedPath, filePath);
    } catch (error) {
      return await ErrorHandler.handleError(error, {
        service: 'template',
        operation: 'save',
        params: [content, folderName],
        context: { vaultPath: process.env.OBSIDIAN_VAULT_PATH }
      });
    }
  }
}