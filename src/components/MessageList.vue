<template>
  <div class="message-list" ref="rootEl">
    <div v-if="echoStore.loading && !allMessages.length" class="text-center py-8">
      {{ t('echoes.loadingDb') }}
    </div>
    
    <div v-else-if="loading && !allMessages.length" class="text-center py-8">
      {{ t('echoes.loading') }}
    </div>
    
    <div v-else-if="!allMessages.length && !echoDrafts.length" class="text-center py-8 text-gray-500 dark:text-gray-400">
      No messages yet.
    </div>
    
    <!-- Drafts for this echo -->
    <div v-if="echoDrafts.length > 0" class="mb-4 space-y-2">
      <div v-for="draft in echoDrafts" :key="draft.id"
        class="border-2 border-dashed border-yellow-400 dark:border-yellow-600 rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/20"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase">Черновик</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatDraftDate(draft.updatedAt) }}</span>
          </div>
          <div class="flex gap-1">
            <button @click="editDraft(draft)" class="px-2 py-0.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600">✏️</button>
            <button @click="deleteDraft(draft.id)" class="px-2 py-0.5 text-xs bg-gray-400 text-white rounded hover:bg-gray-500">✕</button>
          </div>
        </div>
        <div v-if="draft.subject" class="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">{{ draft.subject }}</div>
        <div class="mt-1 text-xs text-gray-600 dark:text-gray-400 truncate">{{ draft.body }}</div>
      </div>
    </div>
    
    <div v-if="allMessages.length > 0 || echoDrafts.length > 0">
      <!-- THREAD view (#285): only the selected conversation, the branch of
           the selected message expanded, other branches collapsed -->
      <template v-if="focusedThread">
        <div class="flex items-center gap-2 mb-2">
          <button @click="closeThread"
            class="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600">
            ← {{ t('echoes.backToFeed') }}
          </button>
          <span class="text-sm font-medium truncate dark:text-gray-200">🧵 {{ focusedThread.subject || t('echoes.noSubject') }}</span>
        </div>
        <div v-for="item in visibleThreadItems" :key="item.msg.message_id" class="feed-card mb-1"
          :style="{ marginLeft: (item.depth * 16) + 'px' }">
          <div class="border rounded-lg px-3 py-2"
            :class="[
              item.msg.message_id === focusedThread.messageId ? 'ring-2 ring-blue-400 dark:ring-blue-500 thread-focused' : '',
              !getProtocolType(item.msg) ? authorBorderClass(item.msg.sender_address) : ''
            ]">
            <div class="flex items-center gap-1 text-sm">
              <button v-if="threadChildrenCount.get(item.msg.message_id)"
                @click="toggleThreadNode(item.msg)"
                class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 w-4 text-center flex-shrink-0">
                {{ expandedThreadIds.has(item.msg.message_id) ? '▼' : '▶' }}
              </button>
              <span v-else class="w-4 flex-shrink-0"></span>
              <span class="font-medium flex items-center gap-1 min-w-0">
                <SenderLabel :address="item.msg.sender_address" :name-from-message="senderNameFromData(item.msg)" />
                <span v-if="item.msg._verified === true" class="text-xs text-green-600" title="Signature verified">✓</span>
                <span v-else-if="item.msg._verified === false" class="text-xs text-red-500" title="Invalid signature">✗</span>
              </span>
              <span v-if="!expandedThreadIds.has(item.msg.message_id)" class="text-xs text-gray-400 truncate">: {{ truncateMessage(item.msg) }}</span>
              <span class="text-xs text-gray-400 ml-auto flex-shrink-0">{{ formatTimestamp(item.msg.timestamp) }}</span>
            </div>
            <template v-if="expandedThreadIds.has(item.msg.message_id)">
              <div class="text-gray-700 dark:text-gray-300 text-sm mt-1">
                <CollapsibleContent :tagline="parsedData(item.msg).tagline || ''" :tearline="parsedData(item.msg).tearline || ''" :content="parsedData(item.msg).body || parsedData(item.msg).message || ''" :attachments="parsedData(item.msg).attachments" :attachment-resolver="attachmentsOf" :message-id="item.msg.message_id" @select-attachment="handleSelectAttachment(item.msg, $event)" />
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
                <button v-if="item.msg._edited" @click.stop="showVersions(item.msg)"
                  class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
                  :title="t('messageActions.editedAt', { date: formatEditedAt(item.msg) })">✏️ {{ t('messageActions.editedAt', { date: formatEditedAt(item.msg) }) }}</button>
                <button v-if="showKeyRequest(item.msg.sender_address)" @click.stop="requestKey(item.msg.sender_address)"
                  class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 text-xs px-1 py-0.5 border border-yellow-400 rounded"
                  title="Request public key">🔑</button>
                <button v-if="hasMissingParent(item.msg)" @click.stop="loadParentMessage(item.msg)"
                  class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-xs px-1 py-0.5 border border-purple-400 rounded">
                  ⬆ {{ t('echoes.loadParent') }}
                </button>
              </div>
              <div v-if="!isSubscribeNotification(item.msg)" class="mt-1">
                <MessageActions
                  :message="item.msg"
                  :is-moderator="isModeratorHere"
                  :is-admin="identity.isAdmin"
                  :is-owner="isMessageOwner(item.msg)"
                  :echo-name="echoName"
                  :can-react="canReact"
                  :can-open-thread="isThreadable(item.msg, messageIndex)"
                  @reply="handleReply(item.msg)"
                  @forward="handleForward(item.msg)"
                  @edit="handleEdit(item.msg)"
                  @mark="handleMark"
                  @warn="handleWarn(item.msg)"
                  @punish="handlePunish(item.msg)"
                  @appeal="handleAppeal(item.msg)"
                  @viewRaw="viewRaw(item.msg)"
                  @openThread="openThread(item.msg)"
                />
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- READER view (#317): one message at a time, ribbons + paging on top -->
      <div v-if="!focusedThread && viewMode === 'reader' && readerMessages.length > 0"
        class="sticky top-0 z-10 -mt-1 mb-2 pt-1 pb-1 bg-white dark:bg-gray-800">
        <MessageRibbon
          :messages="readerMessages"
          :current-id="!readerNavInThread ? currentReaderMessage?.message_id || null : null"
          :last-read="lastRead"
          :message-index="messageIndex"
          :thread-key="readerThreadOn ? readerThreadKey : ''"
          @select="selectFromGeneralRibbon"
        />
        <MessageRibbon
          v-if="readerThreadOn && readerThreadMessages.length > 0"
          class="mt-1"
          :messages="readerThreadMessages"
          :current-id="readerNavInThread ? currentReaderMessage?.message_id || null : null"
          :last-read="lastRead"
          :message-index="messageIndex"
          @select="selectFromThreadRibbon"
        />
        <div class="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
          <button type="button" class="reader-nav" :disabled="readerIndex <= 0" :title="t('echoes.readerFirst')" @click="goFirst">⏮</button>
          <button type="button" class="reader-nav" :disabled="readerIndex <= 0" :title="t('echoes.readerPrev')" @click="goPrev">←</button>
          <span class="whitespace-nowrap">{{ t('echoes.readerPosition', { current: readerIndex + 1, total: readerNavList.length }) }}</span>
          <button type="button" class="reader-nav" :disabled="readerIndex >= readerNavList.length - 1" :title="t('echoes.readerNext')" @click="goNext">→</button>
          <button type="button" class="reader-nav" :disabled="readerIndex >= readerNavList.length - 1" :title="t('echoes.readerLast')" @click="goLast">⏭</button>
          <button type="button"
            class="reader-nav shrink-0"
            :class="readerThreadOn ? 'bg-blue-100 border-blue-300 dark:bg-blue-900/50 dark:border-blue-700' : ''"
            :title="readerThreadOn ? t('echoes.readerHideThread') : t('echoes.readerShowThread')"
            @click="toggleReaderThread">🧵 {{ readerThreadOn ? t('echoes.readerHideThread') : t('echoes.readerShowThread') }}</button>
        </div>
      </div>

      <!-- FEED / READER view -->
      <template v-if="!focusedThread && (viewMode === 'feed' || viewMode === 'reader')">
      <div v-if="hasOlderMessages" class="mb-2 flex justify-center">
        <button type="button" class="px-3 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="loadOlderMessages">
          {{ t('echoes.loadOlder', { count: PAGE_SIZE }) }}
        </button>
      </div>
      <div>
      <template v-for="(message, feedIndex) in renderedFeedItems" :key="message.message_id">
        <button v-if="viewMode === 'feed' && message._feed.startsConversation && message._feed.hasThread"
          @click="openThread(message)"
          class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 w-full text-left hover:text-gray-700 dark:hover:text-gray-200"
          :class="feedIndex > 0 ? 'mt-4 mb-1.5' : 'mb-1.5'"
          :title="t('echoes.openThread')">
          <span class="font-medium truncate">🧵 {{ message._feed.conversationSubject || t('echoes.noSubject') }}</span>
          <span class="flex-1 border-t border-gray-200 dark:border-gray-700"></span>
        </button>
      <div v-if="viewMode === 'feed' && message.message_id === firstUnreadId" class="unread-divider" data-unread-divider>
        <span>{{ t('echoes.newMessages') }}</span>
        <span v-if="firstUnreadCount > 1">· {{ t('echoes.newMessagesCount', { count: firstUnreadCount }) }}</span>
      </div>
      <div
        class="feed-card"
        :class="[
          getFeedMessageClass(message),
          !getProtocolType(message) ? message._feed.authorClass : '',
          message._feed.startsConversation ? '' : 'mt-0.5',
          isUnreadMsg(message) ? 'feed-card-unread' : ''
        ]"
        :data-message-id="message.message_id"
        :style="message._feed.depth ? { marginLeft: (message._feed.depth * 12) + 'px' } : null"
      >
        <div v-if="message._feed.showAuthor" class="flex justify-between items-start mb-1">
          <div class="font-medium flex items-center gap-2">
            <span :class="getProtocolIcon(message)" :title="getProtocolTitle(message)"></span>
            <span v-if="isUnreadMsg(message)" class="unread-dot" :title="t('echoes.unread')"></span>
            <SenderLabel :address="message.sender_address" :name-from-message="senderNameFromData(message)" />
            <span v-if="message._verified === true" class="text-xs text-green-600" title="Signature verified">✓</span>
            <span v-else-if="message._verified === false" class="text-xs text-red-500" title="Invalid signature">✗</span>
            <span v-else-if="message._verified === null && message.jws" class="text-xs text-gray-400" title="Unknown key, cannot verify">?</span>
            <span v-if="isSelectedMessage(message.message_id)" class="text-xs" :title="t('selected.title')">📌</span>
          </div>
        </div>
          <div v-if="message.data" class="mb-2">
           <template v-if="isSubscribeNotification(message)">
             <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
               <span>🔔</span>
               <span>{{ t('echoes.subscribeNotification') }} <SenderLabel :address="parsedData(message).user" /> → <strong>{{ parsedData(message).echo || echoName }}</strong></span>
                <button @click="echoStore.dismissMessage(message.message_id)" class="ml-2 text-xs text-blue-500 hover:text-blue-700">✕</button>
             </div>
           </template>
           <template v-else-if="isErrorMessage(message)">
             <div class="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
               <div class="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                 <span>⚠</span>
                 <span>{{ t('echoes.error') }}</span>
               </div>
               <div class="mt-1 text-sm text-red-600 dark:text-red-400">{{ parsedData(message).error }}</div>
               <div v-if="parsedData(message).original_message" class="mt-2 p-2 bg-red-100 dark:bg-red-900/50 rounded text-xs text-red-700 dark:text-red-300">
                 <div class="font-medium mb-1">{{ t('echoes.originalMessage') }}</div>
                 <SourceJson :value="parsedData(message).original_message" />
               </div>
               <button v-if="parsedData(message).suggest_refill" @click="requestRefillForError(message)"
                 class="mt-2 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                 📥 {{ t('echoes.requestRefill') }}
               </button>
             </div>
           </template>
           <template v-else-if="isModerationMessage(message)">
             <ModerationMessage :data="parsedData(message)" />
           </template>
           <template v-else-if="getProtocolType(message) === 'vote' && isVoteCard(message)">
              <VoteProtocolCard
                :msg="message"
                :poster="votePosterFor(message)"
                :all-messages="protocolMessages"
                :show-echo="false"
                :readonly="!isVotePoster(message)"
                :pending-variant="pendingVariantFor(message)"
                :my-vote-variant="myVoteVariant(message)"
                :seen-vote-ids="seenVoteIds"
                :show-reactions="canReact"
                @select-variant="variant => selectVoteVariant(props.echoName, message, variant)"
                @vote="castVote(props.echoName, message)"
                @retract="retractVote(props.echoName, message)"
              />
            </template>
             <template v-else-if="getProtocolType(message) === 'election' && parsedData(message).type === 'result'">
               <div class="font-semibold" :class="parsedData(message).result === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                 {{ parsedData(message).result === 'success' ? t('election.resultElected') : t('election.resultFailed') }}
               </div>
               <div v-if="parsedData(message).elected_addresses && parsedData(message).elected_addresses.length" class="text-sm mt-1 text-gray-800 dark:text-gray-200">
                 🏆 <SenderLabel v-for="addr in parsedData(message).elected_addresses" :key="addr" :address="addr" class="mr-1" />
               </div>
               <div v-if="parsedData(message).reason" class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ parsedData(message).reason }}</div>
               <div v-if="parsedData(message).votes && parsedData(message).votes.length" class="mt-2">
                 <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t('election.voteDistribution') }}:</div>
                 <div v-for="v in parsedData(message).votes" :key="v.candidate" class="text-xs text-gray-600 dark:text-gray-400">
                   {{ v.candidate }} — {{ v.votes }} {{ t('election.votes') }}
                 </div>
               </div>
             </template>
             <template v-else-if="getProtocolType(message) === 'election'">
               <div class="font-semibold text-blue-800 dark:text-blue-300">{{ t('echoes.election') }}:</div>
               <MarkdownRenderer :content="parsedData(message).message || ''" />
             </template>
            <template v-else-if="getProtocolType(message) === 'refill' && parsedData(message).type === 'request'">
              <!-- Клик по сообщению открывает детальный вид, где можно согласиться на отправку -->
              <div class="cursor-pointer" @click="openMessage(message)">
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-purple-800 dark:text-purple-300 font-semibold">📥 {{ t('echoes.refillRequest') }}</span>
                  <span class="text-xs text-gray-500">{{ parsedData(message).refill?.from }}</span>
                  <button v-if="canRespondToRefill(message)" @click.stop="respondToRefill(message)"
                    class="ml-auto px-2 py-0.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600">
                    {{ t('echoes.respond') }}
                  </button>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ t('echoes.refillBefore') }} {{ new Date(parsedData(message).refill?.before).toLocaleDateString() }}
                </div>
              </div>
            </template>
            <template v-else-if="getProtocolType(message)">
             <div class="font-semibold text-purple-800 dark:text-purple-300">{{ getProtocolType(message) }}: {{ parsedData(message).message }}</div>
           </template>
            <template v-else>
              <div v-if="parsedData(message).rate_limit_override" class="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 text-xs font-medium"
                :title="t('outbox.rateLimitOverrideHint')">
                ⚠ {{ t('outbox.rateLimitOverride') }}
              </div>
              <div v-if="message.type === 'announcement'" class="mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
                📢 {{ t('announcement.badge') }}
              </div>
              <!-- Тема показана в разделителе беседы (#283); при выключенных нитях (#287) — в карточке -->
              <div v-if="!echoStore.showThreads && parsedData(message).subject" class="font-semibold text-gray-800 dark:text-gray-200">
                {{ parsedData(message).subject }}
              </div>
              <div class="text-gray-700 dark:text-gray-300">
                <CollapsibleContent :no-collapse="viewMode === 'reader'" :tagline="parsedData(message).tagline || ''" :tearline="parsedData(message).tearline || ''" :content="parsedData(message).body || parsedData(message).message || ''" :attachments="parsedData(message).attachments" :attachment-resolver="attachmentsOf" :message-id="message.message_id" @select-attachment="handleSelectAttachment(message, $event)" />
              </div>
            </template>
           </div>
           <button @click.stop="openMessage(message)" class="feed-actions text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-1">
             ↗ {{ t('echoes.openFull') }}
           </button>
          <AttachmentsGallery :attachments="parsedData(message).attachments" :content="parsedData(message).body || parsedData(message).message || ''" :message-id="message.message_id" @select-attachment="handleSelectAttachment(message, $event)" />
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex items-center gap-1">
           <template v-if="!message._feed.showAuthor">
             <SenderLabel :address="message.sender_address" :name-from-message="senderNameFromData(message)" compact />
             <span class="text-gray-400">·</span>
           </template>
           <span>{{ formatTimestamp(message.timestamp) }}</span>
           <button v-if="message._edited" @click.stop="showVersions(message)"
             class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs">
             ✏️ {{ t('messageActions.editedAt', { date: formatEditedAt(message) }) }}
           </button>
           <button v-if="showKeyRequest(message.sender_address)" @click.stop="requestKey(message.sender_address)"
             class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 text-xs px-1 py-0.5 border border-yellow-400 rounded"
             title="Request public key">🔑</button>
           <button v-if="hasMissingParent(message)" @click.stop="loadParentMessage(message)"
             class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-xs px-1 py-0.5 border border-purple-400 rounded">
             ⬆ {{ t('echoes.loadParent') }}
           </button>
           <span class="ml-auto"></span>
           <button v-if="isDismissed(message.message_id)" @click="restoreMessage(message)" class="feed-actions hover:text-gray-700 dark:hover:text-gray-200 text-xs px-1 py-0.5 border rounded dark:border-gray-600" :title="t('app.restore')">↩</button>
           <button v-else-if="!isSubscribeNotification(message)" @click="echoStore.dismissMessage(message.message_id)" class="feed-actions hover:text-gray-700 dark:hover:text-gray-200 text-xs px-1 py-0.5 border rounded dark:border-gray-600" :title="t('app.dismiss')">✕</button>
         </div>
        
        <div v-if="!isSubscribeNotification(message)" class="feed-actions">
        <MessageActions
          :message="message"
          :is-moderator="isModeratorHere"
          :is-admin="identity.isAdmin"
          :is-owner="isMessageOwner(message)"
          :echo-name="echoName"
          :can-react="canReact"
          :can-open-thread="message._feed.hasThread"
          @reply="handleReply(message)"
          @forward="handleForward(message)"
          @edit="handleEdit(message)"
          @mark="handleMark"
          @warn="handleWarn(message)"
          @punish="handlePunish(message)"
          @appeal="handleAppeal(message)"
          @viewRaw="viewRaw(message)"
          @openThread="openThread(message)"
        />
        </div>
      </div>
      </template>
      </div>
      </template>

      <!-- TREE view -->
      <div v-if="!focusedThread && viewMode === 'tree'" class="space-y-0">
        <template v-for="item in treeMessages" :key="item.msg.message_id">
        <div v-if="item.msg.message_id === firstUnreadId" class="unread-divider" data-unread-divider>
          <span>{{ t('echoes.newMessages') }}</span>
          <span v-if="firstUnreadCount > 1">· {{ t('echoes.newMessagesCount', { count: firstUnreadCount }) }}</span>
        </div>
        <div
          @click="toggleExpanded(expandedTree, item.msg.message_id)"
          :class="['border-b py-1 px-1 cursor-pointer hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800', moderationStripeClass(parsedData(item.msg)), expandedTree.has(item.msg.message_id) ? '' : 'truncate']"
          :data-message-id="item.msg.message_id"
          :style="{ paddingLeft: (item.depth * 20 + 4) + 'px' }"
        >
          <div class="flex items-center gap-1 text-xs" v-if="!expandedTree.has(item.msg.message_id)">
            <span v-if="item.depth > 0" class="text-gray-400">└</span>
            <span v-if="isUnreadMsg(item.msg)" class="unread-dot" :title="t('echoes.unread')"></span>
            <span :class="getUnreadClass(item.msg)"><SenderLabel compact :address="item.msg.sender_address" :name-from-message="senderNameFromData(item.msg)" /></span>
            <span v-if="moderationSeverity(parsedData(item.msg)) === 'warning'" class="text-yellow-500" title="warning">⚠</span>
            <span v-else-if="moderationSeverity(parsedData(item.msg)) === 'punishment'" class="text-red-500" title="punishment">⛔</span>
            <span class="text-gray-400 truncate">: {{ truncateMessage(item.msg) }}</span>
            <span class="text-gray-400 ml-auto flex-shrink-0">{{ formatTimestamp(item.msg.timestamp) }}</span>
          </div>
          <div v-if="expandedTree.has(item.msg.message_id)" :class="['p-2', moderationBorderClass(parsedData(item.msg))]">
              <div class="flex justify-between items-start mb-1">
              <div class="font-medium flex items-center gap-1 text-sm">
                <span :class="getUnreadClass(item.msg)"><SenderLabel compact :address="item.msg.sender_address" :name-from-message="senderNameFromData(item.msg)" /></span>
                <span v-if="item.msg._verified === true" class="text-xs text-green-600">✓</span>
                <span v-else-if="item.msg._verified === false" class="text-xs text-red-500">✗</span>
              </div>
            </div>
            <div v-if="isModerationMessage(item.msg)">
              <ModerationMessage :data="parsedData(item.msg)" />
            </div>
            <template v-else>
              <div v-if="parsedData(item.msg).subject" class="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                {{ parsedData(item.msg).subject }}
              </div>
              <div class="text-gray-700 dark:text-gray-300 text-sm">
                <CollapsibleContent :tagline="parsedData(item.msg).tagline || ''" :tearline="parsedData(item.msg).tearline || ''" :content="parsedData(item.msg).body || parsedData(item.msg).message || ''" :attachments="parsedData(item.msg).attachments" :attachment-resolver="attachmentsOf" :message-id="item.msg.message_id" @select-attachment="handleSelectAttachment(item.msg, $event)" />
              </div>
            </template>
            <div class="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <SenderLabel :address="item.msg.sender_address" :name-from-message="senderNameFromData(item.msg)" compact />
              <span class="text-gray-400">·</span>
              <span>{{ formatTimestamp(item.msg.timestamp) }}</span>
              <button v-if="item.msg._edited" @click.stop="showVersions(item.msg)"
                class="text-blue-500 hover:text-blue-700 dark:text-blue-400 text-xs"
                :title="t('messageActions.editedAt', { date: formatEditedAt(item.msg) })">✏️</button>
              <button v-if="showKeyRequest(item.msg.sender_address)" @click.stop="requestKey(item.msg.sender_address)"
                class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 text-xs px-0.5" title="Request public key">🔑</button>
            </div>
            <div v-if="!isSubscribeNotification(item.msg)" class="mt-1">
              <MessageActions
                :message="item.msg"
                :is-moderator="isModeratorHere"
                :is-admin="identity.isAdmin"
                :is-owner="isMessageOwner(item.msg)"
                :echo-name="echoName"
                :can-react="canReact"
                :can-open-thread="isThreadable(item.msg, messageIndex)"
                @reply="handleReply(item.msg)"
                      @forward="handleForward(item.msg)"
                @edit="handleEdit(item.msg)"
                @mark="handleMark"
                @warn="handleWarn(item.msg)"
                @punish="handlePunish(item.msg)"
                @appeal="handleAppeal(item.msg)"
                @viewRaw="viewRaw(item.msg)"
                @openThread="openThread(item.msg)"
              />
            </div>
          </div>
        </div>
        </template>
      </div>

      <!-- THREADS view -->
      <div v-if="!focusedThread && viewMode === 'threads'" class="space-y-2">
        <div v-for="thread in threadMessages" :key="thread.subject"
          class="border rounded-lg p-3 dark:border-gray-700"
        >
          <div class="flex items-center gap-2">
            <button @click="toggleExpanded(expandedThreads, thread.subject)" class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 w-4 text-center flex-shrink-0">
              {{ expandedThreads.has(thread.subject) ? '▼' : '▶' }}
            </button>
            <span v-if="thread.unread" class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></span>
            <span class="font-medium text-sm truncate">{{ thread.subject }}</span>
            <span class="text-xs text-gray-400">({{ thread.count }})</span>
            <span class="flex-1"></span>
            <span class="text-xs text-gray-400">{{ formatTimestamp(thread.last.timestamp) }}</span>
          </div>
          <div v-if="expandedThreads.has(thread.subject)" class="mt-2 space-y-2">
            <div v-for="m in thread.messages" :key="m.message_id" :class="['rounded p-3', moderationBorderClass(parsedData(m)) || 'border dark:border-gray-600']" :data-message-id="m.message_id">
              <div class="flex justify-between items-start mb-1">
                <div class="font-medium flex items-center gap-1 text-sm">
                  <span :class="getUnreadClass(m)"><SenderLabel compact :address="m.sender_address" :name-from-message="senderNameFromData(m)" /></span>
                  <span v-if="m._verified === true" class="text-xs text-green-600">✓</span>
                  <span v-else-if="m._verified === false" class="text-xs text-red-500">✗</span>
                </div>
              </div>
              <div v-if="isModerationMessage(m)">
                <ModerationMessage :data="parsedData(m)" />
              </div>
              <template v-else>
                <div v-if="parsedData(m).subject" class="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                  {{ parsedData(m).subject }}
                </div>
                <div class="text-gray-700 dark:text-gray-300 text-sm">
                  <CollapsibleContent :tagline="parsedData(m).tagline || ''" :tearline="parsedData(m).tearline || ''" :content="parsedData(m).body || parsedData(m).message || ''" :attachments="parsedData(m).attachments" :attachment-resolver="attachmentsOf" :message-id="m.message_id" @select-attachment="handleSelectAttachment(m, $event)" />
                </div>
              </template>
              <div class="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <SenderLabel :address="m.sender_address" :name-from-message="senderNameFromData(m)" compact />
                <span class="text-gray-400">·</span>
                <span>{{ formatTimestamp(m.timestamp) }}</span>
                <button v-if="m._edited" @click.stop="showVersions(m)"
                  class="text-blue-500 hover:text-blue-700 dark:text-blue-400 text-xs"
                  :title="t('messageActions.editedAt', { date: formatEditedAt(m) })">✏️</button>
                <button v-if="showKeyRequest(m.sender_address)" @click.stop="requestKey(m.sender_address)"
                  class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 text-xs px-0.5" title="Request public key">🔑</button>
              </div>
              <div v-if="!isSubscribeNotification(m)" class="mt-1">
                <MessageActions
                  :message="m"
                  :is-moderator="isModeratorHere"
                  :is-admin="identity.isAdmin"
                  :is-owner="isMessageOwner(m)"
                  :echo-name="echoName"
                  :can-react="canReact"
                  :can-open-thread="isThreadable(m, messageIndex)"
                  @reply="handleReply(m)"
                  @forward="handleForward(m)"
                  @edit="handleEdit(m)"
                  @mark="handleMark"
                  @warn="handleWarn(m)"
                  @punish="handlePunish(m)"
                  @appeal="handleAppeal(m)"
                  @viewRaw="viewRaw(m)"
                  @openThread="openThread(m)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="dismissedCount > 0 && !echoStore.hideDismissed" class="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded text-center text-sm text-gray-500 dark:text-gray-400">
        {{ t('echoes.dismissedMessages', { count: dismissedCount }) }}
      </div>
    </div>
    
    <MessageVersionsDialog
      :visible="!!versionsMessage"
      :message="versionsMessage"
      @close="versionsMessage = null"
    />

    <ModeratorMenu
      v-if="showModeratorMenu && selectedMessage"
      :message="selectedMessage"
      @close="showModeratorMenu = false"
      @submitted="handleModeratorSubmitted"
    />

    <AppealDialog
      v-if="appealMessage"
      :message="appealMessage"
      :echo-name="echoName"
      @close="appealMessage = null"
    />

    <!-- Raw JSON Modal -->
    <div v-if="showRawModal && rawMessage" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="showRawModal = false">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto raw-modal-content">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold dark:text-white">Raw Message</h3>
          <button @click="showRawModal = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">&times;</button>
        </div>
        <SourceJson :value="rawMessage" class="text-left bg-gray-100 dark:bg-gray-900 p-4 rounded overflow-auto text-xs dark:text-gray-300" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useProtocolStore } from '../stores/protocol'
