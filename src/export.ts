// Standalone HTML export: rendered body + the preview stylesheet inlined (it carries its own light/dark tokens), KaTeX CSS from a CDN.
import previewCss from './preview.css?raw';
import katexPkg from 'katex/package.json';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Title from the first H1, else the file name. */
export function documentTitle(markdown: string, fileName: string): string {
  const m = /^#\s+(.+)$/m.exec(markdown);
  return (m?.[1] ?? fileName.replace(/\.[^.]+$/, '')).replace(/[*_`]/g, '').trim();
}

export function standaloneHtml(bodyHtml: string, title: string): string {
  // Interactive bits make no sense in a static copy.
  const body = bodyHtml.replace(/<input([^>]*class="task-list-item-checkbox"[^>]*)>/g, '<input$1 disabled>');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${katexPkg.version}/dist/katex.min.css">
<style>
:root{color-scheme:light dark}
body{margin:0;background:var(--md-bg)}
.markdown-body{max-width:860px;margin:0 auto;padding:40px 24px 80px}
${previewCss}
</style>
</head>
<body>
<article class="markdown-body">
${body}
</article>
</body>
</html>
`;
}
