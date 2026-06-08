<template>
  <div class="app-page">
    <div class="app-inner">
      <div class="app-head">
        <div>
          <h2>Ledger</h2>
          <p>一句话记账，也可以手动录入。</p>
        </div>
      </div>

      <div class="app-card soft">
        <div class="app-muted">余额</div>
        <div class="app-money" :class="summary.balance >= 0 ? 'text-[var(--win)]' : 'text-[var(--accent-d)]'">
          ¥ {{ fmt(summary.balance) }}
        </div>
        <div class="app-actions mt-2">
          <span class="app-pill win">收入 ¥{{ fmt(summary.income) }}</span>
          <span class="app-pill accent">支出 ¥{{ fmt(summary.expense) }}</span>
        </div>
      </div>

      <div class="app-card">
        <div class="app-section-title">Smart Input</div>
        <div class="app-row">
          <input
            v-model="smartText"
            class="app-input"
            placeholder="如：午餐面馆 38 / 打车 26 / 工资 8200"
            @keyup.enter="parseSmart"
          />
          <button class="app-primary" type="button" :disabled="parsing || !smartText.trim()" @click="parseSmart">
            {{ parsing ? '识别中' : '识别' }}
          </button>
        </div>

        <div v-if="parsed" class="app-card soft mt-3">
          <div class="app-row">
            <span class="app-pill" :class="parsed.type === 'income' ? 'win' : 'accent'">
              {{ parsed.type === 'income' ? '收入' : '支出' }}
            </span>
            <div class="app-main">
              <b>{{ parsed.category }}</b>
              <small>{{ parsed.note || '无备注' }}</small>
            </div>
            <b>{{ parsed.type === 'income' ? '+' : '-' }}¥{{ fmt(parsed.amount) }}</b>
          </div>
          <button class="app-primary mt-3" type="button" :disabled="savingParsed" @click="confirmParsed">
            {{ savingParsed ? '记录中' : '确认记账' }}
          </button>
        </div>

        <div v-if="error" class="app-error mt-3">{{ error }}</div>
      </div>

      <div class="app-card">
        <button class="app-row w-full text-left" type="button" @click="manualOpen = !manualOpen">
          <div class="app-main">
            <b>手动记一笔</b>
            <small>选择类型、分类、金额和备注。</small>
          </div>
          <span class="app-pill">{{ manualOpen ? '收起' : '展开' }}</span>
        </button>

        <div v-if="manualOpen" class="mt-3">
          <div class="app-segment">
            <button :class="{ active: form.type === 'expense' }" type="button" @click="setManualType('expense')">支出</button>
            <button :class="{ active: form.type === 'income' }" type="button" @click="setManualType('income')">收入</button>
          </div>

          <div class="app-grid-2 mt-3">
            <select v-model="form.category" class="app-select">
              <option v-for="cat in manualCategories" :key="cat" :value="cat">{{ cat }}</option>
            </select>
            <input v-model.number="form.amount" type="number" inputmode="decimal" class="app-input" placeholder="金额" />
          </div>

          <div class="app-row mt-3">
            <input v-model="form.note" class="app-input" placeholder="备注" @keyup.enter="add" />
            <button class="app-primary" type="button" :disabled="!form.amount" @click="add">记录</button>
          </div>
        </div>
      </div>

      <div class="app-section-title">Entries</div>
      <div v-if="!entries.length" class="app-empty">还没有账目</div>
      <div v-for="entry in entries" v-else :key="entry.id" class="app-card app-row">
        <span class="app-pill" :class="entry.type === 'income' ? 'win' : 'accent'">
          {{ entry.type === 'income' ? '收入' : '支出' }}
        </span>
        <div class="app-main">
          <b>{{ entry.category || (entry.type === 'income' ? '收入' : '支出') }}</b>
          <small>{{ entry.note || entry.occurred_on }}</small>
        </div>
        <b>{{ entry.type === 'income' ? '+' : '-' }}¥{{ fmt(entry.amount) }}</b>
        <button class="app-icon" type="button" aria-label="删除账目" @click="remove(entry.id)">
          <Trash2 :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Trash2 } from '@lucide/vue';
import { computed, onMounted, reactive, ref } from 'vue';

const entries = ref([]);
const summary = ref({ income: 0, expense: 0, balance: 0 });
const form = reactive({ type: 'expense', amount: '', category: '餐饮', note: '' });
const smartText = ref('');
const parsed = ref(null);
const parsing = ref(false);
const savingParsed = ref(false);
const manualOpen = ref(false);
const error = ref('');

const expenseCategories = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '其他'];
const incomeCategories = ['工资', '其他'];
const manualCategories = computed(() => (form.type === 'income' ? incomeCategories : expenseCategories));

const fmt = (n) => Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

const request = async (url, options = {}) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const load = async () => {
  const data = await request('/apps/ledger/entries');
  entries.value = data.entries || [];
  summary.value = data.summary || { income: 0, expense: 0, balance: 0 };
};

const parseSmart = async () => {
  const text = smartText.value.trim();
  if (!text || parsing.value) return;
  parsing.value = true;
  parsed.value = null;
  error.value = '';
  try {
    const data = await request('/apps/ledger/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    parsed.value = data.entry;
  } catch (err) {
    error.value = err.message || '识别失败';
  } finally {
    parsing.value = false;
  }
};

const confirmParsed = async () => {
  if (!parsed.value || savingParsed.value) return;
  savingParsed.value = true;
  error.value = '';
  try {
    await request('/apps/ledger/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.value),
    });
    smartText.value = '';
    parsed.value = null;
    await load();
  } catch (err) {
    error.value = err.message || '记录失败';
  } finally {
    savingParsed.value = false;
  }
};

const add = async () => {
  if (!form.amount) return;
  await request('/apps/ledger/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  form.amount = '';
  form.note = '';
  await load();
};

const remove = async (id) => {
  await request(`/apps/ledger/entries?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await load();
};

const setManualType = (type) => {
  form.type = type;
  form.category = type === 'income' ? '工资' : '餐饮';
};

onMounted(load);
</script>