import { fetchEchoMessages } from '../services/message'
import { keyService } from '../services/keyService'
import { useDrafts } from '../composables/useDrafts'
import ModeratorMenu from './ModeratorMenu.vue'
import AppealDialog from './AppealDialog.vue'
import MessageVersionsDialog from './MessageVersionsDialog.vue'
import MessageActions from './MessageActions.vue'
import { canWriteToEcho } from '../utils/rules'
import MarkdownRenderer from './MarkdownRenderer.vue'
import VoteProtocolCard from './VoteProtocolCard.vue'
import AttachmentsGallery from './AttachmentsGallery.vue'
import CollapsibleContent from './CollapsibleContent.vue'
import SenderLabel from './SenderLabel.vue'
import { sendRefillResponse, countRefillableMessages, refillableMessagesFor } from '../services/refill'
import { hasVoteResult, myVoteVariantFor } from '../composables/useProtocolPhases'
import { useVotePoster } from '../composables/useVotePoster'
import { moderationBorderClass, moderationStripeClass, moderationSeverity } from '../services/moderation'
import { buildMessageTree } from '../utils/tree'
import { buildFeedItems, buildMessageIndex, conversationKey, conversationSubject, isThreadable, groupByConversationSubject, ancestorChain, conversationMessages, visibleThreadItems as visibleThreadNodes, effectiveParentId, authorBorderClass } from '../utils/feed'
import { senderNameFromData, isReactionMessage } from '../utils/messages'
import { protocolTypeOf, PROTOCOL_TYPES } from '../utils/messageKind'
import { useSelectedMessages } from '../composables/useSelectedMessages'
import ModerationMessage from './ModerationMessage.vue'
import SourceJson from './SourceJson.vue'
import MessageRibbon from './MessageRibbon.vue'

