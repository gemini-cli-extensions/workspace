/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const markedMock = jest.fn((text) => {
  // Simple mock implementation that returns HTML
  return `<p>${text}</p>`;
});

// Add parse method to the marked function
markedMock.parse = jest.fn((text) => {
  // Return a promise that resolves to HTML
  return Promise.resolve(`<p>${text}</p>`);
});

markedMock.parseInline = jest.fn((text) => {
  // Simple markdown to HTML conversion for testing
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // **bold** -> <strong>bold</strong>
    .replace(/\*(.*?)\*/g, '<em>$1</em>')              // *italic* -> <em>italic</em>
    .replace(/_(.*?)_/g, '<em>$1</em>')                // _italic_ -> <em>italic</em>
    .replace(/`(.*?)`/g, '<code>$1</code>');           // `code` -> <code>code</code>
});
markedMock.use = jest.fn();
markedMock.setOptions = jest.fn();
markedMock.getDefaults = jest.fn();
markedMock.defaults = {};
markedMock.Renderer = jest.fn();
markedMock.TextRenderer = jest.fn();
markedMock.Lexer = jest.fn();
markedMock.Parser = jest.fn();
markedMock.Tokenizer = jest.fn();
markedMock.Slugger = jest.fn();
markedMock.lexer = jest.fn();
markedMock.parser = jest.fn();

module.exports = {
  marked: markedMock,
  Marked: jest.fn(),
  lexer: markedMock.lexer,
  parser: markedMock.parser,
  Renderer: markedMock.Renderer,
  TextRenderer: markedMock.TextRenderer,
  Lexer: markedMock.Lexer,
  Parser: markedMock.Parser,
  Tokenizer: markedMock.Tokenizer,
  Slugger: markedMock.Slugger,
  parse: markedMock.parse,
  parseInline: markedMock.parseInline,
  use: markedMock.use,
  setOptions: markedMock.setOptions,
  getDefaults: markedMock.getDefaults,
  defaults: markedMock.defaults,
};