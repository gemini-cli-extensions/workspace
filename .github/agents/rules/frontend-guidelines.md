# Frontend Implementation Guidelines

## LAYOUT REQUIREMENTS

### Global Sidebar
**File**: `src/frontend/components/layout/Sidebar.tsx`

#### Header Section
- Display worker name (from config)
- AI-generated icon (use Lucide icon, e.g., `Sparkles`, `Zap`, `Bot`)
- Click header to navigate to `/`
- **NEVER include a team switcher or dropdown**

#### Toggle Button
- Icon: `lucide-react` `PanelLeft`
- Toggle sidebar visibility (expanded/collapsed)
- Persist state in localStorage
- Smooth transition animation

#### Navigation Items
```typescript
const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  {
    label: 'AI Assistant',
    icon: Bot,
    children: [
      { label: 'Threads', icon: MessageSquare, href: '/assistant/threads' },
      { label: 'Modal Demo', icon: MessageCircle, href: '/assistant/modal' },
      { label: 'Editor', icon: FileEdit, href: '/assistant/editor' }
    ]
  },
  { label: 'Documents', icon: FileText, href: '/documents' }
];
```

#### Footer Section
**NEVER include user profile or avatar**

Required links (icon only, no labels):
```typescript
const footerItems = [
  { icon: Settings, href: '/settings', label: 'Settings' },
  { icon: Code, href: '/swagger', label: 'Swagger API' },
  { icon: Terminal, href: '/scalar', label: 'Scalar Docs' },
  { icon: Activity, href: '/health', label: 'System Health' },
  { icon: Book, href: '/docs', label: 'Documentation' }
];
```

### Top Navigation Header
**File**: `src/frontend/components/layout/TopNav.tsx`

#### Restrictions
- **NO search bar**
- **NO user profile**
- **NO user avatar**
- **NO breadcrumbs** (optional, but not required)

#### Required Components (Right-aligned)
1. **Settings Cog Icon**
   - Icon: `Settings` from lucide-react
   - Link to `/settings`
   - No label, icon only

2. **Alert Bell with Badge**
   - Icon: `Bell` from lucide-react
   - Fetch unread count: `GET /api/notifications?unreadOnly=true`
   - Display badge with count if > 0
   - Click to open notifications dropdown (optional) or link to notifications page

   ```typescript
   const [unreadCount, setUnreadCount] = useState(0);

   useEffect(() => {
     fetch('/api/notifications?unreadOnly=true', {
       headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
     })
       .then(r => r.json())
       .then(data => setUnreadCount(data.unreadCount));
   }, []);

   <div className="relative">
     <Bell className="w-5 h-5" />
     {unreadCount > 0 && (
       <Badge className="absolute -top-2 -right-2">
         {unreadCount}
       </Badge>
     )}
   </div>
   ```

3. **Health Badge**
   - Fetch status: `GET /api/health`
   - Display badge: "Healthy" (green) or "Degraded" (yellow/orange)
   - Icon: `Activity` from lucide-react
   - Click routes to `/health`

   ```typescript
   const [healthStatus, setHealthStatus] = useState('healthy');

   useEffect(() => {
     fetch('/api/health')
       .then(r => r.json())
       .then(data => setHealthStatus(data.status));
   }, []);

   <a href="/health">
     <Badge variant={healthStatus === 'healthy' ? 'success' : 'warning'}>
       <Activity className="w-4 h-4 mr-1" />
       {healthStatus}
     </Badge>
   </a>
   ```

## ASSISTANT-UI INTEGRATION

### Thread View Requirements
**File**: `src/frontend/components/assistant/ThreadView.tsx`

#### Must Include
1. **Message Display**
   - User messages (right-aligned, distinct color)
   - Assistant messages (left-aligned)
   - System messages (centered, muted)
   - Timestamp on each message

2. **Chat Input**
   - Multi-line textarea
   - Auto-resize as user types
   - Send button
   - Keyboard shortcut (Cmd+Enter or Ctrl+Enter)

3. **Attachments**
   - File upload button (`Paperclip` icon)
   - Support images (PNG, JPG, WebP)
   - Support PDFs
   - Display attachment thumbnails

