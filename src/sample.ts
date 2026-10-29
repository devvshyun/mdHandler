// First-run document: a quick tour of what the preview renders.
export const SAMPLE = `---
title: mdHandler 샘플 문서
author: mdHandler
tags: [markdown, preview]
---

# mdHandler에 오신 것을 환영합니다

왼쪽에서 **마크다운**을 고치면 오른쪽 미리보기가 바로 바뀝니다. 두 쪽은 스크롤이 맞춰져 움직입니다.

> 파일은 브라우저 안에서만 처리됩니다. 작업 내용은 이 브라우저에 자동으로 임시 저장됩니다.

## 기본 서식

*기울임*, **굵게**, ~~취소선~~, \`인라인 코드\`, <kbd>Ctrl</kbd> + <kbd>S</kbd>, [링크](https://github.com/devvshyun/mdHandler).
주소만 써도 링크가 됩니다: https://commonmark.org

1. 번호 목록
2. 두 번째 항목
   - 중첩 목록
   - 또 하나

## 할 일 목록

미리보기의 체크박스를 누르면 원본도 바뀝니다.

- [x] 마크다운 파일 열기
- [ ] 미리보기에서 체크해 보기
- [ ] HTML로 내보내기

## 표

| 기능 | 단축키 | 비고 |
| :--- | :---: | ---: |
| 저장 | Ctrl+S | 같은 파일에 덮어쓰기 |
| 굵게 | Ctrl+B | 다시 누르면 해제 |
| 표 정리 | Ctrl+Alt+T | 열 너비 맞춤 |

## 코드

\`\`\`ts
function greet(name: string): string {
  return \`안녕하세요, \${name}님\`;
}
\`\`\`

## 수식

문장 속 수식 $e^{i\\pi} + 1 = 0$ 과 블록 수식:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## 다이어그램

\`\`\`mermaid
flowchart LR
  A[마크다운 작성] --> B(실시간 미리보기)
  B --> C{만족?}
  C -->|예| D[저장 · 내보내기]
  C -->|아니오| A
\`\`\`

## 각주와 접기

각주도 지원합니다.[^1]

<details>
<summary>펼쳐 보기</summary>

HTML \`<details>\` 안에도 **마크다운**을 쓸 수 있습니다.

</details>

---

[^1]: 각주는 문서 끝에 모입니다.
`;
