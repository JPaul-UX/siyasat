/*
 * Capitalising a title the way a citation style asks for it.
 *
 * Styles disagree: APA, Harvard, IEEE and Vancouver want sentence case ("Deep learning for image
 * recognition"), MLA and Chicago want title case ("Deep Learning for Image Recognition"). Databases hold a
 * title however its publisher typed it, so a title often has to be converted.
 *
 * Going to title case is mechanical. Going to sentence case is not, because a title in title case does not
 * say which of its capitals are real: "Bayesian Learning in Python" must become "Bayesian learning in
 * Python". So each capitalised word is decided on evidence, strongest first:
 *
 *   1. Its own shape. "NumPy", "mRNA", "COVID-19" and "BERT" carry capitals or digits no ordinary word has.
 *   2. Running text about the same work. A word the abstract writes in lower case is an ordinary word; one
 *      it writes with a capital in the middle of a sentence is a name.
 *   3. The author's own reference, when they typed the title in sentence case.
 *   4. A list of names that titles often contain: places, peoples, languages, and people whose names became
 *      terms ("Bayesian", "Likert").
 *   5. Failing all of those, the word is taken to be ordinary and written in lower case.
 *
 * A title that is not in English is left exactly as it is: other languages have other rules.
 */

/* ---------- Word lists ---------- */

const words = (s: string) => s.trim().split(/\s+/);

const ARTICLES = new Set(words('a an the'));
const PREPOSITIONS = new Set(
  words(
    'about above across after against along among around as at before behind below beneath beside between beyond by despite down during except for from in inside into like near of off on onto out outside over past per since through throughout to toward towards under underneath until up upon via versus vs with within without',
  ),
);
/** Words title case leaves in lower case. MLA lowers every coordinating conjunction; Chicago keeps "so" and "yet". */
const SMALL_WORDS = {
  mla: new Set([...ARTICLES, ...PREPOSITIONS, ...words('and but for nor or so yet')]),
  chicago: new Set([...ARTICLES, ...PREPOSITIONS, ...words('and but for nor or')]),
};
/** A first element that cannot stand as a word: Chicago does not capitalise what follows it ("Pre-training"). */
const PREFIXES = new Set(words('anti bi co counter de e inter intra macro meta micro mid mini multi neo non over post pre pro pseudo re semi sub super trans tri ultra un under'));

/** Function words that show which language a title is in. */
const ENGLISH = new Set(words('the of and in for to with on a an by from is are at as or its their using based between among into how what why does do can'));
const NOT_ENGLISH = new Set(
  words(
    'de la el los las del y en para con por un una que como sobre entre desde le les des du et pour dans sur au aux une der das und von für mit zur zum im eine os dos em na uma di il della degli ang ng sa mga ay kay nang',
  ),
);

/** Words that are ordinary even though a title in title case capitalises them. Enough to recognise title case. */
const ORDINARY = new Set(
  words(
    `ability access achievement action activity adoption adults age agent algorithm algorithms analysis application applications approach approaches architecture assessment
     attitudes awareness barriers based behavior behaviour benefits best big brain business care case cases cell cells challenges change changes children city class classification
     classroom climate clinical cognitive cohort communication communities community comparative comparison computing concept concepts conditions context control cost course
     critical cultural culture curriculum data deep design detection determinants development diagnosis differences digital disease distance distribution during dynamics early
     economic education educational effect effective effectiveness effects efficacy efficiency emerging empirical energy engagement engineering environment environmental
     evaluation evidence evolution experience experiences experimental exploring factors family features field findings food framework from function future gender general
     generation global graduate group groups growth guide health high higher history human identification identity image images impact implementation implications improving
     income influence information innovation integrated integration intelligence interaction intervention introduction investigation issues knowledge language large learning
     level levels life literacy literature local long machine management market mathematics measurement measures mechanisms media medical medicine memory mental meta method
     methods model modeling modelling models modern molecular motivation multiple national natural need network networks neural new novel nursing object online open
     optimization outcomes overview parents participation patients patterns perceived perception perceptions performance perspective perspectives physical policy population
     practice practices prediction predictors pressure prevalence primary principles problem problems process processes processing production professional program programs
     project properties protein psychological public quality quantitative randomized rate reading real recent recognition reduction regional regression relationship
     relationships remote representation representations research resources response results review risk role rural safety scale school schools science sciences secondary
     selection self services skills small social society software sources spatial stress structure student students studies study success support survey sustainable system
     systematic systems teacher teachers teaching technology test testing theory therapy thinking time tools towards training transfer transformers treatment trial trends
     understanding university urban use using validation value values variation virtual vision water web women work workers world writing year years young youth all you need is
     are was were be been being it its their this that these those than then when where which while who whose will would should could may might must can more most less least
     better faster longer total flying residual bidirectional understanding elements statistical array programming`,
  ),
);

