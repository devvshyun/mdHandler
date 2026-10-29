import 'katex/dist/katex.min.css';
import './styles.css';
import './preview.css';
import { Editor } from './editor';
import { documentTitle, standaloneHtml } from './export';
import { MD_EXT, pickMarkdown, readDropped, saveMarkdown, type FileHandle } from './files';
import { Preview } from './preview';
import { stats, type Heading } from './render';
import { SAMPLE } from './sample';
import { emptyTable, formatTable } from './table';
import { $, ask, downloadText, form, formatBytes, readFileAsDataUrl, setStatus, store, toast } from './ui';

// ---------------------------------------------------------------------------
// State & settings
// ---------------------------------------------------------------------------

type View = 'editor' | 'split' | 'preview';
type Theme = 'auto' | 'light' | 'dark';

interface Settings {
  view: View;
  split: number;
  outline: boolean;
  sync: boolean;
  theme: Theme;
  wrap: boolean;
  lineNumbers: boolean;
  fontSize: number;
}

const SETTINGS_KEY = 'mdhandler:settings';
const DRAFT_KEY = 'mdhandler:draft';
/** Pasted images are embedded as data: URLs; beyond this the source gets unwieldy. */
const IMAGE_WARN_BYTES = 1024 * 1024;

const defaults: Settings = {
  view: 'split',
  split: 50,
  outline: window.innerWidth >= 1100,
  sync: true,
  theme: 'auto',
  wrap: true,
  lineNumbers: true,
  fontSize: 14,
};

function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(store.get(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...defaults };
  }
}

const settings = loadSettings();
const saveSettings = () => store.set(SETTINGS_KEY, JSON.stringify(settings));

const doc = {
  name: 'untitled.md',
  handle: undefined as FileHandle | undefined,
  /** Text at the last open/save; the document is dirty when the editor differs from it. */
  savedText: '',
};

interface Draft {
  text: string;
  name: string;
  savedText: string;
  time: number;
}

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(store.get(DRAFT_KEY) ?? 'null') as Draft | null;
    return d && typeof d.text === 'string' ? d : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Editor & preview
// ---------------------------------------------------------------------------

const draft = readDraft();
const initialText = draft?.text ?? SAMPLE;
if (draft) {
  doc.name = draft.name || doc.name;
  doc.savedText = draft.savedText ?? '';
} else {
  doc.name = '샘플.md';
  doc.savedText = SAMPLE;
}

const previewScroll = $('#preview-scroll');
const preview = new Preview({
  root: $('#preview'),
  scroller: previewScroll,
  isDark: () => document.documentElement.dataset.resolvedTheme === 'dark',
  onToggleTask: (line, checked) =>
    editor.replaceLine(line, (text) => text.replace(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/, `$1[${checked ? 'x' : ' '}]`)),
});

const editor: Editor = new Editor({
  parent: $('#editor'),
  doc: initialText,
  onChange: () => {
    scheduleRender();
    scheduleDraft();
    updateDirty();
  },
  onScroll: () => {
    syncFrom('editor');
    markOutline(editor.topLine() + 1);
  },
  onCursor: () => updateCursor(),
  onPasteFiles: (files, pos) => {
    void handleFiles(files, pos);
    return true;
  },
  extraKeys: [
    { key: 'Mod-b', run: () => (format('bold'), true) },
    { key: 'Mod-i', run: () => (format('italic'), true) },
    { key: 'Mod-Shift-x', run: () => (format('strike'), true) },
    { key: 'Mod-e', run: () => (format('code'), true) },
    { key: 'Mod-k', run: () => (format('link'), true) },
    { key: 'Mod-h', run: () => (format('heading'), true) },
    { key: 'Mod-Shift-.', run: () => (format('quote'), true) },
    { key: 'Mod-Shift-8', run: () => (format('ul'), true) },
    { key: 'Mod-Shift-7', run: () => (format('ol'), true) },
    { key: 'Mod-Shift-9', run: () => (format('task'), true) },
    { key: 'Mod-Alt-t', run: () => (format('format-table'), true) },
  ],
});

