import { test, expect } from '@playwright/test'

const KEY = 'todo-list.tasks.v1'
const tasks = ['Первое дело', 'Второе дело', 'Третье дело'].map((text, i) => ({
  id: `drag-${i}`,
  text,
  completed: false,
  priority: 'medium',
  dueDate: null,
}))

test.beforeEach(async ({ page }) => {
  page.testErrors = []
  page.on('pageerror', (error) => page.testErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') page.testErrors.push(message.text())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мои задачи' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
})
test.afterEach(async ({ page }) => {
  expect(page.testErrors).toEqual([])
})

test('настоящие touch-события: перетаскивание за ручку и сохранение порядка', async ({
  page,
  context,
}) => {
  test.skip(
    test.info().project.name !== 'mobile',
    'Touch Input через CDP доступен в мобильном Chromium',
  )
  await page.evaluate(
    ({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)),
    { key: KEY, tasks },
  )
  await page.reload()
  await page.locator('.task-item').last().scrollIntoViewIfNeeded()
  const from = await page.locator('.drag-handle').first().boundingBox()
  const to = await page.locator('.task-item').last().boundingBox()
  const client = await context.newCDPSession(page)
  const x = Math.round(from.x + 22)
  const startY = Math.round(from.y + 22)
  const endY = Math.round(to.y + to.height - 15)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY }],
  })
  // Это намеренное удержание: сенсор активируется после 220 мс.
  await page.waitForTimeout(260)
  for (let step = 1; step <= 14; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: startY + ((endY - startY) * step) / 14 }],
    })
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(page.locator('.task-text')).toHaveText([
    tasks[1].text,
    tasks[2].text,
    tasks[0].text,
  ])
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY),
  ).toEqual([tasks[1], tasks[2], tasks[0]])
  await page.reload()
  await expect(page.locator('.task-text')).toHaveText([
    tasks[1].text,
    tasks[2].text,
    tasks[0].text,
  ])
  await client.detach()
})

test('обычная сенсорная прокрутка текста не запускает перетаскивание и выполнение', async ({
  page,
  context,
}) => {
  test.skip(
    test.info().project.name !== 'mobile',
    'Touch Input через CDP доступен в мобильном Chromium',
  )
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...tasks[0],
    id: `scroll-${i}`,
    text: `Задача для прокрутки ${i}`,
  }))
  await page.evaluate(
    ({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)),
    { key: KEY, tasks: many },
  )
  await page.reload()
  await page.locator('.task-item').nth(2).scrollIntoViewIfNeeded()
  const title = await page.locator('.task-text').nth(2).boundingBox()
  const client = await context.newCDPSession(page)
  const beforeY = await page.evaluate(() => scrollY)
  const x = Math.round(title.x + title.width / 2)
  const y = Math.min(740, Math.round(title.y + 15))
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  for (let step = 1; step <= 10; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - step * 20 }],
    })
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeY)
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0)
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY),
  ).toEqual(many)
  await client.detach()
})

test('сортировка по Space и стрелкам, затем подтверждение', async ({
  page,
}) => {
  test.skip(
    !!test.info().project.use.isMobile,
    'Физическая клавиатура проверяется в desktop-профилях',
  )
  await page.evaluate(
    ({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)),
    { key: KEY, tasks },
  )
  await page.reload()
  const handle = page.getByRole('button', {
    name: `Изменить порядок задачи: ${tasks[0].text}`,
  })
  await handle.focus()
  await handle.press('Space')
  await expect(page.locator('.is-dragging').first()).toBeVisible()
  // Стрелки двигают захваченную строку; число шагов зависит от её высоты.
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect
    .poll(async () => (await page.locator('.task-text').allTextContents())[0])
    .not.toBe(tasks[0].text)
  const result = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    KEY,
  )
  expect(result).toHaveLength(3)
  expect(result.map((task) => task.id).sort()).toEqual(
    tasks.map((task) => task.id).sort(),
  )
  expect(result.every((task) => !task.completed)).toBe(true)
})

for (const [timezone, overdue] of [
  ['Europe/Moscow', true],
  ['America/Los_Angeles', false],
]) {
  test(`календарный дедлайн без сдвига даты: ${timezone}`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ timezoneId: timezone, baseURL })
    const page = await context.newPage()
    await page.clock.install({ time: new Date('2026-11-10T23:30:00Z') })
    await page.addInitScript(
      ({ key, task }) => localStorage.setItem(key, JSON.stringify([task])),
      { key: KEY, task: { ...tasks[0], dueDate: '2026-11-10' } },
    )
    await page.goto('/')
    await expect(page.locator('time')).toHaveAttribute('datetime', '2026-11-10')
    await expect(page.locator('.is-overdue')).toHaveCount(overdue ? 1 : 0)
    if (!overdue) await expect(page.locator('time')).toHaveText('Сегодня')
    await context.close()
  })
}

test('удаление записывается до конца анимации и не отменяется быстрым reload', async ({
  page,
}) => {
  await page.evaluate(
    ({ key, tasks }) => localStorage.setItem(key, JSON.stringify(tasks)),
    { key: KEY, tasks },
  )
  await page.reload()
  await page
    .getByRole('button', { name: `Удалить задачу: ${tasks[0].text}` })
    .click()
  expect(
    (
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY)
    ).map((task) => task.id),
  ).toEqual(['drag-1', 'drag-2'])
  await page.reload()
  await expect(page.locator('.task-text')).toHaveText([
    tasks[1].text,
    tasks[2].text,
  ])
})
