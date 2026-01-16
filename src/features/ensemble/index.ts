// src/features/ensemble/index.ts

/**
 * Multi-Model Ensemble Module
 *
 * 여러 LLM을 조합하여 더 나은 결과를 얻는 앙상블 시스템
 */

export {
  EnsembleStrategy,
  AggregationMethod,
  EnsembleParticipant,
  EnsembleConfig,
  ParticipantResponse,
  VoteResult,
  DebateRound,
  EnsembleResult,
  EnsemblePreset,
  DEFAULT_PRESETS,
  EXPERT_PROVIDERS
} from './types.js';

export {
  runEnsemble,
  runPresetEnsemble
} from './manager.js';
