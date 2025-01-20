import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { ErrorHandler } from './error-handler.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class ImageGenerationService {
  static async generateImage(title, keywords = []) {
    const context = {
      service: 'image-generation',
      operation: 'generateImage',
      params: [title, keywords]
    };

    try {
      // Generate image prompt
      const prompt = await this.createImagePrompt(title, keywords);

      // Generate image using Stability AI
      const imageData = await this.generateWithStabilityAI(prompt);

      // Save image to Obsidian vault
      const savedImage = await this.saveImage(imageData, title);

      // Log image generation
      await supabase
        .from('logs')
        .insert([{
          event: 'image_generated',
          details: {
            title,
            prompt,
            path: savedImage.path
          }
        }]);

      return savedImage;
    } catch (error) {
      return await ErrorHandler.handleError(error, context);
    }
  }

  static async createImagePrompt(title, keywords) {
    // Combine title and keywords for context
    const context = [title, ...keywords].join(', ');
    
    // Create detailed prompt for high-quality image
    return `Create a professional featured image for a blog post about ${context}. 
      Style: Modern, clean, minimalist design
      Colors: Vibrant but professional
      Layout: Balanced composition with clear focal point
      Text: None (will be added separately)
      Quality: High resolution, suitable for web and social media`;
  }

  static async generateWithStabilityAI(prompt) {
    const engineId = 'stable-diffusion-xl-1024-v1-0';
    const apiHost = 'https://api.stability.ai';
    const apiKey = process.env.STABILITY_API_KEY;

    if (!apiKey) throw new Error('Missing Stability API key');

    const response = await fetch(
      `${apiHost}/v1/generation/${engineId}/text-to-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text_prompts: [
            {
              text: prompt,
              weight: 1
            }
          ],
          cfg_scale: 7,
          height: 1024,
          width: 1024,
          steps: 50,
          samples: 1
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Image generation failed: ${response.statusText}`);
    }

    const responseJSON = await response.json();
    return responseJSON.artifacts[0];
  }

  static async saveImage(imageData, title) {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const imagesPath = path.join(vaultPath, 'assets', 'images');
    
    // Create images directory if it doesn't exist
    await fs.mkdir(imagesPath, { recursive: true });
    
    // Generate unique filename
    const hash = crypto.createHash('md5')
      .update(title + Date.now())
      .digest('hex');
    
    const filename = `featured-${hash}.png`;
    const filePath = path.join(imagesPath, filename);
    
    // Save image
    await fs.writeFile(
      filePath,
      Buffer.from(imageData.base64, 'base64')
    );
    
    return {
      path: path.relative(vaultPath, filePath),
      filename,
      width: imageData.width,
      height: imageData.height
    };
  }
}