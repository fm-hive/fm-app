<template>
  <div class="flex flex-col min-h-0 h-full">
    <!-- Blog header -->
    <div class="flex-shrink-0 bg-white dark:bg-gray-800 mb-2 pb-2 border-b dark:border-gray-700">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold dark:text-white flex items-center gap-2">
            {{ blog.name }}
            <span class="text-xs px-1.5 py-0.5 rounded bg-blue-600 text-white" :title="t('echoes.badgeBlog')">B</span>
          </h2>
          <div v-if="blog.description" class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ blog.description }}</div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="openEditor()" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1">
            + {{ t('bloggor.newPost') }}
          </button>
          <button @click="openBlogEditor()" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">✏️</button>
          <button @click="removeBlog" class="px-3 py-1.5 text-sm border rounded hover:bg-red-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">🗑</button>
        </div>
      </div>
    </div>

    <!-- Posts -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div v-if="loading" class="text-gray-500 dark:text-gray-400">{{ t('bloggor.loading') }}</div>
      <div v-else-if="posts.length === 0" class="text-gray-500 dark:text-gray-400 text-center py-12 border rounded dark:border-gray-700">
        {{ t('bloggor.empty') }}
      </div>

      <div v-else class="space-y-4">
        <div v-for="post in posts" :key="post.id" class="border rounded-lg p-4 dark:border-gray-700">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div v-if="post.title" class="font-semibold text-gray-800 dark:text-gray-200">{{ post.title }}</div>
              <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">
                <CollapsibleContent
                  :content="post.body || ''"
                  :attachments="post.attachments"
                  :message-id="post.id"
                  @select-attachment="handleSelectAttachment(post, $event)"
                />
              </div>
              <AttachmentsGallery
                :attachments="post.attachments"
                :content="post.body || ''"
                :message-id="post.id"
                @select-attachment="handleSelectAttachment(post, $event)"
              />
              <div class="text-xs text-gray-400 mt-2">{{ formatDate(post.timestamp) }}</div>
            </div>
          </div>
          <div class="flex gap-2 mt-2">
            <button @click="openEditor(post)" class="text-xs text-blue-500 hover:text-blue-700">✏️ {{ t('bloggor.edit') }}</button>
            <button @click="forwardPost(post)" class="text-xs text-gray-500 hover:text-gray-700">↗ {{ t('bloggor.forward') }}</button>
            <button @click="toggleSelected(post)" class="text-xs text-amber-600 hover:text-amber-800" :title="t('selected.title')">
              {{ isSelected(post) ? '📌' : '📍' }} {{ isSelected(post) ? t('messageActions.removeSelected') : t('messageActions.addSelected') }}
            </button>
            <button @click="removePost(post.id)" class="text-xs text-red-500 hover:text-red-700">🗑 {{ t('bloggor.delete') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Blog editor dialog -->
    <div v-if="showBlogEditor" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showBlogEditor = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('bloggor.blogSettings') }}</h3>
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('bloggor.blogName') }}</label>
          <input v-model="editBlogName" class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
        </div>
        <div class="mb-3">
          <MarkdownEditor v-model="editBlogDescription" :label="t('bloggor.blogDescription')" :rows="2" />
        </div>
        <div class="flex justify-end gap-3">
          <button @click="showBlogEditor = false" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm">{{ t('app.cancel') }}</button>
          <button @click="saveBlog" :disabled="!editBlogName.trim()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50">{{ t('bloggor.save') }}</button>
        </div>
      </div>
    </div>

    <!-- Post editor via MessageEditor (blog mode) -->
    <MessageEditor
      :visible="showPostEditor"
      :blog="true"
      :blog-name="blog.name"
      :initial-subject="editTitle"
      :initial-body="editBody"
      @close="showPostEditor = false"
      @blogSubmit="savePost"
    />

    <ForwardDialog :show="showForward" :message="forwardMessage" @close="showForward = false" @forward="handleForward" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CollapsibleContent from '../components/CollapsibleContent.vue'
