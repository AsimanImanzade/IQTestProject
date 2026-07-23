/**
 * English message catalogue — the canonical shape every other locale mirrors.
 *
 * `{placeholders}` are filled by the `t()` helper. Keep keys grouped by screen. English is the
 * fallback: any key a locale omits resolves to the value here (see `dictionary.ts`).
 */
export const en = {
  common: {
    appName: "Cognitive Reasoning Assessment",
    appShort: "CRA",
    beginTest: "Begin test",
    takeTest: "Take a test",
    takeAnother: "Take another test",
    signIn: "Sign in",
    signOut: "Sign out",
    signingOut: "Signing out…",
    dashboard: "Dashboard",
    profile: "profile",
    save: "Save",
    optional: "optional",
    loading: "Loading…",
    select: "Select…",
    preferNotToSay: "Prefer not to say",
    language: "Language",
    switchLanguage: "Change language",
  },

  home: {
    kicker: "Adaptive psychometric assessment",
    title: "Measure how you reason",
    subtitle:
      "{count} questions drawn from a bank of {bank}, balanced across reasoning domains and scored with item response theory — so your result reflects which questions you answered, not just how many.",
    feature1Title: "Every test is unique",
    feature1Body:
      "Questions are selected to a fixed blueprint from a bank of {bank}, then both the questions and their options are shuffled. Two people receiving the same test is vanishingly unlikely.",
    feature2Title: "Scored by ability, not tally",
    feature2Body:
      "A 3-parameter IRT model estimates your ability from the whole response pattern, accounts for guessing on multiple choice, and reports a confidence interval alongside the score.",
    feature3Title: "Balanced by design",
    feature3Body:
      "Every test covers at least six of the {categories} reasoning categories, with a fixed difficulty profile, so no single domain can dominate your result.",
    whatIsAssessed: "What is assessed",
    coreLegend: "Core domains — guaranteed at least three times in every test.",
  },

  start: {
    chooseHow: "Choose how you want to take the test",
    timedTitle: "Timed",
    timedBody: "25 minutes for 20 questions. Closer to how reasoning tests are normally given.",
    untimedTitle: "Untimed",
    untimedBody: "Work at your own pace. Better if you want to think each question through.",
    aboutYou: "About you",
    aboutYouBody:
      "Reasoning ability changes across the lifespan, so a score only means something when it is compared with people of the same age.",
    preparing: "Preparing your test…",
    noAccountNeeded: "No account needed. You can save your result afterwards.",
    usingProfileAge: "Scoring against your age group ({age}) using your profile.",
    updateProfile: "Update profile",
    profileNeededTitle: "One thing before you start",
    profileNeededBody:
      "Your result is compared with others of your age, so we need your year of birth before the test can be scored fairly. It is stored once on your profile — you will not be asked again.",
    completeProfile: "Complete your profile",
    ageError: "Please enter your age (12–100). It is required to compare your result fairly.",
    startError: "Could not start the test.",
    networkError: "Could not reach the server. Check your connection and try again.",
  },

  demographics: {
    age: "Age",
    ageHint:
      "Required. Your result is compared with others of your age, so this changes your score. Supported range: {min}–{max}.",
    gender: "Gender",
    genderHint:
      "Optional. Does not affect your score — recorded only so we can check that no question behaves unfairly between groups.",
    education: "Highest level of education",
    educationHint: "Optional. Does not affect your score — used for reporting only.",
    female: "Female",
    male: "Male",
    other: "Other",
    eduPrimary: "Primary school",
    eduSecondary: "Secondary school",
    eduVocational: "Vocational / technical",
    eduBachelors: "Bachelor's degree",
    eduMasters: "Master's degree",
    eduDoctorate: "Doctorate",
  },

  runner: {
    question: "Question",
    of: "of",
    answered: "{answered} answered · {left} left",
    category: "Category",
    flag: "Flag for review",
    flagged: "Flagged",
    previous: "Previous",
    next: "Next",
    reviewAnswers: "Review answers",
    answerOptions: "Answer options",
    keyboardHint: "Keys: 1–5 select · ← → move · F flag",
    tabWarningFirst: "Leaving this tab is recorded with your result. Please stay on the page.",
    tabWarningRepeat: "You have left this tab {count} times. This is noted on your result.",
    reviewTitle: "Review your answers",
    reviewAllAnswered: "Every question has an answer. You can revisit any of them before submitting.",
    reviewSomeUnanswered:
      "{count} question(s) still unanswered. Unanswered questions are marked incorrect.",
    legendAnswered: "Answered",
    legendUnanswered: "Unanswered",
    legendFlagged: "Flagged ({count})",
    backToQuestions: "Back to questions",
    submit: "Submit and see results",
    scoring: "Scoring your test…",
    submitError: "Could not submit the test.",
    submitNetworkError: "Could not reach the server. Your answers are saved — try again.",
    timeLeft: "Time remaining",
    minutesLeft: "{count} minutes remaining",
    secondsLeft: "{count} seconds remaining",
  },

  results: {
    title: "Your result",
    estimatedScore: "Estimated reasoning score",
    confidenceInterval: "95% confidence interval:",
    percentileLine:
      "You scored higher than approximately {percentile} of {group}. The interval matters as much as the number — it is the range this test can actually distinguish.",
    modelledPopulation: "the modelled population",
    peopleAged: "people aged {band}",
    levelLabel: "{level}",
    confidenceLabel: "{level} confidence",
    answeredFast: "Answered very fast",
    reportingLimit: "At the reporting limit",
    statAccuracy: "Accuracy",
    statPercentile: "Percentile",
    statPerQuestion: "Avg. per question",
    statTotal: "{time} total",
    statError: "Measurement error",
    statReliability: "reliability {value}",
    modelled: "modelled",
    ageTitle: "How your age was taken into account",
    ageRaw: "Raw performance",
    ageRawHint: "before age comparison",
    ageGroup: "Age group",
    ageGroupHint: "you are {age}",
    ageReported: "Reported score",
    ageNoShift: "no shift for your age",
    ageVsRaw: "{delta} vs raw",
    ageModelledWarning:
      "Important: this age comparison uses a modelled curve, not norms measured on this test. It reflects the well-established shape of how reasoning changes with age, but no standardisation sample has been collected for this question bank. Treat the age-adjusted figure as indicative, and note that the raw performance above is the part that was actually measured.",
    ageYoungWarning:
      "Some questions — verbal analogies especially — assume adult vocabulary. Below about 16, a lower score may reflect reading and word knowledge rather than reasoning.",
    noAgeTitle: "Not compared with an age group",
    noAgeBody:
      "No age was recorded for this attempt, so the score reflects raw performance against the item bank rather than a comparison with your peers.",
    noAgeSignedIn: "Add your year of birth to your {profile} and future results will be age-referenced.",
    noAgeGuest: "Entering your age before the next test will give a more meaningful comparison.",
    focusLoss: "You switched away from the test tab {count} time(s). This is recorded alongside your result.",
    categoryTitle: "Performance by category",
    categoryBody:
      "Each category is measured by only a few questions, so these are indicative bands rather than precise scores.",
    difficultyTitle: "Performance by difficulty",
    difficultyBody:
      "Every test follows the same difficulty profile, so this breakdown is comparable between attempts and between people.",
    strengthsTitle: "What went well",
    focusTitle: "Where to focus",
    noWeakness: "No category stood out as a clear weakness.",
    recommendationsTitle: "Recommendations",
    caveatsTitle: "How much to read into this",
    reviewTitle: "Question review",
    reviewAll: "All {count}",
    reviewIncorrect: "Incorrect {count}",
    reviewFlagged: "Flagged {count}",
    filterQuestions: "Filter questions",
    allCorrect: "You answered every question correctly.",
    noFlagged: "You did not flag any questions.",
    difficultyLabel: "Difficulty {level}/10",
    correct: "Correct",
    incorrect: "Incorrect",
    correctAnswer: "Correct answer",
    yourAnswer: "Your answer",
    explanation: "Explanation",
    viewDashboard: "View your dashboard",
    bandEasy: "Easy",
    bandMedium: "Medium",
    bandHard: "Hard",
    bandVeryHard: "Very hard",
  },

  bands: {
    aboveAverage: "Above average",
    average: "Average",
    belowAverage: "Below average",
  },

  levels: {
    "Very High": "Very High",
    "High": "High",
    "Above Average": "Above Average",
    "Average": "Average",
    "Below Average": "Below Average",
    "Well Below Average": "Well Below Average",
  },

  confidence: {
    HIGH: "High",
    MODERATE: "Moderate",
    LOW: "Low",
  },

  save: {
    title: "Keep this result",
    body: "Create an account and this attempt is saved to your history, so you can track progress across tests.",
    createAccount: "Create account",
  },

  dashboard: {
    helloName: "Hello, {name}",
    hello: "Your dashboard",
    noTests: "You have not completed a test yet.",
    testCount: "{count} completed test(s).",
    noResultsTitle: "No results yet",
    noResultsBody:
      "Once you complete a test, your score history, per-category performance and progress over time appear here.",
    statLatest: "Latest score",
    statAverage: "Average",
    statAcrossAttempts: "across all attempts",
    statBest: "Best",
    statChange: "Change",
    statSinceFirst: "since first test",
    statNeedsTwo: "needs 2 tests",
    trendNote:
      "A change of this size is usually within the measurement error of the test. Treat movement between attempts as meaningful only when the confidence intervals in the chart below stop overlapping.",
    historyTitle: "Score history",
    historyBody: "Each point is one test, with the vertical bar showing its 95% confidence interval.",
    categoryTitle: "Performance by category",
    categoryBody:
      "Accuracy pooled across every test you have taken. More questions seen means a more reliable figure.",
    pastTitle: "Past attempts",
    colDate: "Date",
    colMode: "Mode",
    colScore: "Score",
    colPercentile: "Percentile",
    colCorrect: "Correct",
    colConfidence: "Confidence",
    view: "View",
    timed: "Timed",
    untimed: "Untimed",
    rushed: "Rushed",
    countryTitle: "Compared with your country",
    professionTitle: "Compared with your profession",
    comparePrompt:
      "Add your {fields} to your profile to see how your score compares with published averages:",
    fieldCountry: "country",
    fieldProfession: "profession",
    fieldCountryAndProfession: "country and profession",
  },

  comparison: {
    pointsAbove: "{n} point(s) above the published average for {group}.",
    pointsBelow: "{n} point(s) below the published average for {group}.",
    atAverage: "Right on the published average for {group}.",
    avg: "Avg {value}",
    you: "You {value}",
    groupAverage: "{group} average:",
    vsAverage: "{delta} vs average",
    source: "Source: {source}. {caveat}",
    countrySource: "International IQ Test (online aggregate) (2025)",
    countryCaveat:
      "This is a light reference point, not a ranking. The national figure comes from a different online test and a self-selected sample, so it is not on the same calibrated scale as your score — treat the difference as rough.",
    professionSource: "Harrell & Harrell (1945) and Wonderlic occupational aggregates",
    professionCaveat:
      "Historical, US-based figures — and the spread of ability within any profession is far larger than the gap between professions. Your score says nothing about your fit for a field.",
  },

  auth: {
    signInTitle: "Sign in",
    signInSubtitle: "Access your test history and track how your results change over time.",
    registerTitle: "Create an account",
    registerSubtitle:
      "Any test you have already taken in this browser is saved to your account automatically.",
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHint: "At least {min} characters. A memorable phrase beats a short complex string.",
    createAccount: "Create account",
    creatingAccount: "Creating account…",
    signingIn: "Signing in…",
    haveAccount: "Already have an account?",
    noAccount: "No account yet?",
    createOne: "Create one",
    genericError: "Something went wrong. Please try again.",
    networkError: "Could not reach the server. Check your connection and try again.",
  },

  profile: {
    title: "Your profile",
    subtitle:
      "Your year of birth is used to compare your results with people of the same age. You are asked for it once, not before every test.",
    emailLabel: "Email",
    nameLabel: "Name",
    birthYear: "Year of birth",
    birthYearHint:
      "Your result is compared with others of your age, so this does change your score. A year is stored rather than a full date of birth.",
    birthYearAge: "That makes you {age}. ",
    birthYearCurrent: "Currently recorded as {age}. ",
    country: "Country",
    countryHint:
      "Optional. Lets your dashboard show how your score compares with a published average for your country. Does not affect your score.",
    professionLabel: "Profession",
    professionHint:
      "Optional. Adds a rough comparison with historical figures for your field. Does not affect your score.",
    languageLabel: "Preferred language",
    languageHint: "The language used across the app and in your tests.",
    saveProfile: "Save profile",
    saving: "Saving…",
    saved: "Profile saved.",
    saveError: "Could not save your profile.",
    ageRangeError: "That year of birth gives an age of {age}. This test supports ages {min}–{max}.",
  },

  disclaimer: {
    compact:
      "This is an estimate of reasoning ability based on this question bank — not a clinically administered or professionally normed IQ assessment.",
    heading: "What this score is, and what it is not",
    p1: "This test gives an estimate of reasoning ability measured against this particular question bank. It is scored with item response theory rather than a raw percentage, and every result is reported with a confidence interval showing how precise the estimate actually is.",
    p2: "It is not a clinically administered IQ test. The questions were generated procedurally and their difficulties were assigned by design rather than measured on a standardisation sample, so the conversion to the familiar 100-point scale is a modelled transformation, not a population norm. A 20-question test also cannot resolve the extremes, which is why scores are reported within a bounded range.",
    p3: "Use it as a structured, informative indicator of reasoning performance. Do not use it for diagnosis, selection, or any decision about a person.",
  },

  professions: {
    MEDICINE: "Medicine & healthcare (doctor, surgeon)",
    SCIENCE: "Science & research",
    ENGINEERING: "Engineering",
    LAW: "Law",
    SOFTWARE: "Software & IT",
    ARCHITECTURE: "Architecture",
    FINANCE: "Accounting & finance",
    EDUCATION: "Education & teaching",
    NURSING: "Nursing & allied health",
    MANAGEMENT: "Business & management",
    CREATIVE: "Design, arts & media",
    PUBLIC_SERVICE: "Public service & administration",
    SALES: "Sales & marketing",
    CLERICAL: "Clerical & office support",
    SKILLED_TRADES: "Skilled trades (electrician, mechanic)",
    HOSPITALITY: "Service & hospitality",
    MANUAL: "Manual & labour",
    STUDENT: "Student",
    RETIRED: "Retired",
    OTHER: "Other",
    PREFER_NOT_TO_SAY: "Prefer not to say",
  },

  categories: {
    "matrix-reasoning": "Matrix Reasoning",
    "number-series": "Number Series",
    "pattern-recognition": "Pattern Recognition",
    "logical-reasoning": "Logical Reasoning",
    "spatial-reasoning": "Spatial Reasoning",
    "analogies": "Analogies",
    "visual-sequences": "Visual Sequences",
    "shape-rotation": "Shape Rotation",
    "deductive-logic": "Deductive Logic",
    "classification": "Classification",
    "odd-one-out": "Odd One Out",
    "quantitative-reasoning": "Quantitative Reasoning",
  },

  skipToContent: "Skip to main content",
} as const;

/**
 * The message shape, with every leaf widened from its English literal to `string`. `as const`
 * above preserves the key structure (so a locale that omits a key is a compile error), while this
 * mapping lets other locales supply their own strings rather than having to equal the English
 * text.
 */
type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type Messages = DeepString<typeof en>;
