<template>
  <div class="flex gap-4 min-h-0 overflow-hidden echoes-layout">
    <!-- Left sidebar: echo list -->
    <div class="w-1/4 min-w-[220px] border rounded-lg p-4 dark:border-gray-700 dark:bg-gray-800 overflow-y-auto echoes-sidebar">
      <!-- Mobile: collapsed single line showing current echo, expandable -->
      <div class="md:hidden flex items-center justify-between cursor-pointer mb-2"
        @click="mobileSidebarOpen = !mobileSidebarOpen">
        <span class="text-sm font-semibold truncate">{{ selectedEchoName || t('echoes.selectEcho') }}</span>
        <span class="text-gray-500">{{ mobileSidebarOpen ? '▲' : '▼' }}</span>
      </div>
      <div :class="[mobileSidebarOpen ? 'block' : 'hidden', 'md:block']">

      <div v-if="echo.loading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('echoes.loading') }}</div>
      <div v-else-if="echo.error" class="text-sm text-red-500 mb-2">{{ echo.error }}</div>

      <!-- Sort control: blogs block stays above regular echoes -->
      <div class="flex items-center gap-1 mb-2">
        <span class="text-xs text-gray-500 dark:text-gray-400 mr-auto">{{ t('echoes.sortBy') }}</span>
        <button @click="sortMode = 'date'"
          :class="sortControlClass('date')"
          :title="t('echoes.sortByDateHint')">{{ t('echoes.sortByDate') }}</button>
        <button @click="sortMode = 'alpha'"
          :class="sortControlClass('alpha')"
          :title="t('echoes.sortByAlphaHint')">{{ t('echoes.sortByAlpha') }}</button>
        <button @click="showGroupsDialog = true"
          class="px-2 py-0.5 text-xs rounded border hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          :title="t('echoes.groups.manage')">🗂</button>
      </div>

      <!-- Blogs block (always on top) -->
      <template v-if="sortedBlogs.length > 0">
        <div v-for="echoItem in sortedBlogs" :key="'blog_' + echoItem.name"
          @click="selectEcho(echoItem.name)"
          :class="echoItemClass(echoItem.name)"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <div class="font-medium text-sm truncate dark:text-gray-200">
                {{ echoItem.name }}
                <span v-if="echoItem.isBlog" class="ml-1 text-xs px-1 py-0.5 rounded bg-blue-600 text-white align-middle" :title="t('echoes.badgeBlog')">B</span>
              </div>
            </div>
            <div v-if="echoItem.description" class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ echoItem.description }}</div>
          </div>
        </div>
        <div v-if="sortedEchoes.length > 0" class="border-t border-gray-200 dark:border-gray-600 my-1"></div>
      </template>

      <!-- Grouped regular echoes (#366) -->
      <div v-for="section in echoSections" :key="'section_' + section.id" class="mb-1">
        <div class="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 rounded cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700"
          @click="toggleGroup(section.id)">
          <span class="w-3 text-center">{{ isGroupExpanded(section.id) ? '▼' : '▶' }}</span>
          <span>{{ section.system ? '📬' : '📁' }}</span>
          <span class="truncate">{{ section.name }}</span>
          <span class="ml-auto text-gray-400">{{ section.items.length }}</span>
          <div v-if="!section.system && section.id !== UNGROUPED_GROUP_ID" class="relative" @click.stop>
            <button @click="groupMenuId = groupMenuId === section.id ? null : section.id"
              class="px-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              :title="t('echoes.actions')">⋮</button>
            <div v-if="groupMenuId === section.id"
              class="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg z-40 overflow-hidden">
              <button @click="deleteEchoGroup(section)"
                class="block w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                🗑 {{ t('echoes.groups.delete') }}
              </button>
            </div>
          </div>
        </div>
        <template v-if="isGroupExpanded(section.id)">
          <div v-for="echoItem in section.items" :key="'echo_' + echoItem.name"
            @click="selectEcho(echoItem.name)"
            :class="echoItemClass(echoItem.name)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="font-medium text-sm truncate dark:text-gray-200">
                  {{ echoItem.name }}
                  <span v-if="isNetworkNews(echoItem.name)" class="ml-1 text-xs px-1 py-0.5 rounded bg-slate-600 text-white align-middle" :title="t('echoes.badgeNetworkNews')">📰</span>
                  <span v-if="hasRestrictedWriters(echoItem.rules)" class="ml-1 text-xs px-1 py-0.5 rounded bg-amber-600 text-white align-middle" :title="t('echoes.badgeWriters')">W</span>
                  <span v-if="echoItem.no_subscribe" class="ml-1 text-xs px-1 py-0.5 rounded bg-gray-600 text-white align-middle" :title="t('echoes.systemEchoHint')">⚙</span>
                </div>
                <span v-if="unreadCount(echoItem.name) > 0" class="text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">{{ unreadCount(echoItem.name) }}</span>
              </div>
              <div v-if="echoItem.description" class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ echoItem.description }}</div>
            </div>
          </div>
          <div v-if="section.items.length === 0" class="px-2 pb-2 text-xs text-gray-400">{{ t('echoes.groups.empty') }}</div>
        </template>
      </div>

      <!-- Click outside a group actions menu -->
      <div v-if="groupMenuId" class="fixed inset-0 z-30" @click="groupMenuId = null"></div>

      </div>
    </div>

    <!-- Right panel -->
    <!-- min-w-0: the reader ribbon must scroll inside the panel, not widen the
         window (#322). -->
    <div class="relative flex-1 min-w-0 border rounded-lg p-4 dark:border-gray-700 dark:bg-gray-800 flex flex-col min-h-0">
      <!-- Echo selected: header + messages + composer -->
      <template v-if="selectedEchoName">
        <!-- Local blog: render blog view -->
        <LocalBlogView
          v-if="selectedBlog"
          :blog="selectedBlog"
          @deleted="handleBlogDeleted"
          @updated="handleBlogUpdated"
          class="h-full"
        />

        <!-- Regular echo: header + messages -->
        <template v-else>
        <!-- Header with actions dropdown (fixed, no scroll) -->
        <div class="flex-shrink-0 bg-white dark:bg-gray-800 mb-2 pb-2 border-b dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold dark:text-white">
              {{ selectedEchoDisplayName }}
              <span v-if="selectedIsNetworkNews" class="ml-1 text-xs px-1 py-0.5 rounded bg-slate-600 text-white align-middle" :title="t('echoes.badgeNetworkNews')">📰</span>
              <span v-if="selectedEchoHasRestrictedWriters" class="ml-1 text-xs px-1 py-0.5 rounded bg-amber-600 text-white align-middle" :title="t('echoes.badgeWriters')">W</span>
            </h2>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1 text-xs cursor-pointer text-gray-500 dark:text-gray-400 hidden sm:flex">
                <input type="checkbox" v-model="showProtocolInFeed" class="rounded" />
                {{ t('echoes.showProtocols') }}
              </label>
              <button v-if="!selectedIsNetworkNews" @click="openNewMessage" class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1">
                + {{ t('echoes.newMessage') }}
              </button>
              <span v-else class="text-xs text-gray-500 dark:text-gray-400" :title="t('echoes.networkNewsNodeOnly')">📰 {{ t('echoes.networkNewsNodeOnly') }}</span>
              <button v-if="myActiveRefill" @click="cancelRefill" class="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 flex items-center gap-1" :title="t('echoes.cancelRefillHint')">
                ✕ {{ t('echoes.cancelRefill') }}
              </button>
            <div class="relative" @click.stop>
              <button @click="showActionsMenu = !showActionsMenu" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center gap-1">
                ⋮ <span class="hidden sm:inline">{{ t('echoes.actions') }}</span>
              </button>
              <div v-if="showActionsMenu" class="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg z-40 overflow-hidden" @click.stop>
                <button @click="showRules = true; showActionsMenu = false" v-if="selectedEchoRules" class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2">
                  📄 {{ t('echoes.rules') }}
                </button>
                <button @click="showRefillDialog = true; showActionsMenu = false" class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2">
                  📥 {{ t('echoes.refill') }}
                </button>
                <button @click="showVote = true; showActionsMenu = false" class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2">
                  🗳️ {{ t('specialMessages.createVote') }}
                </button>
                <button @click="showElection = true; showActionsMenu = false" :disabled="hasActiveElectionPoster" class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 dark:text-gray-300 flex items-center gap-2">
                  📢 {{ t('specialMessages.election') }}
                </button>
                <button v-if="identity.isAdmin" @click="proposeExcommunicate(); showActionsMenu = false" class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2 border-t dark:border-gray-600">
                  ⛔ {{ t('specialMessages.excommunicate') }}
                </button>
                <div class="border-t dark:border-gray-600">
                  <button v-if="selectedEchoCanUnsubscribe" @click="unsubscribeSelectedEcho"
                    class="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300 flex items-center gap-2">
                    🚪 {{ t('echoes.unsubscribe') }}
                  </button>
                  <button @click="deleteSelectedEchoLocalCopy"
                    class="block w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    🗑️ {{ t('echoes.deleteLocalCopy') }}
                  </button>
                </div>
              </div>
            </div>
            </div> <!-- close flex items-center gap-2 wrapper -->
          </div>
          <!-- Active protocols inline panel -->
          <div v-if="activeProtocolCount > 0" class="mt-2">
            <button @click="showActiveProtocols = !showActiveProtocols" class="flex items-center gap-2 px-3 py-1.5 text-xs border rounded w-full hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-left">
              <span>{{ showActiveProtocols ? '▼' : '▶' }}</span>
              <span>🛠️ {{ t('echoes.protocols') }} ({{ activeProtocolCount }})</span>
            </button>
            <!-- Long protocol lists (e.g. a merge with many chunks) scroll
                 inside the fixed header instead of pushing the feed away (#346). -->
            <div v-if="showActiveProtocols" class="mt-2 max-h-[55vh] overflow-y-auto overscroll-contain pr-1">
              <ActiveProtocolsList :echo-name="selectedEchoName" />
              <button @click="showProtocols = true" class="mt-2 text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                {{ t('echoes.viewAllProtocols') }} →
              </button>
            </div>
          </div>
        </div>

        <!-- View mode toolbar: outside the scroll container so it stays fixed (#319) -->
        <div class="flex-shrink-0 flex items-center gap-1 mb-2 flex-wrap">
          <button @click="viewMode = 'feed'" :class="viewMode === 'feed' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'" class="px-2 py-0.5 text-xs rounded">{{ t('echoes.feed') }}</button>
          <button @click="viewMode = 'tree'" :class="viewMode === 'tree' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'" class="px-2 py-0.5 text-xs rounded">{{ t('echoes.tree') }}</button>
          <button @click="viewMode = 'threads'" :class="viewMode === 'threads' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'" class="px-2 py-0.5 text-xs rounded">{{ t('echoes.threads') }}</button>
          <button @click="viewMode = 'reader'" :class="viewMode === 'reader' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'" class="px-2 py-0.5 text-xs rounded" :title="t('echoes.readerHint')">{{ t('echoes.reader') }}</button>
          <label class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 cursor-pointer ml-2">
            <input type="checkbox" v-model="echo.hideDismissed" class="rounded" />
            {{ t('echoes.hideDismissed') }}
          </label>
          <label class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 cursor-pointer ml-2"
            :title="t('echoes.threadsToggleHint')">
            <input type="checkbox" v-model="echo.showThreads" class="rounded" />
            {{ t('echoes.threadsToggle') }}
          </label>
        </div>

        <!-- Scrollable content area (below header, not the header itself) -->
        <div ref="feedScrollEl" class="flex-1 overflow-y-auto min-h-0 min-w-0 overscroll-contain" @scroll.passive="onFeedScroll">
        <!-- Newcomers special info -->
        <div v-if="newcomersEchoName && selectedEchoName === newcomersEchoName" class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <h3 class="font-bold text-blue-800 dark:text-blue-300 mb-2">{{ t('echoes.welcomeNewcomers') }}</h3>
          <p class="text-blue-700 dark:text-blue-300 text-sm mb-2">{{ t('echoes.newcomersDescription') }}</p>
          <div class="mt-3 p-3 bg-blue-100 dark:bg-blue-900/50 rounded border border-blue-300 dark:border-blue-700">
            <div class="font-medium text-blue-800 dark:text-blue-300 text-sm">{{ t('echoes.yourAnnouncementUsage') }}</div>
            <div class="flex items-center mt-1">
              <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                <div class="bg-blue-600 h-2.5 rounded-full" :style="{ width: `${(userAnnouncementCount / maxAnnouncementsPerAddress) * 100}%` }"></div>
              </div>
              <div class="ml-3 text-sm text-blue-700 dark:text-blue-300">{{ userAnnouncementCount }} / {{ maxAnnouncementsPerAddress }}</div>
            </div>
          </div>
        </div>

        <!-- Click outside dropdown handler -->
        <div v-if="showActionsMenu" class="fixed inset-0 z-30" @click="showActionsMenu = false"></div>

        <CreateVoteDialog
          :visible="showVote"
          :echo-name="selectedEchoName"
          @close="showVote = false"
          @sent="showVote = false"
        />

        <!-- Refill Dialog -->
        <div v-if="showRefillDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showRefillDialog = false">
          <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-lg font-bold mb-4 dark:text-white">{{ t('echoes.refill') }}</h3>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {{ t('echoes.refillConference') }}: <strong>{{ selectedEchoName }}</strong>
              </label>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {{ t('echoes.refillBefore') }}:
              </label>
              <input
                type="date"
                v-model="refillDate"
                :max="refillMaxDate"
                class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {{ t('echoes.refillHint') }}
              </p>
            </div>
            <div v-if="refillError" class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300">{{ refillError }}</div>
            <div class="flex justify-end gap-3">
              <button @click="showRefillDialog = false" class="px-4 py-2 border rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" :disabled="refillLoading">{{ t('app.cancel') }}</button>
              <button @click="sendRefillRequest" class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600" :disabled="refillLoading">
                <span v-if="!refillLoading">{{ t('echoes.requestRefill') }}</span>
                <span v-else class="animate-spin">⟳</span>
              </button>
            </div>
          </div>
        </div>

        <OpenNodesPanel
          v-if="isEmergencyEcho"
          :messages="echo.messages[selectedEchoName] || []"
          :netmail="echo.messages['__netmail__'] || []"
        />

        <!-- Messages -->
        <div>
          <MessageList
            ref="messageListRef"
            :echo-name="selectedEchoName"
            :last-read="echo.lastReadOf(selectedEchoName)"
            :view-mode="viewMode"
            :reader-start-id="readerRouteMessageId"
            :hide-protocols="!showProtocolInFeed"
            :can-react="selectedEchoCanWrite"
            @moderate="handleModerate"
            @reply="handleReply"
            @forward="handleForward"
            @edit="handleEdit"
            @edit-draft="handleEditDraft"
            @mark="handleMark"
            @open="openEchoMessage"
            @reader-navigate="onReaderNavigate"
          />
        </div>

        <ForwardDialog
          :show="showForwardDialog"
          :message="forwardMessage"
          @close="showForwardDialog = false"
          @forward="handleForwardAction"
        />
      </div> <!-- end scrollable content -->

      <!-- Jump to the first unread / newest messages (#302) -->
      <button
        v-if="showJumpPill"
        @click="jumpToUnread"
        class="absolute bottom-4 right-6 z-20 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs shadow-lg hover:bg-blue-700 flex items-center gap-1"
        :title="t('echoes.jumpToNew')"
      >
        <span v-if="selectedUnreadCount > 0">↓ {{ t('echoes.newMessagesCount', { count: selectedUnreadCount }) }}</span>
        <span v-else>↓ {{ t('echoes.jumpToNew') }}</span>
      </button>

        </template> <!-- end regular echo -->

      </template>

      <!-- No echo selected: digest -->
      <template v-else>
        <h2 class="text-xl font-bold mb-4 dark:text-white">{{ t('echoes.latestMessages') }}</h2>
        <div v-if="echo.loading" class="text-gray-500 dark:text-gray-400">{{ t('echoes.loading') }}</div>
        <div v-else-if="echo.error" class="text-red-500 mb-4">{{ echo.error }}</div>
        <div v-else-if="digestMessages.length === 0" class="text-gray-500 dark:text-gray-400">{{ t('echoes.noMessages') }}</div>
        <div v-else>
          <div v-for="item in digestMessages" :key="item.echoName"
            @click="selectEcho(item.echoName)"
            class="border rounded-lg p-3 mb-2 cursor-pointer hover:shadow-md dark:border-gray-700 dark:hover:bg-gray-700"
          >
            <div class="font-semibold text-sm dark:text-gray-200">{{ item.echoName }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <SenderLabel :address="item.message.sender_address" :name-from-message="senderNameFromData(item.message)" class="font-medium" />
            </div>
            <div class="text-sm mt-1 dark:text-gray-300">{{ truncateMessage(item.message) }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ formatTimestamp(item.message.timestamp) }}</div>
          </div>
        </div>
        <div class="mb-3 flex flex-col gap-y-1">
          <div class="flex items-center gap-1">
            <button @click="openSubscribeModal" class="px-2 py-1 text-sm border rounded hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700" title="List">{{ t('echoes.manageSubscriptions') }}</button>
            <span v-if="newEchoCount > 0" class="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{{ newEchoCount }}</span>
          </div>
          <div class="flex items-center gap-1">
            <button @click="showCreateEchoModal = true" class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">
              + {{ t('app.createEcho') }}
            </button>
          </div>
        </div>

      </template>

    </div>

    <!-- Pending refill requests of the current echo -->
    <RefillDialog
      v-if="pendingRefillRequests.length > 0"
      class="w-full md:w-1/6 min-w-[160px] border rounded-lg p-3 dark:border-gray-700 dark:bg-gray-800"
      :requests="pendingRefillRequests"
      @respond="handleRefillRespond"
      @decline="handleRefillDecline"
      @postpone="handleRefillPostpone"
    />
    <OutboxDialog :visible="showOutbox" @close="showOutbox = false" @sent="showOutbox = false" />
    <MessageEditor :visible="showMessageEditor" :echo-name="selectedEchoName || ''" :quote="replyQuote" :edit-message="editMessage" @close="closeMessageEditor" @sent="closeMessageEditor" />

    <!-- Rules popup -->
    <div v-if="showRules && (selectedEchoRulesText || selectedEchoRules)" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 echoes-modal" @click.self="showRules = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h3 class="font-bold text-lg mb-4 dark:text-white">{{ selectedEchoDisplayName }} — {{ t('echoes.rules') }}</h3>
        <div v-if="selectedEchoRulesText" class="text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded mb-4">
          <MarkdownRenderer :content="selectedEchoRulesText" />
        </div>
        <div v-if="selectedEchoRulesJson" class="text-sm">
          <h4 class="font-medium text-gray-600 dark:text-gray-400 mb-2">{{ t('echoes.rulesParams') }}</h4>
          <pre class="text-xs whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded dark:text-gray-300">{{ selectedEchoRulesJson }}</pre>
        </div>
        <pre v-if="selectedEchoRules && !selectedEchoRulesText && !selectedEchoRulesJson" class="text-sm whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-4 rounded dark:text-gray-300">{{ selectedEchoRules }}</pre>
        <div class="mt-4 flex justify-end gap-2">
          <button v-if="isModeratorOfSelectedEcho" @click="showRulesEdit = true"
            class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 dark:text-white text-sm">
            {{ t('rulesEdit.editRules') }}
          </button>
          <button @click="showRules = false" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded dark:text-gray-300">{{ t('app.close') }}</button>
        </div>
      </div>
    </div>

    <!-- Rules edit dialog (moderator-only) -->
    <RulesEditDialog
      :visible="showRulesEdit"
      :echo-name="selectedEchoName || ''"
      :current-rules="selectedEchoRulesRaw"
      :allow-rename="canRenameSelectedEcho"
      @close="showRulesEdit = false"
    />

    <EchoGroupsDialog
      :visible="showGroupsDialog"
      :echoes="sortedEchoes"
      :groups="groupState.groups"
      @close="showGroupsDialog = false"
      @save="saveGroups"
    />

    <!-- Protocols popup -->
    <div v-if="showProtocols" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 echoes-modal" @click.self="showProtocols = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-lg dark:text-white">{{ t('echoes.protocols') }}</h3>
          <button @click="showProtocols = false" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>
        <!-- Active protocol messages -->
        <div v-if="protocolMessages.length === 0 && dismissedProtocolMessages.length === 0" class="text-gray-500 dark:text-gray-400 text-sm">{{ t('echoes.noProtocols') }}</div>
        <div v-if="protocolMessages.length > 0" class="space-y-2 mb-4">
          <div v-for="msg in protocolMessages" :key="msg.message_id"
            class="border rounded p-3 text-sm dark:border-gray-700 dark:text-gray-300"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="px-1.5 py-0.5 text-xs rounded font-medium text-white"
                :class="protocolBadgeClass(msg)"
              >{{ msg.type }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatTimestamp(msg.timestamp) }}</span>
              <span v-if="isProtocolExpired(msg)" class="px-1.5 py-0.5 text-xs rounded bg-gray-300 text-gray-700 ml-1">{{ t('protocol.expired') }}</span>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400"><SenderLabel :address="msg.sender_address" compact /></div>
            <div class="mt-1 whitespace-pre-wrap">{{ truncateProtocol(msg) }}</div>
            <div v-if="phaseSummary(msg)" class="mt-1 text-xs flex items-center gap-1">
              <span v-for="(p, i) in phaseSummary(msg).labels" :key="i"
                :class="p === phaseSummary(msg).current ? 'font-bold text-blue-600' : 'text-gray-400'">
                {{ p }}
                <span v-if="i < phaseSummary(msg).labels.length - 1" class="mx-0.5">→</span>
              </span>
              <span v-if="phaseSummary(msg).remaining" class="ml-2 text-gray-400">— {{ phaseSummary(msg).remaining }}</span>
            </div>
            <!-- Reactions on the protocol message (#297) -->
            <div v-if="msg.message_id" class="mt-2">
              <ReactionButton v-if="selectedEchoCanWrite" :target-message-id="msg.message_id" :echo-name="msg.echo_name || selectedEchoName || ''" />
            </div>
          </div>
        </div>
        <!-- Dismissed protocol messages -->
        <div v-if="dismissedProtocolMessages.length > 0">
          <h4 class="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">{{ t('echoes.dismissedMessages', { count: dismissedProtocolMessages.length }) }}</h4>
          <div v-for="msg in dismissedProtocolMessages" :key="msg.message_id"
            class="border rounded p-3 text-sm dark:border-gray-700 dark:text-gray-400 opacity-60"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="px-1.5 py-0.5 text-xs rounded font-medium text-white"
                :class="protocolBadgeClass(msg)"
              >{{ msg.type }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatTimestamp(msg.timestamp) }}</span>
              <button @click="restoreMessage(msg)" class="ml-auto text-xs text-blue-500 hover:text-blue-700">{{ t('app.restore') }}</button>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400"><SenderLabel :address="msg.sender_address" compact /></div>
            <div class="mt-1 whitespace-pre-wrap">{{ truncateProtocol(msg) }}</div>
            <div v-if="phaseSummary(msg)" class="mt-1 text-xs flex items-center gap-1">
              <span v-for="(p, i) in phaseSummary(msg).labels" :key="i"
                :class="p === phaseSummary(msg).current ? 'font-bold text-blue-600' : 'text-gray-400'">
                {{ p }}
                <span v-if="i < phaseSummary(msg).labels.length - 1" class="mx-0.5">→</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SubscribeModal :visible="showSubscribeModal" @close="showSubscribeModal = false" @remote-subscribe="openRemoteSubscribe" />
    <RemoteSubscribeDialog :visible="showRemoteSubscribe" @close="showRemoteSubscribe = false" />
    <CreateElectionDialog :visible="showElection" :echo-name="selectedEchoName" @close="showElection = false" @sent="showElection = false" />
    <CreateEchoModal v-if="showCreateEchoModal" :visible="showCreateEchoModal" @close="showCreateEchoModal = false" @created="handleEchoCreated" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useEchoStore } from '../stores/echo'
import { useIdentityStore } from '../stores/identity'
import { useProtocolStore } from '../stores/protocol'
import { useNotificationsStore } from '../stores/notifications'
import { apiService } from '../services/api'
import { senderNameFromData } from '../utils/messages'
import { hasRestrictedWriters, canWriteToEcho } from '../utils/rules'
import { createSignedMessage, fetchEchoMessages, sendNetmail } from '../services/message'
import { sendRefillResponse, countRefillableMessages, refillRequestFromMessage, refillableMessagesFor, refillRequestsForEcho, refillBeforeDate } from '../services/refill'
import { buildForwardData } from '../utils/forward'
import { keyService } from '../services/keyService'
import { getElectionState, getVoteState, getExcommunicateState, formatRemaining, ensurePolicyParams } from '../composables/useProtocolPhases'
import { useSettingsStore } from '../stores/settings'
import { usePolling } from '../composables/usePolling'
import MessageComposer from '../components/MessageComposer.vue'
import MessageList from '../components/MessageList.vue'
import ForwardDialog from '../components/ForwardDialog.vue'
import ActiveProtocolsList from '../components/ActiveProtocolsList.vue'
import CreateVoteDialog from '../components/CreateVoteDialog.vue'
import SubscribeModal from '../components/SubscribeModal.vue'
import RemoteSubscribeDialog from '../components/RemoteSubscribeDialog.vue'
import CreateElectionDialog from '../components/CreateElectionDialog.vue'
import CreateEchoModal from '../components/CreateEchoModal.vue'
import MessageEditor from '../components/MessageEditor.vue'
import { resolveQueryEcho } from '../utils/routeEcho'
import { specialEchoName } from '../utils/policyParams'
import OutboxDialog from '../components/OutboxDialog.vue'
import RefillDialog from '../components/RefillDialog.vue'
import RulesEditDialog from '../components/RulesEditDialog.vue'
import EchoGroupsDialog from '../components/EchoGroupsDialog.vue'
import { loadEchoGroups, saveEchoGroups, removeEchoGroup, UNREAD_GROUP_ID, UNGROUPED_GROUP_ID } from '../utils/echoGroups'
import { isEchoVisibleInSidebar } from '../utils/echoVisibility'
import { useOutbox } from '../composables/useOutbox'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import ReactionButton from '../components/ReactionButton.vue'
import SenderLabel from '../components/SenderLabel.vue'
import LocalBlogView from '../components/LocalBlogView.vue'
import OpenNodesPanel from '../components/OpenNodesPanel.vue'
import * as blogStore from '../services/blogStore'
import * as db from '../services/db'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const echo = useEchoStore()
const identity = useIdentityStore()
const protocol = useProtocolStore()
const notifications = useNotificationsStore()
const settings = useSettingsStore()

// Выбранная эха (null = показываем digest)
const selectedEchoName = ref(null)
const newcomersEchoName = computed(() => identity.newcomersEchoName)

// Keep the open conference selected when the node reports its new name.
watch(() => echo.renamedEchoes, async (renames) => {
  if (renames && Object.keys(renames).length > 0) {
    groupState.value = loadEchoGroups()
  }
  const nextName = selectedEchoName.value ? renames?.[selectedEchoName.value] : null
  if (!nextName) return
  selectedEchoName.value = nextName
  if (!echo.messages[nextName]) {
    await echo.loadEcho(nextName)
    await landOnUnread()
  }
})

// Состояние для reply, forward, draft
const replyQuote = ref(null)
const editMessage = ref(null)
const forwardMessage = ref(null)
const showForwardDialog = ref(false)
const showRules = ref(false)
const showRulesEdit = ref(false)
const showGroupsDialog = ref(false)
const showVote = ref(false)
const showSubscribeModal = ref(false)
const showCreateEchoModal = ref(false)
const showRemoteSubscribe = ref(false)

function openRemoteSubscribe() {
  showSubscribeModal.value = false
  showRemoteSubscribe.value = true
}
const mobileSidebarOpen = ref(false)
const showElection = ref(false)
const showMessageEditor = ref(false)
const showOutbox = ref(false)
const outbox = useOutbox()
const outboxCount = computed(() => outbox.count.value)
const showProtocols = ref(false)

// Refill request tracking for right sidebar dialog
// (declared before the watcher below — the immediate watcher runs during setup
// and would otherwise hit the TDZ of these refs).
const refillRequests = ref([])
const refillPostponed = ref({}) // messageId -> askAgainAt timestamp

// Refill requests the user chose to hide (or already responded to). Persisted so
// they stay hidden after a reload. Keyed by the refill request's message_id.
const HIDDEN_REFILLS_KEY = 'fm_hidden_refill_requests'
function loadHiddenRefillRequests() {
  try { return JSON.parse(localStorage.getItem(HIDDEN_REFILLS_KEY) || '[]') } catch { return [] }
}
const hiddenRefillRequests = ref(loadHiddenRefillRequests())
function hideRefillRequest(messageId) {
  if (!messageId || hiddenRefillRequests.value.includes(messageId)) return
  hiddenRefillRequests.value = [...hiddenRefillRequests.value, messageId]
  try { localStorage.setItem(HIDDEN_REFILLS_KEY, JSON.stringify(hiddenRefillRequests.value)) } catch { /* ignore */ }
}

// Counts of locally stored refillable messages per request. For a loaded echo
// the in-memory count is used (fast and reactive); otherwise the count is read
// from IndexedDB — the echo store keeps only MAX_LOADED_ECHOES echoes (#274).
const refillCounts = ref({}) // messageId -> count

function setRefillCount(messageId, count) {
  if (refillCounts.value[messageId] === count) return
  refillCounts.value = { ...refillCounts.value, [messageId]: count }
}

async function refreshRefillCount(req) {
  const loadedMsgs = echo.messages[req.echoName]
  if (Array.isArray(loadedMsgs)) {
    setRefillCount(req.messageId, countRefillableMessages(loadedMsgs, req.before))
    return
  }
  if (refillCounts.value[req.messageId] === undefined) {
    setRefillCount(req.messageId, countLocalMessagesForRefill(req.echoName, req.before))
  }
  try {
    const { getAllMessages } = await import('../services/db')
    const all = await getAllMessages(req.echoName)
    setRefillCount(req.messageId, countRefillableMessages(all, req.before))
  } catch (err) {
    console.warn('[refill] failed to count local messages', err)
  }
}

// Message counts per echo — a cheap signal that changes when messages arrive,
// so the refill counts are recomputed (a stale 0 kept the block hidden, #274).
const echoMessageCounts = computed(() => {
  const out = {}
  for (const [name, list] of Object.entries(echo.messages)) {
    out[name] = Array.isArray(list) ? list.length : 0
  }
  return out
})

// Watch protocol store's refill requests and forward to local state
const protocolStore = useProtocolStore()
watch(() => protocolStore.refillRequests, (newReqs) => {
  for (const req of newReqs) {
    addRefillRequest(req.from, req.echoName, req.before, req.messageId)
  }
}, { deep: true, immediate: true })

// Safety net: the protocol store keeps refill requests in localStorage and can
// lose them (e.g. a storage reset), while the message itself stays in the echo
// store/IndexedDB. Register requests found in the loaded local messages too.
function registerRefillRequestsFromMessages() {
  for (const list of Object.values(echo.messages)) {
    if (!Array.isArray(list)) continue
    for (const m of list) {
      const req = refillRequestFromMessage(m)
      if (req) addRefillRequest(req.from, req.echoName, req.before, req.messageId)
    }
  }
}
watch(() => echo.messages, registerRefillRequestsFromMessages, { immediate: true })
const showComposer = ref(false)
const showActionsMenu = ref(false)
// Open actions menu of a user-defined conference group (#388).
const groupMenuId = ref(null)
const showProtocolInFeed = ref(localStorage.getItem('fm_dev_mode') === 'true')
watch(showProtocolInFeed, (val) => {
  localStorage.setItem('fm_dev_mode', val ? 'true' : 'false')
})
const showActiveProtocols = ref(localStorage.getItem('fm_show_active_protocols') !== 'false')
watch(showActiveProtocols, (val) => {
  localStorage.setItem('fm_show_active_protocols', val ? 'true' : 'false')
})
const showRefillDialog = ref(false)
const refillDate = ref(new Date().toISOString().split('T')[0])

/**
 * Режим отображения сообщений эхи (#319): 'feed' | 'tree' | 'threads'.
 * Живёт здесь, чтобы панель переключения была вне прокручиваемой ленты,
 * и сохраняется между перезагрузками.
 */
const viewMode = ref(localStorage.getItem('fm_echo_view_mode') || 'feed')
watch(viewMode, (val) => {
  localStorage.setItem('fm_echo_view_mode', val)
})

/**
 * Switching the view mode keeps the reading position (#302): the list lands on
 * the last read message (the feed, tree and threads views alike). The reader
 * positions itself (#317), so nothing to do here.
 */
watch(viewMode, async (mode, oldMode) => {
  if (mode === oldMode || mode === 'reader' || !selectedEchoName.value || selectedBlog.value) return
  suppressMarkRead(800)
  await nextTick()
  const list = messageListRef.value
  if (!list) return
  await list.scrollToLastRead()
  updateFeedScroll()
  // Leaving the reader mode drops the /reader/:id suffix from the URL (#322).
  if (route.name === 'EchoReader') {
    const item = echo.echoes.find(e => e.name === selectedEchoName.value)
    if (item) router.replace({ name: 'EchoDetail', params: { id: String(item.id) } })
  }
})

// ---- Reader URL (#322): /echoes/:id/reader/:messageId ----

/** Message id from the reader URL (empty outside the reader route). */
const readerRouteMessageId = computed(() =>
  route.name === 'EchoReader' && route.params.messageId ? String(route.params.messageId) : ''
)

/** Последнее сообщение, о котором сообщила читалка (для сравнения с URL). */
const currentReaderMessageId = ref('')

/**
 * Читалка сообщает текущее сообщение — кладём его в URL (replace, без
 * засорения истории), чтобы после ухода и возврата вид восстановился (#322).
 */
function onReaderNavigate(messageId) {
  currentReaderMessageId.value = messageId || ''
  if (viewMode.value !== 'reader' || !selectedEchoName.value || !messageId) return
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  if (!item) return
  if (route.name === 'EchoReader'
    && String(route.params.id) === String(item.id)
    && String(route.params.messageId) === messageId) return
  router.replace({ name: 'EchoReader', params: { id: String(item.id), messageId } })
}

// Навигация назад/вперёд по URL читалки: показать запрошенное сообщение.
watch(() => route.params.messageId, async (val) => {
  if (route.name !== 'EchoReader' || !val) return
  if (currentReaderMessageId.value === String(val)) return
  messageListRef.value?.goToMessageById(String(val))
})
const refillLoading = ref(false)
const refillError = ref('')
const refillMaxDate = computed(() => new Date().toISOString().split('T')[0])
// Our own active refill request for the selected echo (the node does not echo
// the requester's own request back, so it is tracked locally by identity store).
const myActiveRefill = computed(() =>
  selectedEchoName.value ? (identity.myRefillRequests?.[selectedEchoName.value] || null) : null
)
// ID редактируемого черновика (передаётся в MessageComposer)
const editingDraftId = ref(null)

const pendingRefillRequests = computed(() => {
  const now = Date.now()
  // Only requests of the conference being viewed — refills for other echoes
  // must not appear in this echo's sidebar (#274).
  const currentEcho = selectedEchoName.value
  return refillRequestsForEcho(refillRequests.value, currentEcho)
    .filter(req => {
      if (hiddenRefillRequests.value.includes(req.messageId)) return false
      const postponed = refillPostponed.value[req.messageId]
      if (postponed && postponed > now) return false
      return true
    })
    .map(req => {
      // Prefer the IndexedDB count: the echo may not be loaded into memory (#274).
      const count = refillCounts.value[req.messageId] ?? countLocalMessagesForRefill(req.echoName, req.before)
      const postponed = refillPostponed.value[req.messageId]
      return {
        ...req,
        count,
        status: count > 0 ? 'pending' : 'no_messages',
        askAgainAt: postponed || null,
      }
    })
    .filter(req => req.count > 0)
})

// Keep the per-request counts up to date: when requests change and when local
// messages arrive (the echo may be loaded after the request was registered).
watch([refillRequests, echoMessageCounts], () => {
  for (const req of refillRequests.value) refreshRefillCount(req)
}, { deep: true, immediate: true })

function addRefillRequest(from, echoName, before, messageId) {
  // Dedup
  if (refillRequests.value.find(r => r.messageId === messageId)) return
  refillRequests.value.push({ from, echoName, before, messageId })
}

function countLocalMessagesForRefill(echoName, beforeDate) {
  return countRefillableMessages(echo.messages[echoName] || [], beforeDate)
}

async function handleRefillRespond(req) {
  // The echo may not be loaded into memory (#274) — read its messages from
  // IndexedDB in that case.
  let msgs = echo.messages[req.echoName]
  if (!Array.isArray(msgs)) {
    try {
      const { getAllMessages } = await import('../services/db')
      msgs = await getAllMessages(req.echoName)
    } catch (err) {
      console.warn('[refill] failed to read local messages', err)
      msgs = []
    }
  }
  const messages = refillableMessagesFor(msgs, req.before).slice(-100)

  if (messages.length === 0) {
    hideRefillRequest(req.messageId)
    return
  }

  try {
    // Ответ уходит сразу (как и из карточки ленты / детального вида).
    const res = await sendRefillResponse(req, messages, { echoes: echo.echoes })
    if (res.skipped > 0) {
      alert(`Skipped ${res.skipped} message(s) (no signature or exceed the size limit)`)
    }
    hideRefillRequest(req.messageId)
  } catch (err) {
    console.error('Refill respond error:', err)
  }
}

function handleRefillDecline(req) {
  // Persistently hide so it does not reappear after a reload. The request stays
  // in the list so it can be restored from the hidden section (#274).
  hideRefillRequest(req.messageId)
}

function handleRefillPostpone(req, days) {
  const askAgainAt = Date.now() + days * 24 * 60 * 60 * 1000
  refillPostponed.value = { ...refillPostponed.value, [req.messageId]: askAgainAt }
}

/** CSS-класс для бейджа типа протокола */
function protocolBadgeClass(msg) {
  const cls = {
    vote: 'bg-blue-500', election: 'bg-yellow-500', excommunicate: 'bg-red-500',
    refill: 'bg-purple-500', change_policy: 'bg-indigo-500', remove_echo: 'bg-pink-500',
    merge: 'bg-orange-500', conflict: 'bg-gray-700', recover: 'bg-teal-500',
  }
  return cls[msg.type] || 'bg-gray-500'
}

/** Compact phase labels + current phase + remaining time for popup */
function phaseSummary(msg) {
  if (msg.type === 'election') {
    const state = getElectionState(msg, protocolMessages.value, protocolStore.electionPhases?.[msg.echo_name] || null)
    if (!state || !state.phases) return null
    const labels = state.phases.map(p => {
      switch (p.name) {
        case 'Collection': return t('election.collectionPhase') || 'Collection'
        case 'Voting': return t('election.votingPhase') || 'Voting'
        case 'Ended': return t('election.endedPhase') || 'Ended'
        default: return p.name
      }
    })
    const current = labels.find((_, i) => state.phases[i].active)
    return {
      labels,
      current,
      remaining: state.phase !== 'ended' ? formatRemaining(state.remaining) : '',
    }
  }
  if (msg.type === 'vote') {
    const state = getVoteState(msg)
    if (!state || !state.phases) return null
    const labels = state.phases.map(p => {
      return p.name === 'Voting' ? (t('vote.votingPhase') || 'Voting') : (t('vote.endedPhase') || 'Ended')
    })
    const current = labels.find((_, i) => state.phases[i].active)
    return {
      labels,
      current,
      remaining: state.phase === 'voting' ? formatRemaining(state.remaining) : '',
    }
  }
  if (msg.type === 'excommunicate') {
    const state = getExcommunicateState(msg, protocolMessages.value)
    if (!state || !state.phases) return null
    const labels = state.phases.map(p => {
      switch (p.name) {
        case 'Voting': return t('excommunicate.votingPhase') || 'Voting'
        case 'Read-only': return t('excommunicate.readOnlyPhase') || 'Read-only'
        case 'Permanent': return t('excommunicate.permanentPhase') || 'Permanent'
        case 'Removed': return t('excommunicate.removedPhase') || 'Removed'
        default: return p.name
      }
    })
    const current = labels.find((_, i) => state.phases[i].active)
    return {
      labels,
      current,
      remaining: (state.phase === 'voting' || state.phase === 'read_only') ? formatRemaining(state.remaining) : '',
    }
  }
  return null
}

/** Обрезает протокольное сообщение для отображения в попапе */
function truncateProtocol(msg) {
  try {
    const d = JSON.parse(msg.data)
    return d.message || d.proto || JSON.stringify(d).slice(0, 200)
  } catch { return String(msg.data || '').slice(0, 200) }
}

/** Проверяет, истёк ли протокол (есть fail-результат) */
function isProtocolExpired(msg) {
  try {
    const data = JSON.parse(msg.data)
    if (data.type !== 'poster') return false
    const allMsgs = protocolMessages.value
    return allMsgs.some(m => {
      if (m.type !== msg.type) return false
      try {
        const d = JSON.parse(m.data)
        return d.type === 'result' && d.result === 'fail'
      } catch { return false }
    })
  } catch { return false }
}

function formatTimestamp(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleString()
}

/** Внутреннее change_policy-сообщение чанка (не протокол сам по себе) */
function isChangePolicyChunk(m) {
  if (!m || m.type !== 'change_policy') return false
  try { return JSON.parse(m.data).chunk_index !== undefined } catch { return false }
}

/** A vote ballot (a user's vote), as opposed to a poster or a result. */
function isVoteBallot(m) {
  if (!m || m.type !== 'vote') return false
  try { return JSON.parse(m.data).type === 'vote' } catch { return false }
}

/** Протокольные сообщения для выбранной эхи (постеры/результаты голосований
 *  включены, бюллетени и чанки change_policy — нет) */
function protocolList(messages) {
  return messages.filter(m => !isVoteBallot(m) && !isChangePolicyChunk(m))
}

/** Активные протокольные сообщения для выбранной эхи */
const protocolMessages = computed(() => {
  if (!selectedEchoName.value) return []
  return protocolList(protocol.getByEcho(selectedEchoName.value) || [])
})

/** Скрытые протокольные сообщения */
const dismissedProtocolMessages = computed(() => {
  if (!selectedEchoName.value) return []
  const ds = echo.dismissedMessages || []
  return protocolList(protocol.getByEcho(selectedEchoName.value) || []).filter(m => ds.includes(m.message_id))
})

/** Восстанавливает скрытое сообщение */
function restoreMessage(msg) {
  const arr = [...(echo.dismissedMessages || [])]
  const idx = arr.indexOf(msg.message_id)
  if (idx !== -1) {
    arr.splice(idx, 1)
    localStorage.setItem('fm_dismissed_messages', JSON.stringify(arr))
    const ds = echo.dismissedMessages
    ds.length = 0
    ds.push(...arr)
  }
}

const poll = usePolling()

/** Режим сортировки списка: 'date' (последнее сообщение) или 'alpha' (алфавит). */
const sortMode = ref(localStorage.getItem('fm_echo_sort') === 'alpha' ? 'alpha' : 'date')
watch(sortMode, (val) => {
  localStorage.setItem('fm_echo_sort', val)
})

/** CSS для кнопок-переключателей сортировки */
function sortControlClass(mode) {
  return [
    'px-2 py-0.5 text-xs rounded border',
    sortMode.value === mode
      ? 'bg-blue-600 text-white border-blue-600'
      : 'hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700',
  ]
}

/** CSS для элемента списка эх/блогов */
function echoItemClass(name) {
  return [
    'flex items-center justify-between p-2 rounded cursor-pointer mb-1',
    selectedEchoName === name
      ? 'bg-blue-100 dark:bg-blue-900'
      : 'hover:bg-gray-100 dark:hover:bg-gray-700',
  ]
}

/**
 * Список подписанных эх + локальные блоги. Блоги всегда отдельным блоком сверху.
 * Каждый блок сортируется по выбранному режиму (по алфавиту или по дате
 * последнего сообщения).
 */
const sortedBlogs = computed(() => {
  const items = localBlogs.value.map(b => ({
    name: b.name,
    description: b.description,
    isBlog: true,
    _last: blogActivity.value[b.id] || 0,
  }))
  return sortList(items)
})

const sortedEchoes = computed(() => {
  const echoes = echo.echoes.filter(e => isEchoVisibleInSidebar(e, {
    subscribedEchoes: echo.subscribedEchoes,
    isSubscribed: identity.isSubscribed,
  }))
  const items = echoes.map(e => ({ ...e, _last: echoActivity.value[e.name] || 0 }))
  return sortList(items)
})

/** Сортирует элементы по текущему режиму (стабильно, без мутации исходников). */
function sortList(items) {
  const arr = [...items]
  if (sortMode.value === 'alpha') {
    return arr.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }
  return arr.sort((a, b) => (b._last || 0) - (a._last || 0))
}

// User-defined conference groups (#366), persisted in localStorage.
const groupState = ref(loadEchoGroups())

function persistGroups() {
  saveEchoGroups(groupState.value)
}

function saveGroups(nextGroups) {
  groupState.value = { ...groupState.value, groups: nextGroups }
  persistGroups()
}

/** Delete a user-defined group; its conferences fall into "Ungrouped" (#388). */
function deleteEchoGroup(section) {
  groupMenuId.value = null
  if (!section || section.system || section.id === UNGROUPED_GROUP_ID) return
  if (!confirm(t('echoes.groups.deleteConfirm', { group: section.name }))) return
  saveGroups(removeEchoGroup(groupState.value.groups, section.id))
}

function isGroupExpanded(id) {
  return groupState.value.expanded?.[id] !== false
}

function toggleGroup(id) {
  groupState.value = {
    ...groupState.value,
    expanded: {
      ...groupState.value.expanded,
      [id]: !isGroupExpanded(id),
    },
  }
  persistGroups()
}

/**
 * Sidebar sections: the system "Unread" group, saved user groups and the
 * "Ungrouped" section. The Unread group is dynamic and overlaps with user
 * groups; an echo belongs to at most one user group.
 */
const echoSections = computed(() => {
  const byName = new Map(sortedEchoes.value.map(item => [item.name, item]))
  const unreadItems = sortList(sortedEchoes.value.filter(item => unreadCount(item.name) > 0))
  const sections = [{
    id: UNREAD_GROUP_ID,
    name: t('echoes.groups.unread'),
    items: unreadItems,
    system: true,
  }]
  const assigned = new Set()
  for (const group of groupState.value.groups) {
    const items = sortList(group.echoes.map(name => byName.get(name)).filter(Boolean))
    for (const item of items) assigned.add(item.name)
    sections.push({
      id: group.id,
      name: group.name,
      items,
      system: false,
    })
  }
  const ungrouped = sortList(sortedEchoes.value.filter(item => !assigned.has(item.name)))
  sections.push({
    id: UNGROUPED_GROUP_ID,
    name: t('echoes.groups.ungrouped'),
    items: ungrouped,
    system: false,
  })
  return sections
})

/** Локальные блоги (из IndexedDB) */
const localBlogs = ref([])

/** blogId → timestamp последнего поста блога */
const blogActivity = ref({})

/** echoName → timestamp последнего сообщения эхи (из IndexedDB) */
const echoActivity = ref({})

async function loadLocalBlogs() {
  try {
    localBlogs.value = await blogStore.getBlogs()
  } catch (err) {
    console.warn('Failed to load local blogs:', err)
  }
  try {
    const posts = await blogStore.getAllBlogPosts()
    const map = {}
    for (const p of posts) {
      if (!p || !p.blogId) continue
      const ts = p.timestamp || 0
      if (!map[p.blogId] || ts > map[p.blogId]) map[p.blogId] = ts
    }
    blogActivity.value = map
  } catch (err) {
    console.warn('Failed to load blog activity:', err)
  }
}

/** Обновляет карту последних сообщений для подписанных эх. */
async function refreshEchoActivity() {
  const names = new Set()
  for (const e of echo.echoes) {
    if (e.subscribed || e.no_subscribe || echo.subscribedEchoes.includes(e.name) || identity.isSubscribed(e.name)) {
      names.add(e.name)
    }
  }
  for (const b of localBlogs.value) names.delete(b.name)
  const { getLastMessageTimestamp } = await import('../services/db')
  const map = {}
  await Promise.all([...names].map(async (name) => {
    try {
      map[name] = await getLastMessageTimestamp(name)
    } catch (err) {
      console.warn('Failed to get last timestamp for', name, err)
      map[name] = 0
    }
  }))
  echoActivity.value = map
}

/** Выбранный локальный блог (если выбранная эха — блог) */
const selectedBlog = computed(() => {
  if (!selectedEchoName.value) return null
  return localBlogs.value.find(b => b.name === selectedEchoName.value) || null
})

/** Блог удалён — сбросить выбор */
function handleBlogDeleted() {
  if (selectedEchoName.value) {
    const stillExists = localBlogs.value.some(b => b.name === selectedEchoName.value)
    if (!stillExists) selectedEchoName.value = null
  }
  loadLocalBlogs()
}

/** Блог переименован/изменён — перезагрузить список */
function handleBlogUpdated(updated) {
  if (updated?.name) selectedEchoName.value = updated.name
  loadLocalBlogs()
}

/** Конференция/блог созданы — обновить списки, чтобы новая появилась в подписках */
function handleEchoCreated(created) {
  loadEchoes()
  if (created?.type === 'blog') {
    loadLocalBlogs()
  }
}

/** Неподписанные эхи, которые пользователь ещё не просматривал (для бейджа) */
const unseenNewEchoes = computed(() => {
  return echo.echoes.filter(e => {
    if (isEchoVisibleInSidebar(e, {
      subscribedEchoes: echo.subscribedEchoes,
      isSubscribed: identity.isSubscribed,
    })) return false
    if (echo.isEchoSeen(e.name)) return false
    return true
  })
})

/** Количество новых (неподписанных, ещё не просмотренных) эх для бейджа */
const newEchoCount = computed(() => unseenNewEchoes.value.length)

/** Открыть окно подписок и пометить текущие новые эхи просмотренными */
function openSubscribeModal() {
  showSubscribeModal.value = true
  // Список эх мог устареть (новые эхи сети, подписки с других устройств) —
  // обновляем в фоне, модалка обновляется реактивно (#270).
  loadEchoes()
  echo.markEchoesSeen(unseenNewEchoes.value.map(e => e.name))
}

/** Количество непрочитанных сообщений в эхе */
function unreadCount(echoName) {
  return echo.unreadCount(echoName)
}

// После каждого успешного poll обновляем только даты последних сообщений
// для сортировки «по дате». Сообщения в стор кладёт сам poll (doPoll →
// echo.addMessages), отдельный fetchEchoMessages был бы вторым send_receive
// за цикл (#330).
watch(() => poll.pollVersion.value, async () => {
  await refreshEchoActivity()
})

// Новые сообщения во время просмотра (#302): если пользователь у низа ленты
// (у самых новых), прокручиваем к ним и помечаем эху прочитанной; иначе
// оставляем непрочитанными — плашка покажет их количество.
watch(() => {
  if (!selectedEchoName.value) return 0
  return (echo.messages[selectedEchoName.value] || []).length
}, async (len, oldLen) => {
  // `oldLen === 0` is the initial load of the echo, not "new messages": the
  // unread block must survive opening the page (#302).
  if (!selectedEchoName.value || len <= oldLen || oldLen === 0) return
  // The reader keeps its position and read state per shown message (#317);
  // in the tree/threads views new messages never auto-mark the echo read.
  if (viewMode.value !== 'feed') return
  if (atFeedBottom.value) {
    echo.markRead(selectedEchoName.value)
    await messageListRef.value?.scrollToBottom({ smooth: false })
    updateFeedScroll()
  }
})

const maxAnnouncementsPerAddress = 10

const userAnnouncementCount = computed(() => {
  if (!newcomersEchoName.value || !identity.user?.address) return 0
  const msgs = echo.messages[newcomersEchoName.value] || []
  return msgs.filter(msg => msg.sender_address === identity.user.address).length
})

const remainingAnnouncements = computed(() => Math.max(0, maxAnnouncementsPerAddress - userAnnouncementCount.value))

const selectedEchoDisplayName = computed(() => {
  if (!selectedEchoName.value) return ''
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  return item?.name || ''
})

/** System conferences keep their names: protocol code refers to them by fixed names. */
const isEmergencyEcho = computed(() => {
  const name = selectedEchoDisplayName.value
  if (!name) return false
  try {
    const params = JSON.parse(localStorage.getItem('fm_policy_params') || '{}')
    const emergency = params.special_echogroups?.emergency || 'Emergency'
    return String(emergency).toLowerCase() === name.toLowerCase()
  } catch {
    return name === 'Emergency'
  }
})

const selectedEchoIsSystem = computed(() => {
  const name = selectedEchoDisplayName.value
  if (!name) return false
  try {
    const params = JSON.parse(localStorage.getItem('fm_policy_params') || '{}')
    const special = Object.values(params.special_echogroups || {}).filter(Boolean)
    return special.some(item => String(item).toLowerCase() === name.toLowerCase())
  } catch {
    return false
  }
})

const canRenameSelectedEcho = computed(() => {
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  if (!item || item.no_subscribe) return false
  return !selectedEchoIsSystem.value
})

const rulesData = computed(() => {
  if (!selectedEchoName.value) return null
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  if (!item?.rules) return null
  try {
    return typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules
  } catch {
    return null
  }
})

const selectedEchoHasRestrictedWriters = computed(() => hasRestrictedWriters(rulesData.value))

// Network news is the node-posted network chronicle (#310): users read only.
const networkNewsEchoName = computed(() => identity.networkNewsEchoName || 'Network news')
function isNetworkNews(name) {
  return !!name && name === networkNewsEchoName.value
}
const selectedIsNetworkNews = computed(() => isNetworkNews(selectedEchoName.value))

/** Selected conference as it appears in the echo list. */
const selectedEchoItem = computed(() =>
  echo.echoes.find(e => e.name === selectedEchoName.value) || null
)

/**
 * "Unsubscribe" is only meaningful for a subscribed conference. System
 * broadcast echoes (`no_subscribe`), Network news and local blogs are not
 * subscribable, so they must not offer it (#388).
 */
const selectedEchoCanUnsubscribe = computed(() => {
  const item = selectedEchoItem.value
  if (!item || item.isBlog || item.no_subscribe) return false
  if (selectedIsNetworkNews.value) return false
  return item.subscribed === true || echo.subscribedEchoes.includes(item.name)
})

const selectedEchoCanWrite = computed(() => canWriteToEcho(rulesData.value, identity.user?.address, {
  networkNews: selectedIsNetworkNews.value,
}))

/** Текст правил эхи (для markdown-рендеринга) */
const selectedEchoRulesText = computed(() => {
  if (!rulesData.value || typeof rulesData.value !== 'object') return ''
  return rulesData.value.text || ''
})

/** Параметры правил эхи (JSON без поля text) */
const selectedEchoRulesJson = computed(() => {
  if (!rulesData.value || typeof rulesData.value !== 'object') return ''
  const { text, ...params } = rulesData.value
  if (Object.keys(params).length === 0) return ''
  return JSON.stringify(params, null, 2)
})

/** Правила выбранной эхи (отформатированный JSON) — fallback */
const selectedEchoRules = computed(() => {
  if (!selectedEchoName.value) return ''
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  if (!item?.rules) return ''
  try {
    const rules = typeof item.rules === 'string' ? JSON.parse(item.rules) : item.rules
    return typeof rules === 'object' ? JSON.stringify(rules, null, 2) : String(rules)
  } catch {
    return String(item.rules)
  }
})

/** Сырые правила выбранной эхи (объект или строка) */
const selectedEchoRulesRaw = computed(() => {
  if (!selectedEchoName.value) return null
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  return item?.rules || null
})

/** Является ли текущий пользователь модератором выбранной эхи */
const isModeratorOfSelectedEcho = computed(() => echo.isModeratorOf(selectedEchoName.value))

/** Количество текущих протоколов в эхе (одна карточка = один протокол) */
const activeProtocolCount = computed(() => {
  if (!selectedEchoName.value) return 0
  return protocol.getActiveProtocols(selectedEchoName.value)?.length || 0
})

/** Есть ли активный постер выборов от текущего пользователя (блокирует кнопку) */
const hasActiveElectionPoster = computed(() => {
  if (!selectedEchoName.value || !identity.user?.address) return false
  const msgs = protocol.getActiveByEcho(selectedEchoName.value) || []
  return msgs.some(m => {
    if (m.type !== 'election') return false
    try {
      const d = JSON.parse(m.data)
      return d.from === identity.user.address
    } catch { return false }
  })
})


/** Digest-сообщения: последнее непрочитанное из каждой подписанной эхи */
const digestMessages = computed(() => {
  const result = []
  for (const echoName of echo.subscribedEchoes) {
    const msgs = echo.messages[echoName]
    if (msgs && msgs.length > 0) {
      const lastRead = echo.lastReadTimestamps[echoName] || 0
      const unread = msgs.filter(m => m.timestamp > lastRead)
      if (unread.length > 0) {
        result.push({ echoName, message: unread[unread.length - 1], count: unread.length })
      }
    }
  }
  return result.sort((a, b) => (b.message.timestamp || 0) - (a.message.timestamp || 0)).slice(0, 20)
})

function truncateMessage(msg) {
  if (!msg) return ''
  let text = ''
  if (msg.data) {
    try {
      const parsed = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
      text = parsed.text || parsed.body || parsed.message || msg.data
    } catch {
      text = msg.data
    }
  }
  return String(text).substring(0, 150) + (text.length > 150 ? '...' : '')
}

onMounted(async () => {
  await Promise.all([loadEchoes(), loadLocalBlogs(), ensurePolicyParams()])
  await applyRouteEcho()
})

// On a fresh load the echo list may still be empty when applyRouteEcho() first
// runs (the boot/keys load asynchronously). Re-apply the deep link once the
// echoes arrive so F5 on /echoes/:id restores the selected echo.
watch(() => echo.echoes.length, async (n) => {
  if (n > 0 && !selectedEchoName.value && route.params.id) {
    await applyRouteEcho()
  }
})

watch(() => route.params.id, async (val) => {
  if (!val) {
    // `?echo=<name>` navigation keeps the selection (handled by applyRouteEcho)
    if (typeof route.query.echo !== 'string' || !route.query.echo) {
      selectedEchoName.value = null
    }
    return
  }
  const item = echo.echoes.find(e => String(e.id) === String(val))
  if (item && item.name !== selectedEchoName.value) {
    await selectEcho(item.name)
  }
})

// Dashboard/search links use `?echo=<name>`; the component is reused when the
// route changes from /echoes/:id, so apply the query explicitly (#312).
watch(() => route.query.echo, async (val) => {
  if (typeof val === 'string' && val && !route.params.id) {
    await applyRouteEcho()
  }
})

watch(() => route.params.name, async (val) => {
  if (!val) return
  const blog = localBlogs.value.find(b => b.name === val)
  if (blog && blog.name !== selectedEchoName.value) {
    selectedEchoName.value = blog.name
  }
})

/** Загружает список эх с сервера, определяет модераторские права и подписки */
async function loadEchoes() {
  await echo.refreshEchoes()
  await refreshEchoActivity()
}

// A successful change_rules result may have renamed a conference. Refresh the
// echo list so the new name appears without a full page reload.
const handledChangeRulesResults = new Set()
watch(() => protocol.messages.length, async () => {
  let refresh = false
  for (const msg of protocol.messages) {
    if (msg.type !== 'change_rules' || handledChangeRulesResults.has(msg.message_id)) continue
    let data = msg.data
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { continue }
    }
    if (data?.type === 'result' && data?.result === 'success') {
      handledChangeRulesResults.add(msg.message_id)
      refresh = true
    }
  }
  if (!refresh) return
  await loadEchoes()
  const renamedTo = selectedEchoName.value ? echo.renamedEchoes[selectedEchoName.value] : null
  if (renamedTo) {
    selectedEchoName.value = renamedTo
  } else if (selectedEchoName.value && !echo.echoes.some(item => item.name === selectedEchoName.value)) {
    selectedEchoName.value = null
  }
})

// ---------------------------------------------------------------------------
// Feed scrolling and read state (#302)
// ---------------------------------------------------------------------------

const messageListRef = ref(null)
const feedScrollEl = ref(null)
const feedScroll = ref({ top: 0, height: 0, scrollHeight: 0 })

// Content height changes (view switch, new messages, landing) must refresh the
// scroll state: the jump pill depends on it (#302).
let feedResizeObserver = null
function observeFeedLayout() {
  if (typeof ResizeObserver === 'undefined' || !feedResizeObserver) return
  if (feedScrollEl.value) feedResizeObserver.observe(feedScrollEl.value)
  const listEl = messageListRef.value?.$el
  if (listEl) feedResizeObserver.observe(listEl)
}

function updateFeedScroll() {
  const el = feedScrollEl.value
  if (!el) return
  feedScroll.value = { top: el.scrollTop, height: el.clientHeight, scrollHeight: el.scrollHeight }
}

/** Whether the feed is scrolled to the newest messages (bottom). */
const atFeedBottom = computed(() => {
  const { top, height, scrollHeight } = feedScroll.value
  return scrollHeight - (top + height) < 48
})

/** Unread count of the selected echo (for the pill). */
const selectedUnreadCount = computed(() => {
  if (!selectedEchoName.value) return 0
  return echo.unreadCount(selectedEchoName.value)
})

/** Show the floating jump button when the newest messages are off-screen. */
const showJumpPill = computed(() => {
  if (!selectedEchoName.value || selectedBlog.value || viewMode.value === 'reader') return false
  const { height, scrollHeight } = feedScroll.value
  return scrollHeight > height + 48 && !atFeedBottom.value
})

// Last observed scrollTop: reading is marked only when the user scrolls DOWN
// to the newest messages. A scroll up (e.g. to the "new messages" line after
// "mark unread") must not clear the unread block again.
let feedScrollTop = 0
// Programmatic scrolls (landing on the divider, mark-unread) and the browser's
// scroll anchoring also emit scroll events — ignore them for the read mark.
let suppressMarkReadUntil = 0
function suppressMarkRead(ms = 800) {
  suppressMarkReadUntil = Date.now() + ms
}

async function onFeedScroll() {
  const el = feedScrollEl.value
  if (!el) return
  const top = el.scrollTop
  const scrollingDown = top > feedScrollTop
  feedScrollTop = top
  updateFeedScroll()
  // The reader marks each shown message read itself (#317), and in the
  // tree/threads views the newest rows may be hidden in collapsed branches —
  // reaching the container bottom only marks the echo read in the feed (#302).
  if (viewMode.value !== 'feed') return
  if (Date.now() < suppressMarkReadUntil) return
  // Reaching the newest messages marks the echo read (#302).
  if (scrollingDown && atFeedBottom.value && selectedEchoName.value && echo.unreadCount(selectedEchoName.value) > 0) {
    echo.markRead(selectedEchoName.value)
  }
}

/** Jump to the first unread message, or to the newest when all read. */
async function jumpToUnread() {
  suppressMarkRead(800)
  const list = messageListRef.value
  if (!list) return
  if (list.firstUnreadId) {
    await list.scrollToUnread({ smooth: true })
  } else {
    await list.scrollToBottom({ smooth: true })
  }
}

/**
 * Leaving an echo marks it read (the user has seen its unread block). In the
 * reader the watermark already follows the shown message (#317), so leaving
 * must not swallow the rest of the unread block.
 */
watch(selectedEchoName, (newName, oldName) => {
  if (oldName && oldName !== newName && viewMode.value !== 'reader') {
    echo.markRead(oldName)
  }
  nextTick(observeFeedLayout)
})

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  feedResizeObserver = new ResizeObserver(() => updateFeedScroll())
  observeFeedLayout()
})

