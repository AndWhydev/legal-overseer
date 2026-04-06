# UX Copy Clarity

Improve unclear interface text that makes products harder to understand and use.

## Assess Clarity Problems

Common issues to identify:
- **Jargon**: Technical terms users don't know
- **Ambiguity**: Text that could mean multiple things
- **Passive voice**: "An error was encountered" vs "We couldn't save your file"
- **Excessive length**: Paragraphs where a sentence would do
- **Assumptions**: Expecting knowledge users don't have
- **Missing context**: No explanation of why or what happens next
- **Tone mismatch**: Too casual for serious actions, too formal for simple ones

## Improvement Patterns

### Error Messages
- Explain what went wrong in plain language
- Suggest a specific fix
- Never blame the user
- Include error codes for support, not as the main message

**Before**: `Error 403: Access denied`
**After**: `You don't have permission to view this page. Ask your team admin for access.`

### Form Labels
- Use specific labels, not generic ones
- Include format examples where needed
- Explain why information is requested if not obvious

**Before**: `Phone` / **After**: `Phone number (we'll text your verification code)`

### Button Text
- Describe the action specifically using active voice
- Match the button to the outcome

**Before**: `Submit` / **After**: `Create account`
**Before**: `OK` / **After**: `Delete project`

### Help Text
- Add value — don't just repeat the label
- Keep to one sentence when possible

### Empty States
- Explain why it's empty
- Show what will appear here
- Clear CTA to create first item

### Success Messages
- Confirm what happened specifically
- Explain what comes next

### Loading States
- Set time expectations
- Explain what's happening

### Confirmation Dialogs
- State the specific action being confirmed
- Explain consequences clearly
- Make the destructive action obvious (not "OK/Cancel")

### Navigation Labels
- Use specific, descriptive labels
- Match user mental model, not internal terminology

## Core Principles

Be: specific, concise, active voice, human, helpful, consistent

Never: use unexplained jargon, blame users, be vague, use passive voice unnecessarily, write excessively, use humor for errors, assume technical knowledge, vary terminology for the same concept

## Verification

- Can a first-time user understand this immediately?
- Does the user know what to do next?
- Is it the shortest version that's still clear?
- Is terminology consistent across the interface?
- Is the tone appropriate for the moment?
