import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import sanitizeHtml from 'sanitize-html';
import { JSDOM } from 'jsdom';
import natural from 'natural';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import fetch from 'node-fetch';
import slugify from 'slugify';
import imageType from 'image-type';
import { CaptchaSolver } from './captcha-solver.js';
import { ContentClassifier } from './content-classifier.js';
import { ContentEnhancer } from './content-enhancer.js';
import { ErrorHandler } from './error-handler.js';

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

export class ScraperService {
  static async scrape(url) {
    let browser;
    let retryCount = 0;
    const context = {
      service: 'scraper',
      operation: 'scrape',
      params: [url]
    };

    try {
      browser = await chromium.launch({
        headless: true
      });

      const context = await browser.newContext({
        viewport: {
          width: parseInt(process.env.SCRAPER_VIEWPORT_WIDTH) || 1920,
          height: parseInt(process.env.SCRAPER_VIEWPORT_HEIGHT) || 1080
        },
        userAgent: process.env.SCRAPER_USER_AGENT
      });

      // Set up browser context with stealth mode
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        window.chrome = { runtime: {} };
      });

      const page = await context.newPage();

      // Add request interception for handling rate limits
      await page.route('**/*', async route => {
        const request = route.request();
        
        // Check if request is being rate limited
        if (request.response()?.status() === 429) {
          console.log('Rate limited, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          return route.retry();
        }
        
        return route.continue();
      });
      
      // Handle navigation with retries
      const maxRetries = parseInt(process.env.SCRAPER_MAX_RETRIES) || 3;
      
      while (retryCount < maxRetries) {
        try {
          await page.goto(url, {
            timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 30000,
            waitUntil: 'networkidle'
          });

          // Check for common captcha patterns
          const captchaSelectors = [
            '#captcha',
            '[class*="captcha"]',
            '[id*="captcha"]',
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            '#challenge-form'
          ];

          for (const selector of captchaSelectors) {
            const captchaElement = await page.$(selector);
            if (captchaElement) {
              console.log(`Detected captcha: ${selector}`);
              await CaptchaSolver.solve(page, selector);
              
              // Wait for navigation after solving captcha
              await page.waitForNavigation({
                waitUntil: 'networkidle'
              });
            }
          }

          // Check for Cloudflare protection
          const cloudflareSelector = '#challenge-running';
          const hasCloudflare = await page.$(cloudflareSelector);
          if (hasCloudflare) {
            console.log('Detected Cloudflare protection, waiting...');
            await page.waitForSelector(cloudflareSelector, { hidden: true });
          }

          // Check for cookie consent
          const cookieSelectors = [
            '[id*="cookie-consent"] button',
            '[class*="cookie-consent"] button',
            '[id*="cookie-banner"] button',
            'button[class*="accept"]'
          ];

          for (const selector of cookieSelectors) {
            try {
              await page.click(selector);
            } catch (e) {
              // Ignore if selector not found
            }
          }

          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          if (retryCount === maxRetries) throw error;
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Wait for dynamic content
      await page.waitForLoadState('networkidle');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Handle infinite scroll if detected
      const isInfiniteScroll = await this.detectInfiniteScroll(page);
      if (isInfiniteScroll) {
        await this.handleInfiniteScroll(page);
      }

      // Handle lazy-loaded images
      await this.loadLazyImages(page);

      // Handle dynamic content loading
      await this.waitForDynamicContent(page);

      // Extract main content
      const html = await page.content();
      const $ = cheerio.load(html);

      // Get metadata and classify content
      const metadata = await this.extractMetadata($, page);
      const contentType = await ContentClassifier.classify(page);
      metadata.contentType = contentType;

      // Extract keywords and generate folder structure
      const keywords = await this.extractKeywords(page);
      const folderStructure = await this.generateFolderStructure(keywords, contentType);

      // Process images with advanced handling
      const { processedContent, images } = await this.processImages(
        page,
        html,
        folderStructure.path
      );

      // Use Readability with fallback strategies
      const article = await this.extractContent(page, processedContent);

      // Process and enhance content
      const result = await this.processContent(article, metadata, images, keywords);
      
      // Enhance content for affiliate marketing if needed
      if (metadata.contentType === 'affiliate_post') {
        const enhanced = await ContentEnhancer.enhance(result);
        result.content = enhanced.content;
        result.metadata = enhanced.metadata;
      }
      
      // Add additional metadata
      result.metadata.folderStructure = folderStructure;
      result.metadata.contentType = contentType;
      
      return result;

    } catch (error) {
      return await ErrorHandler.handleError(error, context);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  static async detectInfiniteScroll(page) {
    return await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      
      const getScrollHeight = () => Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      );

      const initialHeight = getScrollHeight();
      window.scrollTo(0, initialHeight);
      
      return new Promise(resolve => {
        setTimeout(() => {
          const newHeight = getScrollHeight();
          resolve(newHeight > initialHeight);
        }, 1000);
      });
    });
  }

