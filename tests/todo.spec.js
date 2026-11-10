import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const STORAGE_KEY = 'todo-list.tasks.v1'

async function seedTasks(page, tasks) {
  await page.addInitScript(
    ({ key, tasks }) => {
      localStorage.setItem(key, JSON.stringify(tasks))
    },
    { key: STORAGE_KEY, tasks },
  )
}

async function addTask(page, text, enter = false) {
  await page.getByLabel('Новая задача').fill(text)
  if (enter) await page.getByLabel('Новая задача').press('Enter')
  else await page.getByRole('button', { name: 'Добавить', exact: true }).click()
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
  // Дожидаемся ресурсов, чтобы следующий reload не отменял favicon на HTTPS.
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Мои задачи' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  page.testErrors = errors
})

test.afterEach(async ({ page }) => {
  expect(
    page.testErrors,
    'Ошибки JavaScript, консоли и загрузки ресурсов',
  ).toEqual([])
})

test('пустой список, кнопка и Enter, обрезка пробелов, очистка поля', async ({
  page,
}) => {
  await expect(
    page.getByRole('heading', { name: 'Пока нет задач' }),
  ).toBeVisible()
  await addTask(page, '  Подготовить резюме  ')
  await addTask(page, 'Проверить портфолио', true)
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await expect(page.locator('.task-text').first()).toHaveText(
    'Подготовить резюме',
  )
  await expect(page.getByLabel('Новая задача')).toHaveValue('')
  await expect(page.getByLabel('Новая задача')).toBeFocused()
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 0 из 2')
})

