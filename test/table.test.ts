import { describe, expect, it } from 'vitest';
import { displayWidth, emptyTable, formatTable, splitRow } from '../src/table';

describe('table', () => {
  it('counts Hangul as double width', () => {
    expect(displayWidth('ab한글')).toBe(6);
  });

  it('splits rows, keeping escaped pipes and code spans', () => {
    expect(splitRow('| a \\| b | `x|y` | c |')).toEqual(['a \\| b', '`x|y`', 'c']);
  });

  it('aligns columns and keeps alignment colons', () => {
    expect(formatTable(['|이름|값|', '|:-|-:|', '|가|12345|'])).toEqual([
      '| 이름 |    값 |',
      '| :--- | ----: |',
      '| 가   | 12345 |',
    ]);
  });

  it('pads missing cells', () => {
    const out = formatTable(['| a | b | c |', '|---|---|---|', '| 1 |']);
    expect(out[2]).toBe('| 1   |     |     |');
  });

  it('builds an empty table', () => {
    expect(emptyTable(2, 1).split('\n')).toHaveLength(3);
  });
});
