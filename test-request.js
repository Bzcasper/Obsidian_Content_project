import fetch from 'node-fetch';

async function testEndpoints() {
  const BASE_URL = 'http://localhost:3000';
  
  try {
    console.log('Starting API tests...\n');

    // Test health endpoint
    console.log('\nTesting health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('Health check:', {
      status: healthData.status,
      timestamp: healthData.timestamp,
      uptime: `${Math.floor(healthData.uptime / 60)} minutes`,
      memoryUsage: `${Math.round(healthData.memory.heapUsed / 1024 / 1024)}MB`,
      nodeVersion: healthData.version
    });

    // Test content creation with validation
    console.log('\nTesting content creation with validation...');
    const contentResponse = await fetch(`${BASE_URL}/api/content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Content',
        content: 'This is test content',
        type: 'blog_post',
        tags: ['test', 'validation'],
        source_url: 'https://example.com/test'
      })
    });
    console.log('Content creation result:', await contentResponse.json());

    // Test invalid content creation
    console.log('\nTesting invalid content creation...');
    const invalidResponse = await fetch(`${BASE_URL}/api/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', tags: 'invalid' })
    });
    console.log('Invalid content result:', await invalidResponse.json());

    // Test scraping endpoint
    console.log('\nTesting scrape endpoint...');
    const scrapeResponse = await fetch(`${BASE_URL}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://example.com',
        type: 'blog_post',
        tags: ['test', 'example', 'api'],
        metadata: {
          category: 'testing'
        }
      }),
      timeout: 30000
    });
    console.log('Scrape result:', await scrapeResponse.json());

    // Test content retrieval by URL
    console.log('\nTesting content retrieval by URL...');
    const encodedUrl = encodeURIComponent('https://example.com');
    const contentByUrlResponse = await fetch(`${BASE_URL}/api/content/url/${encodedUrl}`);
    console.log('Content by URL:', await contentByUrlResponse.json());

    // Test content retrieval
    console.log('\nTesting content retrieval...');
    const contentResponse = await fetch(`${BASE_URL}/api/content?type=blog_post`);
    console.log('Content:', await contentResponse.json());

    // Test logs retrieval
    console.log('\nTesting logs retrieval...');
    const logsResponse = await fetch(`${BASE_URL}/api/logs`);
    console.log('Logs:', await logsResponse.json());

    // Test template management
    console.log('\nTesting template creation...');
    const templateResponse = await fetch(`${BASE_URL}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'blog',
        content: '# {{title}}\n\n**Source:** {{url}}\n**Tags:** {{tags}}\n\n{{content}}'
      })
    });
    console.log('Template creation result:', await templateResponse.json());

    // Test template listing
    console.log('\nTesting template listing...');
    const templatesResponse = await fetch(`${BASE_URL}/api/templates`);
    console.log('Available templates:', await templatesResponse.json());

    // Test content creation with template
    console.log('\nTesting content creation with template...');
    const contentWithTemplateResponse = await fetch(`${BASE_URL}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/blog',
        type: 'blog_post',
        template: 'blog',
        tags: ['blog', 'test'],
        metadata: { category: 'testing' }
      })
    });
    console.log('Content with template result:', await contentWithTemplateResponse.json());

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Error during testing:', error);
    process.exit(1);
  }
}

testEndpoints();