test('пустые строки и пробелы не создают задачи', async ({ page }) => {
  await expect(
    page.getByRole('button', { name: 'Добавить', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Новая задача').press('Enter')
  await page.getByLabel('Новая задача').fill('     ')
  await expect(
    page.getByRole('button', { name: 'Добавить', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Новая задача').press('Enter')
  await expect(page.getByRole('listitem')).toHaveCount(0)
})

test('выполнение и возврат в активные обновляют счётчик и оформление', async ({
  page,
}) => {
  await addTask(page, 'Прочитать требования')
  const checkbox = page.getByRole('checkbox', { name: 'Прочитать требования' })
  await checkbox.check()
  await expect(checkbox).toBeChecked()
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 1 из 1')
  await expect(page.locator('.task-text')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  )
  await checkbox.uncheck()
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 0 из 1')
  await expect(page.locator('.task-text')).toHaveCSS(
    'text-decoration-line',
    'none',
  )
})

test('удаление активной, выполненной и единственной задачи сохраняет остальные', async ({
  page,
}) => {
  for (const text of ['Первая', 'Вторая', 'Третья']) await addTask(page, text)
  await page.getByRole('checkbox', { name: 'Вторая', exact: true }).check()
  await page
    .getByRole('button', { name: 'Удалить задачу: Первая', exact: true })
    .click()
  await expect(page.locator('.task-text')).toHaveText(['Вторая', 'Третья'])
  await expect(
    page.getByRole('checkbox', { name: 'Вторая', exact: true }),
  ).toBeChecked()
  await page
    .getByRole('button', { name: 'Удалить задачу: Вторая', exact: true })
    .click()
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 0 из 1')
  await page
    .getByRole('button', { name: 'Удалить задачу: Третья', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Пока нет задач' }),
  ).toBeVisible()
  await expect(page.getByLabel('Новая задача')).toBeFocused()
})

test('фильтры, пустые результаты и добавление из выполненных', async ({
  page,
}) => {
  await addTask(page, 'Активная')
  await page.getByRole('button', { name: 'Выполненные', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Нет выполненных задач' }),
  ).toBeVisible()
  await addTask(page, 'Ещё одна')
  await expect(
    page.getByRole('button', { name: 'Все', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('checkbox', { name: 'Активная', exact: true }).check()
  await page.getByRole('button', { name: 'Активные', exact: true }).click()
  await expect(page.locator('.task-text')).toHaveText(['Ещё одна'])
  // Строка исчезает из активного фильтра сразу после клика; проверяем результат списка.
  await page.getByRole('checkbox', { name: 'Ещё одна' }).click()
  await expect(
    page.getByRole('heading', { name: 'Все задачи выполнены' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Выполненные', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('checkbox', { name: 'Активная', exact: true }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 1 из 2')
})

test('список, идентификаторы и статусы сохраняются после reload и закрытия вкладки', async ({
  page,
  context,
}) => {
  await addTask(page, 'Сохранить работу')
  await addTask(page, 'Отправить результат')
  await page.getByRole('checkbox', { name: 'Сохранить работу' }).check()
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    STORAGE_KEY,
  )
  expect(saved).toHaveLength(2)
  expect(new Set(saved.map((task) => task.id)).size).toBe(2)
  await page.reload({ waitUntil: 'networkidle' })
  await expect(
    page.getByRole('checkbox', { name: 'Сохранить работу' }),
  ).toBeChecked()
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 1 из 2')
  const url = page.url()
  // Открываем новую вкладку в том же браузерном контексте после закрытия исходной.
  const reopened = await context.newPage()
  await page.close()
  await reopened.goto(url, { waitUntil: 'networkidle' })
  await expect(reopened.getByRole('listitem')).toHaveCount(2)
  await expect(
    reopened.getByRole('checkbox', { name: 'Сохранить работу' }),
  ).toBeChecked()
  expect(
    await reopened.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      STORAGE_KEY,
    ),
  ).toEqual(saved)
  await reopened.close()
})

const damagedValues = [
  ['невалидный JSON', '{broken'],
  ['null', 'null'],
  ['объект вместо массива', '{}'],
  [
    'неверный статус',
    JSON.stringify([{ id: '1', text: 'Задача', completed: 'false' }]),
  ],
  [
    'пустое название',
    JSON.stringify([{ id: '1', text: '   ', completed: false }]),
  ],
  [
    'неверный id',
    JSON.stringify([{ id: 1, text: 'Задача', completed: false }]),
  ],
  [
    'повторяющиеся id',
    JSON.stringify([
      { id: '1', text: 'А', completed: false },
      { id: '1', text: 'Б', completed: true },
    ]),
  ],
  [
    'слишком длинное название',
    JSON.stringify([{ id: '1', text: 'а'.repeat(201), completed: false }]),
  ],
]
for (const [description, value] of damagedValues) {
  test(`повреждённое хранилище: ${description}`, async ({ page }) => {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: STORAGE_KEY,
      value,
    })
    await page.reload({ waitUntil: 'networkidle' })
    await expect(
      page.getByText('Сохранённый список повреждён. Можно начать новый.'),
    ).toBeVisible()
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
    ).toBe(value)
    await addTask(page, 'Начать новый список')
    await expect(
      page.getByRole('checkbox', { name: 'Начать новый список' }),
    ).toBeVisible()
    await expect(page.locator('.storage-warning')).toHaveCount(0)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('listitem')).toHaveCount(1)
  })
}

test('запрет чтения и записи localStorage не мешает работе в текущей вкладке', async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem']) {
      Object.defineProperty(Storage.prototype, method, {
        value() {
          throw new DOMException('Blocked', 'SecurityError')
        },
      })
    }
  })
  await page.reload({ waitUntil: 'networkidle' })
  await expect(
    page.getByText(
      'Хранилище недоступно. Задачи будут доступны только на этой странице.',
    ),
  ).toBeVisible()
  await addTask(page, 'Без хранилища')
  await page.getByRole('checkbox', { name: 'Без хранилища' }).check()
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 1 из 1')
  await expect(
    page.getByText(
      'Не удалось сохранить задачи. Они доступны только на этой странице.',
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Удалить задачу: Без хранилища', exact: true })
    .click()
  await expect(page.getByRole('listitem')).toHaveCount(0)
})

test('переполнение localStorage показывает предупреждение, не ломая список', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {
      value() {
        throw new DOMException('Full', 'QuotaExceededError')
      },
    })
  })
  await page.reload({ waitUntil: 'networkidle' })
  await addTask(page, 'Сохранить позже')
  await expect(page.locator('.storage-warning')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await page.getByRole('checkbox').check()
  await expect(page.getByRole('checkbox')).toBeChecked()
})

test('ограничение 200 символов, длинное слово и текст с HTML', async ({
  page,
}) => {
  const input = page.getByLabel('Новая задача')
  await input.fill('Д'.repeat(240))
  await expect(input).toHaveValue('Д'.repeat(200))
  await input.press('Enter')
  await expect(page.locator('.task-text')).toHaveText('Д'.repeat(200))
  await addTask(
    page,
    '<img src=x onerror=alert(1)> & <script>alert(1)</script>',
  )
  await expect(page.locator('.task-text').last()).toHaveText(
    '<img src=x onerror=alert(1)> & <script>alert(1)</script>',
  )
  await expect(page.locator('.task-list img, .task-list script')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('все основные действия доступны с клавиатуры, фокус видим и восстанавливается', async ({
  page,
}) => {
  test.skip(
    !!test.info().project.use.isMobile,
    'Клавиатура проверяется на desktop',
  )
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Включить тёмную тему' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Новая задача')).toBeFocused()
  await page.keyboard.type('Задача с клавиатуры')
  await page.keyboard.press('Enter')
  const checkbox = page.getByRole('checkbox')
  // Пустая кнопка добавления пропускается, остальные элементы доступны по порядку.
  for (const control of [
    page.locator('#new-priority'),
    page.locator('#new-due-date'),
    page.getByRole('button', { name: 'Все', exact: true }),
    page.getByRole('button', { name: 'Активные', exact: true }),
    page.getByRole('button', { name: 'Выполненные', exact: true }),
    page.getByRole('searchbox'),
    page.getByRole('button', { name: /Изменить порядок задачи:/ }),
    checkbox,
  ]) {
    // Нативная дата может иметь отдельные Tab-позиции для дня, месяца и года.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.keyboard.press('Tab')
      if (
        await control.evaluate((element) => element === document.activeElement)
      )
        break
    }
    await expect(control).toBeFocused()
  }
  await expect(checkbox).toBeFocused()
  expect(
    await checkbox.evaluate((element) => element.matches(':focus-visible')),
  ).toBe(true)
  await expect(checkbox).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Space')
  await expect(checkbox).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: /Редактировать задачу:/ }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: /Удалить задачу:/ }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Новая задача')).toBeFocused()
  await expect(page.getByRole('listitem')).toHaveCount(0)
})

