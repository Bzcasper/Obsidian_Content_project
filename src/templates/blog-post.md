# {{title}}

**Source:** {{url}}
**Created:** {{created_at}}
**Tags:** {{tags}}
**Reading Time:** {{metadata.readingTime}} minutes
**Word Count:** {{metadata.wordCount}} words

## Metadata
```json
{{metadata}}
```

## Summary
{{metadata.description}}

## Content
{{content}}

## Related Links
{{#each metadata.links}}
- [{{this.text}}]({{this.href}})
{{/each}}

## Images
{{#each metadata.images}}
![{{this.alt}}]({{this.localPath}})
*Original: {{this.originalSrc}}*
{{/each}}

## Keywords
{{#each metadata.keywords}}
- {{this}}
{{/each}}