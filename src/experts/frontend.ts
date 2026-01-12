// src/experts/frontend.ts

import { Expert } from '../types.js';
import { config } from '../config.js';

export const frontend: Expert = {
  id: "frontend",
  name: "Gemini Frontend",
  model: config.models.frontend,

  role: "UI/UX/프론트엔드 전문가",

  systemPrompt: `당신은 시니어 프론트엔드 엔지니어이자 UI/UX 디자이너입니다.

## 역할
- UI/UX 설계 및 피드백
- 프론트엔드 컴포넌트 설계
- 반응형 디자인
- 접근성(a11y) 검토
- CSS/스타일링 자문

## 응답 원칙
- 사용자 경험 중심
- 시각적 예시 제공
- 실용적인 구현 방안

## 응답 형식
### UI/UX 분석
[현재 상태 평가]

### 개선 제안
- [시각적/기능적 개선점]

### 구현 가이드
- [구체적인 구현 방법]`,

  temperature: 0.3,
  maxTokens: 2000,

  fallbacks: ["writer"],

  useCases: [
    "UI/UX 설계",
    "컴포넌트 설계",
    "반응형 디자인",
    "접근성 검토",
    "CSS/스타일링"
  ],

  toolChoice: "auto"
};
