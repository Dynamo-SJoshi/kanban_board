import { useEffect, useMemo, useState, useRef, useCallback, memo, type FormEvent } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarDays,
  CheckCircle2,
  GripVertical,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  X,
  Menu,
  Sun,
  Moon,
  History,
  RotateCcw,
  Trash2,
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { Provider, User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Classification = string

type Card = {
  id: string
  title: string
  description?: string
  due?: string
  classification: Classification
  position: number
  progress?: string // "1/4", "1/2", "3/4", "Ready", etc.
}

type Column = {
  id: string
  title: string
  accent: string
  position: number
  wipLimit?: number
  cards: Card[]
}

type BoardRow = {
  id: string
  title: string
}

type ColumnRow = {
  id: string
  title: string
  accent: string
  position: number
  wip_limit?: number | null
}

type CardRow = {
  id: string
  column_id: string
  title: string
  description: string | null
  due: string | null
  classification: string
  position: number
}

type ActivityLog = {
  id: string
  board_id: string
  user_id: string
  card_title: string
  action: 'created' | 'moved' | 'deleted' | string
  details: {
    from_column?: string
    to_column?: string
    [key: string]: any
  } | null
  created_at: string
}

// Parses JSON-stored custom metadata (due date, description, progress) safely
function parseCardMetadata(row: CardRow): Card {
  let description = row.description ?? ''
  let due = row.due ?? undefined
  let progress = 'Yet to be started'

  if (row.description && row.description.startsWith('{') && row.description.endsWith('}')) {
    try {
      const parsed = JSON.parse(row.description)
      description = parsed.description ?? ''
      due = parsed.due ?? row.due ?? undefined
      progress = parsed.progress ?? 'Yet to be started'
    } catch (e) {
      // Fallback if not valid JSON
    }
  }

  return {
    id: row.id,
    title: row.title,
    description: description || undefined,
    due: due || undefined,
    classification: row.classification,
    position: row.position,
    progress,
  }
}

// Packages custom metadata into a JSON string to store in description
function serializeCardMetadata(description?: string, due?: string, progress?: string): string {
  return JSON.stringify({
    description: description ?? '',
    due: due ?? '',
    progress: progress ?? 'Yet to be started',
  })
}

const COLUMN_ACCENTS = [
  'bg-slate-400',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
]

const CLASSIFICATION_STYLES: Record<string, string> = {
  Planning: 'bg-slate-100 text-slate-600',
  Design: 'bg-cyan-50 text-cyan-700',
  Build: 'bg-violet-50 text-violet-700',
  QA: 'bg-amber-50 text-amber-700',
  Blocked: 'bg-rose-50 text-rose-700',
  Done: 'bg-emerald-50 text-emerald-700',
}

const initialColumns: Column[] = []

type AuthMode = 'signin' | 'signup'

function mapBoardRowsToColumns(columnRows: ColumnRow[], cardRows: CardRow[]) {
  const cardsByColumn = new Map<string, Card[]>()

  cardRows.forEach((card) => {
    const cards = cardsByColumn.get(card.column_id) ?? []
    cards.push(parseCardMetadata(card))
    cardsByColumn.set(card.column_id, cards)
  })

  return columnRows.map((column) => ({
    id: column.id,
    title: column.title,
    accent: column.accent,
    position: column.position,
    wipLimit: column.wip_limit ?? undefined,
    cards: (cardsByColumn.get(column.id) ?? []).sort(
      (first, second) => first.position - second.position,
    ),
  }))
}

function normalizeCardPositions(columnsToNormalize: Column[]) {
  return columnsToNormalize.map((column) => ({
    ...column,
    cards: column.cards.map((card, position) => ({
      ...card,
      position,
    })),
  }))
}

async function updateCardPositions(columnsToSave: Column[]) {
  const updates = columnsToSave.flatMap((column) =>
    column.cards.map(async (card, position) => {
      const { error } = await supabase
        .from('cards')
        .update({
          column_id: column.id,
          position,
        })
        .eq('id', card.id)

      if (error) {
        throw error
      }
    }),
  )

  await Promise.all(updates)
}

function AuthScreen() {
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handlePasswordAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsSubmitting(true)

    const result =
      authMode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
            },
          })

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setMessage(
      authMode === 'signin'
        ? 'Signed in successfully.'
        : 'Account created. Check your email if confirmation is enabled.',
    )
  }

  async function handleMagicLink() {
    setMessage('')
    setError('')

    if (!email.trim()) {
      setError('Enter your email before requesting a magic link.')
      return
    }

    setIsSubmitting(true)

    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setIsSubmitting(false)

    if (magicLinkError) {
      setError(magicLinkError.message)
      return
    }

    setMessage('Magic link sent. Check your email to continue.')
  }

  async function handleSocialLogin(provider: Provider) {
    setMessage('')
    setError('')
    setIsSubmitting(true)

    const { error: socialError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    })

    setIsSubmitting(false)

    if (socialError) {
      setError(socialError.message)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-6 text-slate-900 sm:px-6">
      <main className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:!text-cyan-500">
            Kanban workspace
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl dark:!text-white">
            Northstar Board
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:!text-slate-400">
            Sign in to keep your lanes, cards, classifications, and future Supabase data tied to your account.
          </p>

          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {['Private boards', 'Fast capture', 'Clean review'].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:!border-slate-700/50 dark:!bg-slate-800/60 dark:!text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:!border-slate-700/60 dark:!bg-slate-800/80">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:!text-cyan-500">
                Account
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:!text-white">
                {authMode === 'signin' ? 'Welcome back' : 'Create account'}
              </h2>
            </div>
            <span className="rounded-2xl bg-cyan-50 p-3 text-cyan-700 dark:!bg-cyan-900/40 dark:!text-cyan-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:!bg-slate-900/60">
            {(['signin', 'signup'] as AuthMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setAuthMode(mode)
                  setMessage('')
                  setError('')
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  authMode === mode
                    ? 'bg-white text-slate-950 shadow-sm dark:!bg-slate-700 dark:!text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:!text-slate-400 dark:hover:!text-slate-200'
                }`}
              >
                {mode === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form className="space-y-3" onSubmit={handlePasswordAuth}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:!text-slate-400">
                Email
              </span>
              <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400 dark:!border-slate-700 dark:!bg-slate-900/60">
                <Mail className="h-4 w-4" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:!text-white dark:placeholder:!text-slate-500"
                  placeholder="you@example.com"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:!text-slate-400">
                Password
              </span>
              <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400 dark:!border-slate-700 dark:!bg-slate-900/60 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400 transition-all">
                <Lock className="h-4 w-4 shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:!text-white dark:placeholder:!text-slate-500"
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault() // Keeps the cursor inside the input field while clicking
                    setShowPassword(true)
                  }}
                  onPointerUp={() => setShowPassword(false)}
                  onPointerLeave={() => setShowPassword(false)}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 shrink-0 cursor-pointer dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:!bg-cyan-600 dark:hover:!bg-cyan-500"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {authMode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="my-5 h-px bg-slate-200 dark:!bg-slate-700" />

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-cyan-200 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-70 dark:!border-slate-700 dark:!bg-slate-800/60 dark:!text-slate-300 dark:hover:!border-slate-500 dark:hover:!bg-slate-700 dark:hover:!text-white"
            >
              <Mail className="h-4 w-4" />
              Send magic link
            </button>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSocialLogin('github')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70 dark:!border-slate-700 dark:!bg-slate-800/60 dark:!text-slate-300 dark:hover:!border-slate-500 dark:hover:!bg-slate-700 dark:hover:!text-white"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </button>
              <button
                type="button"
                onClick={() => handleSocialLogin('google')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70 dark:!border-slate-700 dark:!bg-slate-800/60 dark:!text-slate-300 dark:hover:!border-slate-500 dark:hover:!bg-slate-700 dark:hover:!text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>
            </div>
          </div>

          {message ? (
            <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:!bg-emerald-900/40 dark:!text-emerald-400">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-400">
              {error}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  )
}

type CardProps = {
  card: Card
  columnId: string
  onDeleteCard: (columnId: string, cardId: string) => void
  onUpdateCard: (columnId: string, cardId: string, updates: Partial<Card>) => void
}

function getDueDateAlert(card: Card): { label: string; className: string; isAlert: boolean; isSuccess?: boolean } | null {
  if (!card.due) return null

  const isDone = card.progress === 'Done' || card.classification === 'Done'
  
  if (isDone) {
    return {
      label: 'Completed',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50',
      isAlert: false,
      isSuccess: true
    }
  }

  const dueTime = new Date(card.due + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const diffTime = dueTime.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return {
      label: 'Overdue',
      className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50',
      isAlert: true,
      isSuccess: false
    }
  } else if (diffDays === 0) {
    return {
      label: 'Due Today',
      className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50',
      isAlert: true,
      isSuccess: false
    }
  }
  
  return null
}

const KanbanCard = memo(function KanbanCard({ card, columnId, onDeleteCard, onUpdateCard }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { columnId },
    })

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitle, setEditingTitle] = useState(card.title)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const progressOptions = ['Yet to be started', '1/4', '1/2', '3/4', 'Done']
  const dueAlert = getDueDateAlert(card)
  const isOverdue = dueAlert?.isAlert ?? false
  const isSuccess = dueAlert?.isSuccess ?? false

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-2xl border-2 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)] ${
        isDragging ? 'opacity-40 ring-2 ring-cyan-400' : ''
      } ${
        isOverdue
          ? 'border-red-500 dark:border-red-600 shadow-[0_0_14px_rgba(239,68,68,0.35)] dark:shadow-[0_0_14px_rgba(239,68,68,0.2)] bg-rose-50/10 dark:bg-rose-950/10'
          : isSuccess
          ? 'border-emerald-400 dark:border-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.25)] dark:shadow-[0_0_14px_rgba(16,185,129,0.15)] bg-emerald-50/30 dark:bg-emerald-950/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${CLASSIFICATION_STYLES[card.classification] ?? 'bg-slate-100 text-slate-600'}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
            {card.classification}
          </span>
          {dueAlert && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${dueAlert.className}`}>
              {dueAlert.label}
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label={`Delete ${card.title}`}
          onPointerDown={(event) => {
            event.stopPropagation()
            onDeleteCard(columnId, card.id)
          }}
          className="rounded-full p-1.5 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-rose-500 group-hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isEditingTitle ? (
        <input
          autoFocus
          value={editingTitle}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={() => {
            setIsEditingTitle(false)
            if (editingTitle.trim() && editingTitle.trim() !== card.title) {
              onUpdateCard(columnId, card.id, { title: editingTitle.trim() })
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setIsEditingTitle(false)
              if (editingTitle.trim() && editingTitle.trim() !== card.title) {
                onUpdateCard(columnId, card.id, { title: editingTitle.trim() })
              }
            }
          }}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400"
        />
      ) : (
        <h3 
          onClick={(e) => {
            e.stopPropagation()
            setIsEditingTitle(true)
          }}
          className="text-[15px] font-semibold leading-6 text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
        >
          {card.title}
        </h3>
      )}

      {card.description ? (
        <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-400">
        <label 
          onPointerDown={(e) => e.stopPropagation()} 
          className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-slate-50 px-2 py-1 hover:bg-slate-100 transition border border-slate-200/40"
        >
          <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="date"
            value={card.due ?? ''}
            onChange={(e) => {
              onUpdateCard(columnId, card.id, { due: e.target.value || undefined })
            }}
            className="bg-transparent border-none p-0 outline-none text-xs font-medium text-slate-600 focus:ring-0 w-24 cursor-pointer"
          />
        </label>
        
        <label 
          onPointerDown={(e) => e.stopPropagation()} 
          className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-slate-50 px-2 py-1 hover:bg-slate-100 transition border border-slate-200/40"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-cyan-600" />
          <select
            value={card.progress ?? 'Yet to be started'}
            onChange={(e) => {
              onUpdateCard(columnId, card.id, { progress: e.target.value })
            }}
            className="bg-transparent border-none p-0 outline-none text-xs font-medium text-slate-600 focus:ring-0 cursor-pointer"
          >
            {progressOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  )
})

