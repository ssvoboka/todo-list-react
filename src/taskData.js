export const STORAGE_KEY = 'todo-list.tasks.v1'
export const BACKUP_KEY = 'todo-list.tasks.v1.backup'
export const THEME_KEY = 'todo-list.theme'
export const MAX_LENGTH = 200
export const PRIORITIES = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
]

export function getToday() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const date = new Date(`${value}T12:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

export function formatDueDate(value, today) {
  if (value === today) return 'Сегодня'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(value.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  }).format(new Date(`${value}T12:00:00`))
}

export function readSavedTasks() {
  let saved = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
    if (saved === null) return { tasks: [], notice: '', backup: null }
    const tasks = JSON.parse(saved)
    const ids = new Set()
    const isValid =
      Array.isArray(tasks) &&
      tasks.every((task) => {
        if (
          !task ||
          typeof task.id !== 'string' ||
          !task.id ||
          ids.has(task.id) ||
          typeof task.text !== 'string' ||
          !task.text.trim() ||
          task.text.length > MAX_LENGTH ||
          typeof task.completed !== 'boolean'
        )
          return false
        ids.add(task.id)
        return true
      })
    if (!isValid) throw new SyntaxError('Invalid saved tasks')
    const needsMigration = tasks.some(
      (task) => !('priority' in task) || !('dueDate' in task),
    )
    return {
      tasks: tasks.map((task) => ({
        ...task,
        priority: PRIORITIES.some((item) => item.value === task.priority)
          ? task.priority
          : 'medium',
        dueDate: isValidDate(task.dueDate) ? task.dueDate : null,
      })),
      notice: '',
      backup: needsMigration ? saved : null,
    }
  } catch (error) {
    return {
      tasks: [],
      backup: saved,
      notice:
        error instanceof SyntaxError
          ? 'Сохранённый список повреждён. Можно начать новый.'
          : 'Хранилище недоступно. Задачи будут доступны только на этой странице.',
    }
  }
}
