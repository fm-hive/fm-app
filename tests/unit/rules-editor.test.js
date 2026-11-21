import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import RulesEditor from '../../src/components/RulesEditor.vue'
import en from '../../src/i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const flush = (ms = 60) => new Promise((r) => setTimeout(r, ms))

// Host with a real v-model binding (the component's modelValue watcher must not
// feed back into its own emit).
function makeHost() {
  return defineComponent({
    setup() {
      const rules = ref({ text: '', parameters: { max_moderators: '2' } })
      return () => h(RulesEditor, {
        modelValue: rules.value,
        'onUpdate:modelValue': (v) => { rules.value = v },
      })
    },
  })
}

describe('RulesEditor', () => {
  it('emits a single update when a parameter changes (no feedback loop)', async () => {
    const wrapper = mount(makeHost(), { global: { plugins: [i18n] } })
    const editor = wrapper.findComponent(RulesEditor)

    const input = editor.find('#rules-param-max_moderators')
    expect(input.exists()).toBe(true)

    await input.setValue('3')
    await flush()

    const emits = editor.emitted('update:modelValue') || []
    // Regression: the modelValue watcher used to feed back into the emit,
    // producing ~100 emits per change and making the form lag badly.
    expect(emits.length).toBe(1)
    expect(emits[0][0].parameters.max_moderators).toBe('3')
  })

  it('still applies an external modelValue change', async () => {
    const wrapper = mount(RulesEditor, {
      props: { modelValue: { text: 'old', parameters: { max_moderators: '2' } } },
      global: { plugins: [i18n] },
    })

    await wrapper.setProps({ modelValue: { text: 'new', parameters: { max_moderators: '9' } } })
    await flush()

    expect(wrapper.find('#rules-param-max_moderators').element.value).toBe('9')
  })

  it('emits list parameters (writers/elect_writers_from) as arrays', async () => {
    const wrapper = mount(RulesEditor, {
      props: { modelValue: { text: '', parameters: {} } },
      global: { plugins: [i18n] },
    })

    await wrapper.find('#rules-param-writers').setValue(':0:1, :0:5')
    await flush()

    const emits = wrapper.emitted('update:modelValue') || []
    expect(emits.length).toBeGreaterThan(0)
    const last = emits[emits.length - 1][0]
    // Regression: the backend writers check expects an array; a comma string
    // silently disabled the writers restriction.
    expect(last.parameters.writers).toEqual([':0:1', ':0:5'])
  })

  it('renders a legacy string list value and normalizes it on emit', async () => {
    const wrapper = mount(RulesEditor, {
      props: { modelValue: { text: '', parameters: { writers: ':0:1' } } },
      global: { plugins: [i18n] },
    })

    expect(wrapper.find('#rules-param-writers').element.value).toBe(':0:1')

    await wrapper.find('#rules-param-elect_writers_from').setValue('Moderators council')
    await flush()

    const emits = wrapper.emitted('update:modelValue') || []
    const last = emits[emits.length - 1][0]
    expect(last.parameters.writers).toEqual([':0:1'])
    expect(last.parameters.elect_writers_from).toEqual(['Moderators council'])
  })
})
