// English / Twi translations for the vendor app.
// Twi strings should be verified by a native speaker before going live.

export type Lang = "en" | "tw";

const strings = {
  myParts:          { en: "My parts",              tw: "M'apɔw" },
  addPart:          { en: "Add a part",             tw: "Fa apɔw ka ho" },
  findPart:         { en: "Find a part…",           tw: "Hwehwɛ apɔw…" },
  whatIsIt:         { en: "What is it?",            tw: "Dɛn na ɛyɛ?" },
  howMuch:          { en: "How much is it?",        tw: "Ɛyɛ sika sɛn?" },
  howMany:          { en: "How many do you have?",  tw: "Wowɔ ahe?" },
  takePhoto:        { en: "Take a photo of the part", tw: "Fa apɔw no foto" },
  tapCamera:        { en: "Tap to open camera",     tw: "Tɔch sɛ wobue kamera" },
  partAdded:        { en: "Part added",             tw: "Apɔw no aka ho" },
  buyersCanSee:     { en: "Buyers can see it now.", tw: "Atɔfo betumi ahu no seesei." },
  back:             { en: "Back",                   tw: "San kɔ" },
  next:             { en: "Next",                   tw: "Kɔ so" },
  done:             { en: "Done",                   tw: "Wie" },
  orSayName:        { en: "Or say the name of the part", tw: "Anaa ka apɔw no din" },
  available:        { en: "Available",              tw: "Wɔ hɔ" },
  onlyLeft:         { en: "Only {n} left",          tw: "Wɔ {n} nko ara" },
  finished:         { en: "Finished",               tw: "Wie" },
  inStock:          { en: "In stock",               tw: "Wɔ stock mu" },
  outOfStock:       { en: "Out of stock",           tw: "Stock asa" },
  condition:        { en: "Condition",              tw: "Ɛte sɛn?" },
  new:              { en: "New",                    tw: "Foforo" },
  used:             { en: "Used",                   tw: "Edi dua" },
  refurbished:      { en: "Refurbished",            tw: "Ayɛ foforo bio" },
  // categories
  brakes:           { en: "Brakes",                 tw: "Brakes" },
  engine:           { en: "Engine",                 tw: "Engine" },
  tyres:            { en: "Tyres",                  tw: "Tyres" },
  battery:          { en: "Battery",                tw: "Battery" },
  electrical:       { en: "Electrical",             tw: "Electrical" },
  body:             { en: "Body",                   tw: "Body" },
  suspension:       { en: "Suspension",             tw: "Suspension" },
  general:          { en: "General",                tw: "General" },
};

export type StringKey = keyof typeof strings;

export function t(key: StringKey, lang: Lang, vars?: Record<string, string | number>): string {
  let str = strings[key][lang] ?? strings[key].en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}