/** Names that appear in titles. Lower-case key, spelling to use. */
const NAMES = new Map<string, string>(
  words(
    `Africa African America American Americas Arab Arabic Asia Asian Atlantic Australia Australian Bangladesh Brazil Brazilian Britain British Cambodia Canada Canadian Caribbean
     China Chinese Colombia Dutch Egypt Egyptian England English Ethiopia Europe European Filipino Filipina Filipinos France French German Germany Ghana Greece Greek India
     Indian Indonesia Indonesian Iran Iraq Ireland Irish Israel Italian Italy Japan Japanese Jordan Kenya Korea Korean Laos Malaysia Malaysian Mediterranean Mexican Mexico
     Myanmar Nepal Netherlands Nigeria Nigerian Pacific Pakistan Pakistani Philippine Philippines Poland Polish Portugal Portuguese Russia Russian Scotland Singapore Spain
     Spanish Sweden Swedish Switzerland Taiwan Thai Thailand Turkey Turkish Uganda Ukraine Vietnam Vietnamese Wales
     Mindanao Luzon Visayas Manila Cebu Cebuano Davao Iligan Marawi Lanao Zamboanga Cagayan Bukidnon Cotabato Sulu Palawan Mindoro Leyte Samar Negros Panay Bohol Baguio
     Quezon Makati Butuan Surigao Agusan Misamis Basilan Tagalog Bisaya Visayan Ilocano Ilokano Maranao Meranaw Maguindanao Maguindanaon Tausug Hiligaynon Waray Bikol
     Kapampangan Pangasinan Moro Bangsamoro Lumad Higaonon Subanen Manobo Islam Islamic Muslim Muslims Christian Christians Christianity Catholic Buddhist Hindu Jewish
     January February March April June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday
     Bayes Bayesian Markov Gaussian Gauss Newton Newtonian Darwin Darwinian Boolean Euclidean Fourier Laplace Poisson Kalman Turing Pareto Nash Likert Cronbach Pearson
     Spearman Fisher Bonferroni Kruskal Wallis Wilcoxon Tukey Cohen Delphi Rasch Kolb Bloom Vygotsky Vygotskian Piaget Piagetian Freire Maslow Bandura Hofstede Bourdieu
     Foucault Marx Marxist Keynesian Freud Freudian Kant Kantian Aristotle Aristotelian Confucian Confucius Dewey Krashen Chomsky Skinner Erikson Gardner Kohlberg Alzheimer
     Parkinson Hodgkin Crohn Kawasaki Zika Ebola Petri Hopfield Boltzmann Monte Carlo Hadoop Lagrangian Hamiltonian Hilbert Riemann Lyapunov Shannon Zipf Hebbian
     Python Java Linux Android Google Facebook Twitter Instagram Wikipedia Amazon Microsoft Moodle Arduino Bluetooth Scopus Crossref Medline Kahoot Duolingo Canva Zumba
     Matlab Fortran Julia Kubernetes Docker Ethereum Bitcoin Unix Netflix Spotify Reddit Telegram Messenger Raspberry Lancet Elsevier Springer Wiley Sage Taylor Francis
     Cochrane Scielo Rizal Bonifacio Aquino Marcos Duterte
     Afghanistan Albania Algeria Angola Argentina Argentine Armenia Austria Azerbaijan Bahrain Belarus Belgium Belgian Bhutan Bolivia Bosnia Botswana Brunei Bulgaria Burundi
     Cameroon Chile Chilean Croatia Cuba Cuban Cyprus Czech Denmark Danish Ecuador Eritrea Estonia Fiji Finland Finnish Gambia Guatemala Guinea Haiti Honduras Hungary
     Hungarian Iceland Iranian Iraqi Israeli Jamaica Kazakhstan Kuwait Kyrgyzstan Latvia Lebanon Lebanese Lesotho Liberia Libya Lithuania Luxembourg Madagascar Malawi
     Maldives Mali Malta Mauritius Mongolia Morocco Moroccan Mozambique Namibia Nepalese Nicaragua Niger Norway Norwegian Oman Palestine Palestinian Panama Paraguay Peru
     Peruvian Qatar Romania Romanian Rwanda Samoa Senegal Serbia Slovakia Slovenia Somalia Sudan Suriname Syria Syrian Tajikistan Tanzania Timor Togo Tonga Tunisia
     Turkmenistan Ukrainian Uruguay Uzbekistan Venezuela Yemen Zambia Zimbabwe Scandinavia Scandinavian Balkan Balkans Arctic Antarctic Antarctica Sahara Saharan Himalaya
     Himalayan Andes Amazonian Siberia Tibet Tibetan Kurdish Persian Hebrew Swahili Hausa Yoruba Igbo Zulu Amharic Bengali Hindi Urdu Tamil Telugu Punjabi Malay Javanese
     Khmer Lao Burmese Mandarin Cantonese Latin Sanskrit Maori Hawaiian Hawaii Alaska Arizona California Colorado Connecticut Florida Georgia Idaho Illinois Indiana Iowa
     Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada Ohio Oklahoma Oregon Pennsylvania Tennessee
     Texas Utah Vermont Virginia Wisconsin Wyoming Ontario Quebec Alberta Queensland Tasmania Victoria London Paris Berlin Madrid Rome Vienna Amsterdam Brussels Stockholm
     Oslo Copenhagen Helsinki Dublin Lisbon Athens Istanbul Moscow Cairo Lagos Nairobi Accra Johannesburg Tehran Baghdad Riyadh Dubai Karachi Lahore Delhi Mumbai Kolkata
     Chennai Bangalore Hyderabad Dhaka Kathmandu Colombo Bangkok Hanoi Jakarta Java Sumatra Borneo Bali Sulawesi Papua Kuala Lumpur Sabah Sarawak Penang Tokyo Osaka Kyoto
     Seoul Busan Beijing Shanghai Shenzhen Guangzhou Wuhan Nanjing Chengdu Chongqing Tianjin Hangzhou Yunnan Sichuan Guangdong Guangxi Hubei Hunan Henan Hebei Shandong
     Shanxi Shaanxi Zhejiang Jiangsu Jiangxi Fujian Anhui Guizhou Gansu Qinghai Xinjiang Liaoning Jilin Heilongjiang Hainan Macau Taipei Sydney Melbourne Brisbane Perth
     Auckland Toronto Vancouver Montreal Ottawa Chicago Boston Seattle Houston Dallas Atlanta Miami Philadelphia Detroit Denver Kerala Gujarat Maharashtra Karnataka
     Rajasthan Bihar Punjab Kashmir Assam Odisha Bengal Abra Aklan Albay  Apayao  Bataan Batanes Batangas Benguet Biliran Bulacan Camarines Camiguin Capiz
     Catanduanes Cavite Dinagat Guimaras Ifugao Ilocos Iloilo Isabela Kalinga Laguna Marinduque Masbate Nueva Ecija Vizcaya Pampanga Quirino Romblon Sarangani Siquijor
     Sorsogon  Kudarat Tarlac Tawi Zambales Sibugay Siargao Boracay Bicol Caraga Soccsksargen Calabarzon Mimaropa Cordillera Caloocan Pasig Taguig Pasay Marikina
     Muntinlupa Valenzuela Malabon Navotas Mandaluyong Parañaque Antipolo Bacolod Tacloban Ormoc Dumaguete Tagbilaran Dipolog Pagadian Ozamiz Oroquieta Tangub Gingoog
     Malaybalay Valencia Koronadal Kidapawan Tacurong Digos Tagum Panabo  Bislig Tandag Cabadbaran Bayugan Jolo Bongao Isulan Tubod Kapatagan Kauswagan Linamon
     Dapitan Sindangan Ipil Legazpi Naga Puerto Princesa Tuguegarao Laoag Vigan Dagupan Olongapo Angeles Lucena Calamba Lipa Tagaytay Aeta Agta  Badjao Bajau 
     Yakan Iranun Kalagan Mandaya Mansaka Bagobo Blaan Tboli Teduray Talaandig Matigsalug Mamanwa Mangyan Ibaloi Kankanaey Ibanag Ivatan Igorot Chavacano Kinaray
     Europeans Asians Africans Americans Australians Canadians Germans Italians Indians Indonesians Malaysians Koreans Nigerians Pakistanis Thais Turks Arabs Jews
     Hindus Buddhists Catholics Protestant Protestants Sunni Shia Quran Qur'an Bible Biblical Ramadan Christmas Easter Hajj Eid Olympic Olympics Paralympic Nobel
     Fulbright Erasmus Bologna Kyoto Paris Rio Stanford Harvard Oxford Cambridge Yale Princeton Berkeley Hopkins Mayo Fukushima Chernobyl Katrina Haiyan Yolanda
     Odette Sendong Pablo Florence Renaissance Victorian Ottoman Byzantine Soviet Nazi Maoist Leninist Stalinist Gandhi Gandhian Mandela Churchill Lincoln Einstein
     Schrödinger Heisenberg Maxwell Faraday Kelvin Planck Bohr Fermi Dirac Feynman Hawking Mendel Mendelian Pasteur Koch Pavlov Pavlovian Jung Jungian Lacan Lacanian
     Hegel Hegelian Nietzsche Plato Platonic Socrates Socratic Descartes Cartesian Locke Hume Rawls Rawlsian Habermas Derrida Weber Weberian Durkheim Gramsci Fanon
     Montessori Froebel Rogers Lewin Kirkpatrick  Taba Stufflebeam Mezirow Knowles Bruner Ausubel Gagné Sweller  Bronfenbrenner Vroom Herzberg McClelland
     Kotter Schein  Kaplan Meier  Kolmogorov Smirnov Shapiro Wilk Levene  Whitney Friedman Scheffé Dunnett Cochran Mantel Haenszel Hosmer Lemeshow Akaike
     Dijkstra Kruskal Bellman Viterbi Huffman Hamming Levenshtein Jaccard Cauchy Lebesgue Banach Sobolev Navier Stokes Reynolds Bernoulli Euler Lagrange Hamilton
     Legendre Chebyshev Hermite Jacobi Hessian Jacobian Wiener Kalman Nyquist Bode Lorenz Mandelbrot Voronoi Delaunay Dirichlet Weibull Rayleigh Bessel Fibonacci
     Golgi Purkinje Schwann Broca Wernicke Huntington Tourette Asperger  Marfan  Klinefelter Cushing Addison  Hashimoto Raynaud Sjögren Behçet Kaposi
     Burkitt Ewing Wilms Barrett Helicobacter Escherichia Staphylococcus Streptococcus Salmonella Plasmodium Aedes Anopheles Arabidopsis Drosophila Caenorhabditis
     Zoom Skype WhatsApp TikTok YouTube Snapchat Pinterest Tinder Uber Airbnb Alibaba Tencent Huawei Samsung Sony Toyota Tesla  Nvidia Intel Oracle Cisco Kaggle
     Coursera Udemy Edmodo Schoology Quizizz Quizlet Padlet Minecraft Roblox Fortnite Pokémon  Tableau Excel Stata Mendeley Zotero Turnitin Grammarly Elicit
     Gemini Claude Copilot Llama Mistral  Siri Alexa Cortana Watson Kinect Fitbit Garmin Photoshop   Simulink Proteus Jupyter  Colab Kotlin
       Perl Haskell Scala Erlang  Solidity Hyperledger Kafka   Cassandra Redis Postgres Mongo Django  Laravel   Svelte `,
  ).map((w) => [w.toLowerCase(), w]),
);

