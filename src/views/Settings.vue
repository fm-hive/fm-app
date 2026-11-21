<template>
  <div class="settings container mx-auto px-2 py-2">
    <div class="space-y-8">
      <!-- Current Identity -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">{{ t('settings.currentIdentity') }}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-if="identity.user?.address">
            <p class="text-sm text-gray-600">{{ t('settings.address') }}</p>
            <p class="font-mono text-sm break-all">{{ identity.user.address }}</p>
          </div>
          <div v-if="identity.isModerator">
            <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
              {{ t('settings.moderator') }}
            </span>
          </div>
          <div v-if="identity.isAdmin" class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
              {{ t('settings.administrator') }}
            </span>
            <router-link to="/admin" class="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700">
              {{ t('app.admin') }}
            </router-link>
          </div>
          <div v-if="identity.passwordRequired">
            <span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
              {{ t('settings.passwordRequired') }}
            </span>
          </div>
          <div class="pt-3 border-t border-gray-200 dark:border-gray-600 md:col-span-2">
            <router-link to="/policy" class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400">
              {{ t('settings.viewNetworkPolicy') }} →
            </router-link>
          </div>
        </div>
      </div>

      <!-- Profile Section -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">{{ t('settings.profile') }}</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('settings.profileDisplayName') }}</label>
            <input
              v-model="profile.displayName"
              type="text"
              maxlength="64"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              :placeholder="t('settings.profileDisplayNamePlaceholder')"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">{{ t('settings.profileTagline') }}</label>
            <textarea
              v-model="profile.tagline"
              rows="2"
              maxlength="200"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              :placeholder="t('settings.profileTaglinePlaceholder')"
            ></textarea>
            <p class="text-xs text-gray-500 mt-1">{{ t('settings.profileTaglineHint') }}</p>
          </div>
          <div>
            <label class="flex items-center">
              <input type="checkbox" v-model="profile.showTearline" class="rounded text-blue-600 mr-2">
              <span class="text-sm text-gray-700">{{ t('settings.profileShowTearline') }}</span>
            </label>
            <p class="text-xs text-gray-500 ml-6 mt-1">{{ t('settings.profileShowTearlineHint') }}</p>
          </div>
          <div class="flex justify-end">
            <button
              @click="saveProfile"
              :disabled="profileSaving"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {{ profileSaving ? t('settings.saving') : t('settings.profileSave') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Node Settings Section -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">{{ t('settings.nodeSettings') }}</h2>
        <!-- The API endpoint is compiled in (deployment prefix, #337): there is
             nothing to configure here, only the invite/voucher helpers. -->
        <div class="space-y-4">
          <div class="flex justify-end space-x-2">
            <button
              v-if="showVoucherButton"
              @click="sendVoucher"
              :disabled="voucherLoading"
              class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {{ voucherLoading ? t('invite.sending') : t('invite.sendVoucher') }}
            </button>
            <button v-if="identity.hasKeys" @click="showRecoveryDialog = true"
              class="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-sm">
              {{ t('recovery.title') }}
            </button>
            <button v-if="recoveryNode" @click="leaveRecoveryNode"
              class="px-3 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 text-sm">
              {{ t('recovery.leave') }}
            </button>
            <QRDisplay :url="inviteUrl" />
          </div>

          <!-- Admin-only reusable time voucher (#301) -->
          <div v-if="showTimeVoucherButton" class="border rounded-md p-3 space-y-2 dark:border-gray-600">
            <div class="text-sm font-medium dark:text-gray-200">{{ t('invite.timeVoucherTitle') }}</div>
            <p class="text-xs text-gray-500">{{ t('invite.timeVoucherHint') }}</p>
            <div class="flex items-center gap-2 flex-wrap">
              <label class="text-sm text-gray-600 dark:text-gray-300">{{ t('invite.validity') }}</label>
              <select v-model="timeVoucherTtl"
                class="p-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm">
                <option value="1h">{{ t('invite.duration1h') }}</option>
                <option value="24h">{{ t('invite.duration24h') }}</option>
                <option value="7d">{{ t('invite.duration7d') }}</option>
                <option value="30d">{{ t('invite.duration30d') }}</option>
                <option value="custom">{{ t('invite.custom') }}</option>
              </select>
              <input v-if="timeVoucherTtl === 'custom'" v-model="timeVoucherCustomTtl"
                :placeholder="t('invite.ttlPlaceholder')"
                class="w-28 p-1.5 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 text-sm" />
              <button @click="sendTimeVoucher" :disabled="voucherLoading"
                class="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm">
                {{ voucherLoading ? t('invite.sending') : t('invite.createTimeVoucher') }}
              </button>
            </div>
          </div>

          <p v-if="voucherCode" class="text-xs text-gray-500">
            {{ voucherReusable ? t('invite.voucherUntil', { date: voucherExpiryLabel }) : t('invite.oneTime') }}
          </p>

          <!-- Voucher list and revocation (#303) -->
          <div v-if="showVoucherList" class="border rounded-md p-3 space-y-2 dark:border-gray-600">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium dark:text-gray-200">
                {{ identity.isAdmin ? t('invite.allVouchers') : t('invite.myVouchers') }}
              </div>
              <button @click="loadVouchers" :disabled="vouchersLoading"
                class="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50">
                {{ vouchersLoading ? t('invite.loading') : t('invite.refresh') }}
              </button>
            </div>
            <div v-if="vouchers.length === 0" class="text-xs text-gray-500">{{ t('invite.noVouchers') }}</div>
            <div v-else class="max-h-56 overflow-y-auto space-y-1">
              <div v-for="voucher in vouchers" :key="voucher.code"
                class="flex items-center gap-2 border-b last:border-b-0 dark:border-gray-700 py-1.5 text-xs">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <code class="font-mono truncate dark:text-gray-200">{{ voucher.code }}</code>
                    <span class="px-1.5 py-0.5 rounded text-white"
                      :class="voucherStatusClass(voucher.status)">{{ voucherStatusLabel(voucher.status) }}</span>
                  </div>
                  <div class="text-gray-500 mt-0.5">
                    {{ voucherTypeLabel(voucher.type) }} · {{ t('invite.expires') }} {{ formatVoucherDate(voucher.expires_at) }}
                    <span v-if="identity.isAdmin && voucher.created_by"> · {{ voucher.created_by }}</span>
                  </div>
                </div>
                <button v-if="voucher.status === 'active'" @click="revokeVoucher(voucher.code)"
                  :disabled="revokingCode === voucher.code"
                  class="px-2 py-1 text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50 shrink-0">
                  {{ revokingCode === voucher.code ? t('invite.revoking') : t('invite.revoke') }}
                </button>
              </div>
            </div>
          </div>

          <p class="text-sm text-gray-500 mt-1">{{ t('invite.qrHint') }}</p>
        </div>
      </div>

      <!-- Security Section -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-bold mb-4">{{ t('settings.security') }}</h2>
        <div class="space-y-6">
          <!-- Key Status -->
          <div>
            <h3 class="text-lg font-medium mb-2">{{ t('settings.keyStatus') }}</h3>
            <div class="space-y-2">
              <div class="flex items-center">
                <span class="text-gray-600 mr-2">{{ t('settings.keysLoaded') }}</span>
                <span :class="['px-2 py-1 rounded text-xs font-medium', 
                  identity.hasKeys ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800']">
                  {{ identity.hasKeys ? t('settings.yes') : t('settings.no') }}
                </span>
              </div>
              <div class="flex items-center">
                <span class="text-gray-600 mr-2">{{ t('settings.encryption') }}</span>
                <span :class="['px-2 py-1 rounded text-xs font-medium', 
                  identity.isKeyEncrypted ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800']">
                  {{ identity.isKeyEncrypted ? t('settings.passwordProtected') : t('settings.unencrypted') }}
                </span>
              </div>
              <div v-if="identity.hasKeys" class="text-sm text-gray-600">
                {{ t('settings.publicKey') }} <code class="font-mono text-xs">{{ crypto.toHex(identity.publicKey).slice(0, 32) }}...</code>
              </div>
            </div>
          </div>

          <!-- Password Management -->
          <div>
            <h3 class="text-lg font-medium mb-2">{{ t('settings.passwordProtection') }}</h3>
            <div class="space-y-4">
              <div v-if="!identity.isKeyEncrypted">
                <p class="text-sm text-gray-600 mb-2">
                  {{ t('settings.privateKeyUnprotected') }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <input
                    v-model="newPassword"
                    type="password"
                    placeholder="New password"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    v-model="confirmPassword"
                    type="password"
                    placeholder="Confirm password"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    @click="setPassword"
                    :disabled="!newPassword || newPassword !== confirmPassword || securityLoading"
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {{ t('settings.setPassword') }}
                  </button>
                </div>
                <p v-if="newPassword && newPassword !== confirmPassword" class="text-red-500 text-sm mt-1">

                      {{ t('settings.passwordsDoNotMatch') }}
                </p>
              </div>
              <div v-else>
                <p class="text-sm text-gray-600 mb-2">
                  {{ t('settings.privateKeyProtected') }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <button
                    @click="changePassword"
                    :disabled="securityLoading"
                    class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  >
                        {{ t('settings.changePassword') }}
                  </button>
                  <button
                    @click="removePassword"
                    :disabled="securityLoading"
                    class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    {{ t('settings.removePassword') }}
                  </button>
                </div>
              </div>
            </div>
          </div>

              <!-- Settings Encryption -->
              <div class="border border-gray-300 rounded-md p-4 bg-gray-50">
                <h4 class="font-medium text-gray-800 mb-2">{{ t('settings.settingsEncryption') }}</h4>
                <div class="space-y-4">
                  <div>
                    <div class="flex items-center mb-2">
                      <span class="text-gray-600 mr-2">{{ t('settings.currentStatus') }}</span>
                      <span :class="['px-2 py-1 rounded text-xs font-medium', 
                        settings.isEncrypted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800']">
                        {{ settings.isEncrypted ? t('settings.encrypted') : t('settings.unencrypted') }}
                      </span>
                    </div>
                    <p class="text-sm text-gray-600 mb-3">
                      {{ t('settings.settingsEncryptionDesc') }}
                    </p>
                  </div>

                  <!-- Unlock Encrypted Settings -->
                  <div v-if="settings.needsPassword">
                    <h5 class="font-medium mb-2">{{ t('settings.unlockSettings') }}</h5>
                    <p class="text-sm text-gray-600 mb-2">
                      {{ t('settings.unlockSettingsDesc') }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <input
                        v-model="unlockPassword"
                        type="password"
                        :placeholder="t('settings.enterPassword')"
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        @click="unlockSettings"
                        :disabled="!unlockPassword || unlocking"
                        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {{ unlocking ? t('settings.unlocking') : t('settings.unlockSettings') }}
                      </button>
                    </div>
                    <p v-if="settingsImportError" class="text-red-500 text-sm mt-1">
                      {{ settingsImportError }}
                    </p>
                  </div>

                  <!-- Password Management -->
                  <div v-if="!settings.isEncrypted">
                    <h5 class="font-medium mb-2">{{ t('settings.addPasswordProtection') }}</h5>
                    <div class="flex flex-wrap gap-2">
                      <input
                        v-model="settingsPassword"
                        type="password"
                    :placeholder="t('settings.newPassword')"
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        v-model="settingsConfirmPassword"
                        type="password"
                    :placeholder="t('settings.confirmPassword')"
                        class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        @click="setSettingsPassword"
                        :disabled="!settingsPassword || settingsPassword !== settingsConfirmPassword || settingsLoading"
                        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {{ t('settings.encryptSettings') }}
                      </button>
                    </div>
                    <p v-if="settingsPassword && settingsPassword !== settingsConfirmPassword" class="text-red-500 text-sm mt-1">
                  {{ t('settings.passwordsDoNotMatch') }}
                    </p>
                  </div>
                  <div v-else>
                    <h5 class="font-medium mb-2">{{ t('settings.passwordManagement') }}</h5>
                    <p class="text-sm text-gray-600 mb-2">
                      {{ t('settings.settingsEncryptedDesc') }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <button
                        @click="changeSettingsPassword"
                        :disabled="settingsLoading"
                        class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                    {{ t('settings.changePassword') }}
                      </button>
                      <button
                        @click="removeSettingsPassword"
                        :disabled="settingsLoading"
                        class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      >
                        {{ t('settings.removeEncryption') }}
                      </button>
                    </div>
                  </div>

                  <!-- Export/Import -->
                  <div>
                    <h5 class="font-medium mb-2">{{ t('settings.exportImportSettings') }}</h5>
                    <p class="text-sm text-gray-600 mb-2">
                      {{ t('settings.exportImportSettingsDesc') }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <button
                        @click="showExportDialog = true"
                        :disabled="exporting"
                        class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                      >
                        <span v-if="exporting">⟳</span>
                        {{ t('export.title') }}
                      </button>
                      <button
                        @click="showImportDialog = true"
                        class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {{ t('import.title') }}
                      </button>
                    </div>
                    <ExportDialog
                      :visible="showExportDialog"
                      @close="showExportDialog = false"
                      @export="onExportOptions"
                    />
                    <ImportDialog
                      :visible="showImportDialog"
                      @close="showImportDialog = false"
                    />
                  </div>

              <!-- Public Key Requests -->
              <div class="border border-blue-300 rounded-md p-4 bg-blue-50 mb-6">
                <h4 class="font-medium text-blue-800 mb-3">{{ t('settings.publicKeyRequests') }}</h4>
                <div class="space-y-4">
                  <div class="space-y-3">
                    <label class="flex items-center">
                      <input type="checkbox" v-model="settings.privacy.allowPubkeyRequests" class="rounded text-blue-600 mr-2">
                      <span class="text-sm text-gray-700">{{ t('settings.allowOthers') }}</span>
                    </label>
                    <p class="text-xs text-gray-600 ml-6">{{ t('settings.allowOthersDesc') }}</p>
                  </div>
                   <div class="space-y-3">
                     <label class="flex items-center">
                       <input type="checkbox" v-model="settings.privacy.autoRequestPubkeys" @change="savePrivacySetting" class="rounded text-blue-600 mr-2">
                       <span class="text-sm text-gray-700">{{ t('settings.autoRequest') }}</span>
                     </label>
                     <p class="text-xs text-gray-600 ml-6">{{ t('settings.autoRequestDesc') }}</p>
                   </div>
                   <div class="space-y-3">
                     <label class="flex items-center">
                       <input type="checkbox" v-model="settings.privacy.autoSendPubkey" @change="savePrivacySetting" class="rounded text-blue-600 mr-2">
                       <span class="text-sm text-gray-700">{{ t('settings.autoSendPubkey') }}</span>
                     </label>
                     <p class="text-xs text-gray-600 ml-6">{{ t('settings.autoSendPubkeyDesc') }}</p>
                     <label class="flex items-center mt-3">
                       <input type="checkbox" v-model="settings.privacy.autoFlushReactions" @change="savePrivacySetting" class="rounded text-blue-600 mr-2">
                       <span class="text-sm text-gray-700">{{ t('settings.autoFlushReactions') }}</span>
                     </label>
                     <p class="text-xs text-gray-600 ml-6">{{ t('settings.autoFlushReactionsDesc') }}</p>
                     <label class="flex items-center mt-3">
                       <input type="checkbox" v-model="settings.privacy.autoFlushEchomail" @change="savePrivacySetting" class="rounded text-blue-600 mr-2">
                       <span class="text-sm text-gray-700">{{ t('settings.autoFlushEchomail') }}</span>
                     </label>
                     <p class="text-xs text-gray-600 ml-6">{{ t('settings.autoFlushEchomailDesc') }}</p>
                     <label class="flex items-center mt-3">
                       <input type="checkbox" v-model="settings.privacy.autoFlushNetmail" @change="savePrivacySetting" class="rounded text-blue-600 mr-2">
                       <span class="text-sm text-gray-700">{{ t('settings.autoFlushNetmail') }}</span>
                     </label>
                     <p class="text-xs text-gray-600 ml-6">{{ t('settings.autoFlushNetmailDesc') }}</p>
                   </div>

                 </div>
              </div>

              <!-- Client synchronize (multi-device) -->
              <div class="border rounded-md p-4 mt-4">
                <h4 class="font-medium mb-3 dark:text-gray-200">{{ t('settings.clientSync') }}</h4>
                <label class="flex items-center">
                  <input type="checkbox" v-model="settings.privacy.encryptClientSync" @change="saveClientSyncSetting" class="rounded text-blue-600 mr-2">
                  <span class="text-sm text-gray-700 dark:text-gray-300">{{ t('settings.encryptClientSync') }}</span>
                </label>
                <p class="text-xs text-gray-600 dark:text-gray-400 ml-6">{{ t('settings.encryptClientSyncDesc') }}</p>

                <div class="border-t mt-3 pt-3 dark:border-gray-700">
                  <div class="flex items-center gap-2 flex-wrap">
                    <button
                      v-if="!clientRefillState.active"
                      @click="startRefill"
                      :disabled="!syncAvailable"
                      class="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm">
                      {{ t('settings.clientRefillStart') }}
                    </button>
                    <button
                      v-else
                      @click="cancelRefill"
                      class="px-3 py-1.5 border border-red-300 text-red-600 rounded-md hover:bg-red-50 text-sm">
                      {{ t('settings.clientRefillCancel') }}
                    </button>
                    <span v-if="!syncAvailable" class="text-xs text-gray-500 dark:text-gray-400">
                      {{ t('settings.clientRefillDisabled') }}
                    </span>
                  </div>
                  <p v-if="refillStatusText" class="text-xs mt-2"
                     :class="clientRefillState.status === 'error' ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'">
                    {{ refillStatusText }}
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ t('settings.clientRefillDesc') }}</p>
                </div>
              </div>

              <!-- Network rate limit override -->
              <div class="border rounded-md p-4 mt-4">
                <h4 class="font-medium mb-3 dark:text-gray-200">{{ t('settings.rateLimit') }}</h4>
                <label class="flex items-center">
                  <input type="checkbox" v-model="settings.privacy.allowSendingWithoutRateLimit" @change="saveRateLimitSetting" class="rounded text-blue-600 mr-2">
                  <span class="text-sm text-gray-700 dark:text-gray-300">{{ t('settings.allowSendingWithoutRateLimit') }}</span>
                </label>
                <p class="text-xs text-gray-600 dark:text-gray-400 ml-6">{{ t('settings.allowSendingWithoutRateLimitDesc') }}</p>
              </div>

              <!-- Trash Settings -->
              <div class="border rounded-md p-4 mt-4">
                <h4 class="font-medium mb-3 dark:text-gray-200">{{ t('settings.trash') }}</h4>
                <div class="flex items-center gap-2 flex-wrap">
                  <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('settings.trashRetentionDays') }}</label>
                  <input type="number" v-model.number="settings.privacy.trashRetentionDays" min="1" max="365"
                    class="w-24 px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('settings.trashRetentionDaysDesc') }}</span>
                  <div class="mt-3">
                    <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('settings.dashboardDepthDays') }}</label>
                    <input type="number" v-model.number="settings.application.dashboardDepthDays" min="1" max="365"
                      class="w-24 ml-2 px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
                    <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">{{ t('settings.dashboardDepthDaysDesc') }}</span>
                  </div>
                </div>
              </div>

              <!-- Emoji Settings -->
              <div class="border rounded-md p-4 mt-4">
                <h4 class="font-medium mb-3 dark:text-gray-200">{{ t('settings.emojiList') }}</h4>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('settings.emojiListDesc') }}</p>
                <div class="flex flex-wrap gap-1 mb-2">
                  <span v-for="(emoji, i) in emojiList" :key="i"
                    class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-lg"
                  >
                    {{ emoji }}
                    <button @click="removeEmoji(i)" class="text-xs text-red-500 hover:text-red-700 ml-1">&times;</button>
                  </span>
                </div>
                <div class="flex gap-2">
                  <input v-model="newEmoji" maxlength="4" placeholder="👍"
                    class="w-16 px-2 py-1 border rounded text-center text-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200" />
                  <button @click="addEmoji" :disabled="!newEmoji.trim()" class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50">{{ t('settings.add') }}</button>
                  <button @click="resetEmojis" class="px-3 py-1 border rounded text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">{{ t('settings.reset') }}</button>
                </div>
              </div>

              <!-- Danger Zone -->
              <div class="border border-red-300 rounded-md p-4 bg-red-50">
                <h4 class="font-medium text-red-800 mb-2">{{ t('settings.dangerZone') }}</h4>
                <p class="text-sm text-red-600 mb-3">
                  {{ t('settings.clearKeysWarning') }}
                </p>
                <button
                  @click="clearKeys"
                  :disabled="securityLoading"
                  class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {{ t('settings.clearStoredKeys') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <RecoveryDialog :visible="showRecoveryDialog" @close="showRecoveryDialog = false" />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentityStore } from '../stores/identity'
import { useSettingsStore } from '../stores/settings'
import { loadRecoveryNode, clearRecoveryNode } from '../utils/recoveryNode'
import * as crypto from '../services/crypto'
import { useNotificationsStore } from '../stores/notifications'
import * as db from '../services/db'
import * as blogStore from '../services/blogStore'
import { apiService } from '../services/api'
import { exportFileName } from '../utils/exportName'
import { fullExportAppUrl } from '../utils/fullExport'
import { DEFAULT_CUSTOM_EMOJIS, isDefaultEmojis } from '../utils/emojis'
import {
  apiUrlToAppUrl,
  buildInviteURL,
  nodeAddressFromUser,
  isVoucherDisabled,
  rememberVoucherDisabled,
  isVouchersDisabledError,
} from '../services/invite'
import {
  clientRefillState,
  startClientRefill,
  cancelClientRefill,
  loadClientRefillState,
} from '../services/clientRefill'
import { isSyncEnabled } from '../services/clientSync'
import QRDisplay from '../components/QRDisplay.vue'
import RecoveryDialog from '../components/RecoveryDialog.vue'
import ExportDialog from '../components/ExportDialog.vue'
import ImportDialog from '../components/ImportDialog.vue'

const identity = useIdentityStore()
const showRecoveryDialog = ref(false)
const recoveryNode = ref(loadRecoveryNode())
function leaveRecoveryNode() {
  clearRecoveryNode()
  recoveryNode.value = null
  window.location.reload()
}
const settings = useSettingsStore()
const notifications = useNotificationsStore()
const { t } = useI18n()

// Client-to-client refill (#387).
const syncAvailable = ref(isSyncEnabled())
const refillStatusText = computed(() => {
  const s = clientRefillState
  switch (s.status) {
    case 'waiting':
      return t('settings.clientRefillWaiting', { clients: s.expected })
    case 'receiving':
      return t('settings.clientRefillProgress', {
        messages: s.messages,
        done: s.done,
        clients: s.expected,
      })
    case 'done':
      return t('settings.clientRefillDone', { messages: s.messages })
    case 'partial':
      return t('settings.clientRefillPartial', {
        messages: s.messages,
        done: s.done,
        clients: s.expected,
      })
    case 'no_clients':
      return t('settings.clientRefillNoClients')
    case 'error':
      return s.error === 'disabled'
        ? t('settings.clientRefillDisabled')
        : t('settings.clientRefillError')
    default:
      return ''
  }
})

async function startRefill() {
  if (!window.confirm(t('settings.clientRefillConfirm'))) return
  try {
    const result = await startClientRefill()
    if (result.status === 'no_clients') {
      notifications.warning(t('settings.clientRefillNoClients'), t('settings.clientSync'))
    } else if (result.status === 'error') {
      notifications.error(refillStatusText.value || t('settings.clientRefillError'), t('settings.clientSync'))
    } else {
      notifications.success(t('settings.clientRefillStarted'), t('settings.clientSync'))
    }
  } catch (err) {
    notifications.error(err.message || t('settings.clientRefillError'), t('settings.clientSync'))
  }
}

function cancelRefill() {
  cancelClientRefill()
  notifications.success(t('settings.clientRefillCanceled'), t('settings.clientSync'))
}

// Emoji management
const newEmoji = ref('')
const emojiList = ref([...settings.ui.customEmojis])
function addEmoji() {
  const e = newEmoji.value.trim()
  if (e && !emojiList.value.includes(e)) {
    emojiList.value.push(e)
    settings.updateSettings({ ui: { ...settings.ui, customEmojis: emojiList.value } })
    newEmoji.value = ''
  }
}
function removeEmoji(i) {
  emojiList.value.splice(i, 1)
  settings.updateSettings({ ui: { ...settings.ui, customEmojis: emojiList.value } })
}
function resetEmojis() {
  emojiList.value = [...DEFAULT_CUSTOM_EMOJIS]
  settings.updateSettings({ ui: { ...settings.ui, customEmojis: emojiList.value } })
}

// Profile
const profile = ref({
  displayName: '',
  bio: '',
  tagline: '',
  showTearline: false
})
const profileSaving = ref(false)

// The API base is fixed by the build (deployment prefix, #337): the invite
// QR and the per-node voucher state use it directly.
const apiBaseUrl = computed(() => {
  const base = apiService.baseURL || '/api'
  try {
    return new URL(base, window.location.origin).href.replace(/\/+$/, '')
  } catch {
    return base
  }
})

// Invite QR: node URL + node public key + (optionally) a voucher code
const voucherCode = ref('')
const voucherLoading = ref(false)
const voucherReusable = ref(false)
const voucherExpiresAt = ref('')
const timeVoucherTtl = ref('24h')
const timeVoucherCustomTtl = ref('24h')
const vouchers = ref([])
const vouchersLoading = ref(false)
const revokingCode = ref('')

/** Whether the network uses vouchers (policy parameter, default true). */
const networkVouchersEnabled = computed(() => {
  try {
    const params = JSON.parse(localStorage.getItem('fm_policy_params') || '{}')
    if (params.voucher_enable === undefined) return true
    return String(params.voucher_enable) !== 'false'
  } catch {
    return true
  }
})

const vouchersDisabled = computed(() =>
  isVoucherDisabled(apiBaseUrl.value) || !networkVouchersEnabled.value
)

/** Show the "Send voucher" button only for registered users. */
const showVoucherButton = computed(() => !!identity.user?.address && !vouchersDisabled.value)

/** Time vouchers are reusable bearer codes: only admins may create them. */
const showTimeVoucherButton = computed(() => showVoucherButton.value && identity.isAdmin === true)

/** The voucher list is available to every registered user (own codes; admins see all). */
const showVoucherList = computed(() => !!identity.user?.address)

function formatVoucherDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function voucherStatusLabel(status) {
  const key = { active: 'statusActive', used: 'statusUsed', expired: 'statusExpired', revoked: 'statusRevoked' }[status]
  return key ? t(`invite.${key}`) : status
}

function voucherStatusClass(status) {
  return {
    active: 'bg-green-600',
    used: 'bg-gray-500',
    expired: 'bg-gray-400',
    revoked: 'bg-red-600',
  }[status] || 'bg-gray-500'
}

function voucherTypeLabel(type) {
  return type === 'invite_time' ? t('invite.typeInviteTime') : t('invite.typeInvite')
}

async function loadVouchers() {
  if (!identity.user?.address) return
  vouchersLoading.value = true
  try {
    const response = await apiService.voucherList()
    vouchers.value = Array.isArray(response?.vouchers) ? response.vouchers : []
  } catch (err) {
    console.warn('[settings] load vouchers failed', err)
  } finally {
    vouchersLoading.value = false
  }
}

async function revokeVoucher(code) {
  if (!code) return
  if (!window.confirm(t('invite.revokeConfirm', { code }))) return
  revokingCode.value = code
  try {
    await apiService.revokeVoucher(code)
    if (voucherCode.value === code) {
      voucherCode.value = ''
      voucherReusable.value = false
      voucherExpiresAt.value = ''
    }
    notifications.success(t('invite.voucherRevoked'), t('invite.voucherTitle'))
    await loadVouchers()
  } catch (err) {
    notifications.error(err.message, t('invite.voucherTitle'))
  } finally {
    revokingCode.value = ''
  }
}

const voucherExpiryLabel = computed(() => {
  if (!voucherExpiresAt.value) return ''
  const date = new Date(voucherExpiresAt.value)
  return Number.isNaN(date.getTime()) ? voucherExpiresAt.value : date.toLocaleString()
})

const inviteUrl = computed(() => {
  const appUrl = apiUrlToAppUrl(apiBaseUrl.value)
  return buildInviteURL(appUrl, {
    pubkey: identity.nodeEd25519PublicKey || null,
    voucher: voucherCode.value || null,
    address: nodeAddressFromUser(identity.user?.address) || null,
  })
})

/** Create a signed invite voucher on the node and embed it into the QR code. */
async function sendVoucher() {
  voucherLoading.value = true
  try {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const payload = JSON.stringify({ type: 'invite', nonce })
    const jws = await crypto.createJWS(identity.privateKey, payload, identity.publicKey)
    const response = await apiService.createVoucher({ voucher: jws, type: 'invite' })
    const code = typeof response === 'string' ? response : response?.voucher
    if (!code) throw new Error(t('invite.noCode'))
    voucherCode.value = code
    voucherReusable.value = false
    voucherExpiresAt.value = response?.expires_at || ''
    notifications.success(t('invite.voucherCreated'), t('invite.voucherTitle'))
    await loadVouchers()
  } catch (err) {
    if (isVouchersDisabledError(err)) {
      rememberVoucherDisabled(apiBaseUrl.value)
      notifications.warning(t('invite.vouchersDisabled'), t('invite.voucherTitle'))
    } else {
      notifications.error(err.message, t('invite.voucherTitle'))
    }
  } finally {
    voucherLoading.value = false
  }
}

/** Create a reusable, time-limited invite voucher (admin only, #301). */
async function sendTimeVoucher() {
  const ttl = timeVoucherTtl.value === 'custom'
    ? timeVoucherCustomTtl.value.trim()
    : timeVoucherTtl.value
  if (!ttl) {
    notifications.error(t('invite.invalidTtl'), t('invite.timeVoucherTitle'))
    return
  }
  voucherLoading.value = true
  try {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const payload = JSON.stringify({ type: 'invite_time', nonce, ttl })
    const jws = await crypto.createJWS(identity.privateKey, payload, identity.publicKey)
    const response = await apiService.createVoucher({ voucher: jws, type: 'invite_time' })
    const code = typeof response === 'string' ? response : response?.voucher
    if (!code) throw new Error(t('invite.noCode'))
    voucherCode.value = code
    voucherReusable.value = true
    voucherExpiresAt.value = response?.expires_at || ''
    notifications.success(
      t('invite.timeVoucherCreated', { date: voucherExpiryLabel.value }),
      t('invite.timeVoucherTitle'),
    )
    await loadVouchers()
  } catch (err) {
    if (isVouchersDisabledError(err)) {
      rememberVoucherDisabled(apiBaseUrl.value)
      notifications.warning(t('invite.vouchersDisabled'), t('invite.timeVoucherTitle'))
    } else {
      notifications.error(err.message, t('invite.timeVoucherTitle'))
    }
  } finally {
    voucherLoading.value = false
  }
}

// Security
const newPassword = ref('')
const confirmPassword = ref('')
const securityLoading = ref(false)

// Import/Export
const showImportArea = ref(false)
const importData = ref('')
const importPassword = ref('')
const importEncrypted = ref(false)
const importAnalysis = ref(null)
const importError = ref('')

// Settings Encryption
const settingsPassword = ref('')
const settingsConfirmPassword = ref('')
const settingsLoading = ref(false)
const showSettingsImportArea = ref(false)
const settingsImportData = ref('')
const settingsImportPassword = ref('')
const settingsImportError = ref('')
const unlockPassword = ref('')
const unlocking = ref(false)



// Methods
async function saveProfile() {
  profileSaving.value = true
  try {
    // The display name has a single home: identity.user.name (the mirror of
    // users.name on the node, #296). Only the bio and the tagline (#309)
    // live in settings.
    const name = profile.value.displayName.trim()
    if (name && identity.user?.name !== name) {
      identity.updateUserName(name)
    }
    await settings.updateSettings({
      userProfile: {
        bio: profile.value.bio,
        tagline: profile.value.tagline.trim(),
        showTearline: profile.value.showTearline === true,
      },
    })
    if (name) {
      try {
        const saved = await identity.pushName(name)
        profile.value.displayName = saved
      } catch (err) {
        // The local rename is kept; the node can be updated later (the next
        // save or boot sync pushes it again).
        notifications.warning(
          t('settings.profileNameNotSynced', { error: err.message }),
          t('settings.profileSavedTitle')
        )
      }
    }
    notifications.success(t('settings.profileSaved'), t('settings.profileSavedTitle'))
  } catch (err) {
    notifications.error(t('settings.profileSaveFailed', { error: err.message }), t('settings.saveError'))
    console.error(err)
  } finally {
    profileSaving.value = false
  }
}

/** Persist a privacy checkbox (privacy v-models do not auto-save). */
function savePrivacySetting() {
  settings.updateSettings({ privacy: { ...settings.privacy } })
}

/** Persist the rate limit override toggle (privacy v-models do not auto-save). */
function saveRateLimitSetting() {
  settings.updateSettings({
    privacy: { ...settings.privacy, allowSendingWithoutRateLimit: settings.privacy.allowSendingWithoutRateLimit === true },
  })
}

/** Persist the client sync encryption toggle (privacy v-models do not auto-save). */
function saveClientSyncSetting() {
  settings.updateSettings({
    privacy: { ...settings.privacy, encryptClientSync: settings.privacy.encryptClientSync !== false },
  })
}

// Settings encryption methods
async function setSettingsPassword() {
  if (settingsPassword.value !== settingsConfirmPassword.value) return
  
  settingsLoading.value = true
  settingsImportError.value = ''
  try {
    await settings.changePassword(null, settingsPassword.value)
    settingsPassword.value = ''
    settingsConfirmPassword.value = ''
    notifications.success(t('settings.settingsEncryptedSuccess'), t('settings.encryptionEnabled'))
  } catch (err) {
    notifications.error(t('settings.settingsEncryptFailed', { error: err.message }), t('settings.encryptionError'))
    console.error(err)
  } finally {
    settingsLoading.value = false
  }
}

async function changeSettingsPassword() {
  const oldPassword = prompt(t('settings.enterCurrentPassword'))
  if (!oldPassword) return
  
  const newPass = prompt(t('settings.enterNewPassword'))
  if (!newPass) return
  
  const confirmPass = prompt(t('settings.confirmNewPassword'))
  if (newPass !== confirmPass) {
    alert(t('settings.passwordsDoNotMatch'))
    return
  }
  
  settingsLoading.value = true
  try {
    await settings.changePassword(oldPassword, newPass)
    notifications.success(t('settings.settingsPasswordChanged'), t('settings.passwordChanged'))
  } catch (err) {
    notifications.error(t('settings.passwordChangeFailed', { error: err.message }), t('settings.passwordError'))
    console.error(err)
  } finally {
    settingsLoading.value = false
  }
}

async function removeSettingsPassword() {
  const password = prompt(t('settings.enterPasswordToRemove'))
  if (!password) return
  
  settingsLoading.value = true
  try {
    await settings.changePassword(password, null)
    notifications.success(t('settings.encryptionRemoved'), t('settings.encryptionDisabled'))
  } catch (err) {
    notifications.error(t('settings.encryptionRemoveFailed', { error: err.message }), t('settings.encryptionError'))
    console.error(err)
  } finally {
    settingsLoading.value = false
  }
}

const exporting = ref(false)
const showExportDialog = ref(false)
const showImportDialog = ref(false)

async function onExportOptions(options) {
  showExportDialog.value = false
  await fullExport(options)
}

async function fullExport(options = {}) {
  // Default: export everything; structure (folders/echoes/blogs) is always exported
  const opts = {
    settings: options.settings !== false,
    keys: options.keys !== false,
    structure: true,
    echos: options.echos !== false,
    selectedEchos: options.selectedEchos || null, // null = all, [] or ['Echo1'] = filter
    netmail: options.netmail === true,
    netmailFolders: options.netmailFolders || [], // e.g. ['inbox','sent','netmail_<slug>']
    blogs: options.blogs === true,
    ...options,
  }

  if (!settings.loaded) {
    notifications.error(t('settings.settingsNotLoaded'), t('settings.exportError'))
    exporting.value = false
    return
  }
  exporting.value = true
  try {
    const full = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      // Consumers derive /api from this URL; do not store an API endpoint here (#359).
      appUrl: fullExportAppUrl(apiBaseUrl.value),
    }

    if (opts.settings) {
      const exportedUI = { ...settings.ui }
      // Emojis travel separately and only when the user changed them (#373).
      delete exportedUI.customEmojis
      full.settings = {
        application: { ...settings.application },
        privacy: { ...settings.privacy },
        ui: exportedUI,
        network: { ...settings.network },
        storage: { ...settings.storage },
        security: { ...settings.security },
        userProfile: { ...settings.userProfile },
      }
      if (!isDefaultEmojis(settings.ui.customEmojis)) {
        full.emojis = [...settings.ui.customEmojis]
      }
    }

    // ---- Structure: always exported ----
    // Echo list (subscriptions) + netmail folder structure + blogs
    let subscribedEchoes = []
    try {
      if (identity.subscriptions?.value && identity.subscriptions.value.size > 0) {
        subscribedEchoes = [...identity.subscriptions.value]
      } else {
        const subsRaw = localStorage.getItem('fm_subscriptions')
        if (subsRaw) subscribedEchoes = JSON.parse(subsRaw)
      }
      if (!Array.isArray(subscribedEchoes)) subscribedEchoes = []
    } catch (e) {
      console.warn('[export] echo structure failed', e)
      subscribedEchoes = []
    }
    full.structure = {
      echoes: subscribedEchoes,
      netmailFolders: db.getNetmailFolders(),
      blogs: [],
    }
    try {
      const blogList = await blogStore.getBlogs()
      full.structure.blogs = blogList.map(b => ({ id: b.id, name: b.name, description: b.description, createdAt: b.createdAt }))
    } catch (e) {
      console.warn('[export] blogs structure failed', e)
    }

    // Export messages from IndexedDB
    if (opts.echos || opts.netmail || opts.blogs) {
      const dbConn = await db.openReadConnection()
      const messages = {}
      for (const storeName of Array.from(dbConn.objectStoreNames)) {
        if (storeName === '__trash__') continue
        const isEcho = storeName.startsWith('echo_')
        const isNetmailBase = storeName === '__netmail__'
        const isNetmailCustom = storeName.startsWith('netmail_')

        let include = false
        if (isEcho && opts.echos) {
          const echoName = storeName.replace(/^echo_/, '')
          include = !opts.selectedEchos || opts.selectedEchos.includes(echoName)
        } else if ((isNetmailBase || isNetmailCustom) && opts.netmail) {
          // Per-folder netmail export
          if (isNetmailBase) {
            // Base netmail store: split per folder selection at import? We export
            // the whole __netmail__ if any base folder selected (inbox/sent/errors/bad/dup),
            // and custom netmail_<slug> stores only when their folder selected.
            const wantsBase = ['inbox', 'sent', 'errors', 'bad', 'dup'].some(f => opts.netmailFolders.includes(f))
            include = wantsBase
          } else {
            include = opts.netmailFolders.includes(storeName)
          }
        }
        if (!include) continue

        const tx = dbConn.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const all = await new Promise((res, rej) => {
          const req = store.getAll()
          req.onsuccess = () => res(req.result)
          req.onerror = () => rej(req.error)
        })
        if (all.length > 0) messages[storeName] = all
      }
      dbConn.close()
      if (Object.keys(messages).length > 0) full.messages = messages
    }

    // Blogs content (posts) — separate DB
    if (opts.blogs) {
      try {
        full.blogPosts = await blogStore.getAllBlogPosts()
      } catch (e) {
        console.warn('[export] blog posts failed', e)
      }
    }

    if (opts.keys) {
      // Read keys straight from localStorage — do NOT gate on identity.hasKeys.
      // During a broken boot state (e.g. after a restore that lost fm_user) keys
      // may still be present in storage while identity.hasKeys is false; skipping
      // them would make the backup useless for restoring the identity elsewhere.
      const pub = localStorage.getItem('fm_public_key')
      const enc = localStorage.getItem('fm_encrypted_private_key')
      const meta = localStorage.getItem('fm_key_metadata')
      full.keys = pub && enc
        ? {
            publicKey: pub,
            encryptedPrivateKey: enc,
            metadata: meta,
          }
        : null
      // The node public key travels with the backup: a restored client without
      // it sends plaintext and the node answers 502 (encrypted policy flow).
      if (full.keys) {
        const nodeKey = localStorage.getItem('fm_node_public_key')
        if (nodeKey) full.keys.nodePublicKey = nodeKey
      }
    }

    const userData = localStorage.getItem('fm_user')
    if (userData) {
      try {
        // Roles are server-owned: do not carry them into backups, they are
        // re-confirmed from the node on the next boot.
        const { isAdmin, isModerator, ...user } = JSON.parse(userData)
        full.user = user
      } catch (e) { console.warn('[export] invalid fm_user, skipping', e) }
    }
    const subsData = localStorage.getItem('fm_subscriptions')
    if (subsData) {
      try { full.subscriptions = JSON.parse(subsData) } catch (e) { console.warn('[export] invalid fm_subscriptions, skipping', e) }
    }
    // Address→names directory: learned sender names (sender name is not a part
    // of the message itself, so it must travel with the backup).
    const namesData = localStorage.getItem('fm_addr_names')
    if (namesData) {
      try { full.names = JSON.parse(namesData) } catch (e) { console.warn('[export] invalid fm_addr_names, skipping', e) }
    }

    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFileName('fm-full-export', identity.user || {})
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    notifications.success(t('settings.fullExportComplete'), t('settings.exportComplete'))
  } catch (err) {
    notifications.error(t('settings.exportFailed', { error: err.message }), t('settings.exportError'))
    console.error(err)
  } finally {
    exporting.value = false
  }
}

async function exportSettingsData() {
  const password = settings.isEncrypted ? prompt(t('settings.enterPasswordForExport')) : null
  const exportPassword = password === '' ? null : password
  
  settingsLoading.value = true
  try {
    const jsonData = await settings.exportSettings(exportPassword)
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFileName('fm-settings', identity.user || {})
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    notifications.success(t('settings.settingsExportedSuccess'), t('settings.exportComplete'))
  } catch (err) {
    notifications.error(t('settings.settingsExportFailed', { error: err.message }), t('settings.exportError'))
    console.error(err)
  } finally {
    settingsLoading.value = false
  }
}

async function performSettingsImport() {
  settingsLoading.value = true
  settingsImportError.value = ''
  
  try {
    await settings.importSettings(settingsImportData.value, settingsImportPassword.value || null)
    
    // Clear form
    settingsImportData.value = ''
    settingsImportPassword.value = ''
    showSettingsImportArea.value = false
    
    notifications.success(t('settings.settingsImportedSuccess'), t('settings.importComplete'))
    
    // Reload page to apply new settings
    window.location.reload()
  } catch (err) {
    settingsImportError.value = t('settings.importFailed', { error: err.message })
    notifications.error(t('settings.settingsImportFailed', { error: err.message }), t('settings.importError'))
    console.error(err)
  } finally {
    settingsLoading.value = false
  }
}

// Initialize data from stores
onMounted(async () => {
  // Load settings if not already loaded
  if (!settings.loaded) {
    try {
      await settings.initialize()
    } catch (err) {
      console.warn('Failed to initialize settings:', err)
    }
  }
  
  // Load profile (display name from identity — the single source, #296)
  if (settings.loaded) {
    profile.value = {
      displayName: identity.user?.name || '',
      bio: settings.userProfile.bio || '',
      tagline: settings.userProfile.tagline || '',
      showTearline: settings.userProfile.showTearline === true
    }
  }
  syncAvailable.value = isSyncEnabled()
  loadClientRefillState()
  await loadVouchers()
})

async function setPassword() {
  if (newPassword.value !== confirmPassword.value) return
  
  securityLoading.value = true
  try {
    await identity.saveKeysToStorage(newPassword.value)
    newPassword.value = ''
    confirmPassword.value = ''
    alert(t('settings.passwordSetSuccess'))
  } catch (err) {
    alert(t('settings.passwordSetError', { error: err.message }))
    console.error(err)
  } finally {
    securityLoading.value = false
  }
}

async function changePassword() {
  const oldPassword = prompt(t('settings.enterCurrentPassword'))
  if (!oldPassword) return
  
  const newPass = prompt(t('settings.enterNewPassword'))
  if (!newPass) return
  
  const confirmPass = prompt(t('settings.confirmNewPassword'))
  if (newPass !== confirmPass) {
    alert(t('settings.passwordsDoNotMatch'))
    return
  }
  
  securityLoading.value = true
  try {
    // Load keys with old password
    await identity.loadStoredKeys(oldPassword)
    // Save with new password
    await identity.saveKeysToStorage(newPass)
    alert(t('settings.passwordChangedSuccess'))
  } catch (err) {
    alert(t('settings.passwordChangeError', { error: err.message }))
    console.error(err)
  } finally {
    securityLoading.value = false
  }
}

async function removePassword() {
  const password = prompt(t('settings.enterPasswordToRemove'))
  if (!password) return
  
  securityLoading.value = true
  try {
    // Load keys with password (verifies it)
    await identity.loadStoredKeys(password)
    // Save without password
    await identity.saveKeysToStorage(null)
    alert(t('settings.passwordProtectionRemoved'))
  } catch (err) {
    alert(t('settings.passwordRemoveError', { error: err.message }))
    console.error(err)
  } finally {
    securityLoading.value = false
  }
}

async function exportKeys() {
  const password = identity.isKeyEncrypted ? prompt(t('settings.enterPasswordForExport')) : null
  const exportPassword = password === '' ? null : password
  
  securityLoading.value = true
  try {
    const jsonData = await identity.exportKeys(exportPassword)
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFileName('fm-keys', identity.user || {})
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    alert(t('settings.keysExportedSuccess'))
  } catch (err) {
    alert(t('settings.keysExportError', { error: err.message }))
    console.error(err)
  } finally {
    securityLoading.value = false
  }
}

function importKeys() {
  showImportArea.value = true
}

function analyzeImport() {
  try {
    const data = JSON.parse(importData.value)
    importAnalysis.value = {
      version: data.version || 'unknown',
      encrypted: data.encrypted || false,
      hasPublicKey: !!data.publicKey
    }
    importEncrypted.value = data.encrypted || false
    importError.value = ''
  } catch (err) {
    importError.value = t('settings.invalidJsonFormat')
    importAnalysis.value = null
  }
}

async function performImport() {
  securityLoading.value = true
  importError.value = ''
  
  try {
    await identity.importKeys(importData.value, importPassword.value)
    
    // Clear form
    importData.value = ''
    importPassword.value = ''
    importAnalysis.value = null
    importEncrypted.value = false
    showImportArea.value = false
    
    alert(t('settings.keysImportedSuccess'))
    
    // Reload app to use new keys
    window.location.reload()
  } catch (err) {
    importError.value = t('settings.importFailed', { error: err.message })
    console.error(err)
  } finally {
    securityLoading.value = false
  }
}

async function unlockSettings() {
  if (!unlockPassword.value) return
  
  unlocking.value = true
  settingsImportError.value = ''
  try {
    await settings.loadSettings(unlockPassword.value)
    unlockPassword.value = ''
    notifications.success(t('settings.settingsUnlockedSuccess'), t('settings.unlockComplete'))
  } catch (err) {
    settingsImportError.value = t('settings.settingsUnlockFailed', { error: err.message })
    notifications.error(t('settings.settingsUnlockFailed', { error: err.message }), t('settings.unlockError'))
    console.error(err)
  } finally {
    unlocking.value = false
  }
}



async function clearKeys() {
  if (!confirm(t('settings.confirmClearKeys'))) {
    return
  }
  
  securityLoading.value = true
  try {
    identity.clearStoredKeys()
    alert(t('settings.keysClearedSuccess'))
    
    // Reload app
    window.location.reload()
  } catch (err) {
    alert(t('settings.keysClearError', { error: err.message }))
    console.error(err)
  } finally {
    securityLoading.value = false
  }
}
</script>
