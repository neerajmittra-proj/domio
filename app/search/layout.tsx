import { notFound } from 'next/navigation';
import { PART2_ENABLED } from '@/lib/features';

// Part 2 (agents marketplace / public search): hidden until NEXT_PUBLIC_ENABLE_PART2=true.
export default function Part2Layout({ children }: { children: React.ReactNode }) {
  if (!PART2_ENABLED) notFound();
  return <>{children}</>;
}
