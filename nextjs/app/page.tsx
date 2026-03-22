import dynamic from "next/dynamic";

/** Server Component: evita que el bundle SSR importe Mesh/WASM y reduce chunks rotos en dev. */
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-clay border-t-transparent" />
    </div>
  ),
});

export default function Page() {
  return <App />;
}
