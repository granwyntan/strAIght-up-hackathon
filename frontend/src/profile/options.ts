type OptionGroup = {
  label: string;
  options: string[];
};

const createFlatOptions = (groups: OptionGroup[]) => groups.flatMap((group: OptionGroup) => group.options);

export const SEX_OPTIONS = ["Female", "Male", "Other", "Prefer not to say"];

export const HEALTH_CONDITION_GROUPS = [
  {
    label: "Cardiovascular",
    options: [
      "Hypertension (High Blood Pressure)",
      "Hypotension",
      "High Cholesterol",
      "Coronary Artery Disease",
      "Heart Failure",
      "Arrhythmia",
      "Atrial Fibrillation",
      "Stroke / TIA",
      "Peripheral Artery Disease",
    ],
  },
  {
    label: "Metabolic / Endocrine",
    options: [
      "Type 1 Diabetes",
      "Type 2 Diabetes",
      "Prediabetes",
      "Insulin Resistance",
      "Obesity",
      "Metabolic Syndrome",
      "Hypothyroidism",
      "Hyperthyroidism",
      "PCOS (Polycystic Ovary Syndrome)",
      "Cushing’s Syndrome",
    ],
  },
  {
    label: "Neurological",
    options: ["Migraine", "Epilepsy", "Parkinson’s Disease", "Alzheimer’s Disease", "Multiple Sclerosis", "Neuropathy"],
  },
  {
    label: "Mental health",
    options: [
      "Anxiety",
      "Depression",
      "ADHD",
      "Bipolar Disorder",
      "OCD",
      "PTSD",
      "Eating Disorders (Anorexia, Bulimia, Binge Eating)",
    ],
  },
  {
    label: "Respiratory",
    options: ["Asthma", "COPD", "Sleep Apnea", "Chronic Bronchitis"],
  },
  {
    label: "Skin",
    options: ["Eczema", "Psoriasis", "Acne", "Rosacea", "Dermatitis"],
  },
  {
    label: "Gastrointestinal",
    options: ["IBS", "Crohn’s Disease", "Ulcerative Colitis", "GERD (Acid Reflux)", "Gastritis", "Celiac Disease", "Lactose Intolerance"],
  },
  {
    label: "Autoimmune",
    options: ["Lupus", "Rheumatoid Arthritis", "Hashimoto’s Thyroiditis", "Ankylosing Spondylitis"],
  },
  {
    label: "Musculoskeletal",
    options: ["Osteoarthritis", "Osteoporosis", "Chronic Back Pain", "Tendonitis"],
  },
  {
    label: "Renal / Liver",
    options: ["Chronic Kidney Disease", "Kidney Stones", "Fatty Liver Disease", "Hepatitis"],
  },
  {
    label: "Reproductive / Hormonal",
    options: ["Endometriosis", "Infertility", "Low Testosterone", "Menopause"],
  },
];

export const HEALTH_CONDITION_OPTIONS = createFlatOptions(HEALTH_CONDITION_GROUPS);

export const ALLERGY_GROUPS = [
  {
    label: "Food allergies",
    options: ["Peanuts", "Tree Nuts", "Dairy", "Eggs", "Soy", "Wheat / Gluten", "Shellfish", "Fish", "Sesame"],
  },
  {
    label: "Environmental",
    options: ["Pollen", "Dust mites", "Mold", "Pet dander"],
  },
  {
    label: "Drug allergies",
    options: ["Penicillin", "NSAIDs", "Antibiotics (general)"],
  },
  {
    label: "Other",
    options: ["Insect stings", "Latex"],
  },
];

export const ALLERGY_OPTIONS = createFlatOptions(ALLERGY_GROUPS);

export const FAMILY_HISTORY_GROUPS = [
  {
    label: "Hereditary risk",
    options: [
      "Diabetes",
      "Hypertension",
      "Heart Disease",
      "Stroke",
      "Cancer (specify type)",
      "Obesity",
      "Thyroid Disorders",
      "Mental Illness",
      "Autoimmune Diseases",
      "Kidney Disease",
    ],
  },
];

export const FAMILY_HISTORY_OPTIONS = createFlatOptions(FAMILY_HISTORY_GROUPS);

export const DIET_TYPE_GROUPS = [
  { label: "General", options: ["Omnivore", "Vegetarian", "Vegan", "Pescatarian"] },
  { label: "Weight / body goals", options: ["Calorie Deficit", "Calorie Surplus", "Maintenance"] },
  { label: "Structured diets", options: ["Keto", "Low Carb", "High Protein", "Low Fat", "Mediterranean", "DASH"] },
  { label: "Cultural / religious", options: ["Halal", "Kosher", "Hindu Vegetarian"] },
  { label: "Restriction-based", options: ["Gluten-Free", "Dairy-Free", "Sugar-Free"] },
];

