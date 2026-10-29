// Open/save through the File System Access API when available (save writes back to the same file),
// falling back to <input type=file> and downloads elsewhere (Firefox, Safari, sandboxed iframes).
import { downloadText } from './ui';

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
};

const MD_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.txt'] } }];
export const MD_EXT = /\.(md|markdown|mdx|mdown|mkd|txt)$/i;

export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileHandle;
}

const w = window as PickerWindow;
const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';
/** Pickers exist but throw SecurityError inside cross-origin iframes; remember that and stop trying. */
let pickerBlocked = false;

export async function pickMarkdown(fallbackInput: HTMLInputElement): Promise<OpenedFile | null> {
  if (w.showOpenFilePicker && !pickerBlocked) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: MD_TYPES, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if (isAbort(e)) return null;
      pickerBlocked = true;
    }
  }
  const file = await new Promise<File | undefined>((resolve) => {
    fallbackInput.value = '';
    fallbackInput.onchange = () => resolve(fallbackInput.files?.[0]);
    fallbackInput.oncancel = () => resolve(undefined);
    fallbackInput.click();
  });
  return file ? { name: file.name, text: await file.text() } : null;
}

export async function readDropped(file: File): Promise<OpenedFile> {
  return { name: file.name, text: await file.text() };
}

/** Writes to `handle` if given; otherwise asks for a location (or downloads). Returns the handle/name used, or null if cancelled. */
export async function saveMarkdown(
  text: string,
  name: string,
  handle?: FileHandle,
  saveAs = false,
): Promise<{ name: string; handle?: FileHandle } | null> {
  if (handle && !saveAs) {
    const out = await handle.createWritable();
    await out.write(text);
    await out.close();
    return { name: handle.name, handle };
  }
  if (w.showSaveFilePicker && !pickerBlocked) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName: name, types: MD_TYPES });
      const out = await h.createWritable();
      await out.write(text);
      await out.close();
      return { name: h.name, handle: h };
    } catch (e) {
      if (isAbort(e)) return null;
      pickerBlocked = true;
    }
  }
  return (await downloadText(text, name, 'text/markdown')) ? { name } : null;
}

export type { FileHandle };