let renderTimer: number | undefined;
let rendering = Promise.resolve();
function scheduleRender(delay = 120): void {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    rendering = rendering.then(renderNow);
  }, delay);
}

async function renderNow(): Promise<void> {
  const text = editor.value;
  const t0 = performance.now();
  try {
    const out = await preview.render(text);
    renderOutline(out.headings);
    $('#render-time').textContent = `${Math.round(performance.now() - t0)}ms`;
  } catch (e) {
    console.error(e);
    toast(`미리보기 오류: ${(e as Error).message}`, 'error');
  }
  updateInfo(text);
  // Re-align after layout changed under the current scroll position.
  if (settings.sync && settings.view === 'split') syncFrom(lastScrolled, true);
}

// ---------------------------------------------------------------------------
// Scroll sync
// ---------------------------------------------------------------------------

let lastScrolled: 'editor' | 'preview' = 'editor';
/** The pane we just scrolled programmatically; its own scroll event must not bounce back. */
let suppress: { pane: 'editor' | 'preview'; until: number } | null = null;

function syncFrom(source: 'editor' | 'preview', force = false): void {
  if (!force && suppress && suppress.pane === source && performance.now() < suppress.until) return;
  lastScrolled = source;
  if (!settings.sync || settings.view !== 'split') return;
  const total = editor.view.state.doc.lines;
  if (source === 'editor') {
    const scroller = editor.view.scrollDOM;
    // Pin both panes to their ends so short trailing content does not leave them misaligned.
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const top = atEnd ? previewScroll.scrollHeight : scroller.scrollTop <= 0 ? 0 : preview.topForLine(editor.topLine(), total);
    if (Math.abs(previewScroll.scrollTop - top) < 1) return;
    suppress = { pane: 'preview', until: performance.now() + 100 };
    previewScroll.scrollTop = top;
  } else {
    const atEnd = previewScroll.scrollTop + previewScroll.clientHeight >= previewScroll.scrollHeight - 2;
    suppress = { pane: 'editor', until: performance.now() + 100 };
    if (atEnd) editor.view.scrollDOM.scrollTop = editor.view.scrollDOM.scrollHeight;
    else if (previewScroll.scrollTop <= 0) editor.view.scrollDOM.scrollTop = 0;
    else editor.scrollToLine(preview.lineForTop(previewScroll.scrollTop, total));
  }
}

previewScroll.addEventListener(
  'scroll',
  () => {
    syncFrom('preview');
    if (settings.view === 'preview') markOutline(preview.lineForTop(previewScroll.scrollTop + 24, editor.view.state.doc.lines));
  },
  { passive: true },
);

// ---------------------------------------------------------------------------
// Outline, info, status
// ---------------------------------------------------------------------------

let headings: Heading[] = [];

function renderOutline(list: Heading[]): void {
  headings = list;
  const nav = $('#outline');
  nav.replaceChildren();
  $('#outline-count').textContent = list.length ? `${list.length}개` : '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted empty';
    p.textContent = '제목(#)을 쓰면 목차가 생깁니다.';
    nav.append(p);
    return;
  }
  const min = Math.min(...list.map((h) => h.level));
  for (const h of list) {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.text || '(빈 제목)';
    a.className = `lvl-${h.level - min + 1}`;
    a.dataset.line = String(h.line);
    a.title = `${h.line + 1}번째 줄`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      jumpToHeading(h);
    });
    nav.append(a);
  }
  updateCursor();
}