export const DIET_TYPE_OPTIONS = createFlatOptions(DIET_TYPE_GROUPS);

export const EATING_PATTERN_GROUPS = [
  { label: "Meal frequency", options: ["2 meals/day", "3 meals/day", "5–6 small meals"] },
  { label: "Fasting", options: ["Intermittent Fasting 16:8", "18:6", "OMAD (One Meal a Day)", "Alternate Day Fasting"] },
  { label: "Timing habits", options: ["Late-night eating", "Skipping breakfast", "Time-restricted eating"] },
];

export const EATING_PATTERN_OPTIONS = createFlatOptions(EATING_PATTERN_GROUPS);

export const DIET_GOAL_GROUPS = [
  {
    label: "Diet goals",
    options: [
      "Weight Loss",
      "Muscle Gain",
      "Maintain Weight",
      "Improve Energy",
      "Improve Gut Health",
      "Better Skin",
      "Reduce Inflammation",
      "Control Blood Sugar",
      "Lower Cholesterol",
      "Reduce Blood Pressure",
    ],
  },
];

export const DIET_GOAL_OPTIONS = createFlatOptions(DIET_GOAL_GROUPS);

export const ACTIVITY_GOAL_GROUPS = [
  {
    label: "Performance",
    options: ["Build Muscle", "Increase Strength", "Improve Endurance", "Improve Flexibility", "Improve Speed"],
  },
  {
    label: "Health",
    options: ["Lose Fat", "Maintain Fitness", "Improve Cardiovascular Health", "Increase Daily Activity"],
  },
  {
    label: "Lifestyle",
    options: ["Reduce Stress", "Improve Sleep", "Increase Consistency"],
  },
];

export const ACTIVITY_GOAL_OPTIONS = createFlatOptions(ACTIVITY_GOAL_GROUPS);

export const COMMON_MEDICATION_OPTIONS = [
  "Insulin",
  "Metformin",
  "Losartan",
  "Lisinopril",
  "Atorvastatin",
  "Rosuvastatin",
  "Amlodipine",
  "Levothyroxine",
  "Sertraline",
  "Fluoxetine",
  "Cetirizine",
  "Omeprazole",
  "Ibuprofen",
  "Paracetamol",
  "Semaglutide",
  "Salbutamol inhaler",
  "Methylphenidate",
];

export const COMMON_SUPPLEMENT_OPTIONS = [
  "Protein powder",
  "Multivitamin",
  "Vitamin D",
  "Omega-3",
  "Magnesium",
  "Probiotics",
  "Creatine",
  "Iron",
  "Vitamin B12",
  "Collagen",
  "Electrolytes",
  "Ashwagandha",
  "CoQ10",
];

export const FOOD_PREFERENCE_SUGGESTIONS = [
  "Spicy foods",
  "Sugary drinks",
  "Processed snacks",
  "Red meat",
  "Seafood",
  "Fried foods",
  "Late-night eating",
  "Dairy",
  "Gluten",
  "High caffeine drinks",
  "Halal",
  "Kosher",
  "Low sodium",
  "Low sugar",
  "High protein",
  "Mediterranean style meals",
];

export const RELIGIOUS_RESTRICTION_OPTIONS = ["Halal", "Kosher", "Hindu Vegetarian"];
export const ALLERGY_SEVERITY_OPTIONS = ["Mild", "Moderate", "Severe"];

export const ACTIVITY_LEVEL_OPTIONS = ["Sedentary", "Light", "Moderate", "Active"];
export const SLEEP_QUALITY_OPTIONS = ["Poor", "Fair", "Good"];
export const STRESS_LEVEL_OPTIONS = ["1", "2", "3", "4", "5"];
export const SMOKING_OPTIONS = ["No", "Yes"];
export const ALCOHOL_OPTIONS = ["None", "Occasional", "Frequent"];
export const CAFFEINE_OPTIONS = ["Low", "Moderate", "High"];

export const INSIGHT_DEPTH_OPTIONS = ["Simple", "Balanced", "Detailed"];
export const RECOMMENDATION_STYLE_OPTIONS = ["Strict", "Moderate", "Flexible"];
export const STORAGE_PREFERENCE_OPTIONS = ["Local", "Sync if signed in"];

