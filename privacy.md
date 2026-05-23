# PromptGuard Privacy Policy

> Last updated: 2026-05-24

PromptGuard does not collect, store, or transmit any personal information.

## What PromptGuard does

PromptGuard scans the text content of prompt input fields on supported AI chat sites (Claude.ai, ChatGPT.com, Gemini, Perplexity, You.com, and Mistral) for patterns that match known secrets and personally identifiable information. When it finds something, it shows a warning in your browser.

## What we collect

Nothing.

- **No servers.** There is no backend that receives data from PromptGuard. The extension makes zero network requests of its own.
- **No telemetry.** We do not track which sites you visit, which prompts you write, which findings appear, or how often you use the extension.
- **No analytics.** No third-party analytics SDKs are included.
- **No accounts.** There is nothing to sign up for, no account to create, no profile stored.
- **No persistent storage of prompt content.** The extension keeps an in-memory list of finding signatures you have explicitly marked as "ignore" during a session. This list lives only in the current browser tab and is discarded when the tab closes.

## What about the AI chat sites themselves

When you type into Claude.ai, ChatGPT.com, or any of the supported sites, that text is processed by their servers when you submit your prompt. That is between you and them, governed by their privacy policies. PromptGuard's job is to warn you about sensitive content **before** you submit, while the text is still in your browser.

## Open source verification

The full source code of PromptGuard is published under the MIT license at https://github.com/KrishOjha1810/promptguard-mcp. You can read the code yourself to verify every claim in this document. If you find anything that contradicts this policy, please open an issue.

## Permissions used by the extension

- `storage`: stores user preferences such as ignored finding signatures for the current session. No prompt content is ever stored.
- `activeTab`: when you click the PromptGuard toolbar icon, the popup reads the current prompt text from the active tab to compute cost and offer optimize / compress actions. This permission only activates on explicit user action.
- `host_permissions` for Claude.ai, ChatGPT, Gemini, Perplexity, You.com, Mistral, and chat.openai.com: the content script runs only on these specific domains.

## Contact

Issues and questions: https://github.com/KrishOjha1810/promptguard-mcp/issues