// The echo is marked read when the user reaches the newest messages or
// switches to another echo — not on unmount, so a page reload keeps the
// unread block (#302).
onBeforeUnmount(() => {
  feedResizeObserver?.disconnect()
})

/**
 * Выбирает эху для просмотра. Прочитанной эха становится не сразу, а когда
 * пользователь долистал до новых или ушёл из эхи (#302).
 */
async function selectEcho(echoName) {
  selectedEchoName.value = echoName
  showRules.value = false
  // Local blogs are stored locally — don't fetch from server
  if (selectedBlog.value) {
    mobileSidebarOpen.value = false
    syncEchoRoute(echoName)
    return
  }
  syncEchoRoute(echoName)
  await echo.loadEcho(echoName)
  await landOnUnread()
}

/**
 * Позиционирует ленту при открытии эхи (#302): к первому непрочитанному
 * (с линией «Новые сообщения»), а если непрочитанных нет — к самым новым.
 */
async function landOnUnread() {
  suppressMarkRead(800)
  // The reader opens on its own first unread message (#317).
  if (viewMode.value === 'reader') return
  await nextTick()
  const list = messageListRef.value
  if (!list) return
  await list.scrollToLastRead()
  updateFeedScroll()
}

/** Синхронизирует URL с выбранной эхой/блогом: /echoes/:id, /echoes/blog/:name */
function syncEchoRoute(echoName) {
  const item = echo.echoes.find(e => e.name === echoName)
  const id = item?.id
  if (id != null) {
    // В читалке URL (с сообщением) ведёт сам reader через reader-navigate (#322).
    if (viewMode.value !== 'reader') {
      router.replace({ name: 'EchoDetail', params: { id: String(id) } })
    }
  } else if (selectedBlog.value) {
    // Blogs have no numeric id — route by name so a reload restores the blog.
    router.replace({ name: 'EchoBlog', params: { name: echoName } })
  }
}

