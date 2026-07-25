# Code Generation Rules

## HARD REQUIREMENTS

### 1. NO MOCK DATA
- ❌ NEVER use inline mock data or JSON files
- ✅ ALWAYS fetch data from D1 database via API
- ✅ Use Drizzle ORM for all database queries
- ✅ Use seed.sql for initial data

### 2. FULL CODE - NO SHORTCUTS
- ❌ NEVER use comments like `// ... rest of code` or `// existing code`
- ✅ ALWAYS write complete, functional code
- ✅ Include all imports, types, and implementations
- ✅ Copy existing code verbatim when editing

### 3. OPENAPI 3.1.0 STANDARDS
- ✅ All API routes documented in OpenAPI spec
- ✅ Use Zod for request/response validation
- ✅ Include examples in schema definitions
- ✅ Tag routes by feature (Auth, Dashboard, AI, etc.)

### 4. CLOUDFLARE ECOSYSTEM
- ✅ Route ALL AI requests through AI Gateway
- ✅ Use Workers AI binding (`env.AI`)
- ✅ Use D1 binding (`env.DB`)
- ✅ Use Hono framework for API routes
- ✅ Use Astro SSR for frontend

### 5. SHADCN UI DARK THEME
- ✅ Use Shadcn UI components exclusively
- ✅ Dark theme by default (no light theme toggle unless in settings)
- ✅ Lucide React icons only
- ✅ Tailwind CSS for custom styling

## CODE STYLE

### TypeScript
- Use strict mode
- Explicit return types for functions
- No `any` types
- Use `type` over `interface` for simple objects
- Use `interface` for extensible objects

### React Components
```typescript
// Good
export function ComponentName({ prop1, prop2 }: ComponentProps) {
  const [state, setState] = useState<Type>(initialValue);

  useEffect(() => {
    // Effect logic
  }, [dependencies]);

  return (
    <div className="tailwind-classes">
      {/* Content */}
    </div>
  );
}

// Bad
export const ComponentName = (props: any) => {
  // Missing types, using `any`
}
```

### API Routes (Hono)
```typescript
// Good
router.get('/endpoint', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const data = await db.select().from(table);
    return c.json({ data });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'Message' }, 500);
  }
});

// Bad
router.get('/endpoint', (c) => {
  return c.json({ data: mockData }); // NO MOCK DATA!
});
```

### Database Queries
```typescript
// Good - Use Drizzle ORM
const db = drizzle(c.env.DB);
const users = await db.select().from(users).where(eq(users.id, userId));

// Bad - Never use raw SQL strings
const users = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();
```

## CLOUDFLARE WORKERS AI

### Model Selection
- **Chat**: `@cf/meta/llama-3.2-3b-instruct`
- **Speech-to-Text**: `@cf/openai/whisper`
- **Text-to-Speech**: `@cf/deepgram/aura-1`
- **Embeddings**: `@cf/baai/bge-base-en-v1.5`

### AI Gateway Integration
```typescript
// Always route through AI Gateway
const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;
const gatewayId = 'your-gateway-id';

const response = await fetch(
  `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/${model}`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.AI_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }
);
```

## COMPONENT PATTERNS

### Authentication
```typescript
// Store token in localStorage
localStorage.setItem('token', token);

// Include in API requests
const response = await fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  }
});
```

### Error Handling
```typescript
// Always handle errors gracefully
try {
  const response = await fetch('/api/endpoint');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
} catch (error) {
  console.error('Failed to fetch:', error);
  // Show user-friendly error message
  toast.error('Failed to load data. Please try again.');
  return null;
}
```

### Loading States
```typescript
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  fetchData()
    .then(data => setData(data))
    .finally(() => setIsLoading(false));
}, []);

if (isLoading) {
  return <Skeleton className="h-32 w-full" />;
}
```

## ACCESSIBILITY

- Use semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- Include `aria-label` on icon buttons
- Ensure keyboard navigation works
- Use Shadcn UI components (already accessible)

## PERFORMANCE

- Lazy load components with `client:load` directive in Astro
- Debounce search inputs
- Paginate long lists
- Cache API responses when appropriate
- Use React.memo for expensive components

## SECURITY

- ✅ Validate all inputs with Zod
- ✅ Sanitize user content before rendering
- ✅ Use parameterized queries (Drizzle handles this)
- ✅ Never expose API keys in frontend code
- ✅ Use HTTPS only in production
- ✅ Implement rate limiting on API routes

## TESTING

- Test all API endpoints with curl/Postman
- Verify database migrations apply cleanly
- Check error handling (invalid inputs, network failures)
- Test authentication flow (login, logout, expired sessions)
- Verify AI integrations work end-to-end

## DOCUMENTATION

- Add JSDoc comments to complex functions
- Document API routes in OpenAPI spec
- Include usage examples in README
- Keep this implementation plan updated

## DEPLOYMENT CHECKLIST

- [ ] All dependencies installed
- [ ] Database migrations applied
- [ ] Seed data loaded
- [ ] Environment variables configured
- [ ] Build succeeds without errors
- [ ] No TypeScript errors
- [ ] Linting passes
- [ ] OpenAPI docs accessible
- [ ] Health endpoint shows all services healthy
- [ ] Authentication flow works
- [ ] AI features functional

## ANTI-PATTERNS TO AVOID

❌ Using `any` types
❌ Mock data in components
❌ Raw SQL queries
❌ Hardcoded API keys
❌ Missing error handling
❌ No loading states
❌ Skipping validation
❌ Inline styles instead of Tailwind classes
❌ Direct AI binding calls (without AI Gateway)
❌ Missing TypeScript types

## WHEN IN DOUBT

1. Consult Cloudflare documentation
2. Check Shadcn UI component library
3. Review existing code patterns in the repo
4. Ask for clarification before implementing
5. Prefer simplicity over complexity

---

**Remember**: Quality over speed. Take time to implement features correctly the first time.
