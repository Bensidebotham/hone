// src/lib/jobs/enrich.data.ts
// Data-only module for heuristic job enrichment. Extend freely — logic lives in enrich.ts.

export const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

export const US_STATE_NAMES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
]);

// Major US cities that frequently appear without a state qualifier.
export const US_CITIES = new Set([
  "new york","san francisco","los angeles","seattle","boston","austin",
  "chicago","denver","atlanta","dallas","houston","miami","san diego",
  "san jose","portland","philadelphia","washington","minneapolis",
  "salt lake city","nashville","raleigh","pittsburgh","brooklyn","palo alto",
  "mountain view","sunnyvale","cambridge","bellevue","santa monica",
]);

// Explicit US markers.
export const US_MARKERS = ["united states", "u.s.a", "u.s.", " usa", "(usa)", ", us"];

// Ordered role rules — first match wins. Each entry: [category, keywords].
export const ROLE_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["mobile", ["ios engineer", "android engineer", "mobile engineer", "ios developer", "android developer"]],
  ["ml-ai", ["machine learning", "ml engineer", "ai engineer", "deep learning", "nlp", "computer vision", "research scientist"]],
  ["data", ["data engineer", "data scientist", "data analyst", "analytics engineer", "bi engineer"]],
  ["devops", ["devops", "site reliability", "sre", "platform engineer", "infrastructure engineer", "cloud engineer"]],
  ["security", ["security engineer", "appsec", "application security", "infosec", "security analyst"]],
  ["qa", ["qa engineer", "quality assurance", "test engineer", "sdet", "automation engineer"]],
  ["frontend", ["frontend", "front end", "front-end", "ui engineer", "react engineer"]],
  ["backend", ["backend", "back end", "back-end", "server engineer"]],
  ["fullstack", ["full stack", "fullstack", "full-stack", "software engineer", "software developer", "swe", "developer", "programmer", "engineer"]],
];

// Ordered level rules — first match wins.
export const LEVEL_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["intern", ["intern", "internship", "co-op"]],
  ["staff", ["staff", "principal"]],
  ["lead", ["lead", "tech lead"]],
  ["manager", ["manager", "director", "head of", "vp ", "vice president"]],
  ["senior", ["senior", "sr.", "sr ", "snr"]],
  ["junior", ["junior", "jr.", "jr ", "entry level", "entry-level", "new grad", "new graduate", "early career", "early-career", "university grad", "university graduate", "campus", "associate", "graduate"]],
];

// Canonical tech term -> regex source matched against title+description.
// Order does not matter; results are deduped and sorted by appearance.
export const TECH_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["React", "\\breact\\b"],
  ["React Native", "\\breact native\\b"],
  ["Angular", "\\bangular\\b"],
  ["Vue", "\\bvue(?:\\.js)?\\b"],
  ["Svelte", "\\bsvelte\\b"],
  ["TypeScript", "\\btypescript\\b"],
  ["JavaScript", "\\bjavascript\\b"],
  ["Node.js", "\\bnode(?:\\.js|js)?\\b"],
  ["Python", "\\bpython\\b"],
  ["Java", "\\bjava\\b"],
  ["Go", "\\b(?:golang|go)\\b"],
  ["Rust", "\\brust\\b"],
  ["Ruby", "\\bruby\\b"],
  ["Rails", "\\brails\\b"],
  ["C++", "c\\+\\+"],
  ["C#", "c#"],
  ["Kotlin", "\\bkotlin\\b"],
  ["Swift", "\\bswift\\b"],
  ["PHP", "\\bphp\\b"],
  ["Scala", "\\bscala\\b"],
  ["Django", "\\bdjango\\b"],
  ["Flask", "\\bflask\\b"],
  ["FastAPI", "\\bfastapi\\b"],
  ["Spring", "\\bspring\\b"],
  ["GraphQL", "\\bgraphql\\b"],
  ["PostgreSQL", "\\b(?:postgresql|postgres)\\b"],
  ["MySQL", "\\bmysql\\b"],
  ["MongoDB", "\\bmongodb\\b"],
  ["Redis", "\\bredis\\b"],
  ["Kafka", "\\bkafka\\b"],
  ["AWS", "\\baws\\b"],
  ["GCP", "\\b(?:gcp|google cloud)\\b"],
  ["Azure", "\\bazure\\b"],
  ["Docker", "\\bdocker\\b"],
  ["Kubernetes", "\\b(?:kubernetes|k8s)\\b"],
  ["Terraform", "\\bterraform\\b"],
  ["TensorFlow", "\\btensorflow\\b"],
  ["PyTorch", "\\bpytorch\\b"],
];

// Non-US signals: country names, ISO-2 codes, major foreign cities, and regions.
export const FOREIGN_COUNTRY_TOKENS = new Set([
  "uk","u.k.","gb","england","scotland","wales","ireland","ie",
  "canada","ca-canada","germany","de-germany","france","spain","italy",
  "netherlands","poland","sweden","switzerland","portugal","romania",
  "india","in-india","singapore","sg","japan","jp","china","cn",
  "australia","au","brazil","br","mexico","mx","israel","il",
]);
export const FOREIGN_MARKERS = [
  "united kingdom","england","scotland","ireland","dublin","london",
  "germany","berlin","munich","france","paris","netherlands","amsterdam",
  "spain","madrid","barcelona","italy","milan","poland","warsaw","krakow",
  "sweden","stockholm","switzerland","zurich","canada","toronto","vancouver",
  "ontario","quebec","india","bangalore","bengaluru","hyderabad","pune",
  "mumbai","delhi","gurgaon","noida","chennai","singapore","japan","tokyo",
  "china","beijing","shanghai","australia","sydney","melbourne","brazil",
  "são paulo","sao paulo","mexico city","israel","tel aviv",
  "emea","apac","latam"," eu "," europe","european union",
];
