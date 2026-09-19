# PerkPulse — Credit Intelligence & Card Perk Maximizer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Privacy: 100% Local](https://img.shields.io/badge/Privacy-100%25%20Local-emerald.svg)](#-zero-banking-credentials-required)
[![Stack: Vanilla JS / Express](https://img.shields.io/badge/Stack-Vanilla%20JS%20%2F%20Express-sky.svg)](#-technical-architecture)

> A high-density, analytical fintech environment designed for credit card strategists, points/miles maximizers, and power spenders. Compile public card perks, targeted merchant discounts, and cash back multipliers into an automated spend routing engine.

---

## ⚡ Quick Start

### Option A: One-Click Launch (Recommended for Windows)

Simply double-click **`start.bat`** in the project folder.  
*The script automatically verifies Node.js, installs dependencies if needed, starts the local server, and launches your browser at `http://localhost:3000`.*

### Option B: One-Click Launch (macOS / Linux)

Run the shell script from your terminal:
```bash
chmod +x start.sh
./start.sh
```

### Option C: Manual Terminal Launch

```bash
# 1. Install dependencies
npm install

# 2. Start the application
npm start

# 3. Open in your browser
# http://localhost:3000
```

---

## 🔒 Zero Banking Credentials Required

PerkPulse operates **strictly on client-side state and verified public offer catalogs**.

- **No Banking Logins:** Never connects to Plaid, MX, Yodlee, or financial aggregators.
- **No Card Numbers:** No account numbers, CVVs, or personal financial details are collected.
- **100% Private:** Your active card portfolio is stored locally in your browser (`localStorage`). All category routing, bonus rankings, and credit audits compute deterministically on your machine.

---

## 🧭 The PerkPulse Experience: Complete Walkthrough

PerkPulse provides a unified command center across four dedicated workflows:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           PERKPULSE ENGINE                              │
├──────────────┬────────────────────────┬────────────────┬────────────────┤
│ 1. DASHBOARD │ 2. WALLET & BEST CARDS │ 3. PERK LEDGER │ 4. OFFERS HUB  │
│ Portfolio    │ Dynamic Multipliers    │ Statement ROI  │ Wallet-Scoped  │
│ Overview     │ & Live Spend Router    │ & Amortization │ Promotions     │
└──────────────┴────────────────────────┴────────────────┴────────────────┘
```

---

### Step 1: Build Your Active Card Stack

When you first launch PerkPulse, you start with a clean slate so you can tailor the platform to your personal credit card lineup.

1. Navigate to the **Wallet** tab (or click **"Add Your Cards"** from the Home dashboard).
2. Browse the built-in catalog of top reward cards across major issuers:
   - **American Express:** The Platinum Card®, American Express® Gold Card, Blue Cash Preferred®
   - **Chase:** Sapphire Reserve®, Sapphire Preferred®, Freedom Flex®, Freedom Unlimited®
   - **Capital One:** Venture X®, Savor Rewards
   - **Citi:** Double Cash®, Custom Cash®
   - **Discover:** it® Cash Back
   - **Bilt:** Bilt World Elite Mastercard®
3. Click any card to instantly add it to your active wallet.
4. Your wallet state persists automatically in your browser's local storage.

---

### Step 2: Optimal Card for Every Category Matrix

Once your cards are added, PerkPulse calculates the highest-earning card for each of the **8 primary consumer spending categories**:

| Spend Category | Example Bonus Rate | Optimal Card Logic |
| :--- | :--- | :--- |
| **Dining & Restaurants** | **4.0x / 3.0x** | Evaluates worldwide eateries, delivery (DoorDash, Uber Eats), and bars. |
| **Supermarkets & Groceries** | **6% / 4.0x** | Evaluates dedicated grocery stores (H-E-B, Kroger, Whole Foods, Trader Joe's). |
| **Flights & Airfare** | **5.0x** | Identifies direct airline booking multipliers vs. portal requirements. |
| **Hotels & Stays** | **10.0x / 3.0x** | Compares portal bonus bookings against direct property folios. |
| **Gas Stations & EV** | **5% / 3%** | Evaluates pump fuel purchases, convenience stores, and EV charging stations. |
| **Transit & Rideshare** | **3.0x / 10x** | Routes commuter trains, tolls, parking, rideshare, and public transit. |
| **Tech & Streaming** | **6% / 3.0x** | Pinpoints recurring digital subscriptions and audio/video streaming. |
| **Catch-All / Everyday** | **2.0x / 2%** | Identifies the highest baseline card for non-category spend (utilities, medical, taxes). |

---

### Step 3: Deep-Dive Category Promo Rule Drawers

Not all bonus multipliers are created equal—spend caps, merchant coding rules, and rotating quarters affect real-world returns.

1. On any category card in the Wallet view, click the **"Rule"** button.
2. A slide-out **Category Intelligence Drawer** displays:
   - **Active Spend Limits:** Exact calendar-year caps (e.g., Amex Gold $25,000 grocery cap, Blue Cash Preferred $6,000 cap, Citi Custom Cash $500 monthly billing cycle cap).
   - **Eligible Inclusions:** Verified merchant categories that trigger the bonus.
   - **Exclusions Fine Print:** Items that code as standard 1x (superstores like Walmart/Target, wholesale clubs like Costco, third-party payment processors).
   - **Portfolio Power Rankings:** A prioritized leaderboard ranking all cards in your active wallet from highest to lowest earner for that category.

---

### Step 4: Card Perk Intelligence & Statement Credits Ledger

High-annual-fee cards require disciplined utilization to guarantee positive net value. The **Perks** tab turns fragmented statement credits into a structured financial audit.

1. **Card Perk Intelligence Sheet:** Click on any card card anywhere in the app to open its full perk breakdown:
   - Itemized recurring credits (e.g., Amex Platinum $1,594 credit suite: $200 Hotel, $240 Digital Entertainment, $200 Airline Incidental, $200 Uber Cash, $199 CLEAR Plus, $100 Saks Fifth Avenue, $300 Equinox, $155 Walmart+; Amex Blue Cash Preferred $10/mo Disney Bundle credit).
   - Included travel protections (Primary Auto Rental CDW, Priority Pass™ / Centurion Lounge networks, Trip Delay Insurance).
   - Annual fee offset calculations.
2. **Annual Overview vs. Monthly Run-Rate:**
   - Toggle the **"Monthly Run-Rate"** switch to amortize annual fees and recurring credits into a per-month operational burn rate.
   - See your **Positive Carry Efficiency** (total annual credits divided by gross annual fees).

---

### Step 5: Wallet-Scoped Targeted Offers Hub

Cardholders frequently miss out on limited-time statement credits and merchant discounts (Amex Offers, Chase Offers, Capital One Offers).

- **Strictly Wallet-Scoped:** By default, the Offers view only displays offers for cards currently in your wallet. Adding or removing a card in your wallet automatically updates the available offers in real time.
- **Toggle All Public Offers:** Disable wallet scoping at any time to discover deals available on cards you don't yet own.
- **Multi-Factor Sorting:** Sort instantly by:
  - **Highest Dollar Value ($)**
  - **Discount Rate (%)**
  - **Soonest Expiration Date**
  - **Total Benefit Cap**
  - **Category (A-Z) or Merchant Name (A-Z)**
- **Category Filter Pills & Single Focus Mode:** Filter across Dining, Travel, Groceries, Retail, Tech, and Fuel, or enable Single Focus Mode to isolate one category.
- **Offer Intelligence Drawer:** Click any offer to review minimum spend thresholds, direct enrollment links, terms, and point-stacking strategies.

---

### Step 6: Live Spend Router & Swipe Advisor

Standing in line at checkout and not sure which physical card to swipe? Use the **Live Spend Router** in the Wallet tab:

1. Type the merchant name into the search bar (e.g., `"Papa Johns"`, `"HEB"`, `"Shell"`, `"Delta"`, `"Shake Shack"`, `"Uber"`).
2. The router deterministically evaluates your active wallet:
   - **Detects the Spend Category:** Accurately classifies fast food, grocery chains, fuel brands, airlines, and rideshare.
   - **Selects Your Winning Card:** Identifies the highest point multiplier or cash back rate among your cards.
   - **Flags Stacked Offers:** Alerts you if an active merchant discount is currently available on that card (e.g., swiping a 4x dining card with an active 10% cash back offer).
   - **Suggests Alternatives:** If a card outside your portfolio would yield higher returns, the advisor surfaces it as an upgrade opportunity.

---

## 🛠️ Technical Architecture

PerkPulse is engineered with lightweight, dependency-minimal web standards:

- **Frontend:** Vanilla JavaScript (ES2022+), Semantic HTML5, Vanilla CSS with custom tokens.
  - Zero heavy frontend framework bloat; sub-millisecond DOM render times.
  - Modern Swiss-inspired typography using Google Fonts (`Geist`, `Inter`, `JetBrains Mono`).
- **Backend:** Node.js & Express.
  - Static asset distribution.
  - RESTful API endpoints for cards, offers, dynamic perks ledger, and spend routing regex token evaluations.
- **State Management:** Reactive local state with bidirectional `localStorage` synchronization.

### Directory Structure

```
Card_Offers/
├── data/
│   ├── cards.json         # Card metadata, category multipliers, credits & protections
│   ├── offers.json        # Public merchant offers, discount rates, spend caps & terms
│   └── perks.json         # Master catalog of statement credits & protection matrices
├── public/
│   ├── app.js             # Client application logic, state manager & drawer controllers
│   ├── index.html         # Responsive semantic UI layout
│   └── styles.css         # Theme tokens, typography, badges, and layout utilities
├── .gitignore             # Standard repository ignore rules
├── package.json           # Node.js project manifest & scripts
├── README.md              # Comprehensive project guide & documentation
├── server.js              # Express API server & deterministic routing engine
├── start.bat              # One-click launch script for Windows
└── start.sh               # One-click launch script for macOS & Linux
```

---

## 📊 Adding Custom Cards & Offers

The catalog data is cleanly decoupled in standard JSON format:

### Adding a Card to `data/cards.json`
```json
{
  "id": "issuer-card-id",
  "name": "Official Card Name",
  "nickname": "Display Name",
  "issuer": "Card Issuer",
  "network": "Visa / Mastercard / Amex",
  "networkColor": "#0A2F6E",
  "cardTier": "Premium / Mid-Tier / No-Fee",
  "annualFee": 95,
  "totalCreditsValue": 100,
  "multipliers": {
    "dining": { "rate": 3.0, "unit": "x points", "rule": "3x on worldwide dining" },
    "everyday": { "rate": 1.0, "unit": "x points", "rule": "1x on all other purchases" }
  },
  "keyCredits": [
    { "name": "Annual Hotel Credit", "value": 50, "cadence": "Annual", "desc": "Statement credit for hotel bookings" }
  ],
  "protections": ["Primary Rental Car Coverage", "Baggage Delay Insurance"]
}
```

---

## 🤝 Contributing

Contributions are welcome! If you would like to submit new public card offers, update annual credits, or suggest additional category routing tokens:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/new-card-offers`).
3. Commit your changes (`git commit -m 'Add new rotating quarterly bonus categories'`).
4. Push to your branch (`git push origin feature/new-card-offers`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
