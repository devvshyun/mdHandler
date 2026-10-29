// Markdown → HTML. Every block carries data-line (0-based source line) so the editor and preview can scroll together.
import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import katexPlugin from '@vscode/markdown-it-katex';
import hljs from 'highlight.js/lib/common';

export interface Heading {
  level: number;
  text: string;
  id: string;
  /** 0-based source line. */
  line: number;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  /** YAML front matter, shown as a small table above the body. */
  frontMatter?: Array<[string, string]>;
  hasMermaid: boolean;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GitHub-style slug that keeps Hangul and other letters. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

/** CommonJS plugins can arrive as `{ default: fn }` depending on the bundler's interop. */
const plugin = <T>(p: T): T => ((p as { default?: T }).default ?? p);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    if (lang === 'mermaid') return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code class="language-${escapeHtml(lang)}">${hljs.highlight(code, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch {
        /* fall through to plain */
      }
    }
    return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
  },
})
  .use(plugin(footnote))
  .use(plugin(taskLists), { enabled: true, label: true })
  .use(plugin(katexPlugin), { throwOnError: false });

// Line mapping and heading ids.
md.core.ruler.push('source_lines', (state) => {
  const used = new Map<string, number>();
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.map && t.nesting >= 0 && t.block) t.attrSet('data-line', String(t.map[0]));
    if (t.type === 'heading_open') {
      const inline = tokens[i + 1];
      const text = inline?.children?.filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('') ?? '';
      const base = slugify(text) || 'section';
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      t.attrSet('id', n ? `${base}-${n}` : base);
    }
  }
});

// Fences render through `highlight`, which drops token attributes; wrap them so they keep data-line.
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const line = tokens[idx].attrGet('data-line');
  const html = defaultFence(tokens, idx, options, env, self);
  return line === null ? html : `<div class="code-block" data-line="${line}">${html}</div>`;
};

// External links open in a new tab; in-page anchors stay put.
const defaultLinkOpen = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = String(tokens[idx].attrGet('href') ?? '');
  if (!href.startsWith('#')) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/;

function parseFrontMatter(src: string): { body: string; entries?: Array<[string, string]> } {
  const m = FRONT_MATTER.exec(src);
  if (!m) return { body: src };
  const entries: Array<[string, string]> = [];
  for (const raw of m[1].split(/\r?\n/)) {
    const kv = /^([\w.-]+)\s*:\s*(.*)$/.exec(raw);
    if (kv) entries.push([kv[1], kv[2].replace(/^["']|["']$/g, '')]);
    else if (entries.length && raw.trim()) entries[entries.length - 1][1] += ` ${raw.trim()}`;
  }
  // Blank lines keep later line numbers aligned with the editor.
  return { body: '\n'.repeat(m[0].split('\n').length - 1) + src.slice(m[0].length), entries };
}

export function renderMarkdown(src: string): Rendered {
  const { body, entries } = parseFrontMatter(src);
  const env = {};
  const tokens = md.parse(body, env);
  const headings: Heading[] = [];
  let hasMermaid = false;
  tokens.forEach((t, i) => {
    if (t.type === 'heading_open') {
      const inline = tokens[i + 1];
      headings.push({
        level: Number(t.tag.slice(1)),
        text: inline?.children?.map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : '')).join('') ?? '',
        id: String(t.attrGet('id') ?? ''),
        line: t.map?.[0] ?? 0,
      });
    } else if (t.type === 'fence' && t.info.trim() === 'mermaid') hasMermaid = true;
  });
  return { html: md.renderer.render(tokens, md.options, env), headings, frontMatter: entries, hasMermaid };
}

export interface Stats {
  lines: number;
  chars: number;
  words: number;
  /** Minutes at ~500 Hangul characters or ~200 English words per minute. */
  readingMinutes: number;
}

export function stats(src: string): Stats {
  const text = src.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\[\]()!|-]/g, ' ');
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  const words = (text.match(/[^\s]+/g) ?? []).length;
  const latinWords = (text.replace(/[가-힣]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return {
    lines: src ? src.split('\n').length : 0,
    chars: src.replace(/\s/g, '').length,
    words,
    readingMinutes: Math.max(src.trim() ? 1 : 0, Math.round(hangul / 500 + latinWords / 200)),
  };
}
