# {{title}}

> [!info]
> **Date:** {{metadata.date}}
> **Last Updated:** {{metadata.trends.timestamp}}

## Real-Time Trends

{{#each metadata.trends.realTime}}
### {{this.title}}
{{#if this.entityNames}}
**Related Entities:** {{this.entityNames}}
{{/if}}

{{#each this.articles}}
- [{{this.title}}]({{this.url}})
{{/each}}

[View on Google Trends]({{this.shareUrl}})
{{/each}}

## Daily Trends

{{#each metadata.trends.daily}}
### {{this.title}}
**Traffic:** {{this.formattedTraffic}}
**Date:** {{this.date}}

{{#if this.relatedQueries}}
**Related Queries:**
{{#each this.relatedQueries}}
- {{this}}
{{/each}}
{{/if}}

{{#each this.articles}}
- [{{this.title}}]({{this.url}})
{{/each}}
{{/each}}

## Trends by Category

{{#each metadata.trends.categories}}
### {{@key}}
{{#each this}}
- {{this.title}}
{{/each}}
{{/each}}

## Content Opportunities

{{#if metadata.trends.relevantUrls}}
### High-Priority Content Ideas
{{#each metadata.trends.relevantUrls}}
{{#if normalizedScore >= 7}}
#### [{{title}}]({{url}})
- **Type:** {{type}}
- **Score:** {{normalizedScore}}
- **Trend:** {{trend}}
- **Source:** {{source}}

> {{description}}

{{/if}}
{{/each}}

### Other Opportunities
{{#each metadata.trends.relevantUrls}}
{{#if normalizedScore < 7}}
- [{{title}}]({{url}}) ({{type}}, Score: {{normalizedScore}})
{{/if}}
{{/each}}
{{/if}}

## Notes
-