/** Применить выбор из маршрута (числовой id эхи или имя блога) */
async function applyRouteEcho() {
  if (route.name === 'EchoBlog' && route.params.name) {
    const blog = localBlogs.value.find(b => b.name === route.params.name)
    if (blog) {
      selectedEchoName.value = blog.name
    }
    return
  }
  // Deep link в читалку (#322): URL выбирает и режим, и сообщение.
  if (route.name === 'EchoReader') viewMode.value = 'reader'
  // `?echo=<name>` links (dashboard, search): select the echo by name (#312)
  if (!route.params.id) {
    const target = resolveQueryEcho(route.query.echo, echo.echoes, localBlogs.value)
    if (target?.kind === 'echo') {
      await selectEcho(target.name)
      return
    }
    if (target?.kind === 'blog') {
      selectedEchoName.value = target.name
      return
    }
  }
  const routeId = route.params.id
  if (!routeId) return
  const item = echo.echoes.find(e => String(e.id) === String(routeId))
  if (item) {
    await selectEcho(item.name)
  } else {
    // Maybe a blog by name (legacy /echoes/:name deep link)
    const blog = localBlogs.value.find(b => b.name === routeId)
    if (blog) {
      selectedEchoName.value = blog.name
    }
  }
}

/** Подписывается на эху через API */
async function subscribe(echoName) {
  const echoItem = echo.echoes.find(e => e.name === echoName)
  if (!echoItem) return
  try {
    await apiService.subscribeEcho({ echo_name: echoName })
    echo.subscribe(echoName)
    identity.addSubscription(echoName)
    echoItem.subscribed = true
    notifications.success(t('echoes.subscribeSuccess', { echo: echoName }), t('echoes.subscribeSuccessTitle'))
  } catch (err) {
    // Если сервер говорит «уже подписан» — синхронизируем локально
    if (err.message.includes('Already subscribed') || err.message.includes('409')) {
      echo.subscribe(echoName)
      identity.addSubscription(echoName)
      echoItem.subscribed = true
      return
    }
    notifications.error(err.message, t('echoes.subscribeError'))
  }
}