function jumpToHeading(h: Heading): void {
  if (settings.view !== 'preview') editor.gotoLine(h.line);
  const target = $('#preview').querySelector(`[id="${CSS.escape(h.id)}"]`);
  if (target && settings.view !== 'editor') {
    suppress = { pane: 'preview', until: performance.now() + 600 };
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function updateCursor(): void {
  const c = editor.cursor();
  $('#cursor-pos').textContent = `${c.line}줄 ${c.col}칸${c.selected ? ` · ${c.selected}자 선택` : ''}`;
  markOutline(c.line);
}

/** Highlights the last heading at or above 1-based `line` (cursor or top of the visible area). */
function markOutline(line: number): void {
  let current = -1;
  headings.forEach((h, i) => {
    if (h.line < line) current = i;
  });
  document.querySelectorAll('#outline a').forEach((a, i) => a.classList.toggle('current', i === current));
}

function updateInfo(text: string): void {
  const s = stats(text);
  $('#stats').textContent = `${s.chars.toLocaleString()}자 · ${s.words.toLocaleString()}단어`;
  const bytes = new TextEncoder().encode(text).byteLength;
  const rows: Array<[string, string]> = [
    ['파일', doc.name],
    ['줄', s.lines.toLocaleString()],
    ['글자(공백 제외)', s.chars.toLocaleString()],
    ['단어', s.words.toLocaleString()],
    ['읽는 시간', s.readingMinutes ? `약 ${s.readingMinutes}분` : '-'],
    ['크기', formatBytes(bytes)],
    ['제목', `${headings.length}개`],
  ];
  const dl = $('#doc-info');
  dl.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dd.title = v;
    dl.append(dt, dd);
  }
}

const isDirty = () => editor.value !== doc.savedText;

function updateDirty(): void {
  const dirty = isDirty();
  $('#dirty').hidden = !dirty;
  $('#file-name').textContent = doc.name;
  document.title = `${dirty ? '• ' : ''}${doc.name} - mdHandler`;
}

// ---------------------------------------------------------------------------
// Draft autosave (browser-local; survives reloads)
// ---------------------------------------------------------------------------

let draftTimer: number | undefined;
function scheduleDraft(): void {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(writeDraft, 600);
}

function writeDraft(): void {
  const d: Draft = { text: editor.value, name: doc.name, savedText: doc.savedText, time: Date.now() };
  const ok = store.set(DRAFT_KEY, JSON.stringify(d));
  $('#autosave').textContent = ok
    ? `브라우저에 임시 저장 ${new Date(d.time).toLocaleTimeString('ko-KR', { timeStyle: 'short' })}`
    : '임시 저장 불가(저장소 꽉 참 또는 차단)';
}

window.addEventListener('beforeunload', (e) => {
  writeDraft();
  if (isDirty() && doc.handle) e.preventDefault();
});

// ---------------------------------------------------------------------------
// File actions
// ---------------------------------------------------------------------------

async function confirmDiscard(): Promise<boolean> {
  return !isDirty() || ask('저장하지 않은 변경', `${doc.name}에 저장하지 않은 변경 사항이 있습니다. 버리고 계속할까요?`);
}

function loadDocument(text: string, name: string, handle?: FileHandle): void {
  // Normalise Windows line endings so line numbers match the preview map.
  const normalised = text.replace(/\r\n?/g, '\n');
  doc.name = name;
  doc.handle = handle;
  doc.savedText = normalised;
  editor.setValue(normalised, true);
  editor.view.scrollDOM.scrollTop = 0;
  previewScroll.scrollTop = 0;
  updateDirty();
  scheduleRender(0);
  writeDraft();
  setStatus(`${name} 열림`);
}

async function openFile(): Promise<void> {
  if (!(await confirmDiscard())) return;
  const f = await pickMarkdown($<HTMLInputElement>('#file-open'));
  if (f) loadDocument(f.text, f.name, f.handle);
}

async function save(saveAs = false): Promise<void> {
  const text = editor.value;
  try {
    const name = /\.[^.]+$/.test(doc.name) ? doc.name : `${doc.name}.md`;
    const out = await saveMarkdown(text, name, doc.handle, saveAs);
    if (!out) return;
    doc.name = out.name;
    doc.handle = out.handle;
    doc.savedText = text;
    updateDirty();
    writeDraft();
    const msg = out.handle ? `${out.name}에 저장했습니다.` : `${out.name}을(를) 내려받았습니다.`;
    toast(msg);
    setStatus(msg);
  } catch (e) {
    toast(`저장 실패: ${(e as Error).message}`, 'error');
  }
}

async function newDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  loadDocument('', 'untitled.md');
  editor.focus();
}

async function exportHtml(): Promise<void> {
  await rendering;
  const title = documentTitle(editor.value, doc.name);
  const html = standaloneHtml(preview.html(), title);
  const name = doc.name.replace(/\.[^.]+$/, '') + '.html';
  if (await downloadText(html, name, 'text/html')) toast(`${name}을(를) 내려받았습니다.`);
}

