/*
 * Abbreviating a journal's name.
 *
 * Vancouver and IEEE cite journals by abbreviation: "N Engl J Med", "IEEE Trans. Pattern Anal. Mach. Intell."
 * The abbreviation a journal actually goes by is a fact to look up, and the API does look it up (in the NLM
 * Catalog, and in what the publisher gave Crossref). This file is for when nobody has recorded one: it
 * abbreviates a name by the international standard, ISO 4.
 *
 * ISO 4 in short:
 *   - a name of one word is never abbreviated ("Nature", "Lancet");
 *   - articles, prepositions and conjunctions are dropped ("Journal of the American Medical Association");
 *   - each remaining word is shortened as the standard's word list says ("Journal" → "J.", "Medicine" → "Med."),
 *     and a word that is not on the list is kept whole;
 *   - names of organisations written in capitals are kept ("IEEE", "ACM").
 *
 * The standard's word list has tens of thousands of entries. The one here holds the words that journal names
 * are mostly made of, so an unusual word is left whole rather than guessed at.
 */

const DROPPED = new Set(
  'a an the of for and in on to at by with from as or de la le les du des del der die das und et y e el los las di da do dos van von'.split(' '),
);

/**
 * Word → abbreviation. A key ending in "-" matches every word that starts with it ("medic-" matches
 * "medicine" and "medical"); any other key matches that word only. An empty value keeps the word whole.
 */
const WORD_LIST: [string, string][] = `
academ-:Acad. account-:Account. acoust-:Acoust. administr-:Adm. advanc-:Adv. african:Afr. agricultur-:Agric. american:Am. analy-:Anal.
anatom-:Anat. annals:Ann. annual:Annu. anthropolog-:Anthropol. applied:Appl. applicat-:Appl. archiv-:Arch. artific-:Artif. asian: asia:
associat-:Assoc. astronom-:Astron. atmospher-:Atmos. australian:Aust. behavio-:Behav. biochem-:Biochem. bioinformat-:Bioinform. biolog-:Biol.
biomed-:Biomed. biotechnol-:Biotechnol. botan-:Bot. british:Br. bulletin:Bull. business:Bus. canadian:Can. cardiol-:Cardiol. cellular:Cell.
chemi-:Chem. chinese:Chin. circulat-:Circ. clinic-:Clin. cogniti-:Cogn. college:Coll. communic-:Commun. comparat-:Comp. comput-:Comput.
conference:Conf. contemporar-:Contemp. critic-:Crit. cultur-:Cult. current:Curr. dental:Dent. dentist-:Dent. dermatol-:Dermatol. develop-:Dev.
diagnos-:Diagn. digital:Digit. disease:Dis. diseases:Dis. ecolog-:Ecol. econom-:Econ. educat-:Educ. electric-:Electr. electron-:Electron.
emerg-:Emerg. engineer-:Eng. england:Engl. english:Engl. environment-:Environ. epidemiol-:Epidemiol. europ-:Eur. evolution-:Evol.
experiment-:Exp. famil-:Fam. forest-:For. frontier-:Front. general:Gen. genet-:Genet. geograph-:Geogr. geolog-:Geol. geophys-:Geophys.
global:Glob. higher:High. histor-:Hist. hospital-:Hosp. human:Hum. humanit-:Humanit. immunol-:Immunol. industr-:Ind. infect-:Infect.
informat-:Inf. innovat-:Innov. institut-:Inst. intelligen-:Intell. interact-:Interact. internal:Intern. internation-:Int. japanese:Jpn.
journal:J. knowledge:Knowl. laborator-:Lab. language:Lang. languages:Lang. learning:Learn. letters:Lett. librar-:Libr. linguist-:Linguist.
literatur-:Lit. machine:Mach. manag-:Manag. marine:Mar. market-:Mark. material-:Mater. mathemat-:Math. mechanic-:Mech. medic-:Med.
mental:Ment. methodolog-:Methodol. microbiol-:Microbiol. modern:Mod. molecul-:Mol. national:Natl. natur-:Nat. network-:Netw. neurol-:Neurol.
neurosci-:Neurosci. new:N. nurs-:Nurs. nutrit-:Nutr. ocean-:Ocean. oncol-:Oncol. operat-:Oper. optic-:Opt. organi-:Organ. pacific:Pac.
patholog-:Pathol. pediatr-:Pediatr. pharmacol-:Pharmacol. pharmac-:Pharm. philippin-:Philipp. philosoph-:Philos. physic-:Phys.
physiolog-:Physiol. politic-:Polit. practic-:Pract. proceedings:Proc. process-:Process. psycholog-:Psychol. publish-:Publ. quarterly:Q.
radiol-:Radiol. record-:Rec. region-:Reg. report-:Rep. research:Res. resourc-:Resour. review-:Rev. royal:R. scienc-:Sci. scientif-:Sci.
social:Soc. societ-:Soc. sociolog-:Sociol. software:Softw. special:Spec. statistic-:Stat. studies:Stud. surg-:Surg. survey-:Surv.
sustainab-:Sustain. system-:Syst. teach-:Teach. technic-:Tech. technolog-:Technol. theor-:Theor. therap-:Ther. transact-:Trans.
tropic-:Trop. universit-:Univ. vision:Vis. zoolog-:Zool. multidisciplin-:Multidiscip. interdisciplin-:Interdiscip. psychiatr-:Psychiatry
psychiatric:Psychiatr. gastroenterol-:Gastroenterol. endocrinol-:Endocrinol. ophthalmol-:Ophthalmol. obstetr-:Obstet. gynecol-:Gynecol.
gynaecol-:Gynaecol. orthop-:Orthop. rheumatol-:Rheumatol. urolog-:Urol. nephrol-:Nephrol. hematol-:Hematol. haematol-:Haematol.
anesthes-:Anesth. anaesthes-:Anaesth. toxicol-:Toxicol. virolog-:Virol. parasitol-:Parasitol. entomol-:Entomol. veterinar-:Vet.
aquacultur-:Aquac. fisher-:Fish. hydrolog-:Hydrol. meteorolog-:Meteorol. climat-:Clim. energ-:Energy pollution:Pollut. conservation:Conserv.
recogni-:Recognit. revista:Rev. revue:Rev. rivista:Riv. zeitschrift:Z. anales:An. boletin:Bol. cuadernos:Cuad. estudios:Estud.
psicolog-:Psicol. educac-:Educ. cienc-:Cienc. investigac-:Investig. universid-:Univ. nacional:Nac. internacion-:Int. latinoamerican-:Latinoam.
planning:Plan. architectur-:Archit. construct-:Constr. manufactur-:Manuf. automat-:Autom. robot-:Robot. telecommun-:Telecommun.
informatics:Inform. cybernet-:Cybern. signal:Signal intelligent:Intell. distribut-:Distrib. parallel:Parallel secur-:Secur. reliab-:Reliab.
financ-:Finance accounting:Account. marketing:Mark. tourism:Tour. hospitality:Hosp. entrepreneur-:Entrep. leadership:Leadersh.
administrative:Adm. government-:Gov. policy:Policy law:Law legal:Leg. criminol-:Criminol. religio-:Relig. theolog-:Theol. ethic-:Ethics
gender:Gend. women:Women child:Child children:Child. adolescen-:Adolesc. youth:Youth aging:Aging gerontol-:Gerontol. rehabilit-:Rehabil.
prevent-:Prev. promot-:Promot. primary:Prim. communit-:Community rural:Rural urban:Urban open:Open distance:Distance online:Online
southeast:Southeast eastern:East. western:West. northern:North. southern:South. mindanao:Mindanao national:Natl. association:Assoc.
`
  .trim()
  .split(/\s+/)
  .map((entry) => entry.split(':') as [string, string])
  // Longer keys first, so that "pharmacol-" is tried before "pharmac-".
  .sort((a, b) => b[0].length - a[0].length);

