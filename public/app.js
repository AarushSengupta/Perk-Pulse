/**
 * PerkPulse — Client-Side Application Engine
 * High-Density Credit Intelligence & Spend Maximizer
 * 
 * 100% Client-Side State • Zero Bank Info Required
 * 
 * Architecture Overview:
 * - State Management: In-memory reactive state synchronized with localStorage ('perkpulse_wallet_cards').
 * - Data Layer: Asynchronously fetches public catalogs from /api/cards, /api/offers, /api/perks.
 * - View Controllers: Home Dashboard, Offers Directory, Active Wallet Matrix, and Perks Ledger.
 * - Slide-out Drawers:
 *    1. Offer Intelligence Drawer (modal for specific merchant discount terms & ROI).
 *    2. Card Perk Intelligence Drawer (full breakdown of all annual credits, protections & multipliers).
 *    3. Category Promo Rule Drawer (spend caps, merchant inclusion/exclusion rules, and ranked wallet cards).
 * - Live Spend Router: Client-side debounce evaluation sending queries to /api/wallet/route-spend.
 */

// Default starter wallet: Starts with an empty slate so users add their own cards
const DEFAULT_WALLET_CARD_IDS = [];

/**
 * Global reactive UI state
 */
const state = {
  activeTab: 'home',
  walletCards: [], // User's custom card ID selection
  allCards: [],
  allOffers: [],
  perksData: null,
  
  // Offers view filters & sorting
  offerSearch: '',
  selectedCategories: new Set(['all']),
  singleCategoryMode: false,
  selectedNetwork: 'all',
  sortBy: 'default',
  walletScopeOnly: true, // Auto-scoped: strictly show offers for cards in user's wallet

  // Perks view toggle: 'annual' | 'monthly'
  perkViewMode: 'annual',

  // Selected quick category on home screen
  homeQuickCategory: 'dining',

  // Wallet tab popular cards filter
  walletIssuerFilter: 'all',

  // Statement Credit Tracker
  claimedCredits: {}, // key: "cardId___creditName" -> { claimed, period, value, cadence, timestamp }
  creditCadenceFilter: 'all', // 'all' | 'monthly' | 'annual'

  // Custom User-Created Credit Cards
  customCards: [],

  // Cents-Per-Point (CPP) Valuation Engine & Yield Mode
  yieldMode: 'multiplier', // 'multiplier' | 'effective_yield'
  cppValuations: {
    'chase-ur': 1.8,
    'amex-mr': 1.7,
    'bilt-points': 2.05,
    'capone-miles': 1.6,
    'citi-typ': 1.6,
    'cashback': 1.0
  }
};

// =========================================================================
// Initialization & Data Loading
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  loadWalletFromStorage();
  loadClaimedCreditsFromStorage();
  loadCppFromStorage();
  setupNavigation();
  setupOfferControls();
  setupWalletControls();
  setupPerksControls();
  setupCppControls();
  setupDrawer();
  setupSpendRouter();
  startRefreshTimer();

  await Promise.all([
    fetchCards(),
    fetchOffers(),
    fetchPerks()
  ]);

  renderAllViews();
});

function loadWalletFromStorage() {
  try {
    const saved = localStorage.getItem('perkpulse_wallet_cards');
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      // If user had the old starter wallet with 4 default cards, reset to empty slate so they can add their own
      const oldDefaults = ['amex-plat', 'amex-gold', 'chase-csr', 'capone-venture-x'];
      const isOldDefault = parsed.length === 4 && oldDefaults.every(id => parsed.includes(id));
      if (isOldDefault) {
        state.walletCards = [];
        saveWalletToStorage();
      } else {
        state.walletCards = parsed;
      }
    } else {
      state.walletCards = [];
      saveWalletToStorage();
    }
  } catch (e) {
    state.walletCards = [];
  }

  try {
    const savedCustom = localStorage.getItem('perkpulse_custom_cards');
    state.customCards = savedCustom ? JSON.parse(savedCustom) : [];
  } catch (e) {
    state.customCards = [];
  }
}

function saveCustomCardsToStorage() {
  try {
    localStorage.setItem('perkpulse_custom_cards', JSON.stringify(state.customCards));
  } catch (e) {
    console.error('Error saving custom cards state:', e);
  }
}

function saveWalletToStorage() {
  try {
    localStorage.setItem('perkpulse_wallet_cards', JSON.stringify(state.walletCards));
  } catch (e) {
    console.error('Error saving wallet state:', e);
  }
}

function loadClaimedCreditsFromStorage() {
  try {
    const saved = localStorage.getItem('perkpulse_claimed_credits');
    state.claimedCredits = saved ? JSON.parse(saved) : {};
  } catch (e) {
    state.claimedCredits = {};
  }
}

function saveClaimedCreditsToStorage() {
  try {
    localStorage.setItem('perkpulse_claimed_credits', JSON.stringify(state.claimedCredits));
  } catch (e) {
    console.error('Error saving claimed credits state:', e);
  }
}

function getCurrentCreditPeriod(cadence = '') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const cad = String(cadence).toLowerCase();

  if (cad.includes('/mo') || cad.includes('month')) {
    return `${year}-${month}`;
  }
  if (cad.includes('semi')) {
    return `${year}-${now.getMonth() < 6 ? 'H1' : 'H2'}`;
  }
  return `${year}`;
}

function isCreditClaimed(cardId, creditName, cadence) {
  const key = `${cardId}___${creditName}`;
  const record = state.claimedCredits[key];
  if (!record) return false;
  const currentPeriod = getCurrentCreditPeriod(cadence);
  return record.period === currentPeriod && record.claimed === true;
}

function toggleCreditClaim(cardId, creditName, cadence, value) {
  const key = `${cardId}___${creditName}`;
  const currentPeriod = getCurrentCreditPeriod(cadence);
  const currentlyClaimed = isCreditClaimed(cardId, creditName, cadence);

  if (currentlyClaimed) {
    delete state.claimedCredits[key];
    showToast(`Marked unredeemed: ${creditName}`);
  } else {
    state.claimedCredits[key] = {
      cardId,
      creditName,
      cadence,
      value: Number(value) || 0,
      claimed: true,
      period: currentPeriod,
      timestamp: new Date().toISOString()
    };
    showToast(`Claimed $${value} for ${creditName}`);
  }

  saveClaimedCreditsToStorage();
  renderHomeView();
  renderPerksView();
}

// =========================================================================
// CPP VALUATION & YIELD MODE ENGINE
// =========================================================================
const DEFAULT_CPP_VALUATIONS = {
  'chase-ur': 1.8,
  'amex-mr': 1.7,
  'bilt-points': 2.05,
  'capone-miles': 1.6,
  'citi-typ': 1.6,
  'cashback': 1.0
};

function loadCppFromStorage() {
  try {
    const savedYield = localStorage.getItem('perkpulse_yield_mode');
    if (savedYield) state.yieldMode = savedYield;

    const savedCpp = localStorage.getItem('perkpulse_cpp_valuations');
    if (savedCpp) {
      state.cppValuations = { ...DEFAULT_CPP_VALUATIONS, ...JSON.parse(savedCpp) };
    }
  } catch (e) {
    state.yieldMode = 'multiplier';
    state.cppValuations = { ...DEFAULT_CPP_VALUATIONS };
  }
}

function saveCppToStorage() {
  try {
    localStorage.setItem('perkpulse_yield_mode', state.yieldMode);
    localStorage.setItem('perkpulse_cpp_valuations', JSON.stringify(state.cppValuations));
  } catch (e) {
    console.error('Error saving CPP state:', e);
  }
}

function setupCppControls() {
  // Yield mode toggle buttons (Header)
  const multBtn = document.getElementById('yieldModeMultiplierBtn');
  const yieldBtn = document.getElementById('yieldModeYieldBtn');

  function updateYieldToggleUI() {
    const isYield = state.yieldMode === 'effective_yield';
    if (multBtn && yieldBtn) {
      if (isYield) {
        yieldBtn.className = "yield-toggle-btn active px-2.5 py-1 rounded text-xs font-semibold bg-primary-container text-on-primary-container";
        multBtn.className = "yield-toggle-btn px-2.5 py-1 rounded text-xs font-semibold text-outline hover:text-on-surface";
      } else {
        multBtn.className = "yield-toggle-btn active px-2.5 py-1 rounded text-xs font-semibold bg-primary-container text-on-primary-container";
        yieldBtn.className = "yield-toggle-btn px-2.5 py-1 rounded text-xs font-semibold text-outline hover:text-on-surface";
      }
    }
  }

  if (multBtn) {
    multBtn.addEventListener('click', () => {
      state.yieldMode = 'multiplier';
      saveCppToStorage();
      updateYieldToggleUI();
      showToast('Switched to raw point multiplier view');
      renderAllViews();
    });
  }

  if (yieldBtn) {
    yieldBtn.addEventListener('click', () => {
      state.yieldMode = 'effective_yield';
      saveCppToStorage();
      updateYieldToggleUI();
      showToast('Switched to effective cash yield (%) view');
      renderAllViews();
    });
  }

  updateYieldToggleUI();

  // CPP Settings Modal controls
  const modalOverlay = document.getElementById('cppModalOverlay');
  const openBtn = document.getElementById('openCppModalBtn');
  const closeBtn = document.getElementById('closeCppModalBtn');
  const cancelBtn = document.getElementById('cancelCppBtn');
  const resetBtn = document.getElementById('resetCppDefaultsBtn');
  const saveBtn = document.getElementById('saveCppBtn');

  const inputChase = document.getElementById('cppInputChase');
  const inputAmex = document.getElementById('cppInputAmex');
  const inputBilt = document.getElementById('cppInputBilt');
  const inputCapOne = document.getElementById('cppInputCapOne');
  const inputCiti = document.getElementById('cppInputCiti');

  function syncInputsWithState() {
    if (inputChase) inputChase.value = state.cppValuations['chase-ur'] || 1.8;
    if (inputAmex) inputAmex.value = state.cppValuations['amex-mr'] || 1.7;
    if (inputBilt) inputBilt.value = state.cppValuations['bilt-points'] || 2.05;
    if (inputCapOne) inputCapOne.value = state.cppValuations['capone-miles'] || 1.6;
    if (inputCiti) inputCiti.value = state.cppValuations['citi-typ'] || 1.6;
  }

  function openCppModal() {
    syncInputsWithState();
    if (modalOverlay) modalOverlay.classList.remove('opacity-0', 'pointer-events-none');
  }

  function closeCppModal() {
    if (modalOverlay) modalOverlay.classList.add('opacity-0', 'pointer-events-none');
  }

  if (openBtn) openBtn.addEventListener('click', openCppModal);
  if (closeBtn) closeBtn.addEventListener('click', closeCppModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeCppModal);

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.cppValuations = { ...DEFAULT_CPP_VALUATIONS };
      syncInputsWithState();
      showToast('Valuations reset to market defaults');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      state.cppValuations['chase-ur'] = parseFloat(inputChase?.value) || 1.8;
      state.cppValuations['amex-mr'] = parseFloat(inputAmex?.value) || 1.7;
      state.cppValuations['bilt-points'] = parseFloat(inputBilt?.value) || 2.05;
      state.cppValuations['capone-miles'] = parseFloat(inputCapOne?.value) || 1.6;
      state.cppValuations['citi-typ'] = parseFloat(inputCiti?.value) || 1.6;
      state.cppValuations['cashback'] = 1.0;

      saveCppToStorage();
      closeCppModal();
      showToast('Valuations saved & effective yields recalculated');
      renderAllViews();
    });
  }
}

async function fetchCards() {
  try {
    const res = await fetch('/api/cards');
    const json = await res.json();
    if (json.success) {
      state.allCards = [...json.data, ...state.customCards];
    }
  } catch (err) {
    console.error('Failed to fetch cards:', err);
    state.allCards = [...state.customCards];
  }
}

