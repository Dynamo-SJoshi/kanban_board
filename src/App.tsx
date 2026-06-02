import { useState } from 'react'

const initialColumns = [
  {
    id: 'todo',
    title: 'To Do',
    cards: [
      { id: '1', title: 'Create project' },
      { id: '2', title: 'Build board UI' },
    ],
  },
  {
    id: 'doing',
    title: 'Doing',
    cards: [{ id: '3', title: 'Style with Tailwind' }],
  },
  {
    id: 'done',
    title: 'Done',
    cards: [{ id: '4', title: 'Install dependencies' }],
  },
]

function App() {
  const [columns, setColumns] = useState(initialColumns)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [newColumnTitle, setNewColumnTitle] = useState('')

  function addCard(columnId: string) {
    if (!newCardTitle.trim()) return

    setColumns((prevColumns) =>
      prevColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [
                ...column.cards,
                {
                  id: crypto.randomUUID(),
                  title: newCardTitle,
                },
              ],
            }
          : column,
      ),
    )

    setNewCardTitle('')
  }

  function deleteCard(columnId: string, cardId: string) {
    setColumns((prevColumns) =>
      prevColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.filter((card) => card.id !== cardId),
            }
          : column,
      ),
    )
  }

  function addColumn() {
    if (!newColumnTitle.trim()) return

    setColumns((prevColumns) => [
      ...prevColumns,
      {
        id: crypto.randomUUID(),
        title: newColumnTitle,
        cards: [],
      },
    ])

    setNewColumnTitle('')
  }

  return (
    <div className="min-h-screen bg-sky-700 text-white">
      <header className="flex h-14 items-center border-b border-white/20 px-4">
        <h1 className="text-lg font-bold">Trello Clone</h1>
      </header>

      <main className="overflow-x-auto p-4">
        <div className="flex items-start gap-4">
          {columns.map((column) => (
            <div
              key={column.id}
              className="w-72 shrink-0 rounded-md bg-neutral-100 p-3 text-black"
            >
              <h2 className="mb-3 font-semibold">{column.title}</h2>

              <div className="space-y-2">
                {column.cards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-start justify-between gap-2 rounded-md bg-white p-3 text-sm shadow"
                  >
                    <span>{card.title}</span>

                    <button
                      onClick={() => deleteCard(column.id, card.id)}
                      className="rounded px-2 text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>

              <input
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                className="mt-3 w-full rounded-md border border-neutral-300 p-2 text-sm text-black outline-none focus:border-blue-500"
                placeholder="Add a card"
              />

              <button
                onClick={() => addCard(column.id)}
                className="mt-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add Card
              </button>
            </div>
          ))}

          <div className="w-72 shrink-0 rounded-md bg-white/20 p-3">
            <input
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              className="w-full rounded-md border border-white/30 bg-white/90 p-2 text-sm text-black outline-none focus:border-blue-500"
              placeholder="Add another list"
            />

            <button
              onClick={addColumn}
              className="mt-2 w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-neutral-100"
            >
              Add List
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App