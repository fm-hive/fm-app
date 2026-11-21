import { createRouter, createWebHistory } from 'vue-router'
import { appBasePath } from '../utils/appBase'
import Home from '../views/Home.vue'
import Echoes from '../views/Echoes.vue'
import Settings from '../views/Settings.vue'
import Admin from '../views/Admin.vue'
import Netmail from '../views/Netmail.vue'
import NetmailDetail from '../views/NetmailDetail.vue'
import EchoMessageDetail from '../views/EchoMessageDetail.vue'
import Search from '../views/Search.vue'
import PolicyViewer from '../views/PolicyViewer.vue'

/**
 * Маршруты приложения.
 * Структура:
 * Базовый путь берётся в рантайме из document.baseURI (тег <base> ставит
 * index.html из public/fm-config.js) — сборка не содержит URL.
 *   /            — Главная (регистрация/логин)
 *   /echoes      — Эхи и сообщения
 *   /settings    — Настройки
 *   /admin       — Панель администратора (требуется роль админа)
 *   /netmail     — Приватные сообщения (папки)
 */
const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/echoes',
    name: 'Echoes',
    component: Echoes,
  },
  {
    path: '/echoes/:id',
    name: 'EchoDetail',
    component: Echoes,
  },
  {
    // Reader mode deep link (#322): the echo with the reader opened on a
    // specific message, so navigating away and back restores the view.
    path: '/echoes/:id/reader/:messageId',
    name: 'EchoReader',
    component: Echoes,
  },
  {
    // Local blogs have no numeric id — route by name.
    path: '/echoes/blog/:name',
    name: 'EchoBlog',
    component: Echoes,
  },
  {
    path: '/echoes/:id/:messageId',
    name: 'EchoMessageDetail',
    component: EchoMessageDetail,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
  },
  {
    path: '/admin',
    name: 'Admin',
    component: Admin,
    meta: { requiresAdmin: true },
  },
  {
    path: '/netmail/:folderId?',
    name: 'Netmail',
    component: Netmail,
  },
  {
    path: '/netmail/:folderId/:messageId',
    name: 'NetmailDetail',
    component: NetmailDetail,
  },
  {
    path: '/search',
    name: 'Search',
    component: Search,
  },
  {
    path: '/policy',
    name: 'PolicyViewer',
    component: PolicyViewer,
  },
]

const router = createRouter({
  history: createWebHistory(appBasePath()),
  routes,
})

// Role guards: the flags are server-confirmed (identity response) and are
// loaded during boot, so by the time the user navigates they are authoritative.
// The node enforces the real permissions; this only hides UI that would not work.
router.beforeEach(async (to, from, next) => {
  if (to.meta?.requiresAdmin) {
    const { useIdentityStore } = await import('../stores/identity')
    const identity = useIdentityStore()
    if (!identity.isAdmin) return next({ name: 'Home' })
  }
  next()
})

export default router
