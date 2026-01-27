---
name: quick-search
description: 코드베이스에서 빠른 패턴 검색 및 파일 탐색
expert: explorer
argument-hint: "<검색 키워드 또는 패턴>"
tags:
  - search
  - exploration
  - quick
---

## Quick Search

빠른 코드베이스 검색을 수행합니다.

### 검색 전략

1. **파일명 검색**: glob 패턴으로 관련 파일 찾기
2. **코드 검색**: 키워드, 함수명, 클래스명 등 텍스트 매칭
3. **구조 검색**: import/export, 함수 정의, 클래스 정의 패턴
4. **관련 파일 연결**: 검색 결과와 연관된 파일 그룹핑

### 출력

- 매칭된 파일 목록 (경로 + 라인 번호)
- 각 매칭의 컨텍스트 (전후 2줄)
- 관련 파일 요약
