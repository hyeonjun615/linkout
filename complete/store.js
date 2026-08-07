// Hybrid Data Store for lock-in & avatar complete project
class GodsaengStore {
  constructor() {
    this.isSupabaseActive = false;
    this.supabaseClient = null;
    this.currentUserId = null;
    this.localScope = 'guest';

    // Keys for LocalStorage Fallbacks
    this.coinKey = 'complete_coins';
    this.purchasedKey = 'complete_purchased_items';
    this.equippedKey = 'complete_equipped_items';
    this.skinKey = 'complete_skin';
    this.titleKey = 'complete_active_title';
    this.weeklyKey = 'complete_weekly_achievement';
    this.monthlyGrassKey = 'complete_monthly_grass';

    // Local Items Catalog definition (matching avatar.js assets)
    this.itemsCatalog = {
      // Accessories
      'iced_coffee_black': { id: 'iced_coffee_black', name: '아이스 아메리카노 (블랙)', cost: 1, grade: 'Basic', desc: '생존용 아이스 아메리카노 수혈.' },
      'iced_coffee_pink': { id: 'iced_coffee_pink', name: '딸기 라떼', cost: 3, grade: 'Point', desc: '달달하고 예쁜 딸기 핑크 라떼.' },
      'iced_coffee_galaxy': { id: 'iced_coffee_galaxy', name: '갤럭시 라떼', cost: 5, grade: 'Special', desc: '그라데이션 네온 우주빛 라떼.' },

      'dumbbell_iron': { id: 'dumbbell_iron', name: '득근 아령 (블랙)', cost: 1, grade: 'Basic', desc: '근손실 방지 기본 쇠질용 덤벨.' },
      'dumbbell_purple': { id: 'dumbbell_purple', name: '득근 아령 (퍼플)', cost: 3, grade: 'Point', desc: '화려한 펄이 들어간 네온 퍼플 덤벨.' },
      'dumbbell_gold': { id: 'dumbbell_gold', name: '불타는 황금 아령', cost: 5, grade: 'Special', desc: '황금 파이어 오라가 피어오르는 아령.' },

      'airpods_silver': { id: 'airpods_silver', name: '에어팟 맥스 (실버)', cost: 1, grade: 'Basic', desc: '노이즈 캔슬링 기본 실버 헤드셋.' },
      'airpods_green': { id: 'airpods_green', name: '에어팟 맥스 (그린)', cost: 3, grade: 'Point', desc: '상큼한 네온 파스텔 그린 헤드셋.' },
      'airpods_rainbow': { id: 'airpods_rainbow', name: '네온 무지개 에어팟', cost: 8, grade: 'Special', desc: '무지개빛 글로우 에어팟 맥스.' },

      'sweatband': { id: 'sweatband', name: '땀 밴드', cost: 1, grade: 'Basic', desc: '운동러의 필수 땀 밴드.' },
      'glasses': { id: 'glasses', name: '모던 안경', cost: 1, grade: 'Basic', desc: '지성적인 모습을 위한 안경.' },

      // Skins
      'green': { id: 'green', name: '슈렉 그린', cost: 5, grade: 'Point', desc: '피부색을 화사한 그린으로 변경.' },
      'purple': { id: 'purple', name: '에일리언 퍼플', cost: 5, grade: 'Point', desc: '신비롭고 힙한 보라색 피부.' },
      'blue': { id: 'blue', name: '사이버 네온 블루', cost: 10, grade: 'Special', desc: '빛이 나는 형광 네온 블루 피부.' },
      'gold': { id: 'gold', name: '황금 골드', cost: 15, grade: 'Special', desc: '스트리머급 간지, 올 황금빛 피부.' },

      // Room Backgrounds
      'room_classic': { id: 'room_classic', name: '클래식 오크', cost: 1, grade: 'Basic', desc: '아늑하고 정겨운 정통 오크 통나무 방.' },
      'room_forest': { id: 'room_forest', name: '딥 포레스트', cost: 3, grade: 'Point', desc: '신비롭고 차분한 초록빛 숲속 통나무 방.' },
      'room_vintage': { id: 'room_vintage', name: '빈티지 애쉬', cost: 5, grade: 'Special', desc: '세련되고 현대적인 회색빛 애쉬 통나무 방.' }
    };

    // Lucky Box Exclusives
    this.gachaCatalog = {
      'crown': { id: 'crown', name: '오로라 왕관', grade: 'Special', desc: '럭키박스 한정! 왕을 위한 황금 왕관.' },
      'goggles': { id: 'goggles', name: '레트로 선글라스', grade: 'Special', desc: '럭키박스 한정! 사이버펑크 고글.' }
    };

    // Titles Catalog
    this.titlesCatalog = {
      'beginner': { id: 'beginner', name: '초보 도전 자', desc: '첫 발을 내딛은 뉴비.' },
      'streak3': { id: 'streak3', name: '작심삼일 브레이커', desc: '스트릭 3일 달성.' },
      'earlybird': { id: 'earlybird', name: '새벽의 지배자', desc: '새벽 시간에 미션을 완료한 자.' },
      'rich': { id: 'rich', name: '코인 부자', desc: '지갑에 코인이 두둑한 자산가.' },
      'persistent': { id: 'persistent', name: '끈기의 화신', desc: '스트릭 7일 달성.' },
      'god': { id: 'god', name: '범접불가 레전드', desc: '하루 미션을 올클리어한 자.' }
    };

    // Supabase DB item UUID mapping
    this.dbItemMapping = {
      // 스킨
      'purple': '5537fbeb-e4ff-4430-8ccf-8616e6657893',
      'green': 'a9610f07-3b6f-4284-83c3-084f1213e2af',
      'blue': 'bcfc5b0b-b6d9-4be3-8e90-8956bd709d24',
      'gold': '9b640488-c1ec-45f5-b1fb-b10405b52bb8',
      // 배경
      'room_classic': '2d4961e2-1072-4b38-8c74-20736e6f5ed6',
      'room_forest': 'eec10009-abcd-4aa9-84ed-2eefa4fcba24',
      'room_vintage': '6493a16a-82a1-414f-9cef-e9f9813b44f0',
      // 칭호
      'beginner': '53e0f3e4-fe7b-46a8-a54e-f37c75e0c7b7',
      'streak3': '0c40e05c-e931-4498-ac7e-962c5ca15699',
      'earlybird': '14ceaf2f-af11-42cb-b6c7-876977915491',
      'rich': 'ef6699dd-b996-449c-85a7-34bdb6dd4124',
      'persistent': 'd760df05-1c69-4795-ad18-5628a8608aa0',
      'god': '12e39628-f012-499e-b3bb-48754c3d54d2',
      // 액세서리
      'sweatband': '8dfd1620-af58-43dc-8a27-56dee912b68f',
      'glasses': '0ded4f4e-28cd-457a-93a9-e51971e4607c',
      'dumbbell_iron': '2c330ccc-1046-40ad-8709-adfc0c316c00',
      'iced_coffee_black': '89e28a78-f33a-4d05-a63e-cd063ebc0848',
      'airpods_silver': 'f5af0cd7-d443-40a2-b082-2fa1c66e2919',
      'airpods_green': '8ed89030-4646-43aa-be87-82b2b29d0a5c',
      'airpods_rainbow': '21d673ad-7315-4f3c-8606-e9bf9ed8c925',
      'crown': 'add574e0-ed7e-4825-82db-97218daf7b1c',
      'goggles': 'efa21ed1-73ec-48f5-ab97-1d2093742aec'
    };

    // Reverse mapping
    this.localItemMapping = {};
    for (const [key, val] of Object.entries(this.dbItemMapping)) {
      this.localItemMapping[val] = key;
    }
  }