async function copyHtml(): Promise<void> {
  await rendering;
  const html = preview.html();
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([$('#preview').innerText], { type: 'text/plain' }),
        }),
      ]);
    } else await navigator.clipboard.writeText(html);
    toast('렌더링된 내용을 복사했습니다. 메일·문서 편집기에 서식째 붙여 넣을 수 있습니다.');
  } catch {
    toast('클립보드에 접근할 수 없습니다(브라우저 권한 확인).', 'error');
  }
}

async function printDocument(): Promise<void> {
  await rendering;
  const prev = document.title;
  document.title = documentTitle(editor.value, doc.name);
  window.print();
  document.title = prev;
}

/** Pasted/dropped files: Markdown opens, images go in at `pos` as data: URLs. */
async function handleFiles(files: File[], pos?: number): Promise<void> {
  const mdFile = files.find((f) => MD_EXT.test(f.name) || f.type === 'text/markdown');
  if (mdFile) {
    if (!(await confirmDiscard())) return;
    const f = await readDropped(mdFile);
    loadDocument(f.text, f.name);
    return;
  }
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) {
    toast('Markdown(.md) 또는 이미지 파일만 넣을 수 있습니다.', 'error');
    return;
  }
  const parts: string[] = [];
  for (const img of images) {
    const url = await readFileAsDataUrl(img);
    const alt = img.name.replace(/\.[^.]+$/, '') || 'image';
    parts.push(`![${alt.replace(/[[\]]/g, '')}](${url})`);
    if (img.size > IMAGE_WARN_BYTES) toast(`${img.name}(${formatBytes(img.size)})이 문서 안에 들어갔습니다. 큰 이미지는 파일이 무거워집니다.`);
  }
  editor.insert(parts.join('\n\n'), undefined, pos);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

async function format(kind: string): Promise<void> {
  switch (kind) {
    case 'bold':
      return editor.wrap('**');
    case 'italic':
      return editor.wrap('*');
    case 'strike':
      return editor.wrap('~~');
    case 'code':
      return editor.wrap('`', '`', 'code');
    case 'heading':
      return editor.heading();
    case 'quote':
      return editor.togglePrefix('> ', /^\s*>\s?/);
    case 'ul':
      return editor.togglePrefix('- ', /^\s*[-*+]\s+(?!\[[ xX]\])/);
    case 'ol':
      return editor.togglePrefix((i) => `${i + 1}. `, /^\s*\d+[.)]\s+/);
    case 'task':
      return editor.togglePrefix('- [ ] ', /^\s*[-*+]\s+\[[ xX]\]\s+/);
    case 'hr':
      return editor.insertBlock('---');
    case 'codeblock': {
      const sel = editor.selectedText();
      const body = sel || '코드';
      return editor.insertBlock('```\n' + body + '\n```', sel ? undefined : [4, 4 + body.length]);
    }
    case 'math':
      return editor.insertBlock('$$\n' + (editor.selectedText() || 'E = mc^2') + '\n$$');
    case 'mermaid':
      return editor.insertBlock('```mermaid\nflowchart LR\n  A[시작] --> B{조건}\n  B -->|예| C[처리]\n  B -->|아니오| D[끝]\n```');
    case 'link': {
      const sel = editor.selectedText();
      const isUrl = /^https?:\/\/\S+$/.test(sel);
      const v = await form('링크', [
        { name: 'text', label: '표시할 글', type: 'text', value: isUrl ? '' : sel, placeholder: '링크 글' },
        { name: 'url', label: '주소', type: 'text', value: isUrl ? sel : '', placeholder: 'https://', required: true },
      ]);
      if (!v) return editor.focus();
      const text = v.text || v.url;
      return editor.insert(`[${text}](${v.url})`);
    }
    case 'image': {
      const v = await form(
        '이미지',
        [
          { name: 'alt', label: '대체 텍스트', type: 'text', value: editor.selectedText(), placeholder: '이미지 설명' },
          { name: 'url', label: '주소 (비우면 파일 선택)', type: 'text', placeholder: 'https://' },
        ],
        '편집기에 이미지를 붙여 넣거나 끌어다 놓아도 됩니다(문서 안에 data URL로 들어갑니다).',
      );
      if (!v) return editor.focus();
      if (v.url) return editor.insert(`![${v.alt}](${v.url})`);
      const input = $<HTMLInputElement>('#file-image');
      input.value = '';
      input.onchange = () => {
        if (input.files?.length) void handleFiles([...input.files]);
      };
      input.click();
      return;
    }
    case 'table': {
      const v = await form('표 삽입', [
        { name: 'cols', label: '열', type: 'number', value: 3, min: 1, max: 20, required: true },
        { name: 'rows', label: '행(제목 제외)', type: 'number', value: 2, min: 1, max: 100, required: true },
      ]);
      if (!v) return editor.focus();
      return editor.insertBlock(emptyTable(Number(v.cols) || 3, Number(v.rows) || 2));
    }
    case 'format-table': {
      const t = editor.tableAtCursor();
      if (!t) return toast('커서를 표 안에 두고 누르세요.');
      editor.replaceRange(t.from, t.to, formatTable(t.lines).join('\n'));
      return toast('표 열을 맞췄습니다.');
    }
  }
}