async function fetchOffers() {
  try {
    const res = await fetch('/api/offers');
    const json = await res.json();
    if (json.success) {
      state.allOffers = json.data;
    }
  } catch (err) {
    console.error('Failed to fetch offers:', err);
  }
}

async function fetchPerks() {
  try {
    const query = state.walletCards.join(',');
    const res = await fetch(`/api/perks?walletCards=${query}`);
    const json = await res.json();
    if (json.success) {
      state.perksData = json.data;
    }
  } catch (err) {
    console.error('Failed to fetch perks:', err);
  }
}

// =========================================================================
// Navigation & Tab Switching
// =========================================================================
function setupNavigation() {
  const tabs = {
    home: { btn: document.getElementById('tabHome'), view: document.getElementById('viewHome') },
    offers: { btn: document.getElementById('tabOffers'), view: document.getElementById('viewOffers') },
    perks: { btn: document.getElementById('tabPerks'), view: document.getElementById('viewPerks') },
    wallet: { btn: document.getElementById('tabWallet'), view: document.getElementById('viewWallet') }
  };

  function switchTab(targetTab) {
    state.activeTab = targetTab;
    Object.keys(tabs).forEach(k => {
      const isTarget = k === targetTab;
      tabs[k].view.classList.toggle('hidden', !isTarget);
      if (isTarget) {
        tabs[k].btn.className = "nav-tab px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors bg-surface-container-high text-primary-container";
      } else {
        tabs[k].btn.className = "nav-tab px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors text-on-surface-variant hover:text-on-surface hover:bg-surface-container";
      }
    });

    if (targetTab === 'offers') renderOffersView();
    if (targetTab === 'wallet') renderWalletView();
    if (targetTab === 'perks') renderPerksView();
    if (targetTab === 'home') renderHomeView();
  }

  document.getElementById('logoBtn').addEventListener('click', () => switchTab('home'));
  tabs.home.btn.addEventListener('click', () => switchTab('home'));
  tabs.offers.btn.addEventListener('click', () => switchTab('offers'));
  tabs.perks.btn.addEventListener('click', () => switchTab('perks'));
  tabs.wallet.btn.addEventListener('click', () => switchTab('wallet'));

  document.getElementById('viewAllOffersFromHome').addEventListener('click', () => switchTab('offers'));

  const homeGoToWalletBtn = document.getElementById('homeGoToWalletBtn');
  if (homeGoToWalletBtn) {
    homeGoToWalletBtn.addEventListener('click', () => switchTab('wallet'));
  }

  const offersGoToWalletBtn = document.getElementById('offersGoToWalletBtn');
  if (offersGoToWalletBtn) {
    offersGoToWalletBtn.addEventListener('click', () => switchTab('wallet'));
  }

  window.switchTab = switchTab;

  // Header quick sync button
  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshDataBtn');
    btn.classList.add('animate-spin');
    await Promise.all([fetchOffers(), fetchPerks()]);
    setTimeout(() => {
      btn.classList.remove('animate-spin');
      showToast('Live public offers & perks updated');
      renderAllViews();
    }, 350);
  });
}

function renderAllViews() {
  updateHeaderStats();
  renderHomeView();
  renderOffersView();
  renderWalletView();
  renderPerksView();
}

function updateHeaderStats() {
  const count = state.walletCards.length;
  const label = `${count} Card${count === 1 ? '' : 's'} Synced`;
  document.getElementById('headerCardCount').textContent = label;
  document.getElementById('homeCardsSyncedLabel').textContent = label;
  document.getElementById('walletCardsLoadedCount').textContent = `(${count} Card${count === 1 ? '' : 's'} Loaded)`;
  const perksLabel = document.getElementById('perksActiveCardsLabel');
  if (perksLabel) perksLabel.textContent = `${count} ACTIVE CARD${count === 1 ? '' : 'S'}`;
}

// =========================================================================
// VIEW 1: HOME DASHBOARD
// =========================================================================
function renderHomeView() {
  const userCards = state.allCards.filter(c => state.walletCards.includes(c.id));
  const hasCards = userCards.length > 0;

  // Show or hide empty wallet banner
  const emptyBanner = document.getElementById('homeEmptyWalletBanner');
  if (emptyBanner) {
    emptyBanner.classList.toggle('hidden', hasCards);
  }

  // Calculate dynamic annual credit and fee stats
  const totalCredits = userCards.reduce((sum, c) => sum + (c.totalCreditsValue || 0), 0);
  const totalFees = userCards.reduce((sum, c) => sum + (c.annualFee || 0), 0);
  
  // Compute actually claimed credits
  let claimedTotalDollars = 0;
  let atRiskCount = 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemainingInMonth = daysInMonth - now.getDate();

  userCards.forEach(card => {
    (card.keyCredits || []).forEach(credit => {
      const isClaimed = isCreditClaimed(card.id, credit.name, credit.cadence);
      if (isClaimed) {
        claimedTotalDollars += credit.value;
      } else {
        const isMonthly = String(credit.cadence).includes('/mo') || String(credit.cadence).includes('month');
        if (isMonthly && daysRemainingInMonth <= 12) {
          atRiskCount++;
        }
      }
    });
  });

  const remainingDollars = Math.max(0, totalCredits - claimedTotalDollars);
  const claimedPercent = totalCredits > 0 ? Math.round((claimedTotalDollars / totalCredits) * 100) : 0;

  document.getElementById('homeTotalCredits').textContent = `$${totalCredits.toLocaleString()}`;
  document.getElementById('homeRemainingCredits').textContent = hasCards ? `$${remainingDollars.toLocaleString()} remaining` : '$0 remaining';
  document.getElementById('homeCreditsPercent').textContent = hasCards ? `${claimedPercent}% Claimed` : '0 Cards Connected';

  // At risk badge
  const atRiskBadge = document.getElementById('homeCreditsAtRiskBadge');
  if (atRiskBadge) {
    if (atRiskCount > 0) {
      atRiskBadge.textContent = `${atRiskCount} AT RISK`;
      atRiskBadge.classList.remove('hidden');
    } else {
      atRiskBadge.classList.add('hidden');
    }
  }

  renderHomeCreditBurn(userCards);

  // Active offers count: all public offers count
  const walletOffers = state.allOffers.filter(o => state.walletCards.includes(o.cardId));
  const displayOffers = hasCards ? walletOffers : state.allOffers;
  const expiringOffers = displayOffers.filter(o => o.daysLeft <= 2 || o.isExpiringSoon);

  document.getElementById('homeActiveOffersCount').textContent = hasCards ? walletOffers.length : state.allOffers.length;
  document.getElementById('homeExpiringCount').textContent = expiringOffers.length;

  // Render Top Expiring Offers table
  const topExpiring = (expiringOffers.length > 0 ? expiringOffers : state.allOffers.filter(o => o.isExpiringSoon)).slice(0, 4);
  const container = document.getElementById('homeExpiringOffersList');
  container.innerHTML = '';

  topExpiring.forEach(item => {
    const el = document.createElement('div');
    el.className = "py-3.5 flex items-center justify-between gap-4 group cursor-pointer hover:bg-surface-container/40 px-2 rounded-lg transition-colors";
    el.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0">
          <span class="material-symbols-outlined text-xl">${item.icon || 'store'}</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-headline font-semibold text-sm text-on-surface truncate">${item.merchant}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono ${getNetworkBadgeClass(item.network)}">${item.cardName}</span>
          </div>
          <p class="text-xs text-outline truncate mt-0.5">${item.subtitle} • <span class="text-tertiary-container font-mono">${item.expiresInText}</span></p>
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <div class="text-right">
          <div class="font-headline font-bold text-sm sm:text-base text-secondary font-mono-metric">${item.heroBenefit}</div>
          <span class="text-[10px] font-mono text-outline uppercase">${item.effectiveRate}</span>
        </div>
        <span class="material-symbols-outlined text-outline text-[16px] group-hover:text-primary-container group-hover:translate-x-0.5 transition-all">arrow_forward</span>
      </div>
    `;
    el.addEventListener('click', () => openDrawer(item));
    container.appendChild(el);
  });

  // Spend Engine Quick Pills Logic
  const quickPills = document.querySelectorAll('.home-cat-pill');
  quickPills.forEach(pill => {
    pill.onclick = () => {
      quickPills.forEach(p => p.className = "home-cat-pill px-3 py-1 rounded-md text-xs font-medium bg-surface-container-high text-on-surface-variant hover:text-on-surface");
      pill.className = "home-cat-pill active px-3 py-1 rounded-md text-xs font-medium bg-primary-container text-on-primary-container";
      state.homeQuickCategory = pill.dataset.cat;
      updateHomeQuickSpend();
    };
  });

  updateHomeQuickSpend();
}

function updateHomeQuickSpend() {
  const cat = state.homeQuickCategory;
  const userCards = state.allCards.filter(c => state.walletCards.includes(c.id));
  
  const catNames = {
    dining: 'Dining & Restaurants',
    flights: 'Flights & Airfare',
    groceries: 'Supermarkets & Groceries',
    gas: 'Gas Stations & EV'
  };

  if (userCards.length === 0) {
    document.getElementById('homeQuickCatName').textContent = catNames[cat] || cat;
    document.getElementById('homeQuickCardName').textContent = 'No Cards in Wallet';
    document.getElementById('homeQuickMultiplier').innerHTML = `0x <span class="text-xs font-normal">Accrual</span>`;
    document.getElementById('homeQuickRule').textContent = 'Add your cards on the Wallet tab to calculate your highest multiplier.';
    return;
  }

  let bestCard = userCards[0];
  let maxRate = 0;
  let ruleText = '';
  let unit = 'x PTS';

  userCards.forEach(c => {
    const mult = c.multipliers && c.multipliers[cat];
    if (mult && mult.rate > maxRate) {
      maxRate = mult.rate;
      bestCard = c;
      ruleText = mult.rule;
      unit = mult.unit.includes('%') ? '% CASH BACK' : 'x PTS';
    }
  });

  document.getElementById('homeQuickCatName').textContent = catNames[cat] || cat;
  document.getElementById('homeQuickCardName').textContent = bestCard ? bestCard.name : 'None';
  document.getElementById('homeQuickMultiplier').innerHTML = `${maxRate > 0 ? (unit.includes('%') ? maxRate + '%' : maxRate.toFixed(1) + 'x') : '1.0x'} <span class="text-xs font-normal">${unit}</span>`;
  document.getElementById('homeQuickRule').textContent = ruleText || (bestCard ? `Use ${bestCard.name} for optimal return.` : 'Add cards to your wallet.');
}

function renderHomeCreditBurn(userCards) {
  const container = document.getElementById('homeCreditBurnContainer');
  if (!container) return;
  container.innerHTML = '';

  if (userCards.length === 0) {
    container.innerHTML = `
      <div class="py-6 text-center text-xs text-outline">
        <span class="material-symbols-outlined text-3xl mb-1 text-outline/60">credit_card_off</span>
        <p>Connect cards to your wallet to track monthly statement credits & annual fee burn rate.</p>
      </div>
    `;
    return;
  }

  // Collect all credits across all active cards
  const allCreditsList = [];
  userCards.forEach(card => {
    (card.keyCredits || []).forEach(credit => {
      allCreditsList.push({
        cardId: card.id,
        cardName: card.name,
        cardNetwork: card.network,
        credit
      });
    });
  });

  if (allCreditsList.length === 0) {
    container.innerHTML = `
      <div class="py-6 text-center text-xs text-outline">
        <p>None of your active cards have annual statement credit requirements.</p>
      </div>
    `;
    return;
  }

  // Show top 4 credits (prioritizing monthly & unredeemed)
  const sorted = [...allCreditsList].sort((a, b) => {
    const aClaimed = isCreditClaimed(a.cardId, a.credit.name, a.credit.cadence);
    const bClaimed = isCreditClaimed(b.cardId, b.credit.name, b.credit.cadence);
    if (!aClaimed && bClaimed) return -1;
    if (aClaimed && !bClaimed) return 1;
    return b.credit.value - a.credit.value;
  });

  sorted.slice(0, 4).forEach(({ cardId, cardName, cardNetwork, credit }) => {
    const claimed = isCreditClaimed(cardId, credit.name, credit.cadence);
    const isMonthly = String(credit.cadence).includes('/mo') || String(credit.cadence).includes('month');
    const el = document.createElement('div');
    el.className = "p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container-highest/30 flex items-center justify-between gap-3 transition-colors hover:border-surface-container-highest";

    el.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between text-xs mb-1">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-full ${claimed ? 'bg-secondary' : isMonthly ? 'bg-tertiary-container animate-pulse' : 'bg-outline'} shrink-0"></span>
            <span class="font-medium text-on-surface truncate">${credit.name}</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono ${getNetworkBadgeClass(cardNetwork)}">${cardNetwork}</span>
          </div>
          <span class="font-mono text-[11px] ${claimed ? 'text-secondary font-semibold' : 'text-outline'}">
            ${claimed ? 'Claimed' : credit.cadence || 'Annual'}
          </span>
        </div>
        <div class="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
          <div class="h-full rounded-full transition-all duration-300 ${claimed ? 'bg-secondary w-full' : 'bg-outline-variant w-0'}"></div>
        </div>
        <div class="flex justify-between text-[10px] font-mono text-outline mt-1">
          <span>$${credit.value} value</span>
          <span>${claimed ? 'Redeemed' : 'Ready to claim'}</span>
        </div>
      </div>
      <button class="shrink-0 px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all ${claimed ? 'bg-secondary/10 border border-secondary/30 text-secondary hover:bg-secondary/20' : 'bg-primary-container text-on-primary-container hover:opacity-90'}" title="${claimed ? 'Click to mark unredeemed' : 'Click to mark claimed'}">
        ${claimed ? '✓ Done' : 'Claim'}
      </button>
    `;

    const btn = el.querySelector('button');
    btn.onclick = (e) => {
      e.stopPropagation();
      toggleCreditClaim(cardId, credit.name, credit.cadence, credit.value);
    };

    container.appendChild(el);
  });

  if (sorted.length > 4) {
    const moreEl = document.createElement('div');
    moreEl.className = "text-center pt-1";
    moreEl.innerHTML = `
      <button class="text-[11px] font-mono text-primary-container hover:underline" onclick="window.switchTab('perks')">
        View & Audit All ${sorted.length} Statement Credits in Perks Tab →
      </button>
    `;
    container.appendChild(moreEl);
  }
}

