export interface PromptTemplate<T> {
  id: string;
  version: string;
  system: string;
  userTemplate: (args: T) => string;
}

export function createPrompt<T>(
  id: string,
  version: string,
  system: string,
  userTemplate: (args: T) => string,
): PromptTemplate<T> {
  return { id, version, system, userTemplate };
}

/**
 * Untrusted content framing helper (ARCH §12 prompt-injection defense)
 * Wraps external content (reviews, scraped KB sources, user free text)
 * in delimited untrusted-content frames.
 */
export function frameUntrustedContent(content: string): string {
  // We use XML-like delimiters to frame untrusted content and tell the model to
  // treat everything inside as data, not instructions.
  return `\n<UNTRUSTED_CONTENT>\n${content}\n</UNTRUSTED_CONTENT>\n`;
}

// Example prompts (we will add more as we implement agents)
export const parsePrompt = createPrompt<{ input: string }>(
  "profiler_parse",
  "v1.0",
  "You are an expert travel profiler for trips to India. Your job is to extract a TravellerProfile from the user's natural language input. Output valid JSON matching the provided schema. Assign a confidence score (0.0 to 1.0) to fields. Leave fields empty if not mentioned.",
  ({ input }) =>
    `Parse the following user request into a TravellerProfile:${frameUntrustedContent(input)}`,
);

export const parseEditIntentPrompt = createPrompt<{ input: string }>(
  "edit_intent_parse",
  "v1.0",
  "You are an expert travel assistant. The user wants to modify their existing trip plan. Extract the intent of their edit. Possible intents include lightening the schedule, swapping stops, adding constraints, extending the trip, regenerating a specific scope, or a custom modification. If ambiguous, provide a clarifying question.",
  ({ input }) =>
    `Parse the following user edit request into a PatchIntent:${frameUntrustedContent(input)}`,
);

export const parseProfileLearningPrompt = createPrompt<{ input: string }>(
  "profile_learning_parse",
  "v1.0",
  "You are an expert travel profiler for trips to India. A user has made an edit to their itinerary. Based on this edit, identify any persistent preferences or constraints that should be learned for this traveller profile (e.g., 'no stairs', 'prefers slow pace'). Return only changes to apply.",
  ({ input }) =>
    `Analyze the following user edit request and extract a TravellerProfile delta:${frameUntrustedContent(input)}`,
);
