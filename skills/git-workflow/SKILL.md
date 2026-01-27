---
name: git-workflow
description: Git 워크플로우 - 커밋 전략, 브랜치 관리, 히스토리 정리
expert: strategist
argument-hint: "<Git 작업: commit, rebase, merge, squash 등>"
tags:
  - git
  - workflow
  - version-control
---

## Git Workflow

Git 워크플로우를 전략적으로 관리합니다.

### 지원 작업

1. **Atomic Commit**: 변경사항을 논리적 단위로 분리하여 커밋
2. **Branch Strategy**: 브랜치 전략 설계 및 병합 계획
3. **History Cleanup**: 인터랙티브 rebase, squash, fixup
4. **Conflict Resolution**: 병합 충돌 분석 및 해결 전략
5. **Release Management**: 태그, 릴리스 노트, 체리픽

### 커밋 메시지 규칙

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci
