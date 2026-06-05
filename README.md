# ✨ Northstar Kanban Board

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen.svg?style=flat-square)](https://northstarkanbanboard.netlify.app/)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

A premium, glassmorphic Kanban Board engineered for speed, visual clarity, and real-time collaboration. Built with **React**, **TypeScript**, **Tailwind CSS v4**, and **Supabase**.

🔗 **Live Link:** [https://northstarkanbanboard.netlify.app/](https://northstarkanbanboard.netlify.app/)

---

## 🚀 Key Features

### 1. Real-Time Collaboration & Synchronization
Powered by **Supabase Realtime Channels** (WebSockets). Moving, adding, or deleting cards and lanes broadcasts updates instantly to all connected clients. You can keep multiple windows open and watch them sync in under 50ms.

### 2. 6-Second "Undo" Buffer (Deletions & Moves)
Accidentally delete a card or drag it to the wrong lane?
* **Undo Delete**: Deletion is delayed by 6 seconds. The card disappears locally instantly, showing a glassmorphic toast notification at the bottom. Clicking "Undo" cancels the database query and pops the card back exactly where it was.
* **Undo Drag-and-Drop**: Restores both your local board layout and the Supabase database order back to the state before the drag-and-drop event occurred.

### 3. Automated PostgreSQL Activity History
A toggleable, glassmorphic drawer on the right side fetches and streams the latest 20 database logs. Actions are tracked at the database level using PostgreSQL triggers on the Supabase backend:
* Card Creation (`created`)
* Card Drag-and-Drop (`moved` from Lane A to Lane B)
* Card Deletions (`deleted`)

### 4. Kanban Lane WIP (Work-In-Progress) Limits
Enforce agile best practices by setting a **WIP Limit** on any column row. If the card count exceeds your set limit, the lane background dynamically changes to a glowing, red alert style.

### 5. Proactive Deadline Indicators
Active timezone checks flag tasks as **Due Today** or **Overdue** with glowing orange and red tags. Indicators turn off automatically if the card's progress dropdown is set to `Done`.

### 6. Built for Large Boards (Rendering Optimization)
Centralized states often cause lag on large boards. This project solves that:
* **Memoization**: Core components (`KanbanCard` and `KanbanColumn`) are wrapped in `React.memo` to skip re-renders.
* **Callback Caching**: Parent callback functions are wrapped in `useCallback` and depend on stable `useRef` caches of the layout state. Typing or dragging a single card will **never** trigger re-renders on the rest of the board.

---

## 🛠️ Tech Stack

* **Frontend**: React (Hooks, Context, Refs, Memoization)
* **Drag-and-Drop**: `@dnd-kit/core` & `@dnd-kit/sortable`
* **Type Safety**: TypeScript
* **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Realtime Broadcast)
* **Styling**: Tailwind CSS v4 & custom floating scrollbars (Glassmorphic dark/light modes)
* **Icons**: `lucide-react`

---

## 📂 Database Architecture

Here are the SQL schemas running on the Supabase backend that power the board's logic:

### Schema definition
```sql
-- Activity logs table
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    card_title TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### PostgreSQL Trigger Function for Automated Logging
```sql
CREATE OR REPLACE FUNCTION log_card_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO activity_logs (board_id, user_id, card_title, action, details)
    VALUES (
      (SELECT board_id FROM columns WHERE id = NEW.column_id),
      NEW.owner_id, NEW.title, 'created', NULL
    );
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.column_id <> OLD.column_id) THEN
      INSERT INTO activity_logs (board_id, user_id, card_title, action, details)
      VALUES (
        (SELECT board_id FROM columns WHERE id = NEW.column_id),
        NEW.owner_id, NEW.title, 'moved',
        jsonb_build_object(
          'from_column', (SELECT title FROM columns WHERE id = OLD.column_id),
          'to_column', (SELECT title FROM columns WHERE id = NEW.column_id)
        )
      );
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO activity_logs (board_id, user_id, card_title, action, details)
    VALUES (
      (SELECT board_id FROM columns WHERE id = OLD.column_id),
      OLD.owner_id, OLD.title, 'deleted', NULL
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_card_activity
AFTER INSERT OR UPDATE OR DELETE ON cards
FOR EACH ROW EXECUTE FUNCTION log_card_activity();
```

---

## 💻 Local Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Dynamo-SJoshi/kanban_board.git
   cd kanban_board
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.
