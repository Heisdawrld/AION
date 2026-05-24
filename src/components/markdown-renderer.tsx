'use client';

import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Lightweight markdown renderer using regex-based parsing.
 * Supports: bold, italic, code blocks, inline code, lists, headers, links
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const html = renderMarkdown(content);

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  // Store code blocks first to protect them from other transformations
  const codeBlocks: string[] = [];
  let processed = text;

  // Extract fenced code blocks (```...```)
  processed = processed.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const index = codeBlocks.length;
    const escapedCode = escapeHtml(code.trim());
    codeBlocks.push(
      `<div class="relative my-3 rounded-lg border border-border bg-muted/50 overflow-hidden">` +
        `<div class="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border">` +
          `<span class="text-[10px] font-mono text-muted-foreground uppercase">${lang || 'code'}</span>` +
        `</div>` +
        `<pre class="p-3 overflow-x-auto text-xs font-mono leading-relaxed"><code>${escapedCode}</code></pre>` +
      `</div>`
    );
    return `%%CODEBLOCK_${index}%%`;
  });

  // Split into lines for block-level processing
  const lines = processed.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip if this is a code block placeholder
    if (line.includes('%%CODEBLOCK_')) {
      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      result.push(line);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      if (inList) {
        result.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      const level = headerMatch[1].length;
      const headerText = applyInlineFormatting(headerMatch[2]);
      result.push(`<h${level} class="font-bold mt-3 mb-1 ${level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm'}">${headerText}</h${level}>`);
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (ulMatch) {
      const itemText = applyInlineFormatting(ulMatch[1]);
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ul class="list-disc pl-5 my-1 space-y-0.5">');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${itemText}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);
    if (olMatch) {
      const itemText = applyInlineFormatting(olMatch[1]);
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
        result.push('<ol class="list-decimal pl-5 my-1 space-y-0.5">');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${itemText}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList && line.trim() === '') {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      result.push('<br/>');
      continue;
    }
    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      result.push('<hr class="my-3 border-border"/>');
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      result.push('<br/>');
      continue;
    }

    // Regular paragraph
    result.push(`<p class="my-0.5">${applyInlineFormatting(line)}</p>`);
  }

  // Close any open list
  if (inList) {
    result.push(listType === 'ul' ? '</ul>' : '</ol>');
  }

  // Restore code blocks
  let finalHtml = result.join('\n');
  codeBlocks.forEach((block, index) => {
    finalHtml = finalHtml.replace(`%%CODEBLOCK_${index}%%`, block);
  });

  return finalHtml;
}

function applyInlineFormatting(text: string): string {
  let result = text;

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  // Inline code: `text`
  result = result.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-amber-600 dark:text-amber-400">$1</code>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-amber-600 dark:text-amber-400 underline hover:no-underline">$1</a>');

  // Checkmarks and X marks
  result = result.replace(/✅/g, '<span class="text-emerald-500">✅</span>');
  result = result.replace(/❌/g, '<span class="text-red-500">❌</span>');

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
