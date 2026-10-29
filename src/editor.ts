// CodeMirror 6 setup plus Markdown formatting commands.
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.3em' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.15em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.heading, color: 'var(--md-heading)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--md-link)' },
  { tag: t.monospace, color: 'var(--md-code)', fontFamily: 'var(--mono)' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.contentSeparator, t.list], color: 'var(--md-mark)' },
  { tag: t.meta, color: 'var(--muted)' },
  { tag: t.comment, color: 'var(--muted)' },
  { tag: [t.keyword, t.operatorKeyword], color: 'var(--md-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--md-string)' },
  { tag: [t.number, t.bool, t.atom], color: 'var(--md-number)' },
  { tag: [t.function(t.variableName), t.typeName, t.className], color: 'var(--md-func)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: 'var(--editor-font, 14px)', lineHeight: '1.6' },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--search-current)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
});

/** Korean labels for CodeMirror's built-in panels (search/replace, go to line). */
const phrases = EditorState.phrases.of({
  Find: '찾기',
  Replace: '바꾸기',
  next: '다음',
  previous: '이전',
  all: '모두',
  'match case': '대/소문자',
  regexp: '정규식',
  'by word': '단어 단위',
  replace: '바꾸기',
  'replace all': '모두 바꾸기',
  close: '닫기',
  'current match': '현재 항목',
  'replaced match on line $': '$번째 줄에서 바꿈',
  'replaced $ matches': '$개 바꿈',
  'on line': '줄',
  'Go to line': '줄로 이동',
  go: '이동',
});

/**
 * True when the marker run just before `from` is this marker, not a longer one: italic (`*`) inside
 * `**bold**` sees a run of 2 and must add its own `*` instead of eating one of bold's.
 * A run of 3 (`***both***`) holds both bold and italic.
 */
function ownsRun(doc: string, from: number, marker: string): boolean {
  let run = 0;
  while (from - run - 1 >= 0 && doc[from - run - 1] === marker[0]) run++;
  return run === marker.length || run === 3;
}

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  onChange: (doc: string) => void;
  onScroll: () => void;
  onCursor: () => void;
  onPasteFiles: (files: File[], pos: number) => boolean;
  extraKeys: Array<{ key: string; run: () => boolean }>;
}

export class Editor {
  readonly view: EditorView;
  private wrapping = new Compartment();
  private gutter = new Compartment();
  private extensions: Extension[];

