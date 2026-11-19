import type { Claim } from '@siyasat/core';
import { tallyClaims } from '../lib/draftView';

/** The five tiles above a draft check's claims: the author's verdicts so far. */
export function DraftStats({ claims }: { claims: Claim[] }) {
  const t = tallyClaims(claims);
  return (
    <>
      <div className="stat ok">
        <div className="n">{t.match}</div>
        <div className="l">
          Supported <small>(your call)</small>
        </div>
      </div>
      <div className="stat bad">
        <div className="n">{t.nomatch}</div>
        <div className="l">
          Contradicted <small>(your call)</small>
        </div>
      </div>
      <div className="stat na">
        <div className="n">{t.unsure}</div>
        <div className="l">
          Unverifiable <small>(your call)</small>
        </div>
      </div>
      <div className="stat wait">
        <div className="n">{t.waiting}</div>
        <div className="l">Waiting for you</div>
      </div>
      <div className="stat">
        <div className="n">{t.claims}</div>
        <div className="l">Claims checked</div>
      </div>
    </>
  );
}
