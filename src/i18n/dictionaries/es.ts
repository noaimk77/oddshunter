import type { Dictionary } from "./fr";

const es = {
  nav: {
    methode: "Método",
    outils: "Herramientas",
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
  methode: {
    metaTitle: "Método — Oddshunter",
    eyebrow: "El ritual Oddshunter",
    title1: "Mi método para detectar",
    title2: "los partidos amañados",
    subtitle:
      "Nada de pronósticos por corazonada. Una rutina precisa, repetida cada día, que convierte los movimientos anormales de cuotas en señales aprovechables.",
    ctaVip: "Unirse al VIP",
    ctaBot: "Acceder al bot",
    stepsHeading: "El ritual en 6 pasos",
    stepsIntro: "Cada señal enviada a los suscriptores ha pasado por estos 6 pasos. Sin excepción.",
    steps: [
      {
        tag: "01 · Vigilancia",
        title: "Radar 24/7 en ligas poco vigiladas",
        body:
          "El worker escanea sin parar ~1 200 competiciones, priorizando las que nadie mira: divisiones bajas de India, ligas pequeñas de Latinoamérica, categorías secundarias. Ahí es donde los amaños pasan desapercibidos.",
      },
      {
        tag: "02 · Señal",
        title: "Detección de una caída anormal",
        body:
          "Un movimiento de cuota que supera los umbrales (caída rápida, brecha con los libros de referencia, timing sospechoso) dispara una `Signal` puntuada 0-100 en la base de datos. Ningún humano interviene aquí.",
      },
      {
        tag: "03 · Confirmación",
        title: "Cross-check multi-fuente",
        body:
          "La señal se contrasta con otros ángulos: divergencia con un libro sharp, volumen en Betfair Exchange, comportamiento del mercado asiático. Una señal aislada nunca basta — hacen falta al menos dos confirmaciones.",
      },
      {
        tag: "04 · Análisis",
        title: "Contexto del partido",
        body:
          "Miro la importancia, la clasificación, la forma reciente, el horario y la cobertura mediática. Un movimiento sospechoso en un partido sin importancia a las 21h un martes vale más que uno en una final.",
      },
      {
        tag: "05 · Alerta",
        title: "Envío dirigido, nunca masivo",
        body:
          "Si los pasos 1-4 pasan, la alerta va al canal VIP con contexto, o directamente al bot para quienes solo quieren la señal en bruto. Sin spam, sin 10 pronósticos al día.",
      },
      {
        tag: "06 · Disciplina",
        title: "Gestión de bankroll y paciencia",
        body:
          "Un partido sospechoso nunca es 100% seguro. Apuesta razonable, sin martingala, sin recuperación emocional. El método funciona a largo plazo, no en un partido aislado.",
      },
    ],
    pillarsHeading: "Lo que hace diferente a este método",
    pillars: [
      {
        title: "Datos brutos, sin intuición",
        body: "Ningún pronóstico \"a ojo\". Cada alerta se basa en un movimiento medido y con marca de tiempo.",
      },
      {
        title: "Ligas fuera del radar",
        body: "Donde los amaños tienen más posibilidades de sobrevivir: divisiones pequeñas, partidos sin importancia, franjas horarias muertas.",
      },
      {
        title: "Transparencia total",
        body: "La puntuación y las razones de cada señal se comparten con los suscriptores VIP — nunca una alerta sin justificación.",
      },
    ],
    ctaHeading: "¿Listo para recibir las señales?",
    ctaSubtitle: "Dos vías independientes: el VIP para el contexto y la explicación, el bot para la alerta bruta e instantánea.",
  },
  outils: {
    metaTitle: "Herramientas — Oddshunter",
    eyebrow: "La caja de herramientas",
    title1: "Las herramientas",
    title2: "que uso",
    subtitle:
      "El bot propio que detecta los partidos amañados, más los recursos que abro cada día para cruzar las señales.",
    tutoLabel: "Ver la guía",
    ctaLabel: "Acceder a la herramienta",
    tools: [
      {
        badge: "Bot propio · Oddshunter",
        title: "Detector de partidos amañados",
        tagline: "La herramienta que detecta las caídas de cuotas anormales antes que nadie.",
        description:
          "Un worker que vigila sin parar ~1 200 competiciones (priorizando las ligas fuera del radar donde los amaños pasan desapercibidos), detecta movimientos anormales, los puntúa de 0 a 100 y envía una alerta por Telegram en cuanto una señal supera el umbral.",
        howItWorksTitle: "Cómo funciona",
        steps: [
          "El worker consulta la API sin parar y guarda una foto de cada cambio de precio en la base de datos.",
          "El detector `oddsDrop` calcula la variación, el ritmo y la brecha con la cuota de apertura.",
          "Un motor de puntuación 0-100 pondera cada señal según profundidad, timing y contexto.",
          "Superado el umbral, el bot de Telegram te envía la alerta con el nombre del partido, la cuota inicial, la cuota actual y la puntuación de confianza.",
        ],
        statusLabel: "Estado",
        statusValue: "Bot de Telegram + base de datos operativos. Ingesta en configuración.",
        cta: "Acceder al bot",
        ctaHref: "/abonnement#bot",
      },
      {
        badge: "Canal Telegram · VIP",
        title: "El radar humano",
        tagline: "Las señales del bot, filtradas y explicadas por mí.",
        description:
          "Cada alerta relevante pasa por mi verificación: contexto del partido, cross-check de volumen Betfair, forma reciente. Recibes la señal bruta, más el \"porqué\".",
        howItWorksTitle: "Para quién es",
        steps: [
          "Para apostadores que quieren entender cada señal, no solo ejecutarla.",
          "Para los que prefieren 2-3 pronósticos ultra-cualificados por semana antes que un flujo constante.",
          "Para los que aprenden el método viendo las señales en directo.",
        ],
        statusLabel: "Estado",
        statusValue: "Activo — acceso al Telegram privado comunicado tras la suscripción.",
        cta: "Unirse al VIP",
        ctaHref: "/abonnement#vip",
      },
      {
        badge: "Método · Artículo",
        title: "El método Oddshunter",
        tagline: "Entiende la lógica completa antes incluso de suscribirte.",
        description:
          "El ritual en 6 pasos que repito cada día: de la vigilancia al envío de la alerta, pasando por la confirmación multi-fuente y la disciplina de bankroll.",
        howItWorksTitle: "Lo que vas a encontrar",
        steps: [
          "La rutina completa desde el radar 24/7 hasta el envío de la alerta.",
          "Los 3 pilares que diferencian este método de los pronosticadores clásicos.",
          "Por qué apunto a ligas fuera del radar y no a la Ligue 1 o la Premier League.",
        ],
        statusLabel: "Formato",
        statusValue: "Artículo completo, lectura ~5 min.",
        cta: "Leer el método",
        ctaHref: "/methode",
      },
    ],
  },
} as const satisfies Dictionary;

export default es;
