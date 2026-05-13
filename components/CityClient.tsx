"use client";

import dynamic from "next/dynamic";

const City = dynamic(() => import("./City"), {
  ssr: false,
  loading: () => <Splash />,
});

export default function CityClient() {
  return <City />;
}

function Splash() {
  return (
    <div className="grid h-screen w-screen place-items-center bg-ink text-off">
      <div className="text-center">
        <div className="mb-3 text-2xl tracking-widest">THE NORMIES CITY</div>
        <div className="text-xs opacity-60">loading 10,000 buildings…</div>
      </div>
    </div>
  );
}
