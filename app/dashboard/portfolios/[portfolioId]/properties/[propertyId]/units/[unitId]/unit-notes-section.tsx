'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// NOTES section embedded inside the unit's Tenant Info card. Inline-editable;
// saves via a notes-only PATCH to /api/sub-properties/[id].
export default function UnitNotesSection({
  unitId,
  notes,
}: {
  unitId: string;
  notes: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/sub-properties/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: value }),
    });
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Failed to save notes. Please try again.');
    }
    setPending(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8D3B32]">
          Notes
        </p>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValue(notes ?? '');
              setError(null);
              setEditing(true);
            }}
            className="rounded-full border border-[rgba(141,59,50,0.4)] bg-[rgba(255,255,255,0.7)] px-3 py-1 text-xs font-medium text-[#223144] transition-colors hover:text-[#223144]"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder="Add any additional information about this unit..."
            className="w-full resize-y rounded-lg border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-sm text-[#223144] outline-none transition placeholder:text-[#7A929C] focus:border-[#A4473D] focus:ring-2 focus:ring-[#A4473D]/20"
          />
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (!pending) setEditing(false);
              }}
              disabled={pending}
              className="rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-4 py-2 text-sm font-medium text-[#223144] transition-colors hover:text-[#223144] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-full bg-gradient-to-r from-[#A4473D] to-[#8D3B32] px-4 py-2 text-sm font-medium text-white shadow-[0_0_24px_rgba(91,79,232,0.3)] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : notes && notes.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-[#3E5560]">{notes}</p>
      ) : (
        <p className="mt-2 text-sm text-[#5B7280]">No notes added yet</p>
      )}
    </div>
  );
}
