import CityClient from "@/components/CityClient";
import ProfilePanel from "@/components/ProfilePanel";
import CanvasStatusBanner from "@/components/CanvasStatus";
import SearchBar from "@/components/SearchBar";
import SyncBadge from "@/components/SyncBadge";
import InfoBanner from "@/components/InfoBanner";
import PlayModal from "@/components/PlayModal";

export default function Home() {
  return (
    <main data-city className="relative h-screen w-screen overflow-hidden">
      <CityClient />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
        <div className="pointer-events-auto inline-flex max-w-full flex-wrap items-stretch gap-px bg-ink/40 text-off shadow-[0_2px_24px_-4px_rgba(0,0,0,0.6)]">
          {/* Brand block — inverted for primary attention. */}
          <div className="flex items-center bg-off px-3 py-1.5 text-sm tracking-widest text-on">
            THE NORMIES CITY
          </div>

          {/* Data lineage. */}
          <a
            href="https://api.normies.art/"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center bg-on px-2.5 py-1.5 text-[10px] tracking-wider text-off/70 hover:text-off sm:flex"
          >
            <span className="opacity-60">live from </span>
            <span className="ml-1 underline">api.normies.art</span>
          </a>

          {/* Search. */}
          <SearchBar />

          {/* Sync stats. */}
          <SyncBadge />

          {/* Canvas state. */}
          <CanvasStatusBanner />

          {/* Creator credit — last pill, links to Twitter / X. */}
          <a
            href="https://x.com/osaykancuno"
            target="_blank"
            rel="noreferrer"
            className="flex items-center bg-on px-2.5 py-1.5 text-[10px] tracking-widest text-off/70 transition hover:bg-off hover:text-on"
            title="Built by @osaykancuno"
          >
            <span className="opacity-60">BUILT BY </span>
            <span className="ml-1">@osaykancuno</span>
            <span className="ml-1 opacity-60">↗</span>
          </a>
        </div>
      </header>

      <ProfilePanel />
      <InfoBanner />
      <PlayModal />

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 text-[10px] text-off/70">
        {/* Long hint on tablet+, short on phones — saves a row of vertical space. */}
        <span className="hidden bg-on px-2 py-1 tracking-wider sm:inline">
          1 building = 1 holder · facade shows every Normie · click monument · click TAG BATTLE wall · drag = orbit · F = fly
        </span>
        <span className="bg-on px-2 py-1 tracking-wider sm:hidden">
          drag · pinch · tap to open
        </span>
      </footer>
    </main>
  );
}
