// LOCK-IN (Complete) Application Controller with Vision AI & 8th PPT Spec Integrations
let currentDateStr = '';
let currentRoutines = [];
let dbSupabase = null;
let lastKnownTodayStr = '';
let currentAuthUser = null;
const TASKS_STORAGE_KEY = 'complete_tasks_map';
const REWARDS_STORAGE_KEY = 'complete_task_rewards';
const CUSTOM_ROUTINES_STORAGE_KEY = 'complete_custom_routines';
const AUTH_CHOICE_STORAGE_KEY = 'complete_auth_choice';

// App Init entry point
window.addEventListener('DOMContentLoaded', async () => {
  const dismissSplash = () => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.classList.add('hidden');
      splash.style.pointerEvents = 'none';
      setTimeout(() => {
        splash.style.display = 'none';
      }, 500);
    }
  };

  const splashEl = document.getElementById('splashScreen');
  if (splashEl) splashEl.addEventListener('click', dismissSplash);

  // Auto dismiss splash screen after 1.8 seconds
  setTimeout(dismissSplash, 1800);

  try {
    // 1. Setup real-time clock and midnight detector
    setInterval(checkMidnightUpdate, 5000);

    // 2. Initialize date navigator to today (KST)
    const offset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(Date.now() + offset);
    currentDateStr = kstDate.toISOString().split('T')[0];
    lastKnownTodayStr = currentDateStr;
    const datePicker = document.getElementById('datePicker');
    if (datePicker) datePicker.value = currentDateStr;

    // 3. Local-first data layer with optional Supabase session sync.
    const SUPABASE_URL = window.LOCKIN_CONFIG?.SUPABASE_URL || '';
    const SUPABASE_ANON_KEY = window.LOCKIN_CONFIG?.SUPABASE_ANON_KEY || '';
    
    if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
      try {
        dbSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        dbSupabase.auth.onAuthStateChange((_event, session) => {
          window.setTimeout(() => applySupabaseSession(session?.user || null), 0);
        });
      } catch (e) {
        console.info("오프라인 로컬 모드로 시작합니다.");
      }
    }
    if (dbSupabase) {
      try {
        const { data } = await dbSupabase.auth.getSession();
        currentAuthUser = data?.session?.user || null;
        if (currentAuthUser) localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'account');
      } catch (e) {
        console.info("세션 확인 건너뜀");
      }
    }
    window.godsaengStore.setupSupabase(
      currentAuthUser ? dbSupabase : null,
      currentAuthUser?.id || null
    );
    window.godsaengStore.setLocalScope(getActiveStorageScope());

    // Initialize store configuration
    await window.godsaengStore.init();
    if (currentAuthUser) await loadCustomRoutinesFromCloud();
    updateSyncStatus(window.godsaengStore.isSupabaseActive ? 'cloud' : 'local');
    window.addEventListener('online', () => updateSyncStatus(window.godsaengStore.isSupabaseActive ? 'cloud' : 'local'));
    window.addEventListener('offline', () => updateSyncStatus('offline'));

    // Load saved API key in UI
    const keyInput = document.getElementById('apiKeyInput');
    if (keyInput) keyInput.value = window.visionAI.getApiKey();

    // 4. Bind DOM Events
    setupEventListeners();
    renderAuthView();

    // 5. Load data for active date
    await loadStateForDate(currentDateStr);
    if (!currentAuthUser && !localStorage.getItem(AUTH_CHOICE_STORAGE_KEY)) {
      openAuthModal();
    }
  } catch (err) {
    console.error("앱 초기화 중 오류 발생 (안전 모드로 전환):", err);
  } finally {
    dismissSplash();
    positionTabIndicator();
    window.addEventListener('resize', positionTabIndicator);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }
});

function readTaskMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedStorageKey(TASKS_STORAGE_KEY)) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeTaskMap(taskMap) {
  localStorage.setItem(scopedStorageKey(TASKS_STORAGE_KEY), JSON.stringify(taskMap));
}

function getActiveStorageScope() {
  return currentAuthUser?.id ? `account:${currentAuthUser.id}` : 'guest';
}

function storageKeyForScope(baseKey, scope) {
  const key = `${baseKey}::${encodeURIComponent(scope)}`;
  if (scope === 'guest' && localStorage.getItem(key) === null) {
    const legacyValue = localStorage.getItem(baseKey);
    if (legacyValue !== null) localStorage.setItem(key, legacyValue);
  }
  return key;
}

