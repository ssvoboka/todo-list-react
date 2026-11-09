import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const KEY = 'todo-list.tasks.v1'
const THEME_KEY = 'todo-list.theme'
const sample = [
  {
    id: 'a',
    text: 'Подготовить резюме',
    completed: false,
    priority: 'high',
    dueDate: '2026-11-09',
  },
  {
    id: 'b',
    text: 'Проверить React portfolio',
    completed: true,
    priority: 'medium',
    dueDate: '2026-11-10',
  },
  {
    id: 'c',
    text: 'Прочитать заметки',
    completed: false,
    priority: 'low',
    dueDate: null,
  },
]

async function saved(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY)
}
async function settleAnimations(page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
}
async function loadTasks(page, tasks = sample) {
  await page.evaluate(
    ({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)),
    { key: KEY, tasks },
  )
  await page.reload()
  await expect(page.locator('.task-text')).toHaveCount(tasks.length)
}
async function add(page, text) {
  await page.getByLabel('Новая задача').fill(text)
  await page.getByLabel('Новая задача').press('Enter')
}
async function edit(page, text) {
  await page
    .getByRole('button', { name: `Редактировать задачу: ${text}`, exact: true })
    .click()
}

test.beforeEach(async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => errors.push(request.url()))
  page.testErrors = errors
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои задачи' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
})
test.afterEach(async ({ page }) => {
  expect(page.testErrors).toEqual([])
})

test('тема следует системе до первого выбора, применяется до DOMContentLoaded и сохраняется', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.initialTheme = document.documentElement.dataset.theme
    })
  })
  await page.reload()
  expect(await page.evaluate(() => window.initialTheme)).toBe('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page.evaluate((key) => localStorage.getItem(key), THEME_KEY),
  ).toBeNull()
  await page.getByRole('button', { name: 'Включить светлую тему' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(
    await page.evaluate((key) => localStorage.getItem(key), THEME_KEY),
  ).toBe('light')
  await page.reload()
  expect(await page.evaluate(() => window.initialTheme)).toBe('light')
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('переключение темы без reload сохраняет текущую работу и меняет поверхности', async ({
  page,
}) => {
  await loadTasks(page)
  await page.getByLabel('Новая задача').fill('Черновик')
  await page.evaluate(() => {
    window.marker = 'same-page'
  })
  const before = await page
    .locator('.tasks-section')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await expect(page.locator('.tasks-section')).not.toHaveCSS(
    'background-color',
    before,
  )
  expect(await page.evaluate(() => window.marker)).toBe('same-page')
  await expect(page.getByLabel('Новая задача')).toHaveValue('Черновик')
  await expect(page.locator('.task-text')).toHaveCount(3)
})

test('неверная тема и запрет её сохранения не ломают переключение', async ({
  page,
}) => {
  await page.evaluate((key) => localStorage.setItem(key, 'invalid'), THEME_KEY)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'todo-list.theme')
        throw new DOMException('Blocked', 'SecurityError')
      return original.call(this, key, value)
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(
    page.getByText('Выбранная тема не сохранится после закрытия страницы.'),
  ).toBeVisible()
})

test('миграция V1 сохраняет id, статусы, порядок и резервную копию исходных данных', async ({
  page,
}) => {
  const legacy = [
    {
      id: 'old-2',
      text: 'Вторая по имени, первая по порядку',
      completed: true,
    },
    { id: 'old-1', text: 'Старая задача', completed: false },
  ]
  await loadTasks(page, legacy)
  expect(await saved(page)).toEqual(legacy)
  await expect(page.locator('.priority')).toHaveText(['Средний', 'Средний'])
  await expect(page.getByRole('checkbox').first()).toBeChecked()
  await add(page, 'Новая задача V2')
  const result = await saved(page)
  expect(result.slice(0, 2)).toEqual(
    legacy.map((task) => ({ ...task, priority: 'medium', dueDate: null })),
  )
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('todo-list.tasks.v1.backup')),
    ),
  ).toEqual(legacy)
  await page.reload()
  expect((await saved(page)).map((task) => task.id)).toEqual([
    'old-2',
    'old-1',
    result[2].id,
  ])
  await expect(page.getByRole('checkbox').first()).toBeChecked()
})

