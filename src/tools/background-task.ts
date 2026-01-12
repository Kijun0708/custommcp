// src/tools/background-task.ts

import { z } from "zod";
import {
  startBackgroundTask,
  getTaskResult,
  cancelTask,
  listTasks,
  getStats
} from "../services/background-manager.js";

// 백그라운드 시작
export const backgroundStartSchema = z.object({
  expert: z.enum(["strategist", "researcher", "reviewer", "frontend", "writer", "explorer"])
    .describe("실행할 전문가"),

  prompt: z.string()
    .describe("작업 내용"),

  context: z.string()
    .optional()
    .describe("추가 컨텍스트"),

  task_id: z.string()
    .optional()
    .describe("커스텀 작업 ID (미지정 시 자동 생성)")
}).strict();

export const backgroundStartTool = {
  name: "background_expert_start",

  title: "백그라운드 전문가 실행",

  description: `전문가를 백그라운드에서 비동기로 실행합니다.

## 사용 시점
- 메인 작업과 병렬로 조사가 필요할 때
- 여러 전문가의 의견을 동시에 받고 싶을 때
- 긴 분석 작업을 기다리지 않고 진행하고 싶을 때

## 반환값
- task_id: 결과 조회용 ID
- status: "pending" | "running"

## 결과 조회
background_expert_result(task_id) 도구로 조회

## 사용 예시
1. 병렬 조사 시작:
   - background_expert_start(expert="researcher", prompt="라이브러리A 분석")
   - background_expert_start(expert="researcher", prompt="라이브러리B 분석")
2. 다른 작업 진행
3. 결과 수집: background_expert_result(task_id)`,

  inputSchema: backgroundStartSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export function handleBackgroundStart(params: z.infer<typeof backgroundStartSchema>) {
  const task = startBackgroundTask(
    params.expert,
    params.prompt,
    params.context,
    params.task_id
  );

  return {
    content: [{
      type: "text" as const,
      text: `## 🚀 백그라운드 작업 시작\n\n` +
            `- **작업 ID**: \`${task.id}\`\n` +
            `- **전문가**: ${params.expert}\n` +
            `- **상태**: ${task.status}\n\n` +
            `결과 조회: \`background_expert_result(task_id="${task.id}")\``
    }]
  };
}

// 결과 조회
export const backgroundResultSchema = z.object({
  task_id: z.string().describe("조회할 작업 ID")
}).strict();

export const backgroundResultTool = {
  name: "background_expert_result",

  title: "백그라운드 작업 결과 조회",

  description: `백그라운드 작업의 결과를 조회합니다.

## 반환 상태
- pending: 대기 중
- running: 실행 중
- completed: 완료 (result 포함)
- failed: 실패 (error 포함)
- cancelled: 취소됨
- not_found: 작업 ID 없음`,

  inputSchema: backgroundResultSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function handleBackgroundResult(params: z.infer<typeof backgroundResultSchema>) {
  const result = getTaskResult(params.task_id);

  if (result.status === 'not_found') {
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 작업을 찾을 수 없음\n\n작업 ID \`${params.task_id}\`가 존재하지 않습니다.`
      }],
      isError: true
    };
  }

  if (result.status === 'completed') {
    return {
      content: [{
        type: "text" as const,
        text: `## ✅ 작업 완료\n\n${result.result}`
      }]
    };
  }

  if (result.status === 'failed') {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 작업 실패\n\n**오류**: ${result.error}`
      }],
      isError: true
    };
  }

  return {
    content: [{
      type: "text" as const,
      text: `## ⏳ 작업 진행 중\n\n` +
            `- **작업 ID**: \`${params.task_id}\`\n` +
            `- **상태**: ${result.status}\n\n` +
            `잠시 후 다시 조회해주세요.`
    }]
  };
}

// 작업 취소
export const backgroundCancelSchema = z.object({
  task_id: z.string().describe("취소할 작업 ID")
}).strict();

export const backgroundCancelTool = {
  name: "background_expert_cancel",
  title: "백그라운드 작업 취소",
  description: "진행 중인 백그라운드 작업을 취소합니다.",
  inputSchema: backgroundCancelSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function handleBackgroundCancel(params: z.infer<typeof backgroundCancelSchema>) {
  const success = cancelTask(params.task_id);

  return {
    content: [{
      type: "text" as const,
      text: success
        ? `## ✅ 작업 취소됨\n\n작업 ID \`${params.task_id}\`가 취소되었습니다.`
        : `## ⚠️ 취소 실패\n\n작업을 취소할 수 없습니다. (이미 완료되었거나 존재하지 않음)`
    }]
  };
}

// 작업 목록
export const backgroundListSchema = z.object({
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional()
    .describe("필터링할 상태")
}).strict();

export const backgroundListTool = {
  name: "background_expert_list",
  title: "백그라운드 작업 목록",
  description: "모든 백그라운드 작업 목록과 상태를 조회합니다.",
  inputSchema: backgroundListSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function handleBackgroundList(params: z.infer<typeof backgroundListSchema>) {
  const tasks = listTasks(params.status);
  const stats = getStats();

  if (tasks.length === 0) {
    return {
      content: [{
        type: "text" as const,
        text: `## 백그라운드 작업 목록\n\n작업이 없습니다.`
      }]
    };
  }

  const taskList = tasks.map(t =>
    `- \`${t.id}\`: **${t.expert}** - ${t.status}` +
    (t.status === 'completed' ? ' ✅' : '') +
    (t.status === 'failed' ? ' ❌' : '') +
    (t.status === 'running' ? ' 🔄' : '') +
    (t.status === 'pending' ? ' ⏳' : '')
  ).join('\n');

  return {
    content: [{
      type: "text" as const,
      text: `## 백그라운드 작업 목록\n\n` +
            `**통계**: ${stats.running} 실행 중, ${stats.pending} 대기 중, ` +
            `${stats.completed} 완료, ${stats.failed} 실패\n\n` +
            taskList
    }]
  };
}
