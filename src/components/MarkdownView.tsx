import React from 'react';

interface MarkdownViewProps {
  content: string;
}

/**
 * A lightweight, safe Markdown renderer for beginner tutor responses.
 * Parses headings, bold, italics, inline code, code blocks, lists, and quotes
 * into native React elements without dangerouslySetInnerHTML.
 */
export function MarkdownView({ content }: MarkdownViewProps) {
  if (!content) return null;

  // Split into blocks by double newlines or single newlines with block markers
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let listItems: string[] = [];
  let isOrderedList = false;

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    const items = listItems.map((item, idx) => (
      <li key={`${keyPrefix}-li-${idx}`}>{renderInline(item)}</li>
    ));
    if (isOrderedList) {
      elements.push(<ol key={`${keyPrefix}-ol`} className="md-ol">{items}</ol>);
    } else {
      elements.push(<ul key={`${keyPrefix}-ul`} className="md-ul">{items}</ul>);
    }
    listItems = [];
    isOrderedList = false;
  };

  const flushCodeBlock = (keyPrefix: string) => {
    if (!inCodeBlock) return;
    elements.push(
      <div key={`${keyPrefix}-code`} className="md-code-wrapper">
        {codeBlockLang && <span className="md-code-lang">{codeBlockLang}</span>}
        <pre className="md-code">
          <code>{codeBlockLines.join('\n')}</code>
        </pre>
      </div>
    );
    inCodeBlock = false;
    codeBlockLang = '';
    codeBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle (``` or ```python)
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock(`block-${i}`);
      } else {
        flushList(`list-before-${i}`);
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim() || 'python';
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Unordered list item
    const ulMatch = trimmed.match(/^([•\-\*])\s+(.+)$/);
    if (ulMatch) {
      if (isOrderedList) flushList(`switch-${i}`);
      listItems.push(ulMatch[2]);
      continue;
    }

    // Ordered list item
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (!isOrderedList && listItems.length > 0) flushList(`switch-ol-${i}`);
      isOrderedList = true;
      listItems.push(olMatch[2]);
      continue;
    }

    // If we were collecting list items and hit a normal line, flush list
    if (listItems.length > 0 && trimmed !== '') {
      flushList(`flush-${i}`);
    }

    // Empty line
    if (!trimmed) {
      flushList(`flush-empty-${i}`);
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={`h4-${i}`} className="md-h4">{renderInline(trimmed.slice(4))}</h4>);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={`h3-${i}`} className="md-h3">{renderInline(trimmed.slice(3))}</h3>);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h3 key={`h2-${i}`} className="md-h2">{renderInline(trimmed.slice(2))}</h3>);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={`quote-${i}`} className="md-quote">
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Normal paragraph
    elements.push(<p key={`p-${i}`} className="md-p">{renderInline(trimmed)}</p>);
  }

  // Final flushes if file ended inside a block
  if (inCodeBlock) flushCodeBlock('final');
  if (listItems.length > 0) flushList('final');

  return <div className="markdown-view">{elements}</div>;
}

/**
 * Parses inline Markdown: bold (**text**), italic (*text*), inline code (`code`), emoji/text
 */
function renderInline(text: string): React.ReactNode[] {
  // Regex splitting by backticks (code), bold (**), italic (*)
  const parts: React.ReactNode[] = [];
  // Tokenize by `code` first, then **bold**, then *italic*
  const codeRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={`code-${match.index}`} className="md-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`bold-${match.index}`} className="md-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={`em-${match.index}`} className="md-italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
