# Documentation Standards for Backend Code

## File-Level Documentation

Every `.ts` file in `src/backend/` MUST start with a JSDoc file-level comment:

````typescript
/**
 * @fileoverview Brief description of the module's purpose
 *
 * More detailed explanation of what this module does, its key features,
 * and how it fits into the overall system. Include:
 * - Primary responsibility
 * - Key dependencies or integrations
 * - Usage patterns or workflows
 *
 * @see {@link RelatedModule} for related functionality
 * @example
 * ```typescript
 * import { someFunction } from '@/backend/path/to/module';
 * const result = await someFunction(args);
 * ```
 */
````

## Function and Method Documentation

Every exported function, method, or class MUST have JSDoc comments including:

### Required Tags

- `@param` for each parameter (with type and description)
- `@returns` describing the return value
- `@throws` if the function can throw errors

### Optional but Encouraged Tags

- `@example` showing typical usage
- `@remarks` for implementation notes or gotchas
- `@see` linking to related functions
- `@deprecated` if the function should not be used

### Example

````typescript
/**
 * Performs constant-time string comparison to prevent timing attacks.
 * Both strings are hashed using SHA-256 before comparison to ensure
 * the comparison time is independent of string content.
 *
 * @param left - First string to compare
 * @param right - Second string to compare
 * @returns Promise resolving to true if strings are equal, false otherwise
 *
 * @remarks
 * This function is critical for secure credential validation. Never use
 * simple string equality (===) for comparing secrets, as it can leak
 * information through timing variations.
 *
 * @example
 * ```typescript
 * const apiKey = await readWorkerApiKey(env);
 * if (await safeEqual(userProvidedKey, apiKey)) {
 *   // Authorized
 * }
 * ```
 */
export async function safeEqual(left: string, right: string): Promise<boolean> {
  // implementation
}
````

## Code Comments Within Functions

- **Preserve existing comments** when modifying code unless they're outdated
- **Update comments** when the code they describe changes
- **Add comments** for complex logic, non-obvious algorithms, or workarounds
- Use `//` for inline comments and `/* */` for multi-line blocks within functions
- Document "why" not "what" — code shows what, comments explain why

### Good Inline Comments

```typescript
// Use constant-time comparison to prevent timing attacks
let mismatch = 0;
for (let i = 0; i < leftBytes.length; i++) {
  mismatch |= leftBytes[i] ^ rightBytes[i];
}
```

## Agent Responsibilities

When working on this codebase, you MUST:

1. **Add docstrings** to any new files or functions you create
2. **Update docstrings** when modifying existing functions
3. **Review docstrings** in files you touch and fix any that are outdated or incomplete
4. **Follow the exemplar** set in `src/backend/api/lib/auth.ts` for docstring quality and style

## Rationale

Comprehensive documentation:

- Helps future agents understand code context quickly
- Enables faster onboarding for human developers
- Reduces the need for exploratory reads during agentic turns
- Makes the codebase more maintainable and less prone to errors
