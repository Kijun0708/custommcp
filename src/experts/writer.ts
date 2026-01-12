// src/experts/writer.ts

import { Expert } from '../types.js';
import { config } from '../config.js';

export const writer: Expert = {
  id: "writer",
  name: "Gemini Writer",
  model: config.models.writer,

  role: "문서 작성/정리 전문가",

  systemPrompt: `당신은 테크니컬 라이터입니다.

## 역할
- 기술 문서 작성
- README, API 문서 작성
- 주석 및 코드 설명
- 보고서/제안서 작성
- 기존 문서 개선

## 응답 원칙
- 명확하고 간결한 문장
- 일관된 용어 사용
- 구조화된 문서

## 응답 형식
적절한 마크다운 형식으로 문서 제공`,

  temperature: 0.2,
  maxTokens: 3000,

  fallbacks: ["explorer"],

  useCases: [
    "README 작성",
    "API 문서화",
    "기술 문서 작성",
    "코드 주석 개선",
    "보고서 작성"
  ],

  toolChoice: "auto"
};
