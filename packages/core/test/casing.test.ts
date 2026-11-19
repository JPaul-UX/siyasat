/* Capitalising titles: sentence case, title case, and the evidence that decides which capitals are real. */
import { describe, expect, it } from 'vitest';
import { evidenceFromText, isEnglish, isSentenceCase, namesFromTitle, sentenceCase, titleCase } from '../src/index.js';

describe('sentence case', () => {
  it.each([
    ['Attention Is All You Need', 'Attention is all you need'],
    ['Deep Residual Learning for Image Recognition', 'Deep residual learning for image recognition'],
    ['Group Fairness', 'Group fairness'],
    ['Fairness for AUC via Feature Augmentation', 'Fairness for AUC via feature augmentation'],
    // Authors often leave "is" small in an otherwise title-case title.
    ['AI Art is Theft: Labour, Extraction, and Exploitation', 'AI art is theft: Labour, extraction, and exploitation'],
  ])('lowers the ordinary words of a title-case title: %s', (title, want) => {
    expect(sentenceCase(title)).toBe(want);
  });

  it.each([
    ['The NumPy Array: A Structure for Efficient Numerical Computation', 'The NumPy array: A structure for efficient numerical computation'],
    ['Safety and Efficacy of the BNT162b2 mRNA Covid-19 Vaccine', 'Safety and efficacy of the BNT162b2 mRNA COVID-19 vaccine'],
    ['BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', 'BERT: Pre-training of deep bidirectional transformers for language understanding'],
    ['Is ChatGPT a Good Teacher? An Empirical Study', 'Is ChatGPT a good teacher? An empirical study'],
    ['Hepatitis B Vaccination Among Nursing Students', 'Hepatitis B vaccination among nursing students'],
  ])('keeps what a word’s own shape shows to be an abbreviation or a coined name: %s', (title, want) => {
    expect(sentenceCase(title)).toBe(want);
  });

  it.each([
    ['A Bayesian Approach to Deep Learning in Python', 'A Bayesian approach to deep learning in Python'],
    ['Indigenous Knowledge of the Higaonon Tribe in Bukidnon, Northern Mindanao, Philippines', 'Indigenous knowledge of the Higaonon tribe in Bukidnon, Northern Mindanao, Philippines'],
    ['Mental Health of Filipino Nurses in the United States', 'Mental health of Filipino nurses in the United States'],
    ['Depressive Symptoms in Adolescents in Yunnan, Southwest China', 'Depressive symptoms in adolescents in Yunnan, southwest China'],
    ["Zipf's Law and Children's Reading", "Zipf's law and children's reading"],
  ])('keeps names of places, peoples and people: %s', (title, want) => {
    expect(sentenceCase(title)).toBe(want);
  });

  it('keeps what a place gives its name to', () => {
    expect(sentenceCase('Academic Performance of Students at Mindanao State University–Iligan Institute of Technology in Iligan City')).toBe(
      'Academic performance of students at Mindanao State University–Iligan Institute of Technology in Iligan City',
    );
    expect(sentenceCase('Vaccination Among Students of the University of the Philippines')).toBe('Vaccination among students of the University of the Philippines');
    // "Filipino" describes; it does not name the university.
    expect(sentenceCase('Stress Among Filipino University Students')).toBe('Stress among Filipino university students');
  });

  it('does not take a name that is also an everyday word for a name', () => {
    expect(sentenceCase('Slowing Down the Spread of Misinformation')).toBe('Slowing down the spread of misinformation');
    expect(sentenceCase('Angular Momentum Transport in Stellar Interiors')).toBe('Angular momentum transport in stellar interiors');
  });

  it('leaves a title that is already in sentence case alone, names and all', () => {
    for (const title of ['Deep learning', 'Fishing practices in Tawi-Tawi', 'Poverty in Sibugay', 'Array programming with NumPy', 'The use of mRNA vaccines in Southeast Asia']) {
      expect(sentenceCase(title)).toBe(title);
      expect(isSentenceCase(title)).toBe(true);
    }
    expect(isSentenceCase('Deep Residual Learning for Image Recognition')).toBe(false);
  });

  it('settles a title written entirely in capitals', () => {
    expect(sentenceCase('THE EFFECT OF COVID-19 ON MENTAL HEALTH OF FILIPINO NURSES IN THE UNITED STATES')).toBe(
      'The effect of COVID-19 on mental health of Filipino nurses in the United States',
    );
  });

  it('gives the word after a colon a capital for APA and IEEE, and not for Harvard and Vancouver', () => {
    const title = 'Mental health in Argentina: a longitudinal study';
    expect(sentenceCase(title)).toBe('Mental health in Argentina: A longitudinal study');
    expect(sentenceCase(title, { subtitle: 'lower' })).toBe(title);
    expect(sentenceCase('BERT: Pre-training of Deep Bidirectional Transformers', { subtitle: 'lower' })).toBe('BERT: pre-training of deep bidirectional transformers');
    // A name after the colon keeps its capital either way.
    expect(sentenceCase('Remote Learning: Philippine Evidence', { subtitle: 'lower' })).toBe('Remote learning: Philippine evidence');
  });

  it('does not touch a title that is not in English', () => {
    const spanish = 'Efectos de la Pandemia en la Salud Mental de los Estudiantes';
    expect(sentenceCase(spanish)).toBe(spanish);
    expect(titleCase(spanish)).toBe(spanish);
    expect(isEnglish(spanish)).toBe(false);
    // The database's word is believed for a title too short to tell.
    expect(sentenceCase('Die Verwandlung', { lang: 'de' })).toBe('Die Verwandlung');
    expect(isEnglish('The Effects of the Pandemic on Students', 'en')).toBe(true);
  });
});