import AttachmentsGallery from '../components/AttachmentsGallery.vue'
import ForwardDialog from '../components/ForwardDialog.vue'
import MessageEditor from '../components/MessageEditor.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import * as blogStore from '../services/blogStore'
import { useSelectedMessages } from '../composables/useSelectedMessages'

const props = defineProps({
  blog: { type: Object, required: true },
})
const emit = defineEmits(['deleted', 'updated'])

const { t } = useI18n()
const selectedStore = useSelectedMessages()

const posts = ref([])
const loading = ref(false)

const showBlogEditor = ref(false)
const editBlogName = ref('')
const editBlogDescription = ref('')

const showPostEditor = ref(false)
const editPostId = ref(null)
const editTitle = ref('')
const editBody = ref('')

const showForward = ref(false)
const forwardMessage = ref(null)

onMounted(loadPosts)
watch(() => props.blog?.id, loadPosts)

async function loadPosts() {
  if (!props.blog?.id) return
  loading.value = true
  try {
    posts.value = await blogStore.getBlogPosts(props.blog.id)
  } finally {
    loading.value = false
  }
}

function openBlogEditor() {
  editBlogName.value = props.blog?.name || ''
  editBlogDescription.value = props.blog?.description || ''
  showBlogEditor.value = true
}

async function saveBlog() {
  const name = editBlogName.value.trim()
  if (!name) return
  const updated = { ...props.blog, name, description: editBlogDescription.value.trim() }
  await blogStore.putBlog(updated)
  showBlogEditor.value = false
  emit('updated', updated)
}

async function removeBlog() {
  if (!confirm(t('bloggor.blogDeleteConfirm'))) return
  await blogStore.deleteBlog(props.blog.id)
  emit('deleted')
}

function openEditor(post) {
  editPostId.value = post?.id || null
  editTitle.value = post?.title || ''
  editBody.value = post?.body || ''
  showPostEditor.value = true
}

async function savePost(postData) {
  const title = postData?.subject || ''
  const body = postData?.body || ''
  const attachments = postData?.attachments || []
  if (editPostId.value) {
    const existing = posts.value.find(p => p.id === editPostId.value)
    await blogStore.putBlogPost({ ...existing, title, body, attachments, updatedAt: Date.now() })
  } else {
    await blogStore.createBlogPost({ blogId: props.blog.id, title, body, attachments })
  }
  showPostEditor.value = false
  editPostId.value = null
  editTitle.value = ''
  editBody.value = ''
  await loadPosts()
}

async function removePost(id) {
  if (!confirm(t('bloggor.deleteConfirm'))) return
  await blogStore.deleteBlogPost(id)
  await loadPosts()
}

/** Blog post as a message-like object (selection, forwarding, bundle). */
function postAsMessage(post) {
  return {
    message_id: post.id,
    type: 'echomail',
    sender_address: '',
    timestamp: Math.floor((post.timestamp || 0) / 1000),
    data: JSON.stringify({
      subject: post.title || '',
      body: post.body || '',
      attachments: post.attachments || [],
    }),
  }
}

function isSelected(post) {
  return selectedStore.has(post.id)
}

function toggleSelected(post) {
  selectedStore.toggle(postAsMessage(post), { echoName: props.blog.name, echoId: null })
}

function handleSelectAttachment(post, payload) {
  const attachment = payload?.attachment
  if (!attachment) return
  selectedStore.toggleAttachment(attachment, {
    messageId: post.id,
    index: payload.index ?? 0,
    echoName: props.blog.name,
    echoId: null,
  })
}

function forwardPost(post) {
  forwardMessage.value = postAsMessage(post)
  showForward.value = true
}

function handleForward() {
  showForward.value = false
}

function formatDate(ts) {
  return new Date(ts).toLocaleString()
}
</script>
