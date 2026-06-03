import { useMemo, useState } from 'react'
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
  Plus,
  Search,
  X,
} from 'lucide-react'

type Classification = string

type Card = {
  id: string
  title: string
  description?: string
  due?: string
  classification: Classification
}

type Column = {
  id: string
  title: string
  accent: string
  cards: Card[]
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
  const [columns, setColumns] = useState(initialColumns)
  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({})
  const [newCardClassifications, setNewCardClassifications] = useState<
    Record<string, Classification>
  >({})
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCard, setActiveCard] = useState<Card | null>(null)

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

  function addCard(columnId: string) {
    const cardTitle = (newCardTitles[columnId] ?? '').trim()
    if (!cardTitle) return

    const classification = (newCardClassifications[columnId] ?? 'Planning').trim() || 'Planning'

    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [
                ...column.cards,
                {
                  id: crypto.randomUUID(),
                  title: cardTitle,
                  classification,
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

  function deleteCard(columnId: string, cardId: string) {
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

  function addColumn(titleInput?: string) {
    const title = titleInput?.trim() || newColumnTitle.trim()

    setColumns((previousColumns) => {
      const nextTitle = title || `Untitled lane ${previousColumns.length + 1}`

      return [
        ...previousColumns,
        {
          id: crypto.randomUUID(),
          title: nextTitle,
          accent: COLUMN_ACCENTS[previousColumns.length % COLUMN_ACCENTS.length],
          cards: [],
        },
      ]
    })

    setNewColumnTitle('')
  }

  function renameColumn(columnId: string, title: string) {
    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    )
  }

  function deleteColumn(columnId: string) {
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

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)

    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const sourceColumnId = active.data.current?.columnId as string | undefined
    const targetColumnId =
      (over.data.current?.columnId as string | undefined) ?? overId

    if (!sourceColumnId || !targetColumnId) return

    if (sourceColumnId === targetColumnId) {
      if (activeId === overId) return

      setColumns((previousColumns) =>
        previousColumns.map((column) => {
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
      return
    }

    setColumns((previousColumns) => {
      const sourceColumn = previousColumns.find(
        (column) => column.id === sourceColumnId,
      )
      const targetColumn = previousColumns.find(
        (column) => column.id === targetColumnId,
      )

      if (!sourceColumn || !targetColumn) return previousColumns

      const movingCard = sourceColumn.cards.find((card) => card.id === activeId)
      if (!movingCard) return previousColumns

      const isOverCard = over.data.current?.columnId !== undefined
      const targetIndex = isOverCard
        ? targetColumn.cards.findIndex((card) => card.id === overId)
        : targetColumn.cards.length

      return previousColumns.map((column) => {
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
      })
    })
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
