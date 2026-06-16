import { describe, test, expect } from 'vitest'
import { parseHeadings } from './parseHeadings'

describe('parseHeadings', () => {
  test('extracts H1-H6 with correct level, text, line', () => {
    const md = `# Title
## Section
### Sub
#### Deep
##### Deeper
###### Deepest`
    const headings = parseHeadings(md)
    expect(headings).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Section', line: 2 },
      { level: 3, text: 'Sub', line: 3 },
      { level: 4, text: 'Deep', line: 4 },
      { level: 5, text: 'Deeper', line: 5 },
      { level: 6, text: 'Deepest', line: 6 },
    ])
  })

  test('skips headings inside fenced code blocks', () => {
    const md = `# Real heading
\`\`\`markdown
# This is inside code
## Also inside
\`\`\`
## After code block`
    const headings = parseHeadings(md)
    expect(headings).toEqual([
      { level: 1, text: 'Real heading', line: 1 },
      { level: 2, text: 'After code block', line: 6 },
    ])
  })

  test('handles empty string', () => {
    expect(parseHeadings('')).toEqual([])
  })

  test('handles no headings', () => {
    expect(parseHeadings('just some text\nwith lines')).toEqual([])
  })

  test('trims trailing whitespace from heading text', () => {
    const md = '## Hello World   '
    const headings = parseHeadings(md)
    expect(headings[0].text).toBe('Hello World')
  })

  test('requires space after # (not a heading without space)', () => {
    const md = '#notaheading\n## Real'
    const headings = parseHeadings(md)
    expect(headings).toEqual([{ level: 2, text: 'Real', line: 2 }])
  })
})
