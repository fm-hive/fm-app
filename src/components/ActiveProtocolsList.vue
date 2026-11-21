<template>
  <div class="active-protocols">
    <div class="mb-4">
      <h3 class="text-lg font-semibold mb-2 flex items-center">
        <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
        Active Protocols
        <span class="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
          {{ activeMessages.length }}
        </span>
      </h3>
      <p class="text-sm text-gray-600 mb-3">
        {{ $t('protocol.activeProtocolsHint') }}
      </p>
    </div>
    
    <div v-if="loading" class="text-center py-4">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      <p class="mt-2 text-gray-500">{{ $t('boot.loading') }}</p>
    </div>
    
    <div v-else-if="error" class="p-4 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-red-700">{{ error }}</p>
      <button @click="loadActiveProtocols" class="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">
        {{ $t('boot.retry') }}
      </button>
    </div>
    
    <div v-else-if="activeMessages.length === 0" class="p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <p class="text-gray-600 text-center">{{ $t('protocol.noActiveProtocols') }}</p>
    </div>
    
    <div v-else class="space-y-3">
      <div 
        v-for="msg in activeMessages" 
        :key="msg.message_id"
        class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
        :class="getProtocolColor(msg.type)"
      >
        <div class="flex justify-between items-start mb-2">
          <div>
            <span class="font-medium text-gray-900">{{ msg._merge ? t('protocol.types.merge') : msg._changePolicy ? t('protocol.types.change_policy') : msg.type }}</span>
            <span class="ml-2 text-sm text-gray-500">{{ msg._merge ? `A: ${msg._node1 || '?'} ↔ B: ${msg._node2 || '?'}` : msg._merged ? `Election (${msg._posterCount} ${t('election.candidatesLower') || 'candidates'})` : msg._changePolicy ? `${msg._chunks.length} ${t('protocol.chunkOf', { index: 1, total: msg._chunks.length }).split(' ')[0]}` : getSubtype(msg) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="hideActive(msg)"
              class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-500 hover:bg-gray-200 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
              :title="$t('protocol.hide')"
              :aria-label="$t('protocol.hide')"
            >
              ✕
            </button>
            <button
              v-if="isCollapsible(msg)"
              @click="toggleCollapse(msg.message_id)"
              class="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-200"
              :title="$t('protocol.collapse')"
            >
              {{ isCollapsed(msg) ? '↔' : '↕' }}
            </button>
            <span
              class="px-2 py-1 text-xs rounded-full"
              :class="isElectionResult(msg) && msgData(msg).result !== 'success' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'"
            >
              {{ isElectionResult(msg)
                ? (msgData(msg).result === 'success' ? t('election.resultElected') : t('election.resultFailed'))
                : $t('protocol.active') }}
            </span>
          </div>
        </div>
        
        <!-- Collapsed view for vote/election posters -->
        <div v-if="isCollapsible(msg) && isCollapsed(msg)" class="collapsed-row mt-2">
          <div class="text-sm font-medium text-gray-700 truncate" :title="getQuestionText(msg)">
            {{ getQuestionText(msg) || '—' }}
          </div>
          <div class="text-xs text-gray-500 mt-1">{{ getCollapsedInfo(msg) }}</div>
          <div class="mt-2 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              class="h-2 rounded-full transition-all"
              :style="{ width: getProgressPercent(msg) + '%', backgroundColor: getProgressColor(msg) }"
            ></div>
          </div>
        </div>

        <!-- Expanded view -->
        <template v-else>
        <!-- Merge session: phase votes and diff chunks in one card (#348) -->
        <div v-if="msg._merge" class="space-y-3">
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <span class="font-semibold">A</span> — {{ t('merge.initiator') }} ({{ msg._node1 || '?' }}) ·
            <span class="font-semibold">B</span> — {{ t('merge.acceptor') }} ({{ msg._node2 || '?' }})
          </div>
          <!-- Both policies fetched in phase 0 (#257), expanded but collapsible. -->
          <details v-if="mergePolicyBlocks(msg).length" open class="rounded border border-gray-200 dark:border-gray-700 p-3 text-xs">
            <summary class="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
              {{ t('protocol.mergePolicies') }}
            </summary>
            <div class="mt-2 grid gap-3 md:grid-cols-2">
              <div v-for="block in mergePolicyBlocks(msg)" :key="block.label">
                <div class="font-semibold text-gray-700 dark:text-gray-300">
                  {{ block.label }} ({{ block.address || '?' }})
                </div>
                <pre class="mt-1 whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">{{ block.policy.text || '—' }}</pre>
                <div v-if="block.params.length" class="mt-2">
                  <div class="text-gray-500 dark:text-gray-400">{{ t('protocol.mergePolicyParameters') }}</div>
                  <dl class="mt-1 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5">
                    <template v-for="param in block.params" :key="param[0]">
                      <dt class="font-mono text-gray-600 dark:text-gray-400">{{ param[0] }}</dt>
                      <dd class="font-mono break-all text-gray-700 dark:text-gray-300">{{ param[1] }}</dd>
                    </template>
                  </dl>
                </div>
              </div>
            </div>
          </details>
          <details v-if="mergeNodelistBlocks(msg).length" open class="rounded border border-gray-200 dark:border-gray-700 p-3 text-xs">
            <summary class="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
              {{ t('protocol.mergeNodelists') }}
            </summary>
            <div class="mt-2 space-y-2">
              <div v-for="block in mergeNodelistBlocks(msg)" :key="block.label">
                <div class="font-semibold text-gray-700 dark:text-gray-300">
                  {{ block.label }} ({{ block.address || '?' }})
                </div>
                <div v-for="node in block.nodes" :key="node.address" class="mt-2 rounded bg-gray-50 p-2 dark:bg-gray-900/40">
                  <div class="font-mono text-gray-800 dark:text-gray-200">
                    {{ node.address || '?' }}<span v-if="node.name" class="ml-1 font-sans text-gray-500 dark:text-gray-400">· {{ node.name }}</span>
                  </div>
                  <div v-if="node.clients && node.clients.length" class="mt-1">
                    <div class="text-gray-500 dark:text-gray-400">{{ t('protocol.mergeNodeClients') }}</div>
                    <ul class="ml-4 list-disc">
                      <li v-for="client in node.clients" :key="client.address">
                        <span class="font-mono">{{ client.address }}</span>
                        <span v-if="client.name" class="ml-1 text-gray-500 dark:text-gray-400">· {{ client.name }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </details>
          <div v-if="msg._stages.length || msg._chunks.length" class="space-y-2">
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('protocol.mergeChunksHint', { count: msg._chunks.length }) }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-for="stage in msg._stages"
                :key="stage.poster.message_id"
                type="button"
                :title="mergeBadgeTitle(stage)"
                :aria-label="mergeBadgeTitle(stage)"
                :class="mergeBadgeClass(msg, stage)"
                @click="toggleChunk(msg, stage)"
              >
                <span class="text-[11px] font-semibold">P{{ stage.phase }}</span>
                <span
                  v-if="chunkMyVote(stage.poster)"
                  class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white"
                >✓</span>
              </button>
              <button
                v-for="chunk in msg._chunks"
                :key="chunk.poster.message_id"
                type="button"
                :title="mergeBadgeTitle(chunk)"
                :aria-label="mergeBadgeTitle(chunk)"
                :class="mergeBadgeClass(msg, chunk)"
                @click="toggleChunk(msg, chunk)"
              >
                {{ chunk.chunkIndex + 1 }}
                <span
                  v-if="chunkMyVote(chunk.poster)"
                  class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white"
                >✓</span>
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-gray-600 dark:text-gray-400">{{ msgData(msg).message }}</p>
          <VoteProtocolCard
            v-if="selectedChunk(msg)"
            :msg="selectedChunk(msg).poster"
            :question="selectedChunk(msg).text"
            :all-messages="allEchoMessages"
            :pending-variant="pendingVariantOf(selectedChunk(msg).poster)"
            :my-vote-variant="myVoteVariant(selectedChunk(msg).poster)"
            :seen-vote-ids="seenVoteIds"
            show-echo
            show-reactions
            show-raw
            :show-hide="hasPosterResult(selectedChunk(msg).poster)"
            @select-variant="variant => selectVoteVariant(selectedChunk(msg).poster, variant)"
            @vote="castVote(selectedChunk(msg).poster)"
            @retract="retractVote(selectedChunk(msg).poster)"
            @open-voter="openVoteDetail"
            @view-raw="viewRaw(selectedChunk(msg).poster)"
            @hide="hideMergeCard(msg)"
          />
        </div>

        <!-- Policy change: one card listing all chunks; click a chunk to vote -->
        <div v-else-if="msg._changePolicy" class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('protocol.chunksHint', { count: msg._chunks.length }) }}
          </p>
          <div class="divide-y divide-gray-200 dark:divide-gray-700 rounded border border-gray-200 dark:border-gray-700">
            <button
              v-for="chunk in msg._chunks"
              :key="chunk.poster.message_id"
              type="button"
              @click="toggleChunk(msg, chunk)"
              class="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40"
              :class="selectedChunk(msg)?.poster.message_id === chunk.poster.message_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
            >
              <span class="font-medium">{{ t('protocol.chunkOf', { index: chunk.chunkIndex + 1, total: chunk.totalChunks }) }}</span>
              <span v-if="chunk.subject" class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{{ chunk.subject }}</span>
              <!-- Own vote on this chunk -->
              <span
                v-if="chunkMyVote(chunk.poster)"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                :title="t('protocol.yourVote', { variant: chunkMyVote(chunk.poster) })"
              >✓ {{ chunkMyVote(chunk.poster) }}</span>
              <!-- End time and votes per chunk (visible without expanding) -->
              <span class="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span
                  v-if="chunkPhase(chunk)"
                  :class="chunkPhase(chunk).phase === 'ended' ? 'text-gray-500 dark:text-gray-400' : 'text-blue-600 dark:text-blue-400'"
                >
                  <template v-if="chunkPhase(chunk).phase === 'ended'">{{ t('vote.endedPhase') }}</template>
                  <template v-else>
                    {{ t('vote.votingPhase') }} · {{ t('vote.endsAt') }}:
                    <span class="cursor-pointer underline" @click.stop="toggleDateFormat(chunk.poster.message_id)">
                      {{ dateFormatToggles[chunk.poster.message_id] && chunkPhase(chunk).phaseEnd ? formatDate(chunkPhase(chunk).phaseEnd) : formatRemaining(chunkPhase(chunk).remaining) }}
                    </span>
                  </template>
                </span>
                <span class="font-mono text-gray-600 dark:text-gray-300">{{ chunkCountsLabel(chunk.poster) }}</span>
              </span>
            </button>
          </div>
          <VoteProtocolCard
            v-if="selectedChunk(msg)"
            :msg="selectedChunk(msg).poster"
            :question="selectedChunk(msg).text"
            :all-messages="allEchoMessages"
            :pending-variant="pendingVariantOf(selectedChunk(msg).poster)"
            :my-vote-variant="myVoteVariant(selectedChunk(msg).poster)"
            :seen-vote-ids="seenVoteIds"
            show-echo
            show-reactions
            show-raw
            :show-hide="hasPosterResult(selectedChunk(msg).poster)"
            @select-variant="variant => selectVoteVariant(selectedChunk(msg).poster, variant)"
            @vote="castVote(selectedChunk(msg).poster)"
            @retract="retractVote(selectedChunk(msg).poster)"
            @open-voter="openVoteDetail"
            @view-raw="viewRaw(selectedChunk(msg).poster)"
            @hide="hideMessage(msg)"
          />
        </div>

        <!-- Vote posters use the shared card (same form as in the message feed) -->
        <VoteProtocolCard
          v-else-if="msg.type === 'vote'"
          :msg="msg"
          :all-messages="allEchoMessages"
          :pending-variant="pendingVariantOf(msg)"
          :my-vote-variant="myVoteVariant(msg)"
          :seen-vote-ids="seenVoteIds"
          show-echo
          show-reactions
          show-raw
          :show-hide="hasPosterResult(msg)"
          @select-variant="variant => selectVoteVariant(msg, variant)"
          @vote="castVote(msg)"
          @retract="retractVote(msg)"
          @open-voter="openVoteDetail"
          @view-raw="viewRaw(msg)"
          @hide="hideMessage(msg)"
        />
        <template v-if="msg.type !== 'vote' && !msg._merge">
        <div class="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span class="text-gray-500">{{ $t('protocol.echo') }}:</span>
            <span class="ml-2 font-medium">{{ msg.echo_name || 'N/A' }}</span>
          </div>
          <div>
            <span class="text-gray-500">{{ $t('protocol.sender') }}:</span>
            <SenderLabel :address="msg.sender_address" class="ml-2 font-medium truncate" />
          </div>
          <div>
            <span class="text-gray-500">{{ $t('protocol.date') }}:</span>
            <span class="ml-2">{{ formatTimestamp(msg.timestamp) }}</span>
          </div>
          <div>
            <span class="text-gray-500">{{ $t('protocol.status') }}:</span>
            <span class="ml-2">{{ getDetailedStatus(msg) }}</span>
          </div>
        </div>
        
        <div v-if="getProtocolDetails(msg)" class="mt-2 p-3 bg-gray-100 rounded text-sm">
          <pre class="text-gray-700 whitespace-pre-wrap text-xs">{{ getProtocolDetails(msg) }}</pre>
        </div>

        <!-- Markdown question/description for vote and election posters -->
        <div v-if="getQuestionText(msg) && (msg.type === 'vote' || msg.type === 'election') && !isElectionResult(msg)" class="mt-2 p-3 bg-gray-100 rounded text-sm">
          <MarkdownRenderer :content="getQuestionText(msg)" />
        </div>

        <!-- Phase timeline for election, vote, excommunicate -->
        <div v-if="(msg.type === 'election' || msg.type === 'vote' || msg.type === 'excommunicate') && getPhaseData(msg) && !isElectionResult(msg)" class="mt-3">
          <!-- Color segments -->
          <div class="flex items-center gap-0.5 mb-1">
            <div v-for="(phase, i) in getPhaseData(msg).phases" :key="i"
              class="flex-1 h-2 rounded"
              :class="phase.active ? 'bg-blue-500' : phase.past ? 'bg-gray-300' : 'bg-gray-100'"
              :title="phase.name"
            ></div>
          </div>
          <!-- Phase labels -->
          <div class="flex justify-between text-xs mb-2">
            <span v-for="(phase, i) in getPhaseData(msg).phases" :key="i"
              :class="phase.active ? 'font-bold text-blue-600' : phase.past ? 'text-gray-500' : 'text-gray-300'">
              {{ $t(getPhaseNameKey(msg.type, i)) }}
            </span>
          </div>
          <!-- End date / days left toggle (only if active and not ended) -->
          <div v-if="getPhaseData(msg).phaseEnd && getPhaseData(msg).phase !== 'ended' && getPhaseData(msg).phase !== 'permanent' && getPhaseData(msg).phase !== 'removed'" class="text-xs mt-1">
            <span class="text-gray-500">{{ getEndsLabel(msg.type) }}:</span>
            <span @click="toggleDateFormat(msg.message_id)" class="cursor-pointer ml-1 text-blue-600 hover:underline">
              {{ dateFormatToggles[msg.message_id] ? formatDate(getPhaseData(msg).phaseEnd) : formatRemaining(getPhaseData(msg).remaining) }}
            </span>
          </div>
        </div>

        </template>

        <!-- Election candidates (only during voting phase) -->
        <div v-if="msg.type === 'election'" class="mt-3">
          <div v-if="isElectionResult(msg)" class="text-sm space-y-1">
            <div class="font-semibold" :class="msgData(msg).result === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              {{ msgData(msg).result === 'success' ? t('election.resultElected') : t('election.resultFailed') }}
            </div>
            <div v-if="msgData(msg).elected_addresses && msgData(msg).elected_addresses.length" class="text-gray-800 dark:text-gray-200">
              🏆 <SenderLabel v-for="addr in msgData(msg).elected_addresses" :key="addr" :address="addr" class="mr-1" />
            </div>
            <div v-if="msgData(msg).reason" class="text-xs text-gray-500 dark:text-gray-400">{{ msgData(msg).reason }}</div>
            <div v-if="msgData(msg).votes && msgData(msg).votes.length" class="mt-2">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ t('election.voteDistribution') }}:</div>
              <div v-for="v in msgData(msg).votes" :key="v.candidate" class="text-xs text-gray-700 dark:text-gray-300">
                {{ v.candidate }} — {{ v.votes }} {{ t('election.votes') }}
              </div>
            </div>
          </div>
          <div v-else-if="getPhaseData(msg) && getPhaseData(msg).phase === 'voting'" class="flex flex-wrap gap-2">
            <button
              v-for="candAddr in getPhaseData(msg).candidates"
              :key="candAddr"
              @click="openElectionPoster(msg, candAddr)"
              :class="[
                'px-3 py-1 text-sm rounded border',
                hasElectionVotedFor(msg, candAddr)
                  ? 'bg-green-500 text-white border-green-500'
                  : isPendingElectionVote(msg, candAddr)
                    ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                    : 'bg-white hover:bg-blue-50 border-gray-300'
              ]"
              :title="t('election.viewPoster')"
            >
              📢 <SenderLabel :address="candAddr" />
              <span v-if="getPhaseData(msg).candidateVotes[candAddr]" class="ml-1 text-xs opacity-70">({{ getPhaseData(msg).candidateVotes[candAddr] }})</span>
            </button>
            <button v-if="hasPendingElectionVote(msg)" @click="castElectionVote(msg)" class="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
              🗳️ {{ t('specialMessages.vote') }}
            </button>
            <button v-if="hasAnyElectionVote(msg)" @click="retractElectionVote(msg)" class="px-3 py-1 text-sm rounded border border-red-300 text-red-500 hover:bg-red-50">
              ↩ {{ t('specialMessages.retractVote') }}
            </button>
          </div>
          <div v-else-if="msg._merged && getPhaseData(msg)" class="text-xs text-gray-500">
            <div>
              {{ getPhaseData(msg).candidates.length }} {{ $t('election.candidatesLower') }}
              ({{ $t('election.minRequired') }}: {{ getPhaseData(msg).minCandidates }})
              — {{ getPhaseData(msg).phase === 'collection' ? $t('election.collectionPhase') : getPhaseData(msg).phase === 'voting' ? $t('election.votingPhase') : $t('election.endedPhase') }}
            </div>
            <div v-for="poster in getElectionPosterList()" :key="poster.message_id" class="mt-1">
              <button @click="openElectionPoster(msg, poster._from)" class="text-left hover:underline" :title="t('election.viewPoster')">
                <SenderLabel :address="poster._from" class="font-medium" />: {{ poster._message }}
              </button>
            </div>
          </div>
        </div>
        
        <div v-if="msg.type !== 'vote' && !msg._merge" class="mt-3 flex justify-between gap-2">
          <button 
            v-if="isOwnCancelablePoster(msg)"
            @click="cancelRequest(msg)"
            class="px-3 py-1 text-sm border border-red-300 text-red-500 rounded hover:bg-red-50"
          >
            ◀ {{ $t('specialMessages.retractRequest') }}
          </button>
          <div class="flex gap-2 ml-auto">
          <button 
            @click="viewRaw(msg)" 
            class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
          >
            {{ $t('protocol.viewRaw') }}
          </button>
          <button
            v-if="hasPosterResult(msg)"
            @click="hideMessage(msg)"
            class="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500"
          >
            {{ $t('protocol.hide') }}
          </button>
          <button 
            v-if="showActionButton(msg)"
            @click="handleProtocolAction(msg)"
            class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {{ getActionLabel(msg) }}
          </button>
          </div>
        </div>
        </template>
      </div>
    </div>
    
    <!-- Raw JSON Modal -->
    <div v-if="showRawModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium">{{ rawTitle || 'Raw Protocol Message' }}</h3>
          <button @click="showRawModal = false" class="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <SourceJson :value="rawMessage" class="bg-gray-100 p-4 rounded overflow-auto max-h-96" />
      </div>
    </div>

    <!-- Vote Detail Modal -->
    <div v-if="voteDetail.show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-80 shadow-lg rounded-md bg-white">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium">{{ $t('protocol.voteDetail') }}</h3>
          <button @click="voteDetail.show = false" class="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div class="space-y-3 text-sm">
          <div>
            <span class="text-gray-500">{{ $t('protocol.voter') }}:</span>
            <SenderLabel :address="voteDetail.voterAddress" :name="voteDetail.voterName" class="ml-2 font-medium" />
          </div>
          <div>
            <span class="text-gray-500">{{ $t('protocol.variant') }}:</span>
            <span class="ml-2 font-medium">{{ voteDetail.voteVariant || '—' }}</span>
          </div>
          <div>
            <span class="text-gray-500">{{ $t('protocol.date') }}:</span>
            <span class="ml-2">{{ formatTimestamp(voteDetail.timestamp) }}</span>
          </div>
          <div v-if="voteDetail.voterAddress">
            <span class="text-gray-500">{{ $t('protocol.sender') }}:</span>
            <span class="ml-2 font-medium truncate">{{ voteDetail.voterAddress }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Election poster modal -->
    <div v-if="posterModal.show" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" @click.self="closeElectionPoster">
      <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-2/3 lg:w-1/2 shadow-lg rounded-md bg-white dark:bg-gray-800 dark:border-gray-600">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium dark:text-gray-200">
            {{ t('election.poster') }} — <SenderLabel :address="posterModal.address" />
          </h3>
          <button @click="closeElectionPoster" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">&times;</button>
        </div>
        <div v-if="posterModal.name" class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ posterModal.name }}</div>
        <div class="text-sm text-gray-700 dark:text-gray-300 max-h-96 overflow-y-auto">
          <MarkdownRenderer :content="posterModal.message || ''" />
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button v-if="posterModal.canVote" @click="voteFromPoster" class="px-3 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
            🗳️ {{ t('specialMessages.voteCandidate') }}
          </button>
          <button @click="closeElectionPoster" class="px-3 py-1 text-sm border rounded dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            {{ t('app.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProtocolStore } from '../stores/protocol'
