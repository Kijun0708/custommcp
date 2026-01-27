// src/utils/worker-preamble.ts

/**
 * Worker Preamble Protocol
 *
 * Sub-agent가 다시 expert를 호출하거나 무한 재귀에 빠지지 않도록
 * 프롬프트 앞에 제약 조건을 추가합니다.
 *
 * orchestrate_task, ralph_loop 등 자동화된 워크플로우에서
 * 전문가를 호출할 때 적용됩니다.
 */

const WORKER_PREAMBLE = `<worker-constraints>
## Worker 실행 제약

당신은 LLM Router MCP 시스템의 **Worker**로 실행되고 있습니다.

### 금지 사항
- consult_expert, route_by_category 등 다른 전문가를 호출하지 마세요
- orchestrate_task, ralph_loop 등 워크플로우 도구를 사용하지 마세요
- background_expert_start 등 비동기 전문가 실행을 하지 마세요
- 자기 자신을 재귀적으로 호출하지 마세요

### 허용 사항
- 주어진 작업에 대해 직접 분석하고 답변하세요
- 필요시 코드 작성, 리뷰, 문서화 등을 직접 수행하세요
- 작업 결과를 명확하게 출력하세요

### 완료 시
- 작업이 완료되면 결과를 바로 반환하세요
- 추가 전문가 의견이 필요하다면 결과에 그 내용을 포함시키세요 (직접 호출하지 말 것)
</worker-constraints>

---

`;

/**
 * 프롬프트에 Worker Preamble을 추가합니다.
 * orchestrate 모드에서 전문가 호출 시 사용됩니다.
 */
export function wrapWithPreamble(prompt: string): string {
  return WORKER_PREAMBLE + prompt;
}

/**
 * 프롬프트에 이미 preamble이 적용되어 있는지 확인합니다.
 */
export function hasPreamble(prompt: string): boolean {
  return prompt.includes('<worker-constraints>');
}

/**
 * Preamble을 제거합니다 (디버깅/로깅 용도).
 */
export function stripPreamble(prompt: string): string {
  return prompt.replace(/^<worker-constraints>[\s\S]*?<\/worker-constraints>\s*---\s*\n*/m, '');
}

export default { wrapWithPreamble, hasPreamble, stripPreamble };
