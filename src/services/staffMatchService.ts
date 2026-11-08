import {
  doc, collection, runTransaction, serverTimestamp, increment, deleteField
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Tournament } from '../types';

export type StaffOutcome = 'success' | 'terminated';

/** Staff gets this % of the configured per-match payment when a match is terminated. */
export const TERMINATION_PERCENT = 50;

export const isMatchFinal = (m: { status?: string } | null | undefined) =>
  m?.status === 'completed' || m?.status === 'cancelled';

/** Success = 100% of configured payment, Terminated = 50% (rounded down to whole coins). */
export const staffPaymentFor = (fullPayment: number, outcome: StaffOutcome) => {
  const full = Math.max(0, Math.floor(Number(fullPayment) || 0));
  return outcome === 'success' ? full : Math.floor((full * TERMINATION_PERCENT) / 100);
};

const matchLabel = (m: any, id: string) => `#${m?.matchNumber || id.slice(0, 6)}`;

/**
 * STEP 1 (READS) of staff settlement. Call this BEFORE any tx.set/update inside a transaction.
 * Returns null when the match has no claimer or was already settled (no duplicate payment).
 */
export async function readStaffSettlement(tx: any, matchId: string, claimerId?: string | null) {
  if (!claimerId) return null;
  const payRef = doc(db, 'staffPayments', matchId);
  const paySnap = await tx.get(payRef);
  if (paySnap.exists()) return null; // already paid once -> never pay twice
  const cfgSnap = await tx.get(doc(db, 'staff', claimerId));
  const userRef = doc(db, 'users', claimerId);
  const userSnap = await tx.get(userRef);
  const fullPayment = cfgSnap.exists() ? Number(cfgSnap.data()?.matchPayment || 0) : 0;
  return {
    payRef,
    userRef,
    userExists: userSnap.exists(),
    claimerId,
    claimerName: (cfgSnap.exists() && cfgSnap.data()?.username) || (userSnap.exists() && userSnap.data()?.username) || 'Staff',
    fullPayment
  };
}

/** STEP 2 (WRITES) of staff settlement. Pays the claimer, writes payment record + audit log. */
export function writeStaffSettlement(
  tx: any,
  ctx: Awaited<ReturnType<typeof readStaffSettlement>>,
  matchId: string,
  match: any,
  outcome: StaffOutcome,
  actedBy: { id: string; name: string }
) {
  if (!ctx) return 0;
  const amount = staffPaymentFor(ctx.fullPayment, outcome);

  tx.set(ctx.payRef, {
    matchId,
    matchNumber: match?.matchNumber || null,
    matchTitle: match?.title || '',
    staffId: ctx.claimerId,
    staffName: ctx.claimerName,
    outcome,
    fullPayment: ctx.fullPayment,
    amount,
    createdAt: serverTimestamp()
  });

  if (amount > 0 && ctx.userExists) {
    tx.update(ctx.userRef, { 'wallet.winnings': increment(amount) });
    tx.set(doc(collection(db, 'transactions')), {
      userId: ctx.claimerId,
      type: 'staff_payment',
      amount,
      matchId,
      status: 'completed',
      title: `Staff Payment: Match ${matchLabel(match, matchId)} ${outcome === 'success' ? 'Completed' : 'Terminated (50%)'}`,
      createdAt: serverTimestamp()
    });
  }

  writeStaffLog(tx, matchId, outcome === 'success' ? 'success' : 'terminate', actedBy, { amount });
  return amount;
}

export function writeStaffLog(
  tx: any,
  matchId: string,
  action: 'claim' | 'success' | 'terminate' | 'release',
  actedBy: { id: string; name: string },
  details: Record<string, any> = {}
) {
  tx.set(doc(collection(db, 'staffActionLogs')), {
    matchId,
    action,
    staffId: actedBy.id,
    staffName: actedBy.name,
    details,
    createdAt: serverTimestamp()
  });
}

/** Atomic claim: if two staff click together, exactly one transaction wins. */
export async function claimMatch(matchId: string, staff: { id: string; name: string }) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'matches', matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Match not found.');
    const d: any = snap.data();
    if (isMatchFinal(d)) throw new Error('This match is already closed.');
    if (d.claimedBy) {
      throw new Error(
        d.claimedBy === staff.id
          ? 'You have already claimed this match.'
          : `Already claimed by ${d.claimedByName || 'another staff member'}.`
      );
    }
    tx.update(ref, {
      claimedBy: staff.id,
      claimedByName: staff.name,
      claimedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    writeStaffLog(tx, matchId, 'claim', staff);
  });
}

/** Admin emergency override: take the claim away so another staff member can claim. */
export async function releaseClaim(matchId: string, admin: { id: string; name: string }) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'matches', matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Match not found.');
    const d: any = snap.data();
    if (isMatchFinal(d)) throw new Error('Match is closed; claim cannot be released.');
    tx.update(ref, {
      claimedBy: deleteField(),
      claimedByName: deleteField(),
      claimedAt: deleteField(),
      updatedAt: serverTimestamp()
    });
    writeStaffLog(tx, matchId, 'release', admin, { previousClaimer: d.claimedBy || null });
  });
}

/**
 * Terminate: match -> cancelled, every joined entry gets its entry fee back, claimer gets 50% payment.
 * Everything happens in ONE transaction so refund + payment can never be applied twice.
 */
export async function terminateMatch(matchId: string, staff: { id: string; name: string; email?: string }) {
  return runTransaction(db, async (tx) => {
    const matchRef = doc(db, 'matches', matchId);
    const mSnap = await tx.get(matchRef);
    if (!mSnap.exists()) throw new Error('Match not found.');
    const m: any = mSnap.data();

    if (isMatchFinal(m)) throw new Error('This match is already closed.');
    if (m.claimedBy !== staff.id) throw new Error('Only the staff who claimed this match can terminate it.');

    // ---- READS ----
    const settlement = await readStaffSettlement(tx, matchId, m.claimedBy);

    const fee = Number(m.entryFee || 0);
    const entries: any[] = Array.isArray(m.players) ? m.players : [];
    const perUser = new Map<string, number>();
    for (const p of entries) {
      const uid = p?.userId;
      if (uid && typeof uid === 'string') perUser.set(uid, (perUser.get(uid) || 0) + 1);
    }
    const refunds: { ref: any; uid: string; amount: number }[] = [];
    if (fee > 0) {
      for (const [uid, count] of perUser.entries()) {
        const ref = doc(db, 'users', uid);
        const snap = await tx.get(ref);
        if (snap.exists()) refunds.push({ ref, uid, amount: fee * count });
      }
    }

    // ---- WRITES ----
    for (const r of refunds) {
      tx.update(r.ref, { 'wallet.deposit': increment(r.amount) });
      tx.set(doc(collection(db, 'transactions')), {
        userId: r.uid,
        type: 'refund',
        amount: r.amount,
        matchId,
        status: 'completed',
        title: `Refund: Match ${matchLabel(m, matchId)} Terminated`,
        createdAt: serverTimestamp()
      });
    }

    const staffPaid = writeStaffSettlement(tx, settlement, matchId, m, 'terminated', { id: staff.id, name: staff.name });

    tx.update(matchRef, {
      status: 'cancelled',
      cancelledBy: staff.email || staff.name || 'Staff',
      cancelledAt: serverTimestamp(),
      settlement: 'terminated',
      settledAt: serverTimestamp(),
      staffPaid,
      updatedAt: serverTimestamp()
    });

    return { refunded: refunds.length, staffPaid };
  });
}

export type { Tournament };