import { useIdentityStore } from '../stores/identity'
import { useEchoStore } from '../stores/echo'
import { useNamesStore } from '../stores/names'
import { fetchMessages } from '../services/message'
import { countRefillableMessages, refillableMessagesFor, sendRefillResponse } from '../services/refill'
import { useOutbox } from '../composables/useOutbox'
import { getPolicyParams, getElectionState, getVoteState, getExcommunicateState, countVoteVariants, formatRemaining, formatDate, ensurePolicyParams, paramsReady, myVoteVariantFor } from '../composables/useProtocolPhases'
import { useVotePoster } from '../composables/useVotePoster'
import VoteProtocolCard from './VoteProtocolCard.vue'
import SenderLabel from './SenderLabel.vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import SourceJson from './SourceJson.vue'
import { stringToColor } from '../utils/color'
import { nodeAddressFromUser } from '../services/invite'

const { t } = useI18n()

const dateFormatToggles = ref({})
function toggleDateFormat(msgId) {
  dateFormatToggles.value[msgId] = !dateFormatToggles.value[msgId]
}

// Get phase state data for the given message type
function getPhaseData(msg) {
  // Reactive dependency: re-compute when policy params become available
  void paramsReady()
  if (msg.type === 'election') return getElectionState(msg, allEchoMessages.value, protocolStore.electionPhases?.[msg.echo_name] || null)
  if (msg.type === 'vote') return getVoteState(msg)
  if (msg.type === 'excommunicate') return getExcommunicateState(msg, allEchoMessages.value)
  return null
}