test('касания: добавление, чекбокс и постоянно видимое удаление', async ({
  page,
}) => {
  test.skip(
    !test.info().project.use.isMobile,
    'Касания проверяются в mobile-проекте',
  )
  await page.getByLabel('Новая задача').tap()
  await page.getByLabel('Новая задача').fill('Проверить на телефоне')
  await page.getByRole('button', { name: 'Добавить', exact: true }).tap()
  await page.locator('.task-label').tap()
  await expect(page.getByRole('checkbox')).toBeChecked()
  const remove = page.getByRole('button', { name: /Удалить задачу:/ })
  await expect(remove).toBeVisible()
  const bounds = await remove.boundingBox()
  expect(Math.round(bounds.width)).toBeGreaterThanOrEqual(44)
  expect(Math.round(bounds.height)).toBeGreaterThanOrEqual(44)
  await remove.tap()
  await expect(page.getByRole('listitem')).toHaveCount(0)
})

test('100 задач, прокрутка и действия с последней строкой', async ({
  page,
}) => {
  await seedTasks(
    page,
    Array.from({ length: 100 }, (_, i) => ({
      id: `task-${i}`,
      text: `Задача ${i + 1}`,
      completed: i % 3 === 0,
    })),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('listitem')).toHaveCount(100)
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 34 из 100')
  await page
    .getByRole('checkbox', { name: 'Задача 100', exact: true })
    .uncheck()
  await page
    .getByRole('button', { name: 'Удалить задачу: Задача 100', exact: true })
    .click()
  await expect(page.getByRole('listitem')).toHaveCount(99)
  await expect(page.locator('.task-summary')).toHaveText('Выполнено 33 из 99')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('reduced motion отключает анимацию и переходы', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await addTask(page, 'Без анимации')
  await expect(page.getByRole('listitem')).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.task-checkbox')).toHaveCSS(
    'transition-duration',
    '0s',
  )
})

test('axe: доступность пустого списка, формы, выполненных и активных задач', async ({
  page,
}) => {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await addTask(page, 'Подготовить проект')
  await addTask(page, 'Проверить результат')
  await page.getByRole('checkbox').first().check()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
})

const sizes = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1024, 768],
  [820, 1180],
  [768, 1024],
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [430, 932],
  [844, 390],
]
for (const [width, height] of sizes) {
  test(`адаптивность ${width}×${height}: 10 задач и длинное слово`, async ({
    page,
  }) => {
    test.skip(
      !!test.info().project.use.isMobile,
      'Все размеры проверяются отдельно от сценариев касаний',
    )
    await page.setViewportSize({ width, height })
    await seedTasks(
      page,
      Array.from({ length: 10 }, (_, i) => ({
        id: `responsive-${i}`,
        text:
          i === 1
            ? 'Ш'.repeat(200)
            : [
                'Подготовить резюме',
                'Проверить портфолио',
                'Отправить тестовое задание',
              ][i % 3],
        completed: i % 3 === 0,
      })),
    )
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('listitem')).toHaveCount(10)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    for (const button of await page
      .getByRole('button', { name: /Удалить задачу:/ })
      .all()) {
      const bounds = await button.boundingBox()
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      // Transform во время появления может дать 43.99997 вместо 44 CSS px.
      expect(Math.round(bounds.width)).toBeGreaterThanOrEqual(44)
      expect(Math.round(bounds.height)).toBeGreaterThanOrEqual(44)
    }
    expect(
      await page
        .getByLabel('Новая задача')
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16)
    if ([1920, 1440, 320, 390].includes(width)) {
      await page.screenshot({
        path: `artifacts/screenshots/tasks-${test.info().project.name}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
  })
}

test('скриншот пустого списка', async ({ page }) => {
  await page.screenshot({
    path: `artifacts/screenshots/empty-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
})

test('скриншот обычного списка', async ({ page }) => {
  for (const text of [
    'Изучить требования к заданию',
    'Подготовить резюме',
    'Проверить портфолио на телефоне',
    'Отправить отклик',
  ]) {
    await addTask(page, text, true)
  }
  await page.getByRole('checkbox').first().check()
  await page.screenshot({
    path: `artifacts/screenshots/list-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
})
