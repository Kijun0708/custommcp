# LLM Router MCP 개발 로드맵

oh-my-opencode 기능 패리티를 위한 개발 계획입니다.

## 진행 상황 요약

| 우선순위 | 완료 | 전체 | 진행률 |
|---------|------|------|--------|
| High | 6 | 6 | 100% ✅ |
| Medium | 8 | 8 | 100% ✅ |
| Lower | 5 | 5 | 100% ✅ |
| Experimental | 4 | 4 | 100% ✅ |
| **전체** | **23** | **23** | **100%** ✅ |

---

## 🔴 High Priority (사용자 경험 향상)

### H1. LSP Rename 기능
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/lsp.ts`, `src/services/lsp-client.ts`
- **도구**: `lsp_prepare_rename`, `lsp_rename`
- **설명**: 워크스페이스 전체에서 심볼 이름 변경
- **예상 작업량**: 작음

### H2. grep_app (GitHub 코드 검색)
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/grep-app.ts`, `src/services/grep-app-client.ts`
- **도구**: `grep_app`, `grep_app_languages`
- **설명**: grep.app API를 통한 GitHub 전체 코드 검색
- **예상 작업량**: 작음

### H3. Session List 도구
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/session-transcript.ts`, `src/services/session-transcript-client.ts`
- **도구**: `session_list`
- **설명**: Claude Code 세션 목록 조회 및 필터링
- **예상 작업량**: 중간

### H4. Session Read 도구
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/session-transcript.ts`
- **도구**: `session_read`
- **설명**: 특정 세션의 메시지 읽기
- **예상 작업량**: 중간

### H5. Session Search 도구
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/session-transcript.ts`
- **도구**: `session_search`
- **설명**: 모든 세션에서 전체 텍스트 검색
- **예상 작업량**: 중간

### H6. Session Info 도구
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/session-transcript.ts`
- **도구**: `session_info`
- **설명**: 세션 메타데이터 및 통계 조회
- **예상 작업량**: 중간

---

## 🟠 Medium Priority (고급 기능)

### M1. Empty Message Sanitizer Hook
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/empty-message-sanitizer.ts`
- **설명**: 빈 메시지 감지 및 제거로 API 요청 오류 방지
- **예상 작업량**: 작음

### M2. Thinking Block Validator Hook
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/thinking-block-validator.ts`
- **설명**: thinking 블록 포맷 검증
- **예상 작업량**: 작음

### M3. Preemptive Compaction Hook
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/preemptive-compaction.ts`
- **설명**: 하드 리밋 전 선제적 컨텍스트 압축
- **예상 작업량**: 중간

### M4. Compaction Context Injector Hook
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/compaction-context-injector.ts`
- **설명**: 컨텍스트 압축 시 중요 정보 보존
- **예상 작업량**: 중간

### M5. Prometheus Agent (Strategic Planning)
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/experts/prometheus.ts`, `src/prompts/experts/prometheus.prompt.ts`
- **설명**: 인터뷰 기반 전략적 계획 수립 에이전트
- **예상 작업량**: 중간

### M6. Metis Agent (Pre-planning Analysis)
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/experts/metis.ts`, `src/prompts/experts/metis.prompt.ts`
- **설명**: 사전 분석 및 요구사항 정리 에이전트
- **예상 작업량**: 중간

### M7. Momus Agent (Plan Validation)
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/experts/momus.ts`, `src/prompts/experts/momus.prompt.ts`
- **설명**: 계획 검증 및 QA 에이전트
- **예상 작업량**: 중간

### M8. Librarian Agent
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/experts/librarian.ts`, `src/prompts/experts/librarian.prompt.ts`
- **설명**: 멀티 레포지토리 분석 및 문서 통합 에이전트
- **예상 작업량**: 중간

---

## 🟡 Lower Priority (확장 기능)

### L1. Playwright Skill
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/playwright.ts`
- **도구**: `playwright_screenshot`, `playwright_extract`, `playwright_action`, `playwright_pdf`
- **설명**: 브라우저 자동화, 웹 스크래핑, 스크린샷, PDF 생성
- **예상 작업량**: 중간
- **의존성**: `npm install playwright` (선택적, 미설치 시 에러 메시지 표시)

### L2. Git Master Skill
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/tools/git-master.ts`
- **도구**: `git_atomic_commit`, `git_history_search`, `git_rebase_planner`, `git_squash_helper`, `git_branch_analysis`
- **설명**: Atomic 커밋, 리베이스, 스쿼시, 히스토리 검색, 브랜치 분석
- **예상 작업량**: 중간

