-- One row per call (rubric §8.5). Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS calls (
  call_id                text PRIMARY KEY,
  channel                text NOT NULL DEFAULT 'phone',
  started_at             timestamptz NOT NULL DEFAULT now(),
  caller_number          text,
  previous_call_id       text,
  duration_s             integer,
  is_after_hours         boolean,
  fields                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  criteria               jsonb,
  route                  text,
  close_reason           text,
  flags                  text[] NOT NULL DEFAULT '{}',
  ask_counts             jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary                text,
  next_question          text,
  agent_line             text,
  completion_date        date,
  site_available_date    date,
  volunteered_budget_inr numeric,
  outcome                text,
  end_reason             text,
  is_test                boolean NOT NULL DEFAULT false,
  designer_contacted_at  timestamptz,
  site_address           text,
  off_topic_count        integer NOT NULL DEFAULT 0,
  price_violation        boolean NOT NULL DEFAULT false,
  price_violation_lines  text[] NOT NULL DEFAULT '{}',
  offered_slots          jsonb,
  booking_status         text,          -- booked | failed | null
  booking_id             text,
  booking_type           text,          -- site_visit | studio
  booking_slot           timestamptz,
  booking_slot_spoken    text,
  telegram_sent          boolean NOT NULL DEFAULT false,
  urgent_alert_sent      boolean NOT NULL DEFAULT false,
  telegram_message_id    text,
  hubspot_id             text,          -- deal id ('pending' while being created)
  hubspot_contact_id     text,
  transcript             jsonb,
  transcript_url         text,
  recording_url          text,
  voice_minutes          numeric,
  llm_tokens             integer NOT NULL DEFAULT 0,
  cost_inr               numeric,
  call_ended_at          timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_caller_number_idx ON calls (caller_number);
CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);
CREATE INDEX IF NOT EXISTS calls_pending_delivery_idx ON calls (telegram_sent, updated_at) WHERE telegram_sent = false;