/** Отписаться от выбранной эхи; локальная история остаётся (#388). */
async function unsubscribeSelectedEcho() {
  const name = selectedEchoName.value
  showActionsMenu.value = false
  if (!name) return
  if (!confirm(t('echoes.unsubscribeConfirm', { echo: name }))) return
  await unsubscribe(name)
}

/** Удалить локальную копию выбранной эхи; подписка сохраняется (#388). */
async function deleteSelectedEchoLocalCopy() {
  const name = selectedEchoName.value
  showActionsMenu.value = false
  if (!name) return
  if (!confirm(t('echoes.deleteLocalCopyConfirm', { echo: name }))) return
  try {
    await echo.deleteLocalCopy(name)
    notifications.success(
      t('echoes.deleteLocalCopyDone', { echo: name }),
      t('echoes.deleteLocalCopyTitle'),
    )
  } catch (err) {
    notifications.error(err.message, t('echoes.deleteLocalCopyError'))
  }
}

/** The node already has no such subscription — local state is the stale one. */
function isSubscriptionNotFound(err) {
  const message = String(err?.message || '')
  return err?.status === 404 ||
    message.includes('Subscription not found') ||
    message.includes('404')
}

/** Отписывается от эхи через API */
async function unsubscribe(echoName) {
  const echoItem = echo.echoes.find(e => e.name === echoName)
  if (!echoItem) return
  try {
    await apiService.unsubscribeEcho({ echo_name: echoName })
  } catch (err) {
    if (!isSubscriptionNotFound(err)) {
      notifications.error(err.message, t('echoes.unsubscribeError'))
      return
    }
  }

  // Local state first: the sidebar must disappear immediately, even when the
  // follow-up reconciliation with the node is slow (#388).
  echo.unsubscribe(echoName)
  if (selectedEchoName.value === echoName) {
    selectedEchoName.value = null
    // Drop the deep link too, otherwise the route watcher selects it again
    // when refreshEchoes() replaces the list.
    router.replace({ name: 'Echoes' }).catch(() => {})
  }
  notifications.success(
    t('echoes.unsubscribeSuccess', { echo: echoName }),
    t('echoes.unsubscribeSuccessTitle'),
  )

  // A node that still reports the stale subscription must not silently put
  // the echo back into the sidebar.
  loadEchoes().catch(err => console.warn('[echo] refresh after unsubscribe failed', err))
}

