export function PageLoader({ label = "Chargement..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
    </div>
  );
}