const plainLetters = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

function abbreviateWord(word: string): string {
  const key = plainLetters(word).toLowerCase();
  for (const [pattern, short] of WORD_LIST) {
    const stem = pattern.endsWith('-');
    if (stem ? key.startsWith(pattern.slice(0, -1)) : key === pattern) return short || word;
  }
  return word;
}

/**
 * A journal's name abbreviated by ISO 4, with a full stop after each shortened word:
 * "Journal of the American Medical Association" → "J. Am. Med. Assoc."
 */
export function abbreviateJournal(name: string): string {
  const all = String(name || '')
    .replace(/\s*[:(].*$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // A leading article is not part of the name: "The Lancet" is "Lancet".
  const named = all.length > 1 && /^(the|a|an)$/i.test(all[0]!) ? all.slice(1) : all;
  if (named.length < 2) return named.join(' ') || name;
  const kept = named.filter((w, i) => i === 0 || !DROPPED.has(w.replace(/[.,;&]/g, '').toLowerCase())).filter((w) => w !== '&');
  let shortened = false;
  const short = kept.map((w) => {
    const bare = w.replace(/[.,;]+$/, '');
    // An organisation's name in capitals is kept as it is: IEEE, ACM, PLOS, BMC.
    if (bare.length > 1 && bare === bare.toUpperCase() && /\p{L}/u.test(bare)) return bare;
    const abbreviated = abbreviateWord(bare);
    if (abbreviated !== bare) shortened = true;
    return abbreviated;
  });
  // Not one word on the list, as with a name in a language the list does not cover: better whole than half done.
  return shortened ? short.join(' ') : all.join(' ');
}

/** Whether the letters of `short` all appear in `word`, in the same order. */
function inOrder(short: string, word: string): boolean {
  let at = 0;
  for (const letter of short) {
    at = word.indexOf(letter, at) + 1;
    if (!at) return false;
  }
  return true;
}

/** The form NLM and Vancouver use: no full stops. "J. Am. Med. Assoc." → "J Am Med Assoc" */
export const withoutStops = (abbreviation: string): string => abbreviation.replace(/\./g, '').replace(/\s+/g, ' ').trim();

/**
 * Put ISO 4's full stops back into an abbreviation that has none, by comparing it with the full name: a word
 * that is shorter than the word it stands for gets a full stop. ("N Engl J Med", "The New England Journal of
 * Medicine") → "N. Engl. J. Med."
 */
export function withStops(abbreviation: string, fullName: string): string {
  if (abbreviation.includes('.')) return abbreviation;
  const full = plainLetters(fullName)
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
    .filter(Boolean);
  let from = 0;
  return abbreviation
    .split(/\s+/)
    .map((w) => {
      const key = plainLetters(w).toLowerCase();
      // A shortened word keeps its first letter and its letters in order: "Engl" from "England", "Natl" from "National".
      const at = full.findIndex((f, i) => i >= from && f[0] === key[0] && inOrder(key, f));
      if (at < 0) return w;
      from = at + 1;
      return full[at]!.length > key.length ? w + '.' : w;
    })
    .join(' ');
}

/** Whether a short title really is shorter than the name, and not just the name again. */
export const isAbbreviated = (short: string | null | undefined, name: string): boolean =>
  !!short && withoutStops(short).toLowerCase() !== withoutStops(name).toLowerCase() && short.length < name.length;
