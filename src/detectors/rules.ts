import type { Rule } from "../types.js";

export const SECRET_RULES: Rule[] = [
  {
    id: "aws_access_key_id",
    name: "AWS Access Key ID",
    pattern:
      /\b(AKIA|ABIA|ACCA|AGPA|AIDA|AIPA|ANPA|ANVA|AROA|APKA|ASCA|ASIA)[0-9A-Z]{16}\b/g,
    severity: "critical",
    confidence: 0.95,
    explanation:
      "AWS access key identifier. Grants programmatic access to AWS resources and should not appear in prompts.",
  },
  {
    id: "github_pat_classic",
    name: "GitHub Personal Access Token (classic)",
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    severity: "critical",
    confidence: 0.99,
    explanation:
      "GitHub classic personal access token. Grants repository and API access tied to the issuing user.",
  },
  {
    id: "github_pat_fine_grained",
    name: "GitHub Fine-grained Personal Access Token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
    severity: "critical",
    confidence: 0.99,
    explanation:
      "GitHub fine-grained personal access token. Grants scoped API access tied to the issuing user.",
  },
  {
    id: "github_oauth_token",
    name: "GitHub OAuth Access Token",
    pattern: /\bgho_[A-Za-z0-9]{36}\b/g,
    severity: "critical",
    confidence: 0.99,
    explanation:
      "GitHub OAuth access token. Grants user-level API access through an OAuth application.",
  },
  {
    id: "openai_api_key",
    name: "OpenAI API Key",
    pattern:
      /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b|\bsk-proj-[A-Za-z0-9_-]{74,}\b|\bsk-svcacct-[A-Za-z0-9_-]{40,}\b/g,
    severity: "critical",
    confidence: 0.95,
    explanation:
      "OpenAI API key. Authorizes access to an OpenAI account and incurs billing on use.",
  },
  {
    id: "anthropic_api_key",
    name: "Anthropic API Key",
    pattern: /\bsk-ant-api03-[A-Za-z0-9_-]{93}AA\b/g,
    severity: "critical",
    confidence: 0.99,
    explanation:
      "Anthropic API key. Authorizes access to an Anthropic account and incurs billing on use.",
  },
  {
    id: "stripe_live_secret_key",
    name: "Stripe Live Secret Key",
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{24,}\b/g,
    severity: "critical",
    confidence: 0.99,
    explanation:
      "Stripe live secret key. Authorizes charges and refunds against live customer accounts.",
  },
  {
    id: "stripe_test_secret_key",
    name: "Stripe Test Secret Key",
    pattern: /\b(?:sk|rk)_test_[A-Za-z0-9]{24,}\b/g,
    severity: "high",
    confidence: 0.99,
    explanation:
      "Stripe test secret key. Sandbox use only, but should still be kept private.",
  },
  {
    id: "slack_bot_token",
    name: "Slack Bot Token",
    pattern: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24}\b/g,
    severity: "high",
    confidence: 0.95,
    explanation:
      "Slack bot token. Grants access to a Slack workspace as a bot identity.",
  },
  {
    id: "slack_user_token",
    name: "Slack User Token",
    pattern: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{32}\b/g,
    severity: "high",
    confidence: 0.95,
    explanation:
      "Slack user token. Grants access to a Slack workspace as a specific user.",
  },
  {
    id: "google_api_key",
    name: "Google API Key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: "high",
    confidence: 0.9,
    explanation:
      "Google API key. Used for Google Cloud and Google Workspace APIs.",
  },
  {
    id: "pem_private_key",
    name: "PEM-encoded Private Key",
    pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/g,
    severity: "critical",
    confidence: 0.99,
    explanation:
      "Private key in PEM format. Private keys must never be shared or transmitted.",
  },
];
