import { TrendsService } from '../services/trends-service.js';
import { ErrorHandler } from '../services/error-handler.js';

export const handler = async (event) => {
  const context = {
    service: 'lambda',
    operation: 'trends',
    params: [event]
  };

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    
    const trends = await TrendsService.fetchTrendingTopics({
      geo: body.geo,
      category: body.category
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true
      },
      body: JSON.stringify({
        success: true,
        trends
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