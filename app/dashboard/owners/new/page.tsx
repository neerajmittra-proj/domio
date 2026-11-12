import Link from 'next/link';
import NewOwnerForm from './new-owner-form';

export default function NewOwnerPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/dashboard/owners"
        className="text-sm text-[#223144] transition-colors hover:text-[#223144]"
      >
        ← Back to Property Owners
      </Link>

      <div className="mt-4 rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#223144]">
          Add Property Owner
        </h1>
        <p className="mt-1 mb-6 text-sm text-[#223144]">
          Creates a new user with the OWNER role.
        </p>
        <NewOwnerForm />
      </div>
    </div>
  );
}
