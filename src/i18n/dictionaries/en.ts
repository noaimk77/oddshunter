import type { Dictionary } from "./fr";

const en = {
  nav: {
    methode: "Method",
    outils: "Tools",
    subscription: "Subscription",
    bookmakers: "Bookmakers",
    social: "Social",
    faq: "FAQ",
    login: "Log in",
    register: "Create an account",
    account: "My account",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    homeAria: "Oddshunter home",
    languageLabel: "Language",
  },
  home: {
    badge: "Live shared signals",
    titleLine1: "Odds movements,",
    titleLine2: "before they happen.",
    subtitle:
      "Follow my signals via a VIP group updated daily, or let the automated bot watch the movements for you.",
    ctaVip: "Join VIP",
    ctaBot: "Access the bot",
    perMonth: "€/month",
    featureLive: "Live analysis",
    featureAlerts: "Automatic alerts",
    featureCancel: "Cancel anytime",
    followElsewhere: "Follow Odds Hunter elsewhere",
    widgetLabel: "Oddshunter",
    widgetStatus: "Active watch",
    seeMore: "See",
    cards: {
      subscription: { title: "Subscription", description: "VIP channel or automated bot, €75/month each." },
      bookmakers: { title: "Bookmakers", description: "My referral codes and links — 1xBet right now." },
      social: { title: "Social", description: "Telegram, Instagram, TikTok, X, YouTube." },
      faq: { title: "FAQ", description: "What you need to know before joining." },
    },
  },
  footer: {
    disclaimerAge: "18+.",
    disclaimer1a:
      "Sports betting carries risks: only bet what you can afford to lose. If you're struggling, contact",
    disclaimer1b: "(09 74 75 13 13, French support line, standard call rate).",
    disclaimer2:
      "Odds Hunter provides information and statistical analysis for informational purposes only. Nothing on this site constitutes financial advice or a guarantee of winnings — past performance does not predict future results.",
    disclaimer3:
      "Some links on this site (particularly to bookmakers) are affiliate or referral links: they may generate a commission for Odds Hunter at no extra cost to you, and do not influence the content shown.",
    rights: "All rights reserved.",
    legalMentions: "Legal notice",
  },
  faq: {
    title1: "Frequently",
    title2: "asked questions",
    subtitle: "Everything you need to know before joining.",
    items: [
      {
        question: "Do the VIP and the Bot give access to the same content?",
        answer:
          "No. These are two separate, independent offers. Subscribing to the VIP doesn't give access to the bot, and vice versa — each must be subscribed to separately.",
      },
      {
        question: "Is the bot already active?",
        answer:
          "Not yet. It's currently being set up. The subscription is open now to reserve your access, which will start at launch.",
      },
      {
        question: "Can I cancel anytime?",
        answer:
          "Yes. Cancellation is one click away from the \"My account\" page, via the Stripe billing portal. It takes effect at the end of the period already paid for.",
      },
      {
        question: "Do the signals guarantee winnings?",
        answer:
          "No, no guarantee. These are statistical analyses based on real odds movements, not financial advice or a promise of results.",
      },
      {
        question: "How do I access the channel after subscribing?",
        answer: "Once the VIP subscription is active, access to the private Telegram channel will be sent to you directly.",
      },
    ],
  },
  social: {
    pageTitle1: "Find us",
    pageTitle2: "everywhere",
    pageSubtitle: "The Telegram channel is the main point of contact — everything else is for following along day to day.",
    sectionTitle: "Social media",
    sectionSubtitle: "The Telegram channel is the main point of contact. Everything else is for following along day to day.",
    channelMain: "Main channel",
  },
  bookmakers: {
    title1: "The",
    title2: "bookmakers",
    titleSuffix: "I use",
    subtitle: "My referral codes and links, updated as they come.",
    featuredBadge: "Main partner",
    promoLabel: "Personal promo code",
    promoSuffix: "— welcome bonus on signup.",
    viewOffer: "See the 1xBet offer",
    comingTitle: "More bookmakers coming",
    comingSoon: "Coming soon.",
  },
  onexbet: {
    metaTitle: "1xBet — Oddshunter promo code",
    badge: "Partner",
    title1: "Sign up on",
    title2: "1xBet",
    titleSuffix: "with my code",
    subtitle: "Use the promo code below at signup to claim the 1xBet welcome offer.",
    promoCodeLabel: "Promo code",
    signup: "Sign up on 1xBet",
    howItWorks: "How it works",
    steps: [
      "Click \"Sign up on 1xBet\" below to open the signup page.",
      "Create your account, then paste the Oddshunter code into the \"promo code\" field at signup.",
      "Enjoy your welcome bonus — the exact terms are shown by 1xBet at signup.",
    ],
    videoTitle: "Video tutorial — coming soon",
    videoSubtitle: "The YouTube link will be added here soon.",
    affiliateNoticeLabel: "Affiliate link.",
    affiliateNotice:
      "Odds Hunter earns a commission on signups made through this code, at no extra cost to you. This does not influence the site's content.",
    ageNoticeLabel: "18+.",
    ageNotice:
      "Sports betting is prohibited for minors and carries a risk of addiction. Only bet what you can afford to lose. Support:",
    ageNoticePhone: "— 09 74 75 13 13 (French helpline).",
    personalCodeNote: "Personal Oddshunter code — valid without a direct link.",
  },
  abonnement: {
    title1: "Join the",
    title2: "subscription",
    subtitle: "Two independent ways to follow the signals — choose the one that suits you.",
  },
  subscription: {
    heading: "Subscription",
    intro:
      "Same price, two independent ways to use it — the VIP for context and explanations, the bot for an instant alert with nothing to read. Subscribing to one does not give access to the other.",
    perMonth: "/month",
    notConfigured: "This offer isn't set up in Stripe yet.",
    vip: {
      eyebrow: "VIP group",
      title: "VIP Telegram channel",
      statusLabel: "Active",
      description:
        "A private Telegram channel where suspicious odds movements and analysis are shared directly, throughout the day.",
      features: [
        "Signals as soon as a significant odds movement is spotted",
        "Context and explanation behind every signal",
        "Cancel anytime from your account",
      ],
      cta: "Join VIP",
      footnoteConfigured: "Secure payment via Stripe.",
      footnoteNotConfigured: "Billing isn't set up on this environment yet.",
    },
    bot: {
      eyebrow: "Automated bot",
      title: "Odds Hunter bot",
      statusLabel: "Coming soon",
      description:
        "A bot that watches the odds and alerts you automatically, without needing to follow the channel constantly. Currently being set up.",
      features: [
        "Automatic alerts as soon as a movement crosses a threshold",
        "No manual analysis to read — just the signal",
        "Cancel anytime from your account",
      ],
      cta: "Access the bot",
      footnote: "Subscriptions are open now, access will start at launch.",
    },
  },
  methode: {
    metaTitle: "Method — Oddshunter",
    eyebrow: "The Oddshunter ritual",
    title1: "My method to detect",
    title2: "fixed matches",
    subtitle:
      "No gut-feel picks. A precise routine, repeated daily, that turns abnormal odds movements into actionable signals.",
    ctaVip: "Join the VIP",
    ctaBot: "Access the bot",
    stepsHeading: "The 6-step ritual",
    stepsIntro: "Every alert sent to subscribers followed these 6 steps. No exception.",
    steps: [
      {
        tag: "01 · Watch",
        title: "24/7 radar on under-the-radar leagues",
        body:
          "The worker continuously scans ~1,200 competitions, prioritising the ones nobody watches: Indian lower divisions, small Latin American leagues, secondary tiers. That's where fixed matches slip through.",
      },
      {
        tag: "02 · Signal",
        title: "Abnormal drop detected",
        body:
          "An odds movement past the thresholds (fast drop, gap with the sharp books, suspicious timing) fires a `Signal` scored 0-100 in the database. No human touches this step.",
      },
      {
        tag: "03 · Confirmation",
        title: "Multi-source cross-check",
        body:
          "The signal is checked against other angles: divergence with a sharp book, Betfair Exchange volume, Asian market behaviour. A lone signal is never enough — at least two confirmations required.",
      },
      {
        tag: "04 · Analysis",
        title: "Match context",
        body:
          "I look at stakes, standings, recent form, kickoff time, media coverage. A suspicious movement on a stakes-free game at 9pm on a Tuesday means more than one on a final.",
      },
      {
        tag: "05 · Alert",
        title: "Targeted delivery, never mass",
        body:
          "If steps 1-4 clear, the alert goes to the VIP channel with context, or straight to the bot for subscribers who only want the raw signal. No spam, no 10 picks a day.",
      },
      {
        tag: "06 · Discipline",
        title: "Bankroll and patience",
        body:
          "A suspicious match is never 100% safe. Reasonable stakes, no martingale, no emotional chasing. The method works over time, not on a single game.",
      },
    ],
    pillarsHeading: "What makes this method different",
    pillars: [
      {
        title: "Raw data, no intuition",
        body: "No gut-feel picks. Every alert rides on a measured, timestamped movement in the database.",
      },
      {
        title: "Under-the-radar leagues",
        body: "Where fixed matches have the best odds of surviving: small divisions, low-stakes games, off-hours slots.",
      },
      {
        title: "Full transparency",
        body: "Score and reasons behind every signal are shared with VIP subscribers — never an alert without justification.",
      },
    ],
    ctaHeading: "Ready to receive the signals?",
    ctaSubtitle: "Two independent ways: VIP for context and explanation, the bot for the raw, instant alert.",
  },
  outils: {
    metaTitle: "Tools — Oddshunter",
    eyebrow: "The toolbox",
    title1: "The tools",
    title2: "I use",
    subtitle: "The in-house bot that detects fixed matches, plus the resources I open every day to cross-check signals.",
    tutoLabel: "See the guide",
    ctaLabel: "Access the tool",
    tools: [
      {
        badge: "In-house · Oddshunter",
        title: "Fixed-match detector",
        tagline: "The tool that spots abnormal odds drops before anyone else.",
        description:
          "A worker that continuously monitors ~1,200 competitions (prioritising under-the-radar leagues where fixed matches slip through), detects abnormal odds movements, scores them 0-100, and pushes a Telegram alert as soon as a signal crosses the threshold.",
        howItWorksTitle: "How it works",
        steps: [
          "The worker polls the API continuously and snapshots every price change into the database.",
          "The `oddsDrop` detector computes variation, pace, and gap vs. the opening price.",
          "A 0-100 scoring engine weights each signal by movement depth, timing, and context.",
          "Past the threshold, the Telegram bot sends you the alert with match name, opening odds, current odds, and confidence score.",
        ],
        statusLabel: "Status",
        statusValue: "Telegram bot + database live. Ingestion currently being configured.",
        cta: "Access the bot",
        ctaHref: "/abonnement#bot",
      },
      {
        badge: "Telegram channel · VIP",
        title: "The human radar",
        tagline: "The bot's signals, filtered and explained by me.",
        description:
          "Every relevant alert goes through my check: match context, Betfair volume cross-check, recent form. You get the raw signal, plus the \"why\".",
        howItWorksTitle: "Who it's for",
        steps: [
          "Bettors who want to understand every signal, not just act on it.",
          "Those who prefer 2-3 highly-qualified picks a week over a constant flow.",
          "Those learning the method by watching signals live.",
        ],
        statusLabel: "Status",
        statusValue: "Live — private Telegram access shared after subscription.",
        cta: "Join the VIP",
        ctaHref: "/abonnement#vip",
      },
      {
        badge: "Method · Article",
        title: "The Oddshunter method",
        tagline: "Understand the full logic before even subscribing.",
        description:
          "The 6-step ritual I run every day: from watching to alerting, via multi-source confirmation and bankroll discipline.",
        howItWorksTitle: "What you'll find",
        steps: [
          "The full routine from 24/7 radar to alert delivery.",
          "The 3 pillars that set this method apart from classic tipsters.",
          "Why I target under-the-radar leagues instead of Ligue 1 or the Premier League.",
        ],
        statusLabel: "Format",
        statusValue: "Full article, ~5 min read.",
        cta: "Read the method",
        ctaHref: "/methode",
      },
    ],
  },
  settings: {
    pageTitle: "Settings",
    pageDescription: "Site appearance.",
    appearanceTitle: "Appearance",
    darkModeTitle: "Dark mode",
    darkModeDescription: "Odds Hunter is dark-theme only for now.",
    languageTitle: "Language",
    languageDescription: "Choose the site's display language.",
  },
} as const satisfies Dictionary;

export default en;