/** Обновляет сообщения для выбранной эхи */
async function refreshMessages() {
  if (!selectedEchoName.value) return
  try {
    const { fetchEchoMessages, getWritersViolations, resetWritersViolations } = await import('../services/message')
    const newMessages = await fetchEchoMessages(selectedEchoName.value)
    if (newMessages && newMessages.length > 0) {
      echo.addMessages(selectedEchoName.value, newMessages.filter(m => !m._internal))
    }
    const violations = getWritersViolations()
    if (violations > 0) {
      notifications.warn(t('echoes.writersViolation'))
      resetWritersViolations()
    }
  } catch (err) {
    console.warn('Failed to refresh messages:', err)
  }
}

function handleModerate(message) {
  console.log('Moderate message:', message)
}

/** Открыть сообщение эхи целиком: /echoes/:id/:messageId */
function openEchoMessage(message) {
  const item = echo.echoes.find(e => e.name === selectedEchoName.value)
  const id = item?.id != null ? String(item.id) : selectedEchoName.value
  router.push({ name: 'EchoMessageDetail', params: { id, messageId: message.message_id } })
}

/** Обработчик mark: отмечает эху непрочитанной (до timestamp сообщения) */
function handleMark(data) {
  if (!data?.read && data?.timestamp) {
    echo.markUnread(selectedEchoName.value, data.timestamp)
    if (viewMode.value === 'reader') {
      // Показываем сообщение, не помечая его прочитанным сразу (#317).
      messageListRef.value?.showUnreadMessage(data.message_id)
      return
    }
    // The divider insertion shifts the content (scroll anchoring): do not treat
    // that as "the user reached the newest" (#302).
    suppressMarkRead(1200)
    // Show the moved "new messages" line right away.
    nextTick(() => messageListRef.value?.scrollToUnread({ smooth: true }))
  }
}