test('входные приоритеты и даты проверяются без потери остальных свойств', async ({
  page,
}) => {
  await loadTasks(page, [
    {
      id: 'safe',
      text: 'Сохранить задачу',
      completed: true,
      priority: 'unknown',
      dueDate: '2026-02-30',
    },
  ])
  await expect(page.locator('.priority')).toHaveText('Средний')
  await expect(page.locator('time')).toHaveCount(0)
  await edit(page, 'Сохранить задачу')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  expect(await saved(page)).toEqual([
    {
      id: 'safe',
      text: 'Сохранить задачу',
      completed: true,
      priority: 'medium',
      dueDate: null,
    },
  ])
})

test('создание с тремя приоритетами, сроком и возвратом значений формы к умолчаниям', async ({
  page,
}) => {
  await page.locator('#new-priority').selectOption('high')
  await page.locator('#new-due-date').fill('2026-12-15')
  await add(page, 'Высокий приоритет')
  await expect(page.locator('#new-priority')).toHaveValue('medium')
  await expect(page.locator('#new-due-date')).toHaveValue('')
  await add(page, 'Средний приоритет')
  await page.locator('#new-priority').selectOption('low')
  await add(page, 'Низкий приоритет')
  expect(
    (await saved(page)).map((task) => [task.priority, task.dueDate]),
  ).toEqual([
    ['high', '2026-12-15'],
    ['medium', null],
    ['low', null],
  ])
  await page.reload()
  await expect(page.locator('.priority')).toHaveText([
    'Высокий',
    'Средний',
    'Низкий',
  ])
  await expect(page.locator('time')).toHaveAttribute('datetime', '2026-12-15')
})

test('Enter сохраняет обрезанное название и свойства выполненной задачи', async ({
  page,
}) => {
  await loadTasks(page)
  await edit(page, sample[1].text)
  const input = page.getByLabel('Название задачи')
  await expect(input).toBeFocused()
  await input.fill('  Новый текст выполненной задачи  ')
  await page.locator('.task-editor').getByLabel('Приоритет').selectOption('low')
  await page.locator('.task-editor').getByLabel('Срок').fill('2027-01-15')
  await input.press('Enter')
  const result = await saved(page)
  expect(result[1]).toEqual({
    ...sample[1],
    text: 'Новый текст выполненной задачи',
    priority: 'low',
    dueDate: '2027-01-15',
  })
  expect(result[0]).toEqual(sample[0])
  expect(result[2]).toEqual(sample[2])
  await expect(
    page.getByRole('checkbox', { name: 'Новый текст выполненной задачи' }),
  ).toBeChecked()
  await expect(
    page.getByRole('button', {
      name: 'Редактировать задачу: Новый текст выполненной задачи',
    }),
  ).toBeFocused()
  await page.reload()
  expect(await saved(page)).toEqual(result)
})

