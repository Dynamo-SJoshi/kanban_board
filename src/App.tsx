import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
}

type Column = {
  id: string
  title: string
  accent: string
  position: number
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
    cards.push({
      id: card.id,
      title: card.title,
      description: card.description ?? undefined,
      due: card.due ?? undefined,
      classification: card.classification,
      position: card.position,
    })
    cardsByColumn.set(card.column_id, cards)
  })

  return columnRows.map((column) => ({
    id: column.id,
    title: column.title,
    accent: column.accent,
    position: column.position,
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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
            Kanban workspace
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950 sm:text-5xl">
            Northstar Board
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            Sign in to keep your lanes, cards, classifications, and future Supabase data tied to your account.
          </p>

          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {['Private boards', 'Fast capture', 'Clean review'].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                Account
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                {authMode === 'signin' ? 'Welcome back' : 'Create account'}
              </h2>
            </div>
            <span className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
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
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form className="space-y-3" onSubmit={handlePasswordAuth}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Email
              </span>
              <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400">
                <Mail className="h-4 w-4" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="you@example.com"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Password
              </span>
              <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-400">
                <Lock className="h-4 w-4" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {authMode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="my-5 h-px bg-slate-200" />

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleMagicLink}
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-cyan-200 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Mail className="h-4 w-4" />
              Send magic link
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSocialLogin('github')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ShieldCheck className="h-4 w-4" />
                GitHub
              </button>
              <button
                type="button"
                onClick={() => handleSocialLogin('google')}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Google
              </button>
            </div>
          </div>

          {message ? (
            <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
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
}

function KanbanCard({ card, columnId, onDeleteCard }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { columnId },
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)] ${
        isDragging ? 'opacity-40 ring-2 ring-cyan-400' : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${CLASSIFICATION_STYLES[card.classification] ?? 'bg-slate-100 text-slate-600'}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
          {card.classification}
        </span>

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

      <h3 className="text-[15px] font-semibold leading-6 text-slate-900">{card.title}</h3>

      {card.description ? (
        <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
      ) : null}

      <div className="mt-4 flex items-center gap-4 text-xs font-medium text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          {card.due ?? 'No due date'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Ready
        </span>
      </div>
    </article>
  )
}

type ColumnProps = {
  column: Column
  newCardTitle: string
  newCardClassification: Classification
  onAddCard: (columnId: string) => void
  onDeleteCard: (columnId: string, cardId: string) => void
  onDeleteColumn: (columnId: string) => void
  onRenameColumn: (columnId: string, title: string) => void
  onUpdateNewCardTitle: (columnId: string, title: string) => void
  onUpdateNewCardClassification: (
    columnId: string,
    classification: Classification,
  ) => void
}

function KanbanColumn({
  column,
  newCardTitle,
  newCardClassification,
  onAddCard,
  onDeleteCard,
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

  return (
    <section
      ref={setNodeRef}
      className={`w-[20rem] shrink-0 rounded-[28px] border border-slate-200/80 bg-slate-50/90 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.07)] transition ${
        isOver ? 'ring-2 ring-cyan-400/70' : ''
      }`}
    >
      <div className="mb-4 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${column.accent}`} />
              {isEditing ? (
                <input
                  autoFocus
                  value={column.title}
                  onChange={(event) => onRenameColumn(column.id, event.target.value)}
                  onBlur={() => setIsEditing(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setIsEditing(false)
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="truncate text-left text-sm font-semibold tracking-tight text-slate-900 hover:text-cyan-700"
                >
                  {column.title}
                </button>
              )}
            </div>

            <p className="mt-1 text-xs text-slate-500">{column.cards.length} cards</p>
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
            />
          ))}
        </div>
      </SortableContext>

      <div className="mt-3 rounded-[22px] border border-dashed border-slate-300 bg-white p-3">
        <input
          value={newCardTitle}
          onChange={(event) => onUpdateNewCardTitle(column.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onAddCard(column.id)
            }
          }}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          placeholder="Add a new card"
        />

        <input
          value={newCardClassification}
          onChange={(event) =>
            onUpdateNewCardClassification(column.id, event.target.value)
          }
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          placeholder="Classification, e.g. Planning"
        />

        <button
          type="button"
          onClick={() => onAddCard(column.id)}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add card
        </button>
      </div>
    </section>
  )
}

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
  const [activeCard, setActiveCard] = useState<Card | null>(null)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setUser(data.session?.user ?? null)
      setIsAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
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
      setIsBoardLoading(true)
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
            .select('id, title, accent, position')
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

  useEffect(() => {
    if (!user || !boardId) return

    const channel = supabase
      .channel('kanban-realtime')
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
                    {
                      id: card.id,
                      title: card.title,
                      description: card.description ?? undefined,
                      due: card.due ?? undefined,
                      classification: card.classification,
                      position: card.position,
                    },
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
                const updatedCard: Card = {
                  id: card.id,
                  title: card.title,
                  description: card.description ?? undefined,
                  due: card.due ?? undefined,
                  classification: card.classification,
                  position: card.position,
                }

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
    const query = searchQuery.trim().toLowerCase()

    if (!query) return columns

    return columns
      .map((column) => {
        const laneMatches = column.title.toLowerCase().includes(query)
        if (laneMatches) return column

        const filteredCards = column.cards.filter((card) => {
          const haystack = [
            card.title,
            card.description ?? '',
            card.due ?? '',
            card.classification,
          ]
            .join(' ')
            .toLowerCase()

          return haystack.includes(query)
        })

        if (filteredCards.length === 0) return null

        return {
          ...column,
          cards: filteredCards,
        }
      })
      .filter((column): column is Column => column !== null)
  }, [columns, searchQuery])

  const visibleCardCount = visibleColumns.reduce(
    (sum, column) => sum + column.cards.length,
    0,
  )

  async function addCard(columnId: string) {
    if (!user) return

    const cardTitle = (newCardTitles[columnId] ?? '').trim()
    if (!cardTitle) return

    const classification = (newCardClassifications[columnId] ?? 'Planning').trim() || 'Planning'
    const targetColumn = columns.find((column) => column.id === columnId)
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
                {
                  id: createdCard.id,
                  title: createdCard.title,
                  description: createdCard.description ?? undefined,
                  due: createdCard.due ?? undefined,
                  classification: createdCard.classification,
                  position: createdCard.position,
                },
              ],
            }
          : column,
      ),
    )

    setNewCardTitles((previousTitles) => ({
      ...previousTitles,
      [columnId]: '',
    }))
  }

  async function deleteCard(columnId: string, cardId: string) {
    const { error } = await supabase.from('cards').delete().eq('id', cardId)

    if (error) {
      setBoardError(error.message)
      return
    }

    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.filter((card) => card.id !== cardId),
            }
          : column,
      ),
    )
  }

  async function addColumn(titleInput?: string) {
    if (!user) {
      setBoardError('User session not found. Please sign in.')
      return
    }
    if (!boardId) {
      setBoardError('Kanban board is still loading. Please wait a moment.')
      return
    }

    const title = titleInput?.trim() || newColumnTitle.trim()
    const position = columns.length
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
      .select('id, title, accent, position')
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
        cards: [],
      },
    ])

    setNewColumnTitle('')
  }

  async function renameColumn(columnId: string, title: string) {
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
  }

  async function deleteColumn(columnId: string) {
    const { error } = await supabase.from('columns').delete().eq('id', columnId)

    if (error) {
      setBoardError(error.message)
      return
    }

    setColumns((previousColumns) =>
      previousColumns.filter((column) => column.id !== columnId),
    )
  }

  function updateNewCardTitle(columnId: string, title: string) {
    setNewCardTitles((previousTitles) => ({
      ...previousTitles,
      [columnId]: title,
    }))
  }

  function updateNewCardClassification(
    columnId: string,
    classification: Classification,
  ) {
    setNewCardClassifications((previousClassifications) => ({
      ...previousClassifications,
      [columnId]: classification,
    }))
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id)
    const sourceColumnId = event.active.data.current?.columnId as string | undefined

    if (!sourceColumnId) return

    const sourceColumn = columns.find((column) => column.id === sourceColumnId)
    const card = sourceColumn?.cards.find((item) => item.id === activeId)

    if (card) {
      setActiveCard(card)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)

    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const sourceColumnId = active.data.current?.columnId as string | undefined
    const targetColumnId =
      (over.data.current?.columnId as string | undefined) ?? overId

    if (!sourceColumnId || !targetColumnId) return

    let nextColumns = columns

    if (sourceColumnId === targetColumnId) {
      if (activeId === overId) return

      nextColumns = normalizeCardPositions(
        columns.map((column) => {
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
      const sourceColumn = columns.find((column) => column.id === sourceColumnId)
      const targetColumn = columns.find((column) => column.id === targetColumnId)

      if (!sourceColumn || !targetColumn) return

      const movingCard = sourceColumn.cards.find((card) => card.id === activeId)
      if (!movingCard) return

      const isOverCard = over.data.current?.columnId !== undefined
      const targetIndex = isOverCard
        ? targetColumn.cards.findIndex((card) => card.id === overId)
        : targetColumn.cards.length

      nextColumns = normalizeCardPositions(
        columns.map((column) => {
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
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : 'Unable to save card order.')
    }
  }

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_16px_48px_rgba(15,23,42,0.10)] backdrop-blur-xl">
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
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-400 shadow-sm sm:w-[22rem]">
                <Search className="h-4 w-4" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search cards, classifications, or lane names"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </label>

              <button
                type="button"
                onClick={() => addColumn()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Add lane
              </button>

              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <span className="max-w-[12rem] truncate text-sm font-medium text-slate-600">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                  className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                >
                  <LogOut className="h-4 w-4" />
                </button>
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

        <main className="mt-6 flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {visibleColumns.length > 0 ? (
              <div className="overflow-x-auto pb-2">
                <div className="flex min-h-[42rem] items-start gap-4 pr-2">
                  {visibleColumns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      newCardTitle={newCardTitles[column.id] ?? ''}
                      newCardClassification={newCardClassifications[column.id] ?? 'Planning'}
                      onAddCard={addCard}
                      onDeleteCard={deleteCard}
                      onDeleteColumn={deleteColumn}
                      onRenameColumn={renameColumn}
                      onUpdateNewCardTitle={updateNewCardTitle}
                      onUpdateNewCardClassification={updateNewCardClassification}
                    />
                  ))}

                  <section className="w-[20rem] shrink-0 rounded-[28px] border border-dashed border-cyan-200 bg-white/80 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] backdrop-blur">
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
    </div>
  )
}

export default App
