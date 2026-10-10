// Shared types. Field names follow rubric §8.1 / §8.2.

export type Verdict = "pass" | "fail" | "unclear";

export type Route =
  | "qualified"
  | "ask_one_question"
  | "qualified_flag"
  | "close"
  | "escalate_urgent"
  | "escalate_normal";

export type CloseReason =
  | "area"
  | "advice_only"
  | "out_of_scope"
  | "timeline"
  | "timeline_possession"
  | "budget"
  | "multiple"
  | "off_topic";

export type AgentLine =
  | "timeline_tight"
  | "timeline_possession"
  | "callback_15min"
  | "callback_morning";

export type Flag =
  | "timeline_tight"
  | "start_far"
  | "decider_unclear"
  | "budget_unclear"
  | "still_unclear"
  | "frustrated"
  | "rule_gap"
  | "language"
  | "off_topic";

export type Outcome =
  | "booked"
  | "booked_flag"
  | "qualified_not_booked"
  | "closed"
  | "escalated"
  | "incomplete"
  | "dropped";

export interface Fields {
  name: string | null;
  space_type: "home" | "office" | "other" | null;
  scope: string | null;
  locality: string | null;
  completion_text: string | null;
  site_available_text: string | null;
  designed_area_sqft: number | null;
  flat_area_sqft: number | null;
  decision_maker: "self" | "authorised" | "someone_else" | null;
  volunteered_budget_inr: number | string | null;
  consultation_type: "site_visit" | "studio" | null;
  complaint: boolean;
  complaint_designer: string | null;
  complaint_project: string | null;
  language_issue: boolean;
  site_address?: string | null;
  source?: string | null;
  booking_declined?: boolean;
}

export const EMPTY_FIELDS: Fields = {
  name: null,
  space_type: null,
  scope: null,
  locality: null,
  completion_text: null,
  site_available_text: null,
  designed_area_sqft: null,
  flat_area_sqft: null,
  decision_maker: null,
  volunteered_budget_inr: null,
  consultation_type: null,
  complaint: false,
  complaint_designer: null,
  complaint_project: null,
  language_issue: false,
};

export interface QualifyRequest {
  call_id: string;
  caller_number: string;
  fields: Partial<Fields>;
  transcript_so_far: string;
  /** Tests only (§8.1). Ignored unless the request is a test request. */
  test_today?: string;
  /** Tests only: "HH:MM" IST, for the complaint callback cases. */
  test_time?: string;
  /** Tests only: overrides the ask_counts stored against the call. */
  test_ask_counts?: AskCounts;
}

export interface AskCounts {
  c1?: number;
  c2?: number;
  c3?: number;
}

export interface Criteria {
  c1: Verdict;
  c2: Verdict;
  c3: Verdict;
  c4: Verdict;
  c5: Verdict;
}

/** What goes back to Vaani (§8.2: only these four). */
export interface QualifyResponse {
  route: Route;
  next_question: string | null;
  close_reason: CloseReason | null;
  agent_line: AgentLine | null;
}

/** Full server-side result, stored in Neon and shown to tests. */
export interface QualifyResult extends QualifyResponse {
  criteria: Criteria;
  flags: Flag[];
  volunteered_budget_inr: number | null;
  summary: string;
  ask_counts: AskCounts;
  completion_date: string | null;
  site_available_date: string | null;
  llm_tokens: number;
  side_question: string | null;
}

export interface TranscriptTurn {
  role: "agent" | "caller";
  text: string;
}