4. **Model Selector**
   - Dropdown to select AI model
   - Default: `@cf/meta/llama-3.2-3b-instruct`
   - Options:
     - Llama 3.2 3B
     - Llama 3.1 8B
     - Qwen 2.5 7B

5. **Suggestions**
   - Display 3-5 auto-suggestions based on context
   - Click to auto-fill input
   - Examples:
     - "Tell me more about..."
     - "Summarize the conversation"
     - "What are the key takeaways?"

6. **Chain of Thought (Reasoning)**
   - If AI model supports reasoning, display in expandable section
   - Show thinking process before final answer
   - Muted/secondary text

7. **Tools**
   - Display when AI uses tools/functions
   - Show tool name and parameters
   - Show tool execution result

8. **CRITICAL: Speech-to-Text (STT)**
   ```typescript
   const handleSpeechToText = async () => {
     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
     const mediaRecorder = new MediaRecorder(stream);
     const audioChunks: Blob[] = [];

     mediaRecorder.addEventListener('dataavailable', event => {
       audioChunks.push(event.data);
     });

     mediaRecorder.addEventListener('stop', async () => {
       const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
       const reader = new FileReader();

       reader.readAsDataURL(audioBlob);
       reader.onloadend = async () => {
         const base64Audio = reader.result.toString().split(',')[1];

         const response = await fetch('/api/ai/speech-to-text', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${localStorage.getItem('token')}`
           },
           body: JSON.stringify({ audio: base64Audio })
         });

         const data = await response.json();
         setInputValue(data.text); // Insert transcribed text
       };
     });

     mediaRecorder.start();
     setTimeout(() => mediaRecorder.stop(), 5000); // 5 second recording
   };

   <button onClick={handleSpeechToText}>
     <Mic className={isRecording ? 'text-red-500' : ''} />
   </button>
   ```

9. **CRITICAL: Text-to-Speech (TTS)**
   ```typescript
   const handleTextToSpeech = async (text: string) => {
     const response = await fetch('/api/ai/text-to-speech', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${localStorage.getItem('token')}`
       },
       body: JSON.stringify({ text })
     });

     const data = await response.json();
     const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
     audio.play();
   };

   // On each assistant message
   <button onClick={() => handleTextToSpeech(message.content)}>
     <Volume2 className="w-4 h-4" />
   </button>
   ```

### AssistantModal Requirements
**File**: `src/frontend/components/assistant/AssistantModalDemo.tsx`

#### Background
- Use Shadcn `Skeleton` components
- Simulate a loading page layout
- Multiple skeleton cards, text blocks, etc.

#### Floating Chat Bubble
- Fixed position: `bottom-6 right-6`
- Circular button: `w-14 h-14 rounded-full`
- Icon: `MessageCircle` from lucide-react
- Background: primary color
- Shadow: `shadow-lg`
- Pulse animation on hover (optional)

#### Modal
- Use `@assistant-ui/react` `AssistantModal` component
- Open/close state controlled by chat bubble click
- Modal contains full chat interface (same as ThreadView)
- Position: centered on screen
- Backdrop: semi-transparent dark overlay

### AssistantSidebar with PlateJS
**File**: `src/frontend/components/assistant/EditorWithAssistant.tsx`

#### Layout
- Resizable split pane layout
- Left pane: 60-70% width (PlateJS editor)
- Right pane: 30-40% width (AssistantSidebar)
- Drag handle to resize

#### PlateJS Editor (Left Pane)
- Rich text editing
- Toolbar with:
  - Bold, Italic, Underline
  - Bullet list, Numbered list
  - Headings (H1, H2, H3)
  - Blockquote
  - Code block
- Auto-save to D1 (debounced)

#### AssistantSidebar (Right Pane)
- Use `@assistant-ui/react` `AssistantSidebar` component
- **3 Auto-Suggestions**:
  1. "Add a paragraph about [topic]"
  2. "Summarize the document"
  3. "Improve grammar and clarity"

- **Tool Calling**: AI can manipulate PlateJS document
  ```typescript
  const tools = [
    {
      name: 'updateDocument',
      description: 'Modify the PlateJS document',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['insert', 'replace', 'delete', 'format']
          },
          content: {
            type: 'string',
            description: 'Content to insert/replace'
          },
          position: {
            type: 'number',
            description: 'Position in document (optional)'
          }
        }
      },
      execute: async ({ operation, content, position }) => {
        // Manipulate PlateJS editor value
        if (operation === 'insert') {
          // Insert content at position or at end
        } else if (operation === 'replace') {
          // Replace selected text or entire document
        } else if (operation === 'delete') {
          // Delete selected text
        }

        // Update editor state
        setValue([...editor.children]);

        return { success: true, message: 'Document updated' };
      }
    }
  ];
  ```

## DASHBOARD REQUIREMENTS

### Dashboard Page
**File**: `src/frontend/pages/index.astro`

Replace existing placeholder with real dashboard:

```astro
---
import AppLayout from '@/layouts/AppLayout.astro';
import Dashboard from '@/components/dashboard/Dashboard';
---

<AppLayout title="Dashboard" description="Application dashboard">
  <Dashboard client:load />
</AppLayout>
```

### Dashboard Component
**File**: `src/frontend/components/dashboard/Dashboard.tsx`

#### Structure
- Grid layout: 4 columns on desktop, 2 on tablet, 1 on mobile
- Fetch from `GET /api/dashboard/summary`
- Display latest metrics for each category

#### Metric Cards
```typescript
interface Metric {
  id: number;
  metricName: string;
  metricValue: number;
  metricType: 'count' | 'percentage' | 'currency' | 'time';
  category: 'users' | 'revenue' | 'performance' | 'system';
}

function formatMetricValue(value: number, type: string): string {
  switch (type) {
    case 'count':
      return value.toLocaleString();
    case 'percentage':
      return `${value.toFixed(1)}%`;
    case 'currency':
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    case 'time':
      return `${value}ms`;
    default:
      return value.toString();
  }
}

<Card>
  <CardHeader>
    <CardTitle>{metric.metricName}</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">
      {formatMetricValue(metric.metricValue, metric.metricType)}
    </div>
  </CardContent>
</Card>
```

#### Charts (Optional but Recommended)
- Install `recharts`: `npm install recharts`
- Fetch time-series data: `GET /api/dashboard/charts/:category?days=7`
- Display line charts for trends

## DATA FETCHING PATTERNS

### With Authentication
```typescript
const fetchData = async (endpoint: string) => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return null;
  }

  try {
    const response = await fetch(`/api${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
};
```

### With Loading States
```typescript
const [data, setData] = useState(null);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetchData('/endpoint')
    .then(result => {
      setData(result);
      setError(null);
    })
    .catch(err => {
      setError(err.message);
    })
    .finally(() => {
      setIsLoading(false);
    });
}, []);