  static async handleInfiniteScroll(page) {
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 100;
        const maxScrolls = 50; // Prevent infinite loops
        let scrollCount = 0;
        
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          scrollCount++;

          if (totalHeight >= scrollHeight || scrollCount >= maxScrolls) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });
  }

  static async loadLazyImages(page) {
    await page.evaluate(async () => {
      const imgElements = document.getElementsByTagName('img');
      
      for (const img of imgElements) {
        if (img.loading === 'lazy') {
          const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                img.src = img.dataset.src || img.src;
              }
            });
          });
          
          observer.observe(img);
        }
      }
      
      // Wait for images to load
      await Promise.all(
        Array.from(imgElements)
          .filter(img => !img.complete)
          .map(img => new Promise(resolve => {
            img.onload = img.onerror = resolve;
          }))
      );
    });
  }

  static async waitForDynamicContent(page) {
    // Wait for dynamic content markers
    const dynamicSelectors = [
      '[data-loading]',
      '[class*="loading"]',
      '[class*="spinner"]',
      '[class*="skeleton"]'
    ];

    for (const selector of dynamicSelectors) {
      try {
        await page.waitForSelector(selector, {
          state: 'hidden',
          timeout: 5000
        });
      } catch (e) {
        // Ignore timeout
      }
    }
  }

  static async generateFolderStructure(keywords, contentType) {
    // Create hierarchical folder structure based on content type and keywords
    const mainCategory = contentType.toLowerCase();
    const subCategory = keywords[0]?.toLowerCase() || 'uncategorized';
    
    const folderPath = path.join(
      mainCategory,
      subCategory,
      keywords.slice(1, 3).join('-').toLowerCase()
    );

    return {
      path: folderPath,
      category: mainCategory,
      subcategory: subCategory,
      keywords: keywords
    };
  }

  static async extractContent(page, html) {
    // Try multiple content extraction strategies
    const strategies = [
      // Strategy 1: Readability
      async () => {
        const dom = new JSDOM(html);
        const reader = new Readability(dom.window.document);
        return reader.parse();
      },
      
      // Strategy 2: Main content selectors
      async () => {
        const content = await page.evaluate(() => {
          const selectors = [
            'article',
            'main',
            '[role="main"]',
            '#content',
            '.content',
            '.post-content'
          ];

          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element.innerHTML;
          }
          return null;
        });

        if (content) {
          return {
            content,
            title: await page.title(),
            excerpt: content.substring(0, 200)
          };
        }
        return null;
      }
    ];

    // Try each strategy until one works
    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) return result;
      } catch (e) {
        console.error('Content extraction strategy failed:', e);
      }
    }

    throw new Error('Could not extract content with any available strategy');
  }

  static async processImages(page, html, folderPath) {
    const images = new Map();
    const $ = cheerio.load(html);
    
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const normalizedPath = path.normalize(vaultPath);
    const imagesDir = path.join(normalizedPath, folderPath, 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    // Process each image with enhanced handling
    const imageElements = $('img').toArray();
    for (const img of imageElements) {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (!src) continue;

      try {
        // Generate unique filename
        const hash = crypto.createHash('md5').update(src).digest('hex');
        
        // Handle base64 images
        if (src.startsWith('data:image')) {
          const matches = src.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
          if (matches) {
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = `${hash}.${matches[1]}`;
            const imagePath = path.join(imagesDir, filename);
            await fs.writeFile(imagePath, buffer);
            images.set(src, path.join('images', filename));
            continue;
          }
        }

        // Handle relative URLs
        const absoluteUrl = new URL(src, page.url()).href;
        const response = await fetch(absoluteUrl);
        const buffer = await response.arrayBuffer();
        
        const type = await imageType(new Uint8Array(buffer));
        if (!type) continue;

        const filename = `${hash}.${type.ext}`;
        const imagePath = path.join(imagesDir, filename);
        
        await fs.writeFile(imagePath, Buffer.from(buffer));
        
        const relativePath = path.join('images', filename);
        images.set(src, relativePath);
        
        // Update image src in HTML
        $(img).attr('src', relativePath);

        // Extract and store image metadata
        const alt = $(img).attr('alt') || '';
        const title = $(img).attr('title') || '';
        const dimensions = await this.getImageDimensions(buffer);
        
        images.set(`${src}_metadata`, {
          alt,
          title,
          dimensions,
          originalSrc: src,
          localPath: relativePath
        });

      } catch (error) {
        await ErrorHandler.handleError(error, {
          service: 'scraper',
          operation: 'processImage',
          params: [src],
          context: { folderPath }
        });
      }
    }

    return {
      processedContent: $.html(),
      images: Array.from(images.entries())
        .filter(([key]) => !key.endsWith('_metadata'))
        .map(([src]) => images.get(`${src}_metadata`))
    };
  }

  static async getImageDimensions(buffer) {
    try {
      const { width, height } = await imageSize(buffer);
      return { width, height };
    } catch (e) {
      return null;
    }
  }

  // Existing methods like extractKeywords, processContent, extractMetadata remain the same
}