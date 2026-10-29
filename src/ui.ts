// Small DOM helpers: toast, status bar, modal forms, downloads.
export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element ${selector}`);
  return el;
};

let toastTimer: number | undefined;
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show ${kind === 'error' ? 'error' : ''}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), kind === 'error' ? 5000 : 2500);
}

export function setStatus(text: string): void {
  $('#status').textContent = text;
}

export type Field =
  | { name: string; label: string; type: 'text' | 'number' | 'url'; value?: string | number; placeholder?: string; min?: number; max?: number; required?: boolean }
  | { name: string; label: string; type: 'select'; value?: string; options: Array<[string, string]> }
  | { name: string; label: string; type: 'checkbox'; value?: boolean };

/** Shows a modal form and resolves with the field values, or null if cancelled. */
export function form(title: string, fields: Field[], hint?: string): Promise<Record<string, string> | null> {
  const dialog = $<HTMLDialogElement>('#dialog');
  const body = $('#dialog-body');
  $('#dialog-title').textContent = title;
  body.replaceChildren();
  if (hint) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = hint;
    body.append(p);
  }
  for (const f of fields) {
    const label = document.createElement('label');
    label.className = f.type === 'checkbox' ? 'field check' : 'field';
    const caption = document.createElement('span');
    caption.textContent = f.label;
    let input: HTMLInputElement | HTMLSelectElement;
    if (f.type === 'select') {
      input = document.createElement('select');
      for (const [value, text] of f.options) input.append(new Option(text, value));
      if (f.value !== undefined) input.value = f.value;
    } else {
      const i = document.createElement('input');
      i.type = f.type;
      if (f.type === 'checkbox') i.checked = !!f.value;
      else {
        if (f.placeholder) i.placeholder = f.placeholder;
        if (f.min !== undefined) i.min = String(f.min);
        if (f.max !== undefined) i.max = String(f.max);
        if (f.required) i.required = true;
        if (f.value !== undefined) i.value = String(f.value);
      }
      input = i;
    }
    input.name = f.name;
    if (f.type === 'checkbox') label.append(input, caption);
    else label.append(caption, input);
    body.append(label);
  }
  dialog.returnValue = '';
  dialog.showModal();
  (body.querySelector('input, select') as HTMLElement | null)?.focus();
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        if (dialog.returnValue !== 'ok') return resolve(null);
        const values: Record<string, string> = {};
        body.querySelectorAll<HTMLInputElement>('[name]').forEach((el) => {
          values[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
        });
        resolve(values);
      },
      { once: true },
    );
  });
}

/** Yes/no confirmation inside the page (native confirm() is unavailable in sandboxed hosts). */
export async function ask(title: string, message: string): Promise<boolean> {
  return (await form(title, [], message)) !== null;
}

interface DownloadsCapability {
  save(req: { filename: string; data: Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}
type ClaudeHost = { use(name: 'downloads'): Promise<DownloadsCapability | null> };

let downloadsCap: Promise<DownloadsCapability | null> | undefined;
function hostDownloads(): Promise<DownloadsCapability | null> {
  // Inside a claude.ai artifact, plain <a download> links are inert; the host offers a save prompt instead.
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  downloadsCap ??= host?.use ? host.use('downloads').catch(() => null) : Promise.resolve(null);
  return downloadsCap;
}

export async function downloadText(text: string, filename: string, type: string): Promise<boolean> {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const downloads = await hostDownloads();
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === 'declined') return false;
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('파일을 읽지 못했습니다.'));
    r.readAsDataURL(file);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** localStorage that never throws (private windows, sandboxed iframes). */
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