/** Names of more than one word, which would not survive word by word ("New" and "York" are ordinary words). */
const PHRASES = [
  'United States', 'United Kingdom', 'United Nations', 'New Zealand', 'New York', 'New Guinea', 'South Korea', 'North Korea', 'South Africa', 'Saudi Arabia', 'Sri Lanka',
  'Hong Kong', 'Latin America', 'North America', 'South America', 'Southeast Asia', 'South Asia', 'East Asia', 'Middle East', 'Asia Pacific', 'Sub-Saharan Africa',
  'Metro Manila', 'Northern Mindanao', 'Cagayan de Oro', 'Lanao del Norte', 'Lanao del Sur', 'Zamboanga del Sur', 'Davao del Sur', 'Misamis Oriental', 'Misamis Occidental',
  'World Health Organization', 'World Bank', 'European Union', 'Web of Science', 'Google Scholar', 'Monte Carlo', 'Raspberry Pi', 'Los Angeles', 'San Francisco',
  'Sultan Kudarat', 'Camarines Sur', 'Camarines Norte', 'Ilocos Sur', 'Ilocos Norte', 'Surigao del Sur', 'Surigao del Norte', 'Agusan del Sur', 'Agusan del Norte',
  'Davao del Norte', 'Davao de Oro', 'Davao Oriental', 'Davao Occidental', 'Zamboanga del Norte', 'Negros Oriental', 'Negros Occidental', 'Mountain Province',
  'South Cotabato', 'North Cotabato', 'Eastern Visayas', 'Western Visayas', 'Central Visayas', 'Central Luzon', 'Central Mindanao', 'Western Mindanao', 'Southern Mindanao',
  'Southern Philippines', 'Institute of Technology', 'Down syndrome', 'Hugging Face', 'Apple Watch', 'West Africa', 'East Africa', 'North Africa', 'Central Asia',
  'Central America', 'Eastern Europe', 'Western Europe', 'Global South', 'Global North', 'Great Britain', 'Northern Ireland', 'Costa Rica', 'Puerto Rico', 'El Salvador',
  'Sierra Leone', 'Burkina Faso', 'Ivory Coast', 'Cape Town', 'Tel Aviv', 'Abu Dhabi', 'Ho Chi Minh', 'Rio de Janeiro', 'São Paulo', 'Buenos Aires', 'Addis Ababa',
  'West Bank', 'Gaza Strip', 'Silicon Valley', 'Wall Street', 'Black Lives Matter', 'World War', 'Cold War', 'Middle Ages', 'Industrial Revolution',
].map((p) => p.split(' '));

