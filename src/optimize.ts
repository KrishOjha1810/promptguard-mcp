import { countTokens } from "./cost.js";

export type OptimizationType =
  | "filler_removal"
  | "verbose_phrase"
  | "hedging"
  | "redundancy";

export type StructuralIssueType =
  | "missing_task_verb"
  | "missing_output_format";

export type Optimization = {
  type: OptimizationType;
  description: string;
  before: string;
  after: string;
};

export type StructuralIssue = {
  type: StructuralIssueType;
  description: string;
  suggestion: string;
};

export type OptimizeResult = {
  shouldSuggest: boolean;
  originalText: string;
  optimizedText: string;
  optimizations: Optimization[];
  structuralIssues: StructuralIssue[];
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  percentSaved: number;
  reason?: string;
};

type Substitution = {
  pattern: RegExp;
  replacement: string;
  category: OptimizationType;
  description: string;
};

const SUBSTITUTIONS: Substitution[] = [
  // Filler removal: politeness and verbose request openers
  {
    pattern: /\b(could|can|would|will) you (please |kindly )?/gi,
    replacement: "",
    category: "filler_removal",
    description: "removed soft request opener",
  },
  {
    pattern: /\bplease\b ?/gi,
    replacement: "",
    category: "filler_removal",
    description: "removed 'please'",
  },
  {
    pattern: /\bI (would like|want|need) (you )?to /gi,
    replacement: "",
    category: "filler_removal",
    description: "removed verbose request opener",
  },
  {
    pattern: /\bif (it'?s )?(possible|you can|you'?d like|you don'?t mind),?\s*/gi,
    replacement: "",
    category: "hedging",
    description: "removed hedge",
  },
  {
    pattern: /\bthank(s| you)( in advance)?[!.]?\s*$/gi,
    replacement: "",
    category: "filler_removal",
    description: "removed trailing thanks",
  },

  // Verbose phrases tightened
  {
    pattern: /\bin order to\b/gi,
    replacement: "to",
    category: "verbose_phrase",
    description: "tightened 'in order to' to 'to'",
  },
  {
    pattern: /\bdue to the fact that\b/gi,
    replacement: "because",
    category: "verbose_phrase",
    description: "tightened 'due to the fact that' to 'because'",
  },
  {
    pattern: /\bat this point in time\b/gi,
    replacement: "now",
    category: "verbose_phrase",
    description: "tightened 'at this point in time' to 'now'",
  },
  {
    pattern: /\bfor the purpose of\b/gi,
    replacement: "to",
    category: "verbose_phrase",
    description: "tightened 'for the purpose of' to 'to'",
  },
  {
    pattern: /\bin the event that\b/gi,
    replacement: "if",
    category: "verbose_phrase",
    description: "tightened 'in the event that' to 'if'",
  },
  {
    pattern: /\bwith regards? to\b/gi,
    replacement: "about",
    category: "verbose_phrase",
    description: "tightened 'with regard(s) to' to 'about'",
  },
  {
    pattern: /\ba (large|huge|massive|significant) number of\b/gi,
    replacement: "many",
    category: "verbose_phrase",
    description: "tightened to 'many'",
  },

  // Hedging
  {
    pattern: /\bI'?m not sure if this is (right|correct),?\s*but,?\s*/gi,
    replacement: "",
    category: "hedging",
    description: "removed uncertainty hedge",
  },
  {
    pattern:
      /\bthis (might|may) be a (silly|dumb|basic|stupid) question,?\s*but,?\s*/gi,
    replacement: "",
    category: "hedging",
    description: "removed self-deprecating hedge",
  },
];

const TASK_VERBS = new Set([
  "write",
  "create",
  "generate",
  "explain",
  "describe",
  "analyze",
  "compare",
  "summarize",
  "translate",
  "list",
  "show",
  "build",
  "design",
  "fix",
  "debug",
  "review",
  "find",
  "count",
  "extract",
  "convert",
  "refactor",
  "rewrite",
  "draft",
  "improve",
  "optimize",
  "evaluate",
  "rank",
  "classify",
  "calculate",
  "compute",
  "implement",
  "deploy",
]);

function findStructuralIssues(text: string): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) return issues;

  const firstWord = trimmed.match(/^\w+/)?.[0]?.toLowerCase() ?? "";
  if (firstWord && !TASK_VERBS.has(firstWord)) {
    if (
      /^(can|could|would|will|is|do|are|i)\b/i.test(trimmed) &&
      trimmed.length > 30
    ) {
      issues.push({
        type: "missing_task_verb",
        description: "Prompt does not start with a direct task verb.",
        suggestion:
          "Consider starting with an imperative such as Write, Explain, Generate, or Analyze so the model knows exactly what action to take.",
      });
    }
  }

  if (
    trimmed.length > 120 &&
    !/(format|json|list|bullet|table|paragraph|markdown|csv|yaml|xml)/i.test(
      trimmed,
    )
  ) {
    issues.push({
      type: "missing_output_format",
      description: "No output format is specified.",
      suggestion:
        "Specify the desired output shape, for example 'respond as a bulleted list', 'in JSON', or 'in markdown', to reduce iteration.",
    });
  }

  return issues;
}

function cleanupSpacing(text: string, original: string): string {
  let result = text;
  result = result.replace(/ {2,}/g, " ");
  result = result.replace(/\s+([.,!?;:])/g, "$1");
  result = result.replace(/[ \t]+\n/g, "\n");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.trim();

  const origFirst = original.trim()[0];
  const resultFirst = result[0];
  if (
    origFirst &&
    resultFirst &&
    /[A-Z]/.test(origFirst) &&
    /[a-z]/.test(resultFirst)
  ) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

export function optimizePrompt(text: string): OptimizeResult {
  const originalTokens = countTokens(text);

  if (originalTokens < 10) {
    return {
      shouldSuggest: false,
      originalText: text,
      optimizedText: text,
      optimizations: [],
      structuralIssues: [],
      originalTokens,
      optimizedTokens: originalTokens,
      tokensSaved: 0,
      percentSaved: 0,
      reason: "Prompt is too short to meaningfully optimize.",
    };
  }

  const optimizations: Optimization[] = [];
  let optimized = text;

  for (const sub of SUBSTITUTIONS) {
    optimized = optimized.replace(sub.pattern, (matched) => {
      optimizations.push({
        type: sub.category,
        description: sub.description,
        before: matched,
        after: sub.replacement,
      });
      return sub.replacement;
    });
  }

  optimized = cleanupSpacing(optimized, text);

  const structuralIssues = findStructuralIssues(text);

  const optimizedTokens = countTokens(optimized);
  const tokensSaved = originalTokens - optimizedTokens;
  const percentSaved =
    originalTokens === 0
      ? 0
      : Math.round((tokensSaved / originalTokens) * 10000) / 100;

  const meaningfulCompression = tokensSaved >= 5 && percentSaved >= 10;
  const shouldSuggest =
    meaningfulCompression ||
    structuralIssues.length > 0 ||
    optimizations.length >= 3;

  return {
    shouldSuggest,
    originalText: text,
    optimizedText: optimized,
    optimizations,
    structuralIssues,
    originalTokens,
    optimizedTokens,
    tokensSaved,
    percentSaved,
    reason: shouldSuggest
      ? undefined
      : "Prompt is already concise and well-structured; no meaningful optimization available.",
  };
}
