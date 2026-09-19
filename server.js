/**
 * PerkPulse - Credit Intelligence & Card Perk Maximizer
 * 
 * Production Node.js / Express server providing:
 * - High-speed static asset hosting for the client-side SPA
 * - Public credit card catalog management
 * - Multi-criteria offer filtering, sorting, and wallet-scoped queries
 * - Dynamic statement credit and annual fee amortization ledger calculations
 * - Deterministic spend routing engine with keyword and brand token matching
 * 
 * 100% Client-Side Privacy: No banking credentials, Plaid links, or sensitive
 * personal financial data are ever handled or transmitted by this server.
 * 
 * @module server
 * @license MIT
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;

// Middleware configuration
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Filepaths to static data repositories
const CARDS_FILE = path.join(__dirname, 'data', 'cards.json');
const OFFERS_FILE = path.join(__dirname, 'data', 'offers.json');
const PERKS_FILE = path.join(__dirname, 'data', 'perks.json');

/**
 * Safely reads and parses a JSON file from disk.
 * Returns an empty array if file reading fails.
 * 
 * @param {string} filePath - Absolute path to the JSON file
 * @returns {Array|Object} Parsed JSON content or fallback empty array
 */
function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[DataService] Error reading file at ${filePath}:`, err.message);
    return [];
  }
}

// =========================================================================
// API ENDPOINTS
// =========================================================================

/**
 * GET /api/cards
 * Retrieves the complete catalog of supported credit cards across major issuers
 * (American Express, Chase, Capital One, Citi, Discover, Bilt, etc.).
 * 
 * @route GET /api/cards
 * @returns {Object} JSON response with card array and total count
 */
app.get('/api/cards', (req, res) => {
  const cards = readJSON(CARDS_FILE);
  res.json({
    success: true,
    count: cards.length,
    data: cards
  });
});

/**
 * GET /api/offers
 * Retrieves and filters public merchant cash back promotions and cardholder discounts.
 * Supports multi-category filtering, issuer filtering, keyword search, wallet scoping,
 * and multi-factor sorting (dollar benefit, percentage, expiration, total value, A-Z).
 * 
 * @route GET /api/offers
 * @query {string} [category] - Comma-separated list of category names (e.g. "Dining,Travel")
 * @query {string} [network] - Filter by card issuer/network (e.g. "amex", "chase")
 * @query {string} [search] - Keyword search across merchant name, card name, and terms
 * @query {string} [sort] - Sort mode: 'default' | 'price' | 'rate' | 'expiration' | 'total_value' | 'category' | 'merchant'
 * @query {string} [walletOnly] - If 'true', only returns offers matching cards in walletCards
 * @query {string} [walletCards] - Comma-separated list of active card IDs in the user's wallet
 * @query {string} [newToday] - If 'true', filters to newly discovered promotions
 * @returns {Object} Filtered offers, statistical summary, and match metrics
 */
app.get('/api/offers', (req, res) => {
  const offers = readJSON(OFFERS_FILE);
  const {
    category,
    search,
    sort = 'default',
    walletOnly,
    walletCards,
    network,
    newToday
  } = req.query;

  let filtered = [...offers];

  // 1. Category filter (supports multi-selection)
  if (category && category !== 'all' && category !== 'All') {
    const cats = category.split(',').map(c => c.trim().toLowerCase());
    filtered = filtered.filter(item => 
      cats.some(c => item.category.toLowerCase().includes(c) || c.includes(item.category.toLowerCase()))
    );
  }

  // 2. Issuer / Network filter
  if (network && network !== 'all') {
    const nets = network.split(',').map(n => n.trim().toLowerCase());
    filtered = filtered.filter(item => 
      nets.some(n => item.network.toLowerCase() === n)
    );
  }

  // 3. Keyword Search filter across merchant, card, category, and fine print terms
  if (search && search.trim() !== '') {
    const query = search.trim().toLowerCase();
    filtered = filtered.filter(item =>
      item.merchant.toLowerCase().includes(query) ||
      item.cardName.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.terms.toLowerCase().includes(query)
    );
  }

  // 4. Wallet Scope filter: restricts results to cards the user physically holds
  if (walletOnly === 'true' && walletCards) {
    const cardIdList = walletCards.split(',').map(id => id.trim());
    filtered = filtered.filter(item => cardIdList.includes(item.cardId));
  }

  // 5. Newly added today filter
  if (newToday === 'true') {
    filtered = filtered.filter(item => item.isNewToday);
  }

  // 6. Multi-Factor Sorting
  switch (sort) {
    case 'discount_amount':
    case 'price':
      // Sort by absolute dollar benefit descending
      filtered.sort((a, b) => b.benefitAmount - a.benefitAmount);
      break;
    case 'discount_percent':
    case 'rate':
      // Sort by percentage discount descending
      filtered.sort((a, b) => b.discountPercent - a.discountPercent);
      break;
    case 'expiration':
    case 'expiry':
      // Sort by urgency: fewest days remaining first
      filtered.sort((a, b) => a.daysLeft - b.daysLeft);
      break;
    case 'total_value':
      // Sort by maximum reward cap ceiling
      filtered.sort((a, b) => (b.maxReward || b.benefitAmount) - (a.maxReward || a.benefitAmount));
      break;
    case 'category':
      // Alphabetical by category name
      filtered.sort((a, b) => a.category.localeCompare(b.category));
      break;
    case 'merchant':
      // Alphabetical by merchant title
      filtered.sort((a, b) => a.merchant.localeCompare(b.merchant));
      break;
    default:
      // Default prioritization: urgent expiring promotions first, then highest benefit
      filtered.sort((a, b) => {
        if (a.isExpiringSoon && !b.isExpiringSoon) return -1;
        if (!a.isExpiringSoon && b.isExpiringSoon) return 1;
        return b.benefitAmount - a.benefitAmount;
      });
  }

  // 7. Aggregate Portfolio Metrics
  const totalValue = filtered.reduce((acc, curr) => acc + (curr.maxReward || curr.benefitAmount), 0);
  const avgDiscount = filtered.length > 0
    ? (filtered.reduce((acc, curr) => acc + curr.discountPercent, 0) / filtered.length).toFixed(1)
    : 0;
  const expiringSoonCount = filtered.filter(item => item.daysLeft <= 2 || item.isExpiringSoon).length;

  res.json({
    success: true,
    total: offers.length,
    matched: filtered.length,
    stats: {
      totalAvailableValue: totalValue,
      avgDiscountRate: avgDiscount,
      expiringSoonCount: expiringSoonCount
    },
    data: filtered
  });
});

/**
 * GET /api/perks
 * Calculates dynamic card benefits, itemized statement credits, travel protections,
 * and annual fee amortization efficiency for the user's active wallet.
 * 
 * @route GET /api/perks
 * @query {string} [walletCards] - Comma-separated list of active card IDs in the user's wallet
 * @returns {Object} JSON response with itemized perks, active cards, and financial ROI summary
 */
app.get('/api/perks', (req, res) => {
  const perks = readJSON(PERKS_FILE);
  const cards = readJSON(CARDS_FILE);
  const { walletCards } = req.query;

  let activeCardIds = [];
  if (walletCards && walletCards.trim() !== '') {
    activeCardIds = walletCards.split(',').map(id => id.trim()).filter(Boolean);
  }

  const activeCards = cards.filter(c => activeCardIds.includes(c.id));
  
  // Calculate dynamic annual fee vs gross statement credit ROI
  const totalAnnualFees = activeCards.reduce((sum, c) => sum + (c.annualFee || 0), 0);
  const totalCredits = activeCards.reduce((sum, c) => sum + (c.totalCreditsValue || 0), 0);
  const netSurplus = totalCredits - totalAnnualFees;
  const efficiency = totalAnnualFees > 0 ? Math.round((totalCredits / totalAnnualFees) * 100) : 100;

  res.json({
    success: true,
    data: {
      ...perks,
      dynamicSummary: {
        activeCardCount: activeCards.length,
        totalAnnualFees,
        totalCredits,
        netSurplus,
        efficiency,
        positiveCarry: netSurplus >= 0,
        monthlySunkCost: (totalAnnualFees / 12).toFixed(2)
      },
      activeCards
    }
  });
});

/**
 * GET /api/wallet/best-cards
 * Computes the highest point multiplier or cash back percentage for each of the
 * 8 primary consumer spending categories based strictly on the user's active wallet.
 * 
 * @route GET /api/wallet/best-cards
 * @query {string} [walletCards] - Comma-separated list of active card IDs in the user's wallet
 * @returns {Object} Recommended optimal card and rule breakdown for each category
 */
app.get('/api/wallet/best-cards', (req, res) => {
  const cards = readJSON(CARDS_FILE);
  const { walletCards } = req.query;

  let activeCardIds = [];
  if (walletCards && walletCards.trim() !== '') {
    activeCardIds = walletCards.split(',').map(id => id.trim()).filter(Boolean);
  }

  const userCards = cards.filter(c => activeCardIds.includes(c.id));

  // Core consumer spend categories
  const categories = [
    { key: 'dining', name: 'Dining & Restaurants', tag: 'FOOD', icon: 'restaurant', subtitle: 'Worldwide eateries, bars & delivery' },
    { key: 'groceries', name: 'Supermarkets & Groceries', tag: 'DAILY', icon: 'shopping_basket', subtitle: 'US supermarkets, organic grocers' },
    { key: 'flights', name: 'Flights & Airfare', tag: 'TRAVEL', icon: 'flight', subtitle: 'Direct with airlines or travel portals' },
    { key: 'hotels', name: 'Hotels & Stays', tag: 'PORTAL', icon: 'hotel', subtitle: 'Booked via bank portal or direct' },
    { key: 'gas', name: 'Gas Stations & EV', tag: 'COMMUTE', icon: 'local_gas_station', subtitle: 'Pumps, convenience & EV charging' },
    { key: 'transit', name: 'Transit & Rideshare', tag: 'COMMUTE', icon: 'directions_subway', subtitle: 'Trains, tolls, parking, Uber, Lyft' },
    { key: 'streaming', name: 'Tech & Streaming', tag: 'DIGITAL', icon: 'smart_display', subtitle: 'Subscriptions, digital entertainment' },
    { key: 'everyday', name: 'Catch-All / Everyday', tag: 'BASELINE', icon: 'all_inclusive', subtitle: 'Medical, utilities, tax, non-category' }
  ];

  // Evaluate optimal card per category
  const bestPerCategory = categories.map(cat => {
    let topCard = null;
    let topMultiplier = 0;
    let topRule = '';
    let topUnit = '';

    // Empty wallet fallback
    if (userCards.length === 0) {
      return {
        ...cat,
        bestCard: { name: 'No Card Selected', network: 'None', multiplierText: '0x', rule: 'Add cards to your wallet' }
      };
    }

    // Check specific category bonus rates
    userCards.forEach(card => {
      const mult = card.multipliers && card.multipliers[cat.key];
      if (mult && mult.rate > topMultiplier) {
        topMultiplier = mult.rate;
        topCard = card;
        topRule = mult.rule;
        topUnit = mult.unit;
      }
    });

    // Fallback to highest uncapped everyday rate if no specific bonus exists
    if (!topCard || topMultiplier === 0) {
      userCards.forEach(card => {
        const base = card.multipliers && card.multipliers.everyday;
        if (base && base.rate > topMultiplier) {
          topMultiplier = base.rate;
          topCard = card;
          topRule = base.rule;
          topUnit = base.unit;
        }
      });
    }

    const multiplierText = topUnit.includes('%') 
      ? `${topMultiplier}%`
      : `${topMultiplier.toFixed(1)}x`;

    return {
      ...cat,
      bestCard: {
        id: topCard.id,
        name: topCard.name,
        nickname: topCard.nickname,
        issuer: topCard.issuer,
        network: topCard.network,
        networkColor: topCard.networkColor,
        multiplierText,
        unit: topUnit,
        rule: topRule
      }
    };
  });

  res.json({
    success: true,
    activeCardCount: userCards.length,
    activeCards: userCards.map(c => ({ id: c.id, name: c.name, nickname: c.nickname, last4: c.last4 })),
    recommendations: bestPerCategory
  });
});

/**
 * GET /api/wallet/route-spend
 * Real-time Spend Router and Swipe Advisor.
 * Takes any merchant query (e.g. "Papa Johns", "HEB", "Shell", "Delta"), maps it to
 * the correct spend category via deterministic regex token matching, identifies the
 * highest-earning card in the user's wallet, and cross-checks for active stacked merchant offers.
 * 
 * @route GET /api/wallet/route-spend
 * @query {string} merchant - Merchant name or purchase keywords
 * @query {string} [walletCards] - Comma-separated list of active card IDs in the user's wallet
 * @returns {Object} Recommended swipe card, yield rate, rule details, and stacked offers
 */
app.get('/api/wallet/route-spend', (req, res) => {
  const cards = readJSON(CARDS_FILE);
  const offers = readJSON(OFFERS_FILE);
  const { merchant = '', walletCards } = req.query;

  let activeCardIds = [];
  if (walletCards && walletCards.trim() !== '') {
    activeCardIds = walletCards.split(',').map(id => id.trim()).filter(Boolean);
  }

  const userCards = cards.filter(c => activeCardIds.includes(c.id));
  const query = merchant.trim().toLowerCase();

  // Default baseline category
  let mappedCategory = 'everyday';
  let matchedMerchantName = merchant.trim();

  // Deterministic Category Mapping Engine:
  // 1. Dining & Food Delivery
  if (/papa\s*john|domino|pizza\s*hut|little\s*caesar|mod\s*pizza|blaze\s*pizza|pizza|mcdonald|wendy|burger\s*king|chick-fil-a|chick\s*fil\s*a|popeye|kfc|chipotle|taco\s*bell|panera|panda\s*express|shake\s*shack|in-n-out|five\s*guys|culver|subway|jersey\s*mike|starbucks|dunkin|dutch\s*bros|peet|cheesecake\s*factory|olive\s*garden|texas\s*roadhouse|applebee|chili|buffalo\s*wild\s*wings|ihop|denny|doordash|uber\s*eats|ubereats|grubhub|postmates|caviar|resy|opentable|restaurant|dining|cafe|diner|bistro|bar|pub|grill|bakery|steakhouse|eatery|food/i.test(query)) {
    mappedCategory = 'dining';
    if (/papa\s*john/i.test(query)) matchedMerchantName = "Papa Johns Pizza";
    else if (/domino/i.test(query)) matchedMerchantName = "Domino's Pizza";
    else if (/chipotle/i.test(query)) matchedMerchantName = "Chipotle Mexican Grill";
    else if (/shake\s*shack/i.test(query)) matchedMerchantName = "Shake Shack";
    else if (/starbucks/i.test(query)) matchedMerchantName = "Starbucks Coffee";
    else if (/dunkin/i.test(query)) matchedMerchantName = "Dunkin'";
  } 
  // 2. Supermarkets & Grocery Stores
  else if (/\bheb\b|h-e-b|h\s*e\s*b|kroger|publix|safeway|albertsons|ralphs|harris\s*teeter|king\s*soopers|fred\s*meyer|trader\s*joe|whole\s*foods|sprouts|wegmans|aldi|lidl|meijer|hy-vee|food\s*lion|giant\s*eagle|stop\s*&\s*shop|winco|shoprite|instacart|shipt|supermarket|grocery|groceries|market/i.test(query)) {
    mappedCategory = 'groceries';
    if (/\bheb\b|h-e-b|h\s*e\s*b/i.test(query)) matchedMerchantName = "H-E-B Grocery Company";
    else if (/kroger/i.test(query)) matchedMerchantName = "Kroger Supermarkets";
    else if (/whole\s*foods/i.test(query)) matchedMerchantName = "Whole Foods Market";
    else if (/trader\s*joe/i.test(query)) matchedMerchantName = "Trader Joe's";
    else if (/aldi/i.test(query)) matchedMerchantName = "Aldi";
  } 
  // 3. Fuel, Gas Stations & EV Charging
  else if (/\bshell\b|chevron|texaco|exxon|mobil|exxonmobil|\bbp\b|conoco|phillips\s*66|valero|sunoco|marathon|citgo|speedway|circle\s*k|quiktrip|\bwawa\b|sheetz|racetrac|loves|pilot\s*flying\s*j|buc-ee|bucees|tesla\s*supercharger|electrify\s*america|chargepoint|evgo|gas\s*station|\bgas\b|fuel|diesel|ev\s*charging/i.test(query)) {
    mappedCategory = 'gas';
    if (/\bshell\b/i.test(query)) matchedMerchantName = "Shell Gas & Fuel";
    else if (/chevron/i.test(query)) matchedMerchantName = "Chevron";
    else if (/exxon|mobil/i.test(query)) matchedMerchantName = "ExxonMobil";
    else if (/\bbp\b/i.test(query)) matchedMerchantName = "BP Gas Station";
  } 
  // 4. Flights & Airlines
  else if (/flight|airline|airlines|airfare|delta|united|american\s*airlines|southwest|jetblue|alaska\s*air|spirit|frontier|allegiant|air\s*canada|british\s*airways|lufthansa|emirates|qatar/i.test(query)) {
    mappedCategory = 'flights';
  } 
  // 5. Hotels & Lodging
  else if (/hotel|hotels|motel|resort|marriott|bonvoy|hyatt|hilton|ihg|wyndham|choice\s*hotels|best\s*western|four\s*seasons|ritz-carlton|airbnb|vrbo|booking\.com|expedia/i.test(query)) {
    mappedCategory = 'hotels';
  } 
  // 6. Streaming Services & Digital Media
  else if (/disney|netflix|hulu|paramount|spotify|hbo|max|peacock|apple\s*music|apple\s*tv|youtube|audible|prime\s*video|pandora|siriusxm|streaming|subscription/i.test(query)) {
    mappedCategory = 'streaming';
  } 
  // 7. Ground Transit, Commuter & Rideshare
  else if (/uber|lyft|rideshare|taxi|cab|train|subway|transit|mta|metro|bart|cta|mbta|amtrak|toll|tolls|ezpass|parking|spothero|parkwhiz/i.test(query)) {
    mappedCategory = 'transit';
  }

  // Cross-reference active targeted merchant discounts in the database
  const userMatchingOffers = offers.filter(o => 
    o.merchant.toLowerCase().includes(query) && activeCardIds.includes(o.cardId)
  );
  const allMatchingOffers = offers.filter(o => 
    o.merchant.toLowerCase().includes(query)
  );

  // Evaluate highest multiplier card in user's active wallet
  let topUserCard = null;
  let topUserRate = 0;
  let topUserRule = '';
  let topUserUnit = '';

  userCards.forEach(c => {
    const mult = c.multipliers && c.multipliers[mappedCategory];
    if (mult && mult.rate > topUserRate) {
      topUserRate = mult.rate;
      topUserCard = c;
      topUserRule = mult.rule;
      topUserUnit = mult.unit;
    }
  });

  // Fallback to highest everyday catch-all in wallet if no specific category bonus exists
  if (!topUserCard && userCards.length > 0) {
    userCards.forEach(c => {
      const base = c.multipliers && c.multipliers.everyday;
      if (base && base.rate > topUserRate) {
        topUserRate = base.rate;
        topUserCard = c;
        topUserRule = base.rule;
        topUserUnit = base.unit;
      }
    });
  }

  // Evaluate benchmark top card across the entire global catalog
  let topCatalogCard = null;
  let topCatalogRate = 0;
  let topCatalogRule = '';
  let topCatalogUnit = '';

  cards.forEach(c => {
    const mult = c.multipliers && c.multipliers[mappedCategory];
    if (mult && mult.rate > topCatalogRate) {
      topCatalogRate = mult.rate;
      topCatalogCard = c;
      topCatalogRule = mult.rule;
      topCatalogUnit = mult.unit;
    }
  });

  res.json({
    success: true,
    merchant: query,
    merchantTitle: matchedMerchantName,
    detectedCategory: mappedCategory,
    hasWalletCards: userCards.length > 0,
    bestCard: topUserCard || topCatalogCard,
    topRate: topUserCard ? topUserRate : topCatalogRate,
    topUnit: topUserCard ? topUserUnit : topCatalogUnit,
    topRule: topUserCard ? topUserRule : topCatalogRule,
    isFromWallet: Boolean(topUserCard),
    bestCatalogAlternative: topCatalogCard && (!topUserCard || topCatalogRate > topUserRate) ? {
      card: topCatalogCard,
      rate: topCatalogRate,
      unit: topCatalogUnit,
      rule: topCatalogRule
    } : null,
    stackedOffers: userCards.length > 0 ? userMatchingOffers : allMatchingOffers
  });
});

/**
 * Single Page Application Fallback Route
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Starts the Express server with automatic port-collision resolution.
 * If the configured port is currently busy, increments by 1 until an open port is bound.
 * 
 * @param {number} port - Starting TCP port number
 */
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 PerkPulse Engine running at: http://localhost:${port}`);
    console.log(`🔒 100% Client-Side Privacy - Zero Banking Logins Required`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Server] Port ${port} in use, attempting port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[Server] Fatal server startup error:', err);
    }
  });
}

startServer(DEFAULT_PORT);