const { t } = useI18n()

const props = defineProps({
  echoName: {
    type: String,
    required: true,
  },
  hideProtocols: {
    type: Boolean,
    default: false,
  },
  // Read watermark of the echo (unix seconds): messages newer than this are
  // unread. The feed is chronological, so the unread block is at the bottom
  // and the first unread message is where the feed lands (#302).
  lastRead: {
    type: Number,
    default: 0,
  },
  // Режим отображения эхи (#319): feed (лента), tree (дерево), threads (темы).
  // Состояние живёт в Echoes.vue, чтобы панель переключения не прокручивалась.
  viewMode: {
    type: String,
    default: 'feed',
  },
  // Стартовое сообщение читалки из URL (/echoes/:id/reader/:messageId, #322).
  readerStartId: {
    type: String,
    default: '',
  },
})

const identity = useIdentityStore()
const echoStore = useEchoStore()
const draftsManager = useDrafts()

// Черновики для этой эхи (отображаются вверху списка сообщений)
const echoDrafts = computed(() => draftsManager.getDraftsForEcho(props.echoName))

/** Редактирование черновика — emits событие для родителя */
function editDraft(draft) {
  emit('edit-draft', draft)
}

/** Удаление черновика */
function deleteDraft(id) {
  draftsManager.deleteDraft(id)
}