/** Names that describe ("Filipino students"), as opposed to names of places. Nothing is named after these the way "Iligan City" is. */
const DESCRIBING = new Set(
  words(
    `african american arab arabic asian australian brazilian british canadian chinese dutch egyptian english european filipino filipina french german greek indian indonesian
     irish italian japanese korean malaysian mexican nigerian pakistani polish portuguese russian spanish swedish thai turkish vietnamese philippine islamic muslim christian
     catholic buddhist hindu jewish latin mediterranean scandinavian`,
  ),
);
/** What a place gives its name to: "Iligan City", "Mindanao State University", "University of the Philippines". */
const INSTITUTIONS = new Set(words('university college institute polytechnic academy'));

/** Abbreviations written in capitals, for titles that arrive entirely in capitals. */
const ACRONYMS = new Map<string, string>(
  words(
    `AI AIDS ANOVA API ASEAN BMI CNN COVID COVID-19 CT DNA ECG EEG EFL ESL EU GDP GIS GPS GPU HIV HPV ICT ICU IEEE IoT IQ IT K-12 LGBT LGBTQ LMS LSTM MERS ML MOOC MRI NASA NATO NGO NLP
     OECD PCR PISA RNA mRNA RCT SARS SARS-CoV-2 SEM SME STEM SVM TB UK UN UNESCO UNICEF USA US UV VR AR WHO WiFi XML`,
  ).map((w) => [w.toLowerCase(), w]),
);

