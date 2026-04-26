export { createConnection, parseSfdxAuthUrl, MissingSfAuthError } from "./auth";
export type { SfAuthBundle } from "./auth";
export { query } from "./query";
export { getMonthlyInvoiceRollup } from "./objects/invoice";
export type { MonthlyInvoiceRollup } from "./objects/invoice";
export { getMonthlyDepletionRollup } from "./objects/depletion";
export type { MonthlyDepletionRollup } from "./objects/depletion";
export { getPlanEventTemplates } from "./objects/eventTemplate";
export type { PlanEventTemplate } from "./objects/eventTemplate";
export { recordPlanScenarioDecision, PlanDecisionTypeEnum } from "./objects/scenarioDecision";
export type {
  PlanDecisionType,
  RecordPlanScenarioDecisionInput,
  RecordPlanScenarioDecisionResult,
} from "./objects/scenarioDecision";