export const PROFILE_AUTOCOMPLETE_SYNONYMS = {
  "high blood sugar": "Prediabetes",
  diabetes: "Type 2 Diabetes",
  "type 1": "Type 1 Diabetes",
  "type 2": "Type 2 Diabetes",
  "acid reflux": "GERD (Acid Reflux)",
  reflux: "GERD (Acid Reflux)",
  "milk allergy": "Dairy",
  "dairy allergy": "Dairy",
  "gluten allergy": "Wheat / Gluten",
  "gluten sensitivity": "Wheat / Gluten",
  "peanut allergy": "Peanuts",
  "nut allergy": "Tree Nuts",
  "high bp": "Hypertension (High Blood Pressure)",
  "high blood pressure": "Hypertension (High Blood Pressure)",
  "low blood pressure": "Hypotension",
  "high cholesterol": "High Cholesterol",
  cholesterol: "High Cholesterol",
  "blood pressure": "Hypertension (High Blood Pressure)",
  pcos: "PCOS (Polycystic Ovary Syndrome)",
  adhd: "ADHD",
  eczema: "Eczema",
  thyroid: "Hypothyroidism",
  hypothyroid: "Hypothyroidism",
  hyperthyroid: "Hyperthyroidism",
  "heart disease": "Heart Disease",
  "kidney problem": "Chronic Kidney Disease",
  "kidney disease": "Chronic Kidney Disease",
  "fatty liver": "Fatty Liver Disease",
  "sleep issues": "Sleep Apnea",
  "insulin resistant": "Insulin Resistance",
  prediabetic: "Prediabetes",
  "lactose intolerant": "Lactose Intolerance",
  "celiac": "Celiac Disease",
  "ibs": "IBS",
  crohns: "Crohn’s Disease",
  "crohn's": "Crohn’s Disease",
  ulcerative: "Ulcerative Colitis",
  "rheumatoid arthritis": "Rheumatoid Arthritis",
  hashimotos: "Hashimoto’s Thyroiditis",
  "ankylosing spondylitis": "Ankylosing Spondylitis",
  menopause: "Menopause",
  endometriosis: "Endometriosis",
  infertility: "Infertility",
  testosterone: "Low Testosterone",
  pescetarian: "Pescatarian",
  "intermittent fasting": "Intermittent Fasting 16:8",
  omad: "OMAD (One Meal a Day)",
  "build muscle": "Build Muscle",
  "lose weight": "Weight Loss",
  "lose fat": "Lose Fat",
  "improve sleep": "Improve Sleep",
  "reduce stress": "Reduce Stress",
  probiotics: "Probiotics",
  magnesium: "Magnesium",
  creatine: "Creatine",
  "vitamin d": "Vitamin D",
  omega3: "Omega-3",
  "fish oil": "Omega-3",
};

export const PROFILE_GOOGLE_SEARCH_HINTS = {
  "Health conditions": "medical condition symptoms diagnosis",
  Allergies: "allergy intolerance reaction",
  "Family history": "family history hereditary disease",
  "Diet type": "diet eating style nutrition",
  "Eating pattern": "eating pattern meal timing fasting",
  "Food dislikes or food rules": "food preference restriction",
  "Diet goals": "nutrition goal health goal",
  "Activity goals": "fitness goal exercise goal",
  "Current medications": "medication treatment drug",
  Supplements: "supplement vitamin probiotic",
};

export const PROFILE_SUGGESTION_POOLS = {
  conditions: HEALTH_CONDITION_OPTIONS,
  allergies: ALLERGY_OPTIONS,
  familyHistory: FAMILY_HISTORY_OPTIONS,
  dietTypes: DIET_TYPE_OPTIONS,
  eatingPatterns: EATING_PATTERN_OPTIONS,
  dietGoals: DIET_GOAL_OPTIONS,
  activityGoals: ACTIVITY_GOAL_OPTIONS,
  medications: COMMON_MEDICATION_OPTIONS,
  supplements: COMMON_SUPPLEMENT_OPTIONS,
  restrictions: RELIGIOUS_RESTRICTION_OPTIONS,
};

export const ONBOARDING_STEPS = [
  { key: "account", title: "Account", body: "Choose whether to stay local on this device or sign in with email and password." },
  { key: "basic", title: "Basic info", body: "Set the core details used for localisation and default health guidance." },
  { key: "body", title: "Body metrics", body: "Add the measurements that help personalise diet and activity analysis." },
  { key: "health", title: "Health & conditions", body: "Capture current conditions, allergies, and family history once so the app can stay context-aware." },
  { key: "lifestyle", title: "Lifestyle", body: "Anchor the profile to your real activity, sleep, stress, and caffeine habits." },
  { key: "diet", title: "Diet preferences", body: "Tell GramWIN how you eat so meal analysis and recommendations feel relevant." },
  { key: "goals", title: "Goals & targets", body: "Connect the app to the outcomes you care about most across diet and activity." },
  { key: "medical", title: "Medical & supplements", body: "List medications and supplements so supplement and food reviews can check interactions." },
  { key: "privacy", title: "Privacy & preferences", body: "Choose how deep the AI should go, how strict recommendations should feel, and what alerts you want." },
];