const phaseLabels = {
  election: ['election.collectionPhase', 'election.votingPhase', 'election.endedPhase'],
  vote: ['vote.votingPhase', 'vote.endedPhase'],
  excommunicate: ['excommunicate.votingPhase', 'excommunicate.readOnlyPhase'],
}

function getPhaseNameKey(type, idx) {
  return phaseLabels[type]?.[idx] || ''
}

function getEndsLabel(type) {
  if (type === 'election') return t('election.endsAt') || 'Ends'
  if (type === 'vote') return t('vote.endsAt') || 'Ends'
  if (type === 'excommunicate') return t('excommunicate.endsAt') || 'Ends'
  return 'Ends'
}

function getElectionPosterList() {
  return allEchoMessages.value
    .filter(m => {
      if (m.type !== 'election') return false
      try {
        const d = JSON.parse(m.data)
        return d.type === 'poster' && d.from && d.message
      } catch { return false }
    })
    .map(m => {
      try {
        const d = JSON.parse(m.data)
        return { message_id: m.message_id, _from: d.from || m.sender_address, _message: d.message }
      } catch { return { message_id: m.message_id, _from: m.sender_address, _message: '' } }
    })
}

const props = defineProps({
  echoName: {
    type: String,
    required: true
  }
})

const protocolStore = useProtocolStore()
const namesStore = useNamesStore()
const identityStore = useIdentityStore()
const echoStore = useEchoStore()
const loading = ref(false)
const error = ref(null)
const refreshing = ref(false)
const showRawModal = ref(false)
const rawMessage = ref(null)
const rawTitle = ref('')