/** Форматирование даты черновика */
function formatDraftDate(ts) {
  return new Date(ts).toLocaleString()
}

/** Показывать ли кнопку запроса ключа для адреса */
function showKeyRequest(address) {
  if (!address || address === identity.user?.address) return false
  // Check if this is our node's address (derived from user address with last segment = 0)
  const nodeAddress = identity.nodeEd25519PublicKey ? null : null
  if (identity.user?.address) {
    const parts = identity.user.address.split(':')
    const last = parts[parts.length - 1]
    if (last) {
      parts[parts.length - 1] = '0'
      const derived = parts.join(':')
      if (address === derived) return false // our node — always known
    }
  }
  return !keyService.hasPublicKey(address)
}

/** Запросить публичный ключ для адреса */
async function requestKey(address) {
  if (!address) return
  try {
    await keyService.requestPublicKey(address, false)
    const notifications = (await import('../stores/notifications')).useNotificationsStore()
    notifications.info(`Public key requested for ${address}`)
    console.log('[msg] key requested for', address)
  } catch (err) {
    console.warn('[msg] key request failed:', err)
  }
}

const loading = ref(false)
const error = ref(null)
const showModeratorMenu = ref(false)
const appealMessage = ref(null)
const versionsMessage = ref(null)

function showVersions(message) {
  versionsMessage.value = message
}

function formatEditedAt(message) {
  const ts = message?._edited_at
  if (!ts) return ''
  try { return new Date(ts * 1000).toLocaleString() } catch { return '' }
}
const showRawModal = ref(false)
const rawMessage = ref(null)
const selectedMessage = ref(null)

const echoName = computed(() => props.echoName)

// Модератор именно этой эхи (по её правилам), а не где-либо ещё
const isModeratorHere = computed(() => echoStore.isModeratorOf(props.echoName))
const canReact = computed(() => {
  const echoItem = (echoStore.echoes || []).find(e => e.name === props.echoName)
  return canWriteToEcho(echoItem?.rules, identity.user?.address, {
    networkNews: props.echoName === (identity.networkNewsEchoName || 'Network news'),
  })
})

// Все сообщения из echo store для этой эхи
// Сообщения, принудительно показанные кнопкой подгрузки родителя (#285),
// даже если они скрыты фильтрами (dismissed / скрытые протоколы).
const forcedVisibleIds = ref(new Set())

const allMessages = computed(() => {
  const msgs = echoStore.messages[props.echoName] || []
  if (props.hideProtocols) {
    // Finished votes stay in the feed as result messages (issue #252).
    return msgs.filter(m => !PROTOCOL_TYPES.includes(m.type) || isVoteResult(m) || forcedVisibleIds.value.has(m.message_id))
  }
  return msgs
})

/** Проверяет, скрыто ли сообщение */
function isDismissed(messageId) {
  return (echoStore.dismissedMessages || []).includes(messageId)
}

// Selected messages container (#306)
const selectedStore = useSelectedMessages()
function isSelectedMessage(messageId) {
  return selectedStore.items.value.some(e => (e.kind || 'message') === 'message' && e.message_id === messageId)
}