test('Escape отменяет текст, приоритет и дату; пустое название не сохраняется', async ({
  page,
}) => {
  await loadTasks(page)
  await edit(page, sample[0].text)
  await page.getByLabel('Название задачи').fill('Черновик')
  await page.locator('.task-editor').getByLabel('Приоритет').selectOption('low')
  await page.locator('.task-editor').getByLabel('Срок').fill('2027-01-01')
  await page.getByLabel('Название задачи').press('Escape')
  expect(await saved(page)).toEqual(sample)
  await edit(page, sample[0].text)
  await page.getByLabel('Название задачи').fill('   ')
  await expect(
    page.getByRole('button', { name: 'Сохранить', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Название задачи').press('Enter')
  await expect(page.getByLabel('Название задачи')).toBeVisible()
  expect(await saved(page)).toEqual(sample)
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await edit(page, sample[0].text)
  await page.getByLabel('Название задачи').fill('Я'.repeat(240))
  await expect(page.getByLabel('Название задачи')).toHaveValue('Я'.repeat(200))
})

test('изменение и удаление дедлайна сохраняются', async ({ page }) => {
  await loadTasks(page)
  await edit(page, sample[0].text)
  await page.locator('.task-editor').getByLabel('Срок').fill('2026-12-30')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('time').first()).toHaveAttribute(
    'datetime',
    '2026-12-30',
  )
  await edit(page, sample[0].text)
  await page.getByRole('button', { name: 'Убрать срок' }).click()
  await expect(page.locator('.task-editor').getByLabel('Срок')).toHaveValue('')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  expect((await saved(page))[0].dueDate).toBeNull()
  await page.reload()
  await expect(page.locator('[data-task-id="a"] time')).toHaveCount(0)
})

test('просрочка: вчера, сегодня, завтра, выполненное и переход через полночь', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-10T20:30:00Z') })
  await loadTasks(page, [
    { ...sample[0], dueDate: '2026-11-09' },
    { ...sample[1], completed: false, dueDate: '2026-11-10' },
    { ...sample[2], dueDate: '2026-11-11' },
    {
      id: 'd',
      text: 'Уже готово',
      completed: true,
      priority: 'medium',
      dueDate: '2026-11-01',
    },
  ])
  await expect(page.locator('.is-overdue')).toHaveCount(1)
  await expect(page.locator('[data-task-id="b"] time')).toHaveText('Сегодня')
  await page.clock.fastForward(60 * 60 * 1000)
  await expect(page.locator('.is-overdue')).toHaveCount(2)
  await expect(page.locator('[data-task-id="c"] time')).toHaveText('Сегодня')
  await expect(page.locator('[data-task-id="d"] .is-overdue')).toHaveCount(0)
})

test('прогресс считается от всего списка при поиске и фильтрах, ноль и сто процентов', async ({
  page,
}) => {
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '0',
  )
  await loadTasks(page)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '33',
  )
  await page.getByRole('button', { name: 'Выполненные', exact: true }).click()
  await page.getByRole('searchbox').fill('portfolio')
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 1 из 3')
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '33',
  )
  await page.getByRole('button', { name: 'Все', exact: true }).click()
  await page
    .getByRole('button', { name: 'Очистить поиск', exact: true })
    .click()
  await page.getByRole('checkbox').first().check()
  await page.getByRole('checkbox').last().check()
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '100',
  )
})

test('поиск русских и английских названий, фильтры, очистка и удаление результата', async ({
  page,
}) => {
  await loadTasks(page)
  const search = page.getByRole('searchbox')
  await search.fill('рЕзЮмЕ')
  await expect(page.locator('.task-text')).toHaveText([sample[0].text])
  await search.fill('REACT')
  await expect(page.locator('.task-text')).toHaveText([sample[1].text])
  await page.getByRole('button', { name: 'Активные', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Ничего не найдено' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Выполненные', exact: true }).click()
  await expect(page.locator('.task-text')).toHaveText([sample[1].text])
  await expect(page.locator('.drag-handle')).toBeDisabled()
  expect(await saved(page)).toEqual(sample)
  await page
    .getByRole('button', { name: `Удалить задачу: ${sample[1].text}` })
    .click()
  await expect(page.locator('.task-text')).toHaveCount(0)
  expect((await saved(page)).map((task) => task.id)).toEqual(['a', 'c'])
  await page.reload()
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Все', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.task-text')).toHaveCount(2)
})

test('горячие клавиши: поиск, Escape и обычный ввод / в текстовых полях', async ({
  page,
}) => {
  await page.getByRole('heading', { name: 'Мои задачи' }).click()
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('searchbox').fill('Запрос')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('searchbox')).not.toBeFocused()
  await page.getByLabel('Новая задача').focus()
  await page.keyboard.press('/')
  await expect(page.getByLabel('Новая задача')).toHaveValue('/')
  await add(page, 'Обычная задача')
  await edit(page, 'Обычная задача')
  await page.getByLabel('Название задачи').fill('')
  await page.keyboard.press('/')
  await expect(page.getByLabel('Название задачи')).toHaveValue('/')
  await expect(page.getByLabel('Название задачи')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.task-text')).toHaveText('Обычная задача')
})

test('Alt + стрелки меняют порядок с клавиатуры и сохраняют все свойства', async ({
  page,
}) => {
  await loadTasks(page)
  const handle = page.getByRole('button', {
    name: `Изменить порядок задачи: ${sample[0].text}`,
  })
  await handle.focus()
  await handle.press('Alt+ArrowDown')
  await expect(page.locator('.task-text')).toHaveText([
    sample[1].text,
    sample[0].text,
    sample[2].text,
  ])
  await expect(handle).toBeFocused()
  expect(await saved(page)).toEqual([sample[1], sample[0], sample[2]])
  await page.reload()
  await expect(page.locator('.task-text')).toHaveText([
    sample[1].text,
    sample[0].text,
    sample[2].text,
  ])
  await page.getByRole('button', { name: 'Активные', exact: true }).click()
  for (const button of await page.locator('.drag-handle').all())
    await expect(button).toBeDisabled()
  await expect(
    page.getByText('Чтобы менять порядок, выберите «Все» и очистите поиск.'),
  ).toBeVisible()
})