type ColumnProps = {
  column: Column
  newCardTitle: string
  newCardClassification: Classification
  onAddCard: (columnId: string) => void
  onDeleteCard: (columnId: string, cardId: string) => void
  onUpdateCard: (columnId: string, cardId: string, updates: Partial<Card>) => void
  onUpdateWipLimit: (columnId: string, wipLimit: number | undefined) => void
  onDeleteColumn: (columnId: string) => void
  onRenameColumn: (columnId: string, title: string) => void
  onUpdateNewCardTitle: (columnId: string, title: string) => void
  onUpdateNewCardClassification: (
    columnId: string,
    classification: Classification,
  ) => void
}

const KanbanColumn = memo(function KanbanColumn({
  column,
  newCardTitle,
  newCardClassification,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  onUpdateWipLimit,
  onDeleteColumn,
  onRenameColumn,
  onUpdateNewCardTitle,
  onUpdateNewCardClassification,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id },
  })

  const [isEditing, setIsEditing] = useState(false)
  const [isAddingCard, setIsAddingCard] = useState(false)
  const [editingTitle, setEditingTitle] = useState(column.title)

  const [isEditingWipLimit, setIsEditingWipLimit] = useState(false)
  const [wipInput, setWipInput] = useState(column.wipLimit !== undefined ? String(column.wipLimit) : '')

  useEffect(() => {
    setWipInput(column.wipLimit !== undefined ? String(column.wipLimit) : '')
  }, [column.wipLimit])

  function saveWipLimit() {
    setIsEditingWipLimit(false)
    const val = wipInput.trim()
    if (val === '') {
      onUpdateWipLimit(column.id, undefined)
    } else {
      const parsed = parseInt(val, 10)
      if (isNaN(parsed) || parsed < 0) {
        onUpdateWipLimit(column.id, undefined)
      } else {
        onUpdateWipLimit(column.id, parsed)
      }
    }
  }

  const isWipExceeded = column.wipLimit !== undefined && column.wipLimit > 0 && column.cards.length > column.wipLimit

  return (
    <section
      ref={setNodeRef}
      className={`w-[20rem] shrink-0 rounded-[28px] border-2 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.07)] backdrop-blur-md transition-all duration-300 ${
        isWipExceeded
          ? 'bg-rose-50/70 border-red-500 dark:bg-rose-950/10 dark:border-red-600 shadow-[0_0_14px_rgba(239,68,68,0.3)]'
          : 'border-slate-200/80 bg-slate-50/70 dark:bg-slate-900/40 dark:border-slate-800/60'
      } ${
        isOver ? 'ring-2 ring-cyan-400/70' : ''
      }`}
    >
      <div className={`mb-4 rounded-[22px] bg-white px-4 py-3 border-2 shadow-sm transition-all duration-300 ${
        isWipExceeded
          ? 'border-red-500 dark:border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.45)]'
          : 'border-slate-200 dark:border-slate-700/60'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${column.accent}`} />
              {isEditing ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={() => {
                    setIsEditing(false)
                    if (editingTitle.trim() && editingTitle.trim() !== column.title) {
                      onRenameColumn(column.id, editingTitle.trim())
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setIsEditing(false)
                      if (editingTitle.trim() && editingTitle.trim() !== column.title) {
                        onRenameColumn(column.id, editingTitle.trim())
                      }
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTitle(column.title)
                    setIsEditing(true)
                  }}
                  className="truncate text-left text-sm font-semibold tracking-tight text-slate-950 dark:text-white hover:text-cyan-700 dark:hover:text-cyan-400"
                >
                  {column.title}
                </button>
              )}
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span>{column.cards.length} cards</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span>WIP Limit:</span>
                {isEditingWipLimit ? (
                  <input
                    type="number"
                    min="0"
                    placeholder="None"
                    value={wipInput}
                    onChange={(e) => setWipInput(e.target.value)}
                    onBlur={saveWipLimit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveWipLimit()
                      if (e.key === 'Escape') {
                        setIsEditingWipLimit(false)
                        setWipInput(column.wipLimit !== undefined ? String(column.wipLimit) : '')
                      }
                    }}
                    className="w-12 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-center text-xs outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-900"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingWipLimit(true)}
                    className="hover:underline hover:text-cyan-600 font-semibold cursor-pointer text-slate-600 dark:text-slate-400"
                    title="Click to set WIP limit"
                  >
                    {column.wipLimit !== undefined && column.wipLimit > 0 ? column.wipLimit : 'None'}
                  </button>
                )}
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label={`Delete ${column.title}`}
            onClick={() => onDeleteColumn(column.id)}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-rose-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SortableContext
        items={column.cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              columnId={column.id}
              onDeleteCard={onDeleteCard}
              onUpdateCard={onUpdateCard}
            />
          ))}
        </div>
      </SortableContext>

      {column.cards.length === 0 || isAddingCard ? (
        <div className="mt-3 rounded-[22px] border border-dashed border-slate-300 bg-white p-3 shadow-sm transition-all">
          <input
            autoFocus={isAddingCard}
            value={newCardTitle}
            onChange={(event) => onUpdateNewCardTitle(column.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onAddCard(column.id)
                setIsAddingCard(false)
              }
            }}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            placeholder="Add a new card title..."
          />

          <input
            value={newCardClassification}
            onChange={(event) =>
              onUpdateNewCardClassification(column.id, event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onAddCard(column.id)
                setIsAddingCard(false)
              }
            }}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            placeholder="Classification, e.g. Planning"
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onAddCard(column.id)
                setIsAddingCard(false)
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Save card
            </button>
            {column.cards.length > 0 && (
              <button
                type="button"
                onClick={() => setIsAddingCard(false)}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-100 p-2.5 text-slate-500 transition hover:bg-rose-100 hover:text-rose-600"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAddingCard(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-slate-300 bg-slate-50/50 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add card
        </button>
      )}
    </section>
  )
})

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [isBoardLoading, setIsBoardLoading] = useState(false)
  const [boardError, setBoardError] = useState('')
  const [columns, setColumns] = useState(initialColumns)
  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({})
  const [newCardClassifications, setNewCardClassifications] = useState<
    Record<string, Classification>
  >({})
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<'all' | 'title' | 'classification' | 'lane'>('all')
  const [sortByDueDate, setSortByDueDate] = useState(false)
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('kanban-dark-mode')
    return saved === 'true'
  })
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [undoToast, setUndoToast] = useState<{
    visible: boolean
    message: string
    actionType: 'delete' | 'move'
    data: any
  } | null>(null)

  const deleteTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const columnsRef = useRef(columns)
  useEffect(() => {
    columnsRef.current = columns
  }, [columns])

  const newCardTitlesRef = useRef(newCardTitles)
  useEffect(() => {
    newCardTitlesRef.current = newCardTitles
  }, [newCardTitles])

  const newCardClassificationsRef = useRef(newCardClassifications)
  useEffect(() => {
    newCardClassificationsRef.current = newCardClassifications
  }, [newCardClassifications])

  const newColumnTitleRef = useRef(newColumnTitle)
  useEffect(() => {
    newColumnTitleRef.current = newColumnTitle
  }, [newColumnTitle])

  const [isScrollbarVisible, setIsScrollbarVisible] = useState(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null) 

  useEffect(() => {
    if (user) {
      // When logged in, strictly apply their explicit saved preference
      document.documentElement.classList.toggle('dark', isDarkMode)
      localStorage.setItem('kanban-dark-mode', String(isDarkMode))
    } else {
      // When logged out, ignore the saved setting and ask the browser for its native theme
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', systemPrefersDark)
    }
  }, [isDarkMode, user])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setUser(data.session?.user ?? null)
      setIsAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      
      setUser((prevUser) => {
        // Only trigger a state change if the actual user ID changed (ignores background token refreshes)
        if (prevUser?.id === session?.user?.id) {
          return prevUser
        }
        return session?.user ?? null
      })
      setIsAuthLoading(false)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadBoardData(currentUser: User) {
      if (columns.length === 0) {
        setIsBoardLoading(true)
      }
      setBoardError('')

      const { data: existingBoard, error: boardFetchError } = await supabase
        .from('boards')
        .select('id, title')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle<BoardRow>()

      if (boardFetchError) {
        throw boardFetchError
      }

      let activeBoard = existingBoard

      if (!activeBoard) {
        const { data: createdBoard, error: boardCreateError } = await supabase
          .from('boards')
          .insert({
            owner_id: currentUser.id,
            title: 'Northstar Board',
          })
          .select('id, title')
          .single<BoardRow>()

        if (boardCreateError) {
          throw boardCreateError
        }

        activeBoard = createdBoard
      }

      const [{ data: columnRows, error: columnsError }, { data: cardRows, error: cardsError }] =
        await Promise.all([
          supabase
            .from('columns')
            .select('id, title, accent, position, wip_limit')
            .eq('board_id', activeBoard.id)
            .eq('owner_id', currentUser.id)
            .order('position', { ascending: true }),
          supabase
            .from('cards')
            .select('id, column_id, title, description, due, classification, position')
            .eq('owner_id', currentUser.id)
            .order('position', { ascending: true }),
        ])

      if (columnsError) {
        throw columnsError
      }

      if (cardsError) {
        throw cardsError
      }

      if (!isMounted) return

      setBoardId(activeBoard.id)
      setColumns(
        mapBoardRowsToColumns(
          (columnRows ?? []) as ColumnRow[],
          (cardRows ?? []) as CardRow[],
        ),
      )
      setIsBoardLoading(false)
    }

    if (!user) return

    loadBoardData(user).catch((error: unknown) => {
      if (!isMounted) return
      setBoardError(error instanceof Error ? error.message : 'Unable to load board.')
      setIsBoardLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [user])

  useEffect(() => {
    if (user) return

    setBoardId(null)
    setColumns(initialColumns)
    setIsBoardLoading(false)
  }, [user])
  
  // Silently refresh data when the user switches back to this tab
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && user && boardId) {
        // Trigger a silent re-fetch without throwing up the loading screen
        supabase
          .from('columns')
          .select('id, title, accent, position, wip_limit')
          .eq('board_id', boardId)
          .eq('owner_id', user.id)
          .order('position', { ascending: true })
          .then(({ data: columnRows }) => {
            supabase
              .from('cards')
              .select('id, column_id, title, description, due, classification, position')
              .eq('owner_id', user.id)
              .order('position', { ascending: true })
              .then(({ data: cardRows }) => {
                if (columnRows && cardRows) {
                  setColumns(
                    mapBoardRowsToColumns(columnRows as ColumnRow[], cardRows as CardRow[])
                  )
                }
              })
          })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user, boardId])

  const fetchActivityLogs = useCallback(async () => {
    if (!boardId) return
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Error fetching logs:', error)
      setBoardError(`History Sync Error: ${error.message}. Please verify your database grants and RLS policies on the activity_logs table.`)
    } else if (data) {
      setActivityLogs(data as ActivityLog[])
    }
  }, [boardId])

  useEffect(() => {
    if (isHistoryOpen) {
      fetchActivityLogs()
    }
  }, [isHistoryOpen, fetchActivityLogs])

  useEffect(() => {
    return () => {
      Object.values(deleteTimeoutsRef.current).forEach(clearTimeout)
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!user || !boardId) return

    const channel = supabase
      .channel('kanban-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const newLog = payload.new as ActivityLog
          setActivityLogs((prev) => {
            if (prev.some((log) => log.id === newLog.id)) return prev
            return [newLog, ...prev].slice(0, 20)
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'columns',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload

          if (eventType === 'INSERT') {
            const col = newRow as ColumnRow
            setColumns((prev) => {
              if (prev.some((c) => c.id === col.id)) return prev
              return [
                ...prev,
                {
                  id: col.id,
                  title: col.title,
                  accent: col.accent,
                  position: col.position,
                  wipLimit: col.wip_limit ?? undefined,
                  cards: [],
                },
              ].sort((a, b) => a.position - b.position)
            })
          } else if (eventType === 'UPDATE') {
            const col = newRow as ColumnRow
            setColumns((prev) => {
              const updated = prev.map((c) => {
                if (c.id === col.id) {
                  return {
                    ...c,
                    title: col.title,
                    accent: col.accent,
                    position: col.position,
                    wipLimit: col.wip_limit !== undefined ? (col.wip_limit ?? undefined) : c.wipLimit,
                  }
                }
                return c
              })
              return [...updated].sort((a, b) => a.position - b.position)
            })
          } else if (eventType === 'DELETE') {
            const col = oldRow as { id: string }
            setColumns((prev) => prev.filter((c) => c.id !== col.id))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cards',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload

          if (eventType === 'INSERT') {
            const card = newRow as CardRow
            setColumns((prev) =>
              prev.map((col) => {
                if (col.id !== card.column_id) return col
                if (col.cards.some((c) => c.id === card.id)) return col
                return {
                  ...col,
                  cards: [
                    ...col.cards,
                    parseCardMetadata(card),
                  ].sort((a, b) => a.position - b.position),
                }
              }),
            )
          } else if (eventType === 'UPDATE') {
            const card = newRow as CardRow
            setColumns((prev) => {
              const cleaned = prev.map((col) => {
                const hasCard = col.cards.some((c) => c.id === card.id)
                if (hasCard && col.id !== card.column_id) {
                  return {
                    ...col,
                    cards: col.cards.filter((c) => c.id !== card.id),
                  }
                }
                return col
              })

              return cleaned.map((col) => {
                if (col.id !== card.column_id) return col

                const exists = col.cards.some((c) => c.id === card.id)
                const updatedCard: Card = parseCardMetadata(card)

                let nextCards = []
                if (exists) {
                  nextCards = col.cards.map((c) => (c.id === card.id ? updatedCard : c))
                } else {
                  nextCards = [...col.cards, updatedCard]
                }

                return {
                  ...col,
                  cards: nextCards.sort((a, b) => a.position - b.position),
                }
              })
            })
          } else if (eventType === 'DELETE') {
            const card = oldRow as { id: string }
            setColumns((prev) =>
              prev.map((col) => ({
                ...col,
                cards: col.cards.filter((c) => c.id !== card.id),
              })),
            )
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, boardId])

  // Proximity scrollbar logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // If cursor is within the bottom 150px of the window
      const isNearBottom = window.innerHeight - e.clientY < 150

      if (isNearBottom) {
        if (!isScrollbarVisible) setIsScrollbarVisible(true)
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
          scrollTimeoutRef.current = null
        }
      } else {
        // If not near bottom, start 5-second countdown to hide
        if (isScrollbarVisible && !scrollTimeoutRef.current) {
          scrollTimeoutRef.current = setTimeout(() => {
            setIsScrollbarVisible(false)
            scrollTimeoutRef.current = null // <-- Missing reset added here
          }, 5000)
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = null // <-- Missing reset added here
      }
    }
  }, [isScrollbarVisible])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  )

  const totalCards = columns.reduce((sum, column) => sum + column.cards.length, 0)
  const doneCards = columns.reduce(
    (sum, column) =>
      sum + column.cards.filter((card) => card.classification === 'Done').length,
    0,
  )

  const visibleColumns = useMemo(() => {
    let filtered = columns

    const query = searchQuery.trim().toLowerCase()

    // 1. Handle Filtering
    if (query) {
      filtered = columns
        .map((column) => {
          const laneMatches = (searchFilter === 'all' || searchFilter === 'lane') && column.title.toLowerCase().includes(query)

          // If searching exclusively for lanes, return the whole lane if it matches, else hide it
          if (searchFilter === 'lane') {
             if (laneMatches) return column
             return null
          }

          // Otherwise, filter the cards based on the selected criteria
          const filteredCards = column.cards.filter((card) => {
            if (searchFilter === 'all') {
              const titleMatch = card.title.toLowerCase().includes(query)
              const descMatch = (card.description ?? '').toLowerCase().includes(query)
              const dueMatch = (card.due ?? '').toLowerCase().includes(query)
              const classMatch = card.classification.toLowerCase().startsWith(query)
              return titleMatch || descMatch || dueMatch || classMatch
            }
            if (searchFilter === 'title') {
              return card.title.toLowerCase().includes(query)
            }
            if (searchFilter === 'classification') {
              return card.classification.toLowerCase().startsWith(query)
            }
            return false
          })

          // If the lane name matched a global search, keep all its cards
          if (laneMatches) return column
          
          if (filteredCards.length === 0) return null

          return {
            ...column,
            cards: filteredCards,
          }
        })
        .filter((column): column is Column => column !== null)
    }

    // 2. Handle Sorting
    if (sortByDueDate) {
      // First, sort the cards within each individual lane
      filtered = filtered.map((column) => {
        const sortedCards = [...column.cards].sort((a, b) => {
          if (!a.due && !b.due) return 0
          if (!a.due) return 1 // Cards without dates sink to the bottom
          if (!b.due) return -1
          return new Date(a.due).getTime() - new Date(b.due).getTime()
        })
        return { ...column, cards: sortedCards }
      })

      // Second, sort the lanes from left-to-right based on their earliest card
      filtered = [...filtered].sort((colA, colB) => {
        // Because cards are already sorted, the 0th index is guaranteed to be the earliest
        const earliestA = colA.cards[0]?.due
        const earliestB = colB.cards[0]?.due
        
        if (!earliestA && !earliestB) return 0
        if (!earliestA) return 1 // Lanes without dates shift to the far right
        if (!earliestB) return -1
        return new Date(earliestA).getTime() - new Date(earliestB).getTime()
      })
    }

    return filtered
  }, [columns, searchQuery, searchFilter, sortByDueDate])

  const visibleCardCount = visibleColumns.reduce(
    (sum, column) => sum + column.cards.length,
    0,
  )

  const addCard = useCallback(async (columnId: string) => {
    if (!user) return

    const cardTitle = (newCardTitlesRef.current[columnId] ?? '').trim()
    if (!cardTitle) return

    const classification = (newCardClassificationsRef.current[columnId] ?? 'Planning').trim() || 'Planning'
    const targetColumn = columnsRef.current.find((column) => column.id === columnId)
    const position = targetColumn?.cards.length ?? 0

    const { data: createdCard, error } = await supabase
      .from('cards')
      .insert({
        column_id: columnId,
        owner_id: user.id,
        title: cardTitle,
        classification,
        position,
      })
      .select('id, column_id, title, description, due, classification, position')
      .single<CardRow>()

    if (error) {
      setBoardError(error.message)
      return
    }

    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [
                ...column.cards,
                parseCardMetadata(createdCard),
              ],
            }
          : column,
      ),
    )

    setNewCardTitles((previousTitles) => ({
      ...previousTitles,
      [columnId]: '',
    }))
  }, [user])

  const deleteCard = useCallback(async (columnId: string, cardId: string) => {
    const targetColumn = columnsRef.current.find((col) => col.id === columnId)
    const cardIndex = targetColumn?.cards.findIndex((c) => c.id === cardId) ?? -1
    const card = targetColumn?.cards[cardIndex]

    if (!card) return

    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.filter((c) => c.id !== cardId),
            }
          : column,
      ),
    )

    const timeoutId = setTimeout(async () => {
      const { error } = await supabase.from('cards').delete().eq('id', cardId)
      if (error) {
        setBoardError(error.message)
      }
      delete deleteTimeoutsRef.current[cardId]
    }, 6000)

    deleteTimeoutsRef.current[cardId] = timeoutId

    setUndoToast({
      visible: true,
      message: `Deleted "${card.title}"`,
      actionType: 'delete',
      data: { card, columnId, position: cardIndex },
    })
  }, [])

  const updateCard = useCallback(async (columnId: string, cardId: string, updates: Partial<Card>) => {
    const targetColumn = columnsRef.current.find((col) => col.id === columnId)
    const currentCard = targetColumn?.cards.find((c) => c.id === cardId)
    if (!currentCard) return

    const newTitle = updates.title !== undefined ? updates.title : currentCard.title
    const newClassification = updates.classification !== undefined ? updates.classification : currentCard.classification
    const newDescription = updates.description !== undefined ? updates.description : currentCard.description
    const newDue = updates.due !== undefined ? updates.due : currentCard.due
    const newProgress = updates.progress !== undefined ? updates.progress : (currentCard.progress ?? 'Yet to be started')

    const descriptionJson = serializeCardMetadata(newDescription, newDue, newProgress)

    const { error } = await supabase
      .from('cards')
      .update({
        title: newTitle,
        classification: newClassification,
        description: descriptionJson,
        due: newDue || null,
      })
      .eq('id', cardId)

    if (error) {
      setBoardError(error.message)
      return
    }

    setColumns((previousColumns) =>
      previousColumns.map((col) => {
        if (col.id !== columnId) return col
        return {
          ...col,
          cards: col.cards.map((c) => {
            if (c.id !== cardId) return c
            return {
              ...c,
              title: newTitle,
              classification: newClassification,
              description: newDescription,
              due: newDue,
              progress: newProgress,
            }
          }),
        }
      })
    )
  }, [])

  const updateWipLimit = useCallback(async (columnId: string, wipLimit: number | undefined) => {
    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId ? { ...column, wipLimit } : column,
      ),
    )

    const { error } = await supabase
      .from('columns')
      .update({ wip_limit: wipLimit !== undefined ? wipLimit : null })
      .eq('id', columnId)

    if (error) {
      setBoardError(error.message)
    }
  }, [])

  const addColumn = useCallback(async (titleInput?: string) => {
    if (!user) {
      setBoardError('User session not found. Please sign in.')
      return
    }
    if (!boardId) {
      if (!boardError) {
        setBoardError('Kanban board is still loading. Please wait a moment.')
      }
      return
    }

    const title = titleInput?.trim() || newColumnTitleRef.current.trim()
    const position = columnsRef.current.length
    const nextTitle = title || `Untitled lane ${position + 1}`
    const accent = COLUMN_ACCENTS[position % COLUMN_ACCENTS.length]

    console.log('Inserting new column:', { nextTitle, boardId, ownerId: user.id })

    const { data: createdColumn, error } = await supabase
      .from('columns')
      .insert({
        board_id: boardId,
        owner_id: user.id,
        title: nextTitle,
        accent,
        position,
      })
      .select('id, title, accent, position, wip_limit')
      .single<ColumnRow>()

    if (error) {
      console.error('Database insertion failed for column:', error)
      setBoardError(`Database Error: ${error.message}`)
      return
    }

    setColumns((previousColumns) => [
      ...previousColumns,
      {
        id: createdColumn.id,
        title: createdColumn.title,
        accent: createdColumn.accent,
        position: createdColumn.position,
        wipLimit: createdColumn.wip_limit ?? undefined,
        cards: [],
      },
    ])

    setNewColumnTitle('')
    
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          left: scrollContainerRef.current.scrollWidth,
          behavior: 'smooth',
        })
      }
    }, 100)
  }, [user, boardId, boardError])

  const renameColumn = useCallback(async (columnId: string, title: string) => {
    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    )

    const { error } = await supabase
      .from('columns')
      .update({ title })
      .eq('id', columnId)

    if (error) {
      setBoardError(error.message)
    }
  }, [])

  const deleteColumn = useCallback(async (columnId: string) => {
    const { error } = await supabase.from('columns').delete().eq('id', columnId)

    if (error) {
      setBoardError(error.message)
      return
    }

    setColumns((previousColumns) =>
      previousColumns.filter((column) => column.id !== columnId),
    )
  }, [])

  const updateNewCardTitle = useCallback((columnId: string, title: string) => {
    setNewCardTitles((previousTitles) => ({
      ...previousTitles,
      [columnId]: title,
    }))
  }, [])

  const updateNewCardClassification = useCallback((
    columnId: string,
    classification: Classification,
  ) => {
    setNewCardClassifications((previousClassifications) => ({
      ...previousClassifications,
      [columnId]: classification,
    }))
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id)
    const sourceColumnId = event.active.data.current?.columnId as string | undefined

    if (!sourceColumnId) return

    const sourceColumn = columnsRef.current.find((column) => column.id === sourceColumnId)
    const card = sourceColumn?.cards.find((item) => item.id === activeId)

    if (card) {
      setActiveCard(card)
    }
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveCard(null)

    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const sourceColumnId = active.data.current?.columnId as string | undefined
    const targetColumnId =
      (over.data.current?.columnId as string | undefined) ?? overId

    if (!sourceColumnId || !targetColumnId) return

    if (sourceColumnId === targetColumnId && activeId === overId) return

    const prevColumns = columnsRef.current
    let nextColumns = columnsRef.current

    if (sourceColumnId === targetColumnId) {
      nextColumns = normalizeCardPositions(
        columnsRef.current.map((column) => {
          if (column.id !== sourceColumnId) return column

          const oldIndex = column.cards.findIndex((card) => card.id === activeId)
          const newIndex = column.cards.findIndex((card) => card.id === overId)

          if (oldIndex === -1) return column

          return {
            ...column,
            cards: arrayMove(
              column.cards,
              oldIndex,
              newIndex === -1 ? column.cards.length - 1 : newIndex,
            ),
          }
        }),
      )
    } else {
      const sourceColumn = columnsRef.current.find((column) => column.id === sourceColumnId)
      const targetColumn = columnsRef.current.find((column) => column.id === targetColumnId)

      if (!sourceColumn || !targetColumn) return

      const movingCard = sourceColumn.cards.find((card) => card.id === activeId)
      if (!movingCard) return

      const isOverCard = over.data.current?.columnId !== undefined
      const targetIndex = isOverCard
        ? targetColumn.cards.findIndex((card) => card.id === overId)
        : targetColumn.cards.length

      nextColumns = normalizeCardPositions(
        columnsRef.current.map((column) => {
          if (column.id === sourceColumnId) {
            return {
              ...column,
              cards: column.cards.filter((card) => card.id !== activeId),
            }
          }

          if (column.id === targetColumnId) {
            const nextCards = [...column.cards]
            const insertionIndex = targetIndex === -1 ? nextCards.length : targetIndex
            nextCards.splice(insertionIndex, 0, movingCard)
            return {
              ...column,
              cards: nextCards,
            }
          }

          return column
        }),
      )
    }

    setColumns(nextColumns)

    try {
      await updateCardPositions(nextColumns)

      setUndoToast({
        visible: true,
        message: 'Card moved.',
        actionType: 'move',
        data: { prevColumns },
      })

      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current)
      }
      moveTimeoutRef.current = setTimeout(() => {
        setUndoToast((curr) => (curr?.actionType === 'move' ? null : curr))
      }, 6000)

    } catch (error) {
      setBoardError(error instanceof Error ? error.message : 'Unable to save card order.')
    }
  }, [])

  const handleUndo = useCallback(async () => {
    if (!undoToast) return

    const { actionType, data } = undoToast

    if (actionType === 'delete') {
      const { card, columnId, position } = data
      
      const timeoutId = deleteTimeoutsRef.current[card.id]
      if (timeoutId) {
        clearTimeout(timeoutId)
        delete deleteTimeoutsRef.current[card.id]
      }

      setColumns((previousColumns) =>
        previousColumns.map((col) => {
          if (col.id !== columnId) return col
          const nextCards = [...col.cards]
          nextCards.splice(position, 0, card)
          return {
            ...col,
            cards: nextCards,
          }
        }),
      )
    } else if (actionType === 'move') {
      const { prevColumns } = data
      
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current)
        moveTimeoutRef.current = null
      }

      setColumns(prevColumns)

      try {
        await updateCardPositions(prevColumns)
      } catch (error) {
        setBoardError(error instanceof Error ? error.message : 'Unable to revert card order.')
      }
    }

    setUndoToast(null)
  }, [undoToast])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (isAuthLoading || isBoardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-white/70 bg-white/85 px-5 py-4 text-sm font-semibold text-slate-700 shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />
          Loading workspace
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen />
  }

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex h-full max-w-[1680px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="relative z-40 rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_16px_48px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                Kanban workspace
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Northstar Board
                </h1>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {totalCards} cards total
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                A clean, professional kanban board with drag-and-drop, inline lane editing, and card
                classification.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400 shadow-sm sm:w-[30rem] focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400 transition-all">
                  <Search className="h-4 w-4 ml-1 shrink-0" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search board..."
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 shrink-0"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <div className="h-5 w-px bg-slate-200 mx-1 shrink-0" />
                  <select
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value as any)}
                    className="bg-transparent text-xs font-semibold text-slate-600 outline-none cursor-pointer border-none p-0 focus:ring-0 shrink-0"
                  >
                    <option value="all">All fields</option>
                    <option value="title">Card name</option>
                    <option value="classification">Classification</option>
                    <option value="lane">Lane name</option>
                  </select>
                </label>
                
                <label className="flex items-center gap-2 ml-2 cursor-pointer group w-fit">
                  <input
                    type="checkbox"
                    checked={sortByDueDate}
                    onChange={(e) => setSortByDueDate(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-cyan-600 accent-cyan-600"
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-700 transition">
                    Sort by earliest completion time
                  </span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => addColumn()}
                className="inline-flex h-fit items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add lane
              </button>

              <button
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900"
                title="View Board Activity History"
              >
                <History className="h-5 w-5" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  aria-label="Menu"
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                >
                  <Menu className="h-5 w-5" />
                </button>

                {isMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl z-20">
                      <div className="px-3 py-2 border-b border-slate-100 mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account</p>
                        <p className="max-w-[12rem] truncate text-sm font-medium text-slate-700">
                          {user.email}
                        </p>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setIsDarkMode(!isDarkMode)
                          setIsMenuOpen(false)
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                          isDarkMode 
                            ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700' 
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        {isDarkMode ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
                        {isDarkMode ? 'Switch to Light' : 'Switch to Dark'}
                      </button>

                      

                      <button
                        type="button"
                        onClick={() => {
                          handleSignOut()
                          setIsMenuOpen(false)
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50/50 hover:text-rose-700"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {doneCards} completed
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
              <CalendarDays className="h-3.5 w-3.5" />
              Updated just now
            </span>
            {searchQuery ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
                {visibleCardCount} shown
              </span>
            ) : null}
          </div>
        </header>

        {boardError ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Error:</span>
              <span>{boardError}</span>
            </div>
            <button
              type="button"
              onClick={() => setBoardError('')}
              className="rounded-full p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-700 transition"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <main className="mt-6 flex flex-1 flex-col min-h-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {visibleColumns.length > 0 ? (
              <div 
                ref={scrollContainerRef}
                className={`flex-1 overflow-x-auto overflow-y-auto pb-4 floating-scrollbar ${
                  isScrollbarVisible ? '' : 'scrollbar-hidden'
                }`}
              >
                <div className="flex h-full items-start gap-4 pr-2">
                  {visibleColumns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      newCardTitle={newCardTitles[column.id] ?? ''}
                      newCardClassification={newCardClassifications[column.id] ?? 'Planning'}
                      onAddCard={addCard}
                      onDeleteCard={deleteCard}
                      onUpdateCard={updateCard}
                      onUpdateWipLimit={updateWipLimit}
                      onDeleteColumn={deleteColumn}
                      onRenameColumn={renameColumn}
                      onUpdateNewCardTitle={updateNewCardTitle}
                      onUpdateNewCardClassification={updateNewCardClassification}
                    />
                  ))}

                  <section className="w-[20rem] shrink-0 rounded-[28px] border border-dashed border-cyan-200 bg-white/80 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] backdrop-blur-md">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                      New lane
                    </p>
                    <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                      Create another stage
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Add a lane for review, waiting, blocked work, or any custom workflow step.
                    </p>

                    <input
                      value={newColumnTitle}
                      onChange={(event) => setNewColumnTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        addColumn()
                      }
                    }}
                      className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                      placeholder="Lane title"
                    />

                    <button
                      type="button"
                      onClick={() => addColumn()}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Create lane
                    </button>
                  </section>
                </div>
              </div>
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/70 p-10 text-center shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  {searchQuery ? `No matches for "${searchQuery}"` : 'No lanes yet'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {searchQuery
                    ? 'Try a different lane title, card title, classification, or due text.'
                    : 'Create your first lane using the button in the header or the lane panel.'}
                </p>
              </div>
            )}

            <DragOverlay>
              {activeCard ? (
                <div className="w-[20rem] rounded-2xl border border-cyan-200 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${CLASSIFICATION_STYLES[activeCard.classification] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                      {activeCard.classification}
                    </span>
                    <span className="text-xs font-medium text-slate-400">Dragging</span>
                  </div>
                  <h3 className="text-[15px] font-semibold leading-6 text-slate-900">{activeCard.title}</h3>
                  {activeCard.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-500">{activeCard.description}</p>
                  ) : null}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
      </div>

      {/* Sliding History Sidebar Backdrop */}
      {isHistoryOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px] dark:bg-black/30"
          onClick={() => setIsHistoryOpen(false)}
        />
      )}

      {/* Sliding History Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-96 transform border-l border-slate-200/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-in-out dark:border-slate-800/60 dark:bg-slate-950/95 ${
          isHistoryOpen ? 'translate-x-0' : 'translate-x-full'
        } flex flex-col`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-cyan-600 dark:text-cyan-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Activity History</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(false)}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {activityLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-8 w-8 text-slate-300 dark:text-slate-700 animate-pulse mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No activity logged yet.</p>
            </div>
          ) : (
            activityLogs.map((log) => {
              const date = new Date(log.created_at)
              const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
              
              let actionIcon = <Activity className="h-4 w-4 text-slate-500" />
              let actionColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              let actionText = ''

              if (log.action === 'created') {
                actionIcon = <Plus className="h-3.5 w-3.5" />
                actionColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                actionText = 'created card'
              } else if (log.action === 'moved') {
                actionIcon = <ArrowRight className="h-3.5 w-3.5" />
                actionColor = 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400'
                actionText = `moved card`
              } else if (log.action === 'deleted') {
                actionIcon = <Trash2 className="h-3.5 w-3.5" />
                actionColor = 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                actionText = 'deleted card'
              }

              return (
                <div key={log.id} className="group flex gap-3 rounded-xl border border-transparent p-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${actionColor}`}>
                    {actionIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {log.card_title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{actionText}</span>
                      {log.action === 'moved' && log.details && (
                        <span>
                          {' '}from <span className="italic font-medium">{log.details.from_column}</span> to <span className="italic font-medium">{log.details.to_column}</span>
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {dateString} at {timeString}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Glassmorphic Undo Toast */}
      {undoToast && undoToast.visible && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-bounce-short">
          <div className="flex items-center gap-3 rounded-2xl border border-white/40 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90">
            <RotateCcw className="h-4 w-4 text-cyan-400" />
            <span>{undoToast.message}</span>
            <button
              type="button"
              onClick={handleUndo}
              className="ml-2 rounded-lg bg-cyan-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-cyan-500 active:scale-95"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoToast(null)}
              className="rounded-full p-1 text-slate-400 hover:text-white transition"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
