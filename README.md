# mdHandler

**데모**: https://devvshyun.github.io/mdHandler/

브라우저에서 Markdown을 열고, 고치고, **렌더링 결과를 옆에서 바로 보는** 편집기입니다. [pdfHandler](https://devvshyun.github.io/pdfHandler/)와 같은 방식(TypeScript + Vite, 프레임워크 없음, 파일은 브라우저 안에서만 처리)으로 만들었습니다.

| 계층 | 기술 |
| --- | --- |
| 편집기 | [CodeMirror 6](https://codemirror.net/) – 문법 강조, 코드 블록 안 언어별 강조, 찾기·바꾸기, 실행 취소 |
| 렌더링 | [markdown-it](https://github.com/markdown-it/markdown-it) (CommonMark + GFM 표·취소선·자동 링크) |
| 확장 | 체크리스트, 각주, KaTeX 수식, highlight.js 코드 강조, Mermaid 다이어그램(필요할 때만 로드) |
| 보안 | [DOMPurify](https://github.com/cure53/DOMPurify)로 미리보기 HTML 정화(스크립트·이벤트 속성 제거) |

## 기능

| 구분 | 기능 |
| --- | --- |
| 보기 | 편집 / **분할(편집기 + 미리보기)** / 미리보기 전환, 분할선 드래그로 폭 조절(더블클릭 50:50), 좁은 화면에서는 위아래 배치 |
| 스크롤 동기화 | 블록마다 원본 줄 번호를 달아 두 창이 같은 위치를 보여 줌(양방향, 끄기 가능) |
| 목차 | 제목으로 목차 생성, 클릭하면 편집기·미리보기 모두 이동, 현재 위치 강조 |
| 서식 | 제목 단계, 굵게, 기울임, 취소선, 코드, 인용, 목록, 체크리스트, 링크, 이미지, 표, 코드 블록, 수식, 다이어그램, 구분선 |
| 표 | 표 삽입, **표 정리**(열 너비 맞춤, 한글은 2칸으로 계산, 정렬 기호 유지) |
| 체크리스트 | 미리보기에서 체크박스를 누르면 원본의 `[ ]`/`[x]`가 바뀜 |
| 이미지 | 편집기에 붙여넣기·끌어다 놓기 → data URL로 문서에 삽입 |
| 파일 | 열기, 저장(지원 브라우저는 **같은 파일에 덮어쓰기**, 그 외는 내려받기), 다른 이름으로 저장, 드래그&드롭 열기 |
| 내보내기 | 단독 HTML 파일, 인쇄·PDF(미리보기만 인쇄), 서식 있는 HTML 클립보드 복사 |
| 기타 | 작업 내용 브라우저 자동 임시 저장·복원, YAML front matter 표시, 글자·단어·읽는 시간, 다크 모드, 편집기 설정(글자 크기·줄바꿈·줄 번호) |

### 단축키

| 키 | 동작 |
| --- | --- |
| Ctrl+O / Ctrl+S / Ctrl+Shift+S | 열기 / 저장 / 다른 이름으로 저장 |
| Alt+N | 새 문서 |
| Ctrl+P | 인쇄·PDF |
| Ctrl+F | 찾기·바꾸기 |
| Ctrl+B / Ctrl+I / Ctrl+Shift+X / Ctrl+E | 굵게 / 기울임 / 취소선 / 인라인 코드 |
| Ctrl+K | 링크 |
| Ctrl+H | 제목 단계 순환(H1 → H2 → H3 → 본문) |
| Ctrl+Shift+. / 8 / 7 / 9 | 인용 / 글머리 목록 / 번호 목록 / 체크리스트 |
| Ctrl+Alt+T | 커서가 있는 표 정리 |
| Ctrl+Alt+1 / 2 / 3 | 편집 / 분할 / 미리보기 |
| Ctrl+Alt+O | 목차 패널 |

macOS에서는 Ctrl 대신 Cmd를 씁니다.

## 구조

```
src/
  main.ts      앱 상태, 파일 작업, 스크롤 동기화, 목차, 단축키
  editor.ts    CodeMirror 설정과 서식 명령
  render.ts    markdown-it 설정, 줄 번호(data-line)·제목 id, front matter, 통계
  preview.ts   DOMPurify 정화, Mermaid 렌더링, 줄 ↔ 스크롤 위치 대응표
  table.ts     표 생성·정리
  files.ts     File System Access API(가능할 때) / 파일 입력·내려받기
  export.ts    단독 HTML 내보내기
  preview.css  렌더링 스타일(내보낸 HTML에도 그대로 들어감)
test/          render·sanitize·table 단위 테스트(vitest)
```

### 스크롤 동기화 방식

1. markdown-it 코어 규칙이 블록 토큰마다 `data-line`(원본 줄, 0부터)을 붙입니다. 코드 블록은 하이라이트 결과를 감싸는 `div`에 붙입니다.
2. 렌더링 후 각 `data-line` 요소의 미리보기 내 위치를 재서 `(줄, 위치)` 대응표를 만듭니다(단조 증가만 유지).
3. 편집기 맨 위의 줄(소수점 포함)을 대응표에서 선형 보간해 미리보기 위치를 구하고, 반대 방향도 같은 표로 계산합니다. 프로그램이 움직인 쪽의 스크롤 이벤트는 100ms 동안 무시해 서로 되먹임하지 않습니다.
4. 이미지·다이어그램 로드로 높이가 바뀌면 `ResizeObserver`가 대응표를 다시 잽니다.

## 실행

Node 22가 필요합니다.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 단위 테스트
npm run build      # dist/ 에 정적 파일 생성
```

`dist/`는 어떤 정적 호스팅에서도 동작합니다(`base: './'`). `.github/workflows/pages.yml`이 푸시 때마다 GitHub Pages에 배포합니다. 최초 1회 저장소 **Settings → Pages → Source를 "GitHub Actions"** 로 설정해야 합니다.

## 한계

* **같은 파일에 덮어쓰기**는 File System Access API를 지원하는 Chromium 계열(Chrome, Edge)에서만 됩니다. Firefox·Safari에서는 저장할 때 파일을 내려받습니다.
* 상대 경로 이미지(`![](./img.png)`)는 브라우저가 원본 폴더에 접근할 수 없어 표시되지 않습니다. 붙여넣거나 끌어다 놓은 이미지는 data URL로 문서에 들어가므로 어디서나 보이지만 파일이 커집니다.
* 원본 HTML 태그는 허용하되 정화합니다. `<script>`, `<style>`, `<form>`, `on*` 속성, `javascript:` 링크는 제거됩니다.
* 임시 저장은 이 브라우저의 `localStorage`에만 남습니다(다른 기기와 공유되지 않음, 시크릿 창에서는 꺼질 수 있음).
* 내보낸 HTML은 수식 글꼴(KaTeX CSS)을 CDN에서 불러옵니다. 오프라인에서는 수식 모양이 달라질 수 있습니다.
