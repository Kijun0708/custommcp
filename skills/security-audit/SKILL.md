---
name: security-audit
description: 보안 감사 - OWASP Top 10 기반 취약점 분석
expert: reviewer
argument-hint: "<감사 대상 모듈/API/시스템>"
tags:
  - security
  - audit
  - owasp
---

## Security Audit

OWASP Top 10 기반의 보안 취약점 감사를 수행합니다.

### 점검 항목

1. **인젝션**: SQL, NoSQL, OS 명령어, LDAP 인젝션
2. **인증 결함**: 약한 비밀번호, 세션 관리, 토큰 처리
3. **민감 데이터 노출**: 암호화, 키 관리, 로깅
4. **XXE**: XML 외부 엔티티
5. **접근 제어**: 권한 상승, IDOR, CORS
6. **잘못된 보안 설정**: 기본 설정, 불필요한 기능
7. **XSS**: 반사형, 저장형, DOM 기반
8. **역직렬화 취약점**: 안전하지 않은 역직렬화
9. **알려진 취약점**: 의존성 보안 패치 상태
10. **로깅/모니터링 부족**: 감사 로그, 알림

### 출력

- 발견된 취약점 목록 (CVSS 점수 포함)
- 영향 분석 및 공격 시나리오
- 수정 권장사항 (우선순위별)