/** Add an attachment of a message to the selected container (#306). */
function handleSelectAttachment(message, { attachment, messageId, index }) {
  const echoItem = (echoStore.echoes || []).find(e => e.name === echoName.value)
  selectedStore.toggleAttachment(attachment, {
    messageId: messageId || message?.message_id,
    index,
    echoName: echoName.value,
    echoId: echoItem?.id ?? null,
  })
}

/** Восстанавливает скрытое сообщение */
function restoreMessage(msg) {
  const arr = [...(echoStore.dismissedMessages || [])]
  const idx = arr.indexOf(msg.message_id)
  if (idx !== -1) {
    arr.splice(idx, 1)
    localStorage.setItem('fm_dismissed_messages', JSON.stringify(arr))
    const ds = echoStore.dismissedMessages
    ds.length = 0
    ds.push(...arr)
  }
}

/** Количество скрытых сообщений */
const dismissedCount = computed(() => {
  const ds = echoStore.dismissedMessages || []
  return allMessages.value.filter(m => ds.includes(m.message_id)).length
})

/**
 * Отсортированные сообщения для отображения (feed view).
 * Фильтрует реакции, применяет dismissed-фильтр.
 */
/**
 * Chronological sort + the shared filters (reactions, finished vote posters,
 * dismissed) for a given message list (#302).
 */
function sortedOf(list) {
  let msgs = [...list].sort((a, b) => {
    const dt = (a.timestamp || 0) - (b.timestamp || 0)
    if (dt !== 0) return dt
    return String(a.message_id || '').localeCompare(String(b.message_id || ''))
  })
  msgs = msgs.filter(m => !isReactionMessage(m))
  // Finished votes stay in the feed as the result card only (#252).
  msgs = msgs.filter(m => !(getProtocolType(m) === 'vote' && hasVoteResult(m, protocolMessages.value)))
  const ds = new Set(echoStore.dismissedMessages || [])
  if (echoStore.hideDismissed !== false) {
    msgs = msgs.filter(m => !ds.has(m.message_id) || forcedVisibleIds.value.has(m.message_id))
  }
  return msgs
}

/**
 * Отсортированные сообщения ленты (с фильтром «Протоколы» панели #322).
 * Chronological order (#302): oldest at the top, newest at the bottom, so
 * new messages append without moving the viewport and the unread block is
 * read downward.
 */
const PAGE_SIZE = 20
const visibleLimit = ref(PAGE_SIZE)

const sortedMessages = computed(() => sortedOf(allMessages.value))
const visibleSortedMessages = computed(() => sortedMessages.value.slice(-visibleLimit.value))
const hasOlderMessages = computed(() => sortedMessages.value.length > visibleLimit.value)

watch(() => props.echoName, () => {
  visibleLimit.value = PAGE_SIZE
})

// Индекс всех сообщений эхи для поиска родителей и цепочек ответов (#285).
const messageIndex = computed(() => buildMessageIndex(allMessages.value))

/**
 * Лента с группировкой по беседам и авторам (#283): добавляет _feed
 * (ключ беседы, глубину ответа, начало беседы/смену автора, цвет полосы).
 */
const feedItems = computed(() => buildFeedItems(visibleSortedMessages.value, messageIndex.value, { groupThreads: echoStore.showThreads }))

// ---------------------------------------------------------------------------
// Reader mode (#317): one message at a time with forward/back paging.
// ---------------------------------------------------------------------------

/**
 * Navigable messages of the reader: the same chronological list as the feed,
 * but always with protocol messages (the ribbon marks every type, #322).
 */
const readerMessages = computed(() => visibleSortedMessages.value)
/** Index of the message currently shown in the reader (in the active list). */
const readerIndex = ref(0)
/**
 * «Показать нить» (#322): the second ribbon lists the conversation of the
 * current message; the cursor (navigation) can live on either ribbon.
 */
const readerThreadOn = ref(false)
const readerNavInThread = ref(false)
/** Conversation key of the current message (the general ribbon highlights it). */
const readerThreadKey = computed(() => {
  const msg = currentReaderMessage.value
  return msg ? conversationKey(msg, messageIndex.value) : ''
})
/** Messages of the current message's conversation, in list order. */
const readerThreadMessages = computed(() => {
  if (!readerThreadOn.value || !readerThreadKey.value) return []
  return conversationMessages(readerThreadKey.value, readerMessages.value, messageIndex.value)
})
/** The list the cursor (paging) currently walks. */
const readerNavList = computed(() =>
  readerNavInThread.value ? readerThreadMessages.value : readerMessages.value
)
const currentReaderMessage = computed(() => readerNavList.value[readerIndex.value] || null)

/**
 * The current reader message as a feed item (flat: no thread grouping, no
 * depth), so the reader reuses the exact feed card markup.
 */
const readerItem = computed(() => {
  const msg = currentReaderMessage.value
  if (!msg) return null
  return buildFeedItems([msg], messageIndex.value, { groupThreads: false })[0] || null
})

/** What the feed/reader branch iterates: the feed or the single reader card. */
const renderedFeedItems = computed(() =>
  props.viewMode === 'reader' ? (readerItem.value ? [readerItem.value] : []) : feedItems.value
)

/**
 * Where the reader opens (#317): the first unread message, the oldest one in a
 * never-read echo (everything is unread there), or the newest when all read.
 */
function readerStartIndex() {
  const list = readerMessages.value
  if (list.length === 0) return 0
  if (firstUnreadId.value) {
    const idx = list.findIndex(m => m.message_id === firstUnreadId.value)
    if (idx >= 0) return idx
  }
  if (!props.lastRead) return 0
  return list.length - 1
}

/** Mark the message shown in the reader as read (#317). */
function markReaderRead() {
  const msg = currentReaderMessage.value
  if (msg && props.viewMode === 'reader') echoStore.markReadUpTo(props.echoName, msg.timestamp)
}

/** Move the cursor to one of the ribbons, keeping the shown message. */
function setReaderNav(inThread, messageId) {
  readerNavInThread.value = inThread
  const list = readerNavList.value
  if (list.length === 0) return
  const idx = messageId ? list.findIndex(m => m.message_id === messageId) : -1
  readerIndex.value = idx >= 0 ? idx : Math.max(0, Math.min(readerIndex.value, list.length - 1))
  markReaderRead()
}

/** «Показать нить»: the second ribbon appears and the cursor moves to it. */
function toggleReaderThread() {
  if (readerThreadOn.value) {
    readerThreadOn.value = false
    setReaderNav(false, currentReaderMessage.value?.message_id || '')
  } else {
    readerThreadOn.value = true
    setReaderNav(true, currentReaderMessage.value?.message_id || '')
  }
}

/** Показать сообщение читалки по индексу */
function goToReaderIndex(index) {
  const list = readerNavList.value
  if (list.length === 0) return
  readerIndex.value = Math.max(0, Math.min(index, list.length - 1))
  markReaderRead()
}

function goFirst() { goToReaderIndex(0) }
function goLast() { goToReaderIndex(readerNavList.value.length - 1) }
function goPrev() { goToReaderIndex(readerIndex.value - 1) }
function goNext() { goToReaderIndex(readerIndex.value + 1) }

/** Показать конкретное сообщение (клик по общей ленте пиктограмм, #322). */
function selectFromGeneralRibbon(messageId) {
  setReaderNav(false, messageId)
}

/** Клик по ленте нити: курсор переходит на вторую ленту (#322). */
function selectFromThreadRibbon(messageId) {
  setReaderNav(true, messageId)
}

/** Показать конкретное сообщение из общей ленты (внешние вызовы) */
function goToMessageById(messageId) {
  setReaderNav(false, messageId)
}

/**
 * Показать сообщение, которое только что отметили непрочитанным: не помечаем
 * его прочитанным сразу, иначе отметка тут же исчезнет (#317).
 */
function showUnreadMessage(messageId) {
  const idx = readerMessages.value.findIndex(m => m.message_id === messageId)
  if (idx >= 0) {
    readerNavInThread.value = false
    readerIndex.value = idx
  }
}

/**
 * The reader is "ready" once it was positioned on a non-empty list. Before
 * that (boot, list not loaded) the transient index-0 message must not leak
 * into the URL (#322).
 */
let readerReady = false

/** Load one older page. Keep the reader cursor on the same message. */
function loadOlderMessages() {
  const currentId = currentReaderMessage.value?.message_id || ''
  visibleLimit.value += PAGE_SIZE
  nextTick(() => {
    if (props.viewMode === 'reader' && currentId) {
      const idx = readerMessages.value.findIndex(m => m.message_id === currentId)
      if (idx >= 0) readerIndex.value = idx
    }
  })
}

