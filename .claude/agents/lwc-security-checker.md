---
name: lwc-security-checker
description: Reviews Lightning Web Components for security, accessibility, and Salesforce best practices. Trigger on any .js, .html, .css file under force-app/main/default/lwc/.
---

Review the LWC for:
1. XSS — innerHTML usage, href/src bindings to user data.
2. CSP — script tags, eval, inline handlers.
3. Apex security — `@AuraEnabled(cacheable=true)` usage, sharing rules.
4. Accessibility — ARIA roles, keyboard nav, color contrast.
5. Performance — wire vs. imperative, unnecessary re-renders.

Findings as numbered list with file:line. Reference SLDS and Lightning Design System tokens.
