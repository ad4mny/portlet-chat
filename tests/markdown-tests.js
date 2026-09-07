"use strict";
const failures = [];
let passed = 0;
function check(name, source, verify) {
  const node = document.createElement("div");
  node.append(renderMarkdown(source));
  try {
    if (!verify(node)) throw new Error(name);
    passed++;
  } catch { failures.push(name); }
}
check("Headings", "# One\n## Two\n### Three", (node) => node.querySelectorAll("h1,h2,h3").length === 3);
check("Emphasis", "**bold** and *italic* and ***both***", (node) => node.querySelectorAll("strong").length === 2 && node.querySelectorAll("em").length === 2);
check("Lists", "- one\n- **two**\n\n3. third\n4. fourth", (node) => node.querySelectorAll("li").length === 4 && node.querySelector("ol").start === 3 && node.querySelector("li strong"));
check("Quotes", "> first\n> **second**", (node) => node.querySelector("blockquote strong")?.textContent === "second");
check("Paragraphs and line breaks", "one\ntwo\n\nthree", (node) => node.querySelectorAll("p").length === 2 && node.querySelector("p").textContent === "one\ntwo");
check("Inline code", "`**literal** <script>`", (node) => node.querySelector("code").textContent === "**literal** <script>" && !node.querySelector("strong,script"));
check("Fenced code", "```js\n<script>bad()</script>\n**literal**\n```", (node) => node.querySelector("pre code").textContent.includes("<script>") && !node.querySelector("script,strong"));
check("Open fence while streaming", "~~~\nconst x = 1;", (node) => node.querySelector("pre code").textContent === "const x = 1;");
check("Longer fences", "````\n```\ntext\n````", (node) => node.querySelector("pre code").textContent === "```\ntext");
check("Safe links", "[site](https://example.com) [mail](mailto:hello@example.com)", (node) => node.querySelectorAll("a").length === 2 && node.querySelector("a").rel === "noopener noreferrer");
check("Unsafe links and images", "[bad](javascript:alert%281%29) [bad](data:text/html,test) ![image](https://example.com/x.png)", (node) => !node.querySelector("a,img"));
check("Raw HTML", '<img src=x onerror="alert(1)"><script>alert(1)</script>', (node) => !node.querySelector("img,script") && node.textContent.includes("<img"));
check("Escapes", "\\*literal\\*", (node) => node.textContent === "*literal*" && !node.querySelector("em"));
check("Identifiers", "some_variable_name", (node) => node.textContent === "some_variable_name" && !node.querySelector("em"));
check("Unclosed markup", "**unfinished [link](https://", (node) => node.textContent === "**unfinished [link](https://");
const sample = '## Why PQC is Needed\n\n**Post-Quantum Cryptography** aims to resist quantum attacks.\n\n### Key approaches\n\n1. **Lattice-based cryptography** — lattice problems\n2. **Hash-based cryptography** — hash functions\n\n- **Security**: resist quantum attacks\n- *Efficiency*: practical implementations\n\n> A short quotation with **emphasis**.\n\nUse `fetch()` to contact your endpoint.\n\n```js\nconst model = "local-model";\nconsole.log(model);\n```\n\n[Example link](https://example.com)\n\n<script>Raw HTML stays text.</script>';
for (let length = 0; length <= sample.length; length++) {
  try { renderMarkdown(sample.slice(0, length)); } catch { failures.push(`Streaming prefix ${length}`); break; }
}
document.getElementById("sample").append(renderMarkdown(sample));
document.getElementById("result").textContent = failures.length ? `FAILED: ${failures.join(", ")}` : `Passed ${passed} checks and all ${sample.length + 1} streaming prefixes.`;
