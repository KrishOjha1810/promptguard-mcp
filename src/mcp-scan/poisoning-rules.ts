import type { Severity } from "../types.js";

export type PoisoningRule = {
  id: string;
  title: string;
  pattern: RegExp;
  severity: Severity;
  confidence: number;
  explanation: string;
  owasp: string[];
};

// Patterns that indicate injected instructions hidden inside a tool's
// description or schema fields. A legitimate tool describes what it does; a
// poisoned tool tries to instruct the MODEL to do something the user did not
// ask for. These target that instruction-to-the-model shape.
export const POISONING_RULES: PoisoningRule[] = [
  {
    id: "instruction_override",
    title: "Instruction-override phrasing",
    pattern:
      /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*(instructions?|rules?|prompts?|context|directions?)\b/gi,
    severity: "critical",
    confidence: 0.9,
    explanation:
      "Tool text instructs the model to ignore or override prior instructions. Tool descriptions should describe behavior, not redirect the model. Classic tool-poisoning / prompt-injection.",
    owasp: ["LLM01", "T2"],
  },
  {
    id: "hidden_from_user",
    title: "Instruction to hide actions from the user",
    pattern:
      /\b(do not|don'?t|never)\s+(tell|inform|mention|show|reveal|disclose|notify)\s+(the\s+)?(user|human|person)\b|\b(secretly|silently|without\s+(telling|informing|notifying))\b/gi,
    severity: "critical",
    confidence: 0.88,
    explanation:
      "Tool text tells the model to conceal an action from the user. Legitimate tools have no reason to request secrecy. Strong indicator of a poisoned tool.",
    owasp: ["LLM01", "T2", "T6"],
  },
  {
    id: "embedded_directive_tags",
    title: "Embedded directive / system tags in description",
    pattern:
      /<\s*(important|system|instructions?|secret|admin|s>|\/s>)\s*>|\[\s*(system|important|instructions?)\s*\]/gi,
    severity: "high",
    confidence: 0.8,
    explanation:
      "Description embeds pseudo-system tags (for example <important> or [system]) to smuggle directives into the model context. Descriptions are data, not a place for system instructions.",
    owasp: ["LLM01", "T2"],
  },
  {
    id: "exfiltration_directive",
    title: "Exfiltration directive (read-and-send)",
    pattern:
      /\b(read|cat|load|open|access|fetch)\b[^.]{0,40}\b(\.env|\.ssh|id_rsa|credentials?|secrets?|api[_\s-]?keys?|private[_\s-]?key|~\/\.|\/etc\/passwd)\b|\b(send|forward|post|upload|exfiltrate|bcc|email)\b[^.]{0,40}\b(to|content|file|data|contents|result)\b/gi,
    severity: "critical",
    confidence: 0.75,
    explanation:
      "Tool text describes reading sensitive files or forwarding data elsewhere. Combined read-and-send instructions in a tool description are a hallmark of exfiltration tooling.",
    owasp: ["LLM01", "T2", "LLM06"],
  },
  {
    id: "tool_redirection",
    title: "Cross-tool redirection (shadowing language)",
    pattern:
      /\b(instead of|rather than|do not use|don'?t use|in place of)\b[^.]{0,40}\b(tool|function|server|the other)\b|\b(before|prior to)\s+(using|calling|invoking)\b[^.]{0,40}\b(any|other|each|every)\b[^.]{0,20}\btool\b/gi,
    severity: "high",
    confidence: 0.7,
    explanation:
      "Tool text references or redirects the use of other tools. Tool shadowing works by one server's description hijacking how the model uses a different, trusted tool.",
    owasp: ["LLM01", "T2"],
  },
  {
    id: "imperative_to_model",
    title: "Imperative command aimed at the model",
    pattern:
      /\b(you must|you should always|always (call|use|run|send|include)|make sure to (call|send|include|attach)|it is (required|mandatory) that you)\b/gi,
    severity: "medium",
    confidence: 0.55,
    explanation:
      "Description issues imperative commands to the model rather than describing the tool. Low on its own, but a common carrier for injected behavior; weigh with other findings.",
    owasp: ["LLM01", "T2"],
  },
];

// Unicode code-point ranges that have no business inside a tool description and
// are used to hide instructions from human reviewers while the model still
// reads them.
type UnicodeClass = {
  id: string;
  title: string;
  test: (codePoint: number) => boolean;
  severity: Severity;
  explanation: string;
};

export const UNICODE_CLASSES: UnicodeClass[] = [
  {
    id: "zero_width",
    title: "Zero-width / invisible characters",
    test: (c) =>
      c === 0x200b ||
      c === 0x200c ||
      c === 0x200d ||
      c === 0x2060 ||
      c === 0xfeff,
    severity: "high",
    explanation:
      "Zero-width or invisible characters in the text. Used to hide content from human reviewers while the model still reads it.",
  },
  {
    id: "bidi_override",
    title: "Bidirectional override characters",
    test: (c) =>
      (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069),
    severity: "high",
    explanation:
      "Bidirectional override characters can reorder how text is displayed versus how it is read, hiding malicious content from reviewers (Trojan Source style).",
  },
  {
    id: "tag_chars",
    title: "Unicode tag characters",
    test: (c) => c >= 0xe0000 && c <= 0xe007f,
    severity: "critical",
    explanation:
      "Unicode tag characters are invisible and can encode hidden instructions that models interpret. There is no legitimate reason for these in a tool description.",
  },
];
