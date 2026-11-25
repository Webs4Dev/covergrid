"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <h1 className="text-2xl font-semibold">This page could not load</h1>
      <p className="mt-2 mb-4 text-muted">The database may be waking up. Try again in a few seconds.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