/** Possessives of ordinary words. Any other capitalised possessive is someone's name: "Zipf's law". */
const ORDINARY_POSSESSIVES = new Set(words("children's women's men's people's students' student's teachers' teacher's patients' patient's nurses' mothers' mother's users' user's author's authors' learner's learners' today's world's nation's one's"));

/** Headings of a structured abstract. They are written in capitals but are not abbreviations. */
const ABSTRACT_HEADINGS = new Set(
  words('abstract aim aims background conclusion conclusions context design discussion findings funding importance interpretation interventions introduction keywords measurements method methods objective objectives participants purpose results setting significance summary'),
);

/* ---------- Words in a title ---------- */

interface Token {
  text: string;
  /** A word, as opposed to the spaces and punctuation between words. */
  word: boolean;
}

/** A word may hold apostrophes and hyphens: "students'", "state-of-the-art", "COVID-19". */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*(?:-[\p{L}\p{N}][\p{L}\p{N}'’]*)*/gu;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), word: false });
    out.push({ text: m[0], word: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false });
  return out;
}

const hasLower = (s: string) => /\p{Ll}/u.test(s);
const hasUpper = (s: string) => /\p{Lu}/u.test(s);
const startsUpper = (s: string) => /^\p{Lu}/u.test(s);
const capitalise = (s: string) => s.replace(/\p{L}/u, (c) => c.toUpperCase());
/** A capital anywhere but the front, a digit, or all capitals: no ordinary word looks like this. */
const distinctive = (s: string) => /\p{N}/u.test(s) || /.\p{Lu}/u.test(s) || (s.length > 1 && !hasLower(s));
/** What comes before a word makes it the first word of a sentence or of a subtitle. */
const opensSentence = (before: string | undefined) => before === undefined || /[.?!]["”’)\]]*\s+$/.test(before);
const opensSubtitle = (before: string | undefined) => !!before && /[:—–]\s+$|\s-\s+$/.test(before);

/* ---------- Evidence ---------- */

/** What is known about how particular words are written. Keys are lower case. */
export interface CaseEvidence {
  /** Words that keep a capital, with the spelling seen. */
  proper: Map<string, string>;
  /** Words seen in lower case in the middle of a sentence. */
  common: Set<string>;
  /** Names of several words, as seen: ["Mindanao", "State", "University"]. */
  phrases: string[][];
}

export const noEvidence = (): CaseEvidence => ({ proper: new Map(), common: new Set(), phrases: [] });

/** Small words that may sit inside a name without a capital: "University of the Philippines", "Cagayan de Oro". */
const INSIDE_NAMES = new Set(words('of the de del la'));

/**
 * Words that are capitalised only because an abbreviation is being introduced: "Artificial Intelligence (AI)".
 * They are ordinary words. Found by matching the letters in the brackets to the initials of the words before.
 */
function spelledOutAbbreviations(tokens: Token[]): Set<number> {
  const found = new Set<number>();
  tokens.forEach((t, i) => {
    const letters = t.word && /^\s*\($/.test(tokens[i - 1]?.text ?? '') && /^\)/.test(tokens[i + 1]?.text ?? '') ? t.text.replace(/s$/, '').replace(/[^\p{Lu}]/gu, '') : '';
    if (letters.length < 2) return;
    // Walk back over the words before the bracket, one initial per word (or per part of a hyphenated word).
    const at: number[] = [];
    let need = letters.length;
    for (let j = i - 2; j >= 0 && need > 0; j--) {
      const w = tokens[j]!;
      if (!w.word) {
        if (!/^[ -]$/.test(w.text)) break;
        continue;
      }
      if (INSIDE_NAMES.has(w.text) || w.text === 'and' || w.text === 'for' || w.text === 'in') continue;
      const parts = w.text.split('-');
      const initials = parts.map((p) => p[0]!.toUpperCase()).join('');
      if (need >= initials.length && letters.slice(need - initials.length, need) === initials) need -= initials.length;
      else if (letters[need - 1] === initials[0]) need -= 1;
      else break;
      at.push(j);
    }
    if (need === 0) at.forEach((j) => found.add(j));
  });
  return found;
}

/**
 * Learn how words are written from running text, such as an abstract.
 *   - A word in lower case is an ordinary word.
 *   - A word with a capital that does not open a sentence is a name, unless the same word also appears in lower case.
 *   - A run of such words is a name of several words ("Mindanao State University"), kept together.
 *   - Words capitalised to introduce an abbreviation ("Artificial Intelligence (AI)") are ordinary words.
 */
export function evidenceFromText(text: string | null | undefined, into: CaseEvidence = noEvidence()): CaseEvidence {
  if (!text) return into;
  const capitalised = new Map<string, string>();
  const tokens = tokenize(text);
  const spelledOut = spelledOutAbbreviations(tokens);
  const midSentenceCapital: boolean[] = [];

  tokens.forEach((t, i) => {
    if (!t.word) return;
    const before = i > 0 ? tokens[i - 1]!.text : undefined;
    const after = tokens[i + 1]?.text ?? '';
    const first = opensSentence(before) || opensSubtitle(before);
    midSentenceCapital[i] = startsUpper(t.text) && !first && !spelledOut.has(i);
    for (const part of [t.text, ...(t.text.includes('-') ? t.text.split('-') : [])]) {
      const key = part.toLowerCase();
      if (!hasUpper(part)) into.common.add(key);
      else if (spelledOut.has(i)) {
        if (!distinctive(part) && !NAMES.has(key)) into.common.add(key);
      } else if (distinctive(part)) {
        // "BACKGROUND:" opens a section of the abstract; it is not an abbreviation.
        const heading = !hasLower(part) && (ABSTRACT_HEADINGS.has(key) || /^\s*:/.test(after));
        if (!heading) capitalised.set(key, part);
      } else if (!first) capitalised.set(key, part);
    }
  });
  for (const [key, spelling] of capitalised) if (!into.common.has(key)) into.proper.set(key, spelling);

  // Runs of capitalised words, which small words may join: "University of the Philippines".
  let run: number[] = [];
  const close = () => {
    while (run.length && !midSentenceCapital[run[run.length - 1]!]) run.pop();
    const names = run.filter((i) => midSentenceCapital[i]).map((i) => tokens[i]!.text);
    const phrase = run.map((i) => tokens[i]!.text);
    // A real name has a word that is never written small, and the run is never written small as a whole.
    const real = names.some((w) => NAMES.has(w.toLowerCase()) || into.proper.has(w.toLowerCase())) && !text.includes(phrase.join(' ').toLowerCase());
    if (names.length > 1 && real && !into.phrases.some((p) => p.join(' ') === phrase.join(' '))) into.phrases.push(phrase);
    run = [];
  };
  tokens.forEach((t, i) => {
    if (!t.word) {
      if (t.text !== ' ') close();
    } else if (midSentenceCapital[i]) run.push(i);
    else if (run.length && INSIDE_NAMES.has(t.text)) run.push(i);
    else close();
  });
  close();
  return into;
}

/**
 * Learn names from another copy of the same title: the author's own reference, or a second database record.
 * Only a copy written in sentence case says anything, and only its capitals are believed. A capital in the
 * middle of a sentence-case title was put there on purpose; a missing one may just be carelessness.
 */
export function namesFromTitle(title: string | null | undefined, into: CaseEvidence = noEvidence()): CaseEvidence {
  if (!title || !isSentenceCase(title, into)) return into;
  for (const [key, spelling] of evidenceFromText(title).proper) if (!into.common.has(key) && !into.proper.has(key)) into.proper.set(key, spelling);
  return into;
}

/* ---------- Language ---------- */

/** Whether a title is in English. A language given by the database is believed unless the title plainly says otherwise. */
export function isEnglish(title: string, lang?: string | null): boolean {
  let english = 0;
  let other = 0;
  for (const t of tokenize(title)) {
    if (!t.word) continue;
    const w = t.text.toLowerCase();
    if (ENGLISH.has(w)) english++;
    else if (NOT_ENGLISH.has(w)) other++;
  }
  // Two or more of another language's small words, and more of them than English ones, settle it.
  if (other >= 2 && english === 0) return false;
  if (lang) return /^en/i.test(lang);
  return other < 2 || other <= english;
}

/* ---------- Which case a title is in ---------- */

type Shape = 'sentence' | 'title' | 'upper';

/** Small verbs and pronouns that people leave in lower case even in title case ("AI Art is Theft"): they say nothing about the case. */
const SAYS_NOTHING = new Set(words('is are was were be been am do does did has have had it its'));

/** Endings that make a word out of another word. A word built this way is an ordinary word, not a name. */
const ORDINARY_ENDING =
  /(?:tions?|sions?|ments?|ness|ities|ity|ings?|isms?|olog(?:y|ies|ical)|ical(?:ly)?|ives?|ous|[ai]ble|[ae]nces?|ful|less|i[sz]ed?|i[sz]ation|ics|[ao]sis|graphy|metry|ated|ating|ship|hood|ally)$/;
const looksOrdinary = (key: string, evidence: CaseEvidence) =>
  evidence.common.has(key) || ORDINARY.has(key) || (key.length >= 6 && ORDINARY_ENDING.test(key));

/**
 * Title case shows itself when ordinary words carry capitals: "Learning", "Analysis", "Students". Names alone
 * do not make a title "title case", so a sentence-case title that holds a place name is left alone.
 */
function shapeOf(tokens: Token[], evidence: CaseEvidence): Shape {
  const text = tokens.map((t) => t.text).join('');
  const wordTokens = tokens.filter((t) => t.word);
  if (hasUpper(text) && !hasLower(text) && wordTokens.length > 1) return 'upper';
  let capitalised = 0;
  let lower = 0;
  let ordinaryCapitalised = 0;
  tokens.forEach((t, i) => {
    if (!t.word) return;
    const before = i > 0 ? tokens[i - 1]!.text : undefined;
    const first = opensSentence(before) || opensSubtitle(before);
    for (const part of t.text.split('-')) {
      const key = part.toLowerCase();
      if (distinctive(part) || SMALL_WORDS.mla.has(key) || SAYS_NOTHING.has(key) || !/\p{L}/u.test(part)) continue;
      if (evidence.proper.has(key) || NAMES.has(key)) continue;
      // The first word has a capital in either case, so it tells nothing. The rest of a hyphenated first word does.
      if (first && part === t.text.split('-')[0]) continue;
      if (startsUpper(part)) {
        capitalised++;
        if (looksOrdinary(key, evidence)) ordinaryCapitalised++;
      } else lower++;
    }
  });
  if (!capitalised) return 'sentence';
  const share = capitalised / (capitalised + lower);
  // Most words capitalised, and either one of them is plainly an ordinary word, or there are several and none in lower case.
  return share >= 0.6 && (ordinaryCapitalised > 0 || (capitalised >= 2 && lower === 0)) ? 'title' : 'sentence';
}

/** Whether a title is written in sentence case, as opposed to title case or all capitals. */
export const isSentenceCase = (title: string, evidence: CaseEvidence = noEvidence()): boolean => shapeOf(tokenize(title), evidence) === 'sentence';

/** Mark the words that belong to a name of several words, such as "New York" or one the abstract showed. */
function phraseWords(tokens: Token[], evidence: CaseEvidence): Map<number, string> {
  const at = new Map<number, string>();
  const idx = tokens.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
  const word = (n: number) => tokens[idx[n]!]?.text ?? '';
  const key = (n: number) => word(n).toLowerCase();
  const place = (n: number) => (NAMES.has(key(n)) || evidence.proper.has(key(n))) && !DESCRIBING.has(key(n));
  for (let w = 0; w < idx.length; w++) {
    for (const phrase of [...PHRASES, ...evidence.phrases]) {
      if (phrase.every((p, k) => key(w + k) === p.toLowerCase())) phrase.forEach((p, k) => at.set(idx[w + k]!, p));
    }
    // What a place gives its name to: "Iligan City", "Mindanao State University", "University of the Philippines".
    if (place(w) && startsUpper(word(w + 1))) {
      if (key(w + 1) === 'city' || INSTITUTIONS.has(key(w + 1))) at.set(idx[w + 1]!, capitalise(key(w + 1)));
      else if (INSTITUTIONS.has(key(w + 2)) && startsUpper(word(w + 2)) && !SMALL_WORDS.mla.has(key(w + 1))) {
        at.set(idx[w + 1]!, capitalise(key(w + 1)));
        at.set(idx[w + 2]!, capitalise(key(w + 2)));
      }
    }
    if (INSTITUTIONS.has(key(w)) && startsUpper(word(w)) && key(w + 1) === 'of' && (place(w + 2) || (key(w + 2) === 'the' && place(w + 3)))) {
      at.set(idx[w]!, capitalise(key(w)));
    }
  }
  return at;
}

/* ---------- Sentence case ---------- */

export interface CaseOptions {
  evidence?: CaseEvidence;
  /** The language the database gives for the work, e.g. "en". */
  lang?: string | null;
}

export interface SentenceOptions extends CaseOptions {
  /**
   * The first word of a subtitle: APA and IEEE give it a capital ("…: An overview"), Harvard and Vancouver
   * do not ("…: an overview").
   */
  subtitle?: 'capital' | 'lower';
}

/** One word of a title in title case or in capitals, decided on the evidence. */
function settle(part: string, evidence: CaseEvidence, allCaps: boolean): string {
  const key = part.toLowerCase();
  const seen = evidence.proper.get(key);
  if (seen) return seen;
  if (evidence.common.has(key)) return key;
  if (!allCaps && distinctive(part)) return part;
  if (allCaps && /\p{N}/u.test(part) && !ACRONYMS.has(key)) return part;
  const known = ACRONYMS.get(key) ?? NAMES.get(key);
  if (known) return known;
  // A single capital letter is a label ("Hepatitis B", "Vitamin D"), unless it is the article.
  if (part.length === 1) return key === 'a' ? 'a' : part.toUpperCase();
  if (/^\p{Lu}\p{Ll}+['’]s$/u.test(allCaps ? capitalise(key) : part) && !ORDINARY_POSSESSIVES.has(key.replace('’', "'"))) return capitalise(key);
  return key;
}

/**
 * Write a title in sentence case: a capital for the first word, for names and for abbreviations, and lower
 * case for the rest.
 */
export function sentenceCase(title: string, options: SentenceOptions = {}): string {
  if (!title || !isEnglish(title, options.lang)) return title;
  const evidence = options.evidence ?? noEvidence();
  const tokens = tokenize(title);
  const shape = shapeOf(tokens, evidence);
  const phrases = phraseWords(tokens, evidence);
  const subtitle = options.subtitle ?? 'capital';

  return tokens
    .map((t, i) => {
      if (!t.word) return t.text;
      const before = i > 0 ? tokens[i - 1]!.text : undefined;
      let word = t.text;
      if (shape !== 'sentence') {
        // The title capitalises ordinary words (or everything): decide each word afresh.
        word = phrases.get(i) ?? word.split('-').map((part) => settle(part, evidence, shape === 'upper')).join('-');
      }
      if (opensSentence(before)) return hasUpper(word.slice(1)) && !startsUpper(word) ? word : capitalise(word);
      if (opensSubtitle(before)) {
        const key = word.toLowerCase();
        const name = phrases.has(i) || evidence.proper.has(key) || NAMES.has(key) || distinctive(word);
        if (subtitle === 'capital') return name && !startsUpper(word) ? word : capitalise(word);
        // Lower case after the colon, but only for a word known to be ordinary: a name keeps its capital.
        if (!name && (shape !== 'sentence' || ARTICLES.has(key) || PREPOSITIONS.has(key) || evidence.common.has(key) || ORDINARY.has(key))) return key;
      }
      return word;
    })
    .join('');
}

/* ---------- Title case ---------- */

export interface TitleOptions extends CaseOptions {
  /** MLA capitalises every part of a hyphenated word; Chicago leaves the part after a prefix ("Pre-training"). */
  rules?: 'mla' | 'chicago';
}

/**
 * Write a title in title case: a capital for the first and last words and for every word in between except
 * articles, prepositions and coordinating conjunctions.
 */
export function titleCase(title: string, options: TitleOptions = {}): string {
  if (!title || !isEnglish(title, options.lang)) return title;
  const rules = options.rules ?? 'mla';
  const small = SMALL_WORDS[rules];
  // Start from sentence case. That settles a title that came in capitals, and spells abbreviations one way
  // ("Covid-19" and "COVID-19") whichever style is asked for. Any name it lowers by mistake gets its capital
  // back here, since title case capitalises it anyway.
  const base = tokenize(sentenceCase(title, options));
  const wordAt = base.map((t, i) => (t.word ? i : -1)).filter((i) => i >= 0);
  const lastWord = wordAt[wordAt.length - 1];

  /** A word that is all lower case gets a capital; one with capitals of its own ("mRNA", "iPhone") is left alone. */
  const raise = (w: string) => (hasUpper(w) ? w : capitalise(w));

  return base
    .map((t, i) => {
      if (!t.word) return t.text;
      const before = i > 0 ? base[i - 1]!.text : undefined;
      const edge = opensSentence(before) || opensSubtitle(before) || i === lastWord;
      const parts = t.text.split('-');
      return parts
        .map((part, k) => {
          const key = part.toLowerCase();
          if (k === 0) return edge || !small.has(key) ? raise(part) : hasUpper(part.slice(1)) ? part : key;
          if (small.has(key) && !(edge && k === parts.length - 1 && i === lastWord)) return hasUpper(part.slice(1)) ? part : key;
          if (rules === 'chicago' && PREFIXES.has(parts[0]!.toLowerCase()) && !hasUpper(part)) return part;
          return raise(part);
        })
        .join('-');
    })
    .join('');
}
