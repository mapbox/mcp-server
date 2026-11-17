## Description

<!-- Provide a clear explanation of what has been implemented or fixed. Mention any related context, requirements, or issues. -->

- Closes #[issue-number] (if applicable)

---

## Testing

<!-- Include logs, screenshots, terminal output, or any relevant proof of successful testing. -->

---

## Checklist

- [ ] Tests added or updated (`npm test` passes)
- [ ] Lint passes (`npm run lint`)
- [ ] `CHANGELOG.md` updated under `Unreleased`
- [ ] Documentation updated if needed (README, JSDoc)

---

## Security-sensitive change checklist

<!-- Only fill this in if this PR touches authentication, credentials, tokens, or session/connection state, AND an external user is involved. Otherwise, delete this section. -->

- [ ] Ran `/security-review` (note: by design it does not check for denial-of-service or resource-exhaustion issues — those need the next steps)
- [ ] Considered adversarial/misuse scenarios and checked the code against each (list them below)
- [ ] Added a regression test that fails against the pre-fix code for anything found this way
- [ ] Checked resource bounds: timeouts, cache eviction/max size, request/entry limits

**Scenarios considered:**

<!-- e.g. "what if this instance is shared across two concurrent sessions", "what if a client returns a value far larger than expected", "what if this token isn't verified the way we assume" -->

---

## Additional Notes

<!-- Include any further details, follow-up items, or decisions relevant to the reviewer. -->
