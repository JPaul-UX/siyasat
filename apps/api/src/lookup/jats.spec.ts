import { parseJats } from './jats.js';

const article = (body: string, front = '') => `<?xml version="1.0"?>
<article xmlns:mml="http://www.w3.org/1998/Math/MathML"><front><article-meta>
<title-group><article-title>Decline of <italic>flying</italic> insects &amp; more</article-title></title-group>
<permissions><license><license-p>Open access under CC BY.</license-p></license></permissions>
${front}</article-meta></front><body>${body}</body></article>`;

describe('parseJats', () => {
  it('turns sections into titled HTML, with Abstract first', () => {
    const p = parseJats(
      article(
        `<sec><title>Results</title><p>Biomass fell by <bold>76%</bold> <xref ref-type="bibr">[1]</xref>.</p>
         <sec><title>By season</title><p>Mid-summer: 82%.</p></sec>
         <list list-type="order"><list-item><p>First</p></list-item><list-item><p>Second</p></list-item></list></sec>
         <sec><title>Discussion</title><p>${'Long discussion text. '.repeat(20)}</p></sec>`,
        '<abstract><p>Short abstract.</p></abstract><abstract abstract-type="teaser"><p>Skip me.</p></abstract>',
      ),
    );
    expect(p.title).toBe('Decline of <i>flying</i> insects &amp; more');
    expect(p.secs.map((s) => s.title)).toEqual(['Abstract', 'Results', 'Discussion']);
    expect(p.secs[0]!.html).toBe('<p>Short abstract.</p>');
    expect(p.secs[1]!.html).toContain('<p>Biomass fell by <b>76%</b> <span class="rd-x">[1]</span>.</p>');
    expect(p.secs[1]!.html).toContain('<h4>By season</h4><p>Mid-summer: 82%.</p>');
    expect(p.secs[1]!.html).toContain('<ol><li><p>First</p></li><li><p>Second</p></li></ol>');
    expect(p.hasBody).toBe(true);
    expect(p.license).toBe('Open access under CC BY.');
  });

  it('never passes markup from the article through as HTML', () => {
    const p = parseJats(
      article(
        `<sec><title>Methods &lt;script&gt;</title>
         <p>x &lt;img src=x onerror=alert(1)&gt; <ext-link href="javascript:alert(1)">link</ext-link> <unknown-tag onclick="x()">kept as text</unknown-tag></p>
         <p><inline-formula><mml:math><mml:mi>x</mml:mi></mml:math></inline-formula><disp-formula>E=mc2</disp-formula></p>
         <fig><label>Fig 1</label><caption><p>A <italic>plot</italic>.</p></caption><graphic href="f1.png"/></fig></sec>`,
      ),
    );
    const html = p.secs[0]!.html;
    expect(p.secs[0]!.title).toBe('Methods <script>');
    expect(html).toContain('x &lt;img src=x onerror=alert(1)&gt; link kept as text');
    expect(html).not.toMatch(/<img|<script|onclick|javascript:|<a /);
    expect(html).toContain('<p> [equation] </p>');
    expect(html).toContain('<b>Fig 1.</b> A <i>plot</i>.');
  });

  it('gathers paragraphs outside any section under "Main text"', () => {
    const p = parseJats(article('<p>Loose paragraph.</p><sec><title>Results</title><p>r</p></sec><p>Trailing.</p>'));
    expect(p.secs.map((s) => [s.title, s.html])).toEqual([
      ['Main text', '<p>Loose paragraph.</p>'],
      ['Results', '<p>r</p>'],
      ['Main text', '<p>Trailing.</p>'],
    ]);
    expect(p.hasBody).toBe(false);
  });

  it('rejects text that is not XML', () => {
    expect(() => parseJats('<article><body><p>unclosed')).toThrow();
  });
});
