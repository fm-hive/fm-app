import { openDB } from 'idb'
import { broadcastOp } from './clientSync'

const DB_NAME = 'fm_bloggor'
const POSTS_STORE = 'posts'
const BLOGS_STORE = 'blogs'

const DEFAULT_BLOG_ID = 'default'

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      // NOTE: during `upgradeneeded` it is illegal to start a new transaction
      // via db.transaction(...) ("A version change transaction is running").
      // Use the `transaction` passed by idb as the 4th argument instead.
      upgrade(db, oldVersion, newVersion, transaction) {
        if (!db.objectStoreNames.contains(POSTS_STORE)) {
          db.createObjectStore(POSTS_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(BLOGS_STORE)) {
          db.createObjectStore(BLOGS_STORE, { keyPath: 'id' })
        }
        // v2: migrate legacy single-blog posts into a default blog
        if (oldVersion < 2) {
          return (async () => {
            const posts = await transaction.objectStore(POSTS_STORE).getAll()
            if (posts.some(p => !p.blogId)) {
              const def = { id: DEFAULT_BLOG_ID, name: 'My blog', description: '', createdAt: Date.now() }
              transaction.objectStore(BLOGS_STORE).put(def)
              for (const p of posts) {
                if (!p.blogId) {
                  p.blogId = DEFAULT_BLOG_ID
                  transaction.objectStore(POSTS_STORE).put(p)
                }
              }
            }
          })()
        }
      },
    })
  }
  return dbPromise
}

/** Получить все блоги (по дате создания). */
export async function getBlogs() {
  const db = await getDB()
  const blogs = await db.getAll(BLOGS_STORE)
  return blogs.sort((a, b) => a.createdAt - b.createdAt)
}

/** Создать новый блог. */
export async function createBlog({ name, description = '' }) {
  const blog = {
    id: `blog_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: name || 'Untitled',
    description,
    createdAt: Date.now(),
  }
  await putBlog(blog)
  return blog
}

/** Добавить/обновить блог. */
export async function putBlog(blog, { silent = false } = {}) {
  const db = await getDB()
  await db.put(BLOGS_STORE, blog)
  if (!silent) syncBlogOp({ op: 'blog', blog })
}

/** Удалить блог и все его записи. */
export async function deleteBlog(id, { silent = false } = {}) {
  const db = await getDB()
  const tx = db.transaction([BLOGS_STORE, POSTS_STORE], 'readwrite')
  tx.objectStore(BLOGS_STORE).delete(id)
  const posts = await tx.objectStore(POSTS_STORE).getAll()
  for (const post of posts) {
    if (post.blogId === id) tx.objectStore(POSTS_STORE).delete(post.id)
  }
  await tx.done
  if (!silent) syncBlogOp({ op: 'blogDelete', id })
}

/** Получить записи конкретного блога (новые сначала). */
export async function getBlogPosts(blogId) {
  const db = await getDB()
  const posts = await db.getAll(POSTS_STORE)
  return posts
    .filter(p => (p.blogId || DEFAULT_BLOG_ID) === blogId)
    .sort((a, b) => b.timestamp - a.timestamp)
}

/** Добавить/обновить запись блога. */
export async function putBlogPost(post, { silent = false } = {}) {
  const db = await getDB()
  if (!post.blogId) post.blogId = DEFAULT_BLOG_ID
  await db.put(POSTS_STORE, post)
  if (!silent) syncBlogOp({ op: 'blogPost', post })
}

/** Удалить запись блога. */
export async function deleteBlogPost(id, { silent = false } = {}) {
  const db = await getDB()
  await db.delete(POSTS_STORE, id)
  if (!silent) syncBlogOp({ op: 'blogPostDelete', id })
}

/** Share a blog change with the other clients of this address (best effort). */
function syncBlogOp(op) {
  try {
    broadcastOp(op).catch(err => console.warn('[blog] client sync failed:', err.message))
  } catch (err) {
    console.warn('[blog] client sync failed:', err.message)
  }
}

/** Создать новую запись в указанном блоге. */
export async function createBlogPost({ blogId = DEFAULT_BLOG_ID, title = '', body = '', attachments = [] }) {
  const post = {
    id: `blog_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    blogId,
    title,
    body,
    attachments,
    timestamp: Date.now(),
  }
  await putBlogPost(post)
  return post
}

/** Получить все записи всех блогов (для экспорта). */
export async function getAllBlogPosts() {
  const db = await getDB()
  return db.getAll(POSTS_STORE)
}

/** Массово сохранить блоги и записи (для импорта). */
export async function importBlogsData(blogs = [], posts = []) {
  const db = await getDB()
  const tx = db.transaction([BLOGS_STORE, POSTS_STORE], 'readwrite')
  for (const b of blogs) {
    if (b?.id) tx.objectStore(BLOGS_STORE).put(b)
  }
  for (const p of posts) {
    if (p?.id) tx.objectStore(POSTS_STORE).put(p)
  }
  await tx.done
}

