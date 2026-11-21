import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import LocalBlogView from '../../src/components/LocalBlogView.vue'
import { useSelectedMessages, resolveSelectedMessage } from '../../src/composables/useSelectedMessages'
import en from '../../src/i18n/locales/en.json'

const post = {
  id: 'blog_1700000000000_ab',
  blogId: 'b1',
  title: 'Blog post',
  body: 'blog body text',
  attachments: [{ name: 'note.json', type: 'application/json', size: 2, data: 'data:application/json;base64,e30=' }],
  timestamp: 1700000000000,
}

vi.mock('../../src/services/blogStore', () => ({
  getBlogPosts: vi.fn(async () => [post]),
  getAllBlogPosts: vi.fn(async () => [post]),
  putBlog: vi.fn(async () => {}),
  deleteBlog: vi.fn(async () => {}),
  putBlogPost: vi.fn(async () => {}),
  deleteBlogPost: vi.fn(async () => {}),
  createBlogPost: vi.fn(async () => {}),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('blog message selection (#306)', () => {
  let selected

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    selected = useSelectedMessages()
    selected.clear()
  })

  it('offers a select button on blog posts and adds them to the container', async () => {
    const wrapper = mount(LocalBlogView, {
      props: { blog: { id: 'b1', name: 'My blog', description: '' } },
      global: {
        plugins: [i18n],
        stubs: { MessageEditor: true, ForwardDialog: true, CollapsibleContent: true, AttachmentsGallery: true },
      },
    })
    await new Promise(r => setTimeout(r, 30))

    const button = wrapper.findAll('button').find(b => b.text().includes('Add to selected'))
    expect(button).toBeTruthy()
    expect(button.text()).toContain('📍')

    await button.trigger('click')
    expect(selected.count.value).toBe(1)
    expect(selected.has(post.id)).toBe(true)

    const toggle = wrapper.findAll('button').find(b => b.text().includes('Remove from selected'))
    expect(toggle.text()).toContain('📌')
    await toggle.trigger('click')
    expect(selected.count.value).toBe(0)
  })

  it('resolves a selected blog post through the blog store', async () => {
    selected.add({ message_id: post.id }, { echoName: 'My blog' })
    const resolved = await resolveSelectedMessage({ message_id: post.id, echo_name: 'My blog' })
    expect(resolved).toBeTruthy()
    const data = JSON.parse(resolved.data)
    expect(data.subject).toBe('Blog post')
    expect(data.body).toBe('blog body text')
    expect(data.attachments).toHaveLength(1)
  })
})