// =========================================================================
// VIEW 2: OFFERS DIRECTORY & FILTERING
// =========================================================================
function setupOfferControls() {
  // Search input
  const searchInput = document.getElementById('offerSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.offerSearch = e.target.value;
      if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', state.offerSearch === '');
      renderOffersView();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.offerSearch = '';
      clearSearchBtn.classList.add('hidden');
      renderOffersView();
    });
  }

  // Sort dropdown
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderOffersView();
    });
  }

  // Single category focus mode checkbox
  const singleCatCheckbox = document.getElementById('singleCategoryModeCheckbox');
  const catModeNotice = document.getElementById('catModeNotice');
  if (singleCatCheckbox) {
    singleCatCheckbox.addEventListener('change', (e) => {
      state.singleCategoryMode = e.target.checked;
      if (catModeNotice) {
        catModeNotice.textContent = state.singleCategoryMode ? 'Single Category Focus Active' : 'Multi-Select Active';
        catModeNotice.className = state.singleCategoryMode ? 'text-primary-container text-[10px]' : 'text-secondary text-[10px]';
      }
      if (state.singleCategoryMode && state.selectedCategories.size > 1) {
        const first = Array.from(state.selectedCategories).find(c => c !== 'all') || 'all';
        state.selectedCategories = new Set([first]);
        updateCategoryPillUI();
      }
      renderOffersView();
    });
  }

  // Category Pills delegation
  const catContainer = document.getElementById('categoryPillsContainer');
  if (catContainer) {
    catContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;
      const cat = btn.dataset.cat;

      if (state.singleCategoryMode) {
        state.selectedCategories = new Set([cat]);
      } else {
        if (cat === 'all') {
          state.selectedCategories = new Set(['all']);
        } else {
          state.selectedCategories.delete('all');
          if (state.selectedCategories.has(cat)) {
            state.selectedCategories.delete(cat);
            if (state.selectedCategories.size === 0) {
              state.selectedCategories.add('all');
            }
          } else {
            state.selectedCategories.add(cat);
          }
        }
      }

      updateCategoryPillUI();
      renderOffersView();
    });
  }

  // Network Chips delegation
  const netButtons = document.querySelectorAll('.net-chip');
  netButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      netButtons.forEach(b => b.classList.remove('ring-1', 'ring-primary-container'));
      btn.classList.add('ring-1', 'ring-primary-container');
      state.selectedNetwork = btn.dataset.network;
      renderOffersView();
    });
  });

  // Reset filter button
  const resetBtn = document.getElementById('resetOfferFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.offerSearch = '';
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
      state.selectedCategories = new Set(['all']);
      state.selectedNetwork = 'all';
      state.sortBy = 'default';
      state.walletScopeOnly = true;
      if (sortSelect) sortSelect.value = 'default';
      netButtons.forEach(b => b.classList.remove('ring-1', 'ring-primary-container'));
      const allNetBtn = document.querySelector('.net-chip[data-network="all"]');
      if (allNetBtn) allNetBtn.classList.add('ring-1', 'ring-primary-container');
      updateCategoryPillUI();
      renderOffersView();
    });
  }
}

function updateCategoryPillUI() {
  const pills = document.querySelectorAll('.cat-pill');
  pills.forEach(pill => {
    const cat = pill.dataset.cat;
    const isActive = state.selectedCategories.has(cat);
    if (isActive) {
      pill.className = "cat-pill active px-3 py-1 rounded-full text-xs font-medium border border-primary-container bg-primary-container/10 text-primary-container";
    } else {
      pill.className = "cat-pill px-3 py-1 rounded-full text-xs font-medium border border-surface-container-highest bg-surface-container hover:border-outline text-on-surface-variant";
    }
  });
}

function renderOffersView() {
  // STRICTLY only show offers for cards in user's active wallet
  let list = state.allOffers.filter(item => state.walletCards.includes(item.cardId));

  // Category filter
  if (!state.selectedCategories.has('all')) {
    const activeCats = Array.from(state.selectedCategories).map(c => c.toLowerCase());
    list = list.filter(item => 
      activeCats.some(c => item.category.toLowerCase().includes(c) || c.includes(item.category.toLowerCase()))
    );
  }

  // Network filter
  if (state.selectedNetwork !== 'all') {
    list = list.filter(item => item.network.toLowerCase() === state.selectedNetwork.toLowerCase());
  }

  // Search filter
  if (state.offerSearch.trim() !== '') {
    const q = state.offerSearch.trim().toLowerCase();
    list = list.filter(item =>
      item.merchant.toLowerCase().includes(q) ||
      item.cardName.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.terms.toLowerCase().includes(q)
    );
  }

  // Sorting
  switch (state.sortBy) {
    case 'price':
      list.sort((a, b) => b.benefitAmount - a.benefitAmount);
      break;
    case 'rate':
      list.sort((a, b) => b.discountPercent - a.discountPercent);
      break;
    case 'total_value':
      list.sort((a, b) => (b.maxReward || b.benefitAmount) - (a.maxReward || a.benefitAmount));
      break;
    case 'expiration':
      list.sort((a, b) => a.daysLeft - b.daysLeft);
      break;
    case 'category':
      list.sort((a, b) => a.category.localeCompare(b.category));
      break;
    case 'merchant':
      list.sort((a, b) => a.merchant.localeCompare(b.merchant));
      break;
    default:
      list.sort((a, b) => {
        if (a.isExpiringSoon && !b.isExpiringSoon) return -1;
        if (!a.isExpiringSoon && b.isExpiringSoon) return 1;
        return b.benefitAmount - a.benefitAmount;
      });
  }

  // Update stat numbers
  const totalVal = list.reduce((sum, item) => sum + (item.maxReward || item.benefitAmount), 0);
  const avgRate = list.length > 0 
    ? (list.reduce((sum, item) => sum + item.discountPercent, 0) / list.length).toFixed(1)
    : 0;
  const expiringCount = list.filter(item => item.daysLeft <= 2 || item.isExpiringSoon).length;

  const totalValEl = document.getElementById('offersTotalVal');
  const avgRateEl = document.getElementById('offersAvgRate');
  const expCountEl = document.getElementById('offersExpiringCount');
  const countBadgeEl = document.getElementById('offersCountBadge');

  if (totalValEl) totalValEl.textContent = `$${totalVal.toLocaleString()}`;
  if (avgRateEl) avgRateEl.textContent = `${avgRate}%`;
  if (expCountEl) expCountEl.textContent = expiringCount;
  if (countBadgeEl) countBadgeEl.textContent = list.length;

  const container = document.getElementById('activeOffersSection');
  const emptyState = document.getElementById('offersEmptyState');
  if (!container || !emptyState) return;
  container.innerHTML = '';

  // Check if wallet is empty
  if (state.walletCards.length === 0) {
    emptyState.classList.remove('hidden');
    const titleEl = document.getElementById('offersEmptyTitle');
    const descEl = document.getElementById('offersEmptyDesc');
    if (titleEl) titleEl.textContent = "No cards in your wallet yet";
    if (descEl) descEl.textContent = "Add cards to your wallet to see targeted merchant offers available for your cards.";
    return;
  }

  // Check if search/category filter returned 0
  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    const titleEl = document.getElementById('offersEmptyTitle');
    const descEl = document.getElementById('offersEmptyDesc');
    if (titleEl) titleEl.textContent = "No matching offers for your cards";
    if (descEl) descEl.textContent = "Try clearing search keywords or selecting All Categories.";
    return;
  }
  emptyState.classList.add('hidden');

  // Render Offer Cards
  list.forEach(item => {
    const article = document.createElement('article');
    article.className = "offer-item group bg-surface-container-low hover:bg-surface-container/70 transition-all rounded-xl p-5 border border-surface-container-highest/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer";
    
    const isSpecialRebate = item.heroBenefit.includes('%');
    const heroColorClass = isSpecialRebate ? 'text-secondary' : 'text-primary-container';

    article.innerHTML = `
      <div class="flex items-center gap-4 min-w-[240px]">
        <div class="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center ${heroColorClass} shrink-0">
          <span class="material-symbols-outlined text-2xl">${item.icon || 'local_offer'}</span>
        </div>
        <div>
          <h3 class="font-headline text-base font-semibold text-on-surface group-hover:text-primary-container transition-colors">${item.merchant}</h3>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="inline-block px-2 py-0.5 rounded text-[11px] font-mono ${getNetworkBadgeClass(item.network)}">${item.cardName}</span>
            <span class="inline-block px-1.5 py-0.5 rounded bg-surface-container-highest/40 text-[10px] font-mono text-outline">${item.category}</span>
          </div>
        </div>
      </div>

      <!-- HERO BENEFIT METRIC -->
      <div class="flex-1 flex flex-col md:items-center">
        <div class="text-3xl lg:text-4xl font-bold tracking-tight ${heroColorClass} font-mono-metric leading-none">
          ${item.heroBenefit}
        </div>
        <span class="text-xs text-outline mt-1 font-normal text-center">${item.subtitle}</span>
      </div>

      <!-- Expiry countdown & Action -->
      <div class="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
        <span class="text-xs font-mono ${item.daysLeft <= 2 ? 'text-tertiary-container font-semibold' : 'text-outline'}">
          ${item.expiresInText}
        </span>
        <button class="more-info-btn text-xs font-medium px-4 py-2 rounded-lg bg-surface-container-high hover:bg-primary-container hover:text-on-primary-container text-on-surface transition-colors flex items-center gap-1.5" type="button">
          <span>More Info</span>
          <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
      </div>
    `;

    article.addEventListener('click', () => openDrawer(item));
    container.appendChild(article);
  });
}

