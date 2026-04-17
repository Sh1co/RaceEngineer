# AI Chat in English

This template lets you chat with RaceEngineer in English.

## Template

### Configuration

```json conversation-template
{
  "id": "chat-en",
  "engineVersion": 0,
  "label": "Start chat",
  "description": "Start a basic chat with RaceEngineer.",
  "header": {
    "title": "New chat",
    "useFirstMessageAsTitle": true,
    "icon": {
      "type": "codicon",
      "value": "comment-discussion"
    }
  },
  "variables": [
    {
      "name": "openFiles",
      "time": "conversation-start",
      "type": "context"
    },
    {
      "name": "selectedText",
      "time": "conversation-start",
      "type": "selected-text"
    },
    {
      "name": "lastMessage",
      "time": "message",
      "type": "message",
      "property": "content",
      "index": -1
    }
  ],
  "response": {
    "retrievalAugmentation": {
      "type": "similarity-search",
      "variableName": "searchResults",
      "query": "{{lastMessage}}",
      "source": "embedding-file",
      "file": "raceengineer-repository.json",
      "threshold": 0.7,
      "maxResults": 5
    },
    "maxTokens": 1024,
    "stop": ["Bot:", "Developer:"]
  }
}
```

### Response Prompt

```template-response
## Instructions
Continue the conversation below.
Pay special attention to the current developer request.

## Current Request
Developer: {{lastMessage}}

{{#if openFiles}}
## Open Files Context
{{#each openFiles}}
### {{name}} ({{language}})
\`\`\`
{{content}}
\`\`\`
{{/each}}
{{/if}}

{{#if selectedText}}
## Selected Code
\`\`\`
{{selectedText}}
\`\`\`
{{/if}}

{{#if searchResults}}
## Repository Search Results
{{#each searchResults}}
### {{file}}:{{startPosition}}-{{endPosition}}
\`\`\`
{{content}}
\`\`\`
{{/each}}
{{/if}}

## Conversation
{{#each messages}}
{{#if (eq author "bot")}}
Bot: {{content}}
{{else}}
Developer: {{content}}
{{/if}}
{{/each}}


## Response
Bot:
```