// Collapse state (persisted so it survives reloads)
const COLLAPSED_STORAGE_KEY = 'fm_protocol_collapsed'
function loadCollapsedMessages() {
  try { return JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '{}') } catch { return {} }
}
function saveCollapsedMessages() {
  try { localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedMessages.value)) } catch { /* ignore */ }
}
const collapsedMessages = ref(loadCollapsedMessages())
function toggleCollapse(msgId) {
  collapsedMessages.value[msgId] = !collapsedMessages.value[msgId]
  saveCollapsedMessages()
}
function isCollapsed(msg) {
  return !!collapsedMessages.value[msg.message_id]
}
function isCollapsible(msg) {
  return msg.type === 'vote' || msg.type === 'election'
}

// Vote detail modal
const voteDetail = ref({ show: false, voterName: '', voterAddress: '', voteVariant: '', timestamp: 0 })

// Selected chunk of a grouped change_policy card (state_key -> chunk)
const selectedChunks = ref({})
function selectedChunk(msg) {
  if (!msg?._changePolicy && !msg?._merge) return null
  return selectedChunks.value[msg._stateKey] || null
}
function toggleChunk(msg, chunk) {
  if (!msg?._changePolicy && !msg?._merge) return
  const current = selectedChunks.value[msg._stateKey]
  if (current?.poster.message_id === chunk.poster.message_id) {
    delete selectedChunks.value[msg._stateKey]
    return
  }
  selectedChunks.value[msg._stateKey] = chunk
}

// Seen vote IDs (for green dot on new votes)
// All protocol messages for this echo (including inactive)
const allEchoMessages = computed(() => {
  return protocolStore.getByEcho(props.echoName)
})

const myAddress = computed(() => identityStore.user?.address || '')
const localNodeAddress = computed(() => nodeAddressFromUser(myAddress.value))

// The own election vote in this echo: candidate address ('' = retracted).
const myElectionVote = computed(() => {
  const me = myAddress.value
  if (!me) return ''
  let best = null
  for (const m of allEchoMessages.value) {
    if (m.type !== 'election') continue
    let d
    try { d = JSON.parse(m.data) } catch { continue }
    if (d.type !== 'vote') continue
    if ((d.from || m.sender_address) !== me) continue
    const ts = m.timestamp || 0
    if (!best || ts >= best.ts) best = { ts, to: d.to || '' }
  }
  return best ? best.to : ''
})

// Own confirmed vote variant for a poster message. The node is the source of
// truth: only delivered local votes count (a peer merge network's vote is
// network-tagged and must not look like ours, #249/#346).
function myVoteVariant(msg) {
  return myVoteVariantFor(msg, allEchoMessages.value, myAddress.value)
}

const {
  seenVoteIds,
  pendingVariantOf: pendingVariantShared,
  selectVoteVariant: selectVoteVariantShared,
  castVote: castVoteShared,
  retractVote: retractVoteShared,
} = useVotePoster()

// Active protocols for this echo (one card per protocol; election posters
// merged, hidden/cancelled dropped) — shared with the echo header count.
const activeMessages = computed(() => protocolStore.getActiveProtocols(props.echoName))

// Vote counts per poster message
function getVoteCounts(posterMsg) {
  try {
    const posterData = JSON.parse(posterMsg.data)
    return countVoteVariants(posterData.message, allEchoMessages.value).counts
  } catch { return {} }
}