  setLocalScope(scope = 'guest') {
    this.localScope = String(scope || 'guest');
    const baseKeys = {
      coinKey: 'complete_coins',
      purchasedKey: 'complete_purchased_items',
      equippedKey: 'complete_equipped_items',
      skinKey: 'complete_skin',
      titleKey: 'complete_active_title',
      weeklyKey: 'complete_weekly_achievement',
      monthlyGrassKey: 'complete_monthly_grass'
    };
    Object.entries(baseKeys).forEach(([property, baseKey]) => {
      const scopedKey = `${baseKey}::${encodeURIComponent(this.localScope)}`;
      if (this.localScope === 'guest' && localStorage.getItem(scopedKey) === null) {
        const legacyValue = localStorage.getItem(baseKey);
        if (legacyValue !== null) localStorage.setItem(scopedKey, legacyValue);
      }
      this[property] = scopedKey;
    });
  }

  // Setup client
  setupSupabase(client, userId) {
    this.supabaseClient = client;
    this.currentUserId = userId;
    this.isSupabaseActive = !!(client && userId);
  }

  // Initial user loading
  async init() {
    // LocalStorage is always initialized first. Supabase only mirrors it for a
    // signed-in user and never blocks the core app.
    this.initLocalStorage();
    if (!this.isSupabaseActive) {
      return;
    }

    try {
      // Check if user profiles exists
      const { data: profile, error } = await this.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', this.currentUserId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile not exists, create new profiles row
        const { error: insertError } = await this.supabaseClient
          .from('profiles')
          .insert({
            id: this.currentUserId,
            persona: 'standard',
            coins: 10, // Default coins
            equipped_skin: 'default',
            equipped_title: '53e0f3e4-fe7b-46a8-a54e-f37c75e0c7b7' // beginner UUID
          });
        if (insertError) throw insertError;
      } else if (error) {
        throw error;
      } else if (profile) {
        localStorage.setItem(this.coinKey, String(profile.coins ?? 10));
        localStorage.setItem(this.skinKey, profile.equipped_skin || 'default');
        const title = profile.equipped_title
          ? (this.localItemMapping[profile.equipped_title] || 'beginner')
          : 'none';
        localStorage.setItem(this.titleKey, title);
      }
    } catch (e) {
      console.warn("Supabase init failed, fallback to LocalStorage", e);
      this.isSupabaseActive = false;
    }
  }

  initLocalStorage() {
    if (!localStorage.getItem(this.coinKey)) {
      localStorage.setItem(this.coinKey, '10');
    }
    if (!localStorage.getItem(this.purchasedKey)) {
      localStorage.setItem(this.purchasedKey, JSON.stringify(['room_classic']));
    }
    if (!localStorage.getItem(this.equippedKey)) {
      localStorage.setItem(this.equippedKey, JSON.stringify(['room_classic']));
    }
    if (!localStorage.getItem(this.skinKey)) {
      localStorage.setItem(this.skinKey, 'default');
    }
    if (!localStorage.getItem(this.titleKey)) {
      localStorage.setItem(this.titleKey, 'beginner');
    }
    if (!localStorage.getItem(this.weeklyKey)) {
      localStorage.setItem(this.weeklyKey, JSON.stringify([0, 0, 0, 0, 0, 0, 0]));
    }
    if (!localStorage.getItem(this.monthlyGrassKey)) {
      const arr = Array(35).fill(0);
      localStorage.setItem(this.monthlyGrassKey, JSON.stringify(arr));
    }
  }

  // Coin Management
  async getCoins() {
    return parseInt(localStorage.getItem(this.coinKey) || '10');
  }

  async addCoins(amount) {
    const current = await this.getCoins();
    const nextVal = current + amount;
    localStorage.setItem(this.coinKey, nextVal.toString());

    if (this.isSupabaseActive) {
      try {
        const { error } = await this.supabaseClient
          .from('profiles')
          .update({ coins: nextVal })
          .eq('id', this.currentUserId);
        if (error) throw error;
      } catch (e) {
        console.info("코인은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
      }
    }
    return nextVal;
  }

  async deductCoins(amount) {
    const current = await this.getCoins();
    if (current < amount) return false;
    const nextVal = current - amount;
    localStorage.setItem(this.coinKey, nextVal.toString());

    if (this.isSupabaseActive) {
      try {
        const { error } = await this.supabaseClient
          .from('profiles')
          .update({ coins: nextVal })
          .eq('id', this.currentUserId);
        if (error) throw error;
      } catch (e) {
        console.info("코인은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
      }
    }
    return true;
  }

  // Inventory Management
  async addPurchasedItem(itemId) {
    const list = await this.getPurchasedItems();
    if (!list.includes(itemId)) {
      list.push(itemId);
    }
    localStorage.setItem(this.purchasedKey, JSON.stringify(list));

    if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
      try {
        const uuid = this.dbItemMapping[itemId];
        if (uuid) {
          await this.supabaseClient
            .from('user_items')
            .upsert({
              user_id: this.currentUserId,
              item_id: uuid,
              is_equipped: false
            }, { onConflict: 'user_id,item_id' });
        }
      } catch (e) {
        console.error("Supabase addPurchasedItem failed", e);
      }
    }
    return list;
  }

  async getPurchasedItems() {
    let list = [];
    try {
      const localList = JSON.parse(localStorage.getItem(this.purchasedKey) || '[]');
      if (Array.isArray(localList)) list.push(...localList);
    } catch (e) {}

    if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
      try {
        const { data, error } = await this.supabaseClient
          .from('user_items')
          .select('item_id');
        if (!error && data) {
          data.forEach(d => {
            const localId = this.localItemMapping[d.item_id];
            if (localId && !list.includes(localId)) list.push(localId);
          });
        }
      } catch (e) {
        console.error("Supabase getPurchasedItems failed", e);
      }
    }
    if (!list.includes('room_classic')) list.push('room_classic');
    localStorage.setItem(this.purchasedKey, JSON.stringify(list));
    return list;
  }

  async isPurchased(itemId) {
    const list = await this.getPurchasedItems();
    return list.includes(itemId);
  }

  async buyItem(itemId) {
    const item = this.itemsCatalog[itemId] || this.gachaCatalog[itemId];
    if (!item) return { success: false, message: '존재하지 않는 아이템입니다.' };

    const owned = await this.isPurchased(itemId);
    if (owned) return { success: false, message: '이미 소유한 아이템입니다.' };

    const success = await this.deductCoins(item.cost || 0);
    if (!success) return { success: false, message: '코인이 부족합니다! 열심히 미션을 수행하세요.' };

    await this.addPurchasedItem(itemId);
    return { success: true, message: `"${item.name}" 구매 성공!` };
  }

  // Equipment Management
  async getEquippedItems() {
    if (this.isSupabaseActive) {
      try {
        const { data: profile } = await this.supabaseClient
          .from('profiles')
          .select('equipped_skin, equipped_title')
          .eq('id', this.currentUserId)
          .single();

        const { data: userItems } = await this.supabaseClient
          .from('user_items')
          .select('item_id')
          .eq('user_id', this.currentUserId)
          .eq('is_equipped', true);

        let list = [];
        if (profile) {
          const skin = profile.equipped_skin || 'default';
          const title = profile.equipped_title
            ? (this.localItemMapping[profile.equipped_title] || 'beginner')
            : 'none';
          list.push(skin);
          if (title !== 'none') list.push(title);
        }
        if (userItems) {
          userItems.forEach(u => {
            const localId = this.localItemMapping[u.item_id];
            if (localId) list.push(localId);
          });
        }
        if (!list.some(id => id.startsWith('room_'))) {
          list.push('room_classic');
        }
        localStorage.setItem(this.equippedKey, JSON.stringify(
          list.filter(id => !['default', 'green', 'purple', 'blue', 'gold'].includes(id) && !Object.keys(this.titlesCatalog).includes(id))
        ));
        return list;
      } catch (e) {
        console.error("Supabase getEquippedItems failed", e);
      }
    }
    const list = JSON.parse(localStorage.getItem(this.equippedKey) || '[]');
    if (!list.some(id => id.startsWith('room_'))) {
      list.push('room_classic');
    }
    const activeSkin = localStorage.getItem(this.skinKey) || 'default';
    const activeTitle = localStorage.getItem(this.titleKey) || 'beginner';
    if (!list.includes(activeSkin)) list.push(activeSkin);
    if (activeTitle !== 'none' && !list.includes(activeTitle)) list.push(activeTitle);
    localStorage.setItem(this.equippedKey, JSON.stringify(
      list.filter(id => !['default', 'green', 'purple', 'blue', 'gold'].includes(id) && !Object.keys(this.titlesCatalog).includes(id))
    ));
    return list;
  }

  async equipItem(itemId) {
    const purchased = await this.getPurchasedItems();
    const isExclUnlocked = Object.keys(this.gachaCatalog).includes(itemId) && purchased.includes(itemId);
    const canEquip = purchased.includes(itemId) || isExclUnlocked || itemId === 'beginner' || itemId === 'default';

    if (!canEquip) return false;

    const isSkin = ['default', 'green', 'purple', 'blue', 'gold'].includes(itemId);
    if (isSkin) {
      const currentSkin = localStorage.getItem(this.skinKey) || 'default';
      const nextSkin = itemId !== 'default' && currentSkin === itemId ? 'default' : itemId;
      localStorage.setItem(this.skinKey, nextSkin);

      if (this.isSupabaseActive) {
        try {
          await this.supabaseClient
            .from('profiles')
            .update({ equipped_skin: nextSkin })
            .eq('id', this.currentUserId);
        } catch (e) {
          console.info("스킨 변경은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
        }
      }
      return true;
    }

    const isTitle = Object.keys(this.titlesCatalog).includes(itemId);
    if (isTitle) {
      const currentTitle = localStorage.getItem(this.titleKey) || 'beginner';
      const nextTitle = currentTitle === itemId ? 'none' : itemId;
      localStorage.setItem(this.titleKey, nextTitle);

      if (this.isSupabaseActive) {
        try {
          await this.supabaseClient
            .from('profiles')
            .update({
              equipped_title: nextTitle === 'none' ? null : this.dbItemMapping[nextTitle]
            })
            .eq('id', this.currentUserId);
        } catch (e) {
          console.info("칭호 변경은 로컬에 저장되었고 동기화는 나중에 다시 시도합니다.");
        }
      }
      return true;
    }

    const isRoom = itemId.startsWith('room_');
    if (isRoom) {
      let equipped = JSON.parse(localStorage.getItem(this.equippedKey) || '[]');
      const currentRoom = equipped.find(id => id.startsWith('room_')) || 'room_classic';
      const nextRoom = currentRoom === itemId ? currentRoom : itemId;
      equipped = equipped.filter(id => !id.startsWith('room_'));
      equipped.push(nextRoom);
      localStorage.setItem(this.equippedKey, JSON.stringify(equipped));

      if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
        try {
          const roomUuids = Object.entries(this.dbItemMapping)
            .filter(([id]) => id.startsWith('room_'))
            .map(([, uuid]) => uuid);
          await this.supabaseClient
            .from('user_items')
            .update({ is_equipped: false })
            .eq('user_id', this.currentUserId)
            .in('item_id', roomUuids);
          await this.supabaseClient
            .from('user_items')
            .upsert({
              user_id: this.currentUserId,
              item_id: this.dbItemMapping[nextRoom],
              is_equipped: true
            }, { onConflict: 'user_id,item_id' });
        } catch (e) {
          console.info("배경 교체는 로컬에 저장되었습니다.");
        }
      }
      return true;
    }

    // Normal Accessory & Crown / Goggles toggle logic
    let equipped = JSON.parse(localStorage.getItem(this.equippedKey) || '[]');
    const isEquipping = !equipped.includes(itemId);

    if (!isEquipping) {
      equipped = equipped.filter(id => id !== itemId);
    } else {
      if (itemId.startsWith('airpods')) {
        equipped = equipped.filter(id => !id.startsWith('airpods'));
      } else if (itemId.startsWith('iced_coffee')) {
        equipped = equipped.filter(id => !id.startsWith('iced_coffee'));
      } else if (itemId.startsWith('dumbbell')) {
        equipped = equipped.filter(id => !id.startsWith('dumbbell'));
      } else if (itemId === 'crown' || itemId === 'goggles') {
        equipped = equipped.filter(id => id !== 'crown' && id !== 'goggles');
      }
      equipped.push(itemId);
    }
    localStorage.setItem(this.equippedKey, JSON.stringify(equipped));

    if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
      try {
        const uuid = this.dbItemMapping[itemId];

        // Exclusivity unequip target selection in Supabase
        let categoryPrefix = '';
        if (itemId.startsWith('airpods')) categoryPrefix = 'airpods';
        else if (itemId.startsWith('iced_coffee')) categoryPrefix = 'iced_coffee';
        else if (itemId.startsWith('dumbbell')) categoryPrefix = 'dumbbell';

        if (isEquipping) {
          if (categoryPrefix) {
            const exclusiveUuids = Object.entries(this.dbItemMapping)
              .filter(([k]) => k.startsWith(categoryPrefix) && k !== itemId)
              .map(([, v]) => v);

            await this.supabaseClient
              .from('user_items')
              .update({ is_equipped: false })
              .eq('user_id', this.currentUserId)
              .in('item_id', exclusiveUuids);
          }
          if (itemId === 'crown' || itemId === 'goggles') {
            const oppUuid = this.dbItemMapping[itemId === 'crown' ? 'goggles' : 'crown'];
            if (oppUuid) {
              await this.supabaseClient
                .from('user_items')
                .update({ is_equipped: false })
                .eq('user_id', this.currentUserId)
                .eq('item_id', oppUuid);
            }
          }
          if (uuid) {
            await this.supabaseClient
              .from('user_items')
              .upsert({
                user_id: this.currentUserId,
                item_id: uuid,
                is_equipped: true
              }, { onConflict: 'user_id,item_id' });
          }
        } else {
          if (uuid) {
            await this.supabaseClient
              .from('user_items')
              .update({ is_equipped: false })
              .eq('user_id', this.currentUserId)
              .eq('item_id', uuid);
          }
        }
      } catch (e) {
        console.error("Supabase equipItem failed, using local fallback", e);
      }
    }
    return true;
  }

  // Active Skin & Title getters for local fallback compatibility
  async getActiveSkin() {
    const localSkin = localStorage.getItem(this.skinKey);
    if (localSkin) return localSkin;

    if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
      try {
        const { data, error } = await this.supabaseClient
          .from('profiles')
          .select('equipped_skin')
          .eq('id', this.currentUserId)
          .single();
        if (!error && data) {
          const skin = data.equipped_skin || 'default';
          localStorage.setItem(this.skinKey, skin);
          return skin;
        }
      } catch (e) {
        console.error("Supabase getActiveSkin failed", e);
      }
    }
    return 'default';
  }

  async getActiveTitle() {
    const localTitle = localStorage.getItem(this.titleKey);
    if (localTitle) return localTitle;

    if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
      try {
        const { data, error } = await this.supabaseClient
          .from('profiles')
          .select('equipped_title')
          .eq('id', this.currentUserId)
          .single();
        if (!error && data) {
          const title = data.equipped_title
            ? (this.localItemMapping[data.equipped_title] || 'beginner')
            : 'none';
          localStorage.setItem(this.titleKey, title);
          return title;
        }
      } catch (e) {
        console.error("Supabase getActiveTitle failed", e);
      }
    }
    return 'beginner';
  }

  // Reset all local storage data to initial state
  async resetData() {
    localStorage.removeItem(this.purchasedKey);
    localStorage.removeItem(this.equippedKey);
    localStorage.removeItem(this.skinKey);
    localStorage.removeItem(this.titleKey);
    localStorage.removeItem(this.weeklyKey);
    localStorage.removeItem(this.monthlyGrassKey);
    localStorage.setItem(this.coinKey, '10'); // Reset to default 10 coins

    // Clear legacy unscoped keys if present
    localStorage.removeItem('complete_purchased_items');
    localStorage.removeItem('complete_equipped_items');
    localStorage.removeItem('complete_skin');
    localStorage.removeItem('complete_active_title');
    localStorage.removeItem('complete_weekly_achievement');
    localStorage.removeItem('complete_monthly_grass');
    localStorage.setItem('complete_coins', '10');

    if (this.isSupabaseActive && this.supabaseClient && this.currentUserId) {
      try {
        await this.supabaseClient
          .from('profiles')
          .update({
            coins: 10,
            equipped_skin: 'default',
            active_title_id: 'beginner'
          })
          .eq('id', this.currentUserId);
      } catch (e) {
        console.error("Supabase reset profile failed", e);
      }
    }

    this.initLocalStorage();
    return true;
  }

  // Weighted Gacha Engine (비복원 추출 + 복원 추출 무한 보상)
  async playLuckyBox() {
    const cost = 2;
    const coins = await this.getCoins();
    if (coins < cost) {
      return {
        success: false,
        message: '코인이 부족합니다. (필요 코인: 2)'
      };
    }

    await this.deductCoins(cost);
    const purchased = await this.getPurchasedItems();

    // Group item pools
    // 1. Legendary (전설) Tier - Finite items (Special grade)
    const legendaryItems = ['crown', 'goggles', 'gold', 'blue', 'airpods_rainbow', 'iced_coffee_galaxy', 'dumbbell_gold', 'room_vintage'];
    const unownedLegendary = legendaryItems.filter(id => !purchased.includes(id));
    const weightLegendaryTotal = unownedLegendary.length * 15;

    // 2. Epic (영웅) Tier - Finite items (Point grade)
    const epicItems = ['green', 'purple', 'iced_coffee_pink', 'dumbbell_purple', 'airpods_green', 'room_forest'];
    const unownedEpic = epicItems.filter(id => !purchased.includes(id));
    const weightEpicTotal = unownedEpic.length * 10;

    // 3. Rare (희귀) Tier - Finite items (Basic grade)
    const rareItems = ['iced_coffee_black', 'dumbbell_iron', 'airpods_silver', 'sweatband', 'glasses', 'room_classic'];
    const unownedRare = rareItems.filter(id => !purchased.includes(id));
    const weightRareTotal = unownedRare.length * 8;

    // 4. Common (일반/코인) Tier - Infinite item (복원 추출)
    const weightCommonTotal = 40;

    // Calculate total dynamic weight
    const grandTotalWeight = weightLegendaryTotal + weightEpicTotal + weightRareTotal + weightCommonTotal;

    // Roll random number from 0 to grandTotalWeight
    let roll = Math.random() * grandTotalWeight;

    // Check Legendary Pool
    if (roll < weightLegendaryTotal) {
      const prizeId = unownedLegendary[Math.floor(Math.random() * unownedLegendary.length)];
      await this.addPurchasedItem(prizeId);
      const prizeItem = this.itemsCatalog[prizeId] || this.gachaCatalog[prizeId];
      return {
        success: true,
        type: 'legendary',
        grade: 'Legendary',
        itemId: prizeId,
        name: prizeItem.name,
        message: `전설 등급 [${prizeItem.name}] 획득`
      };
    }
    roll -= weightLegendaryTotal;

    // Check Epic Pool
    if (roll < weightEpicTotal) {
      const prizeId = unownedEpic[Math.floor(Math.random() * unownedEpic.length)];
      await this.addPurchasedItem(prizeId);
      const prizeItem = this.itemsCatalog[prizeId] || this.gachaCatalog[prizeId];
      return {
        success: true,
        type: 'epic',
        grade: 'Epic',
        itemId: prizeId,
        name: prizeItem.name,
        message: `영웅 등급 [${prizeItem.name}] 획득`
      };
    }
    roll -= weightEpicTotal;

    // Check Rare Pool
    if (roll < weightRareTotal) {
      const prizeId = unownedRare[Math.floor(Math.random() * unownedRare.length)];
      purchased.push(prizeId);
      localStorage.setItem(this.purchasedKey, JSON.stringify(purchased));
      const prizeItem = this.itemsCatalog[prizeId] || this.gachaCatalog[prizeId];
      return {
        success: true,
        type: 'rare',
        grade: 'Rare',
        itemId: prizeId,
        name: prizeItem.name,
        message: `희귀 등급 [${prizeItem.name}] 획득`
      };
    }

    // Common / Coin (Infinite item)
    await this.addCoins(1);
    return {
      success: true,
      type: 'common',
      grade: 'Common',
      name: '코인 환급',
      message: '일반 등급 당첨. 1코인이 환급되었습니다.'
    };
  }

  // Stats & Grasses
  async getWeeklyAchievement() {
    return JSON.parse(localStorage.getItem(this.weeklyKey) || '[0,0,0,0,0,0,0]');
  }

  async saveWeeklyAchievement(arr) {
    localStorage.setItem(this.weeklyKey, JSON.stringify(arr));
  }

  async getMonthlyGrass() {
    if (this.isSupabaseActive) {
      try {
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - 34);

        const { data, error } = await this.supabaseClient
          .from('daily_summaries')
          .select('date, final_stage')
          .eq('user_id', this.currentUserId)
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', today.toISOString().split('T')[0]);

        if (!error && data) {
          let grassArr = Array(35).fill(0);
          // Set mock history for older entries
          for (let i = 0; i < 16; i++) {
            grassArr[i] = Math.floor(Math.random() * 4);
          }

          const todayStr = new Date(Date.now() + 9*60*60*1000).toISOString().split('T')[0];
          data.forEach(s => {
            if (s.date === todayStr) {
              grassArr[16] = s.final_stage;
            } else {
              const diff = Math.floor((new Date(todayStr) - new Date(s.date)) / (1000 * 60 * 60 * 24));
              const idx = 16 - diff;
              if (idx >= 0 && idx < 35) {
                grassArr[idx] = s.final_stage;
              }
            }
          });
          localStorage.setItem(this.monthlyGrassKey, JSON.stringify(grassArr));
          return grassArr;
        }
      } catch (e) {
        console.error("Supabase getMonthlyGrass failed", e);
      }
    }
    return JSON.parse(localStorage.getItem(this.monthlyGrassKey) || '[]');
  }

  async saveMonthlyGrass(idx, stageLvl) {
    const arr = JSON.parse(localStorage.getItem(this.monthlyGrassKey) || '[]');
    arr[idx] = stageLvl;
    localStorage.setItem(this.monthlyGrassKey, JSON.stringify(arr));

    if (this.isSupabaseActive && idx === 16) {
      try {
        const todayStr = new Date(Date.now() + 9*60*60*1000).toISOString().split('T')[0];
        await this.supabaseClient
          .from('daily_summaries')
          .upsert({
            user_id: this.currentUserId,
            date: todayStr,
            final_stage: stageLvl
          });
      } catch (e) {
        console.error("Supabase daily_summaries upsert failed", e);
      }
    }
  }
}

// Instantiate globally
window.godsaengStore = new GodsaengStore();