/**
 * Обработчик reply: устанавливает цитату и открывает композер.
 * Вызывается из MessageList при нажатии Reply.
 */
function handleReply(message) {
  replyQuote.value = message
  showComposer.value = true
  showMessageEditor.value = true
}

/** Открыть композер нового сообщения (без цитаты). */
function openNewMessage() {
  replyQuote.value = null
  showMessageEditor.value = true
}

/** Открыть композер в режиме редактирования сообщения (только для автора). */
function handleEdit(message) {
  editMessage.value = message
  replyQuote.value = null
  showMessageEditor.value = true
}

/** Закрыть композер и сбросить цитату. */
function closeMessageEditor() {
  showMessageEditor.value = false
  replyQuote.value = null
  editMessage.value = null
}

/**
 * Загружает черновик для редактирования.
 * Вызывается из MessageList при клике на иконку редактирования черновика.
 */
function handleEditDraft(draft) {
  editingDraftId.value = draft.id
  replyQuote.value = draft.quote || null
  showComposer.value = true
}

function handleForward(message) {
  forwardMessage.value = message
  showForwardDialog.value = true
  // Список подписанных эх для forward мог устареть — обновляем в фоне (#271).
  loadEchoes()
}

function clearReplyQuote() {
  replyQuote.value = null
}

