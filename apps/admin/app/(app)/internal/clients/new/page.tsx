import { ManagedClientForm } from "@/components/managed-client-form";
export default function NewManagedClientPage() { return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Create client draft</h1><p className="mt-2 text-sm text-zinc-600">Calendar consent is intentionally deferred until activation.</p></div><ManagedClientForm /></div>; }
