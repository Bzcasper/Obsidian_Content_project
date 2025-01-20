import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export class ErrorHandler {
  static async handleError(error, context = {}) {
    try {
      // Log error to Supabase
      await this.logError(error, context);
      
      // Get recovery strategy
      const strategy = await this.getRecoveryStrategy(error, context);
      
      // Execute recovery if available
      if (strategy) {
        return await strategy.execute();
      }
      
      // If no recovery possible, throw enhanced error
      throw this.enhanceError(error, context);
    } catch (handlingError) {
      console.error('Error handler failed:', handlingError);
      throw error; // Throw original error if handler fails
    }
  }

  static async logError(error, context) {
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        code: error.code,
        context: JSON.stringify(context),
        timestamp: new Date().toISOString(),
        service: context.service,
        operation: context.operation
      };

      await supabase
        .from('logs')
        .insert([{
          event: 'error',
          details: errorData,
          user_id: context.userId
        }]);
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
  }

  static async getRecoveryStrategy(error, context) {
    const strategies = {
      // Network errors
      ECONNREFUSED: {
        name: 'Connection Retry',
        maxRetries: 3,
        async execute() {
          return await RetryHandler.withExponentialBackoff(
            context.operation,
            context.params,
            this.maxRetries
          );
        }
      },
      
      // Rate limiting
      RATE_LIMIT: {
        name: 'Rate Limit Handler',
        async execute() {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return await context.operation(...context.params);
        }
      },
      
      // Service unavailable
      SERVICE_UNAVAILABLE: {
        name: 'Service Fallback',
        async execute() {
          return await FallbackService.execute(
            context.service,
            context.operation,
            context.params
          );
        }
      },
      
      // Data validation
      VALIDATION_ERROR: {
        name: 'Data Validation Recovery',
        async execute() {
          return await ValidationHandler.recover(
            context.data,
            context.schema
          );
        }
      }
    };

    // Get strategy based on error code or type
    return strategies[error.code] || strategies[this.classifyError(error)];
  }

  static classifyError(error) {
    if (error.message.includes('rate limit')) return 'RATE_LIMIT';
    if (error.message.includes('service unavailable')) return 'SERVICE_UNAVAILABLE';
    if (error.message.includes('validation')) return 'VALIDATION_ERROR';
    return 'UNKNOWN';
  }

  static enhanceError(error, context) {
    const enhanced = new Error(error.message);
    enhanced.originalError = error;
    enhanced.context = context;
    enhanced.timestamp = new Date().toISOString();
    enhanced.recoverable = false;
    return enhanced;
  }
}

class RetryHandler {
  static async withExponentialBackoff(operation, params, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation(...params);
      } catch (error) {
        lastError = error;
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

class FallbackService {
  static async execute(service, operation, params) {
    const fallbacks = {
      scraper: {
        scrape: async (url) => {
          // Try alternative scraping methods
          const methods = [
            this.simpleFetch,
            this.readabilityParse,
            this.metadataExtract
          ];
          
          for (const method of methods) {
            try {
              return await method(url);
            } catch (error) {
              continue;
            }
          }
          throw new Error('All fallback methods failed');
        }
      },
      
      template: {
        apply: async (content) => {
          // Fallback to simple template
          return {
            title: content.title || 'Untitled',
            content: content.content || '',
            metadata: content.metadata || {}
          };
        }
      },
      
      storage: {
        save: async (data) => {
          // Try alternative storage methods
          try {
            return await this.saveToLocalStorage(data);
          } catch (error) {
            return await this.saveToTempFile(data);
          }
        }
      }
    };

    return await fallbacks[service][operation](...params);
  }

  static async simpleFetch(url) {
    const response = await fetch(url);
    const html = await response.text();
    return { content: html, type: 'raw' };
  }

  static async readabilityParse(url) {
    const { Readability } = await import('readability');
    const response = await fetch(url);
    const html = await response.text();
    const doc = new JSDOM(html);
    const reader = new Readability(doc.window.document);
    return reader.parse();
  }

  static async metadataExtract(url) {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    return {
      title: $('title').text(),
      content: $('body').text(),
      metadata: {
        description: $('meta[name="description"]').attr('content'),
        keywords: $('meta[name="keywords"]').attr('content')
      }
    };
  }

  static async saveToLocalStorage(data) {
    const key = `backup_${Date.now()}`;
    localStorage.setItem(key, JSON.stringify(data));
    return { key, storage: 'local' };
  }

  static async saveToTempFile(data) {
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `backup_${Date.now()}.json`);
    await fs.writeFile(filePath, JSON.stringify(data));
    return { path: filePath, storage: 'temp' };
  }
}

class ValidationHandler {
  static async recover(data, schema) {
    // Try to fix common validation issues
    const fixed = { ...data };
    
    // Handle missing required fields
    for (const [field, rules] of Object.entries(schema)) {
      if (rules.required && !fixed[field]) {
        fixed[field] = this.getDefaultValue(rules.type);
      }
    }
    
    // Fix data types
    for (const [field, value] of Object.entries(fixed)) {
      if (schema[field]) {
        fixed[field] = this.coerceType(value, schema[field].type);
      }
    }
    
    return fixed;
  }

  static getDefaultValue(type) {
    switch (type) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'array': return [];
      case 'object': return {};
      default: return null;
    }
  }

  static coerceType(value, type) {
    try {
      switch (type) {
        case 'string': return String(value);
        case 'number': return Number(value);
        case 'boolean': return Boolean(value);
        case 'array': return Array.isArray(value) ? value : [value];
        case 'object': return typeof value === 'object' ? value : {};
        default: return value;
      }
    } catch {
      return this.getDefaultValue(type);
    }
  }
}