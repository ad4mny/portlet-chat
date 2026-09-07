"use strict";

// Deliberately a small Markdown subset. All source text enters the DOM as text.
function renderMarkdown(source) {
  const fragment = document.createDocumentFragment();
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const listItem = (line) => line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
  const fenceStart = (line) => line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  const heading = (line) => line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
  const quote = (line) => /^ {0,3}> ?/.test(line);
  const beginsBlock = (line) => !line.trim() || fenceStart(line) || heading(line) || listItem(line) || quote(line);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = fenceStart(line);
    if (fence) {
      const codeLines = [];
      const closingFence = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      index++;
      while (index < lines.length && !closingFence.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index++;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code);
      fragment.append(pre);
      continue;
    }
    const title = heading(line);
    if (title) {
      const node = document.createElement(`h${title[1].length}`);
      appendMarkdownInline(node, title[2]);
      fragment.append(node);
      index++;
      continue;
    }
    if (quote(line)) {
      const quoteLines = [];
      while (index < lines.length && quote(lines[index])) quoteLines.push(lines[index++].replace(/^ {0,3}> ?/, ""));
      const node = document.createElement("blockquote");
      appendMarkdownInline(node, quoteLines.join("\n"));
      fragment.append(node);
      continue;
    }
    const item = listItem(line);
    if (item) {
      const ordered = /^\d/.test(item[1]);
      const list = document.createElement(ordered ? "ol" : "ul");
      if (ordered) list.start = Number.parseInt(item[1], 10);
      while (index < lines.length) {
        const next = listItem(lines[index]);
        if (!next || /^\d/.test(next[1]) !== ordered) break;
        const node = document.createElement("li");
        appendMarkdownInline(node, next[2]);
        list.append(node);
        index++;
      }
      fragment.append(list);
      continue;
    }
    const paragraph = [lines[index++]];
    while (index < lines.length && !beginsBlock(lines[index])) paragraph.push(lines[index++]);
    const node = document.createElement("p");
    appendMarkdownInline(node, paragraph.join("\n"));
    fragment.append(node);
  }
  return fragment;
}

function appendMarkdownInline(parent, source, depth = 0) {
  // Bound nesting so malformed model output cannot exhaust the call stack.
  if (depth >= 16) { parent.append(document.createTextNode(source)); return; }
  const tokens = /\\([\\`*_[\]{}()#+.!>~-])|`([^`\n]+)`|(!?)\[([^\]\n]+)\]\(([^\s()]+)\)|(\*\*\*|___)(?=\S)(.+?\S|\S)\6|(\*\*|__)(?=\S)(.+?\S|\S)\8|(\*|_)(?=\S)(.+?\S|\S)\10/g;
  let offset = 0;
  for (const match of source.matchAll(tokens)) {
    parent.append(document.createTextNode(source.slice(offset, match.index)));
    offset = match.index + match[0].length;
    if (match[1]) { parent.append(document.createTextNode(match[1])); continue; }
    if (match[2]) {
      const code = document.createElement("code");
      code.textContent = match[2];
      parent.append(code);
      continue;
    }
    if (match[4]) {
      let url;
      try { url = new URL(match[5]); } catch { /* Unsupported links remain literal. */ }
      if (match[3] || !url || !["http:", "https:", "mailto:"].includes(url.protocol)) {
        parent.append(document.createTextNode(match[0]));
        continue;
      }
      const link = document.createElement("a");
      link.href = url.href;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.textContent = match[4];
      parent.append(link);
      continue;
    }
    const marker = match[6] || match[8] || match[10];
    const text = match[7] || match[9] || match[11];
    const before = source[match.index - 1] || "";
    const after = source[offset] || "";
    if (marker.includes("_") && (/\w/.test(before) || /\w/.test(after))) {
      parent.append(document.createTextNode(match[0]));
      continue;
    }
    const node = document.createElement(marker.length === 1 ? "em" : "strong");
    if (marker.length === 3) {
      const emphasis = document.createElement("em");
      appendMarkdownInline(emphasis, text, depth + 1);
      node.append(emphasis);
    } else appendMarkdownInline(node, text, depth + 1);
    parent.append(node);
  }
  parent.append(document.createTextNode(source.slice(offset)));
}
