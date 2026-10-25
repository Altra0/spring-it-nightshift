export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">Spring It</h1>
      <p className="mt-2 text-sm text-neutral-500">Agent API is running. Screens live with the UI stream.</p>
      <ul className="mt-6 list-disc pl-6 text-sm">
        <li><a className="underline" href="/api/items?status=open">/api/items?status=open</a></li>
        <li><a className="underline" href="/api/facts">/api/facts</a></li>
        <li><a className="underline" href="/api/activity">/api/activity</a></li>
        <li><a className="underline" href="/api/corrections">/api/corrections</a></li>
      </ul>
    </main>
  );
}