/** Открыть читалку на первом непрочитанном (или на самом новом) */
function startReader() {
  readerNavInThread.value = false
  if (props.readerStartId) {
    const idx = readerMessages.value.findIndex(m => m.message_id === props.readerStartId)
    if (idx >= 0) {
      readerIndex.value = idx
      readerReady = true
      markReaderRead()
      scrollReaderTop()
      return
    }
  }
  readerIndex.value = readerStartIndex()
  readerReady = readerMessages.value.length > 0
  markReaderRead()
  scrollReaderTop()
}

/** The container may keep the previous mode's scroll offset (#302): the
 * reader always opens at the beginning of the shown message. */
function scrollReaderTop() {
  nextTick(() => {
    const scroller = feedScroller()
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' })
  })
}

/** Клавиши читалки: ←/→ листают, Home/End — первое/последнее сообщение */
function onReaderKeydown(event) {
  if (props.viewMode !== 'reader') return
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
  if (event.key === 'ArrowLeft') { event.preventDefault(); goPrev() }
  else if (event.key === 'ArrowRight') { event.preventDefault(); goNext() }
  else if (event.key === 'Home') { event.preventDefault(); goFirst() }
  else if (event.key === 'End') { event.preventDefault(); goLast() }
}

// Только текстовые echomail (без реакций, подписок, протокольных сообщений)
const textMessages = computed(() =>
  sortedMessages.value.filter(m => {
    if (isReactionMessage(m) || isSubscribeNotification(m)) return false
    if (m.type !== 'echomail') return false
    try { return !JSON.parse(m.data).proto } catch { return true }
  })
)

/**
 * Unread messages of the displayed feed, oldest first (#302). The divider goes
 * before the first entry and the feed lands on it when the echo is opened.
 */
const unreadMessages = computed(() => {
  if (!props.lastRead) return []
  return sortedMessages.value.filter(m => (m.timestamp || 0) > props.lastRead)
})
const firstUnreadId = computed(() => unreadMessages.value[0]?.message_id || '')
const firstUnreadCount = computed(() => unreadMessages.value.length)

/**
 * The newest read message of the displayed list — where the reader left off
 * (#302). It is the message right before the first unread; when everything is
 * read it is the newest message; null when nothing is read yet.
 */
const lastReadMessage = computed(() => {
  const list = sortedMessages.value
  if (list.length === 0) return null
  const idx = list.findIndex(m => m.message_id === firstUnreadId.value)
  if (idx === 0) return null
  if (idx > 0) return list[idx - 1]
  return list[list.length - 1]
})

/** Whether a displayed message is unread (bold sender + dot, #302). */
function isUnreadMsg(message) {
  return !!props.lastRead && (message?.timestamp || 0) > props.lastRead
}

// ---------------------------------------------------------------------------
// Feed scrolling (#302): landing on the first unread, jumping to the newest.
// ---------------------------------------------------------------------------

/** Scrollable ancestor of the feed (owned by the view). */
function feedScroller() {
  let el = rootEl.value?.parentElement || null
  while (el) {
    const style = window.getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY)) return el
    el = el.parentElement
  }
  return null
}

function scrollElementIntoView(el, { block = 'start', smooth = false } = {}) {
  if (!el) return false
  try {
    el.scrollIntoView({ block, behavior: smooth ? 'smooth' : 'auto' })
    return true
  } catch {
    return false
  }
}

function elementOfMessage(messageId) {
  if (!messageId || !rootEl.value) return null
  const nodes = rootEl.value.querySelectorAll('[data-message-id]')
  for (const node of nodes) {
    if (node.getAttribute('data-message-id') === messageId) return node
  }
  return null
}

/**
 * Scroll to the "new messages" divider (or the first unread card when the
 * divider is not rendered). Expands collapsed tree nodes / thread groups that
 * hide the target first.
 * @returns {Promise<boolean>} whether a target was found and scrolled to
 */
async function scrollToUnread({ smooth = false } = {}) {
  const id = firstUnreadId.value
  if (!id) return false
  // Tree view: expand the ancestors of the first unread node.
  if (props.viewMode === 'tree') {
    const msg = (echoStore.messages[props.echoName] || []).find(m => m.message_id === id)
    if (msg) {
      const chain = ancestorChain(msg, messageIndex.value)
      if (chain.length) expandedTree.value = new Set([...expandedTree.value, ...chain])
    }
  }
  // Threads view: expand the group containing the first unread.
  if (props.viewMode === 'threads') {
    const group = threadMessages.value.find(t => t.messages.some(m => m.message_id === id))
    if (group) expandedThreads.value = new Set([...expandedThreads.value, group.subject])
  }
  await nextTick()
  const divider = rootEl.value?.querySelector('[data-unread-divider]')
  if (divider) return scrollElementIntoView(divider, { block: 'start', smooth })
  return scrollElementIntoView(elementOfMessage(id), { block: 'start', smooth })
}

/** Scroll to the newest message (bottom of the chronological feed). */
async function scrollToBottom({ smooth = true } = {}) {
  await nextTick()
  const nodes = rootEl.value?.querySelectorAll('[data-message-id]')
  const last = nodes && nodes.length ? nodes[nodes.length - 1] : null
  if (last) return scrollElementIntoView(last, { block: 'end', smooth })
  const scroller = feedScroller()
  if (scroller) {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    return true
  }
  return false
}

/**
 * Land on the last read message (#302): it stays at the top of the list with
 * the unread block right below. Falls back to the "new messages" line when
 * nothing is read yet and to the newest message when everything is read.
 * In the tree/threads views the branch hiding the message is expanded first.
 */
async function scrollToLastRead({ smooth = false } = {}) {
  await nextTick()
  if (!firstUnreadId.value) return scrollToBottom({ smooth })
  const msg = lastReadMessage.value
  if (!msg) return scrollToUnread({ smooth })
  if (props.viewMode === 'tree') {
    const chain = ancestorChain(msg, messageIndex.value)
    if (chain.length) expandedTree.value = new Set([...expandedTree.value, ...chain])
  }
  if (props.viewMode === 'threads') {
    const group = threadMessages.value.find(t => t.messages.some(m => m.message_id === msg.message_id))
    if (group) expandedThreads.value = new Set([...expandedThreads.value, group.subject])
  }
  await nextTick()
  const el = elementOfMessage(msg.message_id)
  if (el) return scrollElementIntoView(el, { block: 'start', smooth })
  return scrollToUnread({ smooth })
}

defineExpose({ scrollToUnread, scrollToLastRead, scrollToBottom, firstUnreadId, goToMessageById, showUnreadMessage })

/** Проверяет, является ли сообщение уведомлением о подписке */
function isSubscribeNotification(message) {
  if (message.type !== 'control') return false
  try {
    const d = JSON.parse(message.data)
    return d.type === 'subscribe_notification'
  } catch { return false }
}

function isErrorMessage(message) {
  try {
    const d = JSON.parse(message.data)
    return d.type === 'error'
  } catch { return false }
}

async function requestRefillForError(message) {
  const d = parsedData(message)
  const echoName = d.echo || props.echoName
  try {
    const { useIdentityStore } = await import('../stores/identity')
    await useIdentityStore().sendRefillRequest(echoName, new Date())
  } catch (e) {
    console.error('refill request failed', e)
  }
}

/** Парсит data сообщения из JSON в объект */
function parsedData(message) {
  try {
    return JSON.parse(message.data)
  } catch {
    return { subject: '', body: message.data || '' }
  }
}

/**
 * Attachments of another message in this conference, used to resolve
 * message-scoped refs `attachment:<message_id>:N` in quotes (issue #268).
 */
function attachmentsOf(messageId) {
  if (!messageId) return null
  const m = (echoStore.messages[props.echoName] || []).find(x => x.message_id === messageId)
  if (!m) return null
  return parsedData(m).attachments || null
}

/** Является ли сообщение модераторским (warn/punishment) */
function isModerationMessage(message) {
  return moderationSeverity(parsedData(message)) !== null
}

/** Извлекает имя отправителя из данных сообщения */
function getSenderName(message) {
  if (!message) return 'Unknown'
  // Try to get sender_name from message data
  try {
    const data = typeof message.data === 'string' ? JSON.parse(message.data) : message.data
    if (data.sender_name) return data.sender_name
  } catch { /* ignore */ }
  // Also try _senderName (set by the composer) or parsedData
  if (message._senderName) return message._senderName
  // Fall through to identity lookup
  if (identity.user?.address === message.sender_address) {
    return identity.user?.name || message.sender_address
  }
  return message.sender_address
}

/** CSS-класс для непрочитанных сообщений (жирный текст) */
function getUnreadClass(message) {
  return 'font-medium' + ((echoStore.lastReadTimestamps[props.echoName] || 0) < message.timestamp ? ' font-bold' : ' text-gray-500')
}

