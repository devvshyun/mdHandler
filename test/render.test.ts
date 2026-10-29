import { describe, expect, it } from 'vitest';
import { sanitize } from '../src/preview';
import { renderMarkdown, slugify, stats } from '../src/render';

describe('renderMarkdown', () => {
  it('tags blocks with their source line', () => {
    const { html } = renderMarkdown('# 제목\n\n문단\n\n- a\n- b\n\n```js\nx\n```\n');
    expect(html).toContain('<h1 data-line="0" id="제목">');
    expect(html).toContain('<p data-line="2">');
    expect(html).toContain('<li data-line="5">');
    expect(html).toMatch(/<div class="code-block" data-line="7">/);
  });

  it('collects headings with unique Hangul-friendly ids', () => {
    const { headings } = renderMarkdown('# 소개\n## 설치 방법\n## 설치 방법\n### `code` 이름');
    expect(headings.map((h) => [h.level, h.id, h.line])).toEqual([
      [1, '소개', 0],
      [2, '설치-방법', 1],
      [2, '설치-방법-1', 2],
      [3, 'code-이름', 3],
    ]);
  });

  it('keeps line numbers after front matter', () => {
    const out = renderMarkdown('---\ntitle: 문서\ntags: [a, b]\n---\n# 본문\n');
    expect(out.frontMatter).toEqual([
      ['title', '문서'],
      ['tags', '[a, b]'],
    ]);
    expect(out.headings[0].line).toBe(4);
  });

  it('renders GFM tables, task lists, footnotes, math and mermaid fences', () => {
    const out = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n각주[^1]\n\n[^1]: 설명\n\n$x^2$\n\n```mermaid\ngraph LR; A-->B\n```');
    expect(out.html).toContain('<table');
    expect(out.html).toContain('task-list-item-checkbox');
    expect(out.html).toContain('footnote');
    expect(out.html).toContain('katex');
    expect(out.html).toContain('<pre class="mermaid">');
    expect(out.hasMermaid).toBe(true);
  });

  it('opens external links in a new tab only', () => {
    const { html } = renderMarkdown('[a](https://x.dev) [b](#local)');
    expect(html).toContain('href="https://x.dev" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('<a href="#local">');
  });
});

describe('sanitize', () => {
  it('strips scripts and event handlers from raw HTML', () => {
    const { html } = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(2)</script>\n\n[x](javascript:alert(3))');
    const clean = sanitize(html);
    expect(clean).not.toMatch(/onerror|<script|href="javascript:/);
  });

  it('keeps task checkboxes, data-line and KaTeX markup', () => {
    const clean = sanitize(renderMarkdown('- [ ] todo\n\n$a$').html);
    expect(clean).toContain('task-list-item-checkbox');
    expect(clean).toContain('data-line="0"');
    expect(clean).toContain('class="katex"');
  });
});

describe('helpers', () => {
  it('slugify', () => {
    expect(slugify('  Hello, 세계! 2026 ')).toBe('hello-세계-2026');
  });

  it('stats', () => {
    const s = stats('# 제목\n\n안녕 세상 hello world');
    expect(s.lines).toBe(3);
    expect(s.words).toBe(5);
    expect(s.readingMinutes).toBe(1);
  });
});