function getNetworkBadgeClass(net) {
  switch ((net || '').toLowerCase()) {
    case 'amex':
    case 'american express':
      return 'badge-amex';
    case 'chase':
      return 'badge-chase';
    case 'capital one':
      return 'badge-capone';
    case 'discover':
      return 'badge-discover';
    case 'citi':
      return 'badge-citi';
    default:
      return 'badge-bilt';
  }
}

// =========================================================================
// VIEW 3: WALLET & POPULAR CARDS PICKER
// =========================================================================
function setupWalletControls() {
  const addCardBtn = document.getElementById('addCardBtn');
  const openWalletModalBtn = document.getElementById('openWalletModalBtn');
  const walletModal = document.getElementById('walletModalOverlay');
  const closeWalletModalBtn = document.getElementById('closeWalletModalBtn');
  const applyWalletCardsBtn = document.getElementById('applyWalletCardsBtn');
  const selectAllCardsBtn = document.getElementById('selectAllCardsBtn');

  function openWalletModal() {
    renderCardSelectionList();
    walletModal.classList.remove('opacity-0', 'pointer-events-none');
  }

  function closeWalletModal() {
    walletModal.classList.add('opacity-0', 'pointer-events-none');
  }

  if (addCardBtn) addCardBtn.addEventListener('click', openWalletModal);
  if (openWalletModalBtn) openWalletModalBtn.addEventListener('click', openWalletModal);
  if (closeWalletModalBtn) closeWalletModalBtn.addEventListener('click', closeWalletModal);
  if (walletModal) {
    walletModal.addEventListener('click', (e) => {
      if (e.target === walletModal) closeWalletModal();
    });
  }

  if (applyWalletCardsBtn) {
    applyWalletCardsBtn.addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('.card-modal-checkbox:checked')).map(cb => cb.value);
      state.walletCards = checked;
      saveWalletToStorage();
      closeWalletModal();
      showToast(`Wallet updated (${checked.length} cards active)`);
      renderAllViews();
    });
  }

  if (selectAllCardsBtn) {
    selectAllCardsBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.card-modal-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
      updateModalSelectedCount();
    });
  }

  // Issuer filter tabs on the in-page Browse Cards section
  const issuerTabs = document.querySelectorAll('.issuer-tab');
  issuerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      issuerTabs.forEach(t => t.className = "issuer-tab px-2.5 py-1 rounded text-xs font-mono bg-surface-container-high text-on-surface-variant hover:text-on-surface");
      tab.className = "issuer-tab active px-2.5 py-1 rounded text-xs font-mono bg-primary-container text-on-primary-container font-semibold";
      state.walletIssuerFilter = tab.dataset.issuer;
      renderPopularCardsPicker();
    });
  });

  setupCustomCardControls();
}

function setupCustomCardControls() {
  const modalOverlay = document.getElementById('customCardModalOverlay');
  const openBtn = document.getElementById('openCustomCardModalBtn');
  const closeBtn = document.getElementById('closeCustomCardModalBtn');
  const cancelBtn = document.getElementById('cancelCustomCardBtn');
  const saveBtn = document.getElementById('saveCustomCardBtn');

  function openCustomCardModal() {
    if (modalOverlay) modalOverlay.classList.remove('opacity-0', 'pointer-events-none');
  }

  function closeCustomCardModal() {
    if (modalOverlay) modalOverlay.classList.add('opacity-0', 'pointer-events-none');
  }

  if (openBtn) openBtn.addEventListener('click', openCustomCardModal);
  if (closeBtn) closeBtn.addEventListener('click', closeCustomCardModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeCustomCardModal);

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = document.getElementById('customCardNameInput')?.value?.trim();
      const issuer = document.getElementById('customCardIssuerInput')?.value?.trim();
      const network = document.getElementById('customCardNetworkSelect')?.value || 'Visa';
      const fee = parseFloat(document.getElementById('customCardFeeInput')?.value) || 0;
      const credits = parseFloat(document.getElementById('customCardCreditsInput')?.value) || 0;
      const program = document.getElementById('customCardProgramSelect')?.value || 'cashback';
      const tier = document.getElementById('customCardTierInput')?.value?.trim() || 'Custom Rewards';

      if (!name || !issuer) {
        showToast('Please enter both Card Name and Bank/Issuer');
        return;
      }

      const dining = parseFloat(document.getElementById('customRateDining')?.value) || 1.0;
      const groceries = parseFloat(document.getElementById('customRateGroceries')?.value) || 1.0;
      const gas = parseFloat(document.getElementById('customRateGas')?.value) || 1.0;
      const everyday = parseFloat(document.getElementById('customRateEveryday')?.value) || 1.0;
      const flights = parseFloat(document.getElementById('customRateFlights')?.value) || 1.0;
      const hotels = parseFloat(document.getElementById('customRateHotels')?.value) || 1.0;
      const transit = parseFloat(document.getElementById('customRateTransit')?.value) || 1.0;
      const streaming = parseFloat(document.getElementById('customRateStreaming')?.value) || 1.0;

      const isCash = program === 'cashback';
      const unit = isCash ? '% Cash Back' : 'x Points';

      const customId = `custom-${Date.now()}`;
      const newCard = {
        id: customId,
        name,
        issuer,
        network,
        networkColor: network === 'Amex' ? '#006FCF' : (network === 'Mastercard' ? '#EB001B' : '#0A2F6E'),
        annualFee: fee,
        totalCreditsValue: credits,
        nickname: `${name.toUpperCase()} // CUSTOM`,
        defaultInWallet: false,
        last4: '0000',
        cardTier: tier,
        rewardProgram: program,
        isCustom: true,
        multipliers: {
          dining: { rate: dining, unit, rule: `${dining}${unit.includes('%') ? '%' : 'x'} on dining & restaurants` },
          groceries: { rate: groceries, unit, rule: `${groceries}${unit.includes('%') ? '%' : 'x'} on supermarkets & groceries` },
          gas: { rate: gas, unit, rule: `${gas}${unit.includes('%') ? '%' : 'x'} on gas & EV` },
          everyday: { rate: everyday, unit, rule: `${everyday}${unit.includes('%') ? '%' : 'x'} catch-all everyday base rate` },
          flights: { rate: flights, unit, rule: `${flights}${unit.includes('%') ? '%' : 'x'} on flights` },
          hotels: { rate: hotels, unit, rule: `${hotels}${unit.includes('%') ? '%' : 'x'} on hotels` },
          transit: { rate: transit, unit, rule: `${transit}${unit.includes('%') ? '%' : 'x'} on transit` },
          streaming: { rate: streaming, unit, rule: `${streaming}${unit.includes('%') ? '%' : 'x'} on streaming` }
        },
        keyCredits: credits > 0 ? [
          { name: `${name} Annual Credit`, value: credits, cadence: 'Annual', desc: 'User-configured custom annual statement credit' }
        ] : [],
        protections: ['Custom configured protection matrix']
      };

      state.customCards.push(newCard);
      state.allCards.push(newCard);
      if (!state.walletCards.includes(customId)) {
        state.walletCards.push(customId);
      }

      saveCustomCardsToStorage();
      saveWalletToStorage();

      // Reset input fields
      const nameInput = document.getElementById('customCardNameInput');
      const issuerInput = document.getElementById('customCardIssuerInput');
      const feeInput = document.getElementById('customCardFeeInput');
      const creditsInput = document.getElementById('customCardCreditsInput');
      const tierInput = document.getElementById('customCardTierInput');
      if (nameInput) nameInput.value = '';
      if (issuerInput) issuerInput.value = '';
      if (feeInput) feeInput.value = '0';
      if (creditsInput) creditsInput.value = '0';
      if (tierInput) tierInput.value = '';

      closeCustomCardModal();
      showToast(`Custom card "${name}" created and added to wallet!`);
      renderAllViews();
    });
  }
}

window.deleteCustomCard = function(cardId) {
  state.customCards = state.customCards.filter(c => c.id !== cardId);
  state.allCards = state.allCards.filter(c => c.id !== cardId);
  state.walletCards = state.walletCards.filter(id => id !== cardId);
  saveCustomCardsToStorage();
  saveWalletToStorage();
  showToast('Custom card deleted');
  renderAllViews();
};

function renderCardSelectionList() {
  const container = document.getElementById('cardSelectionList');
  if (!container) return;
  container.innerHTML = '';

  state.allCards.forEach(card => {
    const isChecked = state.walletCards.includes(card.id);
    const row = document.createElement('div');
    row.className = "pt-3 pb-1 flex items-center justify-between gap-3";
    row.innerHTML = `
      <label class="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
        <input type="checkbox" value="${card.id}" ${isChecked ? 'checked' : ''} class="card-modal-checkbox w-4 h-4 rounded border-surface-container-highest text-primary-container focus:ring-0 cursor-pointer"/>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-headline font-semibold text-sm text-on-surface truncate">${card.name}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${getNetworkBadgeClass(card.network)}">${card.network}</span>
          </div>
          <p class="text-xs text-outline mt-0.5 truncate">${card.nickname} • Fee: $${card.annualFee}/yr • Tier: ${card.cardTier || 'Standard'}</p>
        </div>
      </label>
      <div class="text-right shrink-0">
        <span class="text-xs font-mono text-secondary">${card.totalCreditsValue > 0 ? `+$${card.totalCreditsValue} credits` : '$0 Fee'}</span>
      </div>
    `;
    container.appendChild(row);
  });

  updateModalSelectedCount();

  document.querySelectorAll('.card-modal-checkbox').forEach(cb => {
    cb.addEventListener('change', updateModalSelectedCount);
  });
}

function updateModalSelectedCount() {
  const count = document.querySelectorAll('.card-modal-checkbox:checked').length;
  const el = document.getElementById('modalSelectedCount');
  if (el) el.textContent = count;
}