// A/B policy blocks shown in the merge card (phase 0, #257).
function policyParamValue(value) {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function mergeForeignSide(msg) {
  if (!msg?._merge || !localNodeAddress.value) return null
  const n1 = msg._node1 || ''
  const n2 = msg._node2 || ''
  if (!n1 || !n2 || n1 === n2) return null
  if (n1 === localNodeAddress.value && n2 !== localNodeAddress.value) return 'B'
  if (n2 === localNodeAddress.value && n1 !== localNodeAddress.value) return 'A'
  return null
}

function mergePolicyBlocks(msg) {
  const side = mergeForeignSide(msg)
  const blocks = []
  const add = (policy, address, label) => {
    if (!policy) return
    blocks.push({
      label,
      address,
      policy,
      params: Object.entries(policy.parameters || {}).map(([k, v]) => [k, policyParamValue(v)]),
    })
  }
  if (side === 'A') {
    add(msg._policy1, msg._node1, t('protocol.mergeForeignPolicy'))
  } else if (side === 'B') {
    add(msg._policy2, msg._node2, t('protocol.mergeForeignPolicy'))
  } else {
    // Identical-address merges or an unknown local node: keep both sides
    // visible rather than hiding information.
    add(msg._policy1, msg._node1, t('protocol.mergePolicyA'))
    add(msg._policy2, msg._node2, t('protocol.mergePolicyB'))
  }
  return blocks
}

function mergeNodelistBlocks(msg) {
  const side = mergeForeignSide(msg)
  const add = (info, addresses, address, label) => {
    if (info?.length) {
      return { label, address, nodes: info }
    }
    if (addresses?.length) {
      return {
        label,
        address,
        nodes: addresses.map(a => ({ address: a, name: '', clients: [] })),
      }
    }
    return null
  }
  if (side === 'A') {
    const block = add(msg._nodelist1_info, msg._nodelist1, msg._node1, t('protocol.mergeForeignNodelist'))
    return block ? [block] : []
  }
  if (side === 'B') {
    const block = add(msg._nodelist2_info, msg._nodelist2, msg._node2, t('protocol.mergeForeignNodelist'))
    return block ? [block] : []
  }
  return [
    add(msg._nodelist1_info, msg._nodelist1, msg._node1, t('protocol.mergePolicyA')),
    add(msg._nodelist2_info, msg._nodelist2, msg._node2, t('protocol.mergePolicyB')),
  ].filter(Boolean)
}

// Native tooltip of a merge chunk/phase badge: the full chunk text plus the
// status, tally and own vote (#350).
function mergeBadgeTitle(item) {
  const parts = []
  if (item.chunkIndex !== undefined) {
    parts.push(t('protocol.chunkOf', { index: item.chunkIndex + 1, total: item.totalChunks }))
  } else {
    parts.push(item.phase === 0 ? t('protocol.proposalVote') : t('protocol.phaseLabel', { phase: item.phase }))
  }
  if (item.text) parts.push(item.text)
  const phase = chunkPhase(item)
  if (phase) {
    parts.push(phase.phase === 'ended'
      ? t('vote.endedPhase')
      : `${t('vote.votingPhase')} · ${t('vote.endsAt')}: ${formatRemaining(phase.remaining)}`)
  }
  const counts = chunkCountsLabel(item.poster)
  if (counts !== '—') parts.push(counts)
  const own = chunkMyVote(item.poster)
  if (own) parts.push(t('protocol.yourVote', { variant: own }))
  return parts.filter(Boolean).join('\n')
}

// Badge colors: selected, own vote, ended, or open (#350).
function mergeBadgeClass(msg, item) {
  const selected = selectedChunk(msg)?.poster.message_id === item.poster.message_id
  if (selected) {
    return 'relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-blue-600 bg-blue-600 text-xs font-semibold text-white transition-colors'
  }
  if (chunkMyVote(item.poster)) {
    return 'relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-green-500 bg-green-50 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300'
  }
  const phase = chunkPhase(item)
  if (phase?.phase === 'ended') {
    return 'relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-xs font-semibold text-gray-400 transition-colors dark:border-gray-600 dark:bg-gray-700 dark:text-gray-500'
  }
  return 'relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-700 transition-colors hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
}

// Phase state of a chunk poster (end time / status).
function chunkPhase(chunk) {
  return chunk ? getPhaseData(chunk.poster) : null
}

// Own vote on a chunk (variant name), empty when not voted.
function chunkMyVote(poster) {
  return myVoteVariant(poster)
}

// Compact vote tally of a chunk, e.g. "accept: 2, reject: 1".
function chunkCountsLabel(poster) {
  const counts = getVoteCounts(poster)
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([variant, count]) => `${variant}: ${count}`)
  return parts.length > 0 ? parts.join(', ') : '—'
}

// Get individual vote messages for a poster
function getVoteVoters(posterMsg) {
  try {
    const posterData = JSON.parse(posterMsg.data)
    return countVoteVariants(posterData.message, allEchoMessages.value).voters
  } catch { return [] }
}

function getAllVotesSorted(posterMsg) {
  return [...getVoteVoters(posterMsg)].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

function getNewVotes(posterMsg) {
  const voters = getVoteVoters(posterMsg)
  return voters.filter(vm => !seenVoteIds.value.has(vm.message_id))
}

function getVoterInitials(msg) {
  try {
    const data = JSON.parse(msg.data)
    const name = (data.sender_name || namesStore.currentName(msg.sender_address) || msg.sender_address || '').trim()
    if (!name) return '?'
    if (name.startsWith(':')) return name.slice(0, 2)
    return name.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2)
  } catch { return '?' }
}

function getVoterLabel(vm) {
  try {
    const data = JSON.parse(vm.data)
    const name = data.sender_name || namesStore.currentName(vm.sender_address) || vm.sender_address || ''
    const variant = data.vote || ''
    return `${name}: ${variant}`
  } catch {
    return vm.sender_address || ''
  }
}

function openVoteDetail(vm) {
  try {
    const data = JSON.parse(vm.data)
    voteDetail.value = {
      show: true,
      voterName: data.sender_name || '',
      voterAddress: vm.sender_address || '',
      voteVariant: data.vote || '',
      timestamp: vm.timestamp || 0,
    }
  } catch {
    voteDetail.value = {
      show: true,
      voterName: '',
      voterAddress: vm.sender_address || '',
      voteVariant: '',
      timestamp: vm.timestamp || 0,
    }
  }
}

function hasPosterResult(msg) {
  try {
    const data = JSON.parse(msg.data)
    return !!data.result
  } catch { return false }
}

/** Parsed message data (or empty object). */
function msgData(msg) {
  try { return JSON.parse(msg.data) || {} } catch { return {} }
}

/** Election result message (proto=election, data.type=result). */
function isElectionResult(msg) {
  return msg && msg.type === 'election' && msgData(msg).type === 'result'
}

function getQuestionText(msg) {
  try {
    const data = JSON.parse(msg.data)
    return data.message || ''
  } catch { return '' }
}