/** Обрезает текст сообщения до 120 символов для tree view */
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
  return String(text).substring(0, 120) + (text.length > 120 ? '...' : '')
}

/** Форматирует timestamp (секунды) в локальную строку даты */
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString()
}

/** Проверяет, является ли пользователь владельцем сообщения */
function isMessageOwner(message) {
  return identity.user?.address === message.sender_address
}

/** Обработчик reply — emits событие с данными цитируемого сообщения */
function handleReply(message) {
  emit('reply', { ...message, _reply_to: message.message_id })
}

/** Открыть сообщение целиком */
function openMessage(message) {
  emit('open', message)
}

/** Обработчик forward */
function handleForward(message) {
  emit('forward', message)
}

/** Обработчик edit — открывает композер в режиме редактирования сообщения */
function handleEdit(message) {
  emit('edit', message)
}

function handleMark(data) {
  emit('mark', data)
}

/** Открывает модалку модератора для предупреждения */
function handleWarn(message) {
  selectedMessage.value = message
  showModeratorMenu.value = true
}

/** Открывает модалку модератора для наказания */
function handlePunish(message) {
  selectedMessage.value = message
  showModeratorMenu.value = true
}

/** Открывает меню модератора */
function handleAppeal(message) {
  appealMessage.value = message
}

function openModeratorMenu(message) {
  selectedMessage.value = message
  showModeratorMenu.value = true
}

/** После отправки модераторского действия — перезагружаем сообщения */
function handleModeratorSubmitted(moderatorMessage) {
  refreshFromServer()
}

/**
 * Точечная перезагрузка сообщений с сервера (#330): только для явных
 * действий. При открытии эхи сетевой fetch не нужен — сообщения уже в сторе
 * (selectEcho → loadEcho из IndexedDB), а новые доставляет poll (doPoll →
 * echo.addMessages); лишний fetchEchoMessages был бы вторым send_receive.
 */
async function refreshFromServer() {
  if (!echoName.value) return
  loading.value = true
  error.value = null
  try {
    const newMessages = await fetchEchoMessages(echoName.value)
    echoStore.addMessages(props.echoName, newMessages)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onReaderKeydown)
  if (props.viewMode === 'reader') startReader()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onReaderKeydown)
})

/** Открывает модалку с raw JSON сообщения */
function viewRaw(message) {
  const parsed = { ...message }
  if (typeof parsed.data === 'string') {
    try {
      parsed.data = JSON.parse(parsed.data)
    } catch { /* оставляем как строку */ }
  }
  rawMessage.value = parsed
  showRawModal.value = true
}


const protocolStore = useProtocolStore()

/** All protocol messages of this echo (includes ballots, needed for counts). */
const protocolMessages = computed(() => protocolStore.getByEcho(props.echoName))

/** Vote result message (proto=vote, data.type=result). */
function isVoteResult(msg) {
  return msg?.type === 'vote' && parsedData(msg).type === 'result'
}

/** Vote poster (proto=vote, data.type=poster). */
function isVotePoster(msg) {
  return msg?.type === 'vote' && parsedData(msg).type === 'poster'
}

/** Messages rendered by the shared vote card (posters and their results). */
function isVoteCard(msg) {
  const type = parsedData(msg).type
  return type === 'poster' || type === 'result'
}

const {
  seenVoteIds,
  pendingVariantOf: pendingVariantShared,
  selectVoteVariant,
  castVote,
  retractVote,
} = useVotePoster()

/** Own confirmed vote for the card (a result card refers to its poster). */
function myVoteVariant(msg) {
  const poster = isVoteResult(msg) ? (votePosterFor(msg) || msg) : msg
  return myVoteVariantFor(poster, protocolMessages.value, identity.user?.address || '')
}

function pendingVariantFor(msg) {
  const poster = isVoteResult(msg) ? (votePosterFor(msg) || msg) : msg
  return pendingVariantShared(props.echoName, poster, myVoteVariant(msg))
}

/** Find the vote poster a result message refers to. */
function votePosterFor(resultMsg) {
  const data = parsedData(resultMsg)
  const all = protocolMessages.value
  if (data.originalMessageId) {
    const byId = all.find(m => m.message_id === data.originalMessageId)
    if (byId) return byId
  }
  if (data.poster_message) {
    return all.find(m => m.type === 'vote' && parsedData(m).type === 'poster' && parsedData(m).message === data.poster_message) || null
  }
  return null
}

/** Может ли пользователь ответить на refill-запрос (есть ли локальные сообщения) */
function canRespondToRefill(msg) {
  try {
    const d = JSON.parse(msg.data)
    if (!d.refill || d.type !== 'request') return false
    const msgs = echoStore.messages[d.refill.echo || props.echoName] || []
    return countRefillableMessages(msgs, d.refill.before) > 0
  } catch { return false }
}

/**
 * Отвечает на refill-запрос: отправляет старые сообщения запросившему пользователю.
 * Запрашивает подтверждение, формирует response-сообщение и шлёт через send_receive.
 */
async function respondToRefill(msg) {
  try {
    const data = JSON.parse(msg.data)
    if (!data.refill || data.type !== 'request') return
    const echoName = data.refill.echo || props.echoName
    const localMsgs = echoStore.messages[echoName] || []
    const messages = refillableMessagesFor(localMsgs, data.refill.before)
    if (messages.length === 0) {
      alert('No local messages to share')
      return
    }
    const cutoff = new Date(data.refill.before).toLocaleDateString()
    if (!confirm(`User ${data.refill.from} requests messages before ${cutoff}. Send ${messages.length} old messages?`)) {
      return
    }
    const res = await sendRefillResponse(
      { echoName, from: data.refill.from, before: data.refill.before },
      messages,
      { echoes: echoStore.echoes },
    )
    if (res.skipped > 0) {
      alert(`Skipped ${res.skipped} message(s) (no signature or exceed the size limit)`)
    }
  } catch (err) {
    console.error('Failed to respond to refill:', err)
    alert('Failed to send refill response: ' + err.message)
  }
}

/**
 * Определяет тип протокола сообщения.
 * Сначала проверяет message.type, затем proto внутри data.
 */
function getProtocolType(message) {
  return protocolTypeOf(message)
}

/** CSS-класс для иконки протокола (цветной кружок) */
function getProtocolIcon(message) {
  const ptype = getProtocolType(message)
  if (!ptype) return ''
  return 'inline-block w-2 h-2 rounded-full mr-1 ' + {
    vote: 'bg-green-500',
    election: 'bg-blue-500',
    refill: 'bg-purple-500',
    merge: 'bg-yellow-500',
    conflict: 'bg-red-500',
    recover: 'bg-indigo-500',
    change_policy: 'bg-pink-500',
    remove_echo: 'bg-orange-500',
    excommunicate: 'bg-gray-500',
    appeal: 'bg-amber-500'
  }[ptype] || 'bg-gray-300'
}

/** Тултип для иконки протокола */
function getProtocolTitle(message) {
  const ptype = getProtocolType(message)
  return ptype ? ptype : ''
}

/** Цветная левая граница для протокольных сообщений */
function getMessageBorder(message) {
  const ptype = getProtocolType(message)
  if (!ptype) return ''
  return 'border-l-4 ' + {
    vote: 'border-l-green-500',
    election: 'border-l-blue-500',
    refill: 'border-l-purple-500',
    merge: 'border-l-yellow-500',
    conflict: 'border-l-red-500',
    recover: 'border-l-indigo-500',
    change_policy: 'border-l-pink-500',
    remove_echo: 'border-l-orange-500',
    excommunicate: 'border-l-gray-500',
    appeal: 'border-l-amber-500'
  }[ptype] || ''
}

/** Класс карточки сообщения в ленте: модераторские warn/punishment — цветная окантовка */
function getFeedMessageClass(message) {
  const moderation = moderationBorderClass(parsedData(message))
  if (moderation) {
    return moderation + ' rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800'
  }
  return 'border rounded-lg px-3 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 ' + getMessageBorder(message)
}

/**
 * Верифицирует JWS-подпись сообщения.
 * Пытается найти публичный ключ отправителя (свой или из keyService).
 */
async function verifyMessageSignature(message) {
  if (!message || !message.jws || !message.data) return null
  try {
    const { verifyJWS } = await import('../services/crypto')
    let pubKey = null

    // Если сообщение от себя — используем свой ключ
    if (identity.user?.address === message.sender_address && identity.publicKey) {
      pubKey = identity.publicKey
    } else {
      // Иначе ищем ключ в keyService
      try {
        const { keyService } = await import('../services/keyService')
        const keyInfo = await keyService.getPublicKey(message.sender_address)
        if (keyInfo) pubKey = keyInfo.signPublicKey
      } catch {
        return null // ключ не найден — не можем верифицировать
      }
    }

    if (!pubKey) return null
    const payload = await verifyJWS(message.jws, pubKey)
    return payload === message.data
  } catch {
    return false
  }
}

