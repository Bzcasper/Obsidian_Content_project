import fs from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import dotenv from 'dotenv';
import { ErrorHandler } from './error-handler.js';
import { readdir } from 'fs/promises';

dotenv.config();

export class FileService {
  static async saveAsMarkdown(content, templateName = 'default') {
    const context = {
      service: 'file',
      operation: 'saveAsMarkdown',
      params: [content, templateName]
    };

    try {
      const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
      const normalizedPath = path.normalize(vaultPath);

      if (!vaultPath) {
        throw new Error('OBSIDIAN_VAULT_PATH environment variable is not set');
      }

      // Generate folder name from keywords or first tag
      const folderName = content.metadata?.keywords?.length > 0
        ? content.metadata.keywords.slice(0, 3).join('-').toLowerCase()
        : (content.metadata?.tags?.length > 0 ? content.metadata.tags[0] : 'misc');

      const contentDir = path.join(normalizedPath, sanitize(folderName));
      const templatesDir = path.join(normalizedPath, '.obsidian', 'templates');
      
      // Create directories
      await fs.mkdir(templatesDir, { recursive: true });
      await fs.mkdir(contentDir, { recursive: true });

      // Sanitize filename from title
      const filename = sanitize(content.title)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .slice(0, 200);
      
      const filePath = path.join(contentDir, `${filename}.md`);

      // Get template content
      let template = await this.getTemplate(templateName);

      // Format tags and images for Obsidian
      const tags = content.metadata?.tags || [];
      const formattedTags = tags.map(tag => `#${tag}`).join(' ');
      const images = content.metadata?.images || [];
      const imageGallery = images.length > 0
        ? '\n\n## Images\n\n' + images.map(img => 
            `![${img.alt}](${img.localPath})\n*Original: ${img.originalSrc}*`
          ).join('\n\n')
        : '';

      // Replace placeholders in template
      const markdown = template
        .replace(/{{title}}/g, content.title)
        .replace(/{{url}}/g, content.source_url || 'No source URL')
        .replace(/{{tags}}/g, formattedTags)
        .replace(/{{created_at}}/g, new Date(content.created_at).toISOString())
        .replace(/{{metadata}}/g, JSON.stringify(content.metadata, null, 2))
        .replace(/{{content}}/g, content.content + imageGallery);

      // Write to file
      await fs.writeFile(filePath, markdown, 'utf8');

      // Return relative path from vault root
      return path.relative(normalizedPath, filePath);
    } catch (error) {
      if (error.message.includes('OBSIDIAN_VAULT_PATH')) {
        throw error;
      }
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async getTemplate(name) {
    try {
      const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
      const normalizedPath = path.normalize(vaultPath);
      const templatesDir = path.join(normalizedPath, '.obsidian', 'templates');
      const templatePath = path.join(templatesDir, `${name}.md`);

      try {
        return await fs.readFile(templatePath, 'utf8');
      } catch (error) {
        // If template doesn't exist, return default template
        return [
        `# ${content.title}`,
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
      throw new Error(`Failed to get template: ${error.message}`);
    }
  }

  static async saveTemplate(name, content) {
    try {
      const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
      const normalizedPath = path.normalize(vaultPath);
      const templatesDir = path.join(normalizedPath, '.obsidian', 'templates');
      await fs.mkdir(templatesDir, { recursive: true });

      const templatePath = path.join(templatesDir, `${sanitize(name)}.md`);
      await fs.writeFile(templatePath, content, 'utf8');
      return path.relative(normalizedPath, templatePath);
    } catch (error) {
      throw new Error(`Failed to save template: ${error.message}`);
    }
  }

  static async listTemplates() {
    try {
      const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
      const normalizedPath = path.normalize(vaultPath);
      const templatesDir = path.join(normalizedPath, '.obsidian', 'templates');
      
      try {
        const files = await readdir(templatesDir);
        return files
          .filter(file => file.endsWith('.md'))
          .map(file => file.replace(/\.md$/, ''));
      } catch (error) {
        if (error.code === 'ENOENT') {
          return ['default'];
        }
        throw error;
      }
    }
  }

  static async validateVaultPath() {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    
    // Normalize path for Windows
    const normalizedPath = path.normalize(vaultPath);
    
    if (!vaultPath) {
      throw new Error('OBSIDIAN_VAULT_PATH environment variable is not set');
    }

    try {
      await fs.access(normalizedPath);
      console.log(`Successfully validated Obsidian vault path: ${normalizedPath}`);
      return true;
    } catch (error) {
      console.error(`Error accessing vault path: ${error.message}`);
      throw new Error(`Cannot access Obsidian vault path at ${normalizedPath}. Please check permissions and path.`);
    }
  }
}