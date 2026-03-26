// Swedish translations (DEFAULT)
const sv = {
  // Navigation
  nav: {
    commandCenter: 'Kontrollcenter',
    drafts: 'Utkast',
    inbox: 'Inkorg',
    rules: 'Regler',
    settings: 'Inställningar',
  },

  // Command Center
  dashboard: {
    title: 'Kontrollcenter',
    pendingDrafts: 'Väntande utkast',
    readyToSend: 'Redo att skicka',
    highPriority: 'Hög prioritet',
    unread: 'Olästa',
    draftsAwaitingAction: 'Utkast som väntar',
    noPendingDrafts: 'Inga väntande utkast. Allt klart!',
    categories: 'Kategorier',
    manage: 'Hantera',
    categoriesEmpty: 'Kategorier visas efter första synkroniseringen.',
    recentActivity: 'Senaste aktivitet',
    noRecentActivity: 'Ingen senaste aktivitet.',
    prioritySummary: 'Prioritetsöversikt',
    high: 'Hög',
    medium: 'Medium',
    low: 'Låg',
    threadsCached: 'trådar cachade över',
    account: 'konto',
    accounts: 'konton',
    loading: 'Laddar dashboard...',
    rules: 'regler',
    viewAll: 'Visa alla',
    syncStatus: 'Synkstatus',
    totalThreads: 'Totalt antal trådar',
    analyzeAll: 'Analysera',
    goToInbox: 'Gå till inkorg',
  },

  // Inbox
  inbox: {
    title: 'Inkorg',
    syncAll: 'Synka alla',
    syncing: 'Synkar...',
    allAccounts: 'Alla konton',
    searchPlaceholder: 'Sök trådar...',
    loadingThreads: 'Laddar trådar...',
    noThreads: 'Inga trådar hittade. Synka dina konton för att komma igång.',
    syncNow: 'Synka nu',
    messages: 'meddelanden',
    analyze: 'Analysera',
    noSubject: '(Inget ämne)',
    notAnalyzed: 'Ej analyserad',
    unanalyzed: 'ej analyserade',
    open: 'Öppna',
    selected: 'valda',
    analyzeSelected: 'Analysera valda',
    selectAll: 'Välj alla',
    deselectAll: 'Avmarkera alla',
    suggestedAction: 'Föreslagen åtgärd',
    confidence: 'Konfidens',
    model: 'Modell',
    draftSuggestion: 'Utkastsförslag',
  },

  // Drafts
  drafts: {
    title: 'Utkastcenter',
    all: 'Alla',
    pending: 'Väntande',
    approved: 'Godkända',
    sent: 'Skickade',
    failed: 'Misslyckade',
    loadingDrafts: 'Laddar utkast...',
    noDrafts: 'Inga utkast hittade.',
    edit: 'Redigera',
    approve: 'Godkänn',
    discard: 'Radera',
    sendNow: 'Skicka nu',
    sendFailed: 'Skicka misslyckades',
    confirmSend: 'Är du säker på att du vill skicka detta mail?',
    confirmDiscard: 'Radera detta utkast?',
  },

  // Settings
  settings: {
    title: 'Inställningar',
    profile: 'Profil',
    name: 'Namn',
    email: 'E-post',
    notSet: 'Ej angivet',
    connectedAccounts: 'Kopplade konton',
    manageAll: 'Hantera alla →',
    displayName: 'Visningsnamn',
    label: 'Etikett',
    color: 'Färg',
    save: 'Spara',
    cancel: 'Avbryt',
    edit: 'Redigera',
    setDefault: 'Sätt som standard',
    disable: 'Inaktivera',
    enable: 'Aktivera',
    remove: 'Ta bort',
    default: 'Standard',
    disabled: 'Inaktiverad',
    syncError: 'Synkfel',
    noAccounts: 'Inga kopplade konton. Lägg till ett ovan.',
    disconnectConfirm: 'Koppla från {email}? All cachad data för detta konto tas bort.',
    logOut: 'Logga ut',
    language: 'Språk',
    notAuthenticated: 'Inte autentiserad.',
    optional: 'Valfritt',
    egWork: 't.ex. Arbete',
  },

  // Action types
  actions: {
    draft_created: 'Utkast skapat',
    draft_approved: 'Utkast godkänt',
    draft_sent: 'E-post skickat',
    draft_discarded: 'Utkast raderat',
    analysis_run: 'AI-analys körd',
    account_connected: 'Konto kopplat',
    rule_created: 'Regel skapad',
  },

  // Time
  time: {
    justNow: 'just nu',
    minutesAgo: '{n}m sedan',
    hoursAgo: '{n}t sedan',
  },

  // Auth
  auth: {
    processing: 'Bearbetar autentisering...',
    authenticated: 'Autentiserad! Omdirigerar...',
    accountLinked: '{email} kopplad! Omdirigerar...',
    waiting: 'Väntar på autentiseringssvar...',
    failed: 'Autentisering misslyckades: {error}',
    loading: 'Laddar...',
  },

  // Common
  common: {
    loading: 'Laddar...',
    error: 'Fel',
    to: 'Till',
    from: 'Från',
  },

  // Languages
  languages: {
    sv: 'Svenska',
    en: 'English',
    ru: 'Русский',
    es: 'Español',
  },
} as const;

export default sv;
export type Translations = typeof sv;
