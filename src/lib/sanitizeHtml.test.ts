// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

describe('sanitizeHtml', () => {
  describe('DROP_WITH_CONTENT tags', () => {
    test('strips <script> entirely', () => {
      expect(sanitizeHtml('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>')
    })

    test('strips <style> entirely', () => {
      expect(sanitizeHtml('<p>ok</p><style>body{}</style>')).toBe('<p>ok</p>')
    })

    test('strips <iframe> entirely', () => {
      expect(sanitizeHtml('<iframe src="x"></iframe><p>safe</p>')).toBe('<p>safe</p>')
    })

    test('strips <svg> entirely', () => {
      expect(sanitizeHtml('<svg><circle/></svg><b>ok</b>')).toBe('<b>ok</b>')
    })
  })

  describe('tag allowlist (rich mode)', () => {
    test('allows standard rich tags', () => {
      const input = '<p><strong>bold</strong> <em>italic</em></p>'
      expect(sanitizeHtml(input)).toBe(input)
    })

    test('unwraps disallowed tags, keeps children', () => {
      expect(sanitizeHtml('<custom>text</custom>')).toBe('text')
    })
  })

  describe('highlight mode', () => {
    test('only allows <mark>', () => {
      const result = sanitizeHtml('<p><mark>hi</mark> <b>bold</b></p>', 'highlight')
      expect(result).toBe('<mark>hi</mark> bold')
    })
  })

  describe('link sanitization', () => {
    test('allows https href', () => {
      const result = sanitizeHtml('<a href="https://example.com">link</a>')
      expect(result).toContain('href="https://example.com/"')
    })

    test('allows mailto href', () => {
      const result = sanitizeHtml('<a href="mailto:a@b.com">email</a>')
      expect(result).toContain('href="mailto:a@b.com"')
    })

    test('blocks javascript: href', () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">xss</a>')
      expect(result).not.toContain('href')
    })

    test('adds target=_blank and rel=noreferrer', () => {
      const result = sanitizeHtml('<a href="https://x.com">x</a>')
      expect(result).toContain('target="_blank"')
      expect(result).toContain('rel="noreferrer noopener"')
    })
  })

  describe('image sanitization', () => {
    test('allows data:image/png base64 src', () => {
      const src = 'data:image/png;base64,abc123'
      const result = sanitizeHtml(`<img src="${src}">`)
      expect(result).toContain(`src="${src}"`)
    })

    test('blocks javascript: in img src', () => {
      const result = sanitizeHtml('<img src="javascript:alert(1)">')
      // img without valid src is removed entirely
      expect(result).toBe('')
    })

    test('adds lazy loading and no-referrer', () => {
      const result = sanitizeHtml('<img src="https://x.com/a.png">')
      expect(result).toContain('loading="lazy"')
      expect(result).toContain('referrerpolicy="no-referrer"')
    })
  })

  describe('style sanitization', () => {
    test('allows safe style properties', () => {
      const result = sanitizeHtml('<span style="color: red; font-weight: bold">x</span>')
      expect(result).toContain('style="color: red; font-weight: bold"')
    })

    test('strips expression() in style', () => {
      const result = sanitizeHtml('<span style="color: expression(alert(1))">x</span>')
      expect(result).not.toContain('expression')
    })

    test('strips url() in style', () => {
      const result = sanitizeHtml('<span style="background: url(evil.js)">x</span>')
      expect(result).not.toContain('url')
    })

    test('strips disallowed properties', () => {
      const result = sanitizeHtml('<span style="position: absolute; color: blue">x</span>')
      expect(result).toContain('color: blue')
      expect(result).not.toContain('position')
    })
  })

  describe('edge cases', () => {
    test('empty string returns empty', () => {
      expect(sanitizeHtml('')).toBe('')
    })

    test('plain text passes through', () => {
      expect(sanitizeHtml('hello world')).toBe('hello world')
    })
  })
})
