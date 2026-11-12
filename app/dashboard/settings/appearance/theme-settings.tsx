'use client';

import { useTheme, type Theme } from '@/lib/theme-context';

const OPTIONS: {
  id: Theme;
  label: string;
  desc: string;
  // Preview swatch colours (static — they illustrate the theme).
  page: string;
  card: string;
  text: string;
  accent: string;
}[] = [
  {
    id: 'light',
    label: 'Domio Brand',
    desc: 'Beige paper background with terracotta and navy — the colours of the Domio logo.',
    page: '#F1F7F8',
    card: '#FFFFFF',
    text: '#223144',
    accent: '#A4473D',
  },
];

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Appearance
      </h2>
      <p className="mt-1 text-sm text-[#3E5560]">
        Choose how Domio looks. Your choice is saved to your account.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-xl">
        {OPTIONS.map((o) => {
          const selected = theme === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setTheme(o.id)}
              aria-pressed={selected}
              data-testid={`theme-card-${o.id}`}
              className={
                'group rounded-2xl border-2 p-4 text-left transition-colors ' +
                (selected
                  ? 'border-zinc-700 bg-zinc-50'
                  : 'border-[#C2D9E0] hover:border-[#8FA3AC]')
              }
            >
              {/* Mini preview */}
              <div
                className="mb-3 overflow-hidden rounded-xl border"
                style={{ background: o.page, borderColor: o.card }}
              >
                <div className="flex gap-2 p-3">
                  <div className="h-12 w-10 rounded-md" style={{ background: o.card }} />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-2 w-2/3 rounded" style={{ background: o.text, opacity: 0.85 }} />
                    <div className="h-2 w-1/2 rounded" style={{ background: o.text, opacity: 0.4 }} />
                    <div className="h-4 w-16 rounded" style={{ background: o.accent }} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#223144]">{o.label}</p>
                  <p className="text-xs text-[#3E5560]">{o.desc}</p>
                </div>
                <span
                  className={
                    'flex h-6 w-6 items-center justify-center rounded-full ' +
                    (selected ? 'bg-brand-grad text-white' : 'text-[#5B7280]')
                  }
                  data-testid={selected ? `theme-card-${o.id}-check` : undefined}
                >
                  {selected ? <CheckIcon /> : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