function renderWalletView() {
  const userCards = state.allCards.filter(c => state.walletCards.includes(c.id));

  // 1. Render Active Cards Row (Miniature Cards in User's Wallet)
  const cardsContainer = document.getElementById('walletCardsContainer');
  cardsContainer.innerHTML = '';

  if (userCards.length === 0) {
    cardsContainer.innerHTML = `
      <div class="col-span-full py-8 px-6 text-center bg-surface-container-low rounded-xl border border-dashed border-surface-container-highest/60">
        <span class="material-symbols-outlined text-3xl text-outline mb-1">credit_card_off</span>
        <h3 class="font-headline font-semibold text-sm text-on-surface">Your wallet is currently empty</h3>
        <p class="text-xs text-outline mt-1 max-w-md mx-auto">
          Add your cards from the popular catalog below (Chase, Amex, Discover, Capital One, Citi, Bilt) to activate your spend multipliers and credit audit.
        </p>
      </div>
    `;
  } else {
    userCards.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = "bg-surface-container-low rounded-xl p-4 border border-surface-container-highest/40 flex flex-col justify-between hover:border-primary-container/40 transition-colors cursor-pointer group";
      cardEl.onclick = (e) => {
        if (!e.target.closest('button')) openPerkDrawer(card.id);
      };
      cardEl.innerHTML = `
        <div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-[10px] font-mono uppercase tracking-widest text-outline truncate">${card.issuer}</span>
              ${card.isCustom ? `<span class="px-1.5 py-0.2 rounded bg-tertiary-container/20 text-tertiary-container text-[9px] font-mono border border-tertiary-container/40">CUSTOM</span>` : ''}
            </div>
            <span class="w-2 h-2 rounded-full bg-secondary shrink-0"></span>
          </div>
          <h3 class="font-headline font-bold text-sm text-on-surface mt-1 truncate group-hover:text-primary-container transition-colors">${card.name}</h3>
          <div class="text-[11px] text-outline font-mono mt-0.5">
            ${card.totalCreditsValue > 0 ? `+$${card.totalCreditsValue} annual credits` : 'No annual fee'}
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between text-xs font-mono text-outline border-t border-surface-container-highest/30 pt-2">
          <span class="text-primary-container text-[11px] hover:underline flex items-center gap-0.5">
            <span>Perks</span>
            <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
          </span>
          ${card.isCustom ? `
            <button class="text-[10px] text-error hover:underline font-mono" onclick="event.stopPropagation(); deleteCustomCard('${card.id}')">Delete Card</button>
          ` : `
            <button class="text-[10px] text-error hover:underline font-mono" onclick="event.stopPropagation(); removeCardFromWallet('${card.id}')">Remove</button>
          `}
        </div>
      `;
      cardsContainer.appendChild(cardEl);
    });
  }

  // 2. Render In-Page Popular Cards Picker
  renderPopularCardsPicker();

  // 3. Render "Best Card For Each Spend Category" 8-grid
  const cppEncoded = encodeURIComponent(JSON.stringify(state.cppValuations));
  fetch(`/api/wallet/best-cards?walletCards=${state.walletCards.join(',')}&yieldMode=${state.yieldMode}&cppRates=${cppEncoded}`)
    .then(r => r.json())
    .then(json => {
      if (!json.success) return;
      const grid = document.getElementById('bestCardsGrid');
      grid.innerHTML = '';

      const isYieldMode = state.yieldMode === 'effective_yield';

      json.recommendations.forEach(cat => {
        const tile = document.createElement('div');
        tile.className = "bg-surface-container-low rounded-xl p-5 border border-surface-container-highest/40 flex flex-col justify-between hover:bg-surface-container/60 transition-colors cursor-pointer";
        
        const best = cat.bestCard;
        const hasCard = best && best.name !== 'No Card Selected';

        tile.onclick = (e) => {
          if (!e.target.closest('button')) openRuleDrawer(cat.key);
        };

        const mainMetric = hasCard 
          ? (isYieldMode ? best.effectiveYieldText : best.multiplierText) 
          : '—';
        const subMetric = hasCard
          ? (isYieldMode ? `${best.multiplierText} • ${(state.cppValuations[best.rewardProgram] || 1.0)}¢/pt` : best.unit)
          : 'No card selected';

        tile.innerHTML = `
          <div>
            <div class="flex items-center justify-between pb-2">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary-container text-[18px]">${cat.icon || 'category'}</span>
                <span class="font-headline font-semibold text-sm text-on-surface">${cat.name}</span>
              </div>
              <span class="text-[10px] font-mono text-outline uppercase tracking-wider">${cat.tag}</span>
            </div>
            <p class="text-xs text-outline mt-0.5">${cat.subtitle}</p>

            <div class="my-4">
              <div class="text-3xl font-bold font-mono-metric ${hasCard ? (isYieldMode ? 'text-secondary' : 'text-primary-container') : 'text-outline'}">
                ${mainMetric} ${isYieldMode && hasCard ? '<span class="text-xs font-normal font-headline text-outline">ROI</span>' : ''}
              </div>
              <span class="text-xs font-mono text-outline mt-0.5 block">${subMetric}</span>
            </div>
          </div>

          <div class="pt-3 border-t border-surface-container-highest/30 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2 h-2 rounded-full ${hasCard ? 'bg-secondary' : 'bg-outline'} shrink-0"></span>
              <span class="font-medium text-on-surface truncate max-w-[140px]">${hasCard ? best.name : 'Add a Card Below'}</span>
            </div>
            <button class="text-outline hover:text-primary-container flex items-center gap-0.5 text-xs font-mono shrink-0 ml-2" onclick="event.stopPropagation(); openRuleDrawer('${cat.key}')">
              <span>Rule</span>
              <span class="material-symbols-outlined text-[13px]">arrow_forward</span>
            </button>
          </div>
        `;
        grid.appendChild(tile);
      });
    });
}

