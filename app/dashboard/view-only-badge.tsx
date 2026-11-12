// Small badge shown to managers with view-only access on a page.
export default function ViewOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-2.5 py-0.5 text-xs font-medium text-[#3E5560]">
      👁 View only
    </span>
  );
}
