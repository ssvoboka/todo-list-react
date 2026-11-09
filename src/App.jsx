import { useEffect, useRef, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'todo-list.tasks.v1'
const MAX_LENGTH = 200
const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'completed', label: 'Выполненные' },
]

function readSavedTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === null) return { tasks: [], notice: '' }

    const tasks = JSON.parse(saved)
    const ids = new Set()
    const isValid = Array.isArray(tasks) && tasks.every((task) => {
      if (!task || typeof task.id !== 'string' || !task.id || ids.has(task.id)
        || typeof task.text !== 'string' || !task.text.trim()
        || task.text.length > MAX_LENGTH || typeof task.completed !== 'boolean') {
        return false
      }
      ids.add(task.id)
      return true
    })

    if (!isValid) throw new SyntaxError('Invalid saved tasks')
    return { tasks, notice: '' }
  } catch (error) {
    return {
      tasks: [],
      notice: error instanceof SyntaxError
        ? 'Сохранённый список повреждён. Можно начать новый.'
        : 'Хранилище недоступно. Задачи будут доступны только на этой странице.',
    }
  }
}

export default function App() {
  const [initialData] = useState(readSavedTasks)
  const [tasks, setTasks] = useState(initialData.tasks)
  const [text, setText] = useState('')
  const [filter, setFilter] = useState('all')
  const [storageNotice, setStorageNotice] = useState(initialData.notice)
  const [announcement, setAnnouncement] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    // Не перезаписываем хранилище при открытии, в том числе повреждённые данные.
    if (tasks === initialData.tasks) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
      // Результат записи во внешнее хранилище определяет сообщение пользователю.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageNotice('')
    } catch {
      setStorageNotice('Не удалось сохранить задачи. Они доступны только на этой странице.')
    }
  }, [tasks, initialData.tasks])

  const completedCount = tasks.filter((task) => task.completed).length
  const visibleTasks = tasks.filter((task) => (
    filter === 'all' || (filter === 'completed' ? task.completed : !task.completed)
  ))

  function addTask(event) {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || trimmedText.length > MAX_LENGTH) return

    setTasks((current) => [
      ...current,
      { id: crypto.randomUUID(), text: trimmedText, completed: false },
    ])
    setText('')
    // Новая активная задача должна быть видна и из фильтра выполненных.
    if (filter === 'completed') setFilter('all')
    setAnnouncement(`Добавлена задача: ${trimmedText}`)
    inputRef.current.focus()
  }

  function focusNeighbour(control) {
    const row = control.closest('li')
    const nextControl = row.nextElementSibling?.querySelector('input')
      ?? row.previousElementSibling?.querySelector('input')
      ?? inputRef.current
    nextControl.focus()
  }

  function toggleTask(task, event) {
    if (filter !== 'all') focusNeighbour(event.currentTarget)
    setTasks((current) => current.map((item) => (
      item.id === task.id ? { ...item, completed: !item.completed } : item
    )))
    setAnnouncement(task.completed ? 'Задача возвращена в активные.' : 'Задача выполнена.')
  }

  function deleteTask(task, event) {
    focusNeighbour(event.currentTarget)
    setTasks((current) => current.filter((item) => item.id !== task.id))
    setAnnouncement(`Удалена задача: ${task.text}`)
  }

  const emptyTitle = tasks.length === 0
    ? 'Пока нет задач'
    : filter === 'active' ? 'Все задачи выполнены' : 'Нет выполненных задач'
  const emptyDescription = tasks.length === 0
    ? 'Добавьте первую задачу в поле выше.'
    : filter === 'active' ? 'Можно передохнуть или добавить новую.' : 'Отметьте готовую задачу — она появится здесь.'

  return (
    <main className="workspace">
      <header className="page-header">
        <h1>Мои задачи</h1>
        <p className="task-summary" role="status">Выполнено {completedCount} из {tasks.length}</p>
      </header>

      <form className="task-form" onSubmit={addTask}>
        <div className="field-heading">
          <label htmlFor="new-task">Новая задача</label>
          <span className="character-count" id="length-hint">{text.length} / {MAX_LENGTH}</span>
        </div>
        <div className="input-row">
          <input
            id="new-task"
            ref={inputRef}
            className="task-input"
            type="text"
            placeholder="Что нужно сделать?"
            value={text}
            maxLength={MAX_LENGTH}
            aria-describedby="length-hint"
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
          />
          <button className="add-button" type="submit" disabled={!text.trim()}>Добавить</button>
        </div>
      </form>

      <section className="tasks-section" aria-label="Список задач">
        <nav className="filters" aria-label="Фильтры задач">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              className="filter-button"
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {visibleTasks.length > 0 ? (
          <ul className="task-list">
            {visibleTasks.map((task) => (
              <li className={`task-item${task.completed ? ' is-completed' : ''}`} key={task.id}>
                <label className="task-label">
                  <span className="checkbox-target">
                    <input
                      className="task-checkbox"
                      type="checkbox"
                      checked={task.completed}
                      onChange={(event) => toggleTask(task, event)}
                    />
                  </span>
                  <span className="task-text">{task.text}</span>
                </label>
                <button
                  className="delete-button"
                  type="button"
                  aria-label={`Удалить задачу: ${task.text}`}
                  title="Удалить задачу"
                  onClick={(event) => deleteTask(task, event)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <h2>{emptyTitle}</h2>
            <p>{emptyDescription}</p>
          </div>
        )}
      </section>

      <footer className="storage-note">
        {storageNotice ? <p className="storage-warning" role="status">{storageNotice}</p>
          : <p>Задачи сохраняются в этом браузере.</p>}
      </footer>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  )
}
