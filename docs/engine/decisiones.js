// Resolución pura de los pares dudosos de la web.
// Parte siempre de copias para que cambiar una decisión no mute el resultado original.

import { mergeRecord } from "./dedup.js";

export class DecisionConflictError extends Error {
  constructor(decisionPair, otherPair) {
    super(`decision conflict: pair ${decisionPair} removes a record also used by pair ${otherPair}`);
    this.name = "DecisionConflictError";
    this.code = "DECISION_CONFLICT";
    this.decisionPair = decisionPair;
    this.otherPair = otherPair;
  }
}

function cloneRecord(r) {
  return {
    ...r,
    authors: [...(r.authors || [])],
    ptypes: [...(r.ptypes || [])],
    also_in: [...(r.also_in || [])],
    extra: { ...(r.extra || {}) },
  };
}

function cloneAll(result) {
  const originals = new Set(result.kept || []);
  for (const x of result.removed || []) {
    originals.add(x.r);
    originals.add(x.keptr);
  }
  for (const p of result.reviewFull || []) {
    originals.add(p.a);
    originals.add(p.b);
  }
  const recordMap = new Map([...originals].map(r => [r, cloneRecord(r)]));
  return { recordMap, get: r => recordMap.get(r) };
}

function validateConflicts(review, decisions) {
  const removedBy = new Map();
  for (const p of review) {
    const d = decisions.get(p.n);
    if (d === "A") removedBy.set(p.b, p.n);
    else if (d === "B") removedBy.set(p.a, p.n);
  }
  for (const p of review) {
    for (const r of [p.a, p.b]) {
      const n = removedBy.get(r);
      if (n != null && n !== p.n) throw new DecisionConflictError(n, p.n);
    }
  }
}

export function applyWebDecisions(result, decisions = new Map()) {
  const review = result.reviewFull || [];
  validateConflicts(review, decisions);
  const { recordMap, get } = cloneAll(result);
  const kept = (result.kept || []).map(get);
  const removed = (result.removed || []).map(x => ({
    r: get(x.r), keptr: get(x.keptr), reason: x.reason,
  }));
  const losers = new Set();
  const pending = [];
  const linked = [];

  for (const p of review) {
    const d = decisions.get(p.n);
    const a = get(p.a), b = get(p.b);
    if (d === "A" || d === "B") {
      const keeper = d === "A" ? a : b;
      const loser = d === "A" ? b : a;
      for (const source of [loser.source, ...(loser.also_in || [])]) {
        if (source !== keeper.source && !keeper.also_in.includes(source)) keeper.also_in.push(source);
      }
      mergeRecord(keeper, loser);
      // Si el retirado ya era el superviviente de duplicados automáticos, esos registros
      // deben apuntar al nuevo superviviente, no a un objeto que acaba de ser eliminado.
      for (const x of removed) if (x.keptr === loser) x.keptr = keeper;
      losers.add(loser);
      removed.push({
        r: loser,
        keptr: keeper,
        reason: `decisión humana: conservar ${d}`,
      });
    } else if (d === "relacion") {
      linked.push({ a, b, reason: p.reason });
    } else if (d === "criba" || d == null) {
      pending.push({ r: a, other: b, reason: p.reason });
    }
  }

  const keptOut = kept.filter(r => !losers.has(r));
  const keptSet = new Set(keptOut);
  for (const x of removed) {
    if (!keptSet.has(x.keptr)) {
      throw new Error("internal invariant failed: a removed record points to a non-kept record");
    }
  }
  return { kept: keptOut, removed, pending, linked, recordMap };
}
