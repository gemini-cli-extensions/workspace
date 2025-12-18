export const CHAT_FORMATTING_SHORT = [
  'Google Chat formatting (not standard Markdown):',
  '*bold* (single asterisk), _italic_ (single underscore),',
  '~strikethrough~, `code`, bulleted lists ("* " or "- "),',
  '<url|text> links, <users/{user}> mentions.',
  'No nested lists: use "- -- child" for depth.',
  'Convert: **bold** → *bold*, *italic* → _italic_, [text](url) → <url|text>.',
  '# headings and > blockquotes are also unsupported syntax.',
].join(' ');

export const CHAT_FORMATTING = `
Supported formatting:
- *bold* (single asterisks)
- _italic_ (single underscores)
- ~strikethrough~
- \`inline code\`
- \`\`\`code blocks\`\`\`
- Bulleted lists ("* " or "- " at line start)
- Links: <url|text>
- User mentions: <users/{user}>

Unsupported (convert these):
- **double asterisks** for bold
- [text](url) markdown links
- Nested lists (flatten with dashes: "- parent", "- -- child")
- # headings
- > blockquotes
`.trim();
