import { WebClipperService } from './src/services/web-clipper-service.js';
import { ErrorHandler } from './src/services/error-handler.js';

export const handler = async (event) => {
  try {
    // Parse request body
    const body = JSON.parse(event.body);
    
    // Validate request
    if (!body.url) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'URL is required'
        })
      };
    }

    // Process web clip
    const result = await WebClipperService.handleClip(body);

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    // Handle error with our error handler
    const handledError = await ErrorHandler.handleError(error, {
      service: 'lambda',
      operation: 'handleClip',
      params: [event.body]
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: handledError.message,
        details: handledError.context
      })
    };
  }
}