test('перетаскивание мышью меняет порядок без выполнения или удаления', async ({
  page,
}) => {
  test.skip(
    !!test.info().project.use.isMobile,
    'Мышь проверяется в настольных профилях',
  )
  await loadTasks(page)
  const from = await page.locator('.drag-handle').first().boundingBox()
  const to = await page.locator('.task-item').last().boundingBox()
  await page.mouse.move(from.x + 22, from.y + 22)
  await page.mouse.down()
  await page.mouse.move(from.x + 22, from.y + 30, { steps: 3 })
  await expect(page.locator('.is-dragging').first()).toBeVisible()
  await page.mouse.move(to.x + 70, to.y + to.height - 10, { steps: 15 })
  await page.mouse.up()
  await expect(page.locator('.task-text')).toHaveText([
    sample[1].text,
    sample[2].text,
    sample[0].text,
  ])
  expect(await saved(page)).toEqual([sample[1], sample[2], sample[0]])
  await page.reload()
  await expect(page.locator('.task-text')).toHaveText([
    sample[1].text,
    sample[2].text,
    sample[0].text,
  ])
})

test('отмена перетаскивания Escape сохраняет первоначальный порядок', async ({
  page,
}) => {
  test.skip(
    !!test.info().project.use.isMobile,
    'Мышь проверяется в настольных профилях',
  )
  await loadTasks(page)
  const from = await page.locator('.drag-handle').first().boundingBox()
  const to = await page.locator('.task-item').last().boundingBox()
  await page.mouse.move(from.x + 22, from.y + 22)
  await page.mouse.down()
  await page.mouse.move(from.x + 22, from.y + 30, { steps: 3 })
  await expect(page.locator('.is-dragging').first()).toBeVisible()
  await page.mouse.move(to.x + 70, to.y + to.height - 10, { steps: 15 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('.task-text')).toHaveText(
    sample.map((task) => task.text),
  )
  expect(await saved(page)).toEqual(sample)
})

test('быстрые добавления и удаление нескольких задач подряд', async ({
  page,
}) => {
  for (let i = 0; i < 10; i += 1) await add(page, `Быстрая ${i}`)
  const before = await saved(page)
  expect(new Set(before.map((task) => task.id)).size).toBe(10)
  await page
    .getByRole('button', { name: 'Удалить задачу: Быстрая 0', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Удалить задачу: Быстрая 1', exact: true })
    .click()
  await expect(page.locator('.task-text')).toHaveCount(8)
  expect((await saved(page)).map((task) => task.text)).toEqual(
    Array.from({ length: 8 }, (_, i) => `Быстрая ${i + 2}`),
  )
})

for (const theme of ['light', 'dark']) {
  test(`axe и скриншоты: ${theme}, редактирование, сроки и приоритеты`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-11-10T09:00:00Z') })
    await loadTasks(page)
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
    await settleAnimations(page)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.screenshot({
      path: `artifacts/screenshots/v2-${theme}-${test.info().project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await edit(page, sample[0].text)
    await settleAnimations(page)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/screenshots/v2-edit-${theme}-${test.info().project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByLabel('Название задачи').press('Escape')
  })
}

test('узкий экран с уменьшенной высотой: форма, срок, редактирование и сохранение доступны', async ({
  page,
}) => {
  test.skip(!test.info().project.use.isMobile, 'Проверка мобильного окна')
  await page.setViewportSize({ width: 320, height: 340 })
  await page.getByLabel('Новая задача').fill('Проверить экранную клавиатуру')
  await page.locator('#new-due-date').fill('2026-12-15')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await edit(page, 'Проверить экранную клавиатуру')
  await page.getByLabel('Название задачи').fill('Изменено на телефоне')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('.task-text')).toHaveText('Изменено на телефоне')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