describe('evidence from running text', () => {
  const abstract =
    'Artificial Intelligence (AI) and Large Language Models (LLMs) are changing schools. This study surveyed 300 students of Cebu Technological University ' +
    'and the Santo Tomas campus about ChatGPT. Results show that artificial tools help. Retrieval-Augmented Generation (RAG) was tested in the Visayas.';
  const evidence = evidenceFromText(abstract);

  it('takes a word written small for an ordinary word, and a capital in mid-sentence for a name', () => {
    expect(evidence.common.has('students')).toBe(true);
    expect(evidence.proper.get('tomas')).toBe('Tomas');
    expect(evidence.proper.get('chatgpt')).toBe('ChatGPT');
    // "This" and "Results" open sentences: their capitals say nothing.
    expect(evidence.proper.has('results')).toBe(false);
  });

  it('sees through words capitalised only to introduce an abbreviation', () => {
    for (const word of ['artificial', 'intelligence', 'large', 'language', 'models', 'retrieval', 'augmented', 'generation']) expect(evidence.common.has(word), word).toBe(true);
    expect(evidence.proper.get('ai')).toBe('AI');
    expect(evidence.proper.get('rag')).toBe('RAG');
  });

  it('keeps a name of several words together', () => {
    expect(evidence.phrases.map((p) => p.join(' '))).toEqual(['Cebu Technological University', 'Santo Tomas']);
  });

  it('does not take the headings of a structured abstract for abbreviations', () => {
    const structured = evidenceFromText('BACKGROUND: Burnout is common. METHODS: We surveyed nurses using the MBI scale. RESULTS: Burnout was high.');
    expect([...structured.proper.keys()]).toEqual(['mbi']);
  });

  it('decides the words of a title with it', () => {
    expect(sentenceCase('Artificial Intelligence and Large Language Models Among Students of Cebu Technological University and Santo Tomas: A Survey', { evidence })).toBe(
      'Artificial intelligence and large language models among students of Cebu Technological University and Santo Tomas: A survey',
    );
    // Without the abstract, nothing says "Santo Tomas" is a name.
    expect(sentenceCase('A Survey of Students in Santo Tomas')).toBe('A survey of students in santo tomas');
  });

  it('prefers what the text shows over the list of names', () => {
    const blooms = evidenceFromText('We modelled the algal bloom over three summers. Each bloom lasted days.');
    expect(sentenceCase('Algal Bloom Dynamics in Coastal Waters', { evidence: blooms })).toBe('Algal bloom dynamics in coastal waters');
    expect(sentenceCase("Revisiting Bloom's Taxonomy in Science Teaching")).toBe("Revisiting Bloom's taxonomy in science teaching");
  });
});

describe('evidence from another copy of the title', () => {
  it('believes the capitals of a copy written in sentence case', () => {
    const evidence = namesFromTitle('Longitudinal change of mental symptoms in Kalawit and the Wuhan area');
    expect([...evidence.proper.values()]).toEqual(['Kalawit', 'Wuhan']);
    expect(sentenceCase('Longitudinal Change of Mental Symptoms in Kalawit and the Wuhan Area', { evidence })).toBe('Longitudinal change of mental symptoms in Kalawit and the Wuhan area');
  });

  it('learns nothing from a copy in title case, and does not copy missing capitals', () => {
    expect(namesFromTitle('Longitudinal Change of Mental Symptoms in Kalawit').proper.size).toBe(0);
    const careless = namesFromTitle('covid-19 and mental health in china');
    expect(careless.common.size).toBe(0);
    expect(sentenceCase('COVID-19 and Mental Health in China', { evidence: careless })).toBe('COVID-19 and mental health in China');
  });
});

describe('title case', () => {
  it.each([
    ['Deep learning', 'Deep Learning'],
    ['Reinforcement learning improves behaviour from evaluative feedback', 'Reinforcement Learning Improves Behaviour from Evaluative Feedback'],
    ['Attention is all you need', 'Attention Is All You Need'],
    ['The use of mRNA vaccines in Southeast Asia: a review', 'The Use of mRNA Vaccines in Southeast Asia: A Review'],
    ['Array programming with NumPy', 'Array Programming with NumPy'],
    ['What are we waiting for', 'What Are We Waiting For'],
    ['Safety and Efficacy of the BNT162b2 mRNA Covid-19 Vaccine', 'Safety and Efficacy of the BNT162b2 mRNA COVID-19 Vaccine'],
    ['THE EFFECT OF COVID-19 ON FILIPINO NURSES', 'The Effect of COVID-19 on Filipino Nurses'],
  ])('%s', (title, want) => {
    expect(titleCase(title)).toBe(want);
  });

  it('MLA capitalises every part of a hyphenated word; Chicago leaves what follows a prefix', () => {
    const title = 'BERT: pre-training of deep bidirectional transformers and state-of-the-art results';
    expect(titleCase(title, { rules: 'mla' })).toBe('BERT: Pre-Training of Deep Bidirectional Transformers and State-of-the-Art Results');
    expect(titleCase(title, { rules: 'chicago' })).toBe('BERT: Pre-training of Deep Bidirectional Transformers and State-of-the-Art Results');
  });

  it('MLA lowers "so" and "yet"; Chicago does not', () => {
    expect(titleCase('Simple yet effective', { rules: 'mla' })).toBe('Simple yet Effective');
    expect(titleCase('Simple yet effective', { rules: 'chicago' })).toBe('Simple Yet Effective');
  });
});