### L3. Command Discovery System
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/features/command-discovery/`, `src/tools/command-discovery.ts`
- **도구**: `command_list`, `command_get`, `command_execute`, `command_rescan`, `command_config`
- **설명**: 여러 디렉토리에서 커맨드 동적 로딩
- **경로**: `.opencode/command/`, `.claude/commands/`, `~/.config/opencode/command/`
- **예상 작업량**: 중간

### L4. Session Notification Hook
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/session-notification.ts`
- **설명**: 세션 시작/에러/완료 알림
- **예상 작업량**: 작음

### L5. Agent Usage Reminder Hook
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/agent-usage-reminder.ts`
- **설명**: 적절한 전문 에이전트 사용 제안
- **예상 작업량**: 작음

---

## 🔵 Experimental (실험적 기능)

> 이 기능들은 oh-my-opencode에서도 실험적으로 분류됨

### E1. Auto Resume
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/auto-resume.ts`
- **설명**: 복구 후 자동 세션 재개
- **기능**: 세션 상태 저장/로드, 에러 추적, 자동 재개
- **예상 작업량**: 중간

### E2. Doom Loop Detection
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/doom-loop-detector.ts`
- **설명**: 무한 루프 감지 및 오버라이드
- **기능**: 동일 호출 감지, 유사 호출 감지, 과다 호출, 에러 루프 감지
- **예상 작업량**: 중간

### E3. Aggressive Truncation Mode
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/aggressive-truncation.ts`
- **설명**: 토큰 한계 시 공격적 출력 축소
- **기능**: 다단계 truncation (none, light, moderate, aggressive, extreme), 코드 블록 보존
- **예상 작업량**: 작음

### E4. Dynamic Context Pruning
- [x] **완료** ✅ 2025-01-17
- **파일**: `src/hooks/builtin/dynamic-context-pruning.ts`
- **설명**: 지능적 컨텍스트 정리
- **기능**: 관련성 기반 점수, 시간 감쇠, 카테고리 인식 정리, 앵커 보존
- **예상 작업량**: 높음

---

## 🚫 구현 제외 (MCP 제약)

다음 기능들은 MCP 서버 환경의 제약으로 구현하지 않습니다:

| 기능 | 이유 |
|------|------|
| Interactive Bash (Tmux) | MCP는 독립 프로세스로 실행되어 터미널 접근 제한 |
| Startup Toast | MCP 서버에는 시작 UI 없음 |
| Auto Update Checker | Claude Code가 MCP 버전 관리 |
| Claude Code Hooks (settings.json) | OpenCode 전용 기능 |

---

## 개발 완료 기록

### 2025-01-17
- Experimental 기능 구현 완료 (E1-E4)
  - E1. Auto Resume Hook - 세션 상태 저장/로드, 에러 추적
  - E2. Doom Loop Detection - 무한 루프 패턴 감지 및 차단
  - E3. Aggressive Truncation Mode - 다단계 출력 축소
  - E4. Dynamic Context Pruning - 관련성 기반 컨텍스트 정리

### 2025-01-17
- Lower Priority 기능 구현 완료 (L1-L5)
  - L1. Playwright Skill - 브라우저 자동화, 스크린샷, PDF
  - L2. Git Master Skill - Atomic 커밋, 리베이스, 히스토리
  - L3. Command Discovery - 동적 커맨드 로딩
  - L4. Session Notification - 알림 시스템
  - L5. Agent Usage Reminder - 에이전트 사용 제안

### 2025-01-17
- Medium Priority 기능 구현 완료 (M1-M8)
  - Hook 시스템 안정성 및 컨텍스트 관리
  - 4개 신규 에이전트 (Prometheus, Metis, Momus, Librarian)

### 2025-01-17
- High Priority 기능 구현 완료 (H1-H6)
  - LSP Rename, grep_app, Session 관리 도구

### 2024-XX-XX
- 초기 로드맵 작성

---

## 참고 자료

- [oh-my-opencode Repository](https://github.com/code-yeongyu/oh-my-opencode)
- [LLM Router MCP README](./README.md)
- [CLAUDE.md](./CLAUDE.md)
