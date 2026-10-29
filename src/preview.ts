// Sanitised preview pane, Mermaid diagrams, and the line ↔ scroll-position map used for sync.
import DOMPurify from 'dompurify';
import { renderMarkdown, type Rendered } from './render';

type Mermaid = typeof import('mermaid').default;
let mermaidLoader: Promise<Mermaid> | undefined;
let mermaidTheme = '';
let mermaidSeq = 0;

function loadMermaid(dark: boolean): Promise<Mermaid> {
  mermaidLoader ??= import('mermaid').then((m) => m.default);
  return mermaidLoader.then((mermaid) => {
    const theme = dark ? 'dark' : 'default';
    if (theme !== mermaidTheme) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
      mermaidTheme = theme;
    }
    return mermaid;
  });
}

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    // KaTeX emits MathML alongside its HTML; DOMPurify's defaults already keep both.
    FORBID_TAGS: ['style', 'form'],
  });
}

export interface PreviewOptions {
  root: HTMLElement;
  scroller: HTMLElement;
  isDark: () => boolean;
  onToggleTask: (line: number, checked: boolean) => void;
}

export class Preview {
  private anchors: Array<{ line: number; top: number }> = [];
  private renderSeq = 0;
  /** Mermaid output keyed by diagram source, so re-rendering an unchanged diagram is instant. */
  private diagramCache = new Map<string, string>();
  last?: Rendered;

  constructor(private opts: PreviewOptions) {
    opts.root.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      if (!box.matches('input.task-list-item-checkbox')) return;
      const li = box.closest<HTMLElement>('[data-line]');
      if (li) opts.onToggleTask(Number(li.dataset.line), box.checked);
    });
    opts.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a');
      const href = a?.getAttribute('href');
      if (!href?.startsWith('#')) return;
      e.preventDefault();
      const target = opts.root.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    new ResizeObserver(() => this.measure()).observe(opts.root);
  }

  async render(src: string): Promise<Rendered> {
    const seq = ++this.renderSeq;
    const out = renderMarkdown(src);
    this.last = out;
    const root = this.opts.root;
    let html = sanitize(out.html);
    if (out.frontMatter?.length) {
      const rows = out.frontMatter.map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('');
      html = `<table class="front-matter" data-line="0"><tbody>${rows}</tbody></table>${html}`;
    }
    root.innerHTML = html;
    // DOMPurify drops ids that match document properties ("title", "links", "images"...); heading ids
    // cannot clobber anything, so put them back.
    for (const h of out.headings) {
      const el = root.querySelector(`:is(h1, h2, h3, h4, h5, h6)[data-line="${h.line}"]`);
      if (el && !el.id) el.id = h.id;
    }
    root.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox').forEach((box) => box.removeAttribute('disabled'));
    if (out.hasMermaid) await this.renderDiagrams(seq);
    this.measure();
    return out;
  }

  private async renderDiagrams(seq: number): Promise<void> {
    const blocks = [...this.opts.root.querySelectorAll<HTMLElement>('pre.mermaid')];
    const dark = this.opts.isDark();
    const pending = blocks.filter((b) => !this.diagramCache.has(`${dark}:${b.textContent}`));
    const mermaid = pending.length ? await loadMermaid(dark) : undefined;
    for (const block of blocks) {
      if (seq !== this.renderSeq) return;
      const code = block.textContent ?? '';
      const key = `${dark}:${code}`;
      let svg = this.diagramCache.get(key);
      if (svg === undefined && mermaid) {
        try {
          svg = (await mermaid.render(`mermaid-${++mermaidSeq}`, code)).svg;
        } catch (e) {
          svg = `<div class="diagram-error">다이어그램 오류: ${escape((e as Error).message ?? String(e))}</div>`;
          // Mermaid leaves its error placeholder in <body>.
          document.querySelectorAll('body > [id^="dmermaid-"]').forEach((el) => el.remove());
        }
        if (this.diagramCache.size > 50) this.diagramCache.clear();
        this.diagramCache.set(key, svg);
      }
      if (seq !== this.renderSeq) return;
      const wrap = document.createElement('div');
      wrap.className = 'mermaid-diagram';
      wrap.innerHTML = svg ?? '';
      const host = block.closest<HTMLElement>('.code-block') ?? block;
      wrap.dataset.line = host.dataset.line ?? '';
      host.replaceWith(wrap);
    }
  }

  /** Recomputes where each source line sits in the preview. */
  measure(): void {
    const scroller = this.opts.scroller;
    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const anchors: Array<{ line: number; top: number }> = [{ line: 0, top: 0 }];
    for (const el of this.opts.root.querySelectorAll<HTMLElement>('[data-line]')) {
      const line = Number(el.dataset.line);
      if (Number.isNaN(line) || el.offsetParent === null) continue;
      const top = el.getBoundingClientRect().top - base;
      const prev = anchors[anchors.length - 1];
      // Keep the map monotonic: nested elements (list items in lists) can repeat or go backwards.
      if (line > prev.line && top >= prev.top) anchors.push({ line, top });
    }
    this.anchors = anchors;
  }

  /** Preview scroll offset for a fractional source line (linear interpolation between anchors). */
  topForLine(line: number, totalLines: number): number {
    const a = this.anchors;
    const end = { line: totalLines, top: this.opts.scroller.scrollHeight };
    for (let i = 0; i < a.length; i++) {
      const next = a[i + 1] ?? end;
      if (line < next.line || i === a.length - 1) {
        const span = next.line - a[i].line || 1;
        return a[i].top + ((next.top - a[i].top) * (line - a[i].line)) / span;
      }
    }
    return 0;
  }

  /** Fractional source line at a preview scroll offset. */
  lineForTop(top: number, totalLines: number): number {
    const a = this.anchors;
    const end = { line: totalLines, top: this.opts.scroller.scrollHeight };
    for (let i = 0; i < a.length; i++) {
      const next = a[i + 1] ?? end;
      if (top < next.top || i === a.length - 1) {
        const span = next.top - a[i].top || 1;
        return a[i].line + ((next.line - a[i].line) * (top - a[i].top)) / span;
      }
    }
    return 0;
  }

  /** Inner HTML of the rendered document (with diagrams), for export. */
  html(): string {
    return this.opts.root.innerHTML;
  }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