function scopedStorageKey(baseKey) {
  return storageKeyForScope(baseKey, getActiveStorageScope());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createLocalTask(dateString, slotNumber, content) {
  return {
    id: `local_${dateString}_${slotNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: dateString,
    slot_number: slotNumber,
    content,
    is_done: false,
    completed_at: null,
    updated_at: new Date().toISOString()
  };
}

function saveCurrentRoutinesLocally() {
  const taskMap = readTaskMap();
  taskMap[currentDateStr] = currentRoutines.map((task, index) => ({
    ...task,
    date: currentDateStr,
    slot_number: index + 1,
    updated_at: task.updated_at || new Date().toISOString()
  }));
  writeTaskMap(taskMap);
}

async function rewardTaskOnce(taskId, amount = 1) {
  const rewards = JSON.parse(localStorage.getItem(scopedStorageKey(REWARDS_STORAGE_KEY)) || '{}');
  if (rewards[taskId]) return false;
  rewards[taskId] = { awarded_at: new Date().toISOString(), amount };
  localStorage.setItem(scopedStorageKey(REWARDS_STORAGE_KEY), JSON.stringify(rewards));
  await window.godsaengStore.addCoins(amount);
  return true;
}

function revokeLocalTaskReward(taskId) {
  const rewards = JSON.parse(localStorage.getItem(scopedStorageKey(REWARDS_STORAGE_KEY)) || '{}');
  if (!rewards[taskId]) return false;
  const amount = typeof rewards[taskId] === 'object' ? rewards[taskId].amount || 1 : 1;
  delete rewards[taskId];
  localStorage.setItem(scopedStorageKey(REWARDS_STORAGE_KEY), JSON.stringify(rewards));
  return amount;
}

// Time formatting removed as status bar was removed


// Real-time midnight auto refresh (Slide 6 spec)
function checkMidnightUpdate() {
  const offset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + offset);
  const realTodayStr = kstNow.toISOString().split('T')[0];

  // Only jump to the new day when midnight actually passes.
  if (lastKnownTodayStr && lastKnownTodayStr !== realTodayStr) {
    lastKnownTodayStr = realTodayStr;
    const activeTab = document.querySelector('.tab-item.active').getAttribute('data-tab');
    if (activeTab === 'today') {
      console.log("⏰ Midnight detected! Refreshing slot views to today.");
      currentDateStr = realTodayStr;
      document.getElementById('datePicker').value = currentDateStr;
      loadStateForDate(currentDateStr);
      alert("⏰ 자정이 지나 새로운 갓생 하루가 시작되었습니다! 오늘의 3대 루틴을 채워보세요.");
    }
  }
}

// Bind navigation and button events
function setupEventListeners() {
  // Date navigator
  document.getElementById('prevDateBtn').addEventListener('click', () => navigateDate(-1));
  document.getElementById('nextDateBtn').addEventListener('click', () => navigateDate(1));
  document.getElementById('datePicker').addEventListener('change', (e) => {
    currentDateStr = e.target.value;
    loadStateForDate(currentDateStr);
  });

  // Main tab bar
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      tabItems.forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      
      const tabName = item.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tabName}`).classList.add('active');
      
      positionTabIndicator();

      if (tabName === 'history') {
        setTimeout(() => {
          animateHistoryBars();
          renderArchiveList();
        }, 50);
      }
    });
  });

  // Accordion Toggle for Settings
  const toggleBtn = document.getElementById('accordionToggleBtn');
  const accordion = document.getElementById('accordionContent');
  const arrow = document.getElementById('accordionArrow');
  toggleBtn.addEventListener('click', () => {
    const isOpen = accordion.classList.contains('show');
    if (isOpen) {
      accordion.classList.remove('show');
      toggleBtn.classList.remove('open');
    } else {
      accordion.classList.add('show');
      toggleBtn.classList.add('open');
    }
  });

  // API Key operations
  document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
    const keyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    const success = window.visionAI.saveApiKey(keyInput.value);
    if (success) {
      status.textContent = 'API 키가 성공적으로 저장되었습니다! ⚡';
      status.className = 'api-key-status-msg success';
    } else {
      status.textContent = '올바른 키를 입력하세요.';
      status.className = 'api-key-status-msg error';
    }
  });

  document.getElementById('deleteApiKeyBtn').addEventListener('click', () => {
    const keyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('apiKeyStatus');
    window.visionAI.deleteApiKey();
    keyInput.value = '';
    status.textContent = '저장된 API 키가 삭제되었습니다.';
    status.className = 'api-key-status-msg success';
  });

  // Separate Market / Closet category state
  let currentMarketCategory = 'all';
  let currentClosetCategory = 'all';

  // Shop subtabs
  const shopNavItems = document.querySelectorAll('.shop-nav-item');
  shopNavItems.forEach(subtab => {
    subtab.addEventListener('click', () => {
      shopNavItems.forEach(s => s.classList.remove('active'));
      subtab.classList.add('active');

      const targetId = subtab.getAttribute('data-subtab');
      document.querySelectorAll('.shop-subcontent-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`subtab-${targetId}`).classList.add('active');

      const activeCat = targetId === 'closet' ? currentClosetCategory : currentMarketCategory;
      document.querySelectorAll('.closet-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-category') === activeCat);
      });

      if (targetId === 'closet') {
        renderCloset(currentClosetCategory);
      } else {
        renderMarket(currentMarketCategory);
      }
    });
  });

  // Closet category tabs
  const closetTabs = document.querySelectorAll('.closet-tab');
  closetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      closetTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.getAttribute('data-category');

      const activeSubtab = document.querySelector('.shop-nav-item.active')?.getAttribute('data-subtab');
      if (activeSubtab === 'closet') {
        currentClosetCategory = cat;
        renderCloset(cat);
      } else {
        currentMarketCategory = cat;
        renderMarket(cat);
      }
    });
  });

  // PC Mouse drag & mouse wheel horizontal scrolling for category tabs
  const categoryTabsContainer = document.getElementById('shopCategoryTabs');
  if (categoryTabsContainer) {
    let isMouseDown = false;
    let startX = 0;
    let scrollLeft = 0;

    categoryTabsContainer.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      startX = e.pageX - categoryTabsContainer.offsetLeft;
      scrollLeft = categoryTabsContainer.scrollLeft;
    });
    categoryTabsContainer.addEventListener('mouseleave', () => {
      isMouseDown = false;
    });
    categoryTabsContainer.addEventListener('mouseup', () => {
      isMouseDown = false;
    });
    categoryTabsContainer.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      e.preventDefault();
      const x = e.pageX - categoryTabsContainer.offsetLeft;
      const walk = (x - startX) * 2;
      categoryTabsContainer.scrollLeft = scrollLeft - walk;
    });

    categoryTabsContainer.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        categoryTabsContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  // Quick routine add button
  document.getElementById('quickAddBtn').addEventListener('click', () => addNewRoutine());
  document.getElementById('quickAddInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNewRoutine();
  });
  document.getElementById('templateToggleBtn').addEventListener('click', () => {
    const panel = document.getElementById('routineTemplatePanel');
    panel.hidden = !panel.hidden;
  });
  document.querySelectorAll('[data-routine-template]').forEach(button => {
    button.addEventListener('click', () => addNewRoutine(button.dataset.routineTemplate));
  });
  document.getElementById('saveCustomRoutineBtn').addEventListener('click', saveCustomRoutine);
  document.getElementById('customRoutineInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') saveCustomRoutine();
  });
  document.getElementById('customRoutineRepeat').addEventListener('change', event => {
    document.getElementById('customWeekdayPicker').hidden = event.target.value !== 'custom';
  });
  document.getElementById('mainMenuBtn')?.addEventListener('click', openAuthModal);
  document.getElementById('syncStatus')?.addEventListener('click', openAuthModal);
  document.getElementById('authCloseBtn').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', event => {
    if (event.target.id === 'authModal') closeAuthModal();
  });
  document.getElementById('localLoginBtn').addEventListener('click', loginLocalAccount);
  document.getElementById('localSignupBtn').addEventListener('click', createLocalAccount);
  document.getElementById('authPasswordInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') loginLocalAccount();
  });
  document.getElementById('guestLoginBtn').addEventListener('click', continueAsGuest);
  document.getElementById('importGuestDataBtn').addEventListener('click', importGuestDataToSupabase);
  document.getElementById('logoutBtn').addEventListener('click', logoutCurrentUser);
  document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
    if (confirm('이전 루틴 기록, 완료 내역, 획득 보상, 옷장 및 인벤토리를 포함한 모든 데이터를 초기화하시겠습니까?')) {
      // 1. Reset Store data (Coins, Inventory, Avatar, Weekly/Monthly Stats)
      await window.godsaengStore.resetData();

      // 2. Clear all local task history, rewards, custom routine templates
      localStorage.removeItem(scopedStorageKey(TASKS_STORAGE_KEY));
      localStorage.removeItem(scopedStorageKey(REWARDS_STORAGE_KEY));
      localStorage.removeItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY));

      // Also clear legacy unscoped keys if present
      localStorage.removeItem(TASKS_STORAGE_KEY);
      localStorage.removeItem(REWARDS_STORAGE_KEY);
      localStorage.removeItem(CUSTOM_ROUTINES_STORAGE_KEY);

      // 3. If Supabase is active, clear tasks & custom templates in cloud DB
      if (window.godsaengStore.isSupabaseActive && dbSupabase && currentAuthUser) {
        try {
          await dbSupabase.from('tasks').delete().eq('user_id', currentAuthUser.id);
          await dbSupabase.from('routine_templates').delete().eq('user_id', currentAuthUser.id);
        } catch (e) {
          console.warn('Supabase cloud tasks reset failed', e);
        }
      }

      // 4. Reload state & re-render UI views
      await loadStateForDate(currentDateStr);
      renderCustomRoutineLibrary();
      await renderMarket();
      await renderCloset();
      await updateAvatarDisplay();
      await renderWeeklyStats();
      await renderGrassMap();
      await renderProbabilityModal();

      const coins = await window.godsaengStore.getCoins();
      document.getElementById('coinCount').textContent = coins;
      alert('이전 기록을 포함한 모든 데이터가 성공적으로 초기화되었습니다.');
      closeAuthModal();
    }
  });
  renderCustomRoutineLibrary();

  // Gacha & Prob Modal
  document.getElementById('luckyBoxBtn').addEventListener('click', () => triggerLuckyBox());
  document.getElementById('probInfoBtn')?.addEventListener('click', async () => {
    await renderProbabilityModal();
    document.getElementById('probModal').classList.add('show');
  });
  document.getElementById('probCloseBtn')?.addEventListener('click', () => {
    document.getElementById('probModal').classList.remove('show');
  });
  document.getElementById('gachaCloseBtn')?.addEventListener('click', () => {
    document.getElementById('gachaModal').classList.remove('show');
    const gachaBox = document.getElementById('gachaBox');
    gachaBox.textContent = '🚪';
    gachaBox.style.opacity = '1';
  });

  // Camera closing and webcam switches
  document.getElementById('closeCamBtn').addEventListener('click', closeCamera);
  document.getElementById('switchCamBtn').addEventListener('click', toggleCameraFacing);
  document.getElementById('shutterBtn').addEventListener('click', startCapture);
  document.getElementById('feedbackBtn').addEventListener('click', () => {
    alert("🎬 [오늘의 갓생 주간 피드백]\n\n'루틴을 성실히 실천 중이시네요! 아바타가 쑥쑥 크고 있습니다. 주말 루틴 완수율이 떨어지기 쉬우니 가벼운 이불 개기부터 내일도 실천해 보세요!'\n\n- AI 갓생 플래너 올림");
  });

  // Camera result handlers
  document.getElementById('confirmSuccessBtn').addEventListener('click', confirmSuccess);
  document.getElementById('retakePhotoBtn').addEventListener('click', retakePhoto);
  document.getElementById('confirmFailureBtn').addEventListener('click', confirmFailure);
}

// Date Navigation
function navigateDate(days) {
  const current = new Date(currentDateStr);
  current.setDate(current.getDate() + days);
  currentDateStr = current.toISOString().split('T')[0];
  document.getElementById('datePicker').value = currentDateStr;
  loadStateForDate(currentDateStr);
}

// Tab Indicator positioning
function positionTabIndicator() {
  const activeTab = document.querySelector('.tab-item.active');
  const indicator = document.getElementById('tabIndicator');
  if (activeTab && indicator) {
    const tabItems = Array.from(document.querySelectorAll('.tab-item'));
    const index = tabItems.indexOf(activeTab);
    indicator.style.transform = `translateX(${index * 100}%)`;
  }
}

// Load tasks and sync rendering for selected date
async function loadStateForDate(dateString) {
  currentRoutines = [];

  // Render local data first so the app remains instant and fully usable offline.
  const allLocalTasks = readTaskMap();
  if (Array.isArray(allLocalTasks[dateString])) {
    currentRoutines = allLocalTasks[dateString].slice(0, 3);
  }

  // Supabase is an optional recovery source, never a prerequisite.
  if (currentRoutines.length === 0 && window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { data: tasks, error } = await dbSupabase
        .from('tasks')
        .select('*')
        .eq('user_id', window.godsaengStore.currentUserId)
        .eq('date', dateString)
        .order('slot_number', { ascending: true });

      if (!error && tasks?.length) {
        currentRoutines = tasks.slice(0, 3);
        allLocalTasks[dateString] = currentRoutines;
        writeTaskMap(allLocalTasks);
      }
      updateSyncStatus(error ? 'offline' : 'synced');
    } catch (e) {
      updateSyncStatus('offline');
      console.info("동기화 데이터를 불러오지 못해 로컬 기록을 사용합니다.");
    }
  }

  // Sync Coin Count Indicator
  const coins = await window.godsaengStore.getCoins();
  document.getElementById('coinCount').textContent = coins;

  // Render Page Components
  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
  await renderGrassMap();
  renderMarket();
}

function getKstTodayString() {
  const offset = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + offset).toISOString().split('T')[0];
}

function getDateMode(dateString = currentDateStr) {
  const today = getKstTodayString();
  if (dateString < today) return 'past';
  if (dateString > today) return 'future';
  return 'today';
}

