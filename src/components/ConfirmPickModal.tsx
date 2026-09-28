"use client";
import Modal from "./Modal";
import TeamLogo from "./TeamLogo";

/** Confirm recording (or swapping) a pick. Shared by the Grid and Matchups pages. */
export default function ConfirmPickModal({
  entry, team, week, prob, replaces, error, onConfirm, onCancel,
}: {
  entry: string;
  team: string;
  week: number;
  prob: number;
  /** The current pick this would replace, if any. */
  replaces?: string | null;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} className="w-80">
      <h3 className="font-display text-lg uppercase tracking-wide text-fg">Confirm pick</h3>
      <div className="mt-3 flex items-center gap-3">
        <TeamLogo abbr={team} size={36} />
        <div>
          <div className="font-display uppercase tracking-wide text-fg">{team} — Week {week}</div>
          <div className="text-sm text-muted">{Math.round(prob * 100)}% to win · for {entry}</div>
        </div>
      </div>
      {replaces && replaces !== team && (
        <p className="mt-3 text-sm text-warn">Replaces this week&apos;s current pick ({replaces}).</p>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <button onClick={onConfirm} className="btn-primary">Confirm pick</button>
      </div>
    </Modal>
  );
}