function getCollapsedInfo(msg) {
  if (isElectionResult(msg)) {
    const d = msgData(msg)
    if (d.elected_addresses?.length) return `🏆 ${d.elected_addresses.join(', ')}`
    return d.result === 'success' ? t('election.resultElected') : t('election.resultFailed')
  }
  const phaseData = getPhaseData(msg)
  if (!phaseData) return ''

  if (msg._changePolicy) {
    // Sum the votes of all chunks: accept/reject across the whole proposal.
    const totals = {}
    for (const chunk of msg._chunks) {
      for (const [variant, count] of Object.entries(getVoteCounts(chunk.poster))) {
        totals[variant] = (totals[variant] || 0) + count
      }
    }
    const entries = Object.entries(totals)
    const chunks = `${msg._chunks.length} ${t('protocol.chunkOf', { index: 1, total: msg._chunks.length }).split(' ')[0]}`
    if (entries.length === 0) return `${chunks} —`
    return `${chunks}: ` + entries.map(([opt, cnt]) => `${opt} - ${cnt}`).join(', ')
  }

  if (msg.type === 'vote') {
    const counts = getVoteCounts(msg)
    const entries = Object.entries(counts)
    if (entries.length === 0) return `V —`
    return `V ` + entries.map(([opt, cnt]) => `${opt} - ${cnt}`).join(', ')
  }

  if (msg.type === 'election') {
    if (phaseData.phase === 'collection') {
      const addrVotes = phaseData.candidates.map(addr =>
        `${addr}:${phaseData.candidateVotes[addr] || 0}`
      ).join(', ')
      return `C ${addrVotes} (min ${phaseData.minCandidates})`
    }
    if (phaseData.phase === 'voting') {
      const entries = Object.entries(phaseData.candidateVotes)
        .sort(([, a], [, b]) => b - a)
      if (entries.length === 0) return `V —`
      return `V ` + entries.map(([addr, cnt]) => `${addr} - ${cnt}`).join(', ')
    }
  }

  return phaseData.phase || ''
}

function getProgressPercent(msg) {
  const phaseData = getPhaseData(msg)
  if (!phaseData) return 0
  const now = Math.floor(Date.now() / 1000)

  if (msg.type === 'vote') {
    const posterTs = msg.timestamp || 0
    const total = phaseData.votingEnd - posterTs
    if (total <= 0) return 100
    const elapsed = now - posterTs
    return Math.min(100, Math.max(0, (elapsed / total) * 100))
  }

  if (msg.type === 'election') {
    if (phaseData.phase === 'collection') {
      const posterTs = msg.timestamp || 0
      const total = phaseData.collectionEnd - posterTs
      if (total <= 0) return 100
      const elapsed = now - posterTs
      return Math.min(100, Math.max(0, (elapsed / total) * 100))
    }
    if (phaseData.phase === 'voting') {
      const total = phaseData.votingEnd - phaseData.collectionEnd
      if (total <= 0) return 100
      const elapsed = now - phaseData.collectionEnd
      return Math.min(100, Math.max(0, (elapsed / total) * 100))
    }
  }

  return 0
}

function getProgressColor(msg) {
  const pct = getProgressPercent(msg)
  if (pct < 50) return '#22c55e'
  if (pct < 80) return '#eab308'
  return '#ef4444'
}

function hideMessage(msg) {
  protocolStore.hideProtocol(msg.message_id)
}

// Hide any card from Active Protocols (#356). Grouped cards need all their
// source posters marked, otherwise the group would be rebuilt from the
// remaining chunks/posters.
function hideActive(msg) {
  if (!msg) return
  if (msg._merge) {
    hideMergeCard(msg)
    return
  }
  if (msg._changePolicy) {
    for (const chunk of msg._chunks || []) hideMessage(chunk.poster)
    hideMessage(msg)
    return
  }
  if (msg._merged) {
    const echoName = msg.echo_name || props.echoName
    for (const poster of protocolStore.getByEcho(echoName)) {
      if (poster.type === 'election' && msgData(poster).type === 'poster') hideMessage(poster)
    }
    return
  }
  hideMessage(msg)
}

// Hide the whole merge session card: its id is synthetic because the group is
// built from several messages (#348).
function hideMergeCard(msg) {
  if (!msg) return
  protocolStore.hideProtocol(msg._hideId || msg.message_id)
}

onMounted(async () => {
  // Protocol store is already initialized at app boot.
  // Do NOT call loadFromStorage here — it wipes in-memory data on error.
  loading.value = false
  // Ensure policy params are available for phase computation
  await ensurePolicyParams()
})

watch(() => props.echoName, () => {
  // Protocol store is reactive; no manual reload needed
})

async function refreshActiveProtocols() {
  refreshing.value = true
  error.value = null
  try {
    // Fetch new messages from server to update protocol store
    await fetchMessages({})
    console.log('Active protocols refreshed')
  } catch (err) {
    error.value = err.message
    console.error('Failed to refresh active protocols:', err)
  } finally {
    refreshing.value = false
  }
}

function getSubtype(msg) {
  try {
    const data = JSON.parse(msg.data)
    return data.type || 'N/A'
  } catch {
    return 'N/A'
  }
}

function getDetailedStatus(msg) {
  try {
    const data = JSON.parse(msg.data)
    if (msg.type === 'refill' && data.type === 'request') {
      return 'Waiting for response'
    } else if (msg.type === 'election') {
      if (data.result) return data.result === 'success' ? t('election.resultElected') : t('election.resultFailed')
      if (data.type === 'result') return t('election.endedPhase')
      const state = getElectionState(msg, allEchoMessages.value, protocolStore.electionPhases?.[msg.echo_name] || null)
      if (!state) return data.status || 'In progress'
      if (state.phase === 'collection') return t('election.collectionPhase')
      if (state.phase === 'voting') return t('election.votingPhase')
      if (state.phase === 'ended') return t('election.endedPhase')
      return data.status || 'In progress'
    } else if (msg.type === 'vote') {
      if (data.result) return 'Result available'
      const state = getVoteState(msg)
      if (!state) return data.result ? 'Result available' : 'Voting open'
      if (state.phase === 'voting') {
        if (state.remaining > 0) return `${t('vote.votingPhase')} (${formatRemaining(state.remaining)})`
        return t('vote.votingPhase')
      }
      return t('vote.endedPhase')
    } else if (msg.type === 'excommunicate') {
      const state = getExcommunicateState(msg, allEchoMessages.value)
      if (!state) return 'Active'
      if (state.phase === 'voting') return t('excommunicate.votingPhase')
      if (state.phase === 'ended') return t('excommunicate.endedPhase')
      if (state.phase === 'read_only') return t('excommunicate.readOnlyPhase')
      if (state.phase === 'permanent') return t('excommunicate.permanentPhase')
      if (state.phase === 'removed') return t('excommunicate.removedPhase')
      return 'Active'
    } else if (['merge', 'conflict', 'recover'].includes(msg.type)) {
      return data.resolved ? 'Resolved' : 'Pending resolution'
    } else {
      return 'Active'
    }
  } catch {
    return 'Active'
  }
}