function updateDateModeUI() {
  const mode = getDateMode();
  const banner = document.getElementById('dateModeBanner');
  banner.className = `date-mode-banner ${mode === 'today' ? '' : `show ${mode}`}`.trim();
  if (mode === 'past') {
    banner.textContent = '지난 기록은 읽기 전용입니다. 완료 결과만 확인할 수 있어요.';
  } else if (mode === 'future') {
    banner.textContent = '미리 계획하는 루틴입니다. 완료와 인증은 해당 날짜가 되면 활성화돼요.';
  } else {
    banner.textContent = '';
  }
}

function updateSyncStatus(state) {
  const status = document.getElementById('syncStatus');
  const text = document.getElementById('syncStatusText');
  if (!status || !text) return;
  const resolvedState = navigator.onLine ? state : 'offline';
  status.className = `sync-status ${resolvedState}`;
  const userText = currentAuthUser
    ? `👤 ${currentAuthUser.email} 님`
    : '게스트 모드 · 로그인 / 회원가입';
  const labels = {
    local: userText,
    cloud: `👤 ${currentAuthUser?.email || '사용자'} 님 (클라우드)`,
    syncing: '클라우드 동기화 중…',
    synced: currentAuthUser ? `👤 ${currentAuthUser.email} 님 (동기화 완료)` : '클라우드 백업 완료',
    offline: '오프라인 (이 기기에 저장됨)'
  };
  text.textContent = labels[resolvedState] || labels.local;
}

function openAuthModal() {
  renderAuthView();
  const modal = document.getElementById('authModal');
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => {
    const target = currentAuthUser
      ? document.getElementById('logoutBtn')
      : document.getElementById('authEmailInput');
    target?.focus();
  }, 50);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  setAuthMessage('');
}

function renderAuthView() {
  const signedOut = document.getElementById('authSignedOutView');
  const signedIn = document.getElementById('authSignedInView');
  if (!signedOut || !signedIn) return;
  signedOut.hidden = !!currentAuthUser;
  signedIn.hidden = !currentAuthUser;
  document.getElementById('authAccountEmail').textContent = currentAuthUser?.email || '';
  const importButton = document.getElementById('importGuestDataBtn');
  if (importButton) {
    importButton.hidden = !currentAuthUser || !hasGuestData()
      || localStorage.getItem(`complete_guest_imported::${currentAuthUser?.id}`) === 'true';
  }
}

function setAuthMessage(message, isError = false) {
  const element = document.getElementById('authStatusMessage');
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? '#b13c3c' : '';
}

function getLocalCredentials() {
  const emailInput = document.getElementById('authEmailInput');
  const passwordInput = document.getElementById('authPasswordInput');
  const email = emailInput.value.trim().toLocaleLowerCase();
  const password = passwordInput.value;
  if (!email || !emailInput.checkValidity()) {
    setAuthMessage('형식에 맞는 이메일 주소를 입력해주세요.', true);
    emailInput.focus();
    return null;
  }
  if (password.length < 6) {
    setAuthMessage('비밀번호는 6자 이상 입력해주세요.', true);
    passwordInput.focus();
    return null;
  }
  return { email, password };
}

async function createLocalAccount() {
  const credentials = getLocalCredentials();
  if (!credentials) return;
  if (!dbSupabase) {
    setAuthMessage('클라우드 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.', true);
    return;
  }
  setAuthMessage('계정을 만드는 중이에요…');
  const { data, error } = await dbSupabase.auth.signUp(credentials);
  if (error) {
    setAuthMessage(error.message || '계정을 만들지 못했습니다.', true);
    return;
  }
  if (!data.session) {
    setAuthMessage('계정은 생성됐지만 이메일 확인 설정이 켜져 있습니다. Supabase에서 이메일 확인을 꺼주세요.', true);
    return;
  }
  await applySupabaseSession(data.user);
  finishAuthSuccess('계정이 생성되고 클라우드 동기화가 시작됐어요.');
}

async function loginLocalAccount() {
  const credentials = getLocalCredentials();
  if (!credentials) return;
  if (!dbSupabase) {
    setAuthMessage('클라우드 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.', true);
    return;
  }
  setAuthMessage('로그인하는 중이에요…');
  const { data, error } = await dbSupabase.auth.signInWithPassword(credentials);
  if (error) {
    setAuthMessage('이메일 또는 비밀번호를 확인해주세요.', true);
    return;
  }
  await applySupabaseSession(data.user);
  finishAuthSuccess('로그인되었습니다. 기록을 클라우드와 동기화했어요.');
}

async function applySupabaseSession(user) {
  if (user?.id === currentAuthUser?.id && window.godsaengStore.isSupabaseActive) return;
  currentAuthUser = user || null;
  if (!currentAuthUser) return;
  localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'account');
  window.godsaengStore.setupSupabase(dbSupabase, currentAuthUser.id);
  window.godsaengStore.setLocalScope(getActiveStorageScope());
  await window.godsaengStore.init();
  await loadCustomRoutinesFromCloud();
  renderAuthView();
  updateSyncStatus('synced');
  await loadStateForDate(currentDateStr);
}

function finishAuthSuccess(message) {
  setAuthMessage(message);
  document.getElementById('authPasswordInput').value = '';
  renderAuthView();
  if (document.getElementById('importGuestDataBtn').hidden) {
    window.setTimeout(closeAuthModal, 650);
  }
}

async function continueAsGuest() {
  localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'guest');
  if (dbSupabase) await dbSupabase.auth.signOut({ scope: 'local' });
  currentAuthUser = null;
  window.godsaengStore.setupSupabase(null, null);
  window.godsaengStore.setLocalScope('guest');
  await window.godsaengStore.init();
  updateSyncStatus('local');
  await loadStateForDate(currentDateStr);
  closeAuthModal();
}

async function logoutCurrentUser() {
  const button = document.getElementById('logoutBtn');
  button.disabled = true;
  setAuthMessage('로그아웃하는 중이에요…');
  try {
    if (dbSupabase) {
      const { error } = await dbSupabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    }
    localStorage.setItem(AUTH_CHOICE_STORAGE_KEY, 'guest');
    currentAuthUser = null;
    window.godsaengStore.setupSupabase(null, null);
    window.godsaengStore.setLocalScope('guest');
    await window.godsaengStore.init();
    updateSyncStatus('local');
    await loadStateForDate(currentDateStr);
    renderAuthView();
    setAuthMessage('로그아웃되었습니다. 게스트 모드로 계속 이용할 수 있어요.');
  } catch (error) {
    setAuthMessage(error?.message || '로그아웃하지 못했습니다.', true);
  } finally {
    button.disabled = false;
  }
}

function readCustomRoutines() {
  try {
    const routines = JSON.parse(localStorage.getItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY)) || '[]');
    if (!Array.isArray(routines)) return [];
    return routines.map(item => typeof item === 'string'
      ? { name: item, repeat: 'none', weekdays: [] }
      : item
    ).filter(item => item && typeof item.name === 'string');
  } catch {
    return [];
  }
}

function renderCustomRoutineLibrary() {
  const container = document.getElementById('customRoutineList');
  const routines = readCustomRoutines();
  container.innerHTML = '';
  renderScheduledRoutineSuggestions(routines);

  if (!routines.length) {
    container.innerHTML = '<span class="custom-routine-empty">저장한 루틴이 아직 없어요.</span>';
    return;
  }

  routines.forEach((routine, index) => {
    const row = document.createElement('div');
    row.className = 'custom-routine-item';
    row.innerHTML = `
      <button type="button" class="custom-routine-use" title="이 날짜에 추가">
        <span class="custom-routine-label">${escapeHtml(routine.name)}<small>${getRepeatLabel(routine)}</small></span>
      </button>
      <button type="button" class="custom-routine-delete" title="저장 목록에서 삭제" aria-label="${escapeHtml(routine.name)} 삭제">×</button>
    `;
    row.querySelector('.custom-routine-use').addEventListener('click', () => addNewRoutine(routine.name));
    row.querySelector('.custom-routine-delete').addEventListener('click', () => deleteCustomRoutine(index));
    container.appendChild(row);
  });
}

function getRepeatLabel(routine) {
  const labels = { none: '필요할 때 선택', daily: '매일', weekdays: '평일', weekends: '주말' };
  if (routine.repeat !== 'custom') return labels[routine.repeat] || labels.none;
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  return (routine.weekdays || []).map(day => dayLabels[day]).join('·') || '요일 미지정';
}

function matchesRoutineDate(routine, dateString) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  if (routine.repeat === 'daily') return true;
  if (routine.repeat === 'weekdays') return day >= 1 && day <= 5;
  if (routine.repeat === 'weekends') return day === 0 || day === 6;
  if (routine.repeat === 'custom') return (routine.weekdays || []).includes(day);
  return false;
}

function renderScheduledRoutineSuggestions(routines = readCustomRoutines()) {
  const container = document.getElementById('scheduledRoutineSuggestions');
  if (!container) return;
  const existingNames = new Set(currentRoutines.map(routine => routine.content));
  const matches = routines.filter(routine =>
    matchesRoutineDate(routine, currentDateStr) && !existingNames.has(routine.name)
  );
  container.innerHTML = '';
  if (!matches.length || getDateMode() === 'past' || currentRoutines.length >= 3) return;
  container.innerHTML = '<span class="scheduled-routine-heading">이 날짜의 반복 루틴 추천</span>';
  matches.forEach(routine => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scheduled-routine-btn';
    button.textContent = `＋ ${routine.name}`;
    button.addEventListener('click', () => addNewRoutine(routine.name));
    container.appendChild(button);
  });
}

