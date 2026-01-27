---
name: code-review
description: 코드 리뷰 - 버그, 성능, 코딩 스타일, 보안 점검
expert: reviewer
argument-hint: "<리뷰할 파일/PR/코드 범위>"
tags:
  - review
  - quality
  - bugs
---

## Code Review

철저한 코드 리뷰를 수행합니다.

### 리뷰 기준

1. **정확성**: 로직 오류, 엣지 케이스, off-by-one 에러
2. **성능**: 불필요한 연산, N+1 쿼리, 메모리 누수 가능성
3. **보안**: 인젝션, XSS, 인증/인가 문제
4. **유지보수성**: 네이밍, 복잡도, 중복 코드, 테스트 가능성
5. **코딩 표준**: 프로젝트 컨벤션 준수 여부

### 출력 형식

각 이슈에 대해:
- **위치**: 파일:라인
- **심각도**: 🔴 Critical / 🟠 Major / 🟡 Minor / 🔵 Suggestion
- **설명**: 문제 설명
- **수정 제안**: 구체적 코드 변경안
