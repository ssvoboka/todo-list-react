import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/react/sortable'
import Icon from './Icon.jsx'
import { formatDueDate, MAX_LENGTH, PRIORITIES } from './taskData.js'

function TaskEditor({ task, onSave, onCancel }) {
  const [text, setText] = useState(task.text)
  const [priority, setPriority] = useState(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate ?? '')
  const editRef = useRef(null)
  useEffect(() => {
    editRef.current.focus()
    editRef.current.select()
  }, [])

  function submit(event) {
    event.preventDefault()
    if (!text.trim() || text.trim().length > MAX_LENGTH) return
    onSave(task.id, { text: text.trim(), priority, dueDate: dueDate || null })
  }
  return (
    <form
      className="task-editor"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel(task.id)
        }
      }}
    >
      <label className="visually-hidden" htmlFor={`edit-${task.id}`}>
        Название задачи
      </label>
      <input
        id={`edit-${task.id}`}
        className="edit-input"
        ref={editRef}
        value={text}
        maxLength={MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="editor-fields">
        <label>
          Приоритет
          <select
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
        <label>
          Срок
          <input
            type="date"
            value={dueDate}
            max="9999-12-31"
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
      </div>
      <div className="editor-actions">
        <button
          className="text-button"
          type="button"
          onClick={() => setDueDate('')}
          disabled={!dueDate}
        >
          Убрать срок
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onCancel(task.id)}
        >
          Отмена
        </button>
        <button className="save-button" type="submit" disabled={!text.trim()}>
          Сохранить
        </button>
      </div>
    </form>
  )
}

export default function TaskItem({
  task,
  index,
  today,
  isEditing,
  isRemoving,
  sortingDisabled,
  reducedMotion,
  onToggle,
  onDelete,
  onEdit,
  onSave,
  onCancelEdit,
  onMove,
}) {
  const bodyRef = useRef(null)
  const previousHeight = useRef(0)
  const { ref, handleRef, isDragSource } = useSortable({
    id: task.id,
    index,
    disabled: sortingDisabled,
    transition: reducedMotion
      ? null
      : { duration: 200, easing: 'ease-out', idle: true },
  })
  const isOverdue =
    !task.completed && task.dueDate !== null && task.dueDate < today
  const priority = PRIORITIES.find((item) => item.value === task.priority)
  useLayoutEffect(() => {
    const element = bodyRef.current
    const nextHeight = element.scrollHeight
    const fromHeight = previousHeight.current
    previousHeight.current = nextHeight
    if (reducedMotion || fromHeight === 0 || fromHeight === nextHeight) return
    const animation = element.animate(
      [{ height: `${fromHeight}px` }, { height: `${nextHeight}px` }],
      { duration: 180, easing: 'ease-out' },
    )
    return () => animation.cancel()
  }, [isEditing, reducedMotion])

  function rememberHeight() {
    previousHeight.current = bodyRef.current.getBoundingClientRect().height
  }
  return (
    <li
      ref={ref}
      data-task-id={task.id}
      className={`task-item${task.completed ? ' is-completed' : ''}${isRemoving ? ' is-removing' : ''}${isDragSource ? ' is-dragging' : ''}${isEditing ? ' is-editing' : ''}`}
    >
      <div className="task-inner" ref={bodyRef}>
        <div className="task-content">
          <button
            ref={handleRef}
            className="icon-button drag-handle"
            type="button"
            disabled={sortingDisabled}
            aria-label={`Изменить порядок задачи: ${task.text}`}
            aria-describedby="sort-hint"
            title="Перетащить. С клавиатуры: Alt + стрелки вверх/вниз"
            onKeyDown={(event) => {
              if (
                event.altKey &&
                ['ArrowUp', 'ArrowDown'].includes(event.key)
              ) {
                event.preventDefault()
                onMove(task.id, event.key === 'ArrowUp' ? -1 : 1)
              }
            }}
          >
            <Icon name="grip" size={18} />
          </button>
          {isEditing ? (
            <TaskEditor
              task={task}
              onSave={(id, changes) => {
                rememberHeight()
                onSave(id, changes)
              }}
              onCancel={(id) => {
                rememberHeight()
                onCancelEdit(id)
              }}
            />
          ) : (
            <>
              <label className="task-label">
                <span className="checkbox-target">
                  <input
                    className="task-checkbox"
                    type="checkbox"
                    checked={task.completed}
                    disabled={isRemoving}
                    onChange={(event) => onToggle(task, event)}
                  />
                </span>
                <span className="task-text">{task.text}</span>
              </label>
              <div className="task-details">
                <span className={`priority priority-${task.priority}`}>
                  <span className="priority-dot" aria-hidden="true" />
                  {priority.label}
                </span>
                {task.dueDate && (
                  <span className={`due-date${isOverdue ? ' is-overdue' : ''}`}>
                    <Icon name="calendar" size={14} />
                    <span>
                      {isOverdue && 'Просрочено · '}
                      <time dateTime={task.dueDate}>
                        {formatDueDate(task.dueDate, today)}
                      </time>
                    </span>
                  </span>
                )}
              </div>
              <div className="task-actions">
                <button
                  className="icon-button edit-button"
                  type="button"
                  aria-label={`Редактировать задачу: ${task.text}`}
                  title="Редактировать"
                  disabled={isRemoving}
                  onClick={() => {
                    rememberHeight()
                    onEdit(task.id)
                  }}
                >
                  <Icon name="edit" size={18} />
                </button>
                <button
                  className="icon-button delete-button"
                  type="button"
                  aria-label={`Удалить задачу: ${task.text}`}
                  title="Удалить"
                  disabled={isRemoving}
                  onClick={(event) => onDelete(task, event)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
