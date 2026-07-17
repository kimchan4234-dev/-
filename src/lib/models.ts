export type ClaudeTier = "Opus" | "Sonnet" | "Haiku";

export interface ClaudeModel {
  /** UI에서 선택한 모델 id (DB 저장, UI 표시용) */
  id: string;
  /** Human friendly display name */
  label: string;
  /** Product family */
  tier: ClaudeTier;
  /** Short Korean description */
  description: string;
  /**
   * 백엔드에서 실제로 호출할 "성능이 가장 비슷한" 모델 id.
   * 무료 AI 게이트웨이를 통할 때는 이 값을 사용해 실제 모델을 부르고,
   * Anthropic 직접 키가 있을 때는 위 id를 그대로 쓴다.
   */
  backendFreeModelId: string;
  /** 이 모델이 추론(reasoning)을 기본으로 사용하는가 */
  reasoning: boolean;
  /** 이 모델이 에이전트 도구(tool calling)를 사용하는가 */
  tools: boolean;
}

// Models requested by the user, ordered from the most powerful down to the
// lightest. The backend will call whatever id is selected — if a particular
// id is not yet available on the account, the API surfaces an error that is
// shown to the user.
export const MODELS: ClaudeModel[] = [
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    tier: "Opus",
    description: "최고 성능 모델. 고난도 코딩 및 논리적 추론에 최적화.",
    backendFreeModelId: "gpt-5.6-sol",
    reasoning: true,
    tools: true,
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    tier: "Opus",
    description: "고성능 플래그십 모델. 복잡한 분석 작업 지원.",
    backendFreeModelId: "claude-opus-4-7",
    reasoning: true,
    tools: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    tier: "Opus",
    description: "고정밀 논리 모델. 학술 및 데이터 분석 적합.",
    backendFreeModelId: "claude-opus-4-6",
    reasoning: true,
    tools: true,
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    tier: "Sonnet",
    description: "최신 범용 모델. 속도와 지능의 완벽한 조화.",
    backendFreeModelId: "claude-sonnet-5",
    reasoning: true,
    tools: true,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    tier: "Sonnet",
    description: "다목적 고성능 모델. 일상적 대화와 작업에 최적.",
    backendFreeModelId: "claude-large",
    reasoning: true,
    tools: true,
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    tier: "Sonnet",
    description: "효율적인 중급 모델. 빠른 피드백과 정확도.",
    backendFreeModelId: "gpt-5.4",
    reasoning: false,
    tools: true,
  },
  {
    id: "claude-3-5-haiku-latest",
    label: "Claude Haiku 3.5",
    tier: "Haiku",
    description: "초고속 응답 모델. 가벼운 질문과 실시간 응대용.",
    backendFreeModelId: "claude-fast",
    reasoning: false,
    tools: false,
  },
];

export const DEFAULT_MODEL_ID = "claude-opus-4-8";

export function getModel(id: string): ClaudeModel {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export const TIER_STYLES: Record<ClaudeTier, string> = {
  Opus: "bg-orange-100 text-orange-700 ring-orange-200",
  Sonnet: "bg-sky-100 text-sky-700 ring-sky-200",
  Haiku: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};
