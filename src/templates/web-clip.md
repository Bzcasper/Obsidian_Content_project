# {{title}}

> [!info]
> **Source:** {{url}}
> **Clipped:** {{metadata.clipped_at}}
> **Tags:** {{tags}}

{{#if metadata.isPartialContent}}
> [!note]
> This is a partial clip of the original content. [View full article]({{url}})
{{/if}}

## Content
{{content}}

{{#if metadata.images}}
## Images
{{#each metadata.images}}
![{{this.alt}}]({{this.localPath}})
*Source: {{this.originalSrc}}*
{{/each}}
{{/if}}

## Metadata
```json
{{metadata}}
```