// In-Page Popular Card Picker Grid
function renderPopularCardsPicker() {
  const container = document.getElementById('popularCardsPickerGrid');
  if (!container) return;
  container.innerHTML = '';

  let list = [...state.allCards];
  if (state.walletIssuerFilter !== 'all') {
    list = list.filter(c => c.issuer.toLowerCase().includes(state.walletIssuerFilter.toLowerCase()) || c.network.toLowerCase().includes(state.walletIssuerFilter.toLowerCase()));
  }

  list.forEach(card => {
    const isInWallet = state.walletCards.includes(card.id);
    const cardTile = document.createElement('div');
    cardTile.className = `p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${isInWallet ? 'bg-surface-container border-primary-container/40' : 'bg-surface-container-lowest border-surface-container-highest/40 hover:border-outline/40'}`;

    cardTile.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-headline font-semibold text-xs text-on-surface truncate">${card.name}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${getNetworkBadgeClass(card.network)}">${card.network}</span>
        </div>
        <div class="text-[11px] text-outline font-mono mt-0.5">
          Fee: $${card.annualFee}/yr • ${card.totalCreditsValue > 0 ? `+$${card.totalCreditsValue} perks` : 'No fee'}
        </div>
      </div>
      <button class="shrink-0 px-3 py-1 rounded-md text-xs font-semibold font-mono transition-all ${isInWallet ? 'bg-secondary/15 text-secondary border border-secondary/40 hover:bg-error/15 hover:text-error hover:border-error/40' : 'bg-primary-container text-on-primary-container hover:opacity-90'}" onclick="toggleCardInWallet('${card.id}')">
        ${isInWallet ? '✓ Added' : '+ Add'}
      </button>
    `;

    container.appendChild(cardTile);
  });
}

window.toggleCardInWallet = function(cardId) {
  const idx = state.walletCards.indexOf(cardId);
  if (idx > -1) {
    state.walletCards.splice(idx, 1);
    showToast('Card removed from wallet');
  } else {
    state.walletCards.push(cardId);
    const card = state.allCards.find(c => c.id === cardId);
    showToast(`${card ? card.name : 'Card'} added to wallet`);
  }
  saveWalletToStorage();
  renderAllViews();
};

window.removeCardFromWallet = function(cardId) {
  state.walletCards = state.walletCards.filter(id => id !== cardId);
  saveWalletToStorage();
  showToast('Card removed from wallet');
  renderAllViews();
};

// =========================================================================
// CATEGORY REWARDS RULES & POLICIES DATABASE
// =========================================================================
/**
 * Detailed rewards policies, calendar spend caps, eligible merchant classifications,
 * and fine-print exclusions for primary spend categories. Rendered inside the
 * slide-out Category Promo Rule Drawer.
 */
const CATEGORY_RULES = {
  dining: {
    title: "Dining & Restaurants",
    icon: "restaurant",
    tag: "FOOD // CATEGORY INTELLIGENCE",
    subtitle: "Worldwide eateries, cafes, bars & food delivery",
    caps: "Amex Gold: Uncapped 4x worldwide. Sapphire Reserve: Uncapped 3x. Citi Custom Cash: 5% on up to $500 spend/billing cycle. Freedom Flex / Discover it: 5% up to $1,500/quarter when dining is an active quarterly bonus.",
    inclusions: "Papa Johns, Domino's, Shake Shack, Chipotle, Starbucks, Dunkin', Five Guys, sit-down restaurants, fast food, food trucks, bars, bakeries, cafes, DoorDash, Uber Eats, Grubhub.",
    exclusions: "Purchases made inside department stores, hotels/casinos billed directly to room folio, wholesale club dining (Costco food court), and event catering contracts."
  },
  groceries: {
    title: "Supermarkets & Groceries",
    icon: "shopping_basket",
    tag: "DAILY // SUPERMARKET INTELLIGENCE",
    subtitle: "US supermarkets, organic grocers & curbside delivery",
    caps: "Amex Gold: 4x at US supermarkets on up to $25,000 per calendar year (then 1x). Blue Cash Preferred: 6% cash back on up to $6,000/yr (then 1%). Citi Custom Cash: 5% on up to $500/billing cycle.",
    inclusions: "H-E-B, Kroger, Whole Foods Market, Trader Joe's, Aldi, Publix, Safeway, Albertsons, Sprouts, Wegmans, Instacart, Shipt.",
    exclusions: "Superstores like Walmart and Target; Wholesale clubs like Costco, Sam's Club, and BJ's Wholesale; convenience stores and liquor stores."
  },
  gas: {
    title: "Gas Stations & EV Charging",
    icon: "local_gas_station",
    tag: "COMMUTE // FUEL INTELLIGENCE",
    subtitle: "Pump fill-ups, convenience fuel stops & EV charging",
    caps: "Blue Cash Preferred: 3% uncapped at US gas stations. Citi Custom Cash: 5% up to $500/billing cycle. Discover it / Freedom Flex: 5% up to $1,500 during quarterly rotation.",
    inclusions: "Shell, Chevron, ExxonMobil, BP, Texaco, Valero, Sunoco, Speedway, Circle K, Buc-ee's, Tesla Supercharger, Electrify America, ChargePoint, EVgo.",
    exclusions: "Gas purchased at supermarket stations (Kroger fuel centers) or warehouse clubs (Costco Gas, Sam's Club Fuel) which may code as wholesale."
  },
  flights: {
    title: "Flights & Airfare",
    icon: "flight",
    tag: "TRAVEL // AIRFARE INTELLIGENCE",
    subtitle: "Direct airline bookings & premium travel portals",
    caps: "Amex Platinum: 5x on flights booked directly with airlines or with Amex Travel up to $500,000/calendar year. Sapphire Reserve: 5x via Chase Travel. Venture X: 5x via Capital One Travel.",
    inclusions: "Delta, United, American Airlines, Southwest, JetBlue, Alaska Airlines, British Airways, Air Canada, Lufthansa, Air France.",
    exclusions: "In-flight Wi-Fi, duty-free retail, baggage cart rentals, airline vacation packages billed via third-party tour operators."
  },
  hotels: {
    title: "Hotels & Stays",
    icon: "hotel",
    tag: "PORTAL // LODGING INTELLIGENCE",
    subtitle: "Booked direct or via bank travel portals",
    caps: "Sapphire Reserve: 10x on hotels booked via Chase Travel. Venture X: 10x via Capital One Travel. Amex Platinum: 5x on prepaid hotels via Amex Travel.",
    inclusions: "Marriott Bonvoy, World of Hyatt, Hilton Honors, IHG Hotels, Wyndham, Boutique hotels, Airbnb, Vrbo.",
    exclusions: "Timeshare presentations, banquet charges, gift shop items not charged to room folio."
  },
  transit: {
    title: "Transit & Rideshare",
    icon: "directions_subway",
    tag: "COMMUTE // TRANSIT INTELLIGENCE",
    subtitle: "Trains, subways, tolls, parking, Uber, Lyft",
    caps: "Sapphire Reserve: 3x uncapped on general travel & transit (after $300 travel credit). Amex BCP: 3% uncapped. Venture X: 2x uncapped baseline.",
    inclusions: "Uber, Lyft, taxis, commuter trains (Amtrak, NJ Transit, Metra), subways (MTA, BART, CTA, MBTA), toll roads (E-ZPass, FasTrak), parking garages (SpotHero, ParkWhiz).",
    exclusions: "Limousine charters, moving van rentals (U-Haul), truck rentals, parking violation fines."
  },
  streaming: {
    title: "Tech & Streaming Subscriptions",
    icon: "smart_display",
    tag: "DIGITAL // STREAMING INTELLIGENCE",
    subtitle: "Digital entertainment, audio & video streaming",
    caps: "Blue Cash Preferred: 6% cash back uncapped on select US streaming subscriptions. Amex Platinum: $240/yr ($20/mo) statement credit offset. Sapphire Preferred: 3x on select streaming.",
    inclusions: "Disney+, Hulu, ESPN+, Netflix, Spotify, Apple Music, Max, Peacock, Paramount+, YouTube TV, Amazon Prime, Audible.",
    exclusions: "Hardware purchases (Apple TV device, Roku stick), movie theater tickets, streaming services bundled into wireless cellular phone bills."
  },
  everyday: {
    title: "Catch-All / Everyday Spend",
    icon: "all_inclusive",
    tag: "BASELINE // UNREVISED SPEND",
    subtitle: "Medical, utilities, home, taxes, non-category retail",
    caps: "Capital One Venture X: 2x miles uncapped on all spend everywhere. Citi Double Cash: 2% cash back uncapped (1% buy + 1% pay). Freedom Unlimited: 1.5% uncapped cash back.",
    inclusions: "Doctor visits, hospital bills, dental, veterinary, home maintenance, contractors, tax payments, auto repairs, clothing boutiques.",
    exclusions: "Cash advances, money orders, casino gaming chips, peer-to-peer balance transfers."
  }
};

// =========================================================================
// LIVE SPEND ROUTER / SWIPE ADVISOR
// =========================================================================
function setupSpendRouter() {
  const input = document.getElementById('spendRouterInput');
  const resultBox = document.getElementById('spendRouterResult');
  if (!input || !resultBox) return;

  let timeout = null;
  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    const query = e.target.value.trim();
    if (!query) {
      resultBox.classList.add('hidden');
      return;
    }

    timeout = setTimeout(async () => {
      try {
        const cppEncoded = encodeURIComponent(JSON.stringify(state.cppValuations));
        const res = await fetch(`/api/wallet/route-spend?merchant=${encodeURIComponent(query)}&walletCards=${state.walletCards.join(',')}&yieldMode=${state.yieldMode}&cppRates=${cppEncoded}`);
        const json = await res.json();
        if (json.success) {
          renderSpendRouterResult(json);
        }
      } catch (err) {
        console.error('Error routing spend:', err);
      }
    }, 150);
  });
}

function renderSpendRouterResult(data) {
  const resultBox = document.getElementById('spendRouterResult');
  if (!resultBox) return;
  resultBox.classList.remove('hidden');

  const card = data.bestCard;
  const offers = data.stackedOffers || [];
  const hasUserCards = state.walletCards.length > 0;
  const isFromWallet = data.isFromWallet;
  const storeName = data.merchantTitle || data.merchant;
  const isYield = state.yieldMode === 'effective_yield';

  const rateText = data.topRate 
    ? (data.topUnit && data.topUnit.includes('%') ? `${data.topRate}%` : `${data.topRate.toFixed(1)}x`) 
    : '2x Base';

  const yieldText = data.topYieldText || `${data.topYield || 0}%`;
  const programCpp = state.cppValuations[data.rewardProgram] || 1.0;

  resultBox.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] font-mono uppercase tracking-wider text-secondary flex items-center gap-1">
            <span class="material-symbols-outlined text-[13px]">check_circle</span>
            <span>IDENTIFIED: ${storeName}</span>
          </span>
          <span class="text-outline">•</span>
          <span class="text-xs text-outline font-mono uppercase">Category: ${data.detectedCategory}</span>
          ${isFromWallet ? `
            <span class="px-1.5 py-0.2 rounded bg-secondary/15 text-secondary border border-secondary/40 text-[10px] font-mono">In Your Wallet</span>
          ` : `
            <span class="px-1.5 py-0.2 rounded bg-tertiary-container/15 text-tertiary-container border border-tertiary-container/40 text-[10px] font-mono">Catalog Best Recommendation</span>
          `}
        </div>

        <h4 class="text-lg font-headline font-bold text-on-surface mt-1">${card ? card.name : 'No Card Matched'}</h4>
        <p class="text-xs text-outline mt-0.5">${data.topRule || (card ? card.multipliers?.[data.detectedCategory]?.rule : 'Optimal spend card')}</p>
        
        <!-- CPP Valuation Arbitrage Explanation -->
        <div class="mt-2 text-[11px] font-mono text-secondary flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">calculate</span>
          <span>Valuation: ${rateText} @ ${programCpp}¢/pt = <strong>${yieldText} Effective Cash Yield</strong></span>
        </div>
      </div>

      <div class="flex items-center gap-4 shrink-0">
        <div class="text-right">
          <div class="text-2xl font-bold font-mono-metric ${isYield ? 'text-secondary' : 'text-primary-container'}">
            ${isYield ? yieldText : rateText}
          </div>
          <span class="text-xs text-outline font-mono">${isYield ? `${rateText} raw` : `${yieldText} yield`}</span>
        </div>
        ${(!isFromWallet && card) ? `
          <button class="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:opacity-90 transition-opacity font-mono" onclick="toggleCardInWallet('${card.id}')">
            + Add to Wallet
          </button>
        ` : ''}
      </div>
    </div>

    ${offers.length > 0 ? `
      <div class="mt-4 pt-3 border-t border-surface-container-highest/40">
        <span class="text-xs font-mono uppercase tracking-wider text-tertiary-container flex items-center gap-1 font-semibold">
          <span class="material-symbols-outlined text-[14px]">bolt</span>
          <span>Targeted Public Promo Offer Available:</span>
        </span>
        <div class="mt-2 flex items-center justify-between p-3 rounded-lg bg-surface-container-lowest border border-primary-container/40 cursor-pointer hover:border-primary-container transition-colors" onclick="openDrawer(state.allOffers.find(o => o.id === '${offers[0].id}') || offers[0])">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-headline font-bold text-sm text-on-surface">${offers[0].merchant}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${getNetworkBadgeClass(offers[0].network)}">${offers[0].cardName}</span>
            </div>
            <div class="text-xs text-outline mt-0.5 truncate">${offers[0].subtitle}</div>
          </div>
          <div class="text-right font-mono-metric font-bold text-primary-container text-base shrink-0 ml-3">
            ${offers[0].heroBenefit}
          </div>
        </div>
      </div>
    ` : ''}
  `;
}

function setupPerksControls() {
  const annualBtn = document.getElementById('perkAnnualViewBtn');
  const monthlyBtn = document.getElementById('perkMonthlyViewBtn');
  if (annualBtn && monthlyBtn) {
    annualBtn.addEventListener('click', () => {
      state.perkViewMode = 'annual';
      annualBtn.className = "px-3 py-1.5 rounded-md font-medium transition-all bg-surface-container-high text-primary-container shadow-sm";
      monthlyBtn.className = "px-3 py-1.5 rounded-md font-medium text-on-surface-variant hover:text-on-surface transition-all";
      renderPerksView();
    });

    monthlyBtn.addEventListener('click', () => {
      state.perkViewMode = 'monthly';
      monthlyBtn.className = "px-3 py-1.5 rounded-md font-medium transition-all bg-surface-container-high text-primary-container shadow-sm";
      annualBtn.className = "px-3 py-1.5 rounded-md font-medium text-on-surface-variant hover:text-on-surface transition-all";
      renderPerksView();
    });
  }

  // Cadence filter buttons for credit checklist
  const cadencePills = document.querySelectorAll('.credit-cadence-pill');
  cadencePills.forEach(pill => {
    pill.onclick = () => {
      cadencePills.forEach(p => {
        p.className = "credit-cadence-pill px-2.5 py-1 rounded text-xs font-mono bg-surface-container-high text-on-surface-variant hover:text-on-surface";
      });
      pill.className = "credit-cadence-pill active px-2.5 py-1 rounded text-xs font-mono bg-primary-container text-on-primary-container font-semibold";
      state.creditCadenceFilter = pill.dataset.cadence;
      const userCards = state.allCards.filter(c => state.walletCards.includes(c.id));
      renderCreditChecklist(userCards);
    };
  });
}

function renderCreditChecklist(userCards) {
  const grid = document.getElementById('creditChecklistGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (userCards.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-8 text-center text-xs text-outline">
        <p>No cards connected to your wallet yet. Add cards in the Wallet tab to audit and claim your credits.</p>
      </div>
    `;
    return;
  }

  // Collect all credits across wallet
  const allCredits = [];
  userCards.forEach(card => {
    (card.keyCredits || []).forEach(credit => {
      allCredits.push({
        cardId: card.id,
        cardName: card.name,
        cardNetwork: card.network,
        credit
      });
    });
  });

  if (allCredits.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-8 text-center text-xs text-outline">
        <p>Your connected cards don't have statement credit obligations.</p>
      </div>
    `;
    return;
  }

  // Filter by cadence
  const filter = state.creditCadenceFilter;
  const filtered = allCredits.filter(item => {
    const cad = String(item.credit.cadence).toLowerCase();
    const isMonthly = cad.includes('/mo') || cad.includes('month');
    if (filter === 'monthly') return isMonthly;
    if (filter === 'annual') return !isMonthly;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-8 text-center text-xs text-outline">
        <p>No statement credits match this cadence filter.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(({ cardId, cardName, cardNetwork, credit }) => {
    const claimed = isCreditClaimed(cardId, credit.name, credit.cadence);
    const isMonthly = String(credit.cadence).includes('/mo') || String(credit.cadence).includes('month');
    const el = document.createElement('div');
    el.className = `p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 cursor-pointer ${
      claimed 
        ? 'bg-surface-container-lowest border-secondary/40 shadow-sm' 
        : 'bg-surface-container-lowest border-surface-container-highest/50 hover:border-primary-container/40'
    }`;

    el.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <span class="text-[10px] font-mono text-outline uppercase tracking-wider block truncate">${cardName}</span>
            <h4 class="font-headline font-semibold text-sm text-on-surface mt-0.5 truncate">${credit.name}</h4>
          </div>
          <div class="text-right shrink-0">
            <div class="font-mono-metric font-bold text-base ${claimed ? 'text-secondary' : 'text-primary-container'}">$${credit.value}</div>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${isMonthly ? 'bg-tertiary-container/15 text-tertiary-container border border-tertiary-container/30' : 'bg-surface-container-high text-outline'}">
              ${credit.cadence || 'Annual'}
            </span>
          </div>
        </div>
        <p class="text-xs text-on-surface-variant mt-2 leading-relaxed">${credit.desc}</p>
      </div>

      <div class="pt-2 border-t border-surface-container-highest/30 flex items-center justify-between">
        <div class="flex items-center gap-1.5 text-[11px] font-mono">
          <span class="w-2 h-2 rounded-full ${claimed ? 'bg-secondary' : 'bg-outline'}"></span>
          <span class="${claimed ? 'text-secondary font-semibold' : 'text-outline'}">
            ${claimed ? 'Claimed This Cycle' : 'Ready to Claim'}
          </span>
        </div>
        <button class="px-3 py-1 rounded text-xs font-mono font-semibold transition-all ${
          claimed
            ? 'bg-secondary/15 border border-secondary/40 text-secondary hover:bg-secondary/25'
            : 'bg-primary-container text-on-primary-container hover:opacity-90'
        }">
          ${claimed ? '✓ Claimed' : 'Mark Claimed'}
        </button>
      </div>
    `;

    el.onclick = () => {
      toggleCreditClaim(cardId, credit.name, credit.cadence, credit.value);
    };

    grid.appendChild(el);
  });
}

function renderPerksView() {
  const userCards = state.allCards.filter(c => state.walletCards.includes(c.id));
  const hasCards = userCards.length > 0;
  const isMonthly = state.perkViewMode === 'monthly';

  const totalCredits = userCards.reduce((sum, c) => sum + (c.totalCreditsValue || 0), 0);
  const totalFees = userCards.reduce((sum, c) => sum + (c.annualFee || 0), 0);
  const netSurplus = totalCredits - totalFees;
  const efficiency = totalFees > 0 ? Math.round((totalCredits / totalFees) * 100) : 100;

  // Compute claimed credits in current cycle
  let claimedTotalDollars = 0;
  userCards.forEach(card => {
    (card.keyCredits || []).forEach(credit => {
      if (isCreditClaimed(card.id, credit.name, credit.cadence)) {
        claimedTotalDollars += credit.value;
      }
    });
  });

  const displayCredits = isMonthly ? Math.round(totalCredits / 12) : totalCredits;
  const displayFees = isMonthly ? Math.round(totalFees / 12) : totalFees;
  const displaySurplus = isMonthly ? Math.round(netSurplus / 12) : netSurplus;
  const unitSuffix = isMonthly ? '/mo' : '';

  const creditsEl = document.getElementById('perksStatementCredits');
  const feesEl = document.getElementById('perksAnnualFees');
  const monthlyFeeEl = document.getElementById('perksMonthlyFee');
  const surplusEl = document.getElementById('perksNetSurplus');
  const effEl = document.getElementById('perksEfficiency');
  const activeCardsLabel = document.getElementById('perksActiveCardsLabel');

  if (activeCardsLabel) activeCardsLabel.textContent = `${userCards.length} ACTIVE CARD${userCards.length === 1 ? '' : 'S'}`;
  if (creditsEl) creditsEl.textContent = `$${displayCredits.toLocaleString()}${unitSuffix}`;
  if (feesEl) feesEl.textContent = `$${displayFees.toLocaleString()}${unitSuffix}`;
  if (monthlyFeeEl) monthlyFeeEl.textContent = `$${(totalFees / 12).toFixed(2)}/mo`;
  if (surplusEl) surplusEl.textContent = `${displaySurplus >= 0 ? '+' : ''}$${displaySurplus.toLocaleString()}${unitSuffix}`;
  if (effEl) effEl.textContent = hasCards ? `Efficiency: +${efficiency}%` : '0 Cards Connected';

  // Checklist claim summary badge
  const summaryBadge = document.getElementById('checklistClaimedSummary');
  if (summaryBadge) {
    const pct = totalCredits > 0 ? Math.round((claimedTotalDollars / totalCredits) * 100) : 0;
    summaryBadge.textContent = `$${claimedTotalDollars.toLocaleString()} / $${totalCredits.toLocaleString()} Claimed (${pct}%)`;
  }

  // Net return spread bar
  const spreadFeesLabel = document.getElementById('spreadFeesLabel');
  const spreadSurplusLabel = document.getElementById('spreadSurplusLabel');
  if (spreadFeesLabel) spreadFeesLabel.textContent = `$${displayFees.toLocaleString()}${unitSuffix}`;
  if (spreadSurplusLabel) spreadSurplusLabel.textContent = `${displaySurplus >= 0 ? '+' : ''}$${displaySurplus.toLocaleString()}${unitSuffix}`;
  
  const totalBar = totalFees + Math.max(0, netSurplus);
  const feeWidth = totalBar > 0 ? Math.round((totalFees / totalBar) * 100) : 50;
  const surplusWidth = 100 - feeWidth;
  const spreadFeeBar = document.getElementById('spreadFeeBar');
  const spreadSurplusBar = document.getElementById('spreadSurplusBar');
  if (spreadFeeBar) spreadFeeBar.style.width = `${feeWidth}%`;
  if (spreadSurplusBar) spreadSurplusBar.style.width = `${surplusWidth}%`;

  // Render interactive credit redemption checklist
  renderCreditChecklist(userCards);

  // Card perk columns
  const columnsContainer = document.getElementById('perksCardColumns');
  if (!columnsContainer) return;
  columnsContainer.innerHTML = '';

  if (!hasCards) {
    columnsContainer.innerHTML = `
      <div class="col-span-full py-10 px-6 text-center bg-surface-container-low rounded-xl border border-dashed border-surface-container-highest/60">
        <span class="material-symbols-outlined text-4xl text-outline mb-2">account_balance_wallet</span>
        <h3 class="font-headline font-semibold text-base text-on-surface">No cards selected in your wallet</h3>
        <p class="text-xs text-outline mt-1 max-w-md mx-auto">Add your premium cards with annual fees and credits (such as Amex Platinum, Amex Gold, Sapphire Reserve, or Venture X) to audit and maximize your perks.</p>
        <button class="mt-4 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold" onclick="window.switchTab('wallet')">
          Go to Wallet to Add Cards
        </button>
      </div>
    `;
  } else {
    userCards.forEach(card => {
      const col = document.createElement('div');
      col.className = "bg-surface-container-low rounded-xl p-5 sm:p-6 border border-surface-container-highest/40 flex flex-col justify-between space-y-5 hover:border-primary-container/40 transition-all cursor-pointer group";

      const credits = card.keyCredits || [];
      const net = (card.totalCreditsValue || 0) - (card.annualFee || 0);

      const cardDisplayCredits = isMonthly ? Math.round((card.totalCreditsValue || 0) / 12) : (card.totalCreditsValue || 0);
      const cardDisplayFee = isMonthly ? Math.round((card.annualFee || 0) / 12) : (card.annualFee || 0);
      const cardDisplayNet = isMonthly ? Math.round(net / 12) : net;

      col.innerHTML = `
        <div>
          <div class="flex items-center justify-between pb-3 border-b border-surface-container-highest/30">
            <div>
              <span class="text-[10px] font-mono uppercase tracking-widest text-outline">${card.issuer}</span>
              <h3 class="font-headline font-bold text-base text-on-surface mt-0.5 group-hover:text-primary-container transition-colors">${card.name}</h3>
            </div>
            <span class="px-2 py-0.5 rounded bg-surface-container-high text-xs font-mono text-outline">Fee: $${cardDisplayFee}${isMonthly ? '/mo' : '/yr'}</span>
          </div>

          <div class="my-4">
            <span class="text-[10px] font-mono uppercase tracking-wider text-outline">${isMonthly ? 'MONTHLY CREDITS RUN-RATE' : 'TOTAL ANNUAL CREDITS VALUE'}</span>
            <div class="text-3xl font-bold font-mono-metric text-primary-container mt-0.5">$${cardDisplayCredits.toLocaleString()}${isMonthly ? '<span class="text-xs font-normal">/mo</span>' : ''}</div>
            <span class="text-xs font-mono text-secondary mt-0.5 block">Offset: ${cardDisplayNet >= 0 ? '+' : ''}$${cardDisplayNet}${isMonthly ? '/mo' : '/yr'} net value</span>
          </div>

          <div class="space-y-2.5 divide-y divide-surface-container-highest/20">
            ${credits.length > 0 ? credits.slice(0, 4).map(c => `
              <div class="pt-2 flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="w-1.5 h-1.5 rounded-full bg-secondary shrink-0"></span>
                  <span class="text-on-surface truncate">${c.name}</span>
                </div>
                <span class="font-mono-metric font-semibold text-on-surface shrink-0 ml-2">
                  ${isMonthly ? (c.cadence.includes('/mo') ? c.cadence : `$${Math.round(c.value / 12)}/mo`) : `$${c.value}`}
                </span>
              </div>
            `).join('') : '<p class="text-xs text-outline pt-2">No annual fee credits for this card.</p>'}
            ${credits.length > 4 ? `
              <div class="pt-2 text-right">
                <span class="text-[11px] font-mono text-primary-container">+${credits.length - 4} more credits available</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="pt-4 border-t border-surface-container-highest/30">
          <button class="w-full py-2 rounded-lg bg-surface-container-high group-hover:bg-primary-container group-hover:text-on-primary-container text-xs font-semibold text-on-surface flex items-center justify-center gap-1.5 transition-colors" onclick="event.stopPropagation(); openPerkDrawer('${card.id}')">
            <span>View All ${credits.length} Credits Breakdown</span>
            <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
          </button>
        </div>
      `;

      col.onclick = () => openPerkDrawer(card.id);
      columnsContainer.appendChild(col);
    });
  }

  // Aggregate travel protections
  const protContainer = document.getElementById('protectionsGrid');
  if (!protContainer) return;
  protContainer.innerHTML = '';
  const protections = (state.perksData && state.perksData.protections) || [];

  protections.forEach(prot => {
    const el = document.createElement('div');
    el.className = "bg-surface-container-low rounded-xl p-4 border border-surface-container-highest/30 flex items-start gap-3 hover:border-primary-container/40 transition-colors cursor-pointer";
    el.innerHTML = `
      <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0">
        <span class="material-symbols-outlined text-xl">${prot.icon || 'shield'}</span>
      </div>
      <div>
        <h4 class="font-headline font-semibold text-sm text-on-surface">${prot.title}</h4>
        <p class="text-xs text-outline mt-0.5">${prot.subtitle}</p>
        <span class="text-[11px] font-mono text-secondary mt-1 block">${prot.highlight}</span>
      </div>
    `;
    el.addEventListener('click', () => {
      showToast(`${prot.title}: ${prot.subtitle}`);
    });
    protContainer.appendChild(el);
  });
}

// =========================================================================
// SLIDE-OUT DRAWERS (OFFERS, PERKS, CATEGORY RULES)
// =========================================================================
function setupDrawer() {
  // 1. Offer Intelligence Drawer
  const offerOverlay = document.getElementById('drawerOverlay');
  const offerCloseBtn = document.getElementById('closeDrawerBtn');
  const offerDismissBtn = document.getElementById('dismissDrawerBtn');

  function closeOfferDrawer() {
    if (!offerOverlay) return;
    offerOverlay.classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('infoDrawer')?.classList.add('translate-x-full');
  }

  if (offerCloseBtn) offerCloseBtn.addEventListener('click', closeOfferDrawer);
  if (offerDismissBtn) offerDismissBtn.addEventListener('click', closeOfferDrawer);
  if (offerOverlay) {
    offerOverlay.addEventListener('click', (e) => {
      if (e.target === offerOverlay) closeOfferDrawer();
    });
  }

  // 2. Card Perks Intelligence Drawer
  const perkOverlay = document.getElementById('perkDrawerOverlay');
  const perkCloseBtn = document.getElementById('closePerkDrawerBtn');
  const perkDismissBtn = document.getElementById('dismissPerkDrawerBtn');

  if (perkCloseBtn) perkCloseBtn.addEventListener('click', closePerkDrawer);
  if (perkDismissBtn) perkDismissBtn.addEventListener('click', closePerkDrawer);
  if (perkOverlay) {
    perkOverlay.addEventListener('click', (e) => {
      if (e.target === perkOverlay) closePerkDrawer();
    });
  }

  // 3. Category Promo Rule Drawer
  const ruleOverlay = document.getElementById('ruleDrawerOverlay');
  const ruleCloseBtn = document.getElementById('closeRuleDrawerBtn');
  const ruleDismissBtn = document.getElementById('dismissRuleDrawerBtn');

  if (ruleCloseBtn) ruleCloseBtn.addEventListener('click', closeRuleDrawer);
  if (ruleDismissBtn) ruleDismissBtn.addEventListener('click', closeRuleDrawer);
  if (ruleOverlay) {
    ruleOverlay.addEventListener('click', (e) => {
      if (e.target === ruleOverlay) closeRuleDrawer();
    });
  }
}

function openDrawer(item) {
  const overlay = document.getElementById('drawerOverlay');
  const drawer = document.getElementById('infoDrawer');
  if (!overlay || !drawer || !item) return;

  document.getElementById('modalMerchantInitial').textContent = item.merchant.charAt(0);
  document.getElementById('modalMerchant').textContent = item.merchant;
  
  const cardBadge = document.getElementById('modalCard');
  cardBadge.textContent = item.cardName;
  cardBadge.className = `inline-block mt-1 px-2 py-0.5 rounded text-xs font-mono ${getNetworkBadgeClass(item.network)}`;
  
  document.getElementById('modalBenefit').textContent = item.heroBenefit;
  document.getElementById('modalSubtitle').textContent = item.subtitle;
  document.getElementById('modalMinSpend').textContent = `$${item.minSpend.toFixed(2)} USD`;
  document.getElementById('modalRate').textContent = item.effectiveRate;
  document.getElementById('modalExpiry').textContent = `${item.expiresInText} (${item.expirationDate ? item.expirationDate.split('T')[0] : '2026-12-31'})`;
  document.getElementById('modalTerms').textContent = item.terms;
  document.getElementById('modalFinePrint').textContent = item.finePrint || 'Excludes third-party booking sites and gift cards.';
  document.getElementById('modalStacking').textContent = item.stackingStrategy || 'Stack base point multipliers with retailer loyalty programs.';
  
  const link = document.getElementById('modalDirectLink');
  if (link) link.href = item.directUrl || '#';

  overlay.classList.remove('opacity-0', 'pointer-events-none');
  drawer.classList.remove('translate-x-full');
}

// Open Card Perk Intelligence Drawer
function openPerkDrawer(cardId) {
  const card = state.allCards.find(c => c.id === cardId);
  if (!card) return;

  const overlay = document.getElementById('perkDrawerOverlay');
  const drawer = document.getElementById('perkDrawer');
  if (!overlay || !drawer) return;

  document.getElementById('perkDrawerInitial').textContent = card.issuer.charAt(0);
  document.getElementById('perkDrawerCardName').textContent = card.name;
  
  const netBadge = document.getElementById('perkDrawerNetworkBadge');
  netBadge.textContent = card.network;
  netBadge.className = `px-2 py-0.5 rounded text-xs font-mono ${getNetworkBadgeClass(card.network)}`;

  document.getElementById('perkDrawerFeeBadge').textContent = `Fee: $${card.annualFee}/yr`;

  const totalCredits = card.totalCreditsValue || 0;
  const netOffset = totalCredits - card.annualFee;
  document.getElementById('perkDrawerTotalCredits').textContent = `$${totalCredits.toLocaleString()}`;
  document.getElementById('perkDrawerNetROI').textContent = `${netOffset >= 0 ? '+' : ''}$${netOffset} Net Annual Surplus Above Fee`;

  const credits = card.keyCredits || [];
  document.getElementById('perkDrawerCreditCount').textContent = `${credits.length} distinct recurring perk${credits.length === 1 ? '' : 's'}`;

  const creditsList = document.getElementById('perkDrawerCreditsList');
  creditsList.innerHTML = '';

  if (credits.length === 0) {
    creditsList.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container border border-surface-container-highest/30 text-xs text-outline leading-relaxed">
        This card has no annual statement credit obligations. It delivers straight cash back / point multipliers without an annual fee burden.
      </div>
    `;
  } else {
    credits.forEach(c => {
      const claimed = isCreditClaimed(card.id, c.name, c.cadence);
      const isMonthly = String(c.cadence).includes('/mo') || String(c.cadence).includes('month');
      const item = document.createElement('div');
      item.className = "pt-3 pb-2.5 border-b border-surface-container-highest/20 last:border-b-0";
      item.innerHTML = `
        <div class="flex items-center justify-between text-xs gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full ${claimed ? 'bg-secondary' : isMonthly ? 'bg-tertiary-container animate-pulse' : 'bg-outline'} shrink-0"></span>
            <span class="font-headline font-semibold text-on-surface text-sm truncate">${c.name}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="px-2 py-0.5 rounded bg-surface-container-high text-[10px] font-mono text-outline">${c.cadence || 'Annual'}</span>
            <span class="font-mono-metric font-bold text-primary-container text-base">$${c.value}</span>
            <button class="ml-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all ${
              claimed 
                ? 'bg-secondary/15 border border-secondary/40 text-secondary hover:bg-secondary/25' 
                : 'bg-primary-container text-on-primary-container hover:opacity-90'
            }">
              ${claimed ? '✓ Claimed' : 'Claim'}
            </button>
          </div>
        </div>
        <p class="text-xs text-on-surface-variant mt-1.5 pl-4 leading-relaxed">${c.desc}</p>
      `;

      const btn = item.querySelector('button');
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleCreditClaim(card.id, c.name, c.cadence, c.value);
        openPerkDrawer(card.id);
      };

      creditsList.appendChild(item);
    });
  }

  // Protections
  const protectionsList = document.getElementById('perkDrawerProtectionsList');
  protectionsList.innerHTML = '';
  const protections = card.protections || [];
  if (protections.length === 0) {
    protectionsList.innerHTML = `<p class="text-xs text-outline">Standard issuer zero-liability fraud protections apply.</p>`;
  } else {
    protections.forEach(p => {
      const pEl = document.createElement('div');
      pEl.className = "p-2.5 rounded-lg bg-surface-container-high/40 border border-surface-container-highest/30 flex items-center gap-2.5 text-xs";
      pEl.innerHTML = `
        <span class="material-symbols-outlined text-secondary text-[16px]">verified</span>
        <span class="text-on-surface font-medium">${p}</span>
      `;
      protectionsList.appendChild(pEl);
    });
  }

  // Multipliers
  const multGrid = document.getElementById('perkDrawerMultipliersGrid');
  multGrid.innerHTML = '';
  const mults = card.multipliers || {};
  Object.entries(mults).forEach(([catKey, m]) => {
    const mEl = document.createElement('div');
    mEl.className = "p-2.5 rounded-lg bg-surface-container-high/30 border border-surface-container-highest/20 text-xs";
    mEl.innerHTML = `
      <div class="text-[10px] font-mono uppercase text-outline">${catKey}</div>
      <div class="font-bold font-mono-metric text-primary-container text-sm mt-0.5">
        ${m.unit && m.unit.includes('%') ? m.rate + '%' : m.rate + 'x'}
      </div>
      <div class="text-[10px] text-outline truncate mt-0.5" title="${m.rule}">${m.rule}</div>
    `;
    multGrid.appendChild(mEl);
  });

  // Toggle in wallet button
  const toggleBtn = document.getElementById('perkDrawerToggleWalletBtn');
  const inWallet = state.walletCards.includes(card.id);
  toggleBtn.innerHTML = inWallet ? `<span>Remove from Wallet</span>` : `<span>Add to Active Wallet</span>`;
  toggleBtn.className = inWallet 
    ? "w-full py-2.5 rounded-lg bg-error/15 text-error border border-error/40 font-semibold text-xs hover:bg-error/25 transition-all flex items-center justify-center gap-2 font-mono"
    : "w-full py-2.5 rounded-lg bg-primary-container text-on-primary-container font-semibold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2 font-mono";

  toggleBtn.onclick = () => {
    toggleCardInWallet(card.id);
    closePerkDrawer();
  };

  overlay.classList.remove('opacity-0', 'pointer-events-none');
  drawer.classList.remove('translate-x-full');
}

function closePerkDrawer() {
  const overlay = document.getElementById('perkDrawerOverlay');
  const drawer = document.getElementById('perkDrawer');
  if (overlay) overlay.classList.add('opacity-0', 'pointer-events-none');
  if (drawer) drawer.classList.add('translate-x-full');
}

// Open Category Promo Rule Drawer
function openRuleDrawer(catKey) {
  const info = CATEGORY_RULES[catKey] || {
    title: catKey.toUpperCase(),
    icon: 'category',
    tag: `${catKey.toUpperCase()} // STRATEGY`,
    subtitle: 'Optimal spend category routing',
    caps: 'Standard bank policy applies.',
    inclusions: 'All qualifying category merchants.',
    exclusions: 'Non-qualifying merchants and cash equivalents.'
  };

  const overlay = document.getElementById('ruleDrawerOverlay');
  const drawer = document.getElementById('ruleDrawer');
  if (!overlay || !drawer) return;

  document.getElementById('ruleDrawerIcon').textContent = info.icon;
  document.getElementById('ruleDrawerTag').textContent = info.tag;
  document.getElementById('ruleDrawerTitle').textContent = info.title;
  document.getElementById('ruleDrawerSubtitle').textContent = info.subtitle;

  // Find all cards in user's wallet ranked for this category
  const userCards = state.allCards.filter(c => state.walletCards.includes(c.id));
  let winningCard = null;
  let winningRate = 0;
  let winningUnit = '';
  let winningRule = '';

  const rankedCards = (userCards.length > 0 ? userCards : state.allCards).map(card => {
    const mult = card.multipliers?.[catKey] || card.multipliers?.everyday;
    const rate = mult ? mult.rate : 1.0;
    const unit = mult ? mult.unit : 'x points';
    const rule = mult ? mult.rule : 'Standard baseline spend';
    return { card, rate, unit, rule };
  }).sort((a, b) => b.rate - a.rate);

  if (rankedCards.length > 0) {
    winningCard = rankedCards[0].card;
    winningRate = rankedCards[0].rate;
    winningUnit = rankedCards[0].unit;
    winningRule = rankedCards[0].rule;
  }

  const rateText = winningUnit.includes('%') ? `${winningRate}%` : `${winningRate.toFixed(1)}x`;
  document.getElementById('ruleDrawerWinningCard').textContent = winningCard ? winningCard.name : 'No Card in Wallet';
  document.getElementById('ruleDrawerRateText').textContent = `${rateText} (${winningUnit})`;
  document.getElementById('ruleDrawerBigRate').textContent = rateText;

  const headerLabel = document.getElementById('ruleDrawerCardHeaderLabel');
  if (headerLabel) {
    headerLabel.textContent = userCards.length > 0 ? 'TOP EARNING CARD IN WALLET' : 'TOP CATALOG RECOMMENDATION';
  }

  document.getElementById('ruleDrawerExactRule').textContent = winningRule || 'No specific card selected.';
  document.getElementById('ruleDrawerCaps').textContent = info.caps;
  document.getElementById('ruleDrawerInclusions').textContent = info.inclusions;
  document.getElementById('ruleDrawerExclusions').textContent = info.exclusions;

  // Render Ranked Wallet Cards List
  const rankingsContainer = document.getElementById('ruleDrawerWalletRankings');
  rankingsContainer.innerHTML = '';

  rankedCards.forEach((item, index) => {
    const isInWallet = state.walletCards.includes(item.card.id);
    const row = document.createElement('div');
    row.className = `p-2.5 rounded-lg border flex items-center justify-between gap-3 text-xs ${index === 0 ? 'bg-surface-container border-primary-container/40' : 'bg-surface-container-lowest border-surface-container-highest/30'}`;

    const rText = item.unit.includes('%') ? `${item.rate}%` : `${item.rate.toFixed(1)}x`;

    row.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-5 h-5 rounded-full ${index === 0 ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-outline'} flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
          #${index + 1}
        </span>
        <div class="min-w-0">
          <div class="font-headline font-semibold text-on-surface truncate">${item.card.name}</div>
          <span class="text-[10px] text-outline font-mono">${isInWallet ? 'Active in Wallet' : 'Catalog Card'}</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-mono font-bold text-sm ${index === 0 ? 'text-primary-container' : 'text-on-surface'}">${rText}</div>
        <span class="text-[10px] text-outline font-mono">${item.unit}</span>
      </div>
    `;
    rankingsContainer.appendChild(row);
  });

  overlay.classList.remove('opacity-0', 'pointer-events-none');
  drawer.classList.remove('translate-x-full');
}

function closeRuleDrawer() {
  const overlay = document.getElementById('ruleDrawerOverlay');
  const drawer = document.getElementById('ruleDrawer');
  if (overlay) overlay.classList.add('opacity-0', 'pointer-events-none');
  if (drawer) drawer.classList.add('translate-x-full');
}

// Expose globally for HTML onclick attributes
window.openPerkDrawer = openPerkDrawer;
window.closePerkDrawer = closePerkDrawer;
window.openRuleDrawer = openRuleDrawer;
window.closeRuleDrawer = closeRuleDrawer;
window.showBestCardDetails = openRuleDrawer;

// =========================================================================
// Utilities & Timers
// =========================================================================
function startRefreshTimer() {
  let seconds = 300;
  const timerEl = document.getElementById('homeRefreshTimer');
  setInterval(() => {
    seconds--;
    if (seconds < 0) seconds = 300;
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMsg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.remove('translate-y-16', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-16', 'opacity-0');
  }, 3000);
}