if (isLoading) {
  return <Skeleton className="h-64 w-full" />;
}

if (error) {
  return <Alert variant="destructive">{error}</Alert>;
}
```

## STYLING GUIDELINES

### Tailwind Classes
- Use Shadcn UI theme variables: `bg-background`, `text-foreground`, `border`, etc.
- Spacing: Use consistent spacing scale (`p-4`, `gap-6`, `mb-8`)
- Responsive: Mobile-first approach (`md:`, `lg:` prefixes)

### Dark Theme
- Default to dark theme
- Use Shadcn dark mode classes
- High contrast for accessibility
- Proper text hierarchy

### Icons
- Use `lucide-react` exclusively
- Icon size: `w-5 h-5` for UI elements, `w-4 h-4` for inline
- Consistent stroke width

## ANIMATION & TRANSITIONS

```css
/* Smooth transitions */
.transition-all {
  transition: all 150ms ease-in-out;
}

/* Hover states */
.hover\:bg-accent:hover {
  background-color: hsl(var(--accent));
}

/* Loading animations */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

## ACCESSIBILITY

- Use semantic HTML
- `aria-label` on icon-only buttons
- `aria-live` regions for dynamic content
- Keyboard navigation (Tab, Enter, Escape)
- Focus indicators visible

## MOBILE RESPONSIVENESS

- Sidebar collapses to hamburger menu on mobile
- Top nav adapts to smaller screens
- Dashboard cards stack vertically
- Touch-friendly button sizes (min 44x44px)

---

**Remember**: Follow these guidelines strictly to ensure consistency across the application.