async function saveCustomRoutine() {
  const input = document.getElementById('customRoutineInput');
  const value = input.value.trim();
  if (!value) return;

  const routines = readCustomRoutines();
  if (routines.some(routine => routine.name.toLocaleLowerCase() === value.toLocaleLowerCase())) {
    alert('이미 저장한 장기 루틴이에요.');
    return;
  }

  const repeat = document.getElementById('customRoutineRepeat').value;
  const weekdays = repeat === 'custom'
    ? Array.from(document.querySelectorAll('#customWeekdayPicker input:checked')).map(input => Number(input.value))
    : [];
  if (repeat === 'custom' && weekdays.length === 0) {
    alert('반복할 요일을 하나 이상 선택해주세요.');
    return;
  }
  const routine = { name: value, repeat, weekdays };
  routines.push(routine);
  localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(routines));
  if (window.godsaengStore.isSupabaseActive) {
    const { data, error } = await dbSupabase
      .from('routine_templates')
      .upsert({
        user_id: currentAuthUser.id,
        name: value,
        repeat,
        weekdays,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,name' })
      .select()
      .single();
    if (!error && data) {
      routine.id = data.id;
      localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(routines));
      updateSyncStatus('synced');
    } else if (error) {
      updateSyncStatus('offline');
    }
  }
  input.value = '';
  document.getElementById('customRoutineRepeat').value = 'none';
  document.getElementById('customWeekdayPicker').hidden = true;
  document.querySelectorAll('#customWeekdayPicker input').forEach(checkbox => { checkbox.checked = false; });
  renderCustomRoutineLibrary();
}

async function deleteCustomRoutine(index) {
  const routines = readCustomRoutines();
  const [removed] = routines.splice(index, 1);
  localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(routines));
  if (removed?.id && window.godsaengStore.isSupabaseActive) {
    const { error } = await dbSupabase
      .from('routine_templates')
      .delete()
      .eq('id', removed.id)
      .eq('user_id', currentAuthUser.id);
    updateSyncStatus(error ? 'offline' : 'synced');
  }
  renderCustomRoutineLibrary();
}

async function loadCustomRoutinesFromCloud() {
  if (!window.godsaengStore.isSupabaseActive) return;
  const { data, error } = await dbSupabase
    .from('routine_templates')
    .select('id,name,repeat,weekdays')
    .eq('user_id', currentAuthUser.id)
    .order('created_at', { ascending: true });
  if (!error && data) {
    localStorage.setItem(scopedStorageKey(CUSTOM_ROUTINES_STORAGE_KEY), JSON.stringify(data));
    renderCustomRoutineLibrary();
  }
}

function hasGuestData() {
  try {
    const taskMap = JSON.parse(localStorage.getItem(storageKeyForScope(TASKS_STORAGE_KEY, 'guest')) || '{}');
    const routines = JSON.parse(localStorage.getItem(storageKeyForScope(CUSTOM_ROUTINES_STORAGE_KEY, 'guest')) || '[]');
    return Object.values(taskMap).some(tasks => Array.isArray(tasks) && tasks.length > 0)
      || (Array.isArray(routines) && routines.length > 0);
  } catch {
    return false;
  }
}

async function importGuestDataToSupabase() {
  if (!currentAuthUser || !dbSupabase) return;
  const button = document.getElementById('importGuestDataBtn');
  button.disabled = true;
  setAuthMessage('게스트 기록을 안전하게 가져오는 중이에요…');
  try {
    const taskMap = JSON.parse(localStorage.getItem(storageKeyForScope(TASKS_STORAGE_KEY, 'guest')) || '{}');
    const guestTasks = Object.entries(taskMap).flatMap(([date, tasks]) =>
      (Array.isArray(tasks) ? tasks : []).slice(0, 3).map((task, index) => ({
        user_id: currentAuthUser.id,
        date,
        slot_number: task.slot_number || index + 1,
        content: task.content,
        is_done: !!task.is_done,
        image_url: task.image_url || null,
        ai_feedback: task.ai_feedback || null,
        completed_at: task.completed_at || null
      }))
    ).filter(task => task.content);

    if (guestTasks.length) {
      const { data: existing, error: readError } = await dbSupabase
        .from('tasks')
        .select('date,slot_number,content')
        .eq('user_id', currentAuthUser.id);
      if (readError) throw readError;
      const existingKeys = new Set((existing || []).map(task => `${task.date}|${task.slot_number}|${task.content}`));
      const missing = guestTasks.filter(task => !existingKeys.has(`${task.date}|${task.slot_number}|${task.content}`));
      if (missing.length) {
        const { error } = await dbSupabase.from('tasks').insert(missing);
        if (error) throw error;
      }
    }

    const guestRoutines = JSON.parse(localStorage.getItem(storageKeyForScope(CUSTOM_ROUTINES_STORAGE_KEY, 'guest')) || '[]');
    if (Array.isArray(guestRoutines) && guestRoutines.length) {
      const payload = guestRoutines.map(routine => ({
        user_id: currentAuthUser.id,
        name: typeof routine === 'string' ? routine : routine.name,
        repeat: typeof routine === 'string' ? 'none' : routine.repeat || 'none',
        weekdays: typeof routine === 'string' ? [] : routine.weekdays || [],
        updated_at: new Date().toISOString()
      })).filter(routine => routine.name);
      const { error } = await dbSupabase
        .from('routine_templates')
        .upsert(payload, { onConflict: 'user_id,name' });
      if (error) throw error;
    }

    localStorage.setItem(`complete_guest_imported::${currentAuthUser.id}`, 'true');
    await loadCustomRoutinesFromCloud();
    await loadStateForDate(currentDateStr);
    updateSyncStatus('synced');
    setAuthMessage('게스트 루틴과 기록을 계정으로 가져왔어요. 기존 게스트 기록은 그대로 보관됩니다.');
    renderAuthView();
  } catch (error) {
    setAuthMessage(error?.message || '게스트 기록을 가져오지 못했습니다.', true);
  } finally {
    button.disabled = false;
  }
}

// Lazy mode only activates after two consecutive failed days.
async function checkYesterdayLazyStatus() {
  const taskMap = readTaskMap();
  const failedDays = [];

  for (let daysAgo = 1; daysAgo <= 2; daysAgo++) {
    const date = new Date(`${currentDateStr}T00:00:00`);
    date.setDate(date.getDate() - daysAgo);
    const dateString = date.toISOString().split('T')[0];
    const tasks = taskMap[dateString] || [];
    failedDays.push(tasks.length > 0 && tasks.every(task => !task.is_done));
  }

  return failedDays.every(Boolean);
}

