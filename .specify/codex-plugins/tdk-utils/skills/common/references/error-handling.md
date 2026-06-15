# Error Handling Protocol

## On Script Error

**MUST:**
1. STOP immediately
2. Report exact error message
3. Wait for user decision

**MUST NOT:**
- Try alternative approaches
- Auto-fix without approval
- Continue with partial results

## Error Format

```
[ERROR] {error_type}
Message: {exact_message}
Context: {what_was_attempted}
Action Required: {what_user_should_do}
```

## Recovery

Only proceed when user explicitly approves.
