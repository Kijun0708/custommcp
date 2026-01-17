# LLM Router MCP

> Claude Code를 팀 리더로, GPT/Gemini/Claude를 전문가 팀으로 활용하는 **"배터리 포함" MCP 서버**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

## 개요

LLM Router MCP는 [oh-my-opencode](https://github.com/nicepkg/oh-my-opencode) 프로젝트에서 영감을 받아 개발된 MCP 서버입니다. Claude Code가 팀 리더 역할을 하며, 특정 작업에 맞는 AI 전문가에게 업무를 위임합니다.

### 주요 특징

- **11개 AI 전문가**: GPT, Claude, Gemini를 역할별로 활용
- **129개 MCP 도구**: 코드 분석, 웹 검색, Git, 브라우저 자동화 등
- **38개+ 내장 훅**: Sisyphus 패턴, Think Mode, 자동 복구 등
- **Sisyphus 오케스트레이션**: 작업 완료까지 자동 계속 진행
- **자동 폴백**: Rate limit 발생 시 자동으로 다른 전문가로 전환

---

## 빠른 시작

### 1. 저장소 클론 및 빌드

```bash
git clone https://github.com/Kijun0708/custommcp.git
cd custommcp
npm install
npm run build
```

### 2. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일 편집:
```bash
# 필수: Exa API (웹 검색)
EXA_API_KEY=your_exa_api_key

# 선택: Context7 API (라이브러리 문서)
CONTEXT7_API_KEY=your_context7_api_key
```

### 3. Claude Code 연동

`~/.claude/settings.local.json` 또는 `claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["/path/to/custommcp/dist/index.js"]
    }
  }
}
```

### 4. AI 프로바이더 인증

Claude Code에서 다음 명령 실행:

```
"인증 상태 확인해줘"  → 현재 상태 확인
"GPT 인증해줘"       → GPT OAuth 진행
"Claude 인증해줘"    → Claude OAuth 진행
"Gemini 인증해줘"    → Gemini OAuth 진행
```

---

## CLI 설치 (선택)

```bash
# CLI 전역 설치
npm link

# 대화형 설치
custommcp install

# 비대화형 설치 (Claude Code만)
custommcp install --no-tui --claude=yes

# 진단
custommcp doctor
```

---

## 전문가 시스템

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `strategist` | GPT 5.2 | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Claude Sonnet | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | - |
| `multimodal` | GPT 5.2 | 이미지 분석, 시각적 콘텐츠 | strategist → researcher |
| `librarian` | Claude Sonnet | 지식 관리, 세션 히스토리 검색 | researcher → explorer |
| `metis` | GPT 5.2 | 전략적 계획, 복잡한 문제 분해 | strategist → researcher |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → explorer |
| `prometheus` | Claude Sonnet | 창의적 솔루션, 혁신적 접근 | strategist → researcher |

---

## 핵심 기능

### Sisyphus 오케스트레이션

oh-my-opencode 스타일의 **작업 완료 강제 메커니즘**:

```
┌─────────────────────────────────────────────────────────┐
│  Sisyphus 오케스트레이션                                 │
├─────────────────────────────────────────────────────────┤
│  1. 코드 수정은 반드시 전문가에게 위임                    │
│  2. 서브에이전트 응답은 반드시 검증 (Subagents LIE)       │
│  3. 모든 작업이 완료될 때까지 계속 진행                   │
└─────────────────────────────────────────────────────────┘
```

- **위임 강제**: 오케스트레이터가 직접 코드 수정 시 경고
- **검증 리마인더**: 서브에이전트가 "완료" 주장 시 검증 체크리스트 표시
- **자동 계속**: 세션 유휴 상태에서 미완료 작업 감지 시 자동 프롬프트 주입
- **볼더 상태**: 작업 진행 상태 추적 및 복구

### Think Mode (확장 사고)

복잡한 문제에 대한 깊은 분석:

| 키워드 | 레벨 | 토큰 예산 |
|--------|------|----------|
| `think`, `생각` | normal | 10,000 |
| `think hard`, `깊이 생각` | deep | 20,000 |
| `ultrathink`, `maximum reasoning` | extreme | 50,000 |

```
"이 문제 think hard 해서 분석해줘"
→ Deep Thinking Mode 활성화, 5단계 분석 프로세스 적용
```

### Magic Keywords

프롬프트에 키워드를 포함하면 자동으로 해당 모드가 활성화:

| 키워드 | 트리거 | 용도 |
|--------|--------|------|
| ultrawork | `ultrawork`, `ulw` | 최대 성능 오케스트레이션 |
| search | `search`, `find`, `찾아` | 멀티 에이전트 병렬 검색 |
| analyze | `analyze`, `분석` | 심층 분석 모드 |
| deepdive | `deepdive`, `철저히` | 철저한 연구 모드 |
| quickfix | `quickfix`, `빨리` | 빠른 버그 수정 |
| refactor | `refactor`, `리팩토링` | 코드 리팩토링 |
| review | `review`, `리뷰` | 코드 리뷰 |
| document | `document`, `문서화` | 문서화 모드 |

---

## Agent & Command 시스템

Claude Code 스타일의 에이전트와 명령어 시스템:

### 에이전트 정의

`~/.claude/agents/` 또는 `.claude/agents/`에 마크다운 파일 생성:

```markdown
---
name: research-agent
description: 심층 연구 전문가
tools:
  - WebSearch
  - Read
model: sonnet
---

당신은 연구 전문가입니다. 주어진 주제에 대해 철저히 조사하고
근거 있는 분석을 제공합니다.
```

### 명령어 정의

`~/.claude/commands/` 또는 `.claude/commands/`에 마크다운 파일 생성:

```markdown
---
name: review
description: 코드 리뷰 수행
aliases:
  - cr
---

다음 코드를 리뷰해주세요:
1. 버그 가능성
2. 성능 이슈
3. 보안 취약점
4. 코드 스타일
```

### MCP 도구

| 도구 | 설명 |
|------|------|
| `list_agents` | 사용 가능한 에이전트 목록 |
| `run_agent` | 에이전트 실행 |
| `list_commands` | 슬래시 명령어 목록 |
| `run_command` | 명령어 실행 |
| `search_commands` | 명령어 검색 |

---

## TODO 관리 시스템

작업 추적을 위한 TODO 관리 도구:

| 도구 | 설명 | 예시 |
|------|------|------|
| `todo_add` | TODO 추가 | `{ "content": "인증 구현", "priority": "high", "tags": ["auth"] }` |
| `todo_update` | 상태 변경 | `{ "id": "todo-1", "status": "in_progress" }` |
| `todo_complete` | 완료 처리 | `{ "id": "todo-1" }` |
| `todo_list` | 목록 조회 | `{ "status": "active" }` |
| `todo_remind` | 리마인더 | `{ "includeCompleted": false }` |
| `todo_clear` | 완료 항목 정리 | `{ "status": "completed" }` |

### 상태 및 우선순위

**상태**: `pending` → `in_progress` → `completed` / `blocked`

**우선순위**: `low` (파랑) → `normal` (초록) → `high` (노랑) → `critical` (빨강)

---

## 주요 도구 카테고리

### 전문가 상담
| 도구 | 설명 |
|------|------|
| `consult_expert` | 전문가에게 직접 질문 |
| `route_by_category` | 카테고리 기반 자동 라우팅 |
| `ensemble_query` | 여러 전문가 의견 종합 |

### 코드 분석
| 도구 | 설명 |
|------|------|
| `lsp_get_definition` | 심볼 정의 위치 |
| `lsp_get_references` | 심볼 참조 찾기 |
| `lsp_get_hover` | 타입/문서 정보 |
| `ast_grep_search` | AST 패턴 검색 |
| `ast_grep_replace` | AST 패턴 치환 |

### 검색 및 문서
| 도구 | 설명 |
|------|------|
| `web_search` | Exa 웹 검색 |
| `get_library_docs` | 라이브러리 문서 조회 |
| `grep_app` | GitHub/GitLab 코드 검색 |

### Git
| 도구 | 설명 |
|------|------|
| `git_atomic_commit` | 자동 그룹화 커밋 |
| `git_history_search` | 커밋 히스토리 검색 |
| `git_rebase_planner` | 리베이스 계획 |
| `git_squash_helper` | 커밋 스쿼시 |
| `git_branch_analysis` | 브랜치 분석 |

### 브라우저 자동화
| 도구 | 설명 |
|------|------|
| `playwright_screenshot` | 웹 페이지 캡처 |
| `playwright_pdf` | PDF 생성 |
| `playwright_extract` | 콘텐츠 추출 |
| `playwright_action` | 클릭/입력 등 |

### 세션 관리
| 도구 | 설명 |
|------|------|
| `session_list` | 세션 목록 |
| `session_read` | 세션 내용 |
| `session_search` | 세션 검색 |
| `interactive_bash_create` | Tmux 세션 생성 |

---

## 훅 시스템

38개 이상의 내장 훅으로 동작 확장:

### Core Hooks
| 훅 | 설명 |
|----|------|
| `sisyphus-orchestrator` | 작업 완료 강제 오케스트레이션 |
| `todo-continuation-enforcer` | TODO 완료 강제 |
| `think-mode` | 확장 사고 모드 |
| `rules-injector` | `.claude/rules/` 규칙 자동 주입 |

### Stability Hooks
| 훅 | 설명 |
|----|------|
| `session-recovery` | 세션 에러 자동 복구 |
| `edit-error-recovery` | 편집 에러 복구 |
| `preemptive-compaction` | 선제적 컨텍스트 압축 |
| `context-window-monitor` | 컨텍스트 사용량 모니터링 |

### UX Hooks
| 훅 | 설명 |
|----|------|
| `auto-update-checker` | 버전 업데이트 알림 |
| `task-toast-manager` | 작업 완료 알림 |
| `magic-keywords` | 매직 키워드 감지 |
| `directory-injector` | AGENTS.md/README.md 자동 로드 |

---

## 사용 예시

### 기본 사용
```
"strategist에게 이 아키텍처 검토해달라고 해줘"
"researcher로 React 19 변경사항 조사해줘"
"reviewer에게 이 PR 코드 리뷰 부탁해"
```

### 매직 키워드
```
"ultrawork로 전체 인증 시스템 구현해줘"
→ 최대 성능 모드, 자동 위임, 검증, 완료까지 진행

"이 버그 quickfix 해줘"
→ 빠른 수정 모드

"이 코드 deepdive 분석해줘"
→ 철저한 분석 모드
```

### Think Mode
```
"이 알고리즘 think hard 해서 최적화 방법 찾아줘"
→ 5단계 심층 분석 적용

"ultrathink로 이 아키텍처 설계해줘"
→ 최대 추론 모드 (50K 토큰 예산)
```

### 에이전트 실행
```
"list_agents로 사용 가능한 에이전트 보여줘"
"run_agent로 research-agent에게 'GraphQL vs REST' 조사시켜줘"
```

### TODO 관리
```
"todo_add로 '인증 구현' 작업 추가해줘, 우선순위 high"
"todo_list로 진행 중인 작업 보여줘"
"todo_remind로 남은 작업 리마인더 해줘"
```

### LSP 활용
```
"이 함수 정의 위치 찾아줘"     → lsp_get_definition
"이 변수 참조 전부 찾아줘"      → lsp_get_references
```

### Git 작업
```
"변경사항 분석해서 atomic 커밋해줘"  → git_atomic_commit
"'auth' 관련 커밋 히스토리 검색"    → git_history_search
```

---

## 환경 변수

```bash
# 필수
EXA_API_KEY=                    # Exa 웹 검색 API 키

# 선택
CONTEXT7_API_KEY=               # Context7 라이브러리 문서 API 키
CLIPROXY_URL=http://localhost:8787  # CLIProxyAPI 엔드포인트
CLIPROXY_PATH=vendor/cliproxy/cli-proxy-api.exe  # CLIProxyAPI 경로

# 캐시 (선택)
CACHE_ENABLED=true              # 응답 캐싱 활성화
CACHE_TTL_MS=1800000           # 캐시 TTL (30분)

# 동시성 (선택)
CONCURRENCY_ANTHROPIC=3         # Anthropic API 동시 요청 수
CONCURRENCY_OPENAI=3            # OpenAI API 동시 요청 수
CONCURRENCY_GOOGLE=5            # Google API 동시 요청 수
```

---

## 프로젝트 구조

```
custommcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── experts/              # 전문가 정의
│   ├── tools/                # MCP 도구 (129개)
│   ├── hooks/                # 훅 시스템
│   │   └── builtin/          # 내장 훅 (38개+)
│   ├── features/             # 기능 모듈
│   │   ├── boulder-state/    # 볼더 상태 관리
│   │   ├── claude-code-agent-loader/   # 에이전트 로더
│   │   ├── claude-code-command-loader/ # 명령어 로더
│   │   ├── skill-system/     # 스킬 시스템
│   │   └── mcp-loader/       # MCP 서버 관리
│   ├── services/             # 핵심 서비스
│   │   ├── expert-router.ts  # 전문가 라우팅
│   │   └── cliproxy-client.ts # CLIProxyAPI 클라이언트
│   └── cli/                  # CLI 도구
├── vendor/
│   └── cliproxy/             # CLIProxyAPI 바이너리
└── dist/                     # 빌드 출력
```

---

## 통계

| 항목 | 수량 |
|------|------|
| MCP 도구 | 129개 |
| 내장 훅 | 38개+ |
| 전문가 | 11개 |
| 기능 모듈 | 15+ |

---

## oh-my-opencode와의 관계

이 프로젝트는 [oh-my-opencode](https://github.com/nicepkg/oh-my-opencode)에서 영감을 받았습니다.

### 동일한 기능
- Sisyphus 스타일 작업 완료 강제
- Think Mode (확장 사고)
- Agent/Command 로더
- Rules Injector
- TODO Continuation Enforcer
- Preemptive Compaction
- Session Recovery

### 차이점
| 항목 | oh-my-opencode | custommcp |
|------|----------------|-----------|
| 아키텍처 | Claude Code 플러그인 | MCP 서버 |
| 런타임 | Bun | Node.js |
| 전문가 수 | 7개 | 11개 |
| 도구 수 | 13개 | 129개 |
| 세션 제어 | 직접 제어 | MCP 프로토콜 통해 간접 |

---

## 문제 해결

### CLIProxyAPI 연결 실패
```bash
# CLIProxyAPI 수동 실행
./vendor/cliproxy/cli-proxy-api.exe

# 또는 환경변수로 URL 지정
CLIPROXY_URL=http://localhost:8787
```

### 인증 문제
```
"auth_status" 로 현재 상태 확인
"auth_gpt/claude/gemini" 로 재인증
```

### LSP 서버 미동작
```
"lsp_check_server" 로 서버 상태 확인
# TypeScript: npx typescript-language-server --stdio
# Python: pylsp
```

### 컨텍스트 초과
```
"context_status" 로 사용량 확인
# 자동 압축이 70%에서 트리거됨
```

---

## 기여

이슈와 PR을 환영합니다.

## 라이선스

MIT