// Render routines list (Max 3 items)
function renderRoutines() {
  const container = document.getElementById('routineList');
  container.innerHTML = '';
  const dateMode = getDateMode();
  updateDateModeUI();

  let completedCount = 0;

  currentRoutines.forEach(r => {
    if (r.is_done) completedCount++;
    const canEdit = dateMode !== 'past' && !r.is_done;
    const canVerify = dateMode === 'today' && !r.is_done;
    const canToss = dateMode === 'today' && !r.is_done;
    const canDelete = dateMode !== 'past' && !r.is_done;

    const card = document.createElement('div');
    card.className = `routine-card ${r.is_done ? 'completed' : ''}`;
    card.innerHTML = `
      <div class="routine-left">
        <span class="routine-tag">SLOT ${r.slot_number}</span>
        <input type="text" class="routine-title-input" aria-label="${r.slot_number}번 루틴" value="${escapeHtml(r.content)}" onchange="updateRoutineText('${r.id}', this.value)" ${canEdit ? '' : 'disabled'}>
      </div>
      <div class="routine-actions">
        <button class="toss-btn" onclick="tossToTomorrow('${r.id}', event)" title="내일로 루틴 토스" aria-label="${r.slot_number}번 루틴 내일로 토스" ${canToss ? '' : 'disabled'}>
          <i data-lucide="corner-down-right"></i>
        </button>
        <button class="delete-routine-btn" onclick="deleteRoutine('${r.id}', event)" title="루틴 삭제" aria-label="${r.slot_number}번 루틴 삭제" ${canDelete ? '' : 'disabled'}>
          <i data-lucide="trash-2"></i>
        </button>
        <button class="checkbox-custom" onclick="requestRoutineVerification('${r.id}', event)" title="${r.is_done ? '인증 완료' : dateMode === 'future' ? '당일에 완료할 수 있어요' : '인증 후 완료'}" aria-label="${r.slot_number}번 루틴 ${r.is_done ? '인증 완료됨' : '인증 시작'}" aria-pressed="${r.is_done}" ${canVerify ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5"></path>
          </svg>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  if (currentRoutines.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'routine-empty-state';
    empty.textContent = dateMode === 'past'
      ? '이 날짜에는 저장된 루틴이 없습니다.'
      : dateMode === 'future'
        ? '미리 계획할 루틴을 추가해보세요.'
        : '오늘 집중할 작은 루틴을 추가해보세요.';
    container.appendChild(empty);
  }

  // Progress UI modifiers
  document.getElementById('routineProgressText').textContent = currentRoutines.length
    ? `${completedCount} / ${currentRoutines.length} 완료`
    : '0 / 3 슬롯';

  // Growth rates calculation
  const growthPct = Math.round((completedCount / 3) * 100);
  document.getElementById('growthProgressBar').style.width = `${growthPct}%`;
  document.getElementById('growthPercent').textContent = `성장률: ${growthPct}%`;

  let statusMsg = "오늘 첫 루틴을 실천하고 새싹이를 키워보세요! 🌱";
  if (completedCount === 1) statusMsg = "조금씩 자라기 시작합니다! 파이팅 🌱";
  else if (completedCount === 2) statusMsg = "무럭무럭 크는 중입니다! 한 개만 더요 🌿";
  else if (completedCount === 3) statusMsg = "대성공! 멋지게 꽃을 피웠습니다 🌸";
  document.getElementById('statusMessage').textContent = statusMsg;

  // Toggle routine adding form visibility based on 3-task limit
  const addForm = document.getElementById('routineQuickAddForm');
  const templateSection = document.getElementById('routineTemplateSection');
  if (dateMode !== 'past' && currentRoutines.length < 3) {
    addForm.style.display = 'flex';
    templateSection.style.display = 'block';
  } else {
    addForm.style.display = 'none';
    templateSection.style.display = 'none';
  }
  renderScheduledRoutineSuggestions();

  // Update Grass value for today
  updateTodayGrass(completedCount);
  if (window.lucide) lucide.createIcons();
}

// Edit routine content inline
async function updateRoutineText(id, newText) {
  const task = currentRoutines.find(r => r.id === id);
  const normalizedText = newText.trim();
  if (!task || task.is_done || getDateMode() === 'past' || !normalizedText) {
    renderRoutines();
    return;
  }

  task.content = normalizedText;
  task.updated_at = new Date().toISOString();
  saveCurrentRoutinesLocally();

  if (window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { error } = await dbSupabase
        .from('tasks')
        .update({ content: normalizedText, updated_at: task.updated_at })
        .eq('id', id);
      if (error) throw error;
      updateSyncStatus('synced');
    } catch (e) {
      updateSyncStatus('offline');
      console.info("루틴 수정은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
    }
  }
  renderRoutines();
  await updateAvatarDisplay();
}

async function deleteRoutine(id, event) {
  event?.stopPropagation();
  const task = currentRoutines.find(r => r.id === id);
  if (!task || task.is_done || getDateMode() === 'past') return;

  currentRoutines = currentRoutines.filter(r => r.id !== id);
  currentRoutines.forEach((routine, index) => {
    routine.slot_number = index + 1;
    routine.updated_at = new Date().toISOString();
  });
  saveCurrentRoutinesLocally();

  if (window.godsaengStore.isSupabaseActive && !String(id).startsWith('local_')) {
    try {
      updateSyncStatus('syncing');
      const { error } = await dbSupabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      updateSyncStatus('synced');
    } catch {
      updateSyncStatus('offline');
      console.info("삭제 내용은 로컬에 반영되었고 동기화는 나중에 다시 시도합니다.");
    }
  }

  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
  await renderGrassMap();
  lucide.createIcons();
}

function requestRoutineVerification(id, event) {
  event?.stopPropagation();
  const task = currentRoutines.find(routine => routine.id === id);
  if (!task || task.is_done || getDateMode() !== 'today') return;
  openCamera(id, event);
}

// Confetti Particle Explosion Generator
function triggerConfetti(element) {
  const rect = element.getBoundingClientRect();
  const card = element.closest('.routine-card');
  const colors = ['#9fe870', '#e2f6d5', '#00BA9D', '#ffd11a', '#ff007f', '#00f2fe'];
  
  for (let i = 0; i < 15; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Set random offset targets inside CSS variables
    const tx = (Math.random() - 0.5) * 80;
    const ty = (Math.random() - 0.5) * 80 - 30; // slightly upwards bias
    
    particle.style.setProperty('--tx', `${tx}px`);
    particle.style.setProperty('--ty', `${ty}px`);
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Positioning near checkbox center
    particle.style.left = `${rect.left + rect.width / 2 - 3}px`;
    particle.style.top = `${rect.top + rect.height / 2 - 3}px`;
    particle.style.position = 'fixed';
    
    document.body.appendChild(particle);
    
    // Cleanup after animation completes
    setTimeout(() => {
      particle.remove();
    }, 600);
  }
}

// Toss routine to tomorrow (Slide 6 spec)
async function tossToTomorrow(id, event) {
  if (event) event.stopPropagation();

  const task = currentRoutines.find(r => r.id === id);
  if (!task || task.is_done || getDateMode() !== 'today') return;

  // 1. Calculate tomorrow date string
  const current = new Date(currentDateStr);
  current.setDate(current.getDate() + 1);
  const tomorrowStr = current.toISOString().split('T')[0];

  // 2. Move in the local source of truth first.
  const allLocalTasks = readTaskMap();
  const tomorrowRoutines = Array.isArray(allLocalTasks[tomorrowStr])
    ? allLocalTasks[tomorrowStr].slice(0, 3)
    : [];

  // 3. Verify tomorrow limits (under 3-Task limit)
  if (tomorrowRoutines.length >= 3) {
    alert("내일의 갓생 루틴 슬롯이 이미 3개 모두 차 있습니다! 내일 루틴을 확인하고 슬롯을 비워주세요.");
    return;
  }

  const nextSlot = tomorrowRoutines.length + 1;

  const tossedTask = createLocalTask(tomorrowStr, nextSlot, task.content);
  tomorrowRoutines.push(tossedTask);
  allLocalTasks[tomorrowStr] = tomorrowRoutines;

  const todayFiltered = currentRoutines.filter(r => r.id !== id);
  todayFiltered.forEach((routine, index) => {
    routine.slot_number = index + 1;
    routine.updated_at = new Date().toISOString();
  });
  allLocalTasks[currentDateStr] = todayFiltered;
  writeTaskMap(allLocalTasks);

  // Best-effort cloud mirror for signed-in users.
  if (window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { data: insertedTask, error: insertError } = await dbSupabase.from('tasks').insert({
        user_id: window.godsaengStore.currentUserId,
        date: tomorrowStr,
        slot_number: nextSlot,
        content: task.content,
        is_done: false
      }).select().single();
      if (insertError) throw insertError;
      if (insertedTask) {
        tomorrowRoutines[tomorrowRoutines.length - 1] = insertedTask;
        allLocalTasks[tomorrowStr] = tomorrowRoutines;
        writeTaskMap(allLocalTasks);
      }
      if (!String(id).startsWith('local_')) {
        const { error: deleteError } = await dbSupabase.from('tasks').delete().eq('id', id);
        if (deleteError) throw deleteError;
      }
      updateSyncStatus('synced');
    } catch {
      updateSyncStatus('offline');
      console.info("내일로 토스는 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
    }
  }

  alert(`"${task.content}" 루틴이 내일(${tomorrowStr}) 날짜로 안전하게 토스되었습니다! 내일은 꼭 성공해 봅시다. 🔥`);
  await loadStateForDate(currentDateStr);
}

// Add routine under 3-Task Focus Rule
async function addNewRoutine(templateValue = '') {
  const input = document.getElementById('quickAddInput');
  const val = (templateValue || input.value).trim();

  if (getDateMode() === 'past') return;

  if (!val) {
    alert("루틴 이름을 입력해 주세요!");
    return;
  }

  if (currentRoutines.length >= 3) {
    alert("오늘의 갓생 루틴은 최대 3개로 엄격하게 제한됩니다! 오늘 집중할 3개만 유지해주세요.");
    return;
  }

  const nextSlot = currentRoutines.length + 1;
  const newRow = createLocalTask(currentDateStr, nextSlot, val);
  currentRoutines.push(newRow);
  saveCurrentRoutinesLocally();

  if (window.godsaengStore.isSupabaseActive) {
    try {
      updateSyncStatus('syncing');
      const { data: insertedTask, error } = await dbSupabase
        .from('tasks')
        .insert({
          user_id: window.godsaengStore.currentUserId,
          date: currentDateStr,
          slot_number: nextSlot,
          content: val,
          is_done: false
        })
        .select()
        .single();
      if (error) throw error;
      if (insertedTask) {
        Object.assign(newRow, insertedTask);
        saveCurrentRoutinesLocally();
      }
      updateSyncStatus('synced');
    } catch {
      updateSyncStatus('offline');
      console.info("새 루틴은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
    }
  }

  input.value = '';
  document.getElementById('routineTemplatePanel').hidden = true;
  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
}

// Draw Avatar SVG representation dynamically
async function updateAvatarDisplay() {
  const box = document.getElementById('avatarBox');
  if (!box) return;

  const completedCount = currentRoutines.filter(r => r.is_done).length;
  const equipped = await window.godsaengStore.getEquippedItems();
  const activeSkin = await window.godsaengStore.getActiveSkin();
  const activeTitle = await window.godsaengStore.getActiveTitle();

  // Set equipped title name
  const titleObj = window.godsaengStore.titlesCatalog[activeTitle];
  document.getElementById('equippedTitleText').textContent =
    activeTitle === 'none' ? '칭호 없음' : (titleObj ? titleObj.name : '초보 갓생러 🌱');

  // Any success today immediately clears lazy mode.
  const isLazy = completedCount === 0 && await checkYesterdayLazyStatus();

  // Level mapping: 0 completed = lvl 0, 1 = lvl 1, 2 = lvl 2, 3 = lvl 3
  const level = completedCount;

  const renderState = {
    level: level,
    skin: activeSkin,
    items: equipped,
    interest: 'none',
    isLazy: isLazy
  };

  const svg = window.avatarRenderer.render(renderState);
  box.innerHTML = svg;
}

// Grass Grid handler
async function renderGrassMap() {
  const grid = document.getElementById('grassGrid');
  if (!grid) return;

  grid.innerHTML = '';
  const taskMap = readTaskMap();
  const recordedDates = Object.keys(taskMap).sort().slice(-35);
  const list = recordedDates.map(dateString => {
    const tasks = taskMap[dateString] || [];
    return {
      dateString,
      level: Math.min(3, tasks.filter(task => task.is_done).length)
    };
  });

  for (let index = 0; index < 35; index++) {
    const record = list[index];
    const cell = document.createElement('div');
    const level = record?.level || 0;
    cell.className = `grass-cell grass-level-${level}`;

    let desc = record ? `${record.dateString}: ` : '아직 기록이 없는 칸';
    if (record && level === 0) desc += '쉬어갔어요 💤';
    else if (record && level === 1) desc += '1개 완료 🌱';
    else if (record && level === 2) desc += '2개 완료 🌿';
    else if (record && level === 3) desc += '3개 완료, 대성공! 🌸';

    cell.setAttribute('data-tip', desc);
    cell.setAttribute('aria-label', desc);
    cell.setAttribute('role', 'img');
    grid.appendChild(cell);
  }
}

// Local grass mapping update
async function updateTodayGrass(completedCount) {
  const level = Math.max(0, Math.min(3, completedCount));
  const date = new Date(currentDateStr);
  const today = new Date();
  const diffDays = Math.round((today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays >= 0 && diffDays < 35) {
    await window.godsaengStore.saveMonthlyGrass(34 - diffDays, level);
  }
}

// Weekly Chart renderers with mini avatar indicators (Slide 9 spec)
async function renderWeeklyStats() {
  const weeklyContainer = document.getElementById('weeklyChart');
  if (!weeklyContainer) return;

  weeklyContainer.innerHTML = '';
  const taskMap = readTaskMap();
  const allRecordedDates = Object.keys(taskMap).sort();
  const todayString = new Date().toISOString().split('T')[0];
  const today = new Date(`${todayString}T00:00:00`);
  const firstRecord = allRecordedDates.length
    ? new Date(`${allRecordedDates[0]}T00:00:00`)
    : new Date(today);
  const elapsedDays = Math.max(0, Math.floor((today - firstRecord) / 86400000));
  const windowStart = new Date(elapsedDays < 7 ? firstRecord : today);
  if (elapsedDays >= 7) windowStart.setDate(today.getDate() - 6);

  const displayedDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(windowStart);
    date.setDate(windowStart.getDate() + index);
    return date.toISOString().split('T')[0];
  });
  const valArr = displayedDates.map(dateString =>
    Math.min(3, (taskMap[dateString] || []).filter(task => task.is_done).length)
  );
  await window.godsaengStore.saveWeeklyAchievement(valArr);

  valArr.forEach((val, idx) => {
    const dateString = displayedDates[idx];
    const date = new Date(`${dateString}T00:00:00`);
    const label = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    const hasRecord = Array.isArray(taskMap[dateString]);
    const isToday = dateString === todayString;
    
    // Create mini sprout rendering state
    const miniState = {
      level: val,
      skin: 'default',
      items: [],
      interest: 'none',
      isLazy: false
    };
    const miniSvgStr = hasRecord ? window.avatarRenderer.render(miniState) : '';

    const bar = document.createElement('div');
    bar.className = `chart-bar-container ${isToday ? 'today' : ''}`;
    bar.innerHTML = `
      <div class="chart-bar-wrap" title="${dateString} · ${hasRecord ? `${val}개 완료` : '아직 기록 없음'}">
        <div class="chart-bar-fill" style="height: 0%"></div>
      </div>
      <span class="chart-bar-label">${label}</span>
    `;
    weeklyContainer.appendChild(bar);
  });
}

async function renderMarket(category = 'all') {
  const grid = document.getElementById('marketGrid');
  if (!grid || !document.getElementById('subtab-market').classList.contains('active')) return;

  // Active category tab fallback
  const activeTab = document.querySelector('.closet-tab.active');
  if (activeTab && category === 'all') {
    category = activeTab.getAttribute('data-category') || 'all';
  }

  grid.innerHTML = '';
  const purchased = await window.godsaengStore.getPurchasedItems();

  const catalogs = window.godsaengStore.itemsCatalog;
  const storeItems = Object.keys(catalogs);
  const unownedStore = storeItems.filter(id => !purchased.includes(id));
  const storeChancePerItem = unownedStore.length > 0 ? (35.0 / unownedStore.length).toFixed(1) : '0.0';

  // 등급 우선순위 정렬 (Special > Point > Basic)
  const gradeOrder = { 'Special': 3, 'Point': 2, 'Basic': 1 };
  const sortedItems = Object.entries(catalogs).sort((a, b) => {
    return (gradeOrder[b[1].grade] || 0) - (gradeOrder[a[1].grade] || 0);
  });

  let displayedCount = 0;

  for (const [id, item] of sortedItems) {
    const isOwned = purchased.includes(id);
    if (isOwned) continue; // 보유 중인 아이템은 상점에서 사라지게 만들기

    // Determine category
    let itemCategory = 'accessory';
    if (id.startsWith('room_')) {
      itemCategory = 'background';
    } else if (Object.keys(window.godsaengStore.titlesCatalog).includes(id)) {
      itemCategory = 'title';
    } else if (['default', 'green', 'purple', 'blue', 'gold'].includes(id)) {
      itemCategory = 'top'; // Map skins to 'top'
    }

    if (category !== 'all' && itemCategory !== category) continue;

    displayedCount++;
    const gradeText = item.grade === 'Special' ? '전설' : (item.grade === 'Point' ? '영웅' : (item.grade === 'Basic' ? '희귀' : '일반'));
    const gradeClass = item.grade === 'Special' ? 'tag-special' : (item.grade === 'Point' ? 'tag-epic' : (item.grade === 'Basic' ? 'tag-point' : 'tag-basic'));

    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-card-info">
        <span class="shop-card-tag ${gradeClass}">${gradeText}</span>
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-desc">${item.desc}</span>
      </div>
      <div class="shop-card-footer">
        <span class="shop-card-price">${item.cost} 코인</span>
        <button class="shop-buy-btn" onclick="buyShopItem('${id}')">구매</button>
      </div>
    `;
    grid.appendChild(card);
  }

  // 상점이 비어있을 경우 안내 문구 노출
  if (grid.innerHTML === '') {
    if (displayedCount === 0 && category !== 'all') {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 0;">해당 카테고리에 상점 아이템이 없습니다.</div>';
    } else {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 0;">모든 상점 아이템을 구매하셨습니다.</div>';
    }
  }
}

async function renderCloset(category = 'all') {
  const grid = document.getElementById('closetGrid');
  if (!grid) return;

  // Active category tab fallback
  const activeTab = document.querySelector('.closet-tab.active');
  if (activeTab && category === 'all') {
    category = activeTab.getAttribute('data-category') || 'all';
  }

  grid.innerHTML = '';
  const purchased = await window.godsaengStore.getPurchasedItems();
  const equipped = await window.godsaengStore.getEquippedItems();

  const allItems = {
    ...window.godsaengStore.itemsCatalog,
    ...window.godsaengStore.gachaCatalog,
    ...window.godsaengStore.titlesCatalog
  };

  // 등급 우선순위 정렬 시스템
  const gradeOrder = { 'Special': 3, 'Point': 2, 'Basic': 1 };
  const sortedOwnedItems = Object.entries(allItems)
    .filter(([id]) => purchased.includes(id) || id === 'beginner' || id === 'default')
    .sort((a, b) => {
      const gA = gradeOrder[a[1].grade] || 0;
      const gB = gradeOrder[b[1].grade] || 0;
      return gB - gA;
    });

  for (const [id, item] of sortedOwnedItems) {
    // Determine category
    let itemCategory = 'accessory';
    if (id.startsWith('room_')) {
      itemCategory = 'background';
    } else if (Object.keys(window.godsaengStore.titlesCatalog).includes(id)) {
      itemCategory = 'title';
    } else if (['default', 'green', 'purple', 'blue', 'gold'].includes(id)) {
      itemCategory = 'top'; // Map skins to 'top' since there are no clothes currently
    }

    if (category !== 'all' && itemCategory !== category) continue;

    const isEquipped = equipped.includes(id) || (id === 'default' && !equipped.includes('green') && !equipped.includes('purple') && !equipped.includes('blue') && !equipped.includes('gold'));
    const isEquippedTitle = equipped.includes(id);
    const isRoom = id.startsWith('room_');
    const isTitle = Object.keys(window.godsaengStore.titlesCatalog).includes(id);
    const isSkin = ['default', 'green', 'purple', 'blue', 'gold'].includes(id);
    const active = isEquipped || isEquippedTitle;
    let actionLabel = active ? '장착해제' : '장착하기';
    if (isRoom) actionLabel = active ? '적용 중' : '배경 교체';
    else if (isTitle) actionLabel = active ? '칭호 해제' : '칭호 장착';
    else if (isSkin) actionLabel = id === 'default' && active ? '기본 스킨' : (active ? '스킨 해제' : '스킨 적용');

    const itemGrade = item.grade || 'Basic';
    const gradeText = itemGrade === 'Special' ? '전설' : (itemGrade === 'Point' ? '영웅' : (itemGrade === 'Basic' ? '희귀' : '일반'));
    const gradeClass = itemGrade === 'Special' ? 'tag-special' : (itemGrade === 'Point' ? 'tag-epic' : (itemGrade === 'Basic' ? 'tag-point' : 'tag-basic'));

    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-card-info">
        <span class="shop-card-tag ${gradeClass}">${gradeText}</span>
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-desc">${item.desc}</span>
      </div>
      <div class="shop-card-footer">
        <button class="closet-equip-btn ${active ? 'active' : ''}" onclick="equipClosetItem('${id}')" ${(isRoom && active) || (id === 'default' && active) ? 'disabled' : ''}>
          ${actionLabel}
        </button>
      </div>
    `;
    grid.appendChild(card);
  }
}

async function buyShopItem(itemId) {
  const result = await window.godsaengStore.buyItem(itemId);
  alert(result.message);
  
  if (result.success) {
    const coins = await window.godsaengStore.getCoins();
    document.getElementById('coinCount').textContent = coins;
    renderMarket();
  }
}

async function equipClosetItem(itemId) {
  const success = await window.godsaengStore.equipItem(itemId);
  if (success) {
    renderCloset();
    await updateAvatarDisplay();
  }
}

async function renderProbabilityModal() {
  const tbody = document.getElementById('probTableBody');
  if (!tbody || !window.godsaengStore) return;

  const purchased = await window.godsaengStore.getPurchasedItems();

  // Tier 1: Legendary (전설) - Gold
  const legendaryItems = ['crown', 'goggles', 'gold', 'blue', 'airpods_rainbow', 'iced_coffee_galaxy', 'dumbbell_gold', 'room_vintage'];
  const unownedLegendary = legendaryItems.filter(id => !purchased.includes(id));
  const wLegendary = unownedLegendary.length * 15;

  // Tier 2: Epic (영웅) - Purple
  const epicItems = ['green', 'purple', 'iced_coffee_pink', 'dumbbell_purple', 'airpods_green', 'room_forest'];
  const unownedEpic = epicItems.filter(id => !purchased.includes(id));
  const wEpic = unownedEpic.length * 10;

  // Tier 3: Rare (희귀) - Blue
  const rareItems = ['iced_coffee_black', 'dumbbell_iron', 'airpods_silver', 'sweatband', 'glasses', 'room_classic'];
  const unownedRare = rareItems.filter(id => !purchased.includes(id));
  const wRare = unownedRare.length * 8;

  // Tier 4: Common (일반/코인) - Gray (Infinite item)
  const wCommon = 40;

  const wTotal = wLegendary + wEpic + wRare + wCommon;

  const pctLegendary = wTotal > 0 ? ((wLegendary / wTotal) * 100).toFixed(1) : '0.0';
  const pctEpic = wTotal > 0 ? ((wEpic / wTotal) * 100).toFixed(1) : '0.0';
  const pctRare = wTotal > 0 ? ((wRare / wTotal) * 100).toFixed(1) : '0.0';
  const pctCommon = wTotal > 0 ? ((wCommon / wTotal) * 100).toFixed(1) : '0.0';

  tbody.innerHTML = `
    <tr class="grade-legendary">
      <td><span class="shop-card-tag tag-special">전설 등급</span></td>
      <td class="text-right">
        ${unownedLegendary.length > 0 
          ? `<strong>${pctLegendary}%</strong> <span class="prob-sub-text">(남은 수량 ${unownedLegendary.length}개)</span>` 
          : `<span class="all-collected-badge">0.0% (소진됨)</span>`}
      </td>
    </tr>
    <tr class="grade-epic">
      <td><span class="shop-card-tag tag-epic">영웅 등급</span></td>
      <td class="text-right">
        ${unownedEpic.length > 0 
          ? `<strong>${pctEpic}%</strong> <span class="prob-sub-text">(남은 수량 ${unownedEpic.length}개)</span>` 
          : `<span class="all-collected-badge">0.0% (소진됨)</span>`}
      </td>
    </tr>
    <tr class="grade-rare">
      <td><span class="shop-card-tag tag-point">희귀 등급</span></td>
      <td class="text-right">
        ${unownedRare.length > 0 
          ? `<strong>${pctRare}%</strong> <span class="prob-sub-text">(남은 수량 ${unownedRare.length}개)</span>` 
          : `<span class="all-collected-badge">0.0% (소진됨)</span>`}
      </td>
    </tr>
    <tr class="grade-common">
      <td><span class="shop-card-tag tag-basic">일반 등급</span></td>
      <td class="text-right"><strong>${pctCommon}%</strong> <span class="prob-sub-text">(코인 환급)</span></td>
    </tr>
  `;
}

async function triggerLuckyBox() {
  const result = await window.godsaengStore.playLuckyBox();
  if (!result.success) {
    alert(result.message);
    return;
  }

  // Pre-determined Target Grade
  const targetGrade = result.grade || 'Common';
  let targetStep = 1;
  let finalColor = '#6b7280'; // Common Gray
  let gradeText = '일반';
  let gradeTagClass = 'tag-basic';

  if (targetGrade === 'Legendary') {
    targetStep = 4; finalColor = '#f59e0b'; gradeText = '전설'; gradeTagClass = 'tag-special';
  } else if (targetGrade === 'Epic') {
    targetStep = 3; finalColor = '#7c3aed'; gradeText = '영웅'; gradeTagClass = 'tag-epic';
  } else if (targetGrade === 'Rare') {
    targetStep = 2; finalColor = '#2563eb'; gradeText = '희귀'; gradeTagClass = 'tag-point';
  }

  // UI Elements
  const gachaModal = document.getElementById('gachaModal');
  const closetWardrobe = document.getElementById('closetWardrobe');
  const closetAura = document.getElementById('closetAura');
  const gachaLight = document.getElementById('gachaLight');
  const gachaResult = document.getElementById('gachaResult');
  const icon = document.getElementById('gachaItemIcon');
  const name = document.getElementById('gachaItemName');
  const desc = document.getElementById('gachaItemDesc');

  // Reset initial modal state
  if (closetWardrobe) closetWardrobe.className = 'closet-wardrobe';
  if (closetAura) closetAura.className = 'closet-aura';
  gachaLight.classList.remove('glowing-burst');
  gachaResult.classList.remove('float-up');
  gachaModal.classList.add('show');
  gachaLight.style.color = finalColor;

  icon.textContent = '';
  name.textContent = '';
  desc.textContent = '';

  // Function to trigger door impact shake on grade upgrade
  const triggerImpactShake = () => {
    if (!closetWardrobe) return;
    closetWardrobe.classList.remove('grade-bump');
    void closetWardrobe.offsetWidth; // Force reflow
    closetWardrobe.classList.add('grade-bump');
  };

  // Step 1: Initial Rattle + Common White/Gray Aura
  closetAura.className = 'closet-aura step-common';
  triggerImpactShake();

  const STEP_INTERVAL = 600;

  // Step 2: If target >= Rare, upgrade aura to Blue + IMPACT SHAKE
  if (targetStep >= 2) {
    setTimeout(() => {
      closetAura.className = 'closet-aura step-rare';
      triggerImpactShake();
    }, STEP_INTERVAL);
  }

  // Step 3: If target >= Epic, upgrade aura to Purple + IMPACT SHAKE
  if (targetStep >= 3) {
    setTimeout(() => {
      closetAura.className = 'closet-aura step-epic';
      triggerImpactShake();
    }, STEP_INTERVAL * 2);
  }

  // Step 4: If target == Legendary, upgrade aura to Gold + IMPACT SHAKE
  if (targetStep >= 4) {
    setTimeout(() => {
      closetAura.className = 'closet-aura step-legendary';
      triggerImpactShake();
    }, STEP_INTERVAL * 3);
  }

  // Step 5: Door Burst Open & Result Reveal dynamically based on targetStep
  const totalOpenDelay = targetStep * STEP_INTERVAL;
  setTimeout(() => {
    closetWardrobe.classList.remove('grade-bump');
    closetWardrobe.classList.add('open');
    gachaLight.classList.add('glowing-burst');

    setTimeout(async () => {
      // Sleek Grade Badge Pill & Result Card
      icon.textContent = gradeText;
      icon.className = `gacha-item-icon ${gradeTagClass}`;
      name.textContent = result.name || result.message;
      desc.textContent = result.message;
      gachaResult.classList.add('float-up');

      // Update store UI
      window.godsaengStore.getCoins().then(c => document.getElementById('coinCount').textContent = c);
      await renderMarket();
      await renderCloset();
      await updateAvatarDisplay();
    }, 400);
  }, totalOpenDelay);
}

// ==========================================================================
// CAMERA AUTHENTICATION LOGIC (Digital timestamp & Gemini Vision AI)
// ==========================================================================
let activeCameraTaskId = null;
let webcamStream = null;
let cameraFacingMode = 'user';
let capturedFrames = [];
let recordingTimer = null;
let boomerangPlayTimer = null;
let isRecording = false;

function openCamera(taskId, event) {
  if (event) event.stopPropagation();

  const task = currentRoutines.find(r => r.id === taskId);
  if (!task || task.is_done || getDateMode() !== 'today') return;

  activeCameraTaskId = taskId;
  document.getElementById('camTaskTitle').textContent = `인증 : ${task.content}`;
  
  // Show Camera Modal
  document.getElementById('cameraModal').style.display = 'flex';
  document.getElementById('captureFooter').style.display = 'flex';
  document.getElementById('resultSuccessPanel').style.display = 'none';
  document.getElementById('resultFailPanel').style.display = 'none';
  document.getElementById('passBadge').style.display = 'none';
  document.getElementById('retakeBadge').style.display = 'none';
  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('boomerangCanvas').style.display = 'none';
  document.getElementById('simulatedCam').style.display = 'flex';
  document.getElementById('analysisLoading').style.display = 'none';
  document.getElementById('focusGuide').textContent = '부메랑 렌즈 안에 행동을 담아주세요';

  startWebcam();
}

function closeCamera() {
  stopWebcam();
  document.getElementById('cameraModal').style.display = 'none';
}

function startWebcam() {
  const video = document.getElementById('webcamVideo');
  const canvas = document.getElementById('boomerangCanvas');

  if (cameraFacingMode === 'user') {
    video.style.transform = 'scaleX(-1)';
    canvas.style.transform = 'scaleX(-1)';
  } else {
    video.style.transform = 'scaleX(1)';
    canvas.style.transform = 'scaleX(1)';
  }

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacingMode },
      audio: false
    })
      .then(stream => {
        webcamStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('simulatedCam').style.display = 'none';
      })
      .catch(err => {
        console.warn("Webcam blocked or unavailable, starting simulator.", err);
        video.style.display = 'none';
        document.getElementById('simulatedCam').style.display = 'flex';
      });
  } else {
    video.style.display = 'none';
    document.getElementById('simulatedCam').style.display = 'flex';
  }
}

function toggleCameraFacing() {
  if (isRecording) return;
  cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
  stopWebcam();
  startWebcam();
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  clearInterval(recordingTimer);
  clearInterval(boomerangPlayTimer);
  capturedFrames = [];
  isRecording = false;
}

// Shutter Capture (Synthesizes real-time digital timestamp - Slide 7 spec)
function startCapture() {
  if (isRecording) return;
  isRecording = true;

  const shutter = document.getElementById('shutterBtn');
  const progress = document.getElementById('progressCircle');
  const viewfinder = document.getElementById('viewfinder');

  shutter.classList.add('recording');
  viewfinder.classList.add('shaking');

  const flash = document.getElementById('cameraFlash');
  flash.style.animation = 'flashEffect 0.35s ease-out';

  setTimeout(() => {
    viewfinder.classList.remove('shaking');
    flash.style.animation = '';
  }, 350);

  document.getElementById('focusGuide').textContent = '부메랑으로 행동을 분석하는 중... 🎥';

  let duration = 1500;
  let start = null;

  const video = document.getElementById('webcamVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  capturedFrames = [];
  const frameRate = 120; // 1.5s loop duration

  recordingTimer = setInterval(() => {
    const isMockView = document.getElementById('simulatedCam').style.display === 'flex';
    
    canvas.width = isMockView ? 320 : (video.videoWidth || 320);
    canvas.height = isMockView ? 480 : (video.videoHeight || 240);

    if (!isMockView) {
      if (cameraFacingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      // Simulated viewfinder drawing
      ctx.fillStyle = '#1C1C1E';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const tick = Date.now();
      ctx.fillStyle = `hsl(${(tick / 15) % 360}, 70%, 55%)`;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2 + Math.sin(tick / 150) * 20, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    // DRAW DIGITAL TIMESTAMP IN ORANGE COLOR (Slide 7 spec)
    const now = new Date();
    const yr = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const dy = String(now.getDate()).padStart(2, '0');
    const hr = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const sc = String(now.getSeconds()).padStart(2, '0');
    const timestampStr = `${yr}-${mo}-${dy} ${hr}:${mi}:${sc}`;

    ctx.fillStyle = '#ff6b00'; // Retro Digital Orange
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(timestampStr, canvas.width - 12, canvas.height - 12);

    capturedFrames.push(canvas.toDataURL('image/jpeg'));
  }, frameRate);

  function step(timestamp) {
    if (!start) start = timestamp;
    let progressMs = timestamp - start;
    let offset = 239 - (239 * (progressMs / duration));

    if (offset < 0) offset = 0;
    progress.style.strokeDashoffset = offset;

    if (progressMs < duration) {
      requestAnimationFrame(step);
    } else {
      clearInterval(recordingTimer);
      finishCapture();
    }
  }

  requestAnimationFrame(step);
}

// Process Gemini/Mock AI analysis (Slide 7 spec)
async function finishCapture() {
  isRecording = false;
  const shutter = document.getElementById('shutterBtn');
  shutter.classList.remove('recording');
  document.getElementById('progressCircle').style.strokeDashoffset = 239;

  document.getElementById('captureFooter').style.display = 'none';

  // Play Loop GIF representation
  startBoomerangPlayback();

  // Show Loading analyzer screen
  const loading = document.getElementById('analysisLoading');
  loading.style.display = 'flex';

  const task = currentRoutines.find(r => r.id === activeCameraTaskId);
  const missionText = task ? task.content : '오늘 갓생 살기';
  const representFrame = capturedFrames[Math.floor(capturedFrames.length / 2)] || '';

  // Call Vision AI engine
  const result = await window.visionAI.analyze(missionText, representFrame);

  // Hide Loading
  loading.style.display = 'none';

  if (result.pass) {
    document.getElementById('passBadge').style.display = 'flex';
    document.getElementById('resultSuccessPanel').style.display = 'flex';
    document.getElementById('successScore').textContent = result.score;
    document.getElementById('successFeedback').textContent = `"${result.feedback}"`;
  } else {
    document.getElementById('retakeBadge').style.display = 'flex';
    document.getElementById('resultFailPanel').style.display = 'flex';
    document.getElementById('failScore').textContent = result.score;
    document.getElementById('failFeedback').textContent = `"${result.feedback}"`;
  }
}

function startBoomerangPlayback() {
  const canvasEl = document.getElementById('boomerangCanvas');
  const videoEl = document.getElementById('webcamVideo');
  const simulatedEl = document.getElementById('simulatedCam');

  videoEl.style.display = 'none';
  simulatedEl.style.display = 'none';
  canvasEl.style.display = 'block';
  document.getElementById('playIcon').style.display = 'flex';

  const ctx = canvasEl.getContext('2d');
  let currentFrameIdx = 0;
  let direction = 1;

  if (capturedFrames.length > 0) {
    const images = [];
    let loadedCount = 0;

    capturedFrames.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === capturedFrames.length) {
          boomerangPlayTimer = setInterval(() => {
            canvasEl.width = img.naturalWidth;
            canvasEl.height = img.naturalHeight;
            canvasEl.classList.add('blur-motion');

            ctx.drawImage(images[currentFrameIdx], 0, 0);

            setTimeout(() => {
              canvasEl.classList.remove('blur-motion');
            }, 40);

            currentFrameIdx += direction;
            if (currentFrameIdx === images.length - 1 || currentFrameIdx === 0) {
              direction *= -1; // Reverse ping-pong loop
            }
          }, 110);
        }
      };
      img.src = src;
      images.push(img);
    });
  }
}

async function confirmSuccess() {
  const task = currentRoutines.find(r => r.id === activeCameraTaskId);
  if (task) {
    const taskIndex = currentRoutines.findIndex(routine => routine.id === task.id);
    const verifyButtons = document.querySelectorAll('.checkbox-custom');
    if (verifyButtons[taskIndex]) triggerConfetti(verifyButtons[taskIndex]);
    if (navigator.vibrate) navigator.vibrate([80, 40, 120]);

    task.is_done = true;
    task.completed_at = new Date().toISOString();
    task.updated_at = new Date().toISOString();
    task.verification_type = 'camera_ai';
    saveCurrentRoutinesLocally();
    await rewardTaskOnce(task.id, 2);

    if (window.godsaengStore.isSupabaseActive && !String(task.id).startsWith('local_')) {
      try {
        updateSyncStatus('syncing');
        const { error } = await dbSupabase
          .from('tasks')
          .update({
            is_done: true,
            completed_at: task.completed_at,
            updated_at: task.updated_at
          })
          .eq('id', activeCameraTaskId);
        if (error) throw error;
        updateSyncStatus('synced');
      } catch {
        updateSyncStatus('offline');
        console.info("카메라 인증은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
      }
    }
  }
  document.getElementById('coinCount').textContent = await window.godsaengStore.getCoins();

  // Refresh views
  renderRoutines();
  await updateAvatarDisplay();
  await renderWeeklyStats();
  await renderGrassMap();
  closeCamera();
}

function retakePhoto() {
  clearInterval(boomerangPlayTimer);
  document.getElementById('resultFailPanel').style.display = 'none';
  document.getElementById('retakeBadge').style.display = 'none';
  document.getElementById('playIcon').style.display = 'none';
  document.getElementById('boomerangCanvas').style.display = 'none';
  document.getElementById('webcamVideo').style.display = 'block';
  document.getElementById('captureFooter').style.display = 'flex';
  document.getElementById('focusGuide').textContent = '부메랑 렌즈 안에 행동을 담아주세요';

  startWebcam();
}

function confirmFailure() {
  closeCamera();
}
