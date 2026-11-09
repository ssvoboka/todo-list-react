import { useEffect, useRef, useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import {
  Accessibility,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from '@dnd-kit/dom'
import TaskItem from './TaskItem.jsx'
import Icon from './Icon.jsx'
import {
  BACKUP_KEY,
  getToday,
  MAX_LENGTH,
  PRIORITIES,
  readSavedTasks,
  STORAGE_KEY,
  THEME_KEY,
} from './taskData.js'
import './App.css'

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'completed', label: 'Выполненные' },
]
const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 220, tolerance: 6 })]
        : [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
  KeyboardSensor,
]

export default function App() {
  const [initialData] = useState(readSavedTasks)
  const [tasks, setTasks] = useState(initialData.tasks)
  const [text, setText] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme,
  )
  const [today, setToday] = useState(getToday)
  const [editingId, setEditingId] = useState(null)
  const [removingIds, setRemovingIds] = useState([])
  const [storageNotice, setStorageNotice] = useState(initialData.notice)
  const [themeNotice, setThemeNotice] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const inputRef = useRef(null)
  const searchRef = useRef(null)
  const deleteTimers = useRef(new Set())

  useEffect(() => {
    if (tasks === initialData.tasks && removingIds.length === 0) return
    try {
      // Сохраняем исходный формат V1 перед первой записью расширенных задач.
      if (
        initialData.backup !== null &&
        localStorage.getItem(BACKUP_KEY) === null
      ) {
        localStorage.setItem(BACKUP_KEY, initialData.backup)
      }
      // Удаление сохраняется сразу; строка остаётся на 180 мс только для анимации.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(tasks.filter((task) => !removingIds.includes(task.id))),
      )
      // Сообщение отражает результат записи во внешнее хранилище.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageNotice('')
    } catch {
      setStorageNotice(
        'Не удалось сохранить задачи. Они доступны только на этой странице.',
      )
    }
  }, [tasks, initialData, removingIds])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (
        event.key === '/' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.target.isContentEditable &&
        !event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      ) {
        event.preventDefault()
        searchRef.current.focus()
      }
    }
    const updateDay = () => setToday(getToday())
    const interval = setInterval(updateDay, 60_000)
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const onMotionChange = () => setReducedMotion(media.matches)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('focus', updateDay)
    media.addEventListener('change', onMotionChange)
    const timers = deleteTimers.current
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('focus', updateDay)
      media.removeEventListener('change', onMotionChange)
      clearInterval(interval)
      timers.forEach(clearTimeout)
    }
  }, [])

  const completedCount = tasks.filter((task) => task.completed).length
  const percentage =
    tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100)
  const searchText = query.trim().toLocaleLowerCase('ru-RU')
  const visibleTasks = tasks.filter(
    (task) =>
      (filter === 'all' ||
        (filter === 'completed' ? task.completed : !task.completed)) &&
      task.text.toLocaleLowerCase('ru-RU').includes(searchText),
  )
  const sortingDisabled =
    filter !== 'all' ||
    !!searchText ||
    editingId !== null ||
    removingIds.length > 0

  function changeTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]').content =
      next === 'dark' ? '#191e1a' : '#f3f2e9'
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
      setThemeNotice('')
    } catch {
      setThemeNotice('Выбранная тема не сохранится после закрытия страницы.')
    }
  }

  function addTask(event) {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || trimmedText.length > MAX_LENGTH) return
    setTasks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text: trimmedText,
        completed: false,
        priority,
        dueDate: dueDate || null,
      },
    ])
    setText('')
    setPriority('medium')
    setDueDate('')
    if (filter === 'completed') setFilter('all')
    setQuery('')
    setAnnouncement(`Добавлена задача: ${trimmedText}`)
    inputRef.current.focus()
  }

  function focusNeighbour(control) {
    const row = control.closest('li')
    let next = row.nextElementSibling
    let previous = row.previousElementSibling
    while (next?.classList.contains('is-removing'))
      next = next.nextElementSibling
    while (previous?.classList.contains('is-removing'))
      previous = previous.previousElementSibling
    const nextControl =
      next?.querySelector('.task-checkbox') ??
      previous?.querySelector('.task-checkbox') ??
      inputRef.current
    nextControl.focus()
  }

  function toggleTask(task, event) {
    if (filter !== 'all') focusNeighbour(event.currentTarget)
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, completed: !item.completed } : item,
      ),
    )
    setAnnouncement(
      task.completed ? 'Задача возвращена в активные.' : 'Задача выполнена.',
    )
  }

  function deleteTask(task, event) {
    focusNeighbour(event.currentTarget)
    setRemovingIds((current) => [...current, task.id])
    const timer = setTimeout(
      () => {
        setTasks((current) => current.filter((item) => item.id !== task.id))
        setRemovingIds((current) => current.filter((id) => id !== task.id))
        setAnnouncement(`Удалена задача: ${task.text}`)
        deleteTimers.current.delete(timer)
      },
      reducedMotion ? 0 : 180,
    )
    deleteTimers.current.add(timer)
  }

  function finishEditing(id) {
    setEditingId(null)
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-task-id="${CSS.escape(id)}"] .edit-button`)
        ?.focus(),
    )
  }

  function saveTask(id, changes) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...changes } : task)),
    )
    setAnnouncement('Изменения сохранены.')
    finishEditing(id)
    if (
      searchText &&
      !changes.text.toLocaleLowerCase('ru-RU').includes(searchText)
    )
      searchRef.current.focus()
  }

  function moveTask(id, direction) {
    if (sortingDisabled) return
    setTasks((current) => {
      const from = current.findIndex((task) => task.id === id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.length) return current
      const reordered = [...current]
      const [task] = reordered.splice(from, 1)
      reordered.splice(to, 0, task)
      return reordered
    })
    setAnnouncement('Порядок задач изменён.')
  }

  function handleDragEnd(event) {
    if (event.canceled || sortingDisabled) return
    const { source } = event.operation
    if (!isSortable(source) || source.initialIndex === source.index) return
    const { initialIndex, index } = source
    setTasks((current) => {
      const reordered = [...current]
      const [task] = reordered.splice(initialIndex, 1)
      reordered.splice(index, 0, task)
      return reordered
    })
    setAnnouncement('Порядок задач изменён.')
  }

  const emptyTitle = searchText
    ? 'Ничего не найдено'
    : tasks.length === 0
      ? 'Пока нет задач'
      : filter === 'active'
        ? 'Все задачи выполнены'
        : 'Нет выполненных задач'
  const emptyDescription = searchText
    ? 'Попробуйте другой запрос или измените фильтр.'
    : tasks.length === 0
      ? 'Добавьте первое дело — и можно начинать.'
      : filter === 'active'
        ? 'Можно передохнуть или добавить новую.'
        : 'Готовые дела появятся здесь.'

  return (
    <main className="workspace">
      <header className="page-header">
        <h1>Мои задачи</h1>
        <button
          className="theme-button"
          type="button"
          onClick={changeTheme}
          aria-label={
            theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'
          }
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
        </button>
      </header>
      <div className="board">
        <aside className="composer-column" aria-label="Добавление и прогресс">
          <form className="task-form" onSubmit={addTask}>
            <div className="field-heading">
              <label htmlFor="new-task">Новая задача</label>
              <span className="character-count" id="length-hint">
                {text.length} / {MAX_LENGTH}
              </span>
            </div>
            <input
              id="new-task"
              ref={inputRef}
              className="task-input"
              type="text"
              placeholder="Что сделать?"
              value={text}
              maxLength={MAX_LENGTH}
              aria-describedby="length-hint"
              autoComplete="off"
              onChange={(event) => setText(event.target.value)}
            />
            <div className="new-task-options">
              <label htmlFor="new-priority">
                Приоритет
                <select
                  id="new-priority"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {PRIORITIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="new-due-date">
                Срок
                <input
                  id="new-due-date"
                  type="date"
                  value={dueDate}
                  max="9999-12-31"
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>
            </div>
            <button
              className="add-button"
              type="submit"
              disabled={!text.trim()}
            >
              <Icon name="plus" size={18} />
              Добавить
            </button>
          </form>
          <section className="progress-panel" aria-label="Прогресс задач">
            <div className="progress-heading">
              <h2>Прогресс</h2>
              <span className="progress-percent">
                {percentage}
                <span>%</span>
              </span>
            </div>
            <p className="task-summary" role="status">
              Выполнено {completedCount} из {tasks.length}
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Выполнение всех задач"
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${percentage}%` }} />
            </div>
          </section>
          <p className="keyboard-hint">
            <kbd>/</kbd> Поиск <span>·</span> <kbd>Alt + стрелки</kbd> Порядок
          </p>
        </aside>
        <section className="tasks-section" aria-label="Список задач">
          <div className="list-toolbar">
            <nav className="filters" aria-label="Фильтры задач">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  className="filter-button"
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => {
                    setFilter(item.value)
                    setEditingId(null)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="search-field">
              <Icon name="search" size={18} />
              <input
                ref={searchRef}
                type="search"
                aria-label="Поиск задач"
                placeholder="Поиск задач"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setEditingId(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    if (query) setQuery('')
                    else searchRef.current.blur()
                  }
                }}
              />
              {query && (
                <button
                  className="icon-button clear-search"
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => {
                    setQuery('')
                    searchRef.current.focus()
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          </div>
          {visibleTasks.length > 0 ? (
            <DragDropProvider
              sensors={sensors}
              onDragEnd={handleDragEnd}
              plugins={(defaults) => [
                ...defaults.filter(
                  (plugin) => plugin !== Accessibility && plugin !== Feedback,
                ),
                Accessibility.configure({
                  screenReaderInstructions: {
                    draggable:
                      'Для перемещения нажмите пробел, используйте стрелки и снова пробел. Escape отменяет перемещение. Также доступны Alt и стрелки вверх или вниз.',
                  },
                  announcements: {
                    dragstart: () => 'Задача выбрана для перемещения.',
                    dragend: (event) =>
                      event.canceled
                        ? 'Перемещение отменено.'
                        : 'Перемещение завершено.',
                  },
                }),
                Feedback.configure({
                  dropAnimation: reducedMotion
                    ? null
                    : { duration: 180, easing: 'ease-out' },
                  keyboardTransition: reducedMotion
                    ? null
                    : { duration: 180, easing: 'ease-out' },
                }),
              ]}
            >
              <ul className="task-list">
                {visibleTasks.map((task, index) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    index={index}
                    today={today}
                    isEditing={editingId === task.id}
                    isRemoving={removingIds.includes(task.id)}
                    sortingDisabled={sortingDisabled}
                    reducedMotion={reducedMotion}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onEdit={setEditingId}
                    onSave={saveTask}
                    onCancelEdit={finishEditing}
                    onMove={moveTask}
                  />
                ))}
              </ul>
            </DragDropProvider>
          ) : (
            <div className="empty-state">
              <h2>{emptyTitle}</h2>
              <p>{emptyDescription}</p>
              <button
                className="empty-action"
                type="button"
                onClick={() => {
                  if (searchText) {
                    setQuery('')
                    searchRef.current.focus()
                  } else inputRef.current.focus()
                }}
              >
                {searchText ? 'Сбросить запрос' : 'Добавить задачу'}
              </button>
            </div>
          )}
          <p
            className={visibleTasks.length ? 'sort-hint' : 'visually-hidden'}
            id="sort-hint"
          >
            {filter !== 'all' || searchText
              ? 'Чтобы менять порядок, выберите «Все» и очистите поиск.'
              : 'Порядок задач можно менять за ручку слева.'}
          </p>
        </section>
      </div>
      <footer className="storage-note">
        {storageNotice ? (
          <p className="storage-warning" role="status">
            {storageNotice}
          </p>
        ) : (
          <p>Задачи сохраняются в этом браузере.</p>
        )}
        {themeNotice && (
          <p className="storage-warning" role="status">
            {themeNotice}
          </p>
        )}
      </footer>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </main>
  )
}