  constructor(opts: EditorOptions) {
    const extensions: Extension[] = (this.extensions = [
      this.gutter.of(lineNumbers()),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
      syntaxHighlighting(mdHighlight),
      this.wrapping.of(EditorView.lineWrapping),
      placeholder('# 제목\n\n여기에 마크다운을 입력하세요.'),
      theme,
      phrases,
      keymap.of([...opts.extraKeys, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) opts.onChange(u.state.doc.toString());
        if (u.selectionSet || u.docChanged) opts.onCursor();
      }),
      EditorView.domEventHandlers({
        scroll: () => opts.onScroll(),
        paste: (e, view) => {
          const files = [...(e.clipboardData?.files ?? [])];
          // Office apps put a picture of the selection next to its text; the text is what's wanted.
          if (!files.length || e.clipboardData?.getData('text/plain')) return false;
          if (opts.onPasteFiles(files, view.state.selection.main.head)) e.preventDefault();
          return true;
        },
        drop: (e, view) => {
          const files = [...(e.dataTransfer?.files ?? [])];
          if (!files.length) return false;
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
          if (opts.onPasteFiles(files, pos)) {
            e.preventDefault();
            e.stopPropagation();
          }
          return true;
        },
      }),
    ]);
    this.view = new EditorView({ parent: opts.parent, state: EditorState.create({ doc: opts.doc, extensions }) });
  }

  get value(): string {
    return this.view.state.doc.toString();
  }

  /** Replaces the whole document. `resetHistory` starts a fresh undo history (opening another file). */
  setValue(text: string, resetHistory = false): void {
    if (resetHistory) {
      // Keep the current wrap / line-number settings across the fresh state.
      const wrap = this.wrapping.get(this.view.state);
      const gutter = this.gutter.get(this.view.state);
      this.view.setState(EditorState.create({ doc: text, extensions: this.extensions }));
      this.view.dispatch({ effects: [this.wrapping.reconfigure(wrap ?? []), this.gutter.reconfigure(gutter ?? [])] });
      return;
    }
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  setWrap(on: boolean): void {
    this.view.dispatch({ effects: this.wrapping.reconfigure(on ? EditorView.lineWrapping : []) });
  }

  setLineNumbers(on: boolean): void {
    this.view.dispatch({ effects: this.gutter.reconfigure(on ? lineNumbers() : []) });
  }

  focus(): void {
    this.view.focus();
  }

  undo(): void {
    undo(this.view);
  }

  redo(): void {
    redo(this.view);
  }

  find(): void {
    openSearchPanel(this.view);
  }

  /** Distance from the scroller's top edge to the first line, at scrollTop 0 (the content padding). */
  private docOffset(): number {
    const v = this.view;
    return v.documentTop - v.scrollDOM.getBoundingClientRect().top + v.scrollDOM.scrollTop;
  }

  /** 0-based (fractional) line at the top edge of the editor. */
  topLine(): number {
    const v = this.view;
    const y = Math.max(0, v.scrollDOM.scrollTop - this.docOffset());
    const block = v.lineBlockAtHeight(y);
    const line = v.state.doc.lineAt(block.from).number - 1;
    const frac = block.height ? (y - block.top) / block.height : 0;
    return line + Math.min(0.999, Math.max(0, frac));
  }

  /** Scrolls so the given 0-based (possibly fractional) line is at the top. */
  scrollToLine(line: number): void {
    const v = this.view;
    const whole = Math.floor(line);
    const n = Math.min(v.state.doc.lines, Math.max(1, whole + 1));
    const block = v.lineBlockAt(v.state.doc.line(n).from);
    v.scrollDOM.scrollTop = block.top + block.height * (line - whole) + this.docOffset();
  }

  /** Moves the cursor to a 0-based line and brings it into view. */
  gotoLine(line: number): void {
    const v = this.view;
    const n = Math.min(v.state.doc.lines, Math.max(1, line + 1));
    const pos = v.state.doc.line(n).from;
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 }) });
    v.focus();
  }

  cursor(): { line: number; col: number; selected: number } {
    const s = this.view.state;
    const head = s.selection.main.head;
    const line = s.doc.lineAt(head);
    const selected = s.selection.ranges.reduce((n, r) => n + r.to - r.from, 0);
    return { line: line.number, col: head - line.from + 1, selected };
  }

  // ---- formatting --------------------------------------------------------

  /** Wraps each selection in `before`/`after`, or removes the wrapping if it is already there. */
  wrap(before: string, after = before, placeholderText = '텍스트'): void {
    const v = this.view;
    const s = v.state;
    v.dispatch(
      s.changeByRange((range) => {
        const text = s.sliceDoc(range.from, range.to);
        const outer = s.sliceDoc(range.from - before.length, range.to + after.length);
        if (outer.startsWith(before) && outer.endsWith(after) && range.from >= before.length && ownsRun(s.doc.toString(), range.from, before)) {
          return {
            changes: [
              { from: range.from - before.length, to: range.from, insert: '' },
              { from: range.to, to: range.to + after.length, insert: '' },
            ],
            range: EditorSelection.range(range.from - before.length, range.to - before.length),
          };
        }
        const lead = text.length - text.replace(new RegExp(`^\\${before[0]}+`), '').length;
        if (text.length > before.length + after.length && text.startsWith(before) && text.endsWith(after) && (lead === before.length || lead === 3)) {
          const inner = text.slice(before.length, text.length - after.length);
          return { changes: { from: range.from, to: range.to, insert: inner }, range: EditorSelection.range(range.from, range.from + inner.length) };
        }
        const body = text || placeholderText;
        return {
          changes: { from: range.from, to: range.to, insert: before + body + after },
          range: EditorSelection.range(range.from + before.length, range.from + before.length + body.length),
        };
      }),
    );
    v.focus();
  }

  /** Applies `fn` to every line touched by the selection. */
  private mapLines(fn: (text: string, index: number, all: string[]) => string): void {
    const v = this.view;
    const s = v.state;
    const range = s.selection.main;
    const first = s.doc.lineAt(range.from);
    const last = s.doc.lineAt(range.to);
    const lines: string[] = [];
    for (let n = first.number; n <= last.number; n++) lines.push(s.doc.line(n).text);
    const out = lines.map((text, i) => fn(text, i, lines)).join('\n');
    v.dispatch({
      changes: { from: first.from, to: last.to, insert: out },
      selection: EditorSelection.range(first.from, first.from + out.length),
    });
    v.focus();
  }

  /** Toggles a line prefix such as "> " or "- ". */
  togglePrefix(prefix: string | ((i: number) => string), pattern: RegExp): void {
    let item = 0;
    this.mapLines((text, _i, all) => {
      const allHave = all.every((l) => pattern.test(l) || !l.trim());
      if (allHave) return text.replace(pattern, '');
      if (!text.trim()) return text;
      const p = typeof prefix === 'string' ? prefix : prefix(item++);
      const bare = text.replace(/^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, '$1');
      return text.trim() ? bare.replace(/^(\s*)/, `$1${p}`) : text;
    });
  }

  /** Cycles the current line(s) through H1 → H2 → H3 → plain, or sets an explicit level. */
  heading(level?: number): void {
    this.mapLines((text) => {
      const m = /^(#{1,6})\s+/.exec(text);
      const currentLevel = m ? m[1].length : 0;
      const bare = m ? text.slice(m[0].length) : text;
      const next = level ?? (currentLevel >= 3 ? 0 : currentLevel + 1);
      if (level !== undefined && currentLevel === level) return bare;
      return next ? `${'#'.repeat(next)} ${bare}` : bare;
    });
  }

  /** Inserts text at the cursor (replacing the selection); `select` marks part of it for typing over. */
  insert(text: string, select?: [number, number], at?: number): void {
    const v = this.view;
    const range = v.state.selection.main;
    const from = at ?? range.from;
    const to = at ?? range.to;
    v.dispatch({
      changes: { from, to, insert: text },
      selection: select ? EditorSelection.range(from + select[0], from + select[1]) : EditorSelection.cursor(from + text.length),
      scrollIntoView: true,
    });
    v.focus();
  }

  /** Inserts a block on its own lines (blank line before/after as needed). */
  insertBlock(text: string, select?: [number, number]): void {
    const s = this.view.state;
    const pos = s.selection.main.to;
    const line = s.doc.lineAt(pos);
    const at = line.text.trim() ? line.to : line.from;
    const before = at > 0 && line.text.trim() ? '\n\n' : at > 0 && s.doc.lineAt(Math.max(0, at - 1)).text.trim() ? '\n' : '';
    const after = at < s.doc.length ? '\n' : '\n';
    this.insert(before + text + after, select && [select[0] + before.length, select[1] + before.length], at);
  }

  selectedText(): string {
    const r = this.view.state.selection.main;
    return this.view.state.sliceDoc(r.from, r.to);
  }

  /** Replaces one 0-based source line (used when a preview checkbox is clicked). */
  replaceLine(index: number, fn: (text: string) => string): void {
    const s = this.view.state;
    if (index < 0 || index >= s.doc.lines) return;
    const line = s.doc.line(index + 1);
    const next = fn(line.text);
    if (next !== line.text) this.view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
  }

  /** Returns the 0-based line range of the table around the cursor, if any. */
  tableAtCursor(): { from: number; to: number; lines: string[] } | null {
    const s = this.view.state;
    const n = s.doc.lineAt(s.selection.main.head).number;
    const isRow = (k: number) => k >= 1 && k <= s.doc.lines && /^\s*\|.*\|\s*$/.test(s.doc.line(k).text);
    if (!isRow(n)) return null;
    let a = n;
    let b = n;
    while (isRow(a - 1)) a--;
    while (isRow(b + 1)) b++;
    const lines: string[] = [];
    for (let k = a; k <= b; k++) lines.push(s.doc.line(k).text);
    return { from: s.doc.line(a).from, to: s.doc.line(b).to, lines };
  }

  replaceRange(from: number, to: number, text: string): void {
    this.view.dispatch({ changes: { from, to, insert: text } });
    this.view.focus();
  }
}
