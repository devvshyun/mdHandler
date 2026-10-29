// Markdown table helpers: build an empty table, and re-align an existing one.

/** Display width: Hangul, CJK and full-width forms count as two columns. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w +=
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1faff)
        ? 2
        : 1;
  }
  return w;
}

export function emptyTable(cols: number, rows: number): string {
  const header = Array.from({ length: cols }, (_, i) => `제목${i + 1}`);
  const lines = [header, header.map(() => '---'), ...Array.from({ length: rows }, () => header.map(() => ''))];
  return formatTable(lines.map((cells) => `| ${cells.join(' | ')} |`)).join('\n');
}

/** Splits a table row into cells, honouring escaped pipes and pipes inside `code`. */
export function splitRow(row: string): string[] {
  const s = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '\\|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const DELIM = /^:?-+:?$/;

/** Pads every column to the same width and normalises the delimiter row (keeps alignment colons). */
export function formatTable(lines: string[]): string[] {
  const rows = lines.map(splitRow);
  const delimIndex = rows.findIndex((r) => r.length && r.every((c) => DELIM.test(c)));
  const cols = Math.max(...rows.map((r) => r.length));
  const align = Array.from({ length: cols }, (_, i) => {
    const d = delimIndex >= 0 ? rows[delimIndex][i] ?? '' : '';
    return d.startsWith(':') && d.endsWith(':') ? 'center' : d.endsWith(':') ? 'right' : d.startsWith(':') ? 'left' : 'none';
  });
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(3, ...rows.map((r, k) => (k === delimIndex ? 3 : displayWidth(r[i] ?? '')))),
  );
  return rows.map((r, k) => {
    const cells = widths.map((w, i) => {
      if (k === delimIndex) {
        const a = align[i];
        const dash = '-'.repeat(w - (a === 'center' ? 2 : a === 'none' ? 0 : 1));
        return a === 'center' ? `:${dash}:` : a === 'left' ? `:${dash}` : a === 'right' ? `${dash}:` : dash;
      }
      const cell = r[i] ?? '';
      const pad = w - displayWidth(cell);
      if (align[i] === 'right') return ' '.repeat(pad) + cell;
      if (align[i] === 'center') return ' '.repeat(Math.floor(pad / 2)) + cell + ' '.repeat(Math.ceil(pad / 2));
      return cell + ' '.repeat(pad);
    });
    return `| ${cells.join(' | ')} |`;
  });
}