function getProtocolDetails(msg) {
  try {
    const data = JSON.parse(msg.data)
    const details = []
    
    if (msg.type === 'refill' && data.refill) {
      details.push(`Requested messages before: ${new Date(data.refill.before).toLocaleDateString()}`)
      const count = countLocalMessagesBefore(data.refill.echo || props.echoName, data.refill.before)
      details.push(`You have ${count} messages to share`)
      const expiresAt = (msg.timestamp + 7 * 86400) * 1000
      const diffMs = expiresAt - Date.now()
      if (diffMs > 0) {
        const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
        const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
        details.push(`Expires in ${days > 0 ? `${days}d ${hours}h` : `${hours}h`}`)
      }
    } else if (msg.type === 'election') {
      if (data.type === 'result') {
        if (Array.isArray(data.elected_addresses) && data.elected_addresses.length > 0) {
          details.push(`${t('election.resultElected')}: ${data.elected_addresses.join(', ')}`)
        } else if (data.result === 'fail') {
          details.push(t('election.resultFailed'))
        }
        if (data.reason) details.push(data.reason)
        if (Array.isArray(data.votes) && data.votes.length > 0) {
          details.push(`${t('election.voteDistribution')}:`)
          for (const v of data.votes) {
            details.push(`  ${v.candidate}: ${v.votes} ${t('election.votes')}`)
          }
        }
        return details.join('\n')
      }
      const state = getElectionState(msg, allEchoMessages.value, protocolStore.electionPhases?.[msg.echo_name] || null)
      if (state) {
        details.push(`${t('election.phase')}: ${state.phase}`)
        if (state.phase !== 'ended' && state.remaining > 0) {
          details.push(`${t('election.timeRemaining')}: ${formatRemaining(state.remaining)}`)
        }
        if (state.candidates.length > 0) {
          details.push(`${t('election.candidates')}: ${state.candidates.length}`)
          if (state.phase !== 'collection') {
            const topCandidates = Object.entries(state.candidateVotes)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
            for (const [addr, count] of topCandidates) {
              details.push(`  ${addr}: ${count} ${t('election.votes')}`)
            }
          }
        }
        if (state.phase !== 'collection') {
          details.push(`${t('election.totalVotes')}: ${state.totalVotes}`)
        }
        if (state.phase !== 'ended') {
          details.push(`${t('election.minRequired')}: ${state.minCandidates} ${t('election.candidatesLower')}`)
        }
      }
      if (data.candidates) details.push(`Candidates: ${data.candidates.length}`)
      if (data.description) details.push(`Description: ${data.description}`)
    } else if (msg.type === 'vote') {
      const state = getVoteState(msg)
      if (state) {
        if (state.phase === 'voting') {
          if (state.remaining > 0) details.push(`${t('vote.timeRemaining')}: ${formatRemaining(state.remaining)}`)
        } else {
          details.push(t('vote.votingEnded'))
        }
      }
      if (data.message) details.push(`Question: ${data.message}`)
      if (data.variants) details.push(`Options: ${data.variants.join(', ')}`)
      if (data.protocol === 'appeal') {
        const pd = data.protocol_data || {}
        if (pd.moderator) details.push(`${t('appeal.moderator')}: ${pd.moderator}`)
        if (pd.target_address) details.push(`${t('appeal.target')}: ${pd.target_address}`)
        if (pd.punishment_echo) details.push(`${t('appeal.echo')}: ${pd.punishment_echo}`)
        if (pd.severity) details.push(`${t('appeal.severity')}: ${pd.severity}`)
      }
    } else if (msg.type === 'excommunicate') {
      const state = getExcommunicateState(msg, allEchoMessages.value)
      if (state) {
        details.push(`${t('excommunicate.target')}: ${state.target}`)
        if (state.variant) details.push(`Decision: ${state.variant}`)
        if (state.phase !== 'ended' && state.phase !== 'permanent' && state.phase !== 'removed' && state.remaining > 0) {
          details.push(`${t('excommunicate.timeRemaining')}: ${formatRemaining(state.remaining)}`)
        }
      }
      if (data.variants) details.push(`Options: ${data.variants.join(', ')}`)
    } else if (['merge', 'conflict', 'recover'].includes(msg.type)) {
      if (data.parties) details.push(`Parties: ${data.parties.join(', ')}`)
      if (data.issue) details.push(`Issue: ${data.issue}`)
    }
    
    if (data.message && !msg._merged && msg.type !== 'vote' && msg.type !== 'change_policy') details.push(`Message: ${data.message}`)
    
    return details.join('\n')
  } catch {
    return null
  }
}

function getProtocolColor(type) {
  const colors = {
    refill: 'border-l-4 border-l-purple-500',
    election: 'border-l-4 border-l-blue-500',
    vote: 'border-l-4 border-l-green-500',
    merge: 'border-l-4 border-l-yellow-500',
    conflict: 'border-l-4 border-l-red-500',
    recover: 'border-l-4 border-l-indigo-500',
    change_policy: 'border-l-4 border-l-pink-500',
    remove_echo: 'border-l-4 border-l-orange-500',
    excommunicate: 'border-l-4 border-l-gray-500'
  }
  return colors[type] || 'border-l-4 border-l-gray-300'
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  } else {
    return date.toLocaleDateString()
  }
}

function showActionButton(msg) {
  // Show action button for certain protocol types where user can participate
  try {
    const data = JSON.parse(msg.data)
    if (msg.type === 'vote' && !data.result) {
      return true // User can vote
    }
    if (msg.type === 'refill' && data.type === 'request') {
      const count = countLocalMessagesBefore(data.refill.echo || props.echoName, data.refill.before)
      return count > 0
    }
  } catch {
    return false
  }
  return false
}

function getActionLabel(msg) {
  try {
    const data = JSON.parse(msg.data)
    if (msg.type === 'vote' && !data.result) {
      return 'Vote'
    }
    if (msg.type === 'refill' && data.type === 'request') {
      return 'Respond'
    }
  } catch {
    return 'Action'
  }
  return 'Action'
}

function isOwnCancelablePoster(msg) {
  try {
    const data = JSON.parse(msg.data)
    const userAddr = identityStore.user?.address
    if (!userAddr) return false

    // Special protocols: proposer identified by from or node1 field
    if (msg.type === 'change_policy' || msg.type === 'refill' || msg.type === 'merge' || msg.type === 'conflict' || msg.type === 'recover') {
      const proposer = data.from || data.node1 || msg.sender_address
      if (proposer !== userAddr) return false
      return data.result === undefined || data.result === null
    }
    if (data.type !== 'poster') return false
    if (data.from !== userAddr) return false
    if (msg.type === 'vote' || msg.type === 'election' || msg.type === 'excommunicate') {
      const state = getPhaseData(msg)
      if (!state) return false
      if (state.phase === 'ended' || state.phase === 'permanent' || state.phase === 'removed') return false
      return true
    }
  } catch {}
  return false
}

async function cancelRequest(msg) {
  try {
    const data = JSON.parse(msg.data)
    const cancelMsg = {
      echo: props.echoName,
      proto: msg.type,
      type: 'cancel',
      from: identityStore.user.address,
      message: data.message,
      original_message_id: msg.message_id,
      date: new Date().toISOString()
    }
    const { createSignedMessage } = await import('../services/message')
    const signed = await createSignedMessage(msg.type, cancelMsg, { echo_name: props.echoName })

    const { useOutbox: outboxImport } = await import('../composables/useOutbox')
    const outbox = outboxImport()
    outbox.add({
      type: msg.type,
      echoName: props.echoName,
      message: signed,
      label: `Cancel ${msg.type}: ${(data.message || '').slice(0, 40)}`,
      detail: 'Cancel request',
      dedupKey: `cancel_${msg.message_id}`,
    })

    // Optimistic: mark as cancelled in the store
    protocolStore.cancelProtocol(msg.message_id)

    // Refresh protocol messages to show changes
    await fetchMessages({})
  } catch (err) {
    console.error('Failed to cancel request:', err)
    alert('Failed to cancel request: ' + err.message)
  }
}