/**
 * Обрабатывает форвард сообщения.
 * Поддерживает: echo (в другую эху), netmail (приватно), folder (не реализовано).
 */
async function handleForwardAction(forwardData) {
  showForwardDialog.value = false
  try {
    switch (forwardData.type) {
      case 'echo': {
        // Исходник едет как аттач-бандл (#325), а не сырым JSON в теле.
        const msgData = buildForwardData(forwardData.message, forwardData.comment)
        const signedMessage = await createSignedMessage('echomail', msgData, { echo_name: forwardData.destination })
        await apiService.sendReceive({ messages: [signedMessage] })
        notifications.success(t('echoes.forwardedToEcho', { echo: forwardData.destination }), t('echoes.forwardedTitle'))
        break
      }
      case 'netmail': {
        const netmailData = {
          type: 'netmail',
          ...buildForwardData(forwardData.message, forwardData.comment),
        }
        try {
          await sendNetmail(forwardData.destination, netmailData)
          notifications.success(t('echoes.netmailSentTo', { addr: forwardData.destination }), t('echoes.netmailSentTitle'))
        } catch (err) {
          // Если ключ не найден — предлагаем запросить
          if (err.message === 'NO_PUBLIC_KEY') {
            const autoRequest = settings.privacy.autoRequestPubkeys
            let requestKey = autoRequest
            if (!autoRequest) {
              requestKey = confirm(t('echoes.noKeyFor', { addr: forwardData.destination }))
            }
            if (requestKey) {
              try {
                await keyService.requestPublicKey(forwardData.destination)
                notifications.info(t('echoes.keyRequestedFrom', { addr: forwardData.destination }), t('echoes.keyRequestedTitle'))
              } catch (reqErr) {
                notifications.error(t('echoes.keyRequestFailed', { err: reqErr.message }), t('echoes.keyRequestFailedTitle'))
              }
            }
          } else {
            notifications.error(t('echoes.netmailSendFailed', { err: err.message }), t('echoes.netmailSendFailedTitle'))
          }
        }
        break
      }
      case 'folder': {
        // Echo → netmail folder: сохраняем сообщение в выбранную папку
        const store = db.netmailStoreName(forwardData.destination)
        await db.putMessage(store, {
          ...forwardData.message,
          message_id: forwardData.message.message_id || `fwd_${Date.now()}`,
          _folderSlug: forwardData.destination,
          forwardedAt: Date.now(),
        })
        notifications.success(t('messageActions.forwardedToFolder'), t('app.forward'))
        break
      }
    }
  } catch (err) {
    console.error('Forward action failed:', err)
    notifications.error(`Forward failed: ${err.message}`, 'Error')
  }
}

