import { ObsidianAutomationService } from '../services/obsidian-automation-service.js';
import { ErrorHandler } from '../services/error-handler.js';

export const handler = async (event) => {
  const context = {
    service: 'lambda',
    operation: 'automation',
    params: [event]
  };

  try {
    // Parse request body
    const body = JSON.parse(event.body);
    
    // Handle different automation actions
    switch (body.action) {
      case 'schedule':
        if (!body.url || !body.scheduledDate) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: 'URL and scheduledDate are required'
            })
          };
        }
        
        const scheduleResult = await ObsidianAutomationService.scheduleContent(
          body.url,
          body.scheduledDate,
          body.options
        );
        
        return {
          statusCode: 200,
          body: JSON.stringify(scheduleResult)
        };

      case 'process':
        const processResult = await ObsidianAutomationService.processScheduledContent();
        
        return {
          statusCode: 200,
          body: JSON.stringify(processResult)
        };

      case 'initialize':
        const initResult = await ObsidianAutomationService.initializeDashboard();
        
        return {
          statusCode: 200,
          body: JSON.stringify(initResult)
        };

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid action'
          })
        };
    }
  } catch (error) {
    const handledError = await ErrorHandler.handleError(error, context);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: handledError.message,
        details: handledError.context
      })
    };
  }
};