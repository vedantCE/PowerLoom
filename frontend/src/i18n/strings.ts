import { useAppStore } from '../store/useAppStore'
import type { Language } from '../types/api'

export const STRINGS = {
  en: {
    // Header
    appName: 'Powerloom',
    tagline: 'Off-Grid Microgrid Optimizer',
    village: 'Village Microgrid',
    horizon: 'Horizon',
    h24: '24 Hours',
    h48: '48 Hours',
    language: 'Language',
    runOptimization: 'Run Optimization',
    optimizing: 'Optimizing...',
    mockMode: 'Mock Mode',
    liveBackend: 'Live Backend',
    dbSqlite: 'SQLite',
    dbPostgres: 'Postgres',

    // Sidebar: What-if Simulator Placeholder
    whatIfTitle: 'What-if Simulator',
    whatIfBadge: 'Phase 4.3 Preview',
    whatIfDescription:
      'Interactive scenario simulation under changing weather, fuel prices, and generation expansion.',
    cloudCoverParam: 'Cloud Cover Overrides',
    dieselPriceParam: 'Diesel Fuel Price (₹/L)',
    extraSolarParam: 'Additional Solar PV (kW)',
    extraBatteryParam: 'Additional Battery (kWh)',
    dieselAvailableParam: 'Diesel Generator Available',
    simulatorUpcoming:
      'Interactive sliders and dispatch sensitivity controls will be enabled in Phase 4.3.',

    // Savings Cards
    costSaved: 'Cost Saved',
    costSavedSub: 'vs naive diesel-heavy dispatch',
    dieselHoursSaved: 'Diesel Hours Saved',
    fuelAvoided: 'fuel avoided',
    co2Avoided: 'CO₂ Avoided',
    cleanUptime: 'Clean Uptime',
    criticalUptimeNote: '100% critical power secured',

    // Placeholders
    energyFlowTitle: 'Real-Time Energy Flow',
    energyFlowBadge: 'Phase 4.4',
    energyFlowDesc: 'Animated interactive diagram connecting solar, wind, battery, diesel, and village loads.',
    energyMixTitle: 'Energy Mix Dispatch (48h)',
    energyMixBadge: 'Phase 4.2',
    energyMixDesc: 'Stacked area chart illustrating hourly supply allocation across solar, wind, battery, and diesel.',
    socChartTitle: 'Battery State of Charge (SOC)',
    socChartBadge: 'Phase 4.2',
    socChartDesc: 'Interactive SOC trajectory with min/max threshold bands and charging indicators.',

    // Timeline
    timelineTitle: 'Hourly Dispatch Timeline',
    timelineDesc: 'Click any hour cell to inspect the optimizer decision and natural language explanation.',
    hourLabel: 'Hour',
    today: 'Today',
    tomorrow: 'Tomorrow',
    dominantSource: 'Dominant Source',

    // Explain Box
    explainTitle: 'Optimizer Decision Explainer',
    explainSubtitle: 'Plain-language analysis of dispatch choices for the selected hour',
    explainLoading: 'Generating plain-language explanation...',
    selectedHour: 'Selected Hour',
    metricsTitle: 'Hourly Power Balance',
    demand: 'Demand',
    solar: 'Solar',
    wind: 'Wind',
    battery: 'Battery',
    diesel: 'Diesel',
    soc: 'SOC',
    curtailed: 'Curtailed',
    loadShed: 'Load Shed',
    reasonCodes: 'Active Decision Codes',

    // Status & Fallbacks
    loadingTitle: 'Computing Optimal Microgrid Dispatch...',
    loadingSubtitle: 'Solving MILP model (solar, wind, battery, and diesel balance)',
    errorTitle: 'Optimization Failed',
    retry: 'Retry Optimization',
    emptyTitle: 'No Plan Available',
    emptyDesc: 'Please select a village and click Run Optimization to begin.',
  },
  gu: {
    // Header
    appName: 'પાવરલૂમ',
    tagline: 'ગામડાના માઇક્રોગ્રીડ ઑપ્ટિમાઇઝર',
    village: 'ગામ માઇક્રોગ્રીડ',
    horizon: 'સમયગાળો',
    h24: '૨૪ કલાક',
    h48: '૪૮ કલાક',
    language: 'ભાષા',
    runOptimization: 'ઑપ્ટિમાઇઝ કરો',
    optimizing: 'ગણતરી ચાલુ છે...',
    mockMode: 'મૉક મોડ',
    liveBackend: 'લાઈવ બેકએન્ડ',
    dbSqlite: 'SQLite',
    dbPostgres: 'Postgres',

    // Sidebar: What-if Simulator Placeholder
    whatIfTitle: 'વોટ-ઇફ સિમ્યુલેટર',
    whatIfBadge: 'ફેઝ ૪.૩ પૂર્વાવલોકન',
    whatIfDescription:
      'હવામાન ફેરફારો, ડીઝલના ભાવ અને વધારાની ક્ષમતા હેઠળ માઇક્રોગ્રીડની કાર્યક્ષમતા તપાસો.',
    cloudCoverParam: 'વાદળછાયું વાતાવરણ (%)',
    dieselPriceParam: 'ડીઝલનો ભાવ (₹/લિટર)',
    extraSolarParam: 'વધારાની સોલર ક્ષમતા (kW)',
    extraBatteryParam: 'વધારાની બેટરી (kWh)',
    dieselAvailableParam: 'ડીઝલ જનરેટર ઉપલબ્ધ',
    simulatorUpcoming: 'ઇન્ટરેક્ટિવ સ્લાઇડર્સ અને સિમ્યુલેશન કંટ્રોલ્સ ફેઝ ૪.૩ માં ઉપલબ્ધ થશે.',

    // Savings Cards
    costSaved: 'કુલ ખર્ચ બચત',
    costSavedSub: 'સામાન્ય ડીઝલ-આધારિત વિતરણ સામે',
    dieselHoursSaved: 'ડીઝલ કલાકોની બચત',
    fuelAvoided: 'બળતણ બચાવ્યું',
    co2Avoided: 'CO₂ ઉત્સર્જન ઘટાડ્યું',
    cleanUptime: 'ક્લીન અપટાઇમ',
    criticalUptimeNote: '૧૦૦% મહત્વપૂર્ણ પાવર સુરક્ષિત',

    // Placeholders
    energyFlowTitle: 'રીઅલ-ટાઇમ ઊર્જા પ્રવાહ',
    energyFlowBadge: 'ફેઝ ૪.૪',
    energyFlowDesc: 'સોલર, પવન, બેટરી, ડીઝલ અને ગામની માંગ વચ્ચેનો એનિમેટેડ ઊર્જા પ્રવાહ.',
    energyMixTitle: 'ઊર્જા વિતરણ ચાર્ટ (૪૮ કલાક)',
    energyMixBadge: 'ફેઝ ૪.૨',
    energyMixDesc: 'કલાકદીઠ સોલર, પવન, બેટરી અને ડીઝલ વીજળીનો ચાર્ટ.',
    socChartTitle: 'બેટરી ચાર્જ સ્તર (SOC)',
    socChartBadge: 'ફેઝ ૪.૨',
    socChartDesc: 'બેટરી સ્ટોરેજ લેવલ અને ચાર્જિંગ/ડિસ્ચાર્જિંગ ગ્રાફ.',

    // Timeline
    timelineTitle: 'કલાકદીઠ વિતરણ સમયરેખા',
    timelineDesc: 'સમજૂતી અને વિગતો જોવા માટે કોઈપણ કલાક પર ક્લિક કરો.',
    hourLabel: 'કલાક',
    today: 'આજે',
    tomorrow: 'આવતીકાલે',
    dominantSource: 'મુખ્ય સ્ત્રોત',

    // Explain Box
    explainTitle: 'નિર્ણય વિશ્લેષણ અને સમજૂતી',
    explainSubtitle: 'પસંદ કરેલા કલાક માટે આ વિતરણ કેમ પસંદ કરાયું તેની સરળ સમજૂતી',
    explainLoading: 'સમજૂતી તૈયાર થઈ રહી છે...',
    selectedHour: 'પસંદ કરેલ કલાક',
    metricsTitle: 'કલાકનું પાવર સંતુલન',
    demand: 'માંગ',
    solar: 'સોલર',
    wind: 'પવન',
    battery: 'બેટરી',
    diesel: 'ડીઝલ',
    soc: 'SOC',
    curtailed: 'મર્યાદિત',
    loadShed: 'લોડ શેડ',
    reasonCodes: 'નિર્ણય કોડ્સ',

    // Status & Fallbacks
    loadingTitle: 'શ્રેષ્ઠ ઊર્જા યોજના તૈયાર થઈ રહી છે...',
    loadingSubtitle: 'MILP મોડેલ સોલ્વ થઈ રહ્યું છે (સૌર, પવન, બેટરી અને ડીઝલ સંતુલન)',
    errorTitle: 'ઑપ્ટિમાઇઝેશન નિષ્ફળ ગયું',
    retry: 'ફરી પ્રયાસ કરો',
    emptyTitle: 'કોઈ યોજના ઉપલબ્ધ નથી',
    emptyDesc: 'કૃપા કરીને ગામ પસંદ કરો અને ઑપ્ટિમાઇઝ કરો બટન દબાવો.',
  },
  hi: {
    // Header
    appName: 'पावरलूम',
    tagline: 'ग्रामीण माइक्रोग्रिड ऑप्टिमाइज़र',
    village: 'गाँव माइक्रोग्रिड',
    horizon: 'अवधि',
    h24: '24 घंटे',
    h48: '48 घंटे',
    language: 'भाषा',
    runOptimization: 'अनुकूलन चलाएँ',
    optimizing: 'अनुकूलन हो रहा है...',
    mockMode: 'मॉक मोड',
    liveBackend: 'लाइव बैकएंड',
    dbSqlite: 'SQLite',
    dbPostgres: 'Postgres',

    // Sidebar: What-if Simulator Placeholder
    whatIfTitle: 'व्हॉट-इफ सिमुलेटर',
    whatIfBadge: 'चरण 4.3 पूर्वावलोकन',
    whatIfDescription:
      'मौसम परिवर्तन, ईंधन कीमतों और क्षमता वृद्धि के तहत माइक्रोग्रिड लचीलेपन का परीक्षण करें।',
    cloudCoverParam: 'बादल छाए रहने का प्रभाव (%)',
    dieselPriceParam: 'डीजल ईंधन मूल्य (₹/लीटर)',
    extraSolarParam: 'अतिरिक्त सौर पीवी (kW)',
    extraBatteryParam: 'अतिरिक्त बैटरी (kWh)',
    dieselAvailableParam: 'डीजल जनरेटर उपलब्ध',
    simulatorUpcoming: 'इंटरैक्टिव स्लाइडर्स और सिमुलेशन नियंत्रण चरण 4.3 में सक्रिय होंगे।',

    // Savings Cards
    costSaved: 'लागत बचत',
    costSavedSub: 'सामान्य डीजल-प्रधान प्रेषण की तुलना में',
    dieselHoursSaved: 'डीजल घंटों की बचत',
    fuelAvoided: 'ईंधन बचाया गया',
    co2Avoided: 'CO₂ उत्सर्जन रोका',
    cleanUptime: 'स्वच्छ अपटाइम',
    criticalUptimeNote: '100% महत्वपूर्ण बिजली सुरक्षित',

    // Placeholders
    energyFlowTitle: 'वास्तविक समय ऊर्जा प्रवाह',
    energyFlowBadge: 'चरण 4.4',
    energyFlowDesc: 'सौर, पवन, बैटरी, डीजल और गाँव की माँग का इंटरैक्टिव एनिमेटेड आरेख।',
    energyMixTitle: 'ऊर्जा प्रेषण मिश्रण (48 घंटे)',
    energyMixBadge: 'चरण 4.2',
    energyMixDesc: 'सौर, पवन, बैटरी और डीजल की प्रति घंटा आपूर्ति दर्शाने वाला चार्ट।',
    socChartTitle: 'बैटरी चार्ज स्थिति (SOC)',
    socChartBadge: 'चरण 4.2',
    socChartDesc: 'चार्जिंग और डिस्चार्जिंग स्तरों के साथ इंटरैक्टिव SOC ग्राफ़।',

    // Timeline
    timelineTitle: 'प्रति घंटा प्रेषण समयरेखा',
    timelineDesc: 'निर्णय और सरल भाषा स्पष्टीकरण देखने के लिए किसी भी घंटे पर क्लिक करें।',
    hourLabel: 'घंटा',
    today: 'आज',
    tomorrow: 'कल',
    dominantSource: 'प्रमुख स्रोत',

    // Explain Box
    explainTitle: 'निर्णय स्पष्टीकरण',
    explainSubtitle: 'चुने गए घंटे के लिए इस ऊर्जा मिश्रण को चुनने का सरल भाषा में कारण',
    explainLoading: 'स्पष्टीकरण तैयार हो रहा है...',
    selectedHour: 'चुना गया घंटा',
    metricsTitle: 'प्रति घंटा बिजली संतुलन',
    demand: 'माँग',
    solar: 'सौर',
    wind: 'पवन',
    battery: 'बैटरी',
    diesel: 'डीजल',
    soc: 'SOC',
    curtailed: 'सीमित',
    loadShed: 'लोड शेड',
    reasonCodes: 'सक्रिय निर्णय कोड',

    // Status & Fallbacks
    loadingTitle: 'सर्वोत्तम ऊर्जा योजना तैयार हो रही है...',
    loadingSubtitle: 'MILP मॉडल हल किया जा रहा है (सौर, पवन, बैटरी और डीजल संतुलन)',
    errorTitle: 'अनुकूलन विफल हुआ',
    retry: 'पुनः प्रयास करें',
    emptyTitle: 'कोई योजना उपलब्ध नहीं',
    emptyDesc: 'कृपया गाँव चुनें और अनुकूलन चलाएँ पर क्लिक करें।',
  },
} as const

export type StringKey = keyof typeof STRINGS.en

export function useT() {
  const language = useAppStore((s) => s.language) as Language
  const dict = STRINGS[language] ?? STRINGS.en

  return {
    t: (key: StringKey): string => dict[key] ?? STRINGS.en[key] ?? key,
    lang: language,
  }
}