/** Отправляет refill запрос через identity store */
async function sendRefillRequest() {
  refillLoading.value = true
  refillError.value = ''
  try {
    // Выбранный день включительно (конец дня) — см. refillBeforeDate.
    const beforeDate = new Date(refillBeforeDate(refillDate.value))
    await identity.sendRefillRequest(selectedEchoName.value, beforeDate)
    showRefillDialog.value = false
    notifications.success(t('echoes.refillSent'), t('echoes.refill'))
  } catch (err) {
    refillError.value = err.message || 'Failed to send refill request'
  } finally {
    refillLoading.value = false
  }
}

/** Отменяет собственный refill-запрос для выбранной эхи */
async function cancelRefill() {
  const rec = myActiveRefill.value
  if (!rec?.messageId) return
  if (!confirm(t('echoes.cancelRefillConfirm'))) return
  try {
    await identity.cancelRefillRequest(selectedEchoName.value, rec.messageId)
    notifications.success(t('echoes.refillCancelled'), t('echoes.refill'))
  } catch (err) {
    notifications.error(err.message || 'Failed to cancel refill request', t('echoes.refill'))
  }
}

/** Предлагает исключение узла (excommunicate poster) */
async function proposeExcommunicate() {
  const target = prompt('Enter node address to propose excommunication:')
  if (!target) return
  const reason = prompt('Reason for excommunication:')
  if (!reason) return
  try {
    // The protocol requires the Admin council echo; the action is available
    // from any echo in the menu, so use the policy name, not the open echo.
    const params = JSON.parse(localStorage.getItem('fm_policy_params') || '{}')
    const council = specialEchoName(params, 'admin', 'Admin council')
    const excommData = {
      echo: council,
      proto: 'excommunicate',
      type: 'poster',
      from: identity.user?.address,
      to: 'all',
      protoAddress: target,
      message: reason,
      variants: ['excommunicate', 'read-only'],
      date: new Date().toISOString()
    }
    const signedMessage = await createSignedMessage('excommunicate', excommData, { echo_name: council })
    await apiService.sendReceive({ messages: [signedMessage] })
    notifications.success('Excommunication proposal submitted', 'Excommunicate')
  } catch (err) {
    notifications.error(err.message || 'Failed to submit excommunication', 'Excommunicate Error')
  }
}
</script>

<style scoped>
/* The feed is the only scroll container: the view fills the viewport below the
   top navigation, so the page itself does not scroll (#302). */
.echoes-layout {
  height: calc(100vh - var(--nav-height, 3.5rem) - 1rem);
}
@supports (height: 100dvh) {
  .echoes-layout {
    height: calc(100dvh - var(--nav-height, 3.5rem) - 1rem);
  }
}

@media (max-width: 768px) {
  .echoes-layout {
    flex-direction: column !important;
  }
  .echoes-sidebar {
    width: 100% !important;
    min-width: unset !important;
    max-height: 200px;
    overflow-y: auto;
  }
  .echoes-header-actions {
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .echoes-header-actions button,
  .echoes-header-actions span {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
  }
}
@media (max-width: 480px) {
  .echoes-sidebar {
    max-height: 150px;
  }
  .echoes-header-actions button,
  .echoes-header-actions span {
    font-size: 0.65rem;
    padding: 0.15rem 0.3rem;
  }
}
/* Mobile modals */
@media (max-width: 640px) {
  .echoes-modal > div {
    margin: 0 0.5rem !important;
    padding: 1rem !important;
    max-height: 85vh !important;
  }
  .echoes-modal pre {
    font-size: 0.65rem !important;
  }
}
</style>
