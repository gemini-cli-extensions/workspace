// src/helpers/markdown.ts
// Markdown conversion utilities for Google Docs

/**
 * Converts Google Docs JSON structure to Markdown format
 */
export function convertDocsJsonToMarkdown(docData: any): string {
  let markdown = '';

  if (!docData.body?.content) {
    return 'Document appears to be empty.';
  }

  docData.body.content.forEach((element: any) => {
    if (element.paragraph) {
      markdown += convertParagraphToMarkdown(element.paragraph);
    } else if (element.table) {
      markdown += convertTableToMarkdown(element.table);
    } else if (element.sectionBreak) {
      markdown += '\n---\n\n';
    }
  });

  return markdown.trim();
}

/**
 * Converts a paragraph element to markdown
 */
function convertParagraphToMarkdown(paragraph: any): string {
  let text = '';
  let isHeading = false;
  let headingLevel = 0;
  let isList = false;

  // Check paragraph style for headings and lists
  if (paragraph.paragraphStyle?.namedStyleType) {
    const styleType = paragraph.paragraphStyle.namedStyleType;
    if (styleType.startsWith('HEADING_')) {
      isHeading = true;
      headingLevel = parseInt(styleType.replace('HEADING_', ''));
    } else if (styleType === 'TITLE') {
      isHeading = true;
      headingLevel = 1;
    } else if (styleType === 'SUBTITLE') {
      isHeading = true;
      headingLevel = 2;
    }
  }

  // Check for bullet lists
  if (paragraph.bullet) {
    isList = true;
  }

  // Process text elements
  if (paragraph.elements) {
    paragraph.elements.forEach((element: any) => {
      if (element.textRun) {
        text += convertTextRunToMarkdown(element.textRun);
      }
    });
  }

  // Format based on style
  if (isHeading && text.trim()) {
    const hashes = '#'.repeat(Math.min(headingLevel, 6));
    return `${hashes} ${text.trim()}\n\n`;
  } else if (isList && text.trim()) {
    return `- ${text.trim()}\n`;
  } else if (text.trim()) {
    return `${text.trim()}\n\n`;
  }

  return '\n';
}

/**
 * Converts a text run to markdown with formatting
 */
function convertTextRunToMarkdown(textRun: any): string {
  let text = textRun.content || '';

  if (textRun.textStyle) {
    const style = textRun.textStyle;

    // Apply formatting
    if (style.bold && style.italic) {
      text = `***${text}***`;
    } else if (style.bold) {
      text = `**${text}**`;
    } else if (style.italic) {
      text = `*${text}*`;
    }

    if (style.underline && !style.link) {
      text = `<u>${text}</u>`;
    }

    if (style.strikethrough) {
      text = `~~${text}~~`;
    }

    if (style.link?.url) {
      text = `[${text}](${style.link.url})`;
    }
  }

  return text;
}

/**
 * Converts a table to markdown format
 */
function convertTableToMarkdown(table: any): string {
  if (!table.tableRows || table.tableRows.length === 0) {
    return '';
  }

  let markdown = '\n';
  let isFirstRow = true;

  table.tableRows.forEach((row: any) => {
    if (!row.tableCells) return;

    let rowText = '|';
    row.tableCells.forEach((cell: any) => {
      let cellText = '';
      if (cell.content) {
        cell.content.forEach((element: any) => {
          if (element.paragraph?.elements) {
            element.paragraph.elements.forEach((pe: any) => {
              if (pe.textRun?.content) {
                cellText += pe.textRun.content.replace(/\n/g, ' ').trim();
              }
            });
          }
        });
      }
      rowText += ` ${cellText} |`;
    });

    markdown += rowText + '\n';

    // Add header separator after first row
    if (isFirstRow) {
      let separator = '|';
      for (let i = 0; i < row.tableCells.length; i++) {
        separator += ' --- |';
      }
      markdown += separator + '\n';
      isFirstRow = false;
    }
  });

  return markdown + '\n';
}