// ---------------------------------------------------------------------------
// View, theme, settings
// ---------------------------------------------------------------------------

const layout = $('#layout');

function applyView(): void {
  layout.dataset.view = settings.view;
  layout.style.setProperty('--split', `${settings.split}%`);
  $('#outline-panel').hidden = !settings.outline;
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => {
    const on = b.dataset.view === settings.view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const outlineBtn = document.querySelector<HTMLButtonElement>('[data-action="toggle-outline"]')!;
  outlineBtn.classList.toggle('active', settings.outline);
  outlineBtn.setAttribute('aria-pressed', String(settings.outline));
  const syncBtn = document.querySelector<HTMLButtonElement>('[data-action="toggle-sync"]')!;
  syncBtn.classList.toggle('active', settings.sync);
  syncBtn.setAttribute('aria-pressed', String(settings.sync));
  syncBtn.disabled = settings.view !== 'split';
  requestAnimationFrame(() => {
    editor.view.requestMeasure();
    preview.measure();
  });
}

function setView(view: View): void {
  // Keep the reader's place when switching between panes.
  const line = settings.view === 'preview' ? preview.lineForTop(previewScroll.scrollTop, editor.view.state.doc.lines) : editor.topLine();
  settings.view = view;
  saveSettings();
  applyView();
  requestAnimationFrame(() => {
    preview.measure();
    if (view !== 'preview') editor.scrollToLine(line);
    if (view !== 'editor') {
      suppress = { pane: 'preview', until: performance.now() + 100 };
      previewScroll.scrollTop = preview.topForLine(line, editor.view.state.doc.lines);
    }
  });
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  const resolved = settings.theme === 'auto' ? (media.matches ? 'dark' : 'light') : settings.theme;
  const changed = root.dataset.resolvedTheme !== resolved;
  root.dataset.resolvedTheme = resolved;
  const label = { auto: '자동', light: '밝게', dark: '어둡게' }[settings.theme];
  document.querySelector('[data-action="theme"]')!.textContent = `테마: ${label}`;
  // Mermaid bakes colours into its SVG, so diagrams need a re-render.
  if (changed && preview.last?.hasMermaid) scheduleRender(0);
}

media.addEventListener('change', applyTheme);

function applyEditorSettings(): void {
  editor.setWrap(settings.wrap);
  editor.setLineNumbers(settings.lineNumbers);
  document.documentElement.style.setProperty('--editor-font', `${settings.fontSize}px`);
  editor.view.requestMeasure();
}

async function openSettings(): Promise<void> {
  const v = await form('편집기 설정', [
    { name: 'fontSize', label: '글자 크기(px)', type: 'number', value: settings.fontSize, min: 10, max: 28, required: true },
    { name: 'wrap', label: '긴 줄 자동 줄바꿈', type: 'checkbox', value: settings.wrap },
    { name: 'lineNumbers', label: '줄 번호 표시', type: 'checkbox', value: settings.lineNumbers },
  ]);
  if (!v) return;
  settings.fontSize = Math.min(28, Math.max(10, Number(v.fontSize) || 14));
  settings.wrap = !!v.wrap;
  settings.lineNumbers = !!v.lineNumbers;
  saveSettings();
  applyEditorSettings();
}

// Splitter: drag or arrow keys.
const splitter = $('#splitter');
splitter.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  layout.classList.add('resizing');
  const panes = [$('#editor-pane'), $('#preview-pane')];
  const left = panes[0].getBoundingClientRect().left;
  const width = panes[1].getBoundingClientRect().right - left;
  const move = (ev: PointerEvent) => {
    settings.split = Math.min(85, Math.max(15, ((ev.clientX - left) / width) * 100));
    layout.style.setProperty('--split', `${settings.split}%`);
  };
  const up = () => {
    splitter.removeEventListener('pointermove', move);
    layout.classList.remove('resizing');
    saveSettings();
    preview.measure();
  };
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', up, { once: true });
  splitter.addEventListener('pointercancel', up, { once: true });
});
splitter.addEventListener('dblclick', () => {
  settings.split = 50;
  saveSettings();
  applyView();
});
splitter.addEventListener('keydown', (e) => {
  const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
  if (!step) return;
  e.preventDefault();
  settings.split = Math.min(85, Math.max(15, settings.split + step));
  saveSettings();
  applyView();
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const actions: Record<string, () => unknown> = {
  new: newDocument,
  open: openFile,
  save: () => save(false),
  'save-as': () => save(true),
  'export-html': exportHtml,
  'copy-html': copyHtml,
  print: printDocument,
  undo: () => editor.undo(),
  redo: () => editor.redo(),
  find: () => {
    if (settings.view === 'preview') setView('split');
    editor.find();
  },
  'toggle-outline': () => {
    settings.outline = !settings.outline;
    saveSettings();
    applyView();
  },
  'toggle-sync': () => {
    settings.sync = !settings.sync;
    saveSettings();
    applyView();
    if (settings.sync) syncFrom('editor', true);
  },
  settings: openSettings,
  theme: () => {
    settings.theme = settings.theme === 'auto' ? 'light' : settings.theme === 'light' ? 'dark' : 'auto';
    saveSettings();
    applyTheme();
  },
};

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-view], [data-format]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  if (el.dataset.action) void actions[el.dataset.action]?.();
  else if (el.dataset.view) setView(el.dataset.view as View);
  else if (el.dataset.format) {
    if (settings.view === 'preview') setView('split');
    void format(el.dataset.format);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('dialog')) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && !e.altKey && key === 's') {
    e.preventDefault();
    void save(e.shiftKey);
  } else if (mod && !e.altKey && key === 'o') {
    e.preventDefault();
    void openFile();
  } else if (mod && !e.altKey && key === 'p') {
    e.preventDefault();
    void printDocument();
  } else if (e.altKey && !mod && key === 'n') {
    e.preventDefault();
    void newDocument();
  } else if (mod && e.altKey && ['1', '2', '3'].includes(e.key)) {
    e.preventDefault();
    setView((['editor', 'split', 'preview'] as const)[Number(e.key) - 1]);
  } else if (mod && e.altKey && key === 'o') {
    e.preventDefault();
    actions['toggle-outline']();
  }
});

// Whole-window drag & drop (the editor handles drops onto itself for cursor placement).
let dragDepth = 0;
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  $('#dropzone').hidden = false;
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $('#dropzone').hidden = true;
  }
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('drop', (e) => {
  dragDepth = 0;
  $('#dropzone').hidden = true;
  if (!hasFiles(e)) return;
  e.preventDefault();
  void handleFiles([...(e.dataTransfer?.files ?? [])]);
});
// The editor swallows its own drop events; hide the overlay then too.
$('#editor').addEventListener(
  'drop',
  () => {
    dragDepth = 0;
    $('#dropzone').hidden = true;
  },
  true,
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

applyTheme();
applyView();
applyEditorSettings();
updateDirty();
scheduleRender(0);
if (draft) {
  const when = new Date(draft.time).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
  setStatus(`이전 작업 복원 (${when})`);
}
