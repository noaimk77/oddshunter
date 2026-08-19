import type { Dictionary } from "./fr";

const es = {
  nav: {
    subscription: "Suscripción",
    bookmakers: "Casas de apuestas",
    social: "Redes",
    faq: "Preguntas frecuentes",
    login: "Iniciar sesión",
    register: "Crear una cuenta",
    account: "Mi cuenta",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    homeAria: "Inicio de Oddshunter",
    languageLabel: "Idioma",
  },
  home: {
    badge: "Señales compartidas en directo",
    titleLine1: "Los movimientos de cuotas,",
    titleLine2: "antes de que ocurran.",
    subtitle:
      "Sigue mis señales a través de un grupo VIP actualizado a diario, o deja que el bot automatizado vigile los movimientos por ti.",
    ctaVip: "Unirme al VIP",
    ctaBot: "Acceder al bot",
    perMonth: "€/mes",
    featureLive: "Análisis en directo",
    featureAlerts: "Alertas automáticas",
    featureCancel: "Cancelable en cualquier momento",
    followElsewhere: "Seguir a Odds Hunter en otras redes",
    widgetLabel: "Oddshunter",
    widgetStatus: "Vigilancia activa",
    seeMore: "Ver",
    cards: {
      subscription: { title: "Suscripción", description: "Canal VIP o bot automatizado, 75€/mes cada uno." },
      bookmakers: { title: "Casas de apuestas", description: "Mis códigos y enlaces de referido — 1xBet por ahora." },
      social: { title: "Redes", description: "Telegram, Instagram, TikTok, X, YouTube." },
      faq: { title: "Preguntas frecuentes", description: "Lo que debes saber antes de unirte." },
    },
  },
  footer: {
    disclaimerAge: "18+.",
    disclaimer1a:
      "Las apuestas deportivas conllevan riesgos: apuesta solo lo que puedas permitirte perder. Si tienes dificultades, contacta con",
    disclaimer1b: "(09 74 75 13 13, línea de ayuda francesa, tarifa normal).",
    disclaimer2:
      "Odds Hunter ofrece información y análisis estadísticos con carácter meramente informativo. Ningún contenido de este sitio constituye asesoramiento financiero ni garantía de ganancias — los resultados pasados no garantizan resultados futuros.",
    disclaimer3:
      "Algunos enlaces de este sitio (en particular hacia casas de apuestas) son enlaces de afiliación o de referido: pueden generar una comisión para Odds Hunter sin coste adicional para ti, y no influyen en el contenido mostrado.",
    rights: "Todos los derechos reservados.",
    legalMentions: "Aviso legal",
  },
  faq: {
    title1: "Preguntas",
    title2: "frecuentes",
    subtitle: "Todo lo que necesitas saber antes de unirte.",
    items: [
      {
        question: "¿El VIP y el Bot dan acceso al mismo contenido?",
        answer:
          "No. Son dos ofertas distintas e independientes. Suscribirse al VIP no da acceso al bot, y viceversa — cada una debe contratarse por separado.",
      },
      {
        question: "¿El bot ya está activo?",
        answer:
          "Todavía no. Está en fase de configuración. La suscripción está abierta desde ahora para reservar tu acceso, que comenzará en el lanzamiento.",
      },
      {
        question: "¿Puedo cancelar en cualquier momento?",
        answer:
          "Sí. La cancelación se hace con un clic desde la página \"Mi cuenta\", a través del portal de facturación de Stripe. Surte efecto al final del periodo ya pagado.",
      },
      {
        question: "¿Las señales garantizan ganancias?",
        answer:
          "No, ninguna garantía. Son análisis estadísticos basados en movimientos de cuotas reales, no un consejo financiero ni una promesa de resultados.",
      },
      {
        question: "¿Cómo accedo al canal tras suscribirme?",
        answer: "Una vez activa la suscripción VIP, el acceso al canal privado de Telegram te será comunicado directamente.",
      },
    ],
  },
  social: {
    pageTitle1: "Encuéntranos",
    pageTitle2: "en todas partes",
    pageSubtitle: "El canal de Telegram es el punto de contacto principal — el resto es para seguir el día a día.",
    sectionTitle: "Redes sociales",
    sectionSubtitle: "El canal de Telegram es el punto de contacto principal. El resto es para seguir el día a día.",
    channelMain: "Canal principal",
  },
  bookmakers: {
    title1: "Las",
    title2: "casas de apuestas",
    titleSuffix: "que utilizo",
    subtitle: "Mis códigos y enlaces de referido, actualizados sobre la marcha.",
    featuredBadge: "Socio principal",
    promoLabel: "Código promocional personal",
    promoSuffix: "— bono de bienvenida al registrarte.",
    viewOffer: "Ver la oferta de 1xBet",
    comingTitle: "Llegan más casas de apuestas",
    comingSoon: "Próximamente.",
  },
  onexbet: {
    metaTitle: "1xBet — código promocional Oddshunter",
    badge: "Socio",
    title1: "Regístrate en",
    title2: "1xBet",
    titleSuffix: "con mi código",
    subtitle: "Usa el código promocional de abajo al registrarte para aprovechar la oferta de bienvenida de 1xBet.",
    promoCodeLabel: "Código promocional",
    signup: "Registrarme en 1xBet",
    howItWorks: "Cómo funciona",
    steps: [
      "Haz clic en \"Registrarme en 1xBet\" abajo para abrir la página de registro.",
      "Crea tu cuenta y pega el código Oddshunter en el campo \"código promocional\" durante el registro.",
      "Disfruta de tu bono de bienvenida — las condiciones exactas las muestra 1xBet en el momento del registro.",
    ],
    videoTitle: "Tutorial en vídeo — próximamente",
    videoSubtitle: "El enlace de YouTube se añadirá aquí próximamente.",
    affiliateNoticeLabel: "Enlace de afiliación.",
    affiliateNotice:
      "Odds Hunter recibe una comisión por los registros realizados con este código, sin coste adicional para ti. Esto no influye en el contenido del sitio.",
    ageNoticeLabel: "18+.",
    ageNotice:
      "Las apuestas deportivas están prohibidas para menores y conllevan riesgo de adicción. Apuesta solo lo que puedas permitirte perder. Ayuda:",
    ageNoticePhone: "— 09 74 75 13 13 (línea de ayuda francesa).",
    personalCodeNote: "Código personal de Oddshunter — válido sin enlace directo.",
  },
  abonnement: {
    title1: "Únete a la",
    title2: "suscripción",
    subtitle: "Dos formas independientes de seguir las señales — elige la que más te convenga.",
  },
  subscription: {
    heading: "Suscripción",
    intro:
      "Mismo precio, dos formas independientes de aprovecharlo — el VIP para el contexto y las explicaciones, el bot para la alerta instantánea sin nada que leer. Suscribirse a uno no da acceso al otro.",
    perMonth: "/mes",
    notConfigured: "Esta oferta todavía no está configurada en Stripe.",
    vip: {
      eyebrow: "Grupo VIP",
      title: "Canal VIP de Telegram",
      statusLabel: "Activo",
      description:
        "Un canal privado de Telegram donde los movimientos de cuotas sospechosos y los análisis se comparten directamente, a lo largo del día.",
      features: [
        "Señales en cuanto se detecta un movimiento de cuota significativo",
        "Contexto y explicación detrás de cada señal",
        "Cancelable en cualquier momento desde tu cuenta",
      ],
      cta: "Unirme al VIP",
      footnoteConfigured: "Pago seguro a través de Stripe.",
      footnoteNotConfigured: "La facturación aún no está configurada en este entorno.",
    },
    bot: {
      eyebrow: "Bot automatizado",
      title: "Bot de Odds Hunter",
      statusLabel: "Próximamente",
      description:
        "Un bot que vigila las cuotas y te avisa automáticamente, sin necesidad de seguir el canal constantemente. En fase de configuración.",
      features: [
        "Alertas automáticas en cuanto un movimiento supera un umbral",
        "Sin análisis manual que leer — solo la señal",
        "Cancelable en cualquier momento desde tu cuenta",
      ],
      cta: "Acceder al bot",
      footnote: "Las suscripciones están abiertas desde ahora, el acceso comenzará en el lanzamiento.",
    },
  },
  settings: {
    pageTitle: "Ajustes",
    pageDescription: "Apariencia del sitio.",
    appearanceTitle: "Apariencia",
    darkModeTitle: "Modo oscuro",
    darkModeDescription: "Odds Hunter solo tiene tema oscuro por ahora.",
    languageTitle: "Idioma",
    languageDescription: "Elige el idioma de visualización del sitio.",
  },
} as const satisfies Dictionary;

export default es;