function voteData(msg) {
  try {
    const data = JSON.parse(msg.data)
    return data
  } catch {
    return null
  }
}

function hasVoted(msg, variant) {
  return myVoteVariant(msg) === variant
}

// Pending election candidates (vote posters use the shared vote composable).
const pendingElectionVotes = ref({}) // electionKey -> candidate_address

function hasAnyVote(msg) {
  return !!myVoteVariant(msg)
}

function selectVoteVariant(msg, variant) {
  selectVoteVariantShared(props.echoName, msg, variant)
}

// Pending variant, hidden once the node confirmed the same vote.
function pendingVariantOf(msg) {
  return pendingVariantShared(props.echoName, msg, myVoteVariant(msg))
}

function isPendingVote(msg, variant) {
  return pendingVariantOf(msg) === variant
}

function hasPendingVote(msg) {
  return !!pendingVariantOf(msg)
}


async function retractVote(msg) {
  await retractVoteShared(props.echoName, msg)
}

async function retractElectionVote(msg) {
  try {
    const voteMessage = {
      echo: props.echoName,
      proto: 'election',
      type: 'vote',
      from: identityStore.user?.address,
      to: '',
      message: 'Retract vote',
      date: new Date().toISOString()
    }
    const { createSignedMessage } = await import('../services/message')
    const { apiService } = await import('../services/api')
    const signedMessage = await createSignedMessage('election', voteMessage, { echo_name: props.echoName })
    useOutbox().add({ type: 'election', echoName: props.echoName, message: signedMessage, label: 'Retract election vote', detail: '', dedupKey: `election_${props.echoName}_${msg.message_id}` })
  } catch (err) {
    console.error('Failed to retract election vote:', err)
    alert('Failed to retract election vote: ' + err.message)
  }
}

function hasElectionVoted(msg) {
  return !!myElectionVote.value
}

function electionKey(msg) {
  if (msg._merged) return `election_${props.echoName}`
  return msg.message_id
}

function hasElectionVotedFor(msg, candidateAddr) {
  return myElectionVote.value === candidateAddr
}

// Pending candidate, hidden once the node confirmed the same vote.
function pendingElectionVariant(msg) {
  const pending = pendingElectionVotes.value[electionKey(msg)]
  if (!pending) return ''
  return pending === myElectionVote.value ? '' : pending
}

function isPendingElectionVote(msg, candidateAddr) {
  return pendingElectionVariant(msg) === candidateAddr
}

function hasPendingElectionVote(msg) {
  return !!pendingElectionVariant(msg)
}

function hasAnyElectionVote(msg) {
  return !!myElectionVote.value
}

function getElectionVoteCount(msg) {
  try {
    const posterData = JSON.parse(msg.data)
    const candidateAddr = posterData.from || msg.sender_address
    const votes = allEchoMessages.value.filter(m => {
      if (m.type !== 'election') return false
      try {
        const d = JSON.parse(m.data)
        return d.type === 'vote' && d.to === candidateAddr
      } catch { return false }
    })
    return votes.length
  } catch { return 0 }
}

// Election poster modal: read the candidate's election message as markdown.
const posterModal = ref({ show: false, address: '', name: '', message: '', canVote: false, key: '' })

function openElectionPoster(msg, candidateAddr) {
  const poster = allEchoMessages.value.find(m => {
    if (m.type !== 'election') return false
    try {
      const d = JSON.parse(m.data)
      return d.type === 'poster' && (d.from || m.sender_address) === candidateAddr
    } catch { return false }
  })
  let message = ''
  let name = ''
  if (poster) {
    try {
      const d = JSON.parse(poster.data)
      message = d.message || ''
      name = d.sender_name || ''
    } catch { /* ignore */ }
  }
  const phaseData = getPhaseData(msg)
  posterModal.value = {
    show: true,
    address: candidateAddr,
    name,
    message,
    canVote: phaseData?.phase === 'voting',
    key: electionKey(msg),
  }
}

function closeElectionPoster() {
  posterModal.value = { ...posterModal.value, show: false }
}

/** Select the candidate from the poster modal (the "Vote" button sends it). */
function voteFromPoster() {
  pendingElectionVotes.value[posterModal.value.key] = posterModal.value.address
  closeElectionPoster()
}

async function castElectionVote(msg) {
  const candidateAddr = pendingElectionVotes.value[electionKey(msg)]
  if (!candidateAddr) return
  try {
    const voteMessage = {
      echo: props.echoName,
      proto: 'election',
      type: 'vote',
      from: identityStore.user?.address,
      to: candidateAddr,
      message: `Vote for ${candidateAddr}`,
      date: new Date().toISOString()
    }
    const { createSignedMessage } = await import('../services/message')
    const signedMessage = await createSignedMessage('election', voteMessage, {
      echo_name: props.echoName
    })
    useOutbox().add({
      type: 'election', echoName: props.echoName, message: signedMessage,
      label: `Vote for ${candidateAddr}`, detail: '',
      dedupKey: `election_${props.echoName}_${electionKey(msg)}`,
    })
  } catch (err) {
    console.error('Failed to cast election vote:', err)
    alert('Failed to cast election vote: ' + err.message)
  }
}

async function castVote(msg) {
  await castVoteShared(props.echoName, msg)
}

function countLocalMessagesBefore(echoName, beforeDate) {
  return countRefillableMessages(echoStore.messages[echoName] || [], beforeDate)
}

function getLocalMessagesBefore(echoName, beforeDate, limit = 100) {
  return refillableMessagesFor(echoStore.messages[echoName] || [], beforeDate)
    .slice(-limit)
    .map(m => ({
      type: m.type || 'echomail',
      sender_address: m.sender_address,
      timestamp: m.timestamp,
      message_id: m.message_id,
      data: m.data,
      jws: m.jws
    }))
}

async function handleProtocolAction(msg) {
  if (msg.type === 'vote') return
  if (msg.type === 'refill') {
    await respondToRefill(msg)
    return
  }
  alert(`Action for ${msg.type} protocol would be implemented here`)
}

async function respondToRefill(msg) {
  try {
    const data = JSON.parse(msg.data)
    if (!data.refill || data.type !== 'request') return

    const echoName = data.refill.echo || props.echoName
    const messages = refillableMessagesFor(echoStore.messages[echoName] || [], data.refill.before)
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

function viewRaw(msg) {
  if (msg._merged) {
    const posters = getElectionPosterList()
    rawMessage.value = posters
    rawTitle.value = t('protocol.electionPostersTitle', { n: posters.length })
  } else {
    rawMessage.value = msg
    rawTitle.value = t('protocol.rawTitle')
  }
  showRawModal.value = true
}
</script>

<style scoped>
.active-protocols {
  padding: 1rem;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
