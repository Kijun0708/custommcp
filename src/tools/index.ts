// src/tools/index.ts

export { consultExpertTool, consultExpertSchema, handleConsultExpert } from './consult-expert.js';
export { categoryTaskTool, categoryTaskSchema, handleCategoryTask } from './category-task.js';
export {
  backgroundStartTool, backgroundStartSchema, handleBackgroundStart,
  backgroundResultTool, backgroundResultSchema, handleBackgroundResult,
  backgroundCancelTool, backgroundCancelSchema, handleBackgroundCancel,
  backgroundListTool, backgroundListSchema, handleBackgroundList
} from './background-task.js';
export { designWorkflowTool, designWorkflowSchema, handleDesignWorkflow } from './design-workflow.js';
export { reviewCodeTool, reviewCodeSchema, handleReviewCode } from './review-workflow.js';
export { researchTopicTool, researchTopicSchema, handleResearchTopic } from './research-workflow.js';
export { healthCheckTool, healthCheckSchema, handleHealthCheck } from './health-check.js';
export { webSearchTool, webSearchSchema, handleWebSearch } from './web-search.js';
export {
  libraryDocsTool, libraryDocsSchema, handleLibraryDocs,
  searchLibrariesTool, searchLibrariesSchema, handleSearchLibraries
} from './library-docs.js';
export {
  authStatusTool, authStatusSchema, handleAuthStatus,
  authGptTool, authClaudeTool, authGeminiTool, authProviderSchema,
  handleAuthGpt, handleAuthClaude, handleAuthGemini
} from './auth-provider.js';
