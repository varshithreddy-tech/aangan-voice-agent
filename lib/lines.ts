// Exact lines from the rubric. The voice prompt and the tests both read from here.

export const PRICE_LINE =
  "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.";

export const CONFIRM_LINE = "Let me have someone from the team confirm that for you.";

export const OFF_TOPIC_LINE =
  "I'm only able to help with interior design enquiries for Aangan Studio. Do you have any enquiries related to interior design?";

export const OFF_TOPIC_GOODBYE =
  "I'll let you go for now — feel free to call back whenever you'd like to talk about a project. Thank you for calling Aangan Studio.";

export const LANGUAGE_LINE =
  "I'm sorry, I can only help in English right now — I'll have someone from the team call you back.";

export const CALLBACK_15MIN = "Someone senior will call you back within 15 minutes.";
export const CALLBACK_MORNING = "Someone senior will call you first thing tomorrow morning.";

export const TIMELINE_TIGHT_LINE = "Your designer will go through the timeline with you in detail at the consultation.";

export const BOOKING_FAILED_LINE = "Your designer will call you to fix a time that works.";

export const NOT_BOOKING_LINE =
  "No problem at all — I'll have your designer give you a call so you have everything you need.";

export const QUALIFY_FILLER = "One moment while I check that for you.";
export const QUALIFY_TIMEOUT_LINE = "Let me have someone from the team call you back to set this up.";

/** Fallback next questions, in the §7.3 row-6 order. */
export const NEXT_QUESTIONS = {
  c1: "What would you like done: the full home, or specific rooms?",
  c2: "Which area is the property in?",
  completion: "What date would you need it complete by?",
  site: "Is the site available now, or when do you get possession?",
} as const;