/** Верифицирует подписи для массива сообщений (проставляет поле _verified) */
async function verifyMessages(msgs) {
  for (const msg of msgs) {
    try {
      msg._verified = await verifyMessageSignature(msg)
    } catch {
      msg._verified = false
    }
  }
}

// Автоматически верифицируем сообщения при их обновлении
watch(allMessages, async (msgs) => {
  if (msgs && msgs.length > 0) {
    await verifyMessages(msgs)
  }
}, { immediate: true })

// Переверифицируем когда получен новый ключ
watch(() => keyService._verifyVersion, async () => {
  if (allMessages.value?.length > 0) {
    await verifyMessages(allMessages.value)
  }
})

// Развёрнутые узлы в tree view
const expandedTree = ref(new Set())
// Развёрнутые темы в threads view
const expandedThreads = ref(new Set())

/** Переключает развёрнутое состояние узла в дереве/темах */
function toggleExpanded(treeSet, id) {
  if (treeSet.has(id)) treeSet.delete(id)
  else treeSet.add(id)
}

// ---- Нить беседы (#285) ----

const rootEl = ref(null)
// { key, subject, messageId } выбранной беседы; null — показываем ленту
const focusedThread = ref(null)
// Узлы нити, чьи дочерние сообщения развёрнуты (ветка выбранного сообщения)
const expandedThreadIds = ref(new Set())

/** Сообщения выбранной беседы (включая родителя выбранного сообщения) */
const focusedThreadMessages = computed(() =>
  focusedThread.value
    ? conversationMessages(focusedThread.value.key, textMessages.value, messageIndex.value)
    : []
)

/** Плоское дерево беседы (DFS, depth) */
const threadItems = computed(() => buildMessageTree(focusedThreadMessages.value, effectiveParentId))

/** Сколько прямых ответов у каждого сообщения беседы */
const threadChildrenCount = computed(() => {
  const map = new Map()
  for (const m of focusedThreadMessages.value) {
    const parentId = effectiveParentId(m)
    if (parentId) {
      map.set(parentId, (map.get(parentId) || 0) + 1)
    }
  }
  return map
})

/** Видимые узлы нити: дети свёрнутых узлов скрыты */
const visibleThreadItems = computed(() =>
  visibleThreadNodes(threadItems.value, threadChildrenCount.value, expandedThreadIds.value)
)

/** Открыть нить беседы: раскрываем ветку выбранного сообщения, остальные свёрнуты. */
function openThread(msg) {
  if (!msg) return
  // Сообщения без темы нитями не считаются и не открываются (#287).
  const subject = conversationSubject(msg, messageIndex.value)
  if (!subject) return
  const key = conversationKey(msg, messageIndex.value)
  expandedThreadIds.value = new Set([...ancestorChain(msg, messageIndex.value), msg.message_id])
  focusedThread.value = { key, subject, messageId: msg.message_id }
  nextTick(() => {
    const el = rootEl.value?.querySelector('.thread-focused')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

/** Вернуться к ленте */
function closeThread() {
  focusedThread.value = null
}

// Смена режима из панели (Echoes.vue) закрывает открытую нить (#319) и
// открывает читалку на первом непрочитанном (#317)
watch(() => props.viewMode, (mode) => {
  if (focusedThread.value) closeThread()
  if (mode === 'reader') startReader()
})

/** Свернуть/развернуть ответы узла нити */
function toggleThreadNode(msg) {
  const next = new Set(expandedThreadIds.value)
  if (next.has(msg.message_id)) next.delete(msg.message_id)
  else next.add(msg.message_id)
  expandedThreadIds.value = next
}

/** Есть ли у сообщения родитель, отсутствующий в локальном индексе. */
function hasMissingParent(msg) {
  const parentId = effectiveParentId(msg)
  return !!(parentId && !messageIndex.value.has(parentId))
}

/**
 * Кнопка подгрузки parent-сообщения (#285): ищем родителя в локальной БД
 * (эха, затем корзина) и показываем его, даже если он скрыт фильтрами.
 */
async function loadParentMessage(msg) {
  const parentId = effectiveParentId(msg)
  if (!parentId) return
  const inMemory = (echoStore.messages[props.echoName] || []).find(m => m.message_id === parentId)
  if (inMemory) {
    forcedVisibleIds.value = new Set([...forcedVisibleIds.value, parentId])
    return
  }
  try {
    const { getMessage, getTrash } = await import('../services/db')
    let stored = await getMessage(props.echoName, parentId)
    if (!stored) {
      const trash = await getTrash()
      stored = (trash || []).find(e => e && e.message_id === parentId)
    }
    if (stored) {
      await echoStore.addMessages(props.echoName, [stored])
      forcedVisibleIds.value = new Set([...forcedVisibleIds.value, parentId])
      return
    }
  } catch (e) {
    console.warn('[thread] load parent failed', e)
  }
  const notifications = (await import('../stores/notifications')).useNotificationsStore()
  notifications.warning(t('echoes.parentNotFound'))
}

/**
 * Tree view: строит дерево parent→children из текстовых сообщений.
 * Ответы, чей родитель отсутствует в ленте, становятся корнями (#272).
 */
const treeMessages = computed(() => buildMessageTree(textMessages.value, effectiveParentId))

/**
 * Threads view: группирует сообщения по нормализованной теме (subject без Re:).
 */
const threadMessages = computed(() => {
  const result = []
  // Тема беседы без Re:-префиксов, с учётом наказаний (#287); сообщения без
  // темы нитями не считаются и в «Темы» не попадают.
  for (const group of groupByConversationSubject(textMessages.value, messageIndex.value)) {
    const msgs = group.messages
    const unread = msgs.some(m => {
      const lastRead = echoStore.lastReadTimestamps[props.echoName] || 0
      return m.timestamp > lastRead
    })
    result.push({ subject: group.subject, messages: msgs, unread, count: msgs.length, last: msgs[msgs.length - 1] })
  }
  return result
})

const emit = defineEmits(['moderate', 'reply', 'forward', 'edit-draft', 'mark', 'open', 'update:viewMode', 'reader-navigate'])

// The current reader message goes into the URL (#322): /echoes/:id/reader/:id.
watch(() => currentReaderMessage.value?.message_id || '', (id) => {
  if (props.viewMode === 'reader' && readerReady) emit('reader-navigate', id)
})

/**
 * Reposition the reader when the echo or the mode changes, and when the first
 * batch of messages arrives (the store may be empty on mount). New messages in
 * the same echo do not move the reader — only the ribbon grows. Registered last
 * so that all computeds it touches are initialized.
 */
watch(
  [() => `${props.echoName}|${props.viewMode}`, () => readerMessages.value.length],
  ([key, len], [oldKey, oldLen]) => {
    if (props.viewMode !== 'reader' || len === 0) return
    if (key !== oldKey || oldLen === 0) startReader()
    else if (readerIndex.value > len - 1) readerIndex.value = Math.max(0, len - 1)
  }
)
</script>

<style scoped>
/* Reader paging controls (#317) */
.reader-nav {
  padding: 0 0.35rem;
  border-radius: 0.25rem;
  border: 1px solid rgb(209 213 219);
  line-height: 1.2;
}
.reader-nav:hover:not(:disabled) {
  background: rgb(243 244 246);
}
.reader-nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.dark .reader-nav {
  border-color: rgb(75 85 99);
}
.dark .reader-nav:hover:not(:disabled) {
  background: rgb(55 65 81);
}

/* Unread feed markers (#302): the "new messages" line the feed lands on and a
   dot on unread cards. */
.unread-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0;
  scroll-margin-top: 0.5rem;
  color: #2563eb;
  font-size: 0.75rem;
  font-weight: 600;
}
.unread-divider::before,
.unread-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid rgba(37, 99, 235, 0.4);
}
.dark .unread-divider {
  color: #60a5fa;
}
.dark .unread-divider::before,
.dark .unread-divider::after {
  border-top-color: rgba(96, 165, 250, 0.4);
}
.unread-dot {
  display: inline-block;
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: #3b82f6;
  flex-shrink: 0;
}
.feed-card-unread {
  background: rgba(59, 130, 246, 0.05);
  border-radius: 0.375rem;
}
.dark .feed-card-unread {
  background: rgba(59, 130, 246, 0.1);
}

/* Действия и кнопка "открыть целиком" видны при наведении (на тач-устройствах — всегда) */
@media (hover: hover) {
  .feed-actions {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .feed-card:hover .feed-actions {
    opacity: 1;
  }
}

@media (max-width: 480px) {
  .raw-modal-content pre {
    font-size: 0.6rem;
    max-height: 50vh;
  }
}
